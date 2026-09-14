---
title: "Paper Notes: Amazon Aurora — Design Considerations for High Throughput Cloud-Native Relational Databases"
title_vi: "Ghi chú Paper: Amazon Aurora — Design Considerations for High Throughput Cloud-Native Relational Databases"
date: 2026-09-14 10:10:00 +0700
excerpt: "Aurora's core trick is deceptively simple: stop shipping data pages over the network, ship only the redo log. My notes on how that one decision cascades into the whole architecture."
excerpt_vi: "Chiêu cốt lõi của Aurora tưởng đơn giản: ngừng gửi data page qua mạng, chỉ gửi redo log. Ghi chú của tôi về cách một quyết định đó kéo theo cả kiến trúc."
categories: [papers]
tags: ["Amazon Aurora", "Cloud Databases", "Replication", "Distributed Systems"]
paper_title: "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"
paper_authors: "Verbitski, Gupta, Saha, Brahmadesam, Gupta, Mittal, Krishnamurthy, Maurice, Kharatishvili, Bao — SIGMOD 2017"
paper_url: "https://doi.org/10.1145/3035918.3056101"
---

<div data-lang-content="en" markdown="1">

*Paper: ["Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"](https://doi.org/10.1145/3035918.3056101) — Verbitski et al., SIGMOD 2017.*

I went into this paper expecting "MySQL, but on better hardware," and came out with a much better mental model for why cloud databases in general look the way they do now. The central claim of the paper is that at cloud scale, the bottleneck isn't compute or disk anymore — it's the network between the database and its storage. Everything else in the design follows from taking that seriously.

## The problem: replication amplifies writes into a network problem

The paper's setup is a synchronous, cross-AZ mirrored MySQL deployment (active instance + standby, both on networked EBS volumes). For a single application write, that configuration ends up pushing out the redo log, the binary log (for point-in-time restore), the actual modified data pages, a second copy of those pages (the "double-write" buffer, to guard against torn pages), and metadata files — and several of those writes are *sequential and synchronous*, so latency stacks up and the whole pipeline is only as fast as its slowest hop.

Aurora's answer is almost aggressively minimal: **the only thing that ever crosses the network from the database engine to storage is the redo log.** No data pages, ever — not on background writes, not on checkpoint, not on cache eviction. The framing that stuck with me: the redo log itself *is* the durable database; a materialized page is just a cache of having applied that log. Storage nodes are responsible for turning the log stream into actual pages, in the background or on demand — the engine never has to.

## Quorums sized for AZ failure, not just node failure

The other piece I hadn't seen spelled out this explicitly before: a naive 3-copy, 2-of-3 quorum looks safe until you realize that AWS's Availability Zones are *correlated* failure domains — a single AZ failure looks, from a quorum's perspective, like losing every replica inside it simultaneously, not one independent failure. If you've already got an unrelated node down elsewhere when that AZ failure hits, a 2/3 quorum can't tell if the surviving copy is current.

Aurora's response is to replicate **6 ways across 3 AZs** (2 copies per AZ) with a 4/6 write quorum and 3/6 read quorum. That specific arithmetic buys two guarantees: you can lose an entire AZ *plus* one more independent node and keep read availability, and you can lose any two nodes (including a whole AZ) and keep write availability. It's a good example of a quorum size being derived from an explicit failure model rather than picked as a round number.

They also segment storage into small (10 GB) chunks called Protection Groups, specifically to shrink **Mean Time to Repair** — a 10 GB segment can be re-replicated in about 10 seconds on a 10 Gbps link, which shrinks the window during which a second independent failure could combine with a repair-in-progress to break quorum. Durability engineering here is really MTTR engineering: you can't push MTTF (failure rate) down much further, so you attack the repair window instead.

## Async consensus instead of 2PC — the part I found most elegant

Traditional crash recovery replays the log from the last checkpoint and reasons about a single machine's disk state. Aurora doesn't have that luxury — durable state is scattered across a quorum of segments that individually might be missing arbitrary log records. Their solution avoids a chatty 2PC-style protocol entirely by leaning on the fact that log records are strictly ordered by LSN (Log Sequence Number):

- Storage nodes gossip with peers in their Protection Group to fill in gaps in the log they're missing.
- The database tracks a **Volume Complete LSN (VCL)** — the highest point below which storage can guarantee it has every record — and truncates anything past it on recovery.
- A subset of log records are tagged as **Consistency Point LSNs (CPLs)**, and the **Volume Durable LSN (VDL)** is the highest CPL at or below the VCL — this is what actually gets treated as durable, so recovery only ever truncates to a boundary the engine explicitly agreed was consistent.

This turns "did this transaction survive the crash" into a comparison of two numbers instead of a multi-round protocol, and it's why Aurora claims sub-10-second crash recovery even after 100,000+ writes/sec of load — recovery isn't replaying history, it's just re-establishing where the quorum's boundary currently sits.

## What actually moved the needle, per their own benchmarks

The headline number that justifies the whole architecture: in a SysBench write-only test, mirrored MySQL needed **7.4 I/Os per transaction** on the primary; Aurora needed **0.95** — despite Aurora replicating six ways versus MySQL's four-ish. Reducing what crosses the network beats reducing how many places it lands. The replica lag numbers make the same point from a different angle: at 10,000 writes/sec, Aurora's replicas lagged ~5.4ms behind the writer; MySQL's lagged up to 300 *seconds*, which is the kind of gap that turns into real application bugs (stale reads, replica-only queries returning nonsense) rather than just a benchmark footnote.

## Connecting this to what I'm reading next

Aurora keeps a single writer per cluster — the disaggregation is in storage, not in write coordination. That's the exact thing Aurora DSQL (my next paper note) throws out: DSQL disaggregates the *adjudication* of writes too, so there's no single-writer bottleneck at all. Reading these back to back, Aurora reads like "solve the storage network problem first," and DSQL reads like "now solve the write-coordination problem the same way."

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"](https://doi.org/10.1145/3035918.3056101) — Verbitski et al., SIGMOD 2017.*

Tôi đọc paper này với kỳ vọng kiểu "MySQL nhưng chạy trên phần cứng tốt hơn," và kết thúc với một mô hình tư duy tốt hơn hẳn về lý do vì sao các database chạy trên cloud nói chung lại có hình dáng như bây giờ. Luận điểm trung tâm của paper: ở quy mô cloud, điểm nghẽn không còn là compute hay đĩa nữa — mà là mạng giữa database và tầng lưu trữ của nó. Mọi thứ còn lại trong thiết kế đều xuất phát từ việc coi trọng điều đó một cách nghiêm túc.

## Vấn đề: replication khuếch đại lượng ghi thành một bài toán mạng

Bối cảnh trong paper là một triển khai MySQL mirror đồng bộ qua nhiều AZ (một instance active + một standby, cả hai đều dùng volume EBS qua mạng). Với một lần ghi ứng dụng, cấu hình đó phải đẩy đi redo log, binary log (phục vụ point-in-time restore), chính các data page đã sửa, một bản sao thứ hai của các page đó (buffer "double-write" để chống torn page), và các file metadata — và nhiều trong số các ghi này là *tuần tự và đồng bộ*, nên độ trễ cộng dồn lại, và cả pipeline chỉ nhanh bằng đúng chặng chậm nhất.

Câu trả lời của Aurora gần như tối giản đến quyết liệt: **thứ duy nhất đi qua mạng từ database engine đến storage là redo log.** Không bao giờ có data page — không trong ghi nền, không khi checkpoint, không khi evict cache. Cách diễn đạt khiến tôi nhớ mãi: bản thân redo log *chính là* database bền vững (durable); một page đã materialize chỉ là một cache của việc đã áp dụng log đó. Storage node chịu trách nhiệm biến dòng log thành page thật, chạy nền hoặc theo yêu cầu — engine không bao giờ phải làm việc đó.

## Quorum được tính theo kịch bản mất cả AZ, không chỉ mất một node

Điểm khác mà tôi chưa từng thấy ai nói rõ đến vậy: một quorum 3-bản-sao, 2-trên-3 tưởng chừng an toàn cho đến khi bạn nhận ra Availability Zone của AWS là các domain lỗi *có tương quan* — một AZ sập, xét theo góc nhìn quorum, giống như mất toàn bộ mọi replica bên trong nó cùng lúc, chứ không phải một lỗi độc lập. Nếu đúng lúc đó bạn đã có sẵn một node khác (không liên quan) đang down ở nơi khác, quorum 2/3 không thể biết bản sao còn sống có phải là bản mới nhất hay không.

Câu trả lời của Aurora là replicate **6 bản trên 3 AZ** (2 bản mỗi AZ) với quorum ghi 4/6 và quorum đọc 3/6. Con số cụ thể đó mang lại hai đảm bảo: bạn có thể mất trọn một AZ *cộng thêm* một node độc lập khác mà vẫn giữ được khả năng đọc, và bạn có thể mất bất kỳ hai node nào (kể cả cả một AZ) mà vẫn giữ được khả năng ghi. Đây là một ví dụ đẹp về việc kích thước quorum được suy ra từ một mô hình lỗi tường minh, chứ không phải chọn đại một con số tròn.

Họ cũng chia storage thành các khối nhỏ (10GB) gọi là Protection Group, với mục đích cụ thể là rút ngắn **Mean Time to Repair** — một segment 10GB có thể được replicate lại trong khoảng 10 giây trên đường truyền 10Gbps, giúp thu hẹp khoảng thời gian mà một lỗi độc lập thứ hai có thể kết hợp với một lần sửa-đang-diễn-ra để phá vỡ quorum. Kỹ thuật về durability ở đây thực chất là kỹ thuật về MTTR: bạn không thể đẩy MTTF (tần suất lỗi) xuống thấp hơn nữa, nên thay vào đó bạn tấn công vào khoảng thời gian sửa lỗi.

## Consensus bất đồng bộ thay vì 2PC — phần tôi thấy tinh tế nhất

Crash recovery truyền thống replay log từ checkpoint gần nhất và chỉ cần suy luận về trạng thái đĩa của một máy duy nhất. Aurora không có cái xa xỉ đó — trạng thái bền vững nằm rải rác trên một quorum các segment, mà từng segment riêng lẻ có thể thiếu một số bản ghi log bất kỳ. Giải pháp của họ tránh hẳn một giao thức kiểu 2PC lắm chuyện, bằng cách dựa vào việc các bản ghi log được sắp thứ tự nghiêm ngặt theo LSN (Log Sequence Number):

- Các storage node "tám chuyện" (gossip) với nhau trong cùng Protection Group để lấp các khoảng trống log mà mình đang thiếu.
- Database theo dõi một **Volume Complete LSN (VCL)** — điểm cao nhất mà bên dưới đó storage đảm bảo có đủ mọi bản ghi — và cắt bỏ mọi thứ sau điểm đó khi recovery.
- Một tập con các bản ghi log được gắn nhãn là **Consistency Point LSN (CPL)**, và **Volume Durable LSN (VDL)** là CPL cao nhất mà nhỏ hơn hoặc bằng VCL — đây mới thực sự được coi là durable, nên recovery luôn chỉ cắt về đúng một ranh giới mà engine đã minh thị đồng ý là nhất quán.

Điều này biến câu hỏi "transaction này có sống sót qua crash không" thành việc so sánh hai con số thay vì một giao thức nhiều vòng, và đó là lý do Aurora tự nhận có thể crash recovery dưới 10 giây ngay cả sau khi chịu tải hơn 100.000 ghi/giây — recovery không phải replay lại lịch sử, mà chỉ là xác lập lại ranh giới quorum hiện đang nằm ở đâu.

## Thứ thực sự tạo ra khác biệt, theo benchmark của chính họ

Con số đáng chú ý nhất biện minh cho toàn bộ kiến trúc: trong bài test SysBench write-only, MySQL mirror cần **7.4 I/O cho mỗi transaction** trên node chính; Aurora chỉ cần **0.95** — dù Aurora replicate sáu bản so với khoảng bốn bản của MySQL. Giảm lượng dữ liệu đi qua mạng hiệu quả hơn hẳn việc giảm số nơi dữ liệu phải đến. Số liệu về độ trễ replica cũng minh họa cùng một điểm từ góc nhìn khác: ở mức 10.000 ghi/giây, replica của Aurora trễ khoảng 5.4ms so với writer; của MySQL trễ tới 300 *giây* — một khoảng cách đủ lớn để biến thành bug ứng dụng thật sự (đọc dữ liệu cũ, truy vấn chỉ-đọc trên replica trả về kết quả vô nghĩa) chứ không chỉ là một dòng chú thích trong benchmark.

## Kết nối với thứ tôi sẽ đọc tiếp theo

Aurora vẫn giữ một writer duy nhất cho mỗi cluster — phần tách rời (disaggregation) nằm ở storage, không nằm ở việc điều phối ghi. Đó đúng là thứ mà Aurora DSQL (ghi chú paper tiếp theo của tôi) loại bỏ hẳn: DSQL tách rời luôn cả việc *phân xử* (adjudication) các ghi, nên hoàn toàn không còn điểm nghẽn writer-duy-nhất. Đọc hai bài liền nhau, Aurora giống như "giải bài toán mạng lưu trữ trước," còn DSQL giống như "giờ giải luôn bài toán điều phối ghi theo cùng một tinh thần đó."

</div>

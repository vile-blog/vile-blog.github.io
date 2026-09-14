---
title: "Paper Notes: Aurora DSQL — Scalable, Multi-Region OLTP"
title_vi: "Ghi chú Paper: Aurora DSQL — Scalable, Multi-Region OLTP"
date: 2026-09-14 10:15:00 +0700
excerpt: "DSQL gets multi-region strong consistency down to one cross-region round trip per commit, not per statement, by disaggregating literally everything — including who decides if a transaction can commit."
excerpt_vi: "DSQL đưa strong consistency đa vùng xuống còn một round-trip liên vùng mỗi lần commit, không phải mỗi câu lệnh, bằng cách tách rời gần như mọi thứ — kể cả việc ai là người quyết định một transaction có được commit hay không."
categories: [papers]
tags: ["Aurora DSQL", "Distributed SQL", "OLTP", "Multi-Region", "Concurrency Control"]
paper_title: "Aurora DSQL: Scalable, Multi-Region OLTP"
paper_authors: "Brooker, Bowes, Hershey, van der Merwe, Morle, Strydom — AWS, arXiv 2026"
paper_url: "https://arxiv.org/abs/2607.13276"
---

<div data-lang-content="en" markdown="1">

*Paper: ["Aurora DSQL: Scalable, Multi-Region OLTP"](https://arxiv.org/abs/2607.13276) — Brooker et al., AWS.*

This is the paper in this batch that felt most like reading a distributed systems design from scratch rather than an evolution of something existing. The headline goal is blunt: strongly consistent, multi-region, active-active SQL, without making every statement pay a cross-region round trip. The mechanism they land on is to disaggregate the database into more independent pieces than I'd seen before, and to be extremely disciplined about *when* those pieces are allowed to talk to each other.

## Five services, each doing one thing

DSQL splits into: **Query Processors** (stateless, one per active connection, running inside a Firecracker microVM with an embedded PostgreSQL engine for parsing/planning/wire protocol only), **Storage nodes** (sharded by key range, serving MVCC reads), **Adjudicators** (decide whether a transaction can commit — sharded by key, not tied to storage sharding), **Journal** (an ordered, durable, atomic commit log — the same primitive AWS reuses across S3, DynamoDB, and MemoryDB), and **Crossbar** (merges multiple Journals' streams into a per-shard order for storage to consume).

The detail I found most interesting: **adjudicator sharding and storage sharding are deliberately independent.** A database with heavy reads and light writes can run many storage shards behind a single adjudicator shard. That's a genuinely different lever than most sharded systems give you — it decouples "how do I scale reads" from "how do I scale conflict detection" instead of forcing one sharding scheme to serve both.

## OCC + MVCC instead of locks — and why that avoids a specific failure mode

DSQL picks Optimistic Concurrency Control for writes and snapshot isolation as its (only) isolation level, explicitly to avoid the standard OCC complaint of high abort rates: MVCC means every read comes from a consistent snapshot, so a transaction is never aborted just because it read something that later changed. Snapshot isolation specifically means transactions only conflict — and abort — on **write-write** conflicts, not read-write conflicts, and since most OLTP writes (`UPDATE`, unique-key `INSERT`) are also reads, that's a real reduction in abort rate versus serializable isolation.

What stuck with me is *why* they avoid pessimistic locking at cloud scale, not just that they avoid it: with locks held across a network round trip, a client that pauses — a GC pause, a retry storm, or even an operator who's stepped away from their desk mid-transaction — blocks every other client waiting on that lock. OCC structurally can't do that: no client can ever block another client, because nothing is held across a wait.

## The commit protocol: one round of cross-region communication, not per-statement

This is the actual point of the paper. Reads are served locally against a snapshot timestamp with no coordination at all — the storage layer just waits until it's caught up to the requested timestamp. Writes buffer *locally inside the Query Processor* and touch nothing else until `COMMIT`. At commit time:

1. The adjudicator(s) owning the written keys check for write-write conflicts against everything committed between the transaction's start and commit timestamps.
2. If clean, one adjudicator writes the transaction to its Journal — atomically, and only once, even across a multi-adjudicator transaction (their 2PC variant elects one adjudicator to actually do the write; the others just vote and hold a time-bounded promise not to commit conflicting transactions).
3. In the multi-region case, that Journal write requires durability in two-of-three regions — one round of cross-region communication, period. Not one per statement.

The benchmark numbers make the payoff concrete: the RTT between `us-east-1` and `us-west-2` averages ~62ms, but because a 3-region Journal only needs 2-of-3 to commit, an `us-east-1`/`us-west-2`/`us-east-2` deployment's actual commit latency is bounded by the *closest* second region (~11.5ms p50 to `us-east-2`) rather than the full cross-continent hop. Against a pessimistic-locking competitor, their normalized-latency chart shows that competitor's latency growing linearly with statements-per-transaction (more round trips to hold lock state), while DSQL's stays flat regardless of region.

## Two exceptions to "pure" snapshot isolation that I appreciated them naming

Academic snapshot isolation doesn't cleanly cover schema changes or explicit locking, and the paper is upfront about where they had to bolt on stronger guarantees rather than pretend the model is complete: an `ALTER TABLE` concurrent with an `INSERT` could otherwise let the insert commit against a schema that's since changed, so catalog updates get read-write conflict detection (effectively serializable) instead of the default snapshot-isolation write-write-only check. Same treatment for `FOR UPDATE`. It's a good reminder that isolation levels from the literature are a starting point, not a spec you can implement mechanically — real SQL semantics have edge cases the theory doesn't cover.

## Honest limitations, which I trust more than a paper without any

Section 8 reads like real production scar tissue rather than marketing: transactions are capped at 3,000 rows / 10MiB (deliberately, to bound tail latency via Little's Law — more concurrency in flight means worse p99s), foreign key constraints aren't supported yet (a time-to-market tradeoff they're now walking back after underestimating demand), and range partitioning — the right call for locality — makes `AUTO_INCREMENT`-style sequences and low-cardinality indexes genuinely hard to shard well. I'd rather read a systems paper that admits what doesn't work yet than one that doesn't.

## How this compares to what I'd expect from Spanner/CockroachDB

The paper's own comparison section is useful: Spanner and CockroachDB are pessimistic, with a single leader per shard and a lock table, replicated via Paxos groups. DSQL is optimistic, has no per-shard leader in the locking sense (adjudicators are stateless conflict-checkers, not lock holders), and replicates via a disaggregated Journal instead of Paxos-per-shard. The closest architectural relative they cite is actually FoundationDB, not Spanner — which tracks, since FoundationDB pioneered the "separate the transaction layer from storage entirely" idea DSQL takes even further.

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["Aurora DSQL: Scalable, Multi-Region OLTP"](https://arxiv.org/abs/2607.13276) — Brooker et al., AWS.*

Đây là paper trong đợt này khiến tôi có cảm giác đang đọc một thiết kế hệ phân tán làm từ đầu nhất, chứ không phải một bản tiến hóa của thứ gì đó đã có sẵn. Mục tiêu chính rất thẳng thắn: SQL strongly consistent, đa vùng, active-active, mà không bắt mỗi câu lệnh phải trả giá bằng một round-trip liên vùng. Cơ chế họ chọn là tách database thành nhiều mảnh độc lập hơn bất kỳ hệ thống nào tôi từng thấy, và cực kỳ kỷ luật về *thời điểm* các mảnh đó được phép nói chuyện với nhau.

## Năm service, mỗi cái làm đúng một việc

DSQL tách thành: **Query Processor** (không giữ state, mỗi kết nối active một cái, chạy trong Firecracker microVM với engine PostgreSQL nhúng chỉ để parse/plan/xử lý giao thức), **Storage node** (sharded theo dải key, phục vụ đọc theo MVCC), **Adjudicator** (quyết định một transaction có được commit hay không — sharded theo key, tách biệt với cách shard của storage), **Journal** (một commit log có thứ tự, bền vững, atomic — cùng một nguyên lý AWS tái sử dụng ở S3, DynamoDB, và MemoryDB), và **Crossbar** (gộp các luồng từ nhiều Journal thành một thứ tự theo từng shard để storage tiêu thụ).

Chi tiết tôi thấy thú vị nhất: **việc shard adjudicator và shard storage được cố tình tách biệt hoàn toàn.** Một database có lượng đọc lớn, ghi ít có thể chạy nhiều storage shard đứng sau chỉ một adjudicator shard. Đây là một đòn bẩy thật sự khác so với hầu hết các hệ thống sharded khác — nó tách rời "làm sao scale đọc" khỏi "làm sao scale việc phát hiện xung đột" thay vì ép một lược đồ sharding phải phục vụ cả hai.

## OCC + MVCC thay vì lock — và vì sao điều đó tránh được một failure mode cụ thể

DSQL chọn Optimistic Concurrency Control (OCC) cho ghi và snapshot isolation làm mức isolation duy nhất, với mục đích rõ ràng là tránh lời phàn nàn kinh điển về OCC là tỷ lệ abort cao: MVCC nghĩa là mọi lần đọc đều lấy từ một snapshot nhất quán, nên một transaction không bao giờ bị abort chỉ vì nó đã đọc phải thứ sau đó thay đổi. Snapshot isolation cụ thể nghĩa là transaction chỉ xung đột — và bị abort — khi có xung đột **ghi-ghi** (write-write), không phải xung đột đọc-ghi, và vì hầu hết các ghi trong OLTP (`UPDATE`, `INSERT` với unique key) cũng đồng thời là đọc, đây là một mức giảm tỷ lệ abort thật sự so với serializable isolation.

Điều khiến tôi nhớ nhất là *lý do* họ tránh pessimistic locking ở quy mô cloud, chứ không chỉ là việc họ tránh nó: khi lock được giữ xuyên suốt một round-trip mạng, một client bị khựng lại — một lần GC pause, một cơn bão retry, hay thậm chí một người vận hành đứng dậy khỏi bàn giữa chừng transaction — sẽ chặn mọi client khác đang chờ lock đó. OCC về mặt cấu trúc không thể xảy ra chuyện này: không client nào có thể chặn client khác, vì không có gì bị giữ xuyên suốt một khoảng chờ.

## Giao thức commit: một vòng giao tiếp liên vùng, không phải mỗi câu lệnh một vòng

Đây mới là trọng tâm thật sự của paper. Đọc được phục vụ cục bộ dựa trên một timestamp snapshot mà không cần bất kỳ sự điều phối nào — tầng storage chỉ đơn giản chờ cho tới khi bắt kịp timestamp được yêu cầu. Ghi được buffer *cục bộ ngay trong Query Processor* và không đụng tới gì khác cho tới khi `COMMIT`. Tại thời điểm commit:

1. (Các) adjudicator sở hữu những key được ghi kiểm tra xung đột ghi-ghi với mọi thứ đã commit trong khoảng giữa thời điểm bắt đầu và thời điểm commit của transaction.
2. Nếu sạch, một adjudicator ghi transaction vào Journal của nó — atomic, và chỉ một lần, ngay cả khi transaction trải rộng qua nhiều adjudicator (biến thể 2PC của họ chọn ra một adjudicator để thực sự thực hiện ghi; các adjudicator còn lại chỉ vote và giữ một lời hứa có giới hạn thời gian là không commit các transaction xung đột).
3. Trong trường hợp đa vùng, việc ghi Journal đó yêu cầu bền vững ở hai-trên-ba vùng — đúng một vòng giao tiếp liên vùng, chấm hết. Không phải một vòng cho mỗi câu lệnh.

Các con số benchmark làm rõ lợi ích này: RTT trung bình giữa `us-east-1` và `us-west-2` khoảng 62ms, nhưng vì một Journal 3 vùng chỉ cần 2-trên-3 để commit, độ trễ commit thực tế của một triển khai `us-east-1`/`us-west-2`/`us-east-2` bị giới hạn bởi vùng thứ hai *gần nhất* (khoảng 11.5ms p50 tới `us-east-2`) thay vì cả chặng xuyên lục địa. So với một đối thủ dùng pessimistic locking, biểu đồ độ trễ chuẩn hóa của họ cho thấy độ trễ của đối thủ tăng tuyến tính theo số câu lệnh mỗi transaction (nhiều round-trip hơn để giữ trạng thái lock), trong khi độ trễ của DSQL gần như phẳng bất kể vùng nào.

## Hai ngoại lệ với snapshot isolation "thuần túy" mà tôi thấy đáng khen vì họ nêu ra

Snapshot isolation trong học thuật không bao phủ gọn gàng các thay đổi schema hay khóa tường minh, và paper thẳng thắn chỉ ra những chỗ họ phải gắn thêm đảm bảo mạnh hơn thay vì giả vờ model đã hoàn chỉnh: một `ALTER TABLE` chạy đồng thời với một `INSERT` có thể khiến insert đó commit dựa trên một schema đã thay đổi, nên các cập nhật catalog được kiểm tra xung đột đọc-ghi (tương đương serializable) thay vì chỉ kiểm tra ghi-ghi như mặc định của snapshot isolation. `FOR UPDATE` cũng được xử lý tương tự. Đây là một lời nhắc hay rằng các mức isolation trong sách vở chỉ là điểm khởi đầu, không phải một đặc tả có thể triển khai máy móc — ngữ nghĩa SQL thực tế có những trường hợp biên mà lý thuyết không phủ tới.

## Những giới hạn được nói thẳng — điều khiến tôi tin paper hơn là một bài không nhắc gì

Mục 8 đọc như những vết sẹo thật từ production hơn là marketing: transaction bị giới hạn ở 3.000 dòng / 10MiB (có chủ đích, để giới hạn tail latency theo định luật Little — càng nhiều concurrency đang chạy thì p99 càng tệ), ràng buộc khóa ngoại (foreign key) chưa được hỗ trợ (một đánh đổi để ra mắt nhanh hơn, mà giờ họ đang phải bù lại vì đã đánh giá thấp nhu cầu), và range partitioning — lựa chọn đúng đắn cho locality — lại khiến các sequence kiểu `AUTO_INCREMENT` và các index có cardinality thấp thực sự khó shard cho tốt. Tôi thích đọc một paper hệ thống dám thừa nhận cái gì chưa hoạt động tốt hơn là một bài không nói gì cả.

## So sánh với những gì tôi kỳ vọng ở Spanner/CockroachDB

Phần so sánh trong chính paper khá hữu ích: Spanner và CockroachDB dùng pessimistic, mỗi shard có một leader duy nhất kèm bảng lock, replicate qua các nhóm Paxos. DSQL dùng optimistic, không có leader theo nghĩa giữ lock cho từng shard (adjudicator chỉ là bộ kiểm tra xung đột không giữ state, không phải nơi giữ lock), và replicate qua một Journal tách rời thay vì Paxos-cho-từng-shard. Hệ thống có kiến trúc gần gũi nhất mà họ dẫn ra thực ra là FoundationDB, không phải Spanner — điều này hợp lý, vì FoundationDB là hệ tiên phong cho ý tưởng "tách hoàn toàn tầng transaction khỏi storage" mà DSQL đẩy đi xa hơn nữa.

</div>

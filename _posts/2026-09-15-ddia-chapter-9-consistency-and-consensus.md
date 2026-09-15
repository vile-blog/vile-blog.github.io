---
title: "DDIA Chapter 9: Consistency and Consensus"
title_vi: "DDIA Chương 9: Consistency and Consensus"
date: 2026-09-15 11:30:00 +0700
excerpt: "The chapter every earlier chapter kept pointing forward to. It finally answers: how does a group of unreliable machines agree on one thing, when the network lies and the clock can't be trusted?"
excerpt_vi: "Chương mà mọi chương trước đó cứ liên tục chỉ về phía trước. Cuối cùng nó cũng trả lời: làm sao một nhóm máy không đáng tin cậy đồng thuận về một điều duy nhất, khi mạng nói dối và đồng hồ không thể tin được?"
categories: [book-notes]
tags: ["Designing Data-Intensive Applications", "Chapter 9", "Consensus", "Linearizability", "Distributed Systems"]
book_title: "Designing Data-Intensive Applications"
book_author: "Martin Kleppmann"
book_url: "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/"
book_chapter: "Chapter 9: Consistency and Consensus"
book_chapter_vi: "Chương 9: Consistency and Consensus"
---

<div data-lang-content="en" markdown="1">

*Book: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) by Martin Kleppmann — Chapter 9: Consistency and Consensus.*

This is the chapter that [replication](/blog/2026/09/15/ddia-chapter-5-replication/) kept gesturing toward every time it needed to safely pick a new leader, and that [the previous chapter](/blog/2026/09/15/ddia-chapter-8-distributed-systems-trouble/) set up by explaining exactly how unreliable the network and clocks really are. Given all that unreliability, this chapter asks the big question directly: how do you get a group of machines to agree on *one single thing* — one value, one leader, one order of events — when any of them might be slow, might have crashed, or might simply be unreachable for a while?

## Linearizability: the illusion of "just one copy"

The chapter opens with a specific, very strong consistency guarantee called **linearizability**. The plain-language version: even though your data might actually be spread across several replicated copies, the system behaves *as if* there were only ever one single copy, and every operation happens at one specific, real instant in time, visible to everyone immediately. Once you write something, literally everyone who asks afterward sees that new value — no stale reads from a lagging replica, no confusing "it's there for me but not for you" moment.

This sounds like exactly what everyone would obviously want, all the time — so the natural question is why it isn't just the universal default. The honest answer: linearizability is expensive, because guaranteeing it typically means every read and write has to coordinate with enough of the other replicas to be sure nothing has changed elsewhere first, which adds real latency, especially across long distances (a request that has to round-trip to a data center on another continent before it can complete is never going to be instant). Systems that need to survive a network partition without pausing everything have to give up linearizability to keep working at all — this tradeoff even has a name, the **CAP theorem**, though the book is careful to point out CAP is narrower and more specific than the internet's popularized version of it.

## Ordering events without a trustworthy clock

Since the previous chapter already established that physical clocks can't be trusted to put events in the correct order, this chapter introduces a different tool: instead of asking "what time did this happen," you ask "what happened *before* what." This is captured by something called a **logical clock** — instead of real time, you track cause-and-effect relationships directly (if event B was created in response to event A, B is recorded as happening "after" A, regardless of what either machine's physical clock said).

The strongest, most useful version of this ordering is **total order broadcast**: a guarantee that every node in the system delivers the exact same sequence of messages, in the exact same order, no exceptions. This sounds abstract until you realize it's secretly the same problem as replication itself — if every replica applies the exact same writes in the exact same order, they'll all end up in the same final state. Total order broadcast and single-leader replication are, in a very real sense, describing the same underlying problem from two different angles.

## Consensus: agreeing on one thing despite failures

This is the chapter's actual centerpiece, and the definition is precise: **consensus** means getting a set of nodes to agree on a single value, with a guarantee that once a decision is made, it can never be silently reversed or contradicted later — even if some nodes crash, restart, or temporarily can't communicate with the rest.

![A 5-node cluster elects a leader with only 3 of 5 nodes able to communicate — a majority is enough, even though one node is currently unreachable](/assets/images/ddia/ch9-consensus.svg)

The mechanism nearly every real consensus algorithm relies on is the **majority vote**: as long as more than half the nodes agree, the decision is considered final and safe, even if the remaining nodes are down or unreachable. This is precisely why consensus systems are almost always deployed with an odd number of nodes (3, 5, 7) — it guarantees there's always a clear majority possible, and it's also why a majority-based system can keep working even while some minority of nodes has failed, which is the entire point of building it this way in the first place.

The book names the well-known real implementations of this idea, and I found it genuinely satisfying to connect algorithm names to tools I already recognized: **Paxos** (the original, notoriously hard to fully understand), **Raft** (designed specifically to be more understandable, and the algorithm behind **etcd**, the coordination store at the heart of Kubernetes), and **ZAB** (the protocol underneath **Apache ZooKeeper**, itself referenced back in the [partitioning chapter](/blog/2026/09/15/ddia-chapter-6-partitioning/) as the kind of coordination service that tracks which machine currently owns which piece of data). Every one of these is, underneath the specific implementation details, solving the exact same majority-agreement problem.

## Why consensus isn't used for absolutely everything

Given how powerful and safe consensus is, the natural question is why entire databases aren't built as one giant consensus system for every single write. The honest answer, which echoes the linearizability tradeoff from earlier in the chapter: consensus requires real network round-trips between a majority of nodes for every single decision, which makes it noticeably slower than a system that doesn't need everyone to agree before proceeding. In practice, consensus gets reserved for the decisions that are genuinely worth paying that cost for — electing a leader, agreeing on cluster membership, committing a distributed transaction — rather than for every single ordinary read and write flowing through a system.

## Closing the loop on the whole distributed-systems arc

Looking back across [replication](/blog/2026/09/15/ddia-chapter-5-replication/), [partitioning](/blog/2026/09/15/ddia-chapter-6-partitioning/), [the unreliability of networks and clocks](/blog/2026/09/15/ddia-chapter-8-distributed-systems-trouble/), and now this chapter, the shape of the whole argument finally clicks into place for me: distributed systems are hard specifically *because* the network and clocks can't be trusted (Chapter 8), which makes safely picking a leader or ordering events genuinely difficult (Chapter 5's failover problem), which is exactly the problem consensus algorithms exist to solve properly (this chapter) — using nothing more clever than getting a plain majority of honest nodes to agree. It's a satisfying amount of the book to have now connected into one coherent picture, built from a handful of genuinely simple underlying ideas.

</div>
<div data-lang-content="vi" markdown="1">

*Sách: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) của Martin Kleppmann — Chương 9: Consistency and Consensus.*

Đây là chương mà [replication](/blog/2026/09/15/ddia-chapter-5-replication/) cứ liên tục chỉ về phía trước mỗi khi cần bầu leader mới một cách an toàn, và được [chương trước](/blog/2026/09/15/ddia-chapter-8-distributed-systems-trouble/) dọn đường bằng cách giải thích chính xác mạng và đồng hồ thực sự không đáng tin cậy tới mức nào. Với tất cả sự không đáng tin cậy đó, chương này hỏi thẳng câu hỏi lớn: làm sao khiến một nhóm máy đồng thuận về *đúng một thứ duy nhất* — một giá trị, một leader, một thứ tự sự kiện — khi bất kỳ máy nào trong số đó có thể chậm, có thể đã crash, hoặc đơn giản là không tới được trong một khoảng thời gian?

## Linearizability: ảo giác về "chỉ có một bản sao duy nhất"

Chương mở đầu bằng một đảm bảo consistency rất mạnh, cụ thể, gọi là **linearizability**. Nói theo cách bình dân: dù dữ liệu của bạn thực ra có thể trải trên nhiều bản sao được replicate, hệ thống hành xử *như thể* chỉ từng có đúng một bản sao duy nhất, và mỗi thao tác xảy ra tại đúng một khoảnh khắc cụ thể, có thật, mà mọi người thấy được ngay lập tức. Một khi bạn ghi thứ gì đó, theo đúng nghĩa đen mọi người hỏi sau đó đều thấy giá trị mới đó — không có lượt đọc cũ từ một replica bị trễ, không có khoảnh khắc gây bối rối kiểu "tôi thấy rồi nhưng bạn thì chưa."

Nghe qua thì đây rõ ràng là thứ ai cũng muốn, mọi lúc — nên câu hỏi tự nhiên là vì sao nó không phải mặc định phổ quát. Câu trả lời thành thật: linearizability tốn kém, vì đảm bảo nó thường nghĩa là mỗi lượt đọc và ghi phải phối hợp với đủ số replica khác để chắc chắn không có gì thay đổi ở nơi khác trước đó, điều này cộng thêm độ trễ thật, đặc biệt qua khoảng cách xa (một request phải đi vòng tới một trung tâm dữ liệu ở lục địa khác trước khi có thể hoàn tất sẽ không bao giờ tức thì được). Các hệ thống cần sống sót qua một network partition mà không dừng mọi thứ lại buộc phải từ bỏ linearizability để tiếp tục hoạt động chút nào — sự đánh đổi này thậm chí có tên riêng, **CAP theorem**, dù cuốn sách cẩn thận chỉ ra CAP hẹp và cụ thể hơn phiên bản đã được phổ biến hóa trên internet nhiều.

## Sắp xếp sự kiện mà không cần một đồng hồ đáng tin cậy

Vì chương trước đã xác lập rằng đồng hồ vật lý không thể được tin tưởng để đặt sự kiện theo đúng thứ tự, chương này giới thiệu một công cụ khác: thay vì hỏi "chuyện này xảy ra lúc mấy giờ," bạn hỏi "cái gì xảy ra *trước* cái gì." Điều này được nắm bắt bởi thứ gọi là **logical clock** (đồng hồ logic) — thay vì thời gian thật, bạn theo dõi trực tiếp quan hệ nhân-quả (nếu sự kiện B được tạo ra để phản hồi sự kiện A, B được ghi nhận là xảy ra "sau" A, bất kể đồng hồ vật lý của máy nào nói gì).

Phiên bản mạnh nhất, hữu ích nhất của cách sắp xếp này là **total order broadcast**: một đảm bảo rằng mọi node trong hệ thống nhận được đúng cùng một chuỗi message, theo đúng cùng một thứ tự, không ngoại lệ. Nghe có vẻ trừu tượng cho tới khi bạn nhận ra nó thực chất là cùng một vấn đề với chính replication — nếu mọi replica áp dụng đúng cùng những lượt ghi theo đúng cùng thứ tự, chúng sẽ đều kết thúc ở cùng một trạng thái cuối. Total order broadcast và single-leader replication, theo một nghĩa rất thật, đang mô tả cùng một vấn đề nền tảng từ hai góc nhìn khác nhau.

## Consensus: đồng thuận về một thứ bất chấp sự cố

Đây là trọng tâm thực sự của chương, và định nghĩa rất chính xác: **consensus** nghĩa là khiến một tập node đồng thuận về một giá trị duy nhất, với đảm bảo rằng một khi quyết định đã được đưa ra, nó không bao giờ có thể bị âm thầm đảo ngược hay mâu thuẫn sau đó — kể cả khi một số node crash, restart, hoặc tạm thời không liên lạc được với phần còn lại.

![Một cluster 5 node bầu leader dù chỉ có 3 trong 5 node liên lạc được — đa số là đủ, kể cả khi một node hiện đang không tới được](/assets/images/ddia/ch9-consensus.svg)

Cơ chế mà gần như mọi thuật toán consensus thật đều dựa vào là **majority vote** (biểu quyết theo đa số): miễn là hơn một nửa số node đồng ý, quyết định được coi là cuối cùng và an toàn, kể cả khi các node còn lại đang chết hoặc không tới được. Đây chính xác là lý do các hệ thống consensus hầu như luôn được triển khai với số node lẻ (3, 5, 7) — nó đảm bảo luôn có thể có một đa số rõ ràng, và cũng là lý do một hệ thống dựa trên đa số có thể tiếp tục hoạt động ngay cả khi một thiểu số node đã lỗi, đó chính là toàn bộ mục đích của việc xây dựng nó theo cách này ngay từ đầu.

Cuốn sách nêu tên các triển khai thật, nổi tiếng của ý tưởng này, và tôi thấy thực sự thỏa mãn khi kết nối tên thuật toán với các công cụ mình đã biết: **Paxos** (bản gốc, nổi tiếng là khó hiểu trọn vẹn), **Raft** (được thiết kế đặc biệt để dễ hiểu hơn, và là thuật toán đứng sau **etcd**, kho lưu trữ điều phối nằm ở trung tâm của Kubernetes), và **ZAB** (giao thức bên dưới **Apache ZooKeeper**, chính cái được nhắc tới ở [chương partitioning](/blog/2026/09/15/ddia-chapter-6-partitioning/) như một loại coordination service theo dõi máy nào hiện đang sở hữu mảnh dữ liệu nào). Mỗi cái trong số này, bên dưới các chi tiết triển khai cụ thể, đều đang giải quyết đúng cùng một vấn đề đồng thuận theo đa số.

## Vì sao consensus không được dùng cho tuyệt đối mọi thứ

Với việc consensus mạnh mẽ và an toàn đến vậy, câu hỏi tự nhiên là vì sao cả database không được xây thành một hệ thống consensus khổng lồ cho từng lượt ghi. Câu trả lời thành thật, vọng lại đánh đổi về linearizability từ đầu chương: consensus đòi hỏi những vòng round-trip mạng thật giữa đa số node cho mỗi quyết định, khiến nó chậm hơn đáng kể so với một hệ thống không cần mọi người đồng ý trước khi tiếp tục. Trong thực tế, consensus được dành riêng cho những quyết định thực sự đáng trả cái giá đó — bầu leader, đồng thuận về thành viên cluster, commit một distributed transaction — thay vì cho từng lượt đọc, ghi bình thường chảy qua hệ thống.

## Khép lại vòng cung hệ phân tán

Nhìn lại [replication](/blog/2026/09/15/ddia-chapter-5-replication/), [partitioning](/blog/2026/09/15/ddia-chapter-6-partitioning/), [sự không đáng tin cậy của mạng và đồng hồ](/blog/2026/09/15/ddia-chapter-8-distributed-systems-trouble/), và giờ là chương này, hình dạng của toàn bộ luận điểm cuối cùng cũng sáng tỏ với tôi: hệ phân tán khó chính xác *vì* mạng và đồng hồ không thể tin tưởng được (Chương 8), điều này khiến việc bầu leader an toàn hay sắp xếp sự kiện thực sự khó khăn (vấn đề failover của Chương 5), và đó chính xác là vấn đề mà các thuật toán consensus tồn tại để giải quyết một cách đúng đắn (chương này) — không cần gì khéo léo hơn việc để một đa số đơn giản gồm các node trung thực đồng thuận với nhau. Đây là một lượng đáng kể của cuốn sách mà giờ tôi đã kết nối được thành một bức tranh nhất quán, được xây từ một số ý tưởng nền tảng thực sự đơn giản.

</div>

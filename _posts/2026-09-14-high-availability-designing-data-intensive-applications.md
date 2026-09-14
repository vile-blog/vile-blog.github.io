---
title: "High Availability in Designing Data-Intensive Applications"
title_vi: "High Availability trong Designing Data-Intensive Applications"
date: 2026-09-14 10:00:00 +0700
excerpt: "My notes on how DDIA frames high availability — replication, failover, and why 'available' and 'consistent' keep pulling in opposite directions."
excerpt_vi: "Ghi chú của tôi về cách DDIA trình bày high availability — replication, failover, và vì sao 'available' với 'consistent' cứ kéo về hai hướng ngược nhau."
categories: [book-notes]
tags: ["Designing Data-Intensive Applications", "Replication", "Fault Tolerance", "Distributed Systems"]
book_title: "Designing Data-Intensive Applications"
book_author: "Martin Kleppmann"
book_url: "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/"
---

<div data-lang-content="en" markdown="1">

*Book: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) by Martin Kleppmann — chapters on Replication, and Distributed System Troubles / Consistency & Consensus.*

I've been going through DDIA slowly, and the chapters on replication and consensus finally connected a bunch of things I'd been treating as separate concerns: "why do we replicate data", "what happens when a node dies", and "why is consistency so hard to get for free". Here's how I'm holding it together in my head.

## Availability starts with a boring question: what fails?

Kleppmann's framing that stuck with me is that a "failure" isn't a single category of event — it's a spectrum of blast radii and durations: a process crashing, a slow network link that isn't quite down, a node that's up but unreachable from some other nodes (partial failure), a whole datacenter losing power. A system that only handles clean crash-and-restart will still fall over the first time it meets a partial failure, because from the outside a slow node and a dead node look identical until a timeout fires.

That's the real job of "high availability": not preventing failures — you can't — but designing so that when *some* of these things happen, the rest of the system can still make progress. Which immediately means: no single node can be the only copy of anything, and no single node can be the only thing capable of accepting writes indefinitely.

## Replication is the mechanism, but the topology matters

DDIA walks through three replication topologies, and what I found useful wasn't the mechanics of each but *why* you'd pick one:

- **Single-leader** — one node accepts writes, replicates to followers. Simple to reason about, but the leader is a single point of failure for writes, and you need a failover process the moment it dies.
- **Multi-leader** — several nodes accept writes and replicate to each other. Useful across datacenters (each region writes locally), but now you've bought yourself write conflicts that someone — the app or the database — has to resolve.
- **Leaderless** — any node can accept a read or write, and the client (or a coordinator) talks to several replicas and reconciles using quorums (Dynamo-style `Vw + Vr > V`). No leader to fail over, but you trade that for read-repair, hinted handoff, and reasoning about staleness per-request instead of per-node.

The pattern I keep noticing: every topology just relocates the hard problem. Single-leader moves it to "how do we fail over safely". Multi-leader moves it to "how do we merge conflicting writes". Leaderless moves it to "how does the client know it read a consistent-enough view".

## Failover is where the theory meets the mess

This was the part of the chapter that felt most like real engineering rather than distributed-systems trivia. A single-leader failover sounds simple — leader dies, promote a follower, done — but every step has a sharp edge:

1. **Detecting the leader is actually dead**, not just slow or partitioned, usually via a timeout. Too short and you get spurious failovers under load; too long and you have a longer outage than necessary.
2. **Picking the new leader**, ideally the most up-to-date replica, which needs some kind of election protocol (this is where the book leans into Chapter 9's consensus material — you can't safely elect a leader without something like a majority vote).
3. **Reconfiguring clients and other replicas** to point at the new leader.

And the failure modes here are the interesting bit: if the old leader comes back and doesn't realize it's been demoted, you get **split brain** — two nodes both think they're the leader and both accept writes, and now you have two histories to reconcile. If the failover discards writes the old leader had accepted but not yet replicated, clients can lose data they were told was durable. Kleppmann's blunt conclusion is that there's genuinely no failover timeout that's both safe and fast; you're choosing a point on that tradeoff, not eliminating it.

## Replication lag turns "available" into "available, but weird"

Even once failover works, asynchronous replication (which you need for availability and performance) means followers lag behind the leader. That lag is invisible until an application does something like: write a comment, then immediately reload the page and read from a follower that hasn't caught up yet — and the comment is gone. DDIA names the specific guarantees you might want here:

- **Read-your-writes** — a user should always see their own writes, even if reads generally go to a lagging replica.
- **Monotonic reads** — once you've seen a value, you shouldn't later see an older one (which can otherwise happen if consecutive reads land on different replicas).
- **Consistent prefix reads** — if writes happened in a causal order, reads shouldn't see them out of order.

None of these are free — each is a specific promise you have to engineer for (routing a user's reads to the leader after they write, sticky sessions, tracking a causality token) — and each one you skip is a specific, reproducible bug waiting for a user to find it.

## Where this connects to consensus

The thread that ties the whole thing together: safe leader election, safe failover, and avoiding split-brain all reduce to **consensus** — getting a set of nodes to agree on one value (in this case, "who is the leader") even when some of them might be slow, crashed, or partitioned. That's why the replication chapter keeps gesturing forward at Raft/Paxos-style protocols instead of solving leader election itself. High availability isn't really a separate topic from consensus — it's consensus applied to the one question that matters most operationally: *who gets to accept writes right now*.

## What I'm taking away

The biggest shift in how I think about "HA" after this: it's not a checkbox you get from adding replicas. It's a set of very specific tradeoffs — timeout lengths, which consistency guarantees you promise the application, how you detect and resolve conflicting writes — that have to be chosen deliberately, because the failure-free case was never the hard part.

Next up in my notes: probably Chapter 9's actual consensus algorithms, since I keep hand-waving at them here.

</div>
<div data-lang-content="vi" markdown="1">

*Sách: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) của Martin Kleppmann — chương về Replication, và Distributed System Troubles / Consistency & Consensus.*

Tôi đang đọc DDIA khá chậm, và các chương về replication với consensus cuối cùng đã kết nối một loạt thứ tôi từng nghĩ là những vấn đề tách biệt: "tại sao phải replicate dữ liệu", "chuyện gì xảy ra khi một node chết", và "tại sao consistency lại khó có được miễn phí đến vậy". Đây là cách tôi đang ghép chúng lại trong đầu.

## Availability bắt đầu từ một câu hỏi rất trần trụi: cái gì có thể hỏng?

Cách Kleppmann đóng khung vấn đề khiến tôi nhớ mãi: "failure" không phải một loại sự kiện duy nhất — nó là một dải các mức độ ảnh hưởng và thời gian kéo dài: một tiến trình crash, một đường mạng chậm nhưng chưa hẳn đã đứt, một node vẫn sống nhưng không tới được từ một số node khác (partial failure), cả một trung tâm dữ liệu mất điện. Một hệ thống chỉ xử lý được kịch bản "crash rồi restart sạch sẽ" sẽ sụp ngay lần đầu gặp partial failure, vì nhìn từ bên ngoài, một node chậm và một node đã chết trông giống hệt nhau cho đến khi timeout kích hoạt.

Đó mới là công việc thật sự của "high availability": không phải ngăn chặn failure — điều đó không thể — mà là thiết kế sao cho khi *một số* điều trên xảy ra, phần còn lại của hệ thống vẫn tiếp tục hoạt động được. Điều này ngay lập tức kéo theo: không một node nào được là bản sao duy nhất của bất cứ thứ gì, và không một node nào được là nơi duy nhất có thể nhận ghi mãi mãi.

## Replication là cơ chế, nhưng topology mới là thứ quyết định

DDIA trình bày ba kiểu topology replication, và điều tôi thấy hữu ích không nằm ở cơ chế vận hành của từng loại mà ở *lý do* bạn chọn loại nào:

- **Single-leader** — một node nhận ghi, replicate sang các follower. Dễ suy luận, nhưng leader là điểm lỗi duy nhất cho việc ghi, và bạn cần một quy trình failover ngay khi nó chết.
- **Multi-leader** — nhiều node cùng nhận ghi và replicate qua lại với nhau. Hữu ích khi trải rộng nhiều trung tâm dữ liệu (mỗi vùng ghi cục bộ), nhưng đổi lại bạn phải tự giải quyết xung đột ghi — bằng ứng dụng hoặc bằng chính database.
- **Leaderless** — node nào cũng có thể nhận đọc hoặc ghi, và client (hoặc một coordinator) nói chuyện với nhiều replica rồi đối chiếu bằng quorum (kiểu Dynamo `Vw + Vr > V`). Không có leader để failover, nhưng đổi lại bạn phải xử lý read-repair, hinted handoff, và suy luận độ "cũ" của dữ liệu theo từng request thay vì theo từng node.

Điều tôi cứ nhận ra: mọi topology chỉ là dời cái vấn đề khó sang chỗ khác. Single-leader dời nó thành "làm sao failover an toàn". Multi-leader dời nó thành "làm sao merge các ghi xung đột". Leaderless dời nó thành "làm sao client biết mình vừa đọc một view đủ nhất quán".

## Failover là chỗ lý thuyết đụng vào thực tế lộn xộn

Đây là phần khiến tôi cảm thấy giống kỹ thuật thật sự nhất, chứ không chỉ là kiến thức lý thuyết về hệ phân tán. Một lần failover single-leader nghe có vẻ đơn giản — leader chết, thăng cấp một follower, xong — nhưng mỗi bước đều có góc khuất:

1. **Phát hiện leader thực sự đã chết**, chứ không chỉ chậm hay bị partition, thường qua một timeout. Timeout quá ngắn thì bạn gặp failover giả khi tải cao; quá dài thì thời gian gián đoạn kéo dài hơn cần thiết.
2. **Chọn leader mới**, lý tưởng là replica cập nhật nhất, việc này cần một dạng giao thức bầu chọn (đây là chỗ cuốn sách bắt đầu ngả sang nội dung consensus ở Chương 9 — bạn không thể bầu leader an toàn nếu thiếu thứ gì đó giống như biểu quyết theo đa số).
3. **Cấu hình lại client và các replica khác** để trỏ về leader mới.

Và các failure mode ở đây mới là phần thú vị: nếu leader cũ quay lại mà không biết mình đã bị hạ cấp, bạn sẽ gặp **split brain** — hai node đều nghĩ mình là leader và đều nhận ghi, giờ bạn có hai lịch sử phải đối chiếu lại. Nếu quá trình failover bỏ qua những ghi mà leader cũ đã nhận nhưng chưa kịp replicate, client có thể mất dữ liệu mà họ từng được báo là đã durable. Kết luận thẳng thắn của Kleppmann: thực sự không có một khoảng timeout failover nào vừa an toàn vừa nhanh; bạn chỉ đang chọn một điểm trên đường đánh đổi đó, không phải loại bỏ nó.

## Độ trễ replication biến "available" thành "available, nhưng kỳ lạ"

Ngay cả khi failover hoạt động tốt, replication bất đồng bộ (thứ bạn cần để có availability và hiệu năng) đồng nghĩa follower luôn trễ hơn leader. Độ trễ đó vô hình cho đến khi ứng dụng làm điều gì đó như: ghi một bình luận, rồi lập tức tải lại trang và đọc từ một follower chưa kịp bắt kịp — và bình luận biến mất. DDIA gọi tên các đảm bảo cụ thể bạn có thể cần ở đây:

- **Read-your-writes** — người dùng phải luôn thấy được ghi của chính họ, kể cả khi đọc thường được route tới một replica đang trễ.
- **Monotonic reads** — một khi đã thấy một giá trị, bạn không nên sau đó thấy một giá trị cũ hơn (điều này có thể xảy ra nếu các lần đọc liên tiếp rơi vào các replica khác nhau).
- **Consistent prefix reads** — nếu các ghi xảy ra theo một thứ tự nhân quả, đọc không nên thấy chúng bị đảo thứ tự.

Không cái nào trong số này là miễn phí — mỗi cái là một cam kết cụ thể bạn phải kỹ thuật hóa (route đọc của người dùng về leader sau khi họ ghi, sticky session, theo dõi một causality token) — và mỗi cái bạn bỏ qua là một con bug cụ thể, có thể tái hiện, đang chờ người dùng phát hiện.

## Chỗ này kết nối với consensus

Sợi chỉ xâu chuỗi tất cả lại: bầu leader an toàn, failover an toàn, và tránh split-brain — tất cả đều quy về **consensus** — làm cho một tập node đồng thuận về một giá trị (ở đây là "ai là leader") ngay cả khi một số node có thể chậm, đã chết, hoặc bị partition. Đó là lý do chương replication cứ liên tục hướng người đọc về phía các giao thức kiểu Raft/Paxos thay vì tự giải quyết bài toán bầu leader. High availability không hẳn là một chủ đề tách biệt khỏi consensus — nó chính là consensus được áp dụng vào câu hỏi quan trọng nhất về mặt vận hành: *ai được phép nhận ghi ngay lúc này*.

## Điều tôi rút ra được

Thay đổi lớn nhất trong cách tôi nghĩ về "HA" sau chương này: nó không phải một ô cần tick được bằng cách thêm replica. Nó là một tập các đánh đổi rất cụ thể — độ dài timeout, những đảm bảo consistency nào bạn hứa với ứng dụng, cách bạn phát hiện và xử lý ghi xung đột — những thứ phải được chọn một cách có chủ đích, vì trường hợp không-có-failure chưa bao giờ là phần khó.

Tiếp theo trong ghi chú của tôi: có lẽ là các thuật toán consensus thật sự ở Chương 9, vì tôi cứ nhắc tới chúng mà chưa đi sâu ở đây.

</div>

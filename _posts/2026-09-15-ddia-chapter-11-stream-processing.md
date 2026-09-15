---
title: "DDIA Chapter 11: Stream Processing"
title_vi: "DDIA Chương 11: Stream Processing"
date: 2026-09-15 14:30:00 +0700
excerpt: "Batch processing waits for a full day's data before computing anything. This chapter asks: what if you can't wait — what if the answer needs to update the instant a new event happens?"
excerpt_vi: "Batch processing chờ đủ dữ liệu cả ngày rồi mới tính. Chương này hỏi: nếu không chờ được thì sao — nếu câu trả lời cần cập nhật ngay khi có sự kiện mới xảy ra thì làm thế nào?"
categories: [book-notes]
tags: ["Designing Data-Intensive Applications", "Chapter 11", "Stream Processing", "Kafka"]
book_title: "Designing Data-Intensive Applications"
book_author: "Martin Kleppmann"
book_url: "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/"
book_chapter: "Chapter 11: Stream Processing"
book_chapter_vi: "Chương 11: Stream Processing"
book_chapter_num: 11
---

<div data-lang-content="en" markdown="1">

*Book: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) by Martin Kleppmann — Chapter 11: Stream Processing.*

[Chapter 10](/blog/2026/09/15/ddia-chapter-10-batch-processing/) ended on a cliffhanger of sorts: batch processing is great when you're happy to wait for a full day's (or year's) data to pile up before computing anything from it. This chapter is about the other half of that pair — what happens when you genuinely can't wait, because the whole point is reacting the instant something happens: flagging a fraudulent card swipe before it clears, updating a live dashboard, refreshing a search index the moment new content is published.

## An event is just a fact that a record used to be — but now it never stops arriving

The mental shift the book asks for is small but important: a **stream** is just an unbounded, never-ending sequence of **events**, where an event is a small, immutable record of something that happened, tagged with when it happened. The unbounded part is the whole difference from batch processing — a batch job reads a file that has a definite end; a stream processor reads something that, by design, is never "done."

Where do these events actually come from? The book's answer connects directly back to two things I'd already run into: **message queues** and **databases**. A message broker like **Kafka** is built specifically to carry a continuous flow of events from producers to consumers, durably and in order — but the more interesting source, and the one that genuinely surprised me, is the database itself, through something called **change data capture**.

## Change data capture: turning "the database changed" into an event

**Change data capture (CDC)** takes every insert, update, and delete happening inside a database and turns each one into an event on a stream, in the exact order they happened. Instead of every other part of the system polling the database or querying it directly to notice changes, they simply subscribe to this stream of "here's what changed" events.

![Change data capture turns every database write into an event on a durable, ordered log; independent consumers — a search index, a cache, a fraud detector — each read that same log at their own pace instead of talking to the database directly](/assets/images/ddia/ch11-cdc-stream.svg)

What clicked for me here is how naturally this solves a problem I'd actually run into without having a name for it: keeping a search index, a cache, and a database all in sync with each other, without wiring every single one of them to talk directly to every other one. With CDC, the database is the single source of truth, its changes flow out as one ordered stream, and anything that needs to stay in sync — a search index at one company, a fraud-detection system at another, a cache at a third — just subscribes independently, reading at its own pace, without ever needing to know the others exist. This is exactly the role Kafka plays at companies like LinkedIn (where it originated) — one durable, replayable log that many independent systems can read from concurrently.

## Windows: how do you "add up" something that never ends?

A batch job can compute "total sales for the day" by reading the whole day's data and summing it, because the input has a clear boundary. A stream never has a clear boundary, so the book introduces **windows** — an artificial boundary you draw yourself, like "the last 5 minutes" or "this specific hour" — to make aggregate questions ("how many logins in the last 5 minutes?") answerable at all over an endless stream.

The genuinely tricky part, which I hadn't appreciated before, is that events don't always arrive in the order they actually happened. A phone can lose signal and send a batch of delayed events all at once; a network hiccup can make one event arrive seconds after events that happened after it. So a stream processor has to make a real decision: does it wait a little while for stragglers before finalizing a window's answer (more correct, but slower to produce a result), or does it finalize quickly and risk being wrong when a late event shows up afterward? There's no universally correct answer — it's a real tradeoff between latency and completeness that every stream processing system has to pick a stance on.

## Exactly-once: the promise that's harder than it sounds

The last idea that stuck with me connects straight back to [Chapter 8's honest inventory of distributed-systems trouble](/blog/2026/09/15/ddia-chapter-8-distributed-systems-trouble/): what happens if a stream processor crashes partway through handling an event, and has to restart? If it simply reprocesses everything it's unsure about, some events might get counted twice. The guarantee everyone actually wants is **exactly-once semantics** — each event affects the final result exactly once, no matter how many times the underlying machinery has to retry after a crash. Real systems (Kafka's own transactional features, Flink's checkpointing) achieve this not by making failures impossible, but by making the *effect* of retried work idempotent — safe to apply more than once without changing the outcome — which is a much more achievable goal than pretending crashes won't happen.

Looking at chapters 10 and 11 together, the real lesson is that batch and stream processing aren't competitors — they're the same underlying question ("how do I compute derived data from a big pile of events?") answered under two different constraints: how much you're willing to wait, and whether you can define a clean beginning and end to your input at all.

</div>
<div data-lang-content="vi" markdown="1">

*Sách: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) của Martin Kleppmann — Chương 11: Stream Processing.*

[Chương 10](/blog/2026/09/15/ddia-chapter-10-batch-processing/) kết thúc bằng một kiểu "để lửng": batch processing tuyệt vời khi bạn sẵn sàng chờ đủ dữ liệu của cả một ngày (hay cả năm) rồi mới tính toán gì đó từ nó. Chương này nói về nửa còn lại của cặp đó — chuyện gì xảy ra khi bạn thực sự không thể chờ, vì cả vấn đề nằm ở việc phản ứng ngay khi có gì đó xảy ra: chặn một giao dịch thẻ gian lận trước khi nó được xử lý xong, cập nhật một dashboard trực tiếp, làm mới search index ngay khi nội dung mới được đăng.

## Một sự kiện chỉ là một sự thật từng là một bản ghi — nhưng giờ nó không bao giờ ngừng đến

Sự chuyển đổi tư duy cuốn sách yêu cầu nhỏ nhưng quan trọng: một **stream** chỉ là một chuỗi **sự kiện (event)** không giới hạn, không bao giờ kết thúc, nơi một sự kiện là một bản ghi nhỏ, bất biến, về việc gì đó đã xảy ra, gắn kèm thời điểm nó xảy ra. Phần "không giới hạn" chính là toàn bộ khác biệt so với batch processing — một batch job đọc một file có điểm kết thúc rõ ràng; một stream processor đọc thứ mà, theo thiết kế, không bao giờ "xong."

Những sự kiện này thực sự tới từ đâu? Câu trả lời của cuốn sách nối thẳng về hai thứ tôi đã từng gặp: **message queue** và **database**. Một message broker như **Kafka** được xây riêng để mang một luồng sự kiện liên tục từ producer tới consumer, bền vững và đúng thứ tự — nhưng nguồn thú vị hơn, và cũng là nguồn thực sự khiến tôi bất ngờ, chính là bản thân database, thông qua thứ gọi là **change data capture**.

## Change data capture: biến "database vừa thay đổi" thành một sự kiện

**Change data capture (CDC)** lấy mọi lượt insert, update, delete xảy ra bên trong database và biến mỗi cái thành một sự kiện trên một stream, đúng theo thứ tự chúng xảy ra. Thay vì mọi phần khác của hệ thống phải polling database hoặc query trực tiếp để nhận ra thay đổi, chúng chỉ cần subscribe vào stream "đây là những gì vừa thay đổi" này.

![Change data capture biến mỗi lượt ghi database thành một sự kiện trên một log bền vững, có thứ tự; các consumer độc lập — search index, cache, hệ thống chống gian lận — mỗi cái đọc cùng log đó theo nhịp độ riêng thay vì nói chuyện trực tiếp với database](/assets/images/ddia/ch11-cdc-stream.svg)

Điều thực sự sáng tỏ với tôi ở đây là cách này giải quyết tự nhiên một vấn đề tôi từng gặp phải mà chưa biết gọi tên là gì: giữ một search index, một cache, và một database đồng bộ với nhau, mà không phải nối dây để từng cái nói chuyện trực tiếp với từng cái khác. Với CDC, database là nguồn sự thật duy nhất, thay đổi của nó chảy ra thành một stream có thứ tự, và bất cứ thứ gì cần giữ đồng bộ — một search index ở công ty này, một hệ thống chống gian lận ở công ty khác, một cache ở công ty thứ ba — chỉ cần subscribe độc lập, đọc theo nhịp độ riêng, không bao giờ cần biết những cái khác tồn tại. Đây chính xác là vai trò Kafka đóng tại các công ty như LinkedIn (nơi nó ra đời) — một log bền vững, có thể đọc lại được, mà nhiều hệ thống độc lập có thể cùng đọc.

## Window: làm sao "cộng dồn" một thứ không bao giờ kết thúc?

Một batch job có thể tính "tổng doanh số trong ngày" bằng cách đọc hết dữ liệu cả ngày rồi cộng lại, vì input có ranh giới rõ ràng. Một stream không bao giờ có ranh giới rõ ràng, nên cuốn sách giới thiệu **window** — một ranh giới nhân tạo bạn tự vẽ ra, kiểu "5 phút vừa qua" hay "đúng giờ này," để những câu hỏi tổng hợp ("có bao nhiêu lượt đăng nhập trong 5 phút vừa qua?") có thể trả lời được trên một stream vô tận.

Phần thực sự hóc búa, điều tôi chưa từng để ý trước đây, là sự kiện không phải lúc nào cũng tới theo đúng thứ tự chúng thực sự xảy ra. Một chiếc điện thoại có thể mất sóng rồi gửi dồn một loạt sự kiện bị trễ cùng lúc; một trục trặc mạng có thể khiến một sự kiện tới sau vài giây so với những sự kiện xảy ra sau nó. Nên một stream processor phải đưa ra một quyết định thật sự: nó có chờ một chút cho những sự kiện tới trễ trước khi chốt câu trả lời của một window (đúng hơn, nhưng chậm cho ra kết quả), hay nó chốt nhanh và chấp nhận rủi ro sai khi một sự kiện trễ xuất hiện sau đó? Không có câu trả lời đúng phổ quát nào — đây là một đánh đổi thật sự giữa độ trễ và tính đầy đủ mà mọi hệ thống stream processing phải tự chọn lập trường.

## Exactly-once: lời hứa khó hơn nghe qua rất nhiều

Ý tưởng cuối cùng đọng lại trong tôi nối thẳng về [bản kiểm kê thành thật về rắc rối hệ phân tán ở Chương 8](/blog/2026/09/15/ddia-chapter-8-distributed-systems-trouble/): chuyện gì xảy ra nếu một stream processor crash giữa chừng khi đang xử lý một sự kiện, và phải restart? Nếu nó đơn giản xử lý lại mọi thứ nó không chắc chắn, một số sự kiện có thể bị đếm hai lần. Đảm bảo mà mọi người thực sự muốn là **exactly-once semantics** — mỗi sự kiện ảnh hưởng tới kết quả cuối cùng đúng một lần, bất kể cỗ máy bên dưới phải thử lại bao nhiêu lần sau một lần crash. Các hệ thống thật (tính năng transactional của chính Kafka, checkpointing của Flink) đạt được điều này không phải bằng cách làm cho failure trở nên bất khả thi, mà bằng cách làm cho *hiệu ứng* của công việc bị thử lại trở nên idempotent — an toàn khi áp dụng nhiều hơn một lần mà không làm thay đổi kết quả — một mục tiêu khả thi hơn nhiều so với việc giả vờ crash sẽ không xảy ra.

Nhìn chương 10 và 11 cùng nhau, bài học thực sự là batch và stream processing không phải đối thủ của nhau — chúng là cùng một câu hỏi nền tảng ("làm sao tính ra derived data từ một đống sự kiện khổng lồ?") được trả lời dưới hai ràng buộc khác nhau: bạn sẵn sàng chờ bao lâu, và bạn có thể định nghĩa được một điểm đầu, điểm cuối rõ ràng cho input của mình hay không.

</div>

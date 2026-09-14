---
title: "Paper Notes: Amazon Aurora — Design Considerations for High Throughput Cloud-Native Relational Databases"
title_vi: "Ghi chú Paper: Amazon Aurora — Design Considerations for High Throughput Cloud-Native Relational Databases"
date: 2026-09-14 10:10:00 +0700
excerpt: "Amazon's cloud database went 35x faster than a normal setup by changing one thing: what gets sent over the network. Here's the whole idea, explained from scratch."
excerpt_vi: "Database cloud của Amazon nhanh hơn 35 lần một hệ thống thông thường chỉ nhờ thay đổi một thứ: cái gì được gửi qua mạng. Đây là toàn bộ ý tưởng, giải thích lại từ đầu."
categories: [papers]
tags: ["Amazon Aurora", "Cloud Databases", "Replication", "Distributed Systems"]
paper_title: "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"
paper_authors: "Verbitski, Gupta, Saha, Brahmadesam, Gupta, Mittal, Krishnamurthy, Maurice, Kharatishvili, Bao — SIGMOD 2017"
paper_url: "https://doi.org/10.1145/3035918.3056101"
---

<div data-lang-content="en" markdown="1">

*Paper: ["Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"](https://doi.org/10.1145/3035918.3056101), by Verbitski et al., SIGMOD 2017.*

Before I get into this one, I need to set up two ideas, because the whole paper is built on top of them and I don't want to assume anyone reading this already knows them.

**Replication** just means keeping more than one copy of your data, usually on different machines, so if one machine dies you don't lose everything. Sounds simple. The hard part is keeping all those copies in agreement with each other without slowing everything down to a crawl — and that's basically what this entire paper is about.

**A redo log** is a different way of saving changes. Imagine you're editing a document, and instead of re-saving the *entire* document every time you change one word, you just keep a running list: "changed word 3 in paragraph 2," "added a sentence at the end," "deleted paragraph 5." If your computer crashes, you can rebuild the current document by starting from the last full save and replaying that list of small changes, in order. Databases already do this internally — it's called the redo log, and it's normally just a background detail. In this paper, it becomes the star of the show.

## Why I picked this up

I expected this paper to be "MySQL, but Amazon made it faster with more expensive hardware." What I actually got was a much clearer picture of *why* cloud databases in general are built the way they are today. The paper's central argument: once you're running at Amazon's scale, your bottleneck usually isn't the CPU doing the math, and it isn't the hard drive spinning — it's the network cable between the database and wherever its data actually lives. Every design decision in the paper follows from taking that one bottleneck seriously.

## The problem they started with

Picture a "safe" database setup the old-fashioned way: one main server doing the work, plus a backup server ready to take over if the main one dies, with the two constantly copying data to each other over the network so they stay in sync. Sounds reasonable. But look at everything that has to travel over that network for just *one* small change to the database:

- the redo log (the list of changes, as I described above)
- a second log used for restoring the database to any point in time in the past
- the actual updated data itself
- *another* copy of that same data, kept specifically to protect against a rare kind of corruption where a save gets interrupted halfway through
- assorted bookkeeping files

And several of these have to happen one after another, waiting for confirmation each time, before the system can say "yes, this change is safely saved." Every one of those steps adds delay, and the whole chain is only as fast as its slowest link.

## Aurora's fix: send almost nothing

Aurora's answer is almost stubbornly simple: **the only thing that ever travels over the network from the database to its storage is the redo log** — that tiny list of changes, never the actual full data. Not when saving in the background, not during routine cleanup, not ever. The way the paper frames it flipped something in my head: the redo log itself *is* the real, permanent copy of the database. Everything else — actual readable pages of data — is just something the storage system builds on the side, whenever it's convenient, as a shortcut so it doesn't have to replay the entire history of changes from the beginning every single time someone wants to read something.

## Voting instead of just copying

Here's a concept I hadn't seen explained this clearly before: a **quorum** is basically a voting rule. Say you keep 3 copies of your data and decide "as long as 2 out of 3 copies agree, we trust it." That sounds safe — until you realize that in a real data center, failures aren't always random and independent. Amazon groups its servers into physical clusters called **Availability Zones (AZs)** — think of them like separate buildings, each with their own power and network. If one whole building loses power, every single copy of data inside it disappears *at the same time*. That's a "correlated" failure, not an independent one. If you already happened to have one unrelated server down somewhere else when an entire AZ went dark, your simple "2 out of 3" rule can no longer tell whether the one surviving copy is actually up to date.

Aurora's answer: keep **6 copies spread across 3 buildings** (2 copies per building), and require **4 out of 6** copies to agree before a write counts as saved, but only **3 out of 6** to agree before a read is trusted. Do the math on that and you get two nice guarantees: you can lose an *entire building* plus one extra random server elsewhere, and reads still work. You can lose *any* two servers at all — including a whole building — and writes still work. This isn't an arbitrary safety number; it's a number chosen specifically because it survives the exact kind of "one big failure plus one small failure at the same time" scenario that actually happens in real data centers.

They also chop storage into small 10-gigabyte chunks. Why so small? Because a small chunk can be re-copied onto a healthy server in about 10 seconds. The shorter that repair window is, the smaller the chance that a *second* failure sneaks in while you're still fixing the first one. You can't make hardware never fail — but you can make repairs so fast that the dangerous "two failures at once" scenario almost never has time to happen.

## Recovering from a crash without replaying the whole history

Normally, when a database crashes and restarts, it has to look at the log from the last known good save point, and carefully replay every single change since then to rebuild an accurate picture of the data. That can take a while, and it happens on one machine with a clear, simple view of its own log.

Aurora's data is scattered across many machines, and any individual one might be missing a random chunk here or there. Instead of using a slow, chatty "let's all agree on the exact state together" protocol (a classic one is called Two-Phase Commit, or 2PC, and it involves a lot of back-and-forth messages), Aurora leans on the fact that every single change is stamped with a strictly increasing number — like a page number that never skips or repeats. Using just those numbers, Aurora can figure out "the highest point I can promise is completely, safely saved" without replaying anything. Recovering after a crash becomes a matter of comparing a couple of numbers instead of replaying a story from the beginning — which is why Aurora claims it can recover in under 10 seconds, even after handling more than 100,000 writes per second right before the crash.

## The number that actually proves this works

Here's the benchmark that made the whole design click for me: in a write-heavy test, an old-fashioned mirrored MySQL setup needed **7.4 trips to disk for every single database change**. Aurora needed **0.95** — less than one — even though Aurora is keeping *six* copies of the data instead of two. Sending less information across the network beats sending the same information to fewer places. The backup-copy delay tells the same story from another angle: under heavy load, Aurora's backup copies fell only about 5 milliseconds behind the main copy. The old MySQL setup fell up to 300 *seconds* behind — nearly five minutes — which is genuinely long enough to cause real, confusing bugs, like a user seeing outdated information right after they made a change.

## What I'm taking away from this one

The lesson that stuck with me isn't really about MySQL or even about Aurora specifically — it's this: when you're designing something that has to run reliably at a huge scale, the first question worth asking isn't "how do we make this faster," it's "what's actually the scarce resource here, and what's the smallest amount of *that specific thing* we can get away with sending?" For Aurora, the scarce resource was network bandwidth between the database and its storage, and the answer was "send a list of changes, not the actual data." I think that's a genuinely reusable way of thinking about performance problems in general, not just this one paper.

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"](https://doi.org/10.1145/3035918.3056101), của Verbitski và cộng sự, SIGMOD 2017.*

Trước khi vào nội dung chính, tôi cần giải thích hai khái niệm, vì cả bài paper được xây trên đó, và tôi không muốn giả định là ai đọc bài này cũng đã biết sẵn.

**Replication** đơn giản là giữ nhiều hơn một bản sao của dữ liệu, thường trên các máy khác nhau, để nếu một máy chết thì bạn không mất hết mọi thứ. Nghe thì đơn giản. Phần khó là làm sao giữ cho tất cả bản sao đó đồng nhất với nhau mà không làm mọi thứ chậm như rùa bò — và đó gần như là toàn bộ nội dung của bài paper này.

**Redo log** là một cách khác để lưu thay đổi. Tưởng tượng bạn đang chỉnh sửa một tài liệu, và thay vì lưu lại *toàn bộ* tài liệu mỗi lần bạn đổi một từ, bạn chỉ giữ một danh sách các thay đổi: "đổi từ thứ 3 ở đoạn 2," "thêm một câu ở cuối," "xóa đoạn 5." Nếu máy tính bạn crash, bạn có thể dựng lại tài liệu hiện tại bằng cách bắt đầu từ lần lưu đầy đủ gần nhất rồi áp dụng lại danh sách thay đổi nhỏ đó, theo đúng thứ tự. Database vốn đã làm điều này ở bên trong — nó gọi là redo log, và bình thường chỉ là một chi tiết chạy nền. Trong paper này, nó trở thành nhân vật chính.

## Vì sao tôi đọc bài này

Tôi từng nghĩ paper này sẽ kiểu "MySQL, nhưng Amazon làm nó nhanh hơn nhờ phần cứng đắt tiền hơn." Cái tôi thực sự nhận được là một bức tranh rõ ràng hơn nhiều về *lý do* vì sao các database chạy trên cloud ngày nay lại được xây theo kiểu như vậy. Luận điểm trung tâm của paper: một khi bạn chạy ở quy mô của Amazon, điểm nghẽn thường không còn là CPU đang tính toán, cũng không phải ổ cứng đang quay — mà là sợi cáp mạng giữa database và nơi dữ liệu của nó thực sự nằm. Mọi quyết định thiết kế trong paper đều xuất phát từ việc coi trọng đúng một điểm nghẽn đó.

## Vấn đề họ bắt đầu từ đâu

Hãy hình dung một thiết lập database "an toàn" kiểu cũ: một server chính làm việc, cộng thêm một server dự phòng sẵn sàng thay thế nếu server chính chết, và hai bên liên tục sao chép dữ liệu qua mạng cho nhau để luôn đồng bộ. Nghe có vẻ hợp lý. Nhưng hãy nhìn mọi thứ phải đi qua mạng chỉ để lưu *một* thay đổi nhỏ vào database:

- redo log (danh sách thay đổi, như tôi mô tả ở trên)
- một log khác dùng để khôi phục database về bất kỳ thời điểm nào trong quá khứ
- chính dữ liệu đã được cập nhật
- *một bản sao khác* của đúng dữ liệu đó, giữ riêng để phòng chống một loại lỗi hiếm gặp khi việc lưu bị ngắt giữa chừng
- các file ghi chép linh tinh khác

Và nhiều bước trong số này phải xảy ra lần lượt, chờ xác nhận mỗi lần, trước khi hệ thống có thể nói "được, thay đổi này đã được lưu an toàn." Mỗi bước như vậy cộng thêm độ trễ, và cả chuỗi chỉ nhanh bằng đúng mắt xích chậm nhất.

## Cách Aurora giải quyết: gửi gần như không có gì

Câu trả lời của Aurora gần như đơn giản đến mức bướng bỉnh: **thứ duy nhất từng đi qua mạng từ database đến nơi lưu trữ là redo log** — cái danh sách nhỏ xíu các thay đổi đó, không bao giờ là dữ liệu đầy đủ. Không phải khi lưu nền, không phải khi dọn dẹp định kỳ, không bao giờ cả. Cách paper diễn đạt điều này đã làm thay đổi cách tôi nghĩ: bản thân redo log *chính là* bản sao thật sự, bền vững của database. Mọi thứ khác — những trang dữ liệu có thể đọc được — chỉ là thứ mà hệ thống lưu trữ tự dựng thêm bên lề, bất cứ khi nào tiện, như một lối tắt để khỏi phải chạy lại toàn bộ lịch sử thay đổi từ đầu mỗi lần có ai đó muốn đọc gì đó.

## Bỏ phiếu thay vì chỉ sao chép

Đây là một khái niệm tôi chưa từng thấy ai giải thích rõ ràng đến vậy: **quorum** về cơ bản là một luật bỏ phiếu. Giả sử bạn giữ 3 bản sao dữ liệu và quyết định "miễn là 2 trong 3 bản đồng ý, ta tin nó." Nghe có vẻ an toàn — cho đến khi bạn nhận ra trong một trung tâm dữ liệu thật, lỗi không phải lúc nào cũng ngẫu nhiên và độc lập với nhau. Amazon nhóm các server của họ thành các cụm vật lý gọi là **Availability Zone (AZ)** — hãy nghĩ chúng như những tòa nhà riêng biệt, mỗi tòa có nguồn điện và mạng riêng. Nếu cả một tòa nhà mất điện, mọi bản sao dữ liệu bên trong nó biến mất *cùng lúc*. Đó là một lỗi "có tương quan," không phải một lỗi độc lập. Nếu đúng lúc cả một AZ tối đen, bạn lại có sẵn một server khác (không liên quan) đang down ở đâu đó, luật đơn giản "2 trên 3" của bạn không còn cách nào biết được bản sao còn sống có thật sự là bản mới nhất hay không.

Câu trả lời của Aurora: giữ **6 bản sao trải trên 3 tòa nhà** (2 bản mỗi tòa), và yêu cầu **4 trên 6** bản đồng ý trước khi một lần ghi được tính là đã lưu, nhưng chỉ cần **3 trên 6** bản đồng ý trước khi một lần đọc được tin tưởng. Làm phép tính đó ra, bạn có hai đảm bảo đẹp: bạn có thể mất *nguyên một tòa nhà* cộng thêm một server ngẫu nhiên khác, mà đọc vẫn hoạt động. Bạn có thể mất *bất kỳ* hai server nào — kể cả nguyên một tòa nhà — mà ghi vẫn hoạt động. Đây không phải một con số an toàn chọn đại; nó là một con số được chọn chính xác vì nó sống sót qua đúng kịch bản "một lỗi lớn cộng một lỗi nhỏ cùng lúc" thực sự xảy ra trong các trung tâm dữ liệu thật.

Họ cũng chia storage thành các khối nhỏ 10 gigabyte. Vì sao nhỏ vậy? Vì một khối nhỏ có thể được sao chép lại lên một server khỏe mạnh chỉ trong khoảng 10 giây. Khoảng thời gian sửa lỗi càng ngắn, khả năng một lỗi *thứ hai* len vào trong lúc bạn vẫn đang sửa lỗi đầu tiên càng nhỏ. Bạn không thể khiến phần cứng không bao giờ hỏng — nhưng bạn có thể khiến việc sửa chữa nhanh đến mức kịch bản nguy hiểm "hai lỗi cùng lúc" gần như không bao giờ kịp xảy ra.

## Khôi phục sau crash mà không cần chạy lại toàn bộ lịch sử

Bình thường, khi một database crash rồi khởi động lại, nó phải nhìn vào log từ lần lưu tốt gần nhất, rồi cẩn thận chạy lại từng thay đổi kể từ đó để dựng lại một bức tranh chính xác về dữ liệu. Việc đó có thể mất một lúc, và nó xảy ra trên một máy duy nhất với cái nhìn rõ ràng, đơn giản về log của chính nó.

Dữ liệu của Aurora nằm rải rác trên nhiều máy, và bất kỳ máy nào cũng có thể đang thiếu một khối ngẫu nhiên nào đó ở đây hay chỗ kia. Thay vì dùng một giao thức chậm, lắm chuyện kiểu "tất cả cùng thống nhất chính xác trạng thái" (một giao thức kinh điển gọi là Two-Phase Commit, hay 2PC, với rất nhiều tin nhắn qua lại), Aurora dựa vào việc mỗi thay đổi đều được đánh dấu bằng một con số tăng dần nghiêm ngặt — giống như số trang không bao giờ bị bỏ sót hay lặp lại. Chỉ cần dùng những con số đó, Aurora có thể tìm ra "điểm cao nhất tôi có thể cam kết là đã lưu an toàn hoàn toàn" mà không cần chạy lại gì cả. Khôi phục sau crash trở thành việc so sánh vài con số thay vì chạy lại cả một câu chuyện từ đầu — đó là lý do Aurora tự nhận có thể khôi phục dưới 10 giây, ngay cả sau khi vừa xử lý hơn 100.000 lượt ghi mỗi giây trước khi crash.

## Con số thực sự chứng minh điều này hiệu quả

Đây là benchmark khiến cả thiết kế trở nên rõ ràng với tôi: trong một bài test nặng về ghi, một thiết lập MySQL mirror kiểu cũ cần **7.4 lượt truy cập đĩa cho mỗi thay đổi database**. Aurora chỉ cần **0.95** — chưa tới một — dù Aurora giữ *sáu* bản sao dữ liệu thay vì hai. Gửi ít thông tin hơn qua mạng hiệu quả hơn hẳn việc gửi cùng lượng thông tin đến ít nơi hơn. Số liệu về độ trễ của bản sao dự phòng kể cùng một câu chuyện từ góc nhìn khác: dưới tải nặng, bản sao của Aurora chỉ trễ khoảng 5 mili-giây so với bản chính. Thiết lập MySQL cũ trễ tới 300 *giây* — gần năm phút — đủ dài để gây ra bug thật sự, khó hiểu, kiểu như người dùng thấy thông tin cũ ngay sau khi họ vừa thay đổi nó.

## Điều tôi rút ra từ bài này

Bài học khiến tôi nhớ nhất không hẳn về MySQL hay thậm chí về riêng Aurora — mà là thế này: khi bạn thiết kế thứ gì đó phải chạy đáng tin cậy ở quy mô khổng lồ, câu hỏi đầu tiên đáng hỏi không phải là "làm sao để cái này nhanh hơn," mà là "thứ gì thực sự đang khan hiếm ở đây, và lượng nhỏ nhất của *đúng thứ đó* mà ta có thể gửi đi là bao nhiêu?" Với Aurora, thứ khan hiếm là băng thông mạng giữa database và nơi lưu trữ, và câu trả lời là "gửi một danh sách thay đổi, không phải dữ liệu thật." Tôi nghĩ đó là một cách tư duy thật sự có thể áp dụng lại cho các bài toán hiệu năng nói chung, không chỉ riêng bài paper này.

</div>

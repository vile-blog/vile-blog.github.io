---
title: "Paper Notes: Aurora DSQL — Scalable, Multi-Region OLTP"
title_vi: "Ghi chú Paper: Aurora DSQL — Scalable, Multi-Region OLTP"
date: 2026-09-14 10:15:00 +0700
excerpt: "How do you build a database that's spread across three continents, feels instant to every user, and never shows two people different answers to the same question? This paper's answer surprised me."
excerpt_vi: "Làm sao xây một database trải trên ba châu lục, cảm giác tức thời với mọi người dùng, và không bao giờ cho hai người hai câu trả lời khác nhau cho cùng một câu hỏi? Câu trả lời trong paper này khiến tôi bất ngờ."
categories: [papers]
tags: ["Aurora DSQL", "Distributed SQL", "OLTP", "Multi-Region", "Concurrency Control"]
paper_title: "Aurora DSQL: Scalable, Multi-Region OLTP"
paper_authors: "Brooker, Bowes, Hershey, van der Merwe, Morle, Strydom — AWS, arXiv 2026"
paper_url: "https://arxiv.org/abs/2607.13276"
---

<div data-lang-content="en" markdown="1">

*Paper: ["Aurora DSQL: Scalable, Multi-Region OLTP"](https://arxiv.org/abs/2607.13276), by Brooker et al., AWS.*

This is a hard paper to explain casually, so let me build up to it slowly with an example, because I think the problem it's solving is actually really easy to picture even if the solution isn't.

## The problem, without any jargon

Imagine you're running an online store with customers in the US, Europe, and Asia. You want the app to feel instant for everyone, so you'd like a copy of your database running near each group of customers instead of everyone talking to one server on the other side of the planet. But here's the catch: what if a customer in the US and a customer in Singapore try to buy the *last* item in stock at almost the exact same moment? Both copies of your database need to agree on who actually got it — you can't let both purchases succeed. That agreement has to travel between continents, and continents are far apart. Even at the speed of light, a message from the US to Singapore and back takes real, noticeable time. So now you've got a tension: you want things to feel fast and local, but correctness sometimes genuinely requires talking to the other side of the world.

That tension — "be fast and local most of the time, but never allow the world to disagree with itself" — is exactly what this paper is about. Before I can explain their answer, I need to define a handful of terms, because this paper leans on all of them.

## A quick glossary, in plain language

- **Transaction**: a group of changes to a database that must all happen together, or not at all. Classic example: moving money between two bank accounts means subtracting from one and adding to the other — if only one half happens, someone's money just vanished.
- **Sharding**: splitting a huge database into smaller pieces spread across many machines — like splitting one giant phone book into 26 separate books, one per letter of the alphabet, so no single bookshelf has to hold the entire country's contacts.
- **Locking (the traditional way of handling multiple people at once)**: when someone starts changing a piece of data, the system "locks" it so nobody else can touch it until they're done — like checking a library book out so nobody else can borrow it until you return it. Safe, but if you go on vacation with the book, everyone else waits.
- **Optimistic concurrency control (the alternative DSQL uses)**: instead of locking things upfront, everyone just goes ahead and works on their own copy, and only right at the very end does the system check "did anyone else change this same thing while I was working?" If nobody did, great, save it. If someone did, you redo your work. This avoids the "someone went on vacation with the book" problem entirely, at the cost of occasionally having to redo work.
- **Snapshot / MVCC**: instead of keeping just one current version of each piece of data, the database keeps several recent versions around. That way, someone reading data can be handed a consistent "freeze frame" from a specific moment in time, even while other people are actively changing things — like a library keeping the previous edition of a book on the shelf while a new edition is being printed, so people already reading the old one aren't interrupted.
- **Round trip**: sending a message and waiting for the reply. If the two computers are on different continents, this round trip is slow no matter how good your code is, because it's limited by the actual physical distance the signal has to travel.

## What DSQL actually does

DSQL splits the job of "being a database" into five separate specialist pieces instead of one big program doing everything:

1. **Query Processors** — the part that talks directly to your application, understands SQL, and figures out what to do with it. There's a fresh one of these for every connection, and it doesn't remember anything between requests.
2. **Storage nodes** — hold the actual data, split ("sharded") by key range, and can hand out a snapshot version to readers without needing to check in with anyone else first.
3. **Adjudicators** — the referees. Their only job is deciding "can this transaction go through, or does it conflict with something else that already happened?"
4. **Journal** — a single, strictly ordered, permanent record of every transaction that has ever been approved. Think of it as the official diary that everything else is built from.
5. **Crossbar** — takes the Journal's entries and routes them out to the right storage nodes.

The detail that impressed me most: the referees (Adjudicators) and the data-holders (Storage nodes) are split up *independently* of each other. A shop that gets tons of browsing traffic but few actual purchases can run lots of storage copies for fast reading, while only needing a small number of referees, since checking out is rare. Most systems force you to use the same splitting scheme for both jobs; DSQL lets you tune them separately, which is a genuinely different and clever lever to have.

## Why "checking at the end" instead of "locking upfront" matters at global scale

Remember the library-book analogy — locking means someone can "walk off with the book." At a small scale that's a minor annoyance. At the scale DSQL operates at, with connections spread across continents, "walking off with the book" can mean: a server pauses briefly to do garbage collection, or a network hiccup causes a retry storm, or literally an engineer looking at a slow query steps away from their desk for coffee — mid-transaction. If that transaction is holding a lock, *every other request touching the same data anywhere in the world freezes* until it's released. DSQL's optimistic approach makes this structurally impossible: nobody ever waits on anybody else, because nobody reserves anything ahead of time. The worst case is just "redo your own work," never "block a stranger."

## The actual trick: only argue with the world once, at the very end

Here's the part that's genuinely clever. Reading data never needs to ask anyone else's permission — a Query Processor just reads a snapshot locally. Writing data is buffered locally too, entirely inside your own Query Processor, and doesn't touch the rest of the system *at all* until you say "I'm done, save this" (called `COMMIT`). Only at that single moment does the system have to:

1. Ask the relevant Adjudicators "did anyone else change these exact same pieces of data since I started?"
2. If nobody did, write the transaction into the Journal — permanently, atomically, exactly once.
3. If your data is spread across multiple regions, make sure that Journal entry is safely stored in at least two of your three regions before saying "done."

That third step is the only moment the system has to have an actual conversation across continents — and it only happens once per transaction, not once per individual change inside it. In their benchmark, a message between two AWS regions on opposite sides of the US takes around 62 milliseconds round-trip. But because you only need agreement from *two* out of *three* regions, DSQL can be clever about which two, and the real number ends up closer to 11 milliseconds in a well-chosen three-region setup — because it only has to wait for the *closer* of the two other regions, not the farthest one. Compared to an older-style competitor that locks data and needs a network round trip for every single line of a transaction, that competitor gets slower and slower the more work is in each transaction, while DSQL barely changes at all.

## Where the theory gets messy, and they admit it

Academic descriptions of "snapshot isolation" (the rule I described above, where everyone sees a consistent freeze-frame) don't perfectly cover every real situation. Two examples the authors call out honestly:

- If someone is changing the actual *structure* of a table (like adding a column) at the same moment someone else is inserting a row, snapshot isolation alone isn't strict enough to prevent weirdness — so DSQL quietly makes structural changes stricter than normal data changes.
- The SQL feature `FOR UPDATE`, which lets a program explicitly say "I plan to change this row soon, please don't let anyone sneak in first," needs similar special-casing.

I liked that they said this out loud instead of pretending the textbook version of snapshot isolation just works everywhere unmodified. Real systems always have these edge cases; the honest ones name them.

## The limitations section is the most trustworthy part of the paper

A lot of company-published systems papers read like advertisements. This one has an entire section admitting real, current weaknesses: every transaction is capped at 3,000 rows or 10 megabytes (on purpose, to keep worst-case delays predictable — bigger transactions in flight make everyone's experience less predictable, not just the person running the big one). Foreign key constraints, a very standard SQL feature, aren't supported yet — they admit they underestimated how many people wanted it. And their choice to split data by ranges (good for keeping related rows physically close together) makes certain common patterns, like auto-incrementing ID numbers, genuinely awkward to spread across many machines efficiently. I trust a systems paper more, not less, when it tells me what doesn't work yet.

## How it stacks up against the two names I already knew

Two well-known systems I'd heard of before, Google's Spanner and CockroachDB, both use the "locking" approach — one designated leader machine per data shard, holding locks, agreeing via a voting protocol. DSQL deliberately avoids having any single "leader" holding locks at all. The system it actually resembles most, according to the authors themselves, isn't Spanner — it's an older, less famous system called FoundationDB, which was one of the first to seriously separate "deciding if a transaction is valid" from "storing the actual data." DSQL just takes that same idea and pushes it even further apart.

## What this taught me, beyond the specific system

The thing I keep coming back to is how much of this design is really about *minimizing the number of moments where distant computers have to talk to each other*, rather than making each individual conversation faster. That reframing — treat cross-region communication as a rare, expensive event you schedule deliberately, not something you can just optimize your way out of — feels like a genuinely transferable lesson for any system that has to work across long distances, not just databases.

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["Aurora DSQL: Scalable, Multi-Region OLTP"](https://arxiv.org/abs/2607.13276), của Brooker và cộng sự, AWS.*

Đây là một paper khó giải thích ngắn gọn, nên để tôi xây dựng từ từ bằng một ví dụ, vì tôi nghĩ vấn đề nó giải quyết thực ra rất dễ hình dung, dù lời giải thì không.

## Vấn đề, không cần thuật ngữ chuyên môn

Tưởng tượng bạn đang vận hành một cửa hàng online với khách hàng ở Mỹ, châu Âu, và châu Á. Bạn muốn ứng dụng cảm giác nhanh tức thì với mọi người, nên bạn muốn có một bản sao database chạy gần từng nhóm khách hàng thay vì ai cũng phải nói chuyện với một server ở nửa vòng trái đất. Nhưng đây là cái bẫy: nếu một khách ở Mỹ và một khách ở Singapore cùng cố mua *món hàng cuối cùng* trong kho gần như cùng một thời điểm thì sao? Cả hai bản sao database phải thống nhất xem ai thực sự mua được — bạn không thể để cả hai giao dịch đều thành công. Sự thống nhất đó phải đi qua khoảng cách giữa các châu lục, mà các châu lục thì rất xa nhau. Ngay cả với tốc độ ánh sáng, một tin nhắn từ Mỹ đến Singapore rồi quay lại cũng mất một khoảng thời gian đáng kể. Vậy là bạn có một sự căng thẳng: bạn muốn mọi thứ nhanh và cục bộ, nhưng đôi khi tính đúng đắn lại thực sự đòi hỏi phải nói chuyện với phía bên kia thế giới.

Sự căng thẳng đó — "nhanh và cục bộ hầu hết thời gian, nhưng không bao giờ để thế giới tự mâu thuẫn với chính nó" — chính xác là điều bài paper này nói tới. Trước khi giải thích cách họ giải quyết, tôi cần định nghĩa vài thuật ngữ, vì cả paper dựa trên tất cả những khái niệm đó.

## Từ điển nhanh, bằng ngôn ngữ đơn giản

- **Transaction**: một nhóm thay đổi lên database phải xảy ra cùng nhau, hoặc không xảy ra gì cả. Ví dụ kinh điển: chuyển tiền giữa hai tài khoản ngân hàng nghĩa là trừ tiền ở một bên và cộng vào bên kia — nếu chỉ một nửa xảy ra, tiền của ai đó vừa biến mất.
- **Sharding**: chia một database khổng lồ thành nhiều mảnh nhỏ trải trên nhiều máy — giống như chia một cuốn danh bạ điện thoại khổng lồ thành 26 cuốn nhỏ, mỗi cuốn một chữ cái, để không cái kệ sách nào phải chứa toàn bộ danh bạ của cả nước.
- **Locking (cách truyền thống xử lý nhiều người cùng lúc)**: khi ai đó bắt đầu thay đổi một dữ liệu, hệ thống "khóa" nó lại để không ai khác đụng vào được cho đến khi xong — giống như mượn một quyển sách thư viện để không ai khác mượn được cho đến khi bạn trả lại. An toàn, nhưng nếu bạn mang sách đi nghỉ mát thì mọi người khác phải chờ.
- **Optimistic concurrency control (cách thay thế mà DSQL dùng)**: thay vì khóa trước, mọi người cứ làm việc trên bản của mình, và chỉ đến phút cuối cùng hệ thống mới kiểm tra "có ai khác đổi đúng thứ này trong lúc tôi đang làm không?" Nếu không ai đổi, tuyệt, lưu lại. Nếu có ai đổi, bạn làm lại. Cách này tránh hẳn vấn đề "ai đó mang sách đi nghỉ mát," đổi lại là thỉnh thoảng phải làm lại việc.
- **Snapshot / MVCC**: thay vì chỉ giữ đúng một phiên bản hiện tại của mỗi dữ liệu, database giữ lại vài phiên bản gần đây. Nhờ vậy, người đọc dữ liệu có thể nhận được một "khung hình đóng băng" nhất quán tại một thời điểm cụ thể, ngay cả khi người khác đang thay đổi mọi thứ — giống như thư viện vẫn giữ ấn bản cũ của một cuốn sách trên kệ trong lúc ấn bản mới đang được in, để người đang đọc ấn bản cũ không bị gián đoạn.
- **Round trip**: gửi một tin nhắn và chờ phản hồi. Nếu hai máy tính nằm ở hai châu lục khác nhau, round trip này chậm dù code bạn có giỏi cỡ nào, vì nó bị giới hạn bởi khoảng cách vật lý thật mà tín hiệu phải đi qua.

## DSQL thực sự làm gì

DSQL chia công việc "làm một database" thành năm mảnh chuyên biệt riêng biệt thay vì một chương trình lớn làm hết mọi thứ:

1. **Query Processor** — phần nói chuyện trực tiếp với ứng dụng của bạn, hiểu SQL, và tìm ra phải làm gì với nó. Mỗi kết nối có một cái mới toanh, và nó không nhớ gì giữa các request.
2. **Storage node** — giữ dữ liệu thật, chia ("shard") theo dải key, và có thể đưa cho người đọc một phiên bản snapshot mà không cần hỏi ý kiến ai khác trước.
3. **Adjudicator** — các trọng tài. Việc duy nhất của họ là quyết định "transaction này có được đi qua không, hay nó xung đột với thứ gì đó đã xảy ra rồi?"
4. **Journal** — một bản ghi duy nhất, có thứ tự nghiêm ngặt, vĩnh viễn của mọi transaction từng được chấp thuận. Hãy nghĩ nó như cuốn nhật ký chính thức mà mọi thứ khác được xây dựng từ đó.
5. **Crossbar** — lấy các mục từ Journal và định tuyến chúng tới đúng storage node.

Chi tiết khiến tôi ấn tượng nhất: các trọng tài (Adjudicator) và nơi giữ dữ liệu (Storage node) được chia tách *độc lập* với nhau. Một cửa hàng có rất nhiều lượt xem nhưng ít lượt mua thực sự có thể chạy nhiều bản sao storage để đọc nhanh, trong khi chỉ cần một số ít trọng tài, vì việc mua hàng hiếm hơn. Hầu hết hệ thống bắt bạn dùng chung một cách chia cho cả hai việc; DSQL cho phép bạn tinh chỉnh riêng từng cái, và đó thực sự là một đòn bẩy khác biệt, thông minh.

## Vì sao "kiểm tra ở cuối" thay vì "khóa trước" lại quan trọng ở quy mô toàn cầu

Nhớ lại ví dụ quyển sách thư viện — locking nghĩa là ai đó có thể "mang sách đi mất." Ở quy mô nhỏ, đó chỉ là phiền toái nhỏ. Ở quy mô DSQL vận hành, với các kết nối trải khắp châu lục, "mang sách đi mất" có thể là: một server tạm dừng chút để dọn rác bộ nhớ, hoặc một trục trặc mạng gây ra một cơn bão retry, hoặc thậm chí một kỹ sư đang xem một truy vấn chậm đứng dậy đi lấy cà phê — ngay giữa transaction. Nếu transaction đó đang giữ một lock, *mọi request khác chạm vào cùng dữ liệu đó ở bất kỳ đâu trên thế giới đều bị đóng băng* cho đến khi nó được thả ra. Cách tiếp cận optimistic của DSQL khiến điều này về mặt cấu trúc không thể xảy ra: không ai phải chờ ai cả, vì không ai đặt trước cái gì. Trường hợp xấu nhất chỉ là "làm lại việc của chính mình," không bao giờ là "chặn đứng một người lạ."

## Mánh khóe thật sự: chỉ tranh cãi với cả thế giới đúng một lần, ở phút cuối

Đây là phần tôi thấy thật sự thông minh. Đọc dữ liệu không bao giờ cần xin phép ai — một Query Processor chỉ đơn giản đọc một snapshot cục bộ. Ghi dữ liệu cũng được buffer cục bộ, hoàn toàn bên trong Query Processor của chính bạn, và không đụng đến phần còn lại của hệ thống *chút nào* cho đến khi bạn nói "tôi xong rồi, lưu lại đi" (gọi là `COMMIT`). Chỉ đúng khoảnh khắc đó hệ thống mới phải:

1. Hỏi các Adjudicator liên quan "có ai khác đổi đúng những dữ liệu này kể từ lúc tôi bắt đầu không?"
2. Nếu không ai đổi, ghi transaction vào Journal — vĩnh viễn, atomic, đúng một lần.
3. Nếu dữ liệu của bạn trải trên nhiều vùng, đảm bảo mục Journal đó được lưu an toàn ở ít nhất hai trong ba vùng trước khi báo "xong."

Bước thứ ba đó là khoảnh khắc duy nhất hệ thống phải thực sự "nói chuyện" xuyên châu lục — và nó chỉ xảy ra một lần cho mỗi transaction, không phải một lần cho từng thay đổi nhỏ bên trong nó. Trong benchmark của họ, một tin nhắn giữa hai vùng AWS ở hai đầu nước Mỹ mất khoảng 62 mili-giây cho một round-trip. Nhưng vì bạn chỉ cần sự đồng ý từ *hai trong ba* vùng, DSQL có thể khôn khéo chọn đúng hai vùng nào, và con số thực tế lại gần 11 mili-giây hơn trong một thiết lập ba vùng được chọn tốt — vì nó chỉ cần chờ vùng *gần hơn* trong hai vùng còn lại, không phải vùng xa nhất. So với một đối thủ kiểu cũ dùng khóa và cần một round-trip mạng cho mỗi dòng lệnh trong transaction, đối thủ đó càng chậm khi transaction càng dài, trong khi DSQL gần như không đổi.

## Chỗ lý thuyết trở nên lộn xộn, và họ thừa nhận điều đó

Mô tả học thuật về "snapshot isolation" (luật tôi mô tả ở trên, nơi ai cũng thấy một khung hình đóng băng nhất quán) không phủ hoàn hảo mọi tình huống thực tế. Hai ví dụ tác giả thẳng thắn chỉ ra:

- Nếu ai đó đang đổi *cấu trúc* thật sự của một bảng (như thêm một cột) đúng lúc người khác đang thêm một dòng, chỉ riêng snapshot isolation không đủ nghiêm ngặt để ngăn sự kỳ quặc — nên DSQL âm thầm làm cho các thay đổi cấu trúc nghiêm ngặt hơn thay đổi dữ liệu bình thường.
- Tính năng SQL `FOR UPDATE`, cho phép chương trình nói rõ "tôi sắp đổi dòng này, đừng để ai chen ngang trước," cũng cần được xử lý đặc biệt tương tự.

Tôi thích việc họ nói điều này ra thẳng thắn thay vì giả vờ phiên bản sách vở của snapshot isolation hoạt động ở mọi nơi mà không cần chỉnh sửa gì. Hệ thống thật luôn có những trường hợp biên như vậy; những bài viết trung thực là những bài dám nêu tên chúng.

## Phần giới hạn là phần đáng tin nhất của paper

Rất nhiều paper hệ thống do công ty xuất bản đọc như quảng cáo. Bài này có hẳn một mục thừa nhận những điểm yếu thật, hiện tại: mỗi transaction bị giới hạn ở 3.000 dòng hoặc 10 megabyte (có chủ đích, để giữ độ trễ trường hợp xấu nhất có thể dự đoán được — transaction lớn đang chạy khiến trải nghiệm của MỌI người kém dự đoán hơn, không chỉ người đang chạy transaction lớn đó). Ràng buộc khóa ngoại, một tính năng SQL rất chuẩn, chưa được hỗ trợ — họ thừa nhận đã đánh giá thấp số người muốn dùng nó. Và việc họ chọn chia dữ liệu theo dải (tốt cho việc giữ các dòng liên quan gần nhau về mặt vật lý) khiến một số kiểu dùng phổ biến, như số ID tự tăng dần, thực sự khó chia đều hiệu quả lên nhiều máy. Tôi tin một bài paper hệ thống hơn, không phải ít hơn, khi nó nói cho tôi biết cái gì chưa hoạt động tốt.

## So với hai cái tên tôi đã từng biết

Hai hệ thống nổi tiếng tôi từng nghe qua, Spanner của Google và CockroachDB, đều dùng cách tiếp cận "khóa" — một máy leader chỉ định cho mỗi mảnh dữ liệu, giữ lock, đồng thuận qua một giao thức bỏ phiếu. DSQL cố tình tránh hẳn việc có bất kỳ "leader" nào giữ lock. Hệ thống nó thực sự giống nhất, theo chính các tác giả, không phải Spanner — mà là một hệ thống cũ hơn, ít nổi tiếng hơn tên là FoundationDB, một trong những hệ đầu tiên nghiêm túc tách "quyết định một transaction có hợp lệ không" ra khỏi "lưu trữ dữ liệu thật." DSQL chỉ đơn giản lấy đúng ý tưởng đó và đẩy nó tách rời xa hơn nữa.

## Điều bài này dạy tôi, ngoài hệ thống cụ thể

Điều tôi cứ nghĩ lại là phần lớn thiết kế này thực chất là về việc *giảm thiểu số khoảnh khắc mà các máy tính ở xa nhau phải nói chuyện với nhau*, hơn là làm cho mỗi cuộc trò chuyện riêng lẻ nhanh hơn. Cách đóng khung lại vấn đề đó — coi giao tiếp liên vùng là một sự kiện hiếm, tốn kém mà bạn chủ động lên lịch, không phải thứ bạn có thể chỉ tối ưu hóa để thoát khỏi nó — có vẻ là một bài học thật sự có thể áp dụng cho bất kỳ hệ thống nào phải hoạt động qua khoảng cách xa, không chỉ riêng database.

</div>

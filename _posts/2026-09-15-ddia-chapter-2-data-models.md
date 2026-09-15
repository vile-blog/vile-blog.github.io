---
title: "DDIA Chapter 2: Data Models and Query Languages"
title_vi: "DDIA Chương 2: Data Models and Query Languages"
date: 2026-09-15 08:30:00 +0700
excerpt: "The same profile — a person with jobs and schools — looks completely different depending on whether you store it as tables, a document, or a graph. Chapter 2 is about why that choice matters more than it seems."
excerpt_vi: "Cùng một profile — một người với công việc và trường học — trông hoàn toàn khác nhau tùy vào việc bạn lưu nó dưới dạng bảng, document, hay graph. Chương 2 nói về việc vì sao lựa chọn đó quan trọng hơn ta tưởng."
categories: [book-notes]
tags: ["Designing Data-Intensive Applications", "Chapter 2", "Data Models", "Query Languages"]
book_title: "Designing Data-Intensive Applications"
book_author: "Martin Kleppmann"
book_url: "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/"
book_chapter: "Chapter 2: Data Models and Query Languages"
book_chapter_vi: "Chương 2: Data Models and Query Languages"
---

<div data-lang-content="en" markdown="1">

*Book: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) by Martin Kleppmann — Chapter 2: Data Models and Query Languages.*

Right after the foundations in [Chapter 1](/blog/2026/09/15/ddia-chapter-1-reliable-scalable-maintainable/), the book moves to something every engineer has an opinion about but rarely examines closely: the **data model** — the shape you force your data into before a database will even accept it. This sounds like a boring implementation detail until you realize it's actually one of the most consequential decisions in any system, because it shapes what kind of code you get to write for the *rest of the project's life*.

## The example that made it click: a LinkedIn-style profile

The book's running example is a résumé/professional profile — someone with a name, a current job, a list of past jobs, and a list of schools. It's a great example precisely because it's *not* obviously simple: one person has *many* jobs and *many* schools, and each of those has its own set of fields (company name, dates, role). Watch what happens to this one piece of real-world data across three different models:

![The same LinkedIn-style profile stored three different ways: relational tables with foreign keys, one self-contained document, or a graph of connected nodes](/assets/images/ddia/ch2-data-models.svg)

**Relational (tables)** — think PostgreSQL or MySQL, or how a bank stores accounts and transactions. You get a `users` table, a separate `jobs` table, and a separate `education` table, connected by foreign keys (a job row points back to which user it belongs to). To reconstruct one full profile, the database has to *join* across all three tables. This is the classic choice for anything where the data is highly interconnected and you need strong guarantees that, say, a job can never point to a user that doesn't exist — which matters enormously for something like a bank, where "point to a user that doesn't exist" could mean money vanishing into thin air.

**Document (JSON-like)** — think MongoDB, or how a lot of content-heavy apps (a blog post with its comments embedded, a product page with its reviews) store things. The entire profile — name, jobs, education, all of it — lives in one single self-contained JSON-like blob. There's no join needed to read the whole profile back; it's just sitting there as one object. This is a great fit when you usually read and write the *whole* thing together (you rarely need "just the jobs, from every user, sorted a certain way" as a first-class query), and it maps naturally onto how a lot of frontend code already thinks about data — as nested objects, not flat tables.

**Graph** — think Neo4j, or how Facebook and LinkedIn actually model *your network* underneath the profile page itself (the profile page is document-like, but the "who's connected to whom, and how" layer is a graph). Here, a person is a node, and "works at," "studied at," "is connected to" are edges connecting nodes to other nodes. This shines specifically when the *relationships between things* are the interesting part of the query — "find everyone within two connections of me who also works in tech" is a natural graph query and a genuinely painful relational one, because it requires an unknown, variable number of joins (you don't know in advance if it's one hop or five).

## The book's actual argument: it's not "relational vs. NoSQL," it's "match the shape to the query"

I went in expecting a "relational is old, document databases are the future" narrative, since that's the vibe I remembered from around when these databases got popular. The book pushes back on that pretty directly. Its actual point is more useful and less tribal: **each model is good at representing certain relationships and bad at others, and the right choice depends on what your application actually asks the database most often** — not on which one is trendier.

A document model is genuinely great when your data naturally comes in self-contained, tree-shaped chunks that you read and write as a whole (a single blog post, a single user profile) — Kleppmann calls this locating "schema flexibility" and reduced impedance mismatch as real wins. But it gets awkward the moment you need to query *across* those documents in a relational way — "find every job at every company headquartered in a specific city" means the document database now has to reach *into* every profile's embedded job list, which is exactly the kind of query relational joins were built for.

A graph model is genuinely great for highly interconnected data where the *paths between* things matter — social networks, recommendation engines, fraud-detection systems that look for suspicious chains of transactions. But it's overkill, and often slower, for data that's mostly flat and rarely needs relationship-traversal — you wouldn't model a simple e-commerce order history as a graph just because you technically could.

## Query languages: declarative vs. imperative, and why it matters

The other half of the chapter is about *how you ask* the database for what you want, and this is where the book draws a distinction I hadn't thought carefully about before: **declarative** vs. **imperative** query languages.

SQL is declarative: you describe *what result you want* ("give me every user who signed up this month"), and you leave it entirely up to the database engine to figure out *how* to actually go fetch it efficiently. The huge, often invisible benefit here: the database is free to get smarter about the "how" over time — add an index, change its execution strategy, parallelize the work across multiple machines — without you ever having to touch your query. Your code stays declarative and correct while the database's internals evolve underneath it.

An imperative approach instead makes *you* write out the step-by-step procedure — loop through every record, check a condition, collect the matches yourself. This gives you precise control, but it also means you're now responsible for the efficiency of every single step, and if the database changes how it stores data internally, your hand-written loop might quietly become the slow path while everyone else's declarative query benefits automatically from the new optimization.

The everyday parallel I found genuinely useful: telling a taxi driver "take me to the airport" is declarative — you don't care which streets they take, and if there's a smarter route today because of new traffic data, you benefit immediately without changing your instructions. Reading them turn-by-turn directions yourself is imperative — precise, but now *you're* on the hook if there's a smarter route and you didn't know about it.

## Why I think this chapter matters going forward

This chapter is really the "pick your data model" decision that every later chapter quietly assumes has already been made. When the book later talks about partitioning or replication strategies, which specific tradeoffs apply depends heavily on whether you're partitioning rows in a table, documents in a collection, or nodes in a graph. Reading this chapter first means the later, more distributed-systems-flavored chapters have a concrete "shape of the data" to reason about, instead of a vague, generic "the database" to wave hands at.

</div>
<div data-lang-content="vi" markdown="1">

*Sách: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) của Martin Kleppmann — Chương 2: Data Models and Query Languages.*

Ngay sau phần nền tảng ở [Chương 1](/blog/2026/09/15/ddia-chapter-1-reliable-scalable-maintainable/), cuốn sách chuyển sang một thứ mà kỹ sư nào cũng có ý kiến riêng nhưng ít khi xem xét kỹ: **data model** — cái khuôn bạn buộc dữ liệu của mình phải theo trước khi một database chịu chấp nhận nó. Nghe qua thì tưởng chỉ là chi tiết triển khai nhàm chán, cho đến khi bạn nhận ra đây thực ra là một trong những quyết định có ảnh hưởng lớn nhất trong bất kỳ hệ thống nào, vì nó định hình loại code bạn sẽ phải viết trong *suốt phần đời còn lại của dự án*.

## Ví dụ khiến tôi hiểu ra: một profile kiểu LinkedIn

Ví dụ xuyên suốt trong sách là một profile nghề nghiệp/résumé — một người có tên, công việc hiện tại, danh sách công việc trước đây, và danh sách trường học. Đây là một ví dụ hay chính vì nó *không* đơn giản một cách hiển nhiên: một người có *nhiều* công việc và *nhiều* trường học, và mỗi cái trong số đó lại có bộ field riêng (tên công ty, ngày tháng, chức vụ). Hãy xem chuyện gì xảy ra với đúng một mẩu dữ liệu thực tế này qua ba mô hình khác nhau:

![Cùng một profile kiểu LinkedIn được lưu theo ba cách: bảng quan hệ với khóa ngoại, một document tự chứa, hoặc một graph gồm các node kết nối nhau](/assets/images/ddia/ch2-data-models.svg)

**Relational (dạng bảng)** — nghĩ tới PostgreSQL hay MySQL, hoặc cách một ngân hàng lưu tài khoản và giao dịch. Bạn có một bảng `users`, một bảng `jobs` riêng, một bảng `education` riêng, kết nối với nhau bằng khóa ngoại (một dòng job trỏ ngược về nó thuộc về user nào). Để dựng lại toàn bộ một profile, database phải *join* qua cả ba bảng. Đây là lựa chọn kinh điển cho bất kỳ dữ liệu nào có liên kết chặt chẽ và bạn cần đảm bảo mạnh mẽ rằng, ví dụ, một job không bao giờ có thể trỏ tới một user không tồn tại — điều này quan trọng khủng khiếp với thứ như ngân hàng, nơi "trỏ tới một user không tồn tại" có thể đồng nghĩa tiền bốc hơi vào hư không.

**Document (dạng giống JSON)** — nghĩ tới MongoDB, hoặc cách nhiều ứng dụng nặng về nội dung (một bài blog kèm comment nhúng sẵn, một trang sản phẩm kèm review) lưu dữ liệu. Toàn bộ profile — tên, jobs, education, tất cả — nằm trong đúng một khối JSON tự chứa duy nhất. Không cần join để đọc lại cả profile; nó chỉ nằm sẵn đó như một object. Đây là lựa chọn tuyệt vời khi bạn thường đọc và ghi *toàn bộ* thứ đó cùng lúc (bạn hiếm khi cần truy vấn "chỉ jobs, từ mọi user, sắp xếp theo một cách nào đó" như một truy vấn hạng nhất), và nó ánh xạ tự nhiên vào cách rất nhiều code frontend đã sẵn nghĩ về dữ liệu — như các object lồng nhau, không phải bảng phẳng.

**Graph** — nghĩ tới Neo4j, hoặc cách Facebook và LinkedIn thực sự mô hình hóa *mạng lưới của bạn* bên dưới chính trang profile (trang profile giống document, nhưng lớp "ai kết nối với ai, và kết nối kiểu gì" lại là một graph). Ở đây, một người là một node, và "làm việc tại," "học tại," "kết nối với" là các cạnh (edge) nối node này với node khác. Cách này tỏa sáng đặc biệt khi *mối quan hệ giữa các thứ* mới chính là phần thú vị của truy vấn — "tìm mọi người trong vòng hai kết nối với tôi mà cũng làm trong ngành tech" là một truy vấn graph tự nhiên và là một cơn ác mộng thực sự nếu làm bằng quan hệ, vì nó đòi hỏi một số lượng join không xác định, thay đổi (bạn không biết trước là một bước hay năm bước nhảy).

## Luận điểm thực sự của cuốn sách: không phải "relational vs. NoSQL", mà là "khớp hình dạng với truy vấn"

Tôi bước vào chương này với kỳ vọng một câu chuyện kiểu "relational đã lỗi thời, document database mới là tương lai," vì đó là cảm giác tôi nhớ từ thời các database này mới nổi. Cuốn sách phản bác điều đó khá thẳng thắn. Luận điểm thực sự của nó hữu ích hơn và bớt phe phái hơn nhiều: **mỗi mô hình giỏi biểu diễn một số loại quan hệ nhất định và kém ở những loại khác, và lựa chọn đúng phụ thuộc vào việc ứng dụng của bạn thực sự hỏi database cái gì nhiều nhất** — không phải phụ thuộc vào cái nào đang thịnh hành.

Mô hình document thực sự tuyệt vời khi dữ liệu của bạn tự nhiên đến dưới dạng các khối tự chứa, hình cây, mà bạn đọc và ghi như một khối trọn vẹn (một bài blog đơn lẻ, một profile user đơn lẻ) — Kleppmann gọi đây là "schema flexibility" (linh hoạt về schema) và giảm "impedance mismatch" (sự lệch pha giữa cách code và cách database nghĩ về dữ liệu) là những lợi ích thật. Nhưng nó trở nên vụng về ngay khi bạn cần truy vấn *xuyên qua* các document đó theo kiểu quan hệ — "tìm mọi công việc tại mọi công ty có trụ sở ở một thành phố cụ thể" nghĩa là document database giờ phải thò vào *bên trong* danh sách job nhúng của từng profile, đúng loại truy vấn mà join quan hệ sinh ra để giải quyết.

Mô hình graph thực sự tuyệt vời cho dữ liệu liên kết chặt chẽ mà *đường đi giữa các thứ* mới là điều quan trọng — mạng xã hội, hệ thống gợi ý, hệ thống phát hiện gian lận tìm kiếm các chuỗi giao dịch đáng ngờ. Nhưng nó là thừa thãi, và thường chậm hơn, với dữ liệu phần lớn phẳng và hiếm khi cần duyệt qua quan hệ — bạn sẽ không mô hình hóa lịch sử đơn hàng thương mại điện tử đơn giản thành một graph chỉ vì về mặt kỹ thuật là có thể.

## Ngôn ngữ truy vấn: declarative vs. imperative, và vì sao nó quan trọng

Nửa còn lại của chương nói về *cách bạn hỏi* database điều mình muốn, và đây là chỗ cuốn sách vẽ ra một ranh giới mà trước đó tôi chưa từng nghĩ kỹ: **declarative** (khai báo) vs. **imperative** (mệnh lệnh) trong ngôn ngữ truy vấn.

SQL là declarative: bạn mô tả *kết quả bạn muốn là gì* ("cho tôi mọi user đăng ký trong tháng này"), và bạn hoàn toàn để database engine tự tìm cách đi lấy nó một cách hiệu quả. Lợi ích to lớn, thường vô hình ở đây: database được tự do trở nên thông minh hơn về phần "làm thế nào" theo thời gian — thêm index, đổi chiến lược thực thi, song song hóa công việc qua nhiều máy — mà bạn không bao giờ phải đụng vào query của mình. Code của bạn vẫn declarative và đúng trong khi phần bên trong của database tiến hóa bên dưới nó.

Cách tiếp cận imperative thay vào đó bắt *bạn* viết ra từng bước quy trình cụ thể — lặp qua từng bản ghi, kiểm tra một điều kiện, tự thu thập những cái khớp. Cách này cho bạn quyền kiểm soát chính xác, nhưng cũng đồng nghĩa giờ bạn chịu trách nhiệm cho hiệu quả của từng bước một, và nếu database đổi cách nó lưu dữ liệu bên trong, vòng lặp bạn tự viết tay có thể âm thầm trở thành con đường chậm trong khi mọi người khác dùng query declarative tự động hưởng lợi từ tối ưu hóa mới.

Phép so sánh đời thường tôi thấy thực sự hữu ích: bảo tài xế taxi "chở tôi ra sân bay" là declarative — bạn không quan tâm họ đi đường nào, và nếu hôm nay có đường thông minh hơn nhờ dữ liệu giao thông mới, bạn hưởng lợi ngay lập tức mà không cần đổi chỉ dẫn của mình. Tự mình đọc chỉ dẫn từng khúc rẽ cho họ là imperative — chính xác, nhưng giờ *bạn* là người chịu trách nhiệm nếu có đường thông minh hơn mà bạn không biết tới.

## Vì sao tôi nghĩ chương này quan trọng cho những gì tiếp theo

Chương này thực chất chính là quyết định "chọn data model" mà mọi chương sau đó âm thầm giả định là đã được đưa ra rồi. Khi cuốn sách sau này nói về chiến lược partitioning hay replication, những đánh đổi cụ thể nào áp dụng phụ thuộc rất nhiều vào việc bạn đang partition các dòng trong một bảng, các document trong một collection, hay các node trong một graph. Đọc chương này trước nghĩa là các chương sau, thiên về hệ thống phân tán hơn, có sẵn một "hình dạng dữ liệu" cụ thể để suy luận, thay vì một khái niệm mơ hồ, chung chung là "cái database" để nói chung chung vào đó.

</div>

---
title: "Paper Notes: What Goes Around Comes Around... And Around"
title_vi: "Ghi chú Paper: What Goes Around Comes Around... And Around"
date: 2026-09-14 10:05:00 +0700
excerpt: "Every few years someone says SQL is dead. It never is. Here's why, explained the way I wish someone had explained it to me."
excerpt_vi: "Cứ vài năm lại có người nói SQL sắp chết. Nó chưa bao giờ chết cả. Đây là lý do, giải thích theo cách tôi ước có người từng giải thích cho mình."
categories: [papers]
tags: ["Database Systems", "NoSQL", "NewSQL", "Database History"]
paper_title: "What Goes Around Comes Around... And Around"
paper_authors: "Michael Stonebraker, Andrew Pavlo — SIGMOD Record, Vol. 53, No. 2, June 2024"
paper_url: "https://db.cs.cmu.edu/papers/2024/whatgoesaround-sigmodrec2024.pdf"
---

<div data-lang-content="en" markdown="1">

*Paper: ["What Goes Around Comes Around... And Around"](https://db.cs.cmu.edu/papers/2024/whatgoesaround-sigmodrec2024.pdf) by Michael Stonebraker and Andrew Pavlo, published in SIGMOD Record, June 2024.*

I want to start with something that has nothing to do with databases. You've probably noticed that trends repeat themselves. Baggy jeans come back. Then skinny jeans come back. Someone always says "this is the future" about something that's secretly just an old idea with a new coat of paint. I used to think that was just a fashion thing, or maybe a music thing. It turns out it's also, very precisely, a *database* thing — and two professors just wrote a whole paper proving it.

Before I get into what the paper says, let me back up and explain what it's even about, because if you don't spend your life around databases, some of these words are just noise.

## Okay but what is a database, actually?

A database is just an organized place to store information so a computer can find and update it quickly. Think of a giant, extremely well-organized spreadsheet system. A "table" is one spreadsheet — say, a table called `Students` with columns like `name`, `grade`, `email`. A "relational database" (also called SQL, or RDBMS) is a system built entirely around this idea: everything is a table, made of rows and columns, and tables can link to each other. For example, a `Grades` table might reference a `student_id` that points back to a row in the `Students` table, instead of copying the student's whole name and email into every single grade record.

**SQL** is the language you use to *ask* the database questions, like "give me every student with a grade above 90" or "find all orders placed last week." It's been around since the 1970s, and — this is the whole point of the paper — it has refused to die, no matter how many times people have tried to replace it.

## The pattern: everyone declares SQL dead, then it comes back stronger

Roughly every decade, some new approach to storing data shows up, gets hyped as "the thing that finally kills SQL and tables," takes over a chunk of the industry for a while... and then slowly, quietly, grows SQL-like features back onto itself until it basically *is* SQL again, just with extra steps. The paper walks through eight of these waves and shows the exact same story playing out over and over. Here are the ones I found easiest to picture:

- **MapReduce (the thing behind Hadoop).** Google built this around 2003 to process its web crawl — basically, "here's a pile of files, run this program over all of them and collect the results." No tables, no SQL, just write code that processes data directly. For a while this was *the* hot new way to handle "big data." Then reality set in: writing raw code for every single question you want to ask is slow to develop and hard to optimize. By 2014 Google had killed MapReduce internally, and the tools that survived it (Spark, Flink) only survived by bolting SQL support back on top.
- **Document databases, like MongoDB.** The pitch here was "SQL and joining tables together is slow — just shove everything into one flexible blob (called a JSON document) instead." For years, "NoSQL" literally meant "not SQL, and proud of it." But by 2021, MongoDB had quietly added a SQL-like query option *and* the strict correctness guarantees (called ACID transactions) that "NoSQL" was originally invented to avoid. The paper predicts document databases and SQL databases will eventually be almost impossible to tell apart.
- **Column-family stores, like Google's BigTable, Cassandra, and HBase.** These were built to handle huge, messy datasets without the "expensive" parts of a real database — no table joins, no extra indexes to speed up searches. Handy at first, painful later, because eventually people *needed* those things and had to bolt SQL-like query languages onto these systems anyway (Cassandra added one called CQL).
- **Vector databases — the hot thing right now, in 2026.** These store "embeddings," which are just long lists of numbers that AI models generate to represent the *meaning* of a piece of text or an image, so you can search by "things that mean something similar" instead of "things that match this exact word." The paper's prediction, made in 2024, was that regular SQL databases would just add this as a feature instead of a whole new category of product surviving on its own — and that's basically already happened; most mainstream databases now have a vector search add-on.

If you squint, the pattern is always the same shape: someone gets frustrated with SQL's rules and builds something looser and faster. Developers love it at first because it's simpler to start with. Then, as the project grows, people keep needing the exact things SQL already solved — a way to ask complex questions without writing custom code for each one, and a way to avoid storing the same piece of information in five different places (which is exactly what tables-with-relationships were invented to prevent, back in the 1970s). So the "SQL replacement" grows SQL-shaped features until it isn't really a replacement anymore.

## The part that actually did change: not the idea, the machinery

Here's the twist, and honestly the part I found more interesting than the "SQL never dies" headline: while the *idea* of tables-and-SQL barely changed in 50 years, *how databases are actually built under the hood* changed enormously. A few examples the paper walks through:

- **Storing data by column instead of by row.** Imagine a spreadsheet with a million rows and 50 columns, and you only ever ask questions about 3 of those columns at a time (like "what's the average price across all orders"). A traditional database reads whole rows off disk even if you only need 3 columns out of 50 — wasteful. Column-oriented storage physically groups all the values for one column together, so a question that only touches 3 columns only has to read those 3 columns' worth of data. This one change is why almost every big analytics/data-warehouse product switched to this design over the last twenty years.
- **Splitting "compute" away from "storage" in the cloud.** In an old-school setup, the machine doing the calculations and the disk holding the data are the same physical box. In modern cloud databases, they're separated — your data sits in cheap, durable cloud storage, and you can spin up more or fewer "worker" machines to process it depending on how busy you are, without moving the data around. Funnily enough, the paper points out that this idea ("shared storage that multiple compute machines can use") was tried decades ago and considered a *bad* idea back then, because networks were too slow. Now that networks are fast enough, the old "bad" idea works great. Even good ideas need the right hardware moment to succeed.
- **Data lakes.** Instead of locking your data inside one company's proprietary database format, you store it as plain files in open formats (like Parquet) that any tool can read — a spreadsheet program, a Python data-science script, or a SQL query engine, whichever you need that day.
- **NewSQL**, an attempt to combine "scales to huge size like NoSQL" with "still behaves like a normal reliable SQL database," never really took off the way people expected — not because the idea was bad, but because the part of a company's tech stack that handles *orders and payments* (called OLTP) is the part everyone is most terrified to touch. If your analytics dashboard breaks for an hour, that's annoying. If your payment system breaks for an hour, that's a business emergency. People stick with what's already proven there.

## The line I keep thinking about

> "Never underestimate the value of good marketing for bad products."

The authors say this almost as a warning label. Their advice, once you strip the academic language off it, is stuff I think is genuinely useful for anyone starting out in tech, not just database people:

1. **Be suspicious of tools that started as someone's internal side project.** A bunch of today's popular open-source database tools began as an in-house tool built by engineers at one company who didn't necessarily have deep database expertise, and were only later released to the public. That doesn't automatically make them bad — but it means the polish and edge-case handling that comes from years of real database engineering might genuinely be missing.
2. **Don't underestimate how much "it just works out of the box" matters.** Tools like DuckDB got popular partly because you can start using them in ten seconds, with zero setup, compared to traditional databases where you have to create a database, define your tables, and *then* finally load your data.
3. **New query languages rarely succeed because of syntax.** The actual hard part of building a database was never "what words do you type" — it's the *query optimizer*, the invisible part that figures out the fastest way to actually run your question. That takes years, sometimes decades, to get right, and a shiny new syntax doesn't skip that step.

## Why this stuck with me

I went into this expecting a dry history lesson and came out with something closer to a filter I can apply the next time I see a headline about some brand-new database technology promising to replace everything that came before it. The healthy reaction isn't "wow, SQL is finally dead" — it's "okay, what specific problem does this solve, and how long until it quietly grows the same features SQL already has?" That's a much more useful question to ask, and it's one I plan to actually use the next time I'm evaluating a new tool at work instead of just going with whatever's trending.

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["What Goes Around Comes Around... And Around"](https://db.cs.cmu.edu/papers/2024/whatgoesaround-sigmodrec2024.pdf) của Michael Stonebraker và Andrew Pavlo, đăng trên SIGMOD Record, tháng 6/2024.*

Tôi muốn bắt đầu bằng một chuyện chẳng liên quan gì đến database. Chắc bạn cũng để ý là các trào lưu cứ lặp đi lặp lại. Quần ống rộng quay lại. Rồi quần bó lại quay lại. Lúc nào cũng có ai đó bảo "cái này chính là tương lai" về một thứ mà thật ra chỉ là ý tưởng cũ khoác áo mới. Tôi từng nghĩ đó chỉ là chuyện thời trang, hoặc âm nhạc. Hóa ra nó cũng đúng y hệt với... database — và hai vị giáo sư vừa viết hẳn một bài nghiên cứu để chứng minh điều đó.

Trước khi đi vào nội dung paper, để tôi giải thích qua nó nói về cái gì, vì nếu bạn không sống cùng database mỗi ngày thì mấy từ này nghe khá là mơ hồ.

## Database thật ra là cái gì?

Database chỉ đơn giản là một nơi lưu trữ thông tin được sắp xếp gọn gàng để máy tính có thể tìm và cập nhật thật nhanh. Hãy tưởng tượng nó như một hệ thống bảng tính (spreadsheet) khổng lồ, được tổ chức cực kỳ ngăn nắp. Một "table" (bảng) giống như một trang tính — ví dụ bảng `Students` với các cột `tên`, `lớp`, `email`. Một "relational database" (còn gọi là SQL, hay RDBMS) là hệ thống được xây dựng hoàn toàn quanh ý tưởng này: mọi thứ đều là bảng, gồm hàng và cột, và các bảng có thể liên kết với nhau. Ví dụ, bảng `Điểm số` có thể chỉ tham chiếu đến `student_id` trỏ về một dòng trong bảng `Students`, thay vì phải chép nguyên tên và email của học sinh vào từng bản ghi điểm.

**SQL** là ngôn ngữ bạn dùng để *hỏi* database, kiểu như "cho tôi tất cả học sinh có điểm trên 90" hoặc "tìm mọi đơn hàng đặt tuần trước." Nó đã tồn tại từ thập niên 1970, và — đây chính là trọng tâm của cả bài paper — nó nhất quyết không chịu chết, dù người ta đã cố thay thế nó bao nhiêu lần đi nữa.

## Cái pattern: ai cũng tuyên bố SQL đã chết, rồi nó lại quay về mạnh hơn

Cứ khoảng mỗi thập kỷ, lại có một cách lưu trữ dữ liệu mới xuất hiện, được thổi phồng là "thứ sẽ giết chết SQL và các bảng dữ liệu mãi mãi," chiếm lĩnh một phần ngành công nghiệp trong một thời gian... rồi từ từ, âm thầm, nó lại mọc ra các tính năng giống SQL cho đến khi về cơ bản nó *lại chính là SQL*, chỉ là đi đường vòng hơn thôi. Paper đi qua tám làn sóng như vậy và cho thấy đúng một câu chuyện lặp lại hoài. Đây là vài ví dụ tôi thấy dễ hình dung nhất:

- **MapReduce (thứ đứng sau Hadoop).** Google xây cái này khoảng năm 2003 để xử lý dữ liệu crawl web của họ — về cơ bản là "đây là một đống file, chạy chương trình này lên tất cả rồi gom kết quả lại." Không có bảng, không có SQL, chỉ có viết code xử lý dữ liệu trực tiếp. Có một thời gian đây là cách "hot" nhất để xử lý "big data." Rồi thực tế ập đến: viết code riêng cho từng câu hỏi bạn muốn hỏi thì phát triển chậm và rất khó tối ưu. Đến 2014, Google đã khai tử MapReduce trong nội bộ, và những công cụ sống sót sau nó (Spark, Flink) chỉ sống được nhờ gắn thêm hỗ trợ SQL lên trên.
- **Document database, như MongoDB.** Lời quảng bá ở đây là "SQL và việc join bảng với nhau chậm lắm — cứ nhét hết mọi thứ vào một khối linh hoạt (gọi là JSON document) là xong." Trong nhiều năm, "NoSQL" nghĩa đen là "không phải SQL, và tự hào vì điều đó." Nhưng đến 2021, MongoDB đã âm thầm thêm một kiểu truy vấn giống SQL *và* cả các đảm bảo đúng đắn nghiêm ngặt (gọi là transaction ACID) mà "NoSQL" ban đầu được sinh ra để tránh. Paper dự đoán document database và SQL database rồi sẽ gần như không thể phân biệt được nữa.
- **Column-family store, như BigTable của Google, Cassandra, và HBase.** Những hệ này được xây để xử lý dữ liệu khổng lồ, lộn xộn mà không cần các phần "tốn kém" của một database thật sự — không join bảng, không thêm index để tìm kiếm nhanh hơn. Ban đầu thì tiện, sau đó thì đau đầu, vì cuối cùng người ta lại *cần* đúng những thứ đó và phải gắn thêm ngôn ngữ truy vấn kiểu SQL vào (Cassandra thêm một cái gọi là CQL).
- **Vector database — thứ đang hot nhất hiện tại, năm 2026.** Những hệ này lưu "embedding," chỉ đơn giản là một dãy số dài mà các mô hình AI tạo ra để đại diện cho *ý nghĩa* của một đoạn văn bản hay một hình ảnh, để bạn có thể tìm kiếm theo kiểu "những thứ có ý nghĩa tương tự" thay vì "những thứ khớp đúng từ này." Dự đoán của paper, được đưa ra năm 2024, là các database SQL thông thường sẽ chỉ thêm cái này như một tính năng thay vì để nó tồn tại như một loại sản phẩm hoàn toàn mới — và điều đó gần như đã thành sự thật; hầu hết database phổ biến hiện giờ đều có thêm tính năng tìm kiếm vector.

Nếu nhìn kỹ, pattern lúc nào cũng có cùng một hình dạng: có người chán SQL vì nó quá nhiều luật lệ nên xây một thứ lỏng lẻo hơn, nhanh hơn. Developer thích nó lúc đầu vì dễ bắt đầu. Rồi khi dự án lớn dần, người ta lại cần đúng những thứ SQL đã giải quyết từ trước — một cách để hỏi những câu phức tạp mà không phải viết code riêng cho từng câu, và một cách để tránh lưu cùng một thông tin ở năm chỗ khác nhau (chính là thứ mà bảng-có-liên-kết được phát minh ra để ngăn chặn, từ thập niên 1970). Thế nên "thứ thay thế SQL" cứ mọc dần các tính năng giống-SQL cho đến khi nó không còn là một sự thay thế thật sự nữa.

## Phần thật sự có thay đổi: không phải ý tưởng, mà là bộ máy bên dưới

Đây là cú twist, và thành thật mà nói phần này tôi thấy thú vị hơn cả cái tiêu đề "SQL không bao giờ chết": trong khi *ý tưởng* về bảng-và-SQL gần như không đổi suốt 50 năm, thì *cách database thực sự được xây dựng bên dưới* lại thay đổi cực kỳ nhiều. Vài ví dụ paper đi qua:

- **Lưu dữ liệu theo cột thay vì theo hàng.** Tưởng tượng một bảng tính triệu dòng, 50 cột, mà bạn chỉ luôn hỏi về 3 trong số 50 cột đó thôi (kiểu "giá trung bình của mọi đơn hàng là bao nhiêu"). Một database truyền thống đọc cả dòng dữ liệu từ đĩa dù bạn chỉ cần 3/50 cột — rất lãng phí. Lưu theo cột thì nhóm vật lý tất cả giá trị của một cột lại với nhau, nên một câu hỏi chỉ đụng tới 3 cột thì chỉ cần đọc đúng lượng dữ liệu của 3 cột đó thôi. Chỉ riêng thay đổi này là lý do gần như mọi sản phẩm phân tích/data-warehouse lớn đã chuyển sang thiết kế này trong hai thập kỷ qua.
- **Tách "compute" (tính toán) ra khỏi "storage" (lưu trữ) trên cloud.** Trong một hệ thống kiểu cũ, máy tính toán và ổ đĩa chứa dữ liệu là cùng một cái máy vật lý. Trong database cloud hiện đại, hai thứ này tách rời — dữ liệu của bạn nằm trong kho lưu trữ cloud rẻ và bền, còn bạn có thể bật thêm hoặc tắt bớt máy "worker" để xử lý nó tùy lúc bận rộn cỡ nào, mà không cần di chuyển dữ liệu đi đâu cả. Buồn cười là paper chỉ ra rằng ý tưởng này ("nhiều máy compute cùng dùng chung một kho lưu trữ") từng được thử từ hàng chục năm trước và bị xem là ý tưởng *tồi*, vì lúc đó mạng còn quá chậm. Giờ mạng đã đủ nhanh, ý tưởng "tồi" ngày xưa lại chạy rất tốt. Ngay cả ý tưởng hay cũng cần đúng thời điểm phần cứng để thành công.
- **Data lake.** Thay vì khóa dữ liệu của bạn trong định dạng độc quyền của một database công ty nào đó, bạn lưu nó dưới dạng file thường, theo định dạng mở (như Parquet) mà công cụ nào cũng đọc được — một chương trình bảng tính, một script Python cho data science, hay một engine truy vấn SQL, tùy hôm đó bạn cần gì.
- **NewSQL**, nỗ lực kết hợp "mở rộng quy mô khổng lồ như NoSQL" với "vẫn hoạt động đáng tin cậy như một SQL database bình thường," chưa bao giờ thực sự bùng nổ như người ta kỳ vọng — không phải vì ý tưởng tồi, mà vì phần trong hệ thống công ty xử lý *đơn hàng và thanh toán* (gọi là OLTP) là phần mà ai cũng sợ động vào nhất. Nếu dashboard phân tích của bạn hỏng một tiếng, thì phiền thôi. Nếu hệ thống thanh toán hỏng một tiếng, đó là khủng hoảng kinh doanh thật sự. Người ta cứ bám lấy thứ đã được chứng minh ở đó.

## Câu tôi cứ nghĩ mãi

> "Đừng bao giờ đánh giá thấp giá trị của marketing giỏi cho những sản phẩm tồi."

Các tác giả nói câu này gần như một lời cảnh báo. Lời khuyên của họ, một khi bỏ hết lớp ngôn ngữ học thuật đi, là những thứ tôi nghĩ thật sự hữu ích cho bất kỳ ai mới vào ngành công nghệ, không chỉ dân database:

1. **Cẩn thận với những công cụ khởi đầu là dự án nội bộ của ai đó.** Rất nhiều công cụ database mã nguồn mở phổ biến hiện nay từng bắt đầu là công cụ nội bộ do kỹ sư ở một công ty nào đó xây, không nhất thiết có chuyên môn sâu về database, rồi sau đó mới được công khai ra ngoài. Điều đó không tự động khiến chúng tồi — nhưng nghĩa là sự tinh chỉnh và xử lý các trường hợp biên đến từ nhiều năm kinh nghiệm xây database thật sự có thể vẫn còn thiếu.
2. **Đừng xem nhẹ việc "vừa mở ra là dùng được ngay" quan trọng đến mức nào.** Các công cụ như DuckDB trở nên phổ biến một phần vì bạn có thể bắt đầu dùng nó trong mười giây, không cần setup gì, so với database truyền thống nơi bạn phải tạo database, định nghĩa bảng, rồi *mới* cuối cùng nạp dữ liệu vào.
3. **Ngôn ngữ truy vấn mới hiếm khi thành công nhờ cú pháp.** Phần khó thật sự khi xây một database chưa bao giờ là "gõ chữ gì" — mà là *query optimizer*, phần vô hình tìm ra cách nhanh nhất để thực sự chạy câu hỏi của bạn. Việc đó cần nhiều năm, có khi hàng chục năm, để làm cho đúng, và một cú pháp mới lấp lánh không thể nhảy cóc qua bước đó được.

## Vì sao bài này khiến tôi suy nghĩ

Tôi đọc bài này với kỳ vọng một bài lịch sử khô khan, và kết thúc với một thứ giống như một bộ lọc tôi có thể dùng lần sau khi thấy tiêu đề về một công nghệ database hoàn toàn mới hứa hẹn thay thế mọi thứ trước đó. Phản ứng lành mạnh không phải là "ồ, SQL cuối cùng cũng chết rồi" — mà là "được, vậy nó giải quyết đúng vấn đề gì, và bao lâu nữa nó sẽ âm thầm mọc ra đúng những tính năng SQL đã có sẵn?" Đó là một câu hỏi hữu ích hơn nhiều để hỏi, và tôi định thật sự dùng nó lần tới khi đánh giá một công cụ mới ở chỗ làm, thay vì chỉ chạy theo thứ đang trend.

</div>

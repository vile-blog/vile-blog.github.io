---
title: "Paper Notes: What Goes Around Comes Around... And Around"
title_vi: "Ghi chú Paper: What Goes Around Comes Around... And Around"
date: 2026-09-14 10:05:00 +0700
excerpt: "Stonebraker & Pavlo's 20-years-later sequel argues every NoSQL rebellion eventually grows back into SQL. My notes on why, and what actually changed instead."
excerpt_vi: "Bài viết nối tiếp sau 20 năm của Stonebraker & Pavlo lập luận rằng mọi cuộc 'nổi loạn' NoSQL rồi cũng quay về với SQL. Ghi chú của tôi về lý do, và thứ thật sự đã thay đổi."
categories: [papers]
tags: ["Database Systems", "NoSQL", "NewSQL", "Database History"]
paper_title: "What Goes Around Comes Around... And Around"
paper_authors: "Michael Stonebraker, Andrew Pavlo — SIGMOD Record, Vol. 53, No. 2, June 2024"
paper_url: "https://db.cs.cmu.edu/papers/2024/whatgoesaround-sigmodrec2024.pdf"
---

<div data-lang-content="en" markdown="1">

*Paper: ["What Goes Around Comes Around... And Around"](https://db.cs.cmu.edu/papers/2024/whatgoesaround-sigmodrec2024.pdf) — Michael Stonebraker & Andrew Pavlo, SIGMOD Record, June 2024. A 20-years-later sequel to Stonebraker & Hellerstein's 2005 "What Goes Around Comes Around".*

This one is less a systems paper and more a 20-year retrospective, and I read it as a map of every database trend I've heard people get excited about — MapReduce, NoSQL, NewSQL, vector databases, blockchain DBs — with a single question applied to each: *did it replace the relational model, or did it just get absorbed by it?*

## The pattern, stated up front

The authors' thesis is blunt: every category that set out to replace SQL/the relational model has instead either (a) died off, (b) shrunk into a niche, or (c) grown a SQL interface and drifted back toward looking like an RDBMS. They walk eight data models (MapReduce, key-value, document, column-family, text search, array, vector, graph) through this lens, and the same shape shows up over and over.

A few examples that made the pattern click for me:

- **MapReduce/Hadoop** — pitched as the schema-free alternative to data warehouses, it's now essentially dead; even Google moved its own crawl pipeline off MapReduce in 2010 and killed it internally by 2014. What survived (Spark, Flink) survived by *adding* SQL support, not by staying procedural.
- **Document databases (MongoDB et al.)** — "NoSQL" originally meant "SQL and joins are slow, don't use them" and "transactions are unnecessary." By 2021 MongoDB had added both SQL-ish querying and ACID transactions. The paper's line is that the differences between document and relational systems "should become nearly indistinguishable in the future."
- **Column-family stores (BigTable, Cassandra, HBase)** — copied BigTable's no-joins, no-secondary-indexes design, then spent the next decade adding SQL-like fronts (CQL, Phoenix) back on top.
- **Vector databases** — the current hype category, and the paper predicts the same arc: they're "essentially document-oriented DBMSs with specialized ANN indexes," and RDBMSs added `pgvector`-style extensions within about a year of ChatGPT's release. The specialized index is a feature, the authors argue, not a reason for a whole new system.

The throughline: developers keep rejecting SQL for being slow or rigid, then the *query language* comes back because record-at-a-time APIs don't compose and don't optimize, and the *data model* comes back because ad-hoc denormalized nesting reintroduces the exact 1970s join/redundancy problems relational normalization was invented to solve.

## What genuinely *did* change: architecture, not data model

The more interesting half of the paper, for me, is the second part, where the authors concede that while the relational *model* barely moved, the *implementations* changed enormously — and this is where I think the real engineering lessons are:

- **Columnar storage** took over the entire data warehouse market because it compresses better (single value type per block) and lets a vectorized engine process a whole column at once instead of a row at a time.
- **Cloud / disaggregated storage** — separating compute from storage over the network (rather than direct-attached disk) enables per-query elasticity and reassigning idle compute. The authors call this "what goes around comes around" too: shared-disk architectures were historically considered a bad idea, and they're back because networking got fast enough to make the tradeoff work.
- **Data lakes / lakehouses** — replacing the "load data into the DBMS's proprietary format" model with open file formats (Parquet, ORC, Iceberg) that any engine can read, because ML workflows live in Python dataframes, not SQL clients.
- **NewSQL** never had the uptake people expected — not because the idea was wrong, but because OLTP is the part of the stack companies are most risk-averse about touching. An OLAP failure inconveniences an analyst; an OLTP failure stops revenue.

## The line that stuck with me

> "Never underestimate the value of good marketing for bad products."

The paper's parting advice reads like hard-won scar tissue: watch for DBMSs that started as an internal tool at a company with no DBMS expertise (their examples: several Apache projects that began as in-house tools before being open-sourced); don't ignore the "out-of-box experience" that made DuckDB and Python notebooks popular over "create a database, then define your tables" friction; and be skeptical of new query languages, because the actual bottleneck in adopting them was never syntax, it was the query optimizer, and optimizers take decades to mature.

## Why I filed this as a "papers" note and not just a link

Reading this alongside the Aurora and Aurora DSQL papers I'm also working through was useful: this survey is basically the "why" for the architecture choices those papers make. Aurora and DSQL don't reinvent the relational model or SQL — they're aggressively conventional on that front (DSQL literally embeds PostgreSQL's query engine). What they innovate on is exactly the "system architecture" bucket this paper calls out: disaggregating storage from compute, and rethinking replication for the cloud. That's a useful lens to carry into the next two notes.

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["What Goes Around Comes Around... And Around"](https://db.cs.cmu.edu/papers/2024/whatgoesaround-sigmodrec2024.pdf) — Michael Stonebraker & Andrew Pavlo, SIGMOD Record, tháng 6/2024. Bài viết nối tiếp sau 20 năm của bài "What Goes Around Comes Around" (2005) của Stonebraker & Hellerstein.*

Đây không hẳn là một paper hệ thống mà giống một bài tổng kết 20 năm hơn, và tôi đọc nó như một tấm bản đồ của mọi trào lưu database mà mình từng nghe người ta hào hứng nói tới — MapReduce, NoSQL, NewSQL, vector database, blockchain DB — với đúng một câu hỏi áp cho từng cái: *nó có thay thế được relational model không, hay cuối cùng lại bị relational model nuốt chửng?*

## Cái pattern được nêu ngay từ đầu

Luận điểm của tác giả rất thẳng thắn: mọi trào lưu từng đặt mục tiêu thay thế SQL/relational model rốt cuộc đều rơi vào một trong ba kịch bản: (a) chết hẳn, (b) co lại thành một thị trường ngách, hoặc (c) mọc thêm một giao diện SQL rồi trôi dần về hình dáng của một RDBMS. Họ đi qua tám data model (MapReduce, key-value, document, column-family, text search, array, vector, graph) dưới lăng kính này, và cái hình dáng đó cứ lặp lại hoài.

Vài ví dụ khiến pattern này "click" trong đầu tôi:

- **MapReduce/Hadoop** — từng được quảng bá là giải pháp không cần schema thay cho data warehouse, giờ gần như đã chết; ngay cả Google cũng chuyển pipeline crawl của họ khỏi MapReduce từ 2010 và khai tử nội bộ vào 2014. Những cái sống sót (Spark, Flink) sống được là nhờ *thêm* hỗ trợ SQL, chứ không phải nhờ giữ nguyên phong cách procedural.
- **Document database (MongoDB và các hệ tương tự)** — "NoSQL" ban đầu nghĩa là "SQL và join chậm lắm, đừng dùng" và "transaction là thứ không cần thiết." Đến 2021, MongoDB đã thêm cả truy vấn kiểu SQL lẫn transaction ACID. Paper nhận định rằng khác biệt giữa hệ document và hệ relational "rồi sẽ gần như không còn phân biệt được trong tương lai."
- **Column-family store (BigTable, Cassandra, HBase)** — sao chép thiết kế không-join, không-secondary-index của BigTable, rồi dành cả thập kỷ sau đó gắn thêm giao diện kiểu SQL (CQL, Phoenix) lên trên.
- **Vector database** — trào lưu hot nhất hiện tại, và paper dự đoán nó sẽ đi đúng quỹ đạo cũ: về bản chất chúng là "các DBMS hướng document với chỉ mục ANN chuyên biệt," và các RDBMS đã thêm phần mở rộng kiểu `pgvector` chỉ trong vòng khoảng một năm sau khi ChatGPT ra mắt. Theo các tác giả, chỉ mục chuyên biệt là một tính năng, không phải lý do để tạo hẳn một hệ thống mới.

Sợi chỉ xuyên suốt: developer cứ liên tục từ chối SQL vì cho là chậm hoặc cứng nhắc, rồi *ngôn ngữ truy vấn* lại quay về vì các API kiểu record-at-a-time không compose được và không tối ưu được, còn *data model* quay về vì việc lồng dữ liệu phi chuẩn hóa tùy tiện lại tái tạo đúng những vấn đề join/dư thừa dữ liệu của thập niên 1970 mà chuẩn hóa quan hệ từng được sinh ra để giải quyết.

## Cái thật sự *có* thay đổi: kiến trúc, không phải data model

Nửa sau của paper, với tôi, thú vị hơn — nơi các tác giả thừa nhận rằng dù *model* quan hệ gần như không nhúc nhích, *cách triển khai* lại thay đổi cực kỳ mạnh — và đây mới là chỗ tôi thấy có bài học kỹ thuật thật sự:

- **Lưu trữ dạng cột (columnar)** đã thống trị toàn bộ thị trường data warehouse vì nén tốt hơn (mỗi block chỉ chứa một kiểu giá trị) và cho phép một engine vectorized xử lý cả một cột cùng lúc thay vì từng dòng một.
- **Cloud / lưu trữ tách rời (disaggregated)** — tách compute khỏi storage qua mạng (thay vì đĩa gắn trực tiếp) giúp co giãn tài nguyên theo từng truy vấn và tái phân bổ compute nhàn rỗi. Các tác giả cũng gọi đây là "cái gì đi rồi cũng quay lại": kiến trúc shared-disk từng bị xem là ý tưởng tồi, và giờ nó quay lại vì mạng đã đủ nhanh để phép đánh đổi này thật sự hiệu quả.
- **Data lake / lakehouse** — thay thế mô hình "nạp dữ liệu vào định dạng độc quyền của DBMS" bằng các định dạng file mở (Parquet, ORC, Iceberg) mà engine nào cũng đọc được, vì các pipeline ML sống trong dataframe của Python, không phải trong SQL client.
- **NewSQL** chưa bao giờ được đón nhận như kỳ vọng — không phải vì ý tưởng sai, mà vì OLTP là phần trong stack mà các công ty ngại rủi ro nhất khi động vào. Một lỗi OLAP chỉ gây bất tiện cho một analyst; một lỗi OLTP làm dừng doanh thu.

## Câu khiến tôi nhớ nhất

> "Đừng bao giờ đánh giá thấp giá trị của marketing giỏi cho những sản phẩm tồi."

Lời khuyên chốt lại của paper đọc như những vết sẹo được đúc kết từ kinh nghiệm xương máu: cẩn thận với những DBMS khởi đầu là công cụ nội bộ ở một công ty vốn không có chuyên môn về DBMS (ví dụ họ đưa ra: một loạt dự án Apache từng là công cụ nội bộ trước khi được mở mã nguồn); đừng xem nhẹ "trải nghiệm ngay khi mở ra dùng" — thứ đã khiến DuckDB và Python notebook trở nên phổ biến hơn hẳn so với việc phải "tạo database rồi định nghĩa bảng" đầy ma sát; và hãy hoài nghi với các ngôn ngữ truy vấn mới, vì điểm nghẽn thật sự khi áp dụng chúng chưa bao giờ là cú pháp, mà là bộ tối ưu truy vấn — thứ cần hàng chục năm để trưởng thành.

## Vì sao tôi xếp bài này vào mục "papers" thay vì chỉ dán link

Đọc bài này song song với hai paper Aurora và Aurora DSQL tôi cũng đang tìm hiểu khá hữu ích: bài khảo sát này về cơ bản là câu trả lời cho "tại sao" đằng sau các lựa chọn kiến trúc của hai paper kia. Aurora và DSQL không phát minh lại relational model hay SQL — ở khía cạnh này chúng cực kỳ truyền thống (DSQL thậm chí nhúng thẳng query engine của PostgreSQL). Thứ chúng đổi mới đúng là nhóm "kiến trúc hệ thống" mà paper này chỉ ra: tách storage khỏi compute, và nghĩ lại cách replicate cho môi trường cloud. Đó là một góc nhìn hữu ích để mang theo sang hai ghi chú tiếp theo.

</div>

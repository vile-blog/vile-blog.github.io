---
title: "Paper Notes: ClickHouse — Lightning Fast Analytics for Everyone"
title_vi: "Ghi chú Paper: ClickHouse — Lightning Fast Analytics for Everyone"
date: 2026-09-14 10:20:00 +0700
excerpt: "ClickHouse treats every LSM 'level' as equal, skips write-ahead logging entirely, and still calls itself ACID-adjacent. My notes on the tradeoffs behind its speed."
excerpt_vi: "ClickHouse coi mọi 'level' của LSM là ngang hàng, bỏ hẳn write-ahead log, và vẫn tự nhận là 'gần như ACID'. Ghi chú của tôi về các đánh đổi đằng sau tốc độ của nó."
categories: [papers]
tags: ["ClickHouse", "OLAP", "Columnar Storage", "Query Execution"]
paper_title: "ClickHouse - Lightning Fast Analytics for Everyone"
paper_authors: "Schulze, Schreiber, Yatsishin, Dahimene, Milovidov — ClickHouse Inc., PVLDB Vol. 17, No. 12, 2024"
paper_url: "https://doi.org/10.14778/3685800.3685802"
---

<div data-lang-content="en" markdown="1">

*Paper: ["ClickHouse - Lightning Fast Analytics for Everyone"](https://doi.org/10.14778/3685800.3685802) — Schulze et al., ClickHouse Inc., VLDB 2024.*

Of the four papers in this batch, this is the one about a system I'd actually used before reading the paper — mostly for dashboards — without understanding *why* it felt so different from a row store under load. Reading the architecture paper filled in a lot of "oh, that's why" moments.

## The storage engine treats an LSM tree's "levels" as unnecessary

ClickHouse's `MergeTree*` family is LSM-tree-inspired but makes one structural change I hadn't seen elsewhere: instead of organizing parts (the immutable on-disk units created by each insert) into levels the way classic LSM trees do, **all parts are treated as equal**, and a background job can merge any set of them together once they cross a size threshold. The tradeoff this creates: because there's no implicit chronological ordering from a level hierarchy anymore, updates and deletes can't rely on the usual tombstone-at-a-higher-level trick — ClickHouse needs separate mechanisms for that (more below). In exchange, merges aren't constrained to same-level parts, which seems to give more scheduling freedom to the background merge process.

The other detail that surprised me: **ClickHouse writes inserts directly to disk and has no write-ahead log**, unlike most LSM-based stores. It leans on parts themselves being the durability unit. Combined with the fact that ClickHouse doesn't force `fsync` on new parts by default, the paper is refreshingly upfront that this trades a small risk of data loss on power failure for insert throughput — and that this is a deliberate call because their target workloads (observability, analytics) tolerate that risk far better than an OLTP workload would.

## Data pruning is three separate mechanisms, not one

I'd only really known ClickHouse for being "fast," and the paper breaks that down into three distinct pruning layers that each solve a different shape of query:

1. **Primary key index** — sparse (one entry per 8,192-row "granule," not per row), so a table of 8.1 million rows can be indexed in ~1,000 entries and kept fully in memory. Good for equality/range predicates on the sort-order columns.
2. **Projections** — literally a second copy of the table, sorted by a different key, populated lazily from new inserts. This is the "duplicate the data, keyed differently, to serve a different query shape" pattern — expensive in storage and merge overhead, but the optimizer picks between the main table and a projection based on estimated I/O cost automatically.
3. **Skipping indices** — lightweight metadata per block of granules (min/max values, small sets of unique values, or Bloom filters), for columns that aren't part of the sort key at all.

The mental model I came away with: primary key index handles "I sorted for this," projections handle "I expected to also query this way and pre-paid for it," and skipping indices handle "I didn't plan for this specific filter but can still avoid scanning garbage."

## Merge-time transformation instead of a separate ETL step

This is the part of the design I found most elegant. Rather than treating aggregation/rollups/archiving as a separate batch job outside the database, ClickHouse folds them into the same background merge process that's already combining parts:

- **Replacing merges** keep only the newest version of a row (by primary key), which doubles as a merge-time update mechanism.
- **Aggregating merges** combine partial aggregation states into materialized views *incrementally*, as each new part lands — not by re-scanning the whole source table on a schedule the way many databases refresh materialized views.
- **TTL merges** move, recompress, or delete a part wholesale once every row in it ages past a threshold — checking a condition against the whole part rather than per-row, which the authors note is a deliberate simplification that still covers the vast majority of real aging policies.

None of this blocks concurrent inserts, because it all happens in the same background process that was already going to run.

## Their honest answer to "is it ACID?" — no, and here's exactly why

I appreciated that the paper doesn't dodge this. Queries run against a snapshot of parts taken at query start (an MVCC variant), so isolation is snapshot-like — but because a single statement can touch and create multiple parts, and the reference-counting scheme only prevents in-flight parts from being deleted (not from being atomically swapped as a set), the paper states plainly that statements aren't ACID-compliant in general — only in the narrow case where every concurrent write happens to land inside a single part. That's a genuinely different contract than Aurora DSQL's snapshot isolation, and it's the right one for the workload — most ClickHouse use cases are write-heavy analytics pipelines that already tolerate a small risk of losing the newest, not-yet-`fsync`'d rows, in exchange for ingest speed.

## Replication is Raft for coordination, not for data

Replication uses a small ensemble of "Keeper" processes (a from-scratch Raft implementation, drop-in-compatible with ZooKeeper) to maintain a **replication log** of state transitions (insert/merge/mutation/DDL) — but the log entries reference operations, and nodes replay them asynchronously, fetching actual part data peer-to-peer rather than shipping row data through consensus. Replicated tables are explicitly only *eventually* consistent as a result, with an option to wait for a quorum synchronously when a caller needs it. It's a good example of using consensus for exactly the coordination problem (who did what, in what order) and not routing bulk data through it.

## Vectorized execution, but with a hardware-detection twist

The query engine follows the MonetDB/X100 vectorized model (operators consume/produce chunks of rows, not one row at a time), which I'd seen before. What I hadn't seen: ClickHouse compiles multiple variants of hot inner loops — a portable scalar version, an auto-vectorized AVX2 version, a hand-written AVX-512 version — and picks the fastest one **at runtime** based on the CPU's `cpuid`. That's how they claim to run on hardware as old as 15 years while still getting full benefit from a modern server's instruction set, without needing separate builds.

## Why this one felt different from the two Aurora papers

Aurora and DSQL are both OLTP-shaped: the hard problem is coordinating conflicting writes safely and cheaply. ClickHouse barely has that problem — it optimizes for the opposite corner of the design space, where writes are mostly append-only and the hard problem is *reading* efficiently at petabyte scale with high concurrency. Reading all three back to back was a good reminder that "distributed database" isn't one design problem; OLTP and OLAP systems are solving almost disjoint sets of hard problems, and the architectures reflect that from the storage layer up.

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["ClickHouse - Lightning Fast Analytics for Everyone"](https://doi.org/10.14778/3685800.3685802) — Schulze et al., ClickHouse Inc., VLDB 2024.*

Trong bốn paper đợt này, đây là paper về hệ thống mà tôi thực sự đã dùng trước khi đọc — chủ yếu cho dashboard — mà không hiểu *vì sao* nó lại khác biệt đến vậy so với một row store khi chịu tải. Đọc paper kiến trúc đã lấp đầy khá nhiều khoảnh khắc kiểu "à, hóa ra là vì vậy."

## Storage engine coi các "level" của LSM tree là không cần thiết

Họ `MergeTree*` của ClickHouse lấy cảm hứng từ LSM tree nhưng có một thay đổi cấu trúc mà tôi chưa từng thấy ở đâu khác: thay vì tổ chức các part (đơn vị bất biến trên đĩa được tạo ra bởi mỗi lần insert) thành các level như LSM tree cổ điển, **mọi part được coi là ngang hàng**, và một job chạy nền có thể merge bất kỳ tập part nào lại với nhau khi chúng vượt một ngưỡng kích thước. Đánh đổi ở đây: vì không còn thứ tự thời gian ngầm định từ hệ thống phân cấp level nữa, update và delete không thể dựa vào chiêu tombstone-ở-level-cao-hơn thông thường — ClickHouse cần các cơ chế riêng cho việc đó (nói thêm bên dưới). Đổi lại, các lần merge không bị bó buộc phải cùng level, có vẻ giúp tiến trình merge nền linh hoạt hơn trong việc lên lịch.

Chi tiết khác khiến tôi bất ngờ: **ClickHouse ghi thẳng insert xuống đĩa và không có write-ahead log**, khác với hầu hết các store dựa trên LSM. Nó dựa vào chính các part để làm đơn vị đảm bảo durability. Kết hợp với việc ClickHouse mặc định không ép `fsync` cho part mới, paper thẳng thắn thừa nhận điều này đánh đổi một rủi ro nhỏ mất dữ liệu khi mất điện để lấy throughput ghi — và đây là một lựa chọn có chủ đích vì các workload mục tiêu của họ (observability, analytics) chịu được rủi ro đó tốt hơn nhiều so với một workload OLTP.

## Cắt tỉa dữ liệu (data pruning) là ba cơ chế riêng biệt, không phải một

Tôi vốn chỉ biết ClickHouse "nhanh," và paper bóc tách điều đó thành ba tầng pruning riêng biệt, mỗi tầng giải quyết một dạng truy vấn khác nhau:

1. **Primary key index** — thưa (sparse) (một entry cho mỗi "granule" 8.192 dòng, không phải mỗi dòng), nên một bảng 8,1 triệu dòng có thể được đánh index chỉ với khoảng 1.000 entry và giữ trọn trong bộ nhớ. Tốt cho các predicate bằng/khoảng trên các cột nằm trong thứ tự sort.
2. **Projection** — đúng nghĩa là một bản sao thứ hai của bảng, sắp xếp theo một key khác, được lấp đầy dần (lazily) từ các insert mới. Đây là kiểu pattern "nhân bản dữ liệu, key hóa khác đi, để phục vụ một dạng truy vấn khác" — tốn kém về storage và overhead merge, nhưng optimizer tự động chọn giữa bảng gốc và projection dựa trên chi phí I/O ước tính.
3. **Skipping index** — metadata nhẹ cho mỗi block granule (giá trị min/max, tập nhỏ các giá trị duy nhất, hoặc Bloom filter), dành cho các cột hoàn toàn không nằm trong sort key.

Mô hình tư duy tôi rút ra được: primary key index xử lý "tôi đã sort sẵn cho cái này," projection xử lý "tôi đã lường trước sẽ truy vấn kiểu này nên trả giá trước," còn skipping index xử lý "tôi không lường trước bộ lọc cụ thể này nhưng vẫn tránh được việc quét rác."

## Biến đổi ngay lúc merge thay vì một bước ETL riêng

Đây là phần thiết kế tôi thấy tinh tế nhất. Thay vì coi aggregation/rollup/archiving là một batch job riêng nằm ngoài database, ClickHouse gộp chúng vào chính tiến trình merge nền vốn đã đang gộp các part lại với nhau:

- **Replacing merge** chỉ giữ lại phiên bản mới nhất của một dòng (theo primary key), qua đó kiêm luôn vai trò cơ chế update-lúc-merge.
- **Aggregating merge** gộp các trạng thái aggregation từng phần vào materialized view *một cách tăng dần (incremental)*, ngay khi mỗi part mới xuất hiện — chứ không quét lại toàn bộ bảng nguồn theo lịch như nhiều database khác vẫn làm để refresh materialized view.
- **TTL merge** di chuyển, nén lại, hoặc xóa nguyên một part một khi mọi dòng trong đó đã quá một ngưỡng tuổi — kiểm tra điều kiện trên cả part thay vì từng dòng, điều mà các tác giả ghi nhận là một sự đơn giản hóa có chủ đích nhưng vẫn bao phủ phần lớn các chính sách "lão hóa" dữ liệu trong thực tế.

Không cái nào trong số này chặn insert đồng thời, vì tất cả đều diễn ra trong cùng tiến trình nền vốn dĩ đã chạy sẵn.

## Câu trả lời thẳng thắn của họ cho câu hỏi "có ACID không?" — không, và đây là lý do chính xác

Tôi đánh giá cao việc paper không né tránh chuyện này. Truy vấn chạy dựa trên một snapshot các part được chụp tại thời điểm bắt đầu truy vấn (một biến thể MVCC), nên isolation mang tính chất giống snapshot — nhưng vì một câu lệnh đơn lẻ có thể chạm vào và tạo ra nhiều part, và cơ chế đếm tham chiếu chỉ ngăn các part đang xử lý bị xóa (chứ không đảm bảo chúng được hoán đổi atomic như một tập hợp), paper nói thẳng rằng các câu lệnh nhìn chung không tuân thủ ACID — chỉ trong trường hợp hẹp là mọi ghi đồng thời tình cờ đều rơi vào cùng một part. Đây là một cam kết khác hẳn so với snapshot isolation của Aurora DSQL, và nó đúng đắn cho loại workload này — phần lớn use case của ClickHouse là các pipeline analytics nặng về ghi, vốn đã chấp nhận rủi ro nhỏ mất những dòng mới nhất chưa kịp `fsync`, để đổi lấy tốc độ nạp dữ liệu.

## Replication dùng Raft để điều phối, không phải để chuyển dữ liệu

Replication dùng một cụm nhỏ các tiến trình "Keeper" (một cài đặt Raft viết từ đầu, tương thích thay thế trực tiếp cho ZooKeeper) để duy trì một **replication log** ghi lại các bước chuyển trạng thái (insert/merge/mutation/DDL) — nhưng các entry trong log chỉ tham chiếu tới thao tác, và các node replay chúng bất đồng bộ, tự lấy dữ liệu part thật qua kết nối ngang hàng (peer-to-peer) thay vì đẩy dữ liệu dòng qua consensus. Vì vậy, các bảng replicated về bản chất chỉ *eventually* consistent, với tùy chọn chờ quorum đồng bộ khi bên gọi cần. Đây là một ví dụ hay về việc dùng consensus đúng cho bài toán điều phối (ai đã làm gì, theo thứ tự nào) chứ không dùng nó để chuyển dữ liệu khối lượng lớn.

## Thực thi vectorized, kèm một chiêu phát hiện phần cứng khá hay

Query engine đi theo mô hình vectorized của MonetDB/X100 (các operator tiêu thụ/tạo ra từng khối dòng, không phải từng dòng một), điều tôi đã từng thấy trước đây. Điều tôi chưa từng thấy: ClickHouse biên dịch nhiều phiên bản của các vòng lặp nóng (hot inner loop) — một bản scalar portable, một bản AVX2 tự động vectorize, một bản AVX-512 viết tay — rồi chọn bản nhanh nhất **ngay lúc chạy (runtime)** dựa trên `cpuid` của CPU. Đó là cách họ tuyên bố có thể chạy trên phần cứng cũ tới 15 năm mà vẫn tận dụng trọn vẹn tập lệnh của một server hiện đại, mà không cần build riêng cho từng loại.

## Vì sao bài này khác hẳn hai paper Aurora

Aurora và DSQL đều mang hình dáng OLTP: bài toán khó là điều phối các ghi xung đột một cách an toàn và rẻ. ClickHouse gần như không có bài toán đó — nó tối ưu cho góc đối lập của không gian thiết kế, nơi ghi chủ yếu là append-only và bài toán khó là *đọc* hiệu quả ở quy mô petabyte với độ đồng thời cao. Đọc cả ba bài liền nhau là một lời nhắc hay rằng "distributed database" không phải một bài toán thiết kế duy nhất; hệ OLTP và OLAP đang giải hai tập bài toán khó gần như tách biệt nhau, và kiến trúc phản ánh điều đó ngay từ tầng lưu trữ trở lên.

</div>

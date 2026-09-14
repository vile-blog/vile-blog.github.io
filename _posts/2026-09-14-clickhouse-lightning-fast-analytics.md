---
title: "Paper Notes: ClickHouse — Lightning Fast Analytics for Everyone"
title_vi: "Ghi chú Paper: ClickHouse — Lightning Fast Analytics for Everyone"
date: 2026-09-14 10:20:00 +0700
excerpt: "I'd used ClickHouse for dashboards for a while without knowing why it felt so different from a normal database. Turns out almost every part of it is built backwards on purpose."
excerpt_vi: "Tôi từng dùng ClickHouse cho dashboard một thời gian mà không hiểu vì sao nó khác hẳn database bình thường. Hóa ra gần như mọi phần của nó đều được xây 'ngược đời' một cách có chủ đích."
categories: [papers]
tags: ["ClickHouse", "OLAP", "Columnar Storage", "Query Execution"]
paper_title: "ClickHouse - Lightning Fast Analytics for Everyone"
paper_authors: "Schulze, Schreiber, Yatsishin, Dahimene, Milovidov — ClickHouse Inc., PVLDB Vol. 17, No. 12, 2024"
paper_url: "https://doi.org/10.14778/3685800.3685802"
---

<div data-lang-content="en" markdown="1">

*Paper: ["ClickHouse - Lightning Fast Analytics for Everyone"](https://doi.org/10.14778/3685800.3685802), by Schulze et al., ClickHouse Inc., VLDB 2024.*

I'd been using ClickHouse for dashboards for a while before I ever read a word about how it actually works, and it always felt strangely fast in a way I couldn't explain — questions that would make a normal database sweat came back almost instantly. Reading the paper felt like finally getting to see behind the curtain, and honestly, almost every design choice made sense once I understood the *kind* of question ClickHouse is built to answer, which is different from what most databases are optimized for.

## Two very different jobs a database can do

Databases generally get built for one of two very different jobs, and it's worth naming both before anything else makes sense.

**OLTP** (transaction processing) is what you need when thousands of people are each doing small, quick things at the same time — buying a movie ticket, liking a post, updating their profile photo. Lots of tiny reads and writes, all mixed together, and correctness (nobody's ticket gets double-booked) matters enormously.

**OLAP** (analytical processing) is the opposite shape: a handful of people ask huge questions across *enormous* amounts of data — "what was our average order value by country, every month, for the last three years?" Fewer questions, but each one might have to look at billions of rows to answer.

ClickHouse is built almost entirely for the second job. Keeping that in mind explains basically every weird-looking decision in this paper.

## Why "store data by column" changes everything

Picture a giant spreadsheet: a million rows, fifty columns. A normal database usually stores data **row by row** — meaning all fifty columns of row #1 sit right next to each other on disk, then all fifty columns of row #2, and so on. That's great if you usually want *entire records* (like "give me everything about customer #482"). But if your actual question only touches 3 of those 50 columns — say, "what's the average order value" — a row-based system still has to drag all fifty columns off disk for every single row, just to throw away 47 of them.

ClickHouse instead stores data **column by column**: every value from column A sits together, then every value from column B, and so on. Now a question that only needs 3 columns only has to read those 3 columns' worth of data, ignoring the rest completely. This single idea — store data shaped like the questions you'll actually ask — is most of why ClickHouse feels so fast for the kind of "summarize huge amounts of data" questions it's built for.

## A different way of handling new data coming in

Here's a concept worth understanding before the ClickHouse-specific details: many fast databases use something called an **LSM tree** (log-structured merge tree) to handle new data efficiently. Instead of constantly rewriting one giant sorted file every time new data arrives (slow), you write new data into small, fresh, separate chunks — think of it like jotting new entries on a fresh sticky note instead of rewriting your whole address book each time you meet someone new. Every so often, in the background, a cleanup job merges a batch of these small chunks into fewer, bigger, tidier ones.

ClickHouse does something similar, but with a twist I hadn't seen elsewhere: most systems like this organize their chunks into ranked "levels" (like level 1 = newest and smallest, level 2 = older and merged once, and so on), and only merge chunks within the same level. ClickHouse just throws that ranking away — every chunk ("part," in ClickHouse's terms) is treated as equal, and the background cleanup job can merge *any* group of them together once they get big enough. This sacrifices a trick other systems rely on (using the level ranking to figure out which version of a row is newest when values are updated or deleted), so ClickHouse needs separate tricks for that instead — but it gains real scheduling flexibility for the cleanup process.

The other surprise: **ClickHouse writes new data straight to disk with no safety journal (called a "write-ahead log") at all**, which almost every other database of this style keeps as a safety net in case of a crash mid-write. And by default, it doesn't even force the operating system to *guarantee* that write actually landed on physical disk before moving on (a step called `fsync`, which is normally slow but very safe). The paper is refreshingly honest about this: it's a deliberate trade of "small chance of losing the very newest rows if the power cuts out" in exchange for a real speed boost — and that trade only makes sense because ClickHouse is usually used for things like analytics dashboards and monitoring logs, where losing a few seconds of the newest data during a rare power failure is a shrug, not a disaster. You would never make that trade for a banking system.

## Three separate tricks for skipping data you don't need to read

Everyone knows ClickHouse as "the fast one," and the paper breaks that reputation down into three genuinely distinct tricks, each solving a different shape of question:

1. **A primary index** — but a "lazy" one. Instead of recording the location of every single row (which would be a lot of bookkeeping for billions of rows), it only checkpoints every 8,192 rows. So a table with 8 million rows can be indexed with roughly a thousand tiny bookmarks, small enough to keep entirely in memory. This is like a book's table of contents pointing to chapter starts instead of listing every single sentence.
2. **Projections** — literally a second copy of your table, sorted by a completely different column, kept in sync automatically. If your main table is sorted by date but you frequently ask questions grouped by customer instead, a projection sorted by customer answers those questions instantly, at the cost of extra storage space and some extra work every time new data comes in. The system automatically figures out whether to use the main table or a projection depending on which one is cheaper for a given question.
3. **Skipping indices** — small, lightweight notes attached to each chunk of rows (like "the values in this chunk range from 10 to 50" or "here's roughly which values show up in this chunk") for columns that aren't sorted at all. It's not a precise lookup — it just lets ClickHouse say "this whole chunk definitely doesn't contain what you're looking for, skip it entirely" without reading the actual data.

Put simply: the primary index handles "I already sorted my data for this kind of question." Projections handle "I knew I'd ask this kind of question often, so I pre-paid the storage cost." Skipping indices handle "I didn't plan for this specific question, but I can still avoid wasting time on chunks that obviously don't matter."

## Doing your data cleanup and your data summarizing at the same time

This is the part of the design I found most elegant, once I understood it. Most databases treat "clean up old data" and "keep a running summary updated" (called a **materialized view** — basically a pre-calculated answer to a common question, kept fresh automatically instead of recalculated from scratch every single time) as two completely separate jobs running on a schedule. ClickHouse instead folds both into the *same* background cleanup process that's already merging chunks together for other reasons:

- **Replacing merges** keep only the newest version of each row (matched by a key) and quietly drop older ones during the routine merge — which doubles as how ClickHouse handles "updates," since it doesn't rewrite data in place the way older systems do.
- **Aggregating merges** keep a running summary (like a running total or running average) updated a little bit at a time, as each small batch of new data arrives, instead of waiting for a schedule and re-scanning the entire underlying table from scratch every time — the way you'd keep a live scoreboard updated point-by-point rather than recounting the entire game from the beginning after every basket.
- **TTL merges** ("time to live") automatically move, compress, or delete old data once it passes an age limit you set — like automatically archiving emails older than a year into cold storage, without you lifting a finger.

None of this ever blocks new data from coming in, because it's riding along on a background process that was already running anyway.

## Honesty about not being a "safe" database in the traditional sense

Databases often promise something called **ACID** — a set of guarantees that transactions are safe, consistent, and don't corrupt each other even when many things happen at once. The paper is upfront that ClickHouse mostly *doesn't* make this promise, and explains precisely why: a query sees a consistent snapshot of the data from the moment it started (similar to the MVCC idea I described in another one of my notes), but because a single command can touch or create several of ClickHouse's storage chunks at once, and the safety mechanism only stops those chunks from being deleted mid-use — not from being swapped out as one atomic unit — true ACID behavior only holds in the narrow case where everything happening at once fits inside a single chunk. I really respected that they said this plainly instead of quietly hoping nobody would ask. It's the right trade for the job: almost every real ClickHouse use case is a heavy stream of incoming analytics data that already accepts a small risk of losing the very newest, not-yet-saved rows, in exchange for speed. Nobody is running their bank balance through this.

## Using a voting system for coordination, not for moving data

To keep multiple copies of data in sync across machines, ClickHouse uses a small group of coordinator processes called "Keeper," built on an algorithm called **Raft**. Raft is one of the standard ways a group of computers agree on the order of events reliably, even if some of them are slow or briefly disconnected — think of it as a formal voting procedure, like a small committee that must agree on the official order of decisions before anything becomes final. The clever bit: Raft is only used to agree on *what happened and in what order* (insert this, merge that, delete this). The actual heavy data itself is *not* pushed through that voting process — machines just directly copy the real data from each other afterward, peer-to-peer, once they know what they're supposed to have. Because of this, ClickHouse's replicated copies are only "eventually" perfectly in sync rather than instantly — a brief delay is possible — with an option to wait for full agreement when it really matters. Using the "expensive, careful agreement" mechanism only for small coordination messages, and a "fast and simple" mechanism for the actual bulk data, is a genuinely good pattern.

## Squeezing extra speed out of the exact chip you happen to be running on

Modern CPUs can often do the same simple math operation on several numbers *at once*, using special instructions (a family called SIMD, with names like AVX2 and AVX-512 on different generations of chips) — like a factory line that processes four items per motion instead of one. ClickHouse's query engine is built around this "batch of values at a time" style already (an approach it shares with an older system called MonetDB/X100). What impressed me is the extra step: ClickHouse actually compiles several *different* versions of its hottest, most-used code — a plain version that runs anywhere, a version using the older AVX2 instructions, and a version hand-tuned for the newer AVX-512 instructions — and, when the program starts, it checks exactly what your specific CPU supports and picks the fastest version automatically. That's how it manages to run on hardware from 15 years ago while still getting the full benefit on a brand-new server, without anyone needing to compile separate versions of the software for different machines.

## What this taught me about matching design to workload

Reading this right after two very OLTP-focused database papers made the contrast obvious in a way it wouldn't have been on its own: Aurora and Aurora DSQL spend almost all their cleverness making sure conflicting writes from many different customers never corrupt each other, cheaply, at scale. ClickHouse barely worries about that problem at all — its writes are mostly just "new data arriving," rarely conflicting with each other — and instead spends all its cleverness on reading enormous amounts of data as fast as physically possible. Neither approach is more advanced than the other; they're solving genuinely different problems, and the "best" database architecture always depends entirely on which of those two problems you actually have.

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["ClickHouse - Lightning Fast Analytics for Everyone"](https://doi.org/10.14778/3685800.3685802), của Schulze và cộng sự, ClickHouse Inc., VLDB 2024.*

Tôi đã dùng ClickHouse để làm dashboard một thời gian trước khi đọc một chữ nào về cách nó thực sự hoạt động, và nó luôn cảm giác nhanh một cách kỳ lạ mà tôi không giải thích được — những câu hỏi khiến một database bình thường phải toát mồ hôi thì nó trả lời gần như ngay lập tức. Đọc paper này giống như cuối cùng được nhìn ra sau tấm màn, và thành thật mà nói, gần như mọi quyết định thiết kế đều trở nên hợp lý một khi tôi hiểu *loại* câu hỏi mà ClickHouse được xây để trả lời — vốn khác hẳn với thứ mà hầu hết database khác được tối ưu cho.

## Hai công việc rất khác nhau mà một database có thể làm

Database nói chung được xây cho một trong hai công việc rất khác nhau, và đáng để gọi tên cả hai trước khi đi tiếp vào bất cứ thứ gì khác.

**OLTP** (xử lý giao dịch) là thứ bạn cần khi hàng ngàn người cùng làm những việc nhỏ, nhanh, cùng một lúc — mua vé xem phim, thả tim một bài đăng, đổi ảnh đại diện. Rất nhiều lượt đọc/ghi nhỏ, trộn lẫn với nhau, và tính đúng đắn (không ai bị đặt trùng vé) cực kỳ quan trọng.

**OLAP** (xử lý phân tích) là hình dạng ngược lại: một số ít người hỏi những câu hỏi khổng lồ trên một lượng dữ liệu *cực lớn* — "giá trị đơn hàng trung bình theo từng quốc gia, từng tháng, trong ba năm qua là bao nhiêu?" Ít câu hỏi hơn, nhưng mỗi câu có thể phải nhìn qua hàng tỷ dòng dữ liệu để trả lời.

ClickHouse được xây gần như hoàn toàn cho công việc thứ hai. Nhớ điều này giải thích gần như mọi quyết định "kỳ lạ" trong paper này.

## Vì sao "lưu dữ liệu theo cột" thay đổi mọi thứ

Hãy tưởng tượng một bảng tính khổng lồ: một triệu dòng, năm mươi cột. Một database bình thường thường lưu dữ liệu **theo hàng** — nghĩa là cả năm mươi cột của dòng số 1 nằm sát nhau trên đĩa, rồi tới cả năm mươi cột của dòng số 2, cứ thế tiếp tục. Điều đó tuyệt vời nếu bạn thường muốn *toàn bộ bản ghi* (kiểu "cho tôi mọi thứ về khách hàng #482"). Nhưng nếu câu hỏi thực tế của bạn chỉ chạm tới 3 trong 50 cột đó — ví dụ "giá trị đơn hàng trung bình là bao nhiêu" — một hệ thống lưu theo hàng vẫn phải kéo cả năm mươi cột ra khỏi đĩa cho từng dòng, chỉ để vứt đi 47 cột không cần.

ClickHouse thay vào đó lưu dữ liệu **theo cột**: mọi giá trị của cột A nằm cùng nhau, rồi mọi giá trị của cột B, cứ thế. Giờ một câu hỏi chỉ cần 3 cột thì chỉ cần đọc đúng lượng dữ liệu của 3 cột đó, bỏ qua hoàn toàn phần còn lại. Chỉ riêng ý tưởng này — lưu dữ liệu theo đúng hình dạng của các câu hỏi bạn thực sự sẽ hỏi — là phần lớn lý do ClickHouse cảm giác nhanh đến vậy với kiểu câu hỏi "tóm tắt một lượng dữ liệu khổng lồ" mà nó được xây để trả lời.

## Một cách khác để xử lý dữ liệu mới đi vào

Đây là một khái niệm đáng hiểu trước khi vào chi tiết riêng của ClickHouse: nhiều database nhanh dùng thứ gọi là **LSM tree** (log-structured merge tree) để xử lý dữ liệu mới hiệu quả. Thay vì liên tục viết lại một file khổng lồ đã sắp xếp mỗi khi có dữ liệu mới (chậm), bạn ghi dữ liệu mới vào các khối nhỏ, mới, riêng biệt — giống như ghi vội mục mới vào một tờ giấy nhớ thay vì viết lại cả cuốn sổ địa chỉ mỗi khi gặp người mới. Thỉnh thoảng, một công việc dọn dẹp chạy nền sẽ gộp một lô các khối nhỏ đó lại thành ít khối hơn, lớn hơn, gọn gàng hơn.

ClickHouse làm điều tương tự, nhưng với một điểm khác tôi chưa từng thấy ở đâu: hầu hết hệ thống kiểu này tổ chức các khối của mình thành các "level" xếp hạng (kiểu level 1 = mới nhất và nhỏ nhất, level 2 = cũ hơn và đã merge một lần, cứ thế), và chỉ merge các khối trong cùng level. ClickHouse thẳng tay bỏ luôn cách xếp hạng đó — mọi khối (gọi là "part" trong thuật ngữ ClickHouse) được coi là ngang hàng, và job dọn dẹp chạy nền có thể merge *bất kỳ* nhóm nào trong số chúng một khi chúng đủ lớn. Điều này hy sinh một mẹo mà các hệ khác dựa vào (dùng thứ hạng level để biết phiên bản nào của một dòng là mới nhất khi giá trị bị update hoặc xóa), nên ClickHouse cần các mẹo riêng cho việc đó — nhưng đổi lại có được sự linh hoạt thật sự trong việc lên lịch cho tiến trình dọn dẹp.

Điều bất ngờ khác: **ClickHouse ghi thẳng dữ liệu mới xuống đĩa mà hoàn toàn không có một nhật ký an toàn (gọi là "write-ahead log")**, trong khi gần như mọi database cùng kiểu khác đều giữ nó như một lưới an toàn phòng khi crash giữa lúc ghi. Và mặc định, nó thậm chí không ép hệ điều hành phải *đảm bảo* rằng lần ghi đó thực sự đã nằm trên đĩa vật lý trước khi tiếp tục (một bước gọi là `fsync`, thường chậm nhưng rất an toàn). Paper thẳng thắn một cách đáng khen về điều này: đây là một sự đánh đổi có chủ đích giữa "rủi ro nhỏ mất những dòng mới nhất nếu mất điện" để lấy một mức tăng tốc thật sự — và sự đánh đổi đó chỉ hợp lý vì ClickHouse thường được dùng cho những thứ như dashboard phân tích và log giám sát, nơi mất vài giây dữ liệu mới nhất trong một lần mất điện hiếm hoi chỉ là nhún vai cho qua, không phải thảm họa. Bạn sẽ không bao giờ chấp nhận đánh đổi đó cho một hệ thống ngân hàng.

## Ba mẹo riêng biệt để bỏ qua dữ liệu không cần đọc

Ai cũng biết ClickHouse là "đứa nhanh," và paper bóc tách danh tiếng đó thành ba mẹo thực sự khác biệt, mỗi mẹo giải quyết một dạng câu hỏi khác nhau:

1. **Một chỉ mục chính (primary index)** — nhưng là loại "lười." Thay vì ghi lại vị trí của từng dòng một (sẽ tốn rất nhiều sổ sách cho hàng tỷ dòng), nó chỉ đánh dấu mỗi 8.192 dòng một lần. Nên một bảng 8 triệu dòng có thể được đánh index chỉ với khoảng một ngàn "dấu trang" nhỏ xíu, đủ nhỏ để giữ trọn trong bộ nhớ. Giống như mục lục của một cuốn sách trỏ tới đầu mỗi chương thay vì liệt kê từng câu.
2. **Projection** — đúng nghĩa là một bản sao thứ hai của bảng, sắp xếp theo một cột hoàn toàn khác, được tự động giữ đồng bộ. Nếu bảng chính của bạn sắp theo ngày nhưng bạn thường hỏi các câu nhóm theo khách hàng, một projection sắp theo khách hàng sẽ trả lời những câu đó ngay lập tức, đổi lại là thêm dung lượng lưu trữ và thêm việc mỗi khi có dữ liệu mới. Hệ thống tự động tìm ra nên dùng bảng chính hay một projection tùy vào cái nào rẻ hơn cho một câu hỏi cụ thể.
3. **Skipping index** — những ghi chú nhỏ, nhẹ gắn vào mỗi khối dòng (kiểu "giá trị trong khối này nằm trong khoảng 10 đến 50" hoặc "đây là những giá trị đại khái xuất hiện trong khối này") cho các cột hoàn toàn không nằm trong thứ tự sắp xếp. Nó không phải một cách tra cứu chính xác — nó chỉ cho phép ClickHouse nói "cả khối này chắc chắn không chứa thứ bạn tìm, bỏ qua hẳn nó" mà không cần đọc dữ liệu thật.

Nói đơn giản: chỉ mục chính xử lý "tôi đã sắp xếp sẵn dữ liệu cho loại câu hỏi này." Projection xử lý "tôi biết trước mình sẽ hay hỏi kiểu này nên đã trả giá trước bằng dung lượng lưu trữ." Skipping index xử lý "tôi không lường trước câu hỏi cụ thể này, nhưng vẫn có thể tránh lãng phí thời gian vào những khối rõ ràng không liên quan."

## Vừa dọn dẹp dữ liệu vừa tóm tắt dữ liệu cùng một lúc

Đây là phần thiết kế tôi thấy tinh tế nhất, một khi đã hiểu nó. Hầu hết database coi "dọn dẹp dữ liệu cũ" và "giữ một bản tóm tắt luôn cập nhật" (gọi là **materialized view** — về cơ bản là một câu trả lời được tính sẵn cho một câu hỏi hay gặp, được giữ luôn mới thay vì tính lại từ đầu mỗi lần) là hai công việc hoàn toàn tách biệt chạy theo lịch. ClickHouse thay vào đó gộp cả hai vào *cùng* tiến trình dọn dẹp chạy nền vốn đã đang gộp các khối lại với nhau vì lý do khác:

- **Replacing merge** chỉ giữ lại phiên bản mới nhất của mỗi dòng (khớp theo một key) và âm thầm bỏ những phiên bản cũ trong lần merge định kỳ — qua đó kiêm luôn cách ClickHouse xử lý "update," vì nó không ghi đè dữ liệu tại chỗ như các hệ cũ vẫn làm.
- **Aggregating merge** giữ một bản tóm tắt đang chạy (kiểu tổng hoặc trung bình đang chạy) luôn được cập nhật từng chút một, ngay khi mỗi lô dữ liệu mới nhỏ xuất hiện, thay vì chờ theo lịch rồi quét lại toàn bộ bảng gốc từ đầu mỗi lần — giống như bạn giữ một bảng điểm trực tiếp cập nhật theo từng điểm số thay vì đếm lại cả trận đấu từ đầu sau mỗi rổ.
- **TTL merge** ("time to live") tự động di chuyển, nén, hoặc xóa dữ liệu cũ một khi nó vượt quá giới hạn tuổi bạn đặt ra — giống như tự động lưu trữ email cũ hơn một năm vào kho lạnh mà bạn không cần động tay.

Không cái nào trong số này chặn dữ liệu mới đi vào, vì tất cả đều "đi nhờ" trên một tiến trình chạy nền vốn dĩ đã chạy sẵn rồi.

## Thẳng thắn về việc không phải một database "an toàn" theo nghĩa truyền thống

Database thường hứa hẹn thứ gọi là **ACID** — một tập đảm bảo rằng các giao dịch an toàn, nhất quán, và không làm hỏng lẫn nhau ngay cả khi nhiều thứ xảy ra cùng lúc. Paper thẳng thắn rằng ClickHouse phần lớn *không* đưa ra lời hứa này, và giải thích chính xác vì sao: một truy vấn thấy một snapshot nhất quán của dữ liệu tại thời điểm nó bắt đầu (tương tự ý tưởng MVCC tôi đã mô tả trong một ghi chú khác của mình), nhưng vì một câu lệnh đơn lẻ có thể chạm vào hoặc tạo ra nhiều khối lưu trữ của ClickHouse cùng lúc, và cơ chế an toàn chỉ ngăn các khối đang dùng bị xóa — chứ không đảm bảo chúng được hoán đổi như một khối thống nhất — hành vi ACID thật sự chỉ đúng trong trường hợp hẹp là mọi thứ xảy ra cùng lúc đều nằm gọn trong một khối duy nhất. Tôi thực sự tôn trọng việc họ nói điều này rõ ràng thay vì âm thầm hy vọng không ai hỏi. Đây là đánh đổi đúng đắn cho công việc này: gần như mọi trường hợp dùng ClickHouse thực tế là một dòng dữ liệu phân tích nặng, đã chấp nhận rủi ro nhỏ mất những dòng mới nhất chưa kịp lưu, để đổi lấy tốc độ. Không ai chạy số dư ngân hàng của mình qua hệ này cả.

## Dùng hệ thống bỏ phiếu để điều phối, không phải để chuyển dữ liệu

Để giữ nhiều bản sao dữ liệu đồng bộ trên nhiều máy, ClickHouse dùng một nhóm nhỏ các tiến trình điều phối gọi là "Keeper," xây trên một thuật toán gọi là **Raft**. Raft là một trong những cách chuẩn để một nhóm máy tính đồng thuận về thứ tự sự kiện một cách đáng tin cậy, ngay cả khi một số máy chậm hoặc tạm mất kết nối — hãy nghĩ nó như một thủ tục bỏ phiếu chính thức, giống một ủy ban nhỏ phải đồng ý về thứ tự quyết định chính thức trước khi bất cứ điều gì trở thành cuối cùng. Điểm khéo léo: Raft chỉ được dùng để đồng thuận về *chuyện gì đã xảy ra và theo thứ tự nào* (insert cái này, merge cái kia, xóa cái nọ). Dữ liệu thật, nặng thì *không* bị đẩy qua quy trình bỏ phiếu đó — các máy chỉ đơn giản tự sao chép dữ liệu thật từ nhau sau đó, ngang hàng (peer-to-peer), một khi biết mình cần có gì. Vì vậy, các bản sao replicated của ClickHouse chỉ đồng bộ hoàn hảo *dần dần* (eventually) chứ không phải ngay tức thì — có thể có một độ trễ ngắn — với tùy chọn chờ đồng thuận đầy đủ khi thực sự cần. Dùng cơ chế "đồng thuận cẩn thận, tốn kém" chỉ cho các tin nhắn điều phối nhỏ, và một cơ chế "nhanh và đơn giản" cho dữ liệu khối lượng lớn thật sự, là một pattern thực sự hay.

## Vắt thêm tốc độ từ đúng con chip bạn đang chạy

CPU hiện đại thường có thể làm cùng một phép tính đơn giản trên nhiều số *cùng một lúc*, dùng các lệnh đặc biệt (một họ gọi là SIMD, với các tên như AVX2 và AVX-512 trên các thế hệ chip khác nhau) — giống như một dây chuyền nhà máy xử lý bốn sản phẩm mỗi động tác thay vì một. Query engine của ClickHouse vốn đã được xây quanh phong cách "xử lý một khối giá trị mỗi lần" này (một cách tiếp cận nó chia sẻ với một hệ cũ hơn tên MonetDB/X100). Điều khiến tôi ấn tượng là bước thêm vào: ClickHouse thực sự biên dịch nhiều phiên bản *khác nhau* của đoạn code nóng nhất, dùng nhiều nhất — một bản chạy được ở bất kỳ đâu, một bản dùng lệnh AVX2 cũ hơn, và một bản tinh chỉnh tay cho lệnh AVX-512 mới hơn — và khi chương trình khởi động, nó kiểm tra chính xác CPU của bạn hỗ trợ gì rồi tự động chọn bản nhanh nhất. Đó là cách nó có thể chạy trên phần cứng từ 15 năm trước mà vẫn tận dụng trọn vẹn lợi ích trên một server đời mới, mà không ai cần biên dịch riêng phần mềm cho từng loại máy.

## Điều bài này dạy tôi về việc khớp thiết kế với loại công việc

Đọc bài này ngay sau hai paper database rất thiên về OLTP khiến sự tương phản trở nên rõ ràng theo cách mà nếu đọc riêng lẻ sẽ không thấy được: Aurora và Aurora DSQL dồn gần như toàn bộ sự khéo léo của mình vào việc đảm bảo các ghi xung đột từ nhiều khách hàng khác nhau không bao giờ làm hỏng lẫn nhau, một cách rẻ và ở quy mô lớn. ClickHouse gần như không lo lắng về vấn đề đó chút nào — các ghi của nó chủ yếu chỉ là "dữ liệu mới đang đến," hiếm khi xung đột với nhau — và thay vào đó dồn hết sự khéo léo vào việc đọc một lượng dữ liệu khổng lồ nhanh nhất có thể về mặt vật lý. Không cách tiếp cận nào tiên tiến hơn cách kia; chúng đang giải những vấn đề thực sự khác nhau, và kiến trúc database "tốt nhất" luôn phụ thuộc hoàn toàn vào việc bạn đang thực sự gặp vấn đề nào trong hai vấn đề đó.

</div>

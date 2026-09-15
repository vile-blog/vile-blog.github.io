<!--
  TEMPLATE — DDIA-style book chapter note
  ========================================
  Thư mục _templates/ không được Jekyll build (bắt đầu bằng "_" nhưng
  không phải tên đặc biệt nào Jekyll biết), nên file này chỉ nằm đây
  làm khung mẫu, không lên site.

  QUY TẮC CÂN XỨNG EN/VI (đọc trước khi viết):
  - Bản EN và bản VI phải có ĐÚNG CÙNG SỐ LƯỢNG heading (##), theo
    đúng cùng thứ tự chủ đề. Không thêm/bớt mục ở một bên.
  - Mỗi mục nên có số đoạn văn bằng nhau ở cả hai bên (chênh lệch tối
    đa 1 đoạn). Không viết bên EN 4 đoạn còn bên VI tóm tắt lại thành 1.
  - Ảnh minh họa (nếu có) phải xuất hiện ở đúng cùng vị trí (sau cùng
    một câu/đoạn) ở cả hai bên.
  - Viết bản EN xong, dịch/viết lại bản VI bám sát từng đoạn một —
    không dịch máy nguyên văn, nhưng giữ đúng ý và đúng nhịp đoạn.
  - Giọng văn: ngôi thứ nhất, như chính Vi Le đang viết lại điều mình
    vừa đọc — không dùng khung "task" kiểu "đây là bài thứ N trong
    loạt...", không liệt kê kiểu bullet khô khan thay cho văn xuôi.
    Giải thích thuật ngữ bằng ví dụ đời thường, như đang giải thích
    cho một học sinh cấp 3.

  KHUNG BÀI (5 mục cố định — giữ đúng số mục này):
  1. Mở bài — nối với chương trước, nêu câu hỏi/chủ đề chương này giải quyết.
  2. Khái niệm cốt lõi #1
  3. Khái niệm cốt lõi #2 (thường kèm ảnh minh họa ở đây)
  4. Ví dụ/hệ thống thật ngoài đời (kèm ảnh minh họa nếu chưa dùng ở mục 3)
  5. Kết — vì sao chương này quan trọng / nối sang chương tiếp theo

  Sau khi viết xong: build local để kiểm tra (nhớ bỏ dòng `timezone:`
  trong _config.yml trước khi build trên Windows, rồi khôi phục lại
  trước khi commit), rồi đưa cho Vi Le đọc trước khi push.
-->
---
title: "DDIA Chapter N: [Tên chương, tiếng Anh]"
title_vi: "DDIA Chương N: [Tên chương, tiếng Việt hoặc giữ nguyên tên gốc]"
date: 2026-MM-DD HH:MM:00 +0700
excerpt: "[1-2 câu tiếng Anh, giọng cá nhân, không spoil hết nội dung — nêu câu hỏi chương này trả lời]"
excerpt_vi: "[Bản dịch/viết lại tiếng Việt của excerpt trên, không cần dịch từng chữ]"
categories: [book-notes]
tags: ["Designing Data-Intensive Applications", "Chapter N", "[Chủ đề 1]", "[Chủ đề 2]"]
book_title: "Designing Data-Intensive Applications"
book_author: "Martin Kleppmann"
book_url: "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/"
book_chapter: "Chapter N: [Tên chương đầy đủ theo sách]"
book_chapter_vi: "Chương N: [Tên chương đầy đủ theo sách]"
book_chapter_num: N
---

<div data-lang-content="en" markdown="1">

*Book: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) by Martin Kleppmann — Chapter N: [tên chương].*

[Mở bài — 1 đoạn. Nối với chương trước bằng link `/blog/2026/09/15/ddia-chapter-(N-1)-slug/`, nêu câu hỏi chương này trả lời.]

## [Tiêu đề mục 1 — khái niệm cốt lõi #1]

[1-2 đoạn, ví dụ đời thường để giải thích thuật ngữ.]

## [Tiêu đề mục 2 — khái niệm cốt lõi #2]

![Mô tả ảnh bằng tiếng Anh, ngắn gọn](/assets/images/ddia/chN-slug.svg)

[1-2 đoạn, có thể chèn ảnh minh họa ở đây nếu khái niệm cần hình dung trực quan.]

## [Tiêu đề mục 3 — ví dụ / hệ thống thật ngoài đời]

[1-2 đoạn, nêu tên hệ thống thật cụ thể (Postgres, Cassandra, Kafka, Kubernetes, Google Spanner, v.v.) đang áp dụng khái niệm này.]

## [Tiêu đề mục 4 — vì sao chương này quan trọng / nối chương sau]

[1 đoạn kết, nối sang chương tiếp theo nếu có link phù hợp.]

</div>
<div data-lang-content="vi" markdown="1">

*Sách: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) của Martin Kleppmann — Chương N: [tên chương].*

[Mở bài — 1 đoạn, khớp với đoạn mở bài bản EN.]

## [Tiêu đề mục 1 — dịch/viết lại từ mục 1 bản EN]

[1-2 đoạn, khớp số đoạn với bản EN.]

## [Tiêu đề mục 2 — dịch/viết lại từ mục 2 bản EN]

![Mô tả ảnh bằng tiếng Việt, ngắn gọn](/assets/images/ddia/chN-slug.svg)

[1-2 đoạn, ảnh đặt đúng cùng vị trí như bản EN.]

## [Tiêu đề mục 3 — dịch/viết lại từ mục 3 bản EN]

[1-2 đoạn, khớp số đoạn với bản EN.]

## [Tiêu đề mục 4 — dịch/viết lại từ mục 4 bản EN]

[1 đoạn kết, khớp với bản EN.]

</div>

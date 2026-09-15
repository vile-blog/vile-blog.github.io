<!--
  TEMPLATE — paper note (thư mục /notes/papers)
  ==============================================
  Thư mục _templates/ không được Jekyll build, file này chỉ là khung mẫu.

  QUY TẮC CÂN XỨNG EN/VI (đọc trước khi viết) — giống hệt book-chapter-template.md:
  - Cùng số lượng heading (##), cùng thứ tự chủ đề ở cả hai bên.
  - Số đoạn văn mỗi mục bằng nhau (chênh lệch tối đa 1 đoạn).
  - Ảnh minh họa (nếu có) đặt đúng cùng vị trí ở cả hai bên.
  - Ngôi thứ nhất, giọng tự nhiên như đang tự viết lại điều mình đọc
    được — không khung "task"/"batch", không liệt kê khô khan.
    Giải thích thuật ngữ bằng ví dụ đời thường, dễ hiểu.
  - Chỉ được trích dẫn trực tiếp (quote) tối đa 1 câu ngắn (<15 từ)
    có ghi nguồn trong toàn bộ bài — còn lại phải diễn giải bằng lời
    của mình, không chép nguyên văn đoạn dài từ paper.

  KHUNG BÀI (5 mục cố định):
  1. Mở bài — vì sao đọc paper này, câu hỏi paper trả lời.
  2. Bối cảnh / vấn đề paper giải quyết là gì.
  3. Ý tưởng thiết kế cốt lõi (thường kèm ảnh minh họa kiến trúc).
  4. Điểm hay/bất ngờ nhất, hoặc đánh đổi (tradeoff) đáng chú ý.
  5. Kết — áp dụng được gì vào công việc thực tế, hoặc liên hệ paper khác.

  Sau khi viết xong: build local để kiểm tra (bỏ dòng `timezone:` trong
  _config.yml trước khi build trên Windows, khôi phục lại trước khi
  commit), rồi đưa Vi Le đọc trước khi push.
-->
---
title: "Paper Notes: [Tên paper, tiếng Anh]"
title_vi: "Ghi chú Paper: [Tên paper, giữ nguyên tên gốc]"
date: 2026-MM-DD HH:MM:00 +0700
excerpt: "[1-2 câu tiếng Anh, giọng cá nhân — vì sao đọc paper này]"
excerpt_vi: "[Bản dịch/viết lại tiếng Việt của excerpt trên]"
categories: [papers]
tags: ["[Tên hệ thống]", "[Chủ đề 1]", "[Chủ đề 2]"]
paper_title: "[Tên paper đầy đủ]"
paper_authors: "[Tác giả — tổ chức, hội nghị/tạp chí, năm]"
paper_url: "[Link DOI hoặc trang chính thức]"
---

<div data-lang-content="en" markdown="1">

*Paper: ["[Tên paper]"]([link]), by [tác giả], [hội nghị/năm].*

[Mở bài — 1 đoạn. Vì sao đọc paper này, nó trả lời câu hỏi gì.]

## [Tiêu đề mục 1 — bối cảnh/vấn đề]

[1-2 đoạn.]

## [Tiêu đề mục 2 — ý tưởng thiết kế cốt lõi]

![Mô tả ảnh bằng tiếng Anh, ngắn gọn](/assets/images/papers/[slug].svg)

[1-2 đoạn, chèn ảnh minh họa kiến trúc nếu cần.]

## [Tiêu đề mục 3 — điểm hay/bất ngờ nhất hoặc tradeoff]

[1-2 đoạn.]

## [Tiêu đề mục 4 — áp dụng thực tế / liên hệ]

[1 đoạn kết.]

</div>
<div data-lang-content="vi" markdown="1">

*Paper: ["[Tên paper]"]([link]), của [tác giả], [hội nghị/năm].*

[Mở bài — 1 đoạn, khớp với bản EN.]

## [Tiêu đề mục 1 — dịch/viết lại từ mục 1 bản EN]

[1-2 đoạn, khớp số đoạn với bản EN.]

## [Tiêu đề mục 2 — dịch/viết lại từ mục 2 bản EN]

![Mô tả ảnh bằng tiếng Việt, ngắn gọn](/assets/images/papers/[slug].svg)

[1-2 đoạn, ảnh đặt đúng cùng vị trí như bản EN.]

## [Tiêu đề mục 3 — dịch/viết lại từ mục 3 bản EN]

[1-2 đoạn.]

## [Tiêu đề mục 4 — dịch/viết lại từ mục 4 bản EN]

[1 đoạn kết.]

</div>

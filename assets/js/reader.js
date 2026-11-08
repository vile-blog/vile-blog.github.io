/* ==========================================================================
   Reader tools (post pages only)
     - reading-progress bar + sticky table of contents (scrollspy)
     - select text -> highlight (4 colours), private note, copy quote,
       link to the passage, comment on the paragraph
     - public per-paragraph comments (a GitHub Discussion per paragraph,
       through giscus)
     - sidenotes:  <span class="sn">note text</span>
   Highlights and notes are private: they live in this browser's
   localStorage, keyed by page, and never leave the device.
   ========================================================================== */
(function () {
  "use strict";

  var content = document.querySelector(".post-content");
  if (!content) return;

  var root = document.documentElement;
  var Site = window.ViSite || {};
  var BLOCK_SEL = "p, li, h2, h3, h4, h5, td, th";
  var COLORS = ["yellow", "green", "blue", "pink"];
  var STORE_KEY = "vile-hl:" + location.pathname;

  function lang() {
    return root.getAttribute("data-lang") === "vi" ? "vi" : "en";
  }
  function T(en, vi) {
    return lang() === "vi" ? vi : en;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function visible(n) {
    return !!(n && n.offsetParent !== null);
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }
  function raf(fn) {
    var queued = false;
    return function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn(); });
    };
  }

  /* ------------------------------------------------------------------
     Toast
  ------------------------------------------------------------------ */
  var toastEl = el("div", "rd-toast");
  toastEl.setAttribute("role", "status");
  document.body.appendChild(toastEl);
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 1800);
  }

  function copy(text, okMsg) {
    function done() { toast(okMsg); }
    function fallback() {
      var ta = el("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast(T("Couldn't copy", "Không sao chép được")); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ------------------------------------------------------------------
     Sidenotes  (<span class="sn">…</span>)
     Wide screens: floats into the right margin, numbered, nudged so notes
     never overlap. Narrow screens: tap the number to expand inline.
  ------------------------------------------------------------------ */
  var sidenotes = Array.prototype.slice.call(content.querySelectorAll(".sn"));
  sidenotes.forEach(function (sn) {
    var mark = el("sup", "sn-mark");
    mark.tabIndex = 0;
    mark.setAttribute("role", "button");
    mark.setAttribute("aria-expanded", "false");
    mark.setAttribute("aria-label", "Sidenote");
    sn.parentNode.insertBefore(mark, sn);
    sn._mark = mark;
    function toggle() {
      var open = sn.classList.toggle("is-open");
      mark.setAttribute("aria-expanded", open ? "true" : "false");
      layoutSidenotes();
    }
    mark.addEventListener("click", toggle);
    mark.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });

  function layoutSidenotes() {
    if (!sidenotes.length) return;
    var wide = window.matchMedia("(min-width: 1280px)").matches;
    var base = content.getBoundingClientRect().top + window.scrollY;
    var prevBottom = -Infinity;
    sidenotes.forEach(function (sn) {
      sn.style.top = "";
      if (!wide || !visible(sn._mark)) return;
      var natural = sn._mark.getBoundingClientRect().top + window.scrollY - base;
      var top = Math.max(natural, prevBottom + 10);
      sn.style.top = top + "px";
      prevBottom = top + sn.offsetHeight;
    });
  }
  var layoutSidenotesSoon = debounce(layoutSidenotes, 60);

  /* ------------------------------------------------------------------
     Block ids — a stable id per paragraph, derived from its text, so
     highlights and comment threads survive edits elsewhere in the post.
  ------------------------------------------------------------------ */
  function hash36(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  var blocks = Array.prototype.slice.call(content.querySelectorAll(BLOCK_SEL)).filter(function (b) {
    return !b.closest("pre") && !b.closest(".sn");
  });
  (function assignIds() {
    var seen = {};
    blocks.forEach(function (b) {
      var holder = b.closest("[data-lang-content]");
      var l = holder ? holder.getAttribute("data-lang-content") : "x";
      var norm = b.textContent.replace(/\s+/g, " ").trim().slice(0, 160);
      var id = l + "-" + hash36(norm);
      seen[id] = (seen[id] || 0) + 1;
      if (seen[id] > 1) id += "-" + seen[id];
      b.setAttribute("data-bid", id);
    });
  })();

  function blockOf(node) {
    var n = node.nodeType === 3 ? node.parentNode : node;
    var b = n && n.closest ? n.closest(BLOCK_SEL) : null;
    if (!b || !content.contains(b) || b.closest("pre") || b.closest(".sn")) return null;
    return b;
  }

  function blockById(id) {
    return content.querySelector('[data-bid="' + id + '"]');
  }

  /* ------------------------------------------------------------------
     Progress bar + table of contents
  ------------------------------------------------------------------ */
  var bar = el("div", "read-progress");
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);

  var toc = el("nav", "post-toc");
  toc.setAttribute("aria-label", "Table of contents");
  document.body.appendChild(toc);
  var tocLinks = [];

  function buildToc() {
    toc.textContent = "";
    tocLinks = [];
    var heads = Array.prototype.slice.call(content.querySelectorAll("h2")).filter(visible);
    if (heads.length < 2) { toc.hidden = true; return; }
    toc.hidden = false;
    toc.appendChild(el("p", "toc-title", T("On this page", "Trong bài này")));
    var ol = el("ol", "toc-list");
    heads.forEach(function (h, i) {
      if (!h.id) h.id = "sec-" + i;
      var li = el("li");
      var a = el("a", "", h.textContent);
      a.href = "#" + h.id;
      li.appendChild(a);
      ol.appendChild(li);
      tocLinks.push({ a: a, h: h });
    });
    toc.appendChild(ol);
    spy();
  }

  var spy = raf(function () {
    var y = window.scrollY;
    var top = content.getBoundingClientRect().top + y;
    var total = content.offsetHeight - window.innerHeight * 0.55;
    var p = total > 0 ? (y - top + 80) / total : 1;
    bar.style.transform = "scaleX(" + Math.max(0, Math.min(1, p)) + ")";

    var current = null;
    tocLinks.forEach(function (t) {
      if (t.h.getBoundingClientRect().top <= 140) current = t;
    });
    tocLinks.forEach(function (t) { t.a.classList.toggle("is-active", t === current); });
  });

  /* ------------------------------------------------------------------
     Highlights: storage
  ------------------------------------------------------------------ */
  var store = [];
  try {
    store = JSON.parse(localStorage.getItem(STORE_KEY) || "[]") || [];
  } catch (e) { store = []; }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
    updateFab();
  }
  function byId(id) {
    for (var i = 0; i < store.length; i++) if (store[i].id === id) return store[i];
    return null;
  }

  /* ---- DOM <-> offsets ---- */
  function offsetIn(block, node, off) {
    var r = document.createRange();
    r.selectNodeContents(block);
    r.setEnd(node, off);
    return r.toString().length;
  }

  function rangeFromOffsets(block, s, e) {
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    var pos = 0;
    var sNode, sOff, eNode, eOff;
    var n;
    while ((n = walker.nextNode())) {
      var len = n.data.length;
      if (!sNode && s <= pos + len) { sNode = n; sOff = s - pos; }
      if (!eNode && e <= pos + len) { eNode = n; eOff = e - pos; break; }
      pos += len;
    }
    if (!sNode || !eNode) return null;
    var r = document.createRange();
    r.setStart(sNode, sOff);
    r.setEnd(eNode, eOff);
    return r;
  }

  function wrapRange(range, h) {
    var root0 = range.commonAncestorContainer;
    if (root0.nodeType === 3) root0 = root0.parentNode;
    var walker = document.createTreeWalker(root0, NodeFilter.SHOW_TEXT);
    var jobs = [];
    var n;
    while ((n = walker.nextNode())) {
      if (!range.intersectsNode(n)) continue;
      var s = n === range.startContainer ? range.startOffset : 0;
      var e = n === range.endContainer ? range.endOffset : n.data.length;
      if (e > s) jobs.push({ n: n, s: s, e: e });
    }
    jobs.forEach(function (j) {
      var mid = j.n;
      if (j.s > 0) mid = j.n.splitText(j.s);
      if (j.e - j.s < mid.data.length) mid.splitText(j.e - j.s);
      var m = el("mark", "hl hl-" + h.color + (h.note ? " has-note" : ""));
      m.setAttribute("data-hl", h.id);
      mid.parentNode.insertBefore(m, mid);
      m.appendChild(mid);
    });
  }

  function unwrap(id) {
    content.querySelectorAll('mark[data-hl="' + id + '"]').forEach(function (m) {
      var p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
  }

  function paint(h) {
    var block = blockById(h.bid);
    if (!block) { h.orphan = true; return false; }
    var r = rangeFromOffsets(block, h.s, h.e);
    if (!r || r.toString() !== h.text) {
      // text moved inside the paragraph? look for it
      var at = block.textContent.indexOf(h.text);
      if (at === -1) { h.orphan = true; return false; }
      h.s = at;
      h.e = at + h.text.length;
      r = rangeFromOffsets(block, h.s, h.e);
      if (!r) { h.orphan = true; return false; }
    }
    h.orphan = false;
    wrapRange(r, h);
    return true;
  }

  function paintAll() {
    store.forEach(function (h) { unwrap(h.id); });
    store.forEach(paint);
    updateFab();
  }

  function createHighlight(range, block, color) {
    var text = range.toString();
    if (!text.trim()) return null;
    var h = {
      id: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      bid: block.getAttribute("data-bid"),
      s: offsetIn(block, range.startContainer, range.startOffset),
      e: offsetIn(block, range.endContainer, range.endOffset),
      text: text,
      color: color,
      note: "",
      t: Date.now()
    };
    store.push(h);
    wrapRange(range, h);
    save();
    return h;
  }

  /* ------------------------------------------------------------------
     Selection toolbar
  ------------------------------------------------------------------ */
  var tb = el("div", "sel-bar");
  tb.setAttribute("role", "toolbar");
  tb.hidden = true;
  document.body.appendChild(tb);

  var tbBtns = {};
  function tbButton(key, cls, glyph, onClick) {
    var b = el("button", "sel-btn " + cls);
    b.type = "button";
    if (glyph) b.textContent = glyph;
    b.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep the selection alive
    b.addEventListener("click", onClick);
    tb.appendChild(b);
    tbBtns[key] = b;
    return b;
  }

  var pending = null; // { range, block }

  COLORS.forEach(function (c) {
    tbButton("c-" + c, "sel-dot sel-" + c, "", function () {
      if (!pending) return;
      createHighlight(pending.range, pending.block, c);
      clearSelection();
    });
  });
  tb.appendChild(el("span", "sel-sep"));
  tbButton("note", "sel-act", "✎", function () {
    if (!pending) return;
    var h = createHighlight(pending.range, pending.block, "yellow");
    clearSelection();
    if (h) openPopover(h.id, true);
  });
  tbButton("quote", "sel-act", "❝", function () {
    if (!pending) return;
    var q = "“" + pending.range.toString().trim() + "”\n— " + (document.querySelector(".post-title") ? document.querySelector(".post-title").textContent.trim() : document.title) + "\n" + location.href.split("#")[0];
    copy(q, T("Quote copied", "Đã sao chép trích dẫn"));
    clearSelection();
  });
  tbButton("link", "sel-act", "🔗", function () {
    if (!pending) return;
    copy(passageLink(pending.range.toString()), T("Link to passage copied", "Đã sao chép link tới đoạn này"));
    clearSelection();
  });
  tbButton("comment", "sel-act", "💬", function () {
    if (!pending) return;
    openComments(pending.block, pending.range.toString().trim());
    clearSelection();
  });

  function refreshLabels() {
    COLORS.forEach(function (c) { tbBtns["c-" + c].title = T("Highlight", "Highlight") + " · " + c; tbBtns["c-" + c].setAttribute("aria-label", tbBtns["c-" + c].title); });
    var lab = {
      note: T("Highlight with a private note", "Highlight kèm ghi chú riêng"),
      quote: T("Copy as quote", "Sao chép làm trích dẫn"),
      link: T("Copy link to this passage", "Sao chép link tới đoạn này"),
      comment: T("Comment on this paragraph", "Bình luận về đoạn này")
    };
    Object.keys(lab).forEach(function (k) { tbBtns[k].title = lab[k]; tbBtns[k].setAttribute("aria-label", lab[k]); });
    toc.setAttribute("aria-label", T("Table of contents", "Mục lục"));
  }

  function passageLink(text) {
    var t = text.replace(/\s+/g, " ").trim();
    var frag;
    if (t.length <= 120) {
      frag = encodeURIComponent(t).replace(/-/g, "%2D");
    } else {
      var a = t.slice(0, 40).trim();
      var z = t.slice(-40).trim();
      frag = encodeURIComponent(a).replace(/-/g, "%2D") + "," + encodeURIComponent(z).replace(/-/g, "%2D");
    }
    return location.href.split("#")[0] + "#:~:text=" + frag;
  }

  function clearSelection() {
    var s = window.getSelection();
    if (s) s.removeAllRanges();
    hideToolbar();
  }

  function hideToolbar() {
    tb.hidden = true;
    pending = null;
  }

  function showToolbarFor(range) {
    var rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { hideToolbar(); return; }
    tb.hidden = false;
    var w = tb.offsetWidth;
    var touch = window.matchMedia("(hover: none)").matches;
    var x = rect.left + rect.width / 2 - w / 2;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    // on touch devices the OS menu sits above the selection, so go below
    var y = touch ? rect.bottom + 14 : rect.top - tb.offsetHeight - 10;
    if (y < 8) y = rect.bottom + 12;
    tb.style.left = x + window.scrollX + "px";
    tb.style.top = y + window.scrollY + "px";
  }

  var onSelectionChange = debounce(function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { hideToolbar(); return; }
    var r = sel.getRangeAt(0);
    if (!content.contains(r.commonAncestorContainer)) { hideToolbar(); return; }
    var block = blockOf(r.startContainer);
    if (!block || !visible(block)) { hideToolbar(); return; }

    // a selection that spans paragraphs is trimmed to the first paragraph
    var endBlock = blockOf(r.endContainer);
    var use = r;
    if (endBlock !== block) {
      use = document.createRange();
      use.selectNodeContents(block);
      use.setStart(r.startContainer, r.startOffset);
    }
    if (!use.toString().trim()) { hideToolbar(); return; }
    pending = { range: use.cloneRange(), block: block };
    showToolbarFor(use);
  }, 140);

  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("scroll", function () { if (!tb.hidden) hideToolbar(); }, { passive: true });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { hideToolbar(); closePopover(); }
  });

  /* ------------------------------------------------------------------
     Highlight popover (colour / note / delete)
  ------------------------------------------------------------------ */
  var pop = el("div", "hl-pop");
  pop.hidden = true;
  pop.setAttribute("role", "dialog");
  document.body.appendChild(pop);
  var popId = null;

  var popDots = el("div", "hl-pop-dots");
  COLORS.forEach(function (c) {
    var b = el("button", "sel-btn sel-dot sel-" + c);
    b.type = "button";
    b.setAttribute("data-c", c);
    b.addEventListener("click", function () {
      var h = byId(popId);
      if (!h) return;
      h.color = c;
      content.querySelectorAll('mark[data-hl="' + h.id + '"]').forEach(function (m) {
        m.className = "hl hl-" + c + (h.note ? " has-note" : "");
      });
      save();
      syncPopDots();
    });
    popDots.appendChild(b);
  });
  var popDel = el("button", "hl-pop-del");
  popDel.type = "button";
  popDots.appendChild(popDel);
  var popNote = el("textarea", "hl-pop-note");
  popNote.rows = 3;
  var popHint = el("p", "hl-pop-hint");
  pop.appendChild(popDots);
  pop.appendChild(popNote);
  pop.appendChild(popHint);

  function syncPopDots() {
    var h = byId(popId);
    popDots.querySelectorAll(".sel-dot").forEach(function (b) {
      b.classList.toggle("is-on", !!h && b.getAttribute("data-c") === h.color);
    });
  }

  popNote.addEventListener("input", debounce(function () {
    var h = byId(popId);
    if (!h) return;
    h.note = popNote.value.trim();
    content.querySelectorAll('mark[data-hl="' + h.id + '"]').forEach(function (m) {
      m.classList.toggle("has-note", !!h.note);
    });
    save();
  }, 250));

  popDel.addEventListener("click", function () {
    var h = byId(popId);
    if (!h) return;
    unwrap(h.id);
    store = store.filter(function (x) { return x.id !== h.id; });
    save();
    closePopover();
    toast(T("Highlight removed", "Đã xóa highlight"));
  });

  function openPopover(id, focusNote) {
    var h = byId(id);
    var marks = content.querySelectorAll('mark[data-hl="' + id + '"]');
    if (!h || !marks.length) return;
    popId = id;
    popNote.value = h.note || "";
    popNote.placeholder = T("Private note — only you see this", "Ghi chú riêng — chỉ bạn thấy");
    popDel.textContent = T("Remove", "Xóa");
    popHint.textContent = T("Saved in this browser only.", "Chỉ lưu trong trình duyệt này.");
    syncPopDots();
    pop.hidden = false;

    var rect = marks[0].getBoundingClientRect();
    var w = pop.offsetWidth;
    var x = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left));
    var y = rect.bottom + 8;
    if (y + pop.offsetHeight > window.innerHeight - 8) y = Math.max(8, rect.top - pop.offsetHeight - 8);
    pop.style.left = x + window.scrollX + "px";
    pop.style.top = y + window.scrollY + "px";
    if (focusNote) popNote.focus();
  }

  function closePopover() {
    if (pop.hidden) return;
    pop.hidden = true;
    popId = null;
  }

  content.addEventListener("click", function (e) {
    var m = e.target.closest ? e.target.closest("mark.hl") : null;
    if (!m) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    openPopover(m.getAttribute("data-hl"), false);
  });
  document.addEventListener("mousedown", function (e) {
    if (!pop.hidden && !pop.contains(e.target) && !(e.target.closest && e.target.closest("mark.hl"))) closePopover();
  });

  /* ------------------------------------------------------------------
     "My highlights" list
  ------------------------------------------------------------------ */
  var fab = el("button", "hl-fab");
  fab.type = "button";
  fab.hidden = true;
  document.body.appendChild(fab);

  var list = el("dialog", "rd-dialog hl-dialog");
  list.setAttribute("aria-labelledby", "hl-list-title");
  var listInner = el("div", "rd-dialog-inner");
  list.appendChild(listInner);
  document.body.appendChild(list);

  function updateFab() {
    fab.hidden = store.length === 0;
    fab.textContent = "✎ " + store.length;
    fab.title = T("My highlights & notes", "Highlight & ghi chú của tôi");
    fab.setAttribute("aria-label", fab.title);
  }

  function renderList() {
    listInner.textContent = "";
    var close = el("button", "rd-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", function () { list.close(); });
    listInner.appendChild(close);

    var h = el("h3", "rd-title", T("My highlights & notes", "Highlight & ghi chú của tôi"));
    h.id = "hl-list-title";
    listInner.appendChild(h);
    listInner.appendChild(el("p", "rd-sub", T("Private to this browser. Nothing here is uploaded.", "Riêng tư trong trình duyệt này. Không có gì được tải lên.")));

    if (!store.length) {
      listInner.appendChild(el("p", "rd-empty", T("Nothing yet — select any text in the post to start.", "Chưa có gì — bôi đen một đoạn chữ trong bài để bắt đầu.")));
      return;
    }

    var ul = el("ul", "hl-items");
    store.slice().sort(function (a, b) {
      var ba = blockById(a.bid), bb = blockById(b.bid);
      if (ba && bb && ba !== bb) return ba.compareDocumentPosition(bb) & 4 ? -1 : 1;
      return a.s - b.s;
    }).forEach(function (it) {
      var li = el("li", "hl-item hl-bar-" + it.color);
      li.appendChild(el("p", "hl-item-text", "“" + it.text + "”"));
      if (it.note) li.appendChild(el("p", "hl-item-note", it.note));
      if (it.orphan) li.appendChild(el("p", "hl-item-orphan", T("Paragraph was edited — can't be placed any more.", "Đoạn văn đã được sửa — không định vị lại được nữa.")));
      var acts = el("div", "hl-item-acts");
      if (!it.orphan) {
        var go = el("button", "", T("Jump to", "Đến đoạn"));
        go.type = "button";
        go.addEventListener("click", function () { list.close(); jumpTo(it.id); });
        acts.appendChild(go);
      }
      var del = el("button", "", T("Remove", "Xóa"));
      del.type = "button";
      del.addEventListener("click", function () {
        unwrap(it.id);
        store = store.filter(function (x) { return x.id !== it.id; });
        save();
        renderList();
      });
      acts.appendChild(del);
      li.appendChild(acts);
      ul.appendChild(li);
    });
    listInner.appendChild(ul);

    var foot = el("div", "hl-foot");
    var md = el("button", "hl-foot-btn", T("Copy as Markdown", "Sao chép dạng Markdown"));
    md.type = "button";
    md.addEventListener("click", function () { copy(toMarkdown(), T("Markdown copied", "Đã sao chép Markdown")); });
    var clear = el("button", "hl-foot-btn is-danger", T("Clear all", "Xóa tất cả"));
    clear.type = "button";
    clear.addEventListener("click", function () {
      if (!window.confirm(T("Remove every highlight and note on this post?", "Xóa mọi highlight và ghi chú của bài này?"))) return;
      store.forEach(function (x) { unwrap(x.id); });
      store = [];
      save();
      renderList();
    });
    foot.appendChild(md);
    foot.appendChild(clear);
    listInner.appendChild(foot);
  }

  function toMarkdown() {
    var titleEl = document.querySelector(".post-title");
    var out = "# " + T("Highlights", "Highlights") + " — " + (titleEl ? titleEl.textContent.trim() : document.title) + "\n" + location.href.split("#")[0] + "\n\n";
    store.forEach(function (it) {
      out += "> " + it.text.replace(/\n+/g, " ") + "\n";
      if (it.note) out += "\n" + it.note + "\n";
      out += "\n";
    });
    return out.trim() + "\n";
  }

  function jumpTo(id) {
    function go() {
      var m = content.querySelector('mark[data-hl="' + id + '"]');
      if (!m) return;
      m.scrollIntoView({ block: "center", behavior: "smooth" });
      m.classList.add("is-flash");
      setTimeout(function () { m.classList.remove("is-flash"); }, 1600);
    }
    var m0 = content.querySelector('mark[data-hl="' + id + '"]');
    if (m0 && !visible(m0)) {
      // it lives in the other language version — switch, then jump
      var tg = document.querySelector("[data-lang-toggle]");
      if (tg) tg.click();
      setTimeout(go, 120);
    } else {
      go();
    }
  }

  fab.addEventListener("click", function () {
    renderList();
    list.showModal();
  });
  list.addEventListener("click", function (e) { if (e.target === list) list.close(); });

  /* ------------------------------------------------------------------
     Public per-paragraph comments (giscus, one discussion per paragraph)
     We build the iframe ourselves because giscus' client script only
     supports one widget per page (the post's main comment box).
  ------------------------------------------------------------------ */
  var cdlg = el("dialog", "rd-dialog pc-dialog");
  cdlg.setAttribute("aria-labelledby", "pc-title");
  var cin = el("div", "rd-dialog-inner");
  cdlg.appendChild(cin);
  document.body.appendChild(cdlg);
  cdlg.addEventListener("click", function (e) { if (e.target === cdlg) cdlg.close(); });
  cdlg.addEventListener("close", function () { cin.textContent = ""; });

  var giscusFrame = null;
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://giscus.app" || !giscusFrame) return;
    if (e.source !== giscusFrame.contentWindow) return;
    // keep the page's main giscus box from reacting to this widget's messages
    e.stopImmediatePropagation();
    var d = e.data && e.data.giscus;
    if (d && typeof d.resizeHeight === "number") giscusFrame.style.height = d.resizeHeight + "px";
  }, true);

  function giscusConfig() {
    var s = document.querySelector('script[src*="giscus.app/client.js"]');
    function a(name, fallback) { return (s && s.getAttribute("data-" + name)) || fallback; }
    return {
      repo: a("repo", "vile-blog/vile-blog.github.io"),
      repoId: a("repo-id", "R_kgDOUZ4cEg"),
      category: a("category", "Announcements"),
      categoryId: a("category-id", "DIC_kwDOUZ4cEs4DFkFR")
    };
  }

  function openComments(block, quote) {
    var bid = block.getAttribute("data-bid");
    var cfg = giscusConfig();
    var theme = root.getAttribute("data-theme") === "light" ? "light" : "dark";
    var session = "";
    try { session = localStorage.getItem("giscus-session") || ""; } catch (e) { /* ignore */ }

    var origin = new URL(location.href);
    origin.searchParams.delete("giscus");
    origin.hash = "";

    var params = new URLSearchParams({
      origin: origin.toString(),
      session: session,
      theme: theme,
      reactionsEnabled: "1",
      emitMetadata: "0",
      inputPosition: "top",
      repo: cfg.repo,
      repoId: cfg.repoId,
      category: cfg.category,
      categoryId: cfg.categoryId,
      mapping: "specific",
      term: location.pathname + "#" + bid,
      strict: "0",
      description: "",
      backLink: origin.toString()
    });

    cin.textContent = "";
    var close = el("button", "rd-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", function () { cdlg.close(); });
    cin.appendChild(close);

    var h = el("h3", "rd-title", T("Comment on this paragraph", "Bình luận về đoạn này"));
    h.id = "pc-title";
    cin.appendChild(h);

    var text = (quote || block.textContent).replace(/\s+/g, " ").trim();
    if (text.length > 260) text = text.slice(0, 257) + "…";
    cin.appendChild(el("blockquote", "pc-quote", text));
    cin.appendChild(el("p", "rd-sub", T(
      "Public thread for just this paragraph — it lives in GitHub Discussions and needs a GitHub sign-in.",
      "Thảo luận công khai riêng cho đoạn này — lưu trong GitHub Discussions, cần đăng nhập GitHub."
    )));

    giscusFrame = el("iframe", "pc-frame");
    giscusFrame.title = T("Comments on this paragraph", "Bình luận về đoạn này");
    giscusFrame.setAttribute("loading", "lazy");
    giscusFrame.setAttribute("allow", "clipboard-write");
    giscusFrame.src = "https://giscus.app/" + lang() + "/widget?" + params.toString();
    cin.appendChild(giscusFrame);

    if (!cdlg.open) cdlg.showModal();
  }

  /* hover affordance in the left margin (mouse devices only) */
  var floatBtn = el("button", "pc-float");
  floatBtn.type = "button";
  floatBtn.hidden = true;
  floatBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"></path></svg>';
  content.appendChild(floatBtn);
  var hoverBlock = null;

  floatBtn.addEventListener("click", function () {
    if (hoverBlock) openComments(hoverBlock, "");
  });

  if (window.matchMedia("(hover: hover)").matches) {
    content.addEventListener("mousemove", function (e) {
      if (e.target.closest && e.target.closest(".pc-float")) return;
      var b = blockOf(e.target);
      if (!b || !visible(b) || b.matches("h2, h3, h4, h5")) {
        if (!b) floatBtn.hidden = true;
        return;
      }
      if (b === hoverBlock && !floatBtn.hidden) return;
      hoverBlock = b;
      var cr = content.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      floatBtn.hidden = false;
      floatBtn.style.top = br.top - cr.top + 2 + "px";
      floatBtn.title = T("Comment on this paragraph", "Bình luận về đoạn này");
      floatBtn.setAttribute("aria-label", floatBtn.title);
    });
    content.addEventListener("mouseleave", function (e) {
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".pc-float")) return;
      floatBtn.hidden = true;
    });
  }

  /* ------------------------------------------------------------------
     Wire-up
  ------------------------------------------------------------------ */
  function onLangChange() {
    hideToolbar();
    closePopover();
    buildToc();
    refreshLabels();
    updateFab();
    layoutSidenotesSoon();
    if (list.open) renderList();
  }

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].attributeName === "data-lang") { onLangChange(); return; }
    }
  }).observe(root, { attributes: true });

  window.addEventListener("scroll", spy, { passive: true });
  window.addEventListener("resize", function () { spy(); layoutSidenotesSoon(); });
  window.addEventListener("load", function () { layoutSidenotes(); spy(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutSidenotes);

  refreshLabels();
  buildToc();
  paintAll();
  layoutSidenotes();
  spy();
})();

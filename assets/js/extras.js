/* ==========================================================================
   Site extras (loaded on every page)
     1. Shared data loader  — search.json, fetched lazily
     2. Command palette     — Ctrl/Cmd+K or "/"
     3. Hero terminal       — type `help`
     4. Knowledge graph     — posts <-> shared tags (blog page)
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var baseMeta = document.querySelector('meta[name="site-base"]');
  var base = baseMeta ? baseMeta.content : "/";
  if (base.charAt(base.length - 1) !== "/") base += "/";

  function lang() {
    return root.getAttribute("data-lang") === "vi" ? "vi" : "en";
  }

  function tr(en, vi) {
    return lang() === "vi" && vi ? vi : en;
  }

  /* Lower-case + strip diacritics so "kien truc" finds "kiến trúc". */
  function fold(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function isTyping(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  /* ------------------------------------------------------------------
     1. Shared data
  ------------------------------------------------------------------ */
  var indexPromise = null;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(base + "search.json")
        .then(function (r) {
          if (!r.ok) throw new Error("search.json " + r.status);
          return r.json();
        })
        .then(function (posts) {
          posts.forEach(function (p) {
            p._title = fold(p.t + " " + p.tv);
            p._tags = fold((p.g || []).join(" "));
            p._exc = fold(p.e + " " + p.ev);
            p._text = fold(p.x);
          });
          return posts;
        })
        .catch(function () {
          return [];
        });
    }
    return indexPromise;
  }

  window.ViSite = { base: base, lang: lang, tr: tr, fold: fold, loadIndex: loadIndex };

  function postTitle(p) {
    return lang() === "vi" ? p.tv || p.t : p.t;
  }

  function onHome() {
    return location.pathname === base || location.pathname === base + "index.html";
  }

  function goTo(path, hash) {
    if (path === base && onHome() && hash) {
      location.hash = hash;
    } else {
      location.href = path + (hash || "");
    }
  }

  /* ------------------------------------------------------------------
     2. Command palette
  ------------------------------------------------------------------ */
  var pal = document.querySelector("[data-pal]");

  if (pal && typeof pal.showModal === "function") {
    var palInput = pal.querySelector("[data-pal-input]");
    var palList = pal.querySelector("[data-pal-list]");
    var items = []; // current rows: { label, hint, icon, run }
    var active = 0;

    var COMMANDS = [
      { en: "Go to Home", vi: "Về trang chủ", icon: "⌂", kw: "home top", run: function () { goTo(base, ""); } },
      { en: "Go to About", vi: "Tới phần Giới thiệu", icon: "#", kw: "about bio", run: function () { goTo(base, "#about"); } },
      { en: "Go to Roadmap", vi: "Tới Lộ trình", icon: "#", kw: "roadmap career timeline lo trinh", run: function () { goTo(base, "#roadmap"); } },
      { en: "Go to Projects", vi: "Tới Dự án", icon: "#", kw: "projects du an", run: function () { goTo(base, "#projects"); } },
      { en: "Go to Blog", vi: "Tới Blog", icon: "#", kw: "blog posts", run: function () { goTo(base, "#blog"); } },
      { en: "Go to Contact", vi: "Tới Liên hệ", icon: "#", kw: "contact email lien he", run: function () { goTo(base, "#contact"); } },
      { en: "Browse all posts", vi: "Xem tất cả bài viết", icon: "→", kw: "all posts archive", run: function () { goTo(base + "blog/", ""); } },
      { en: "Open the knowledge graph", vi: "Mở đồ thị tri thức", icon: "◎", kw: "graph map tags do thi", run: function () { goTo(base + "blog/", "#graph"); } },
      { en: "Browse book & paper notes", vi: "Xem ghi chú sách & bài báo", icon: "→", kw: "notes ddia books ghi chu", run: function () { goTo(base + "notes/", ""); } },
      { en: "Toggle light / dark theme", vi: "Đổi giao diện sáng / tối", icon: "◐", kw: "theme dark light mode", run: function () { clickIf("[data-theme-toggle]"); } },
      { en: "Switch language (EN / VI)", vi: "Đổi ngôn ngữ (EN / VI)", icon: "文", kw: "language vietnamese english tieng viet", run: function () { clickIf("[data-lang-toggle]"); } },
      { en: "Open GitHub profile", vi: "Mở GitHub", icon: "↗", kw: "github code", run: function () { clickIf('a[href*="github.com/"]'); } },
      { en: "Send an email", vi: "Gửi email", icon: "✉", kw: "mail contact", run: function () { clickIf('a[href^="mailto:"]', true); } }
    ];

    function clickIf(sel, fallbackToFooter) {
      var el = document.querySelector(sel);
      if (el) el.click();
      else if (fallbackToFooter) goTo(base, "#contact");
    }

    function renderList() {
      palList.textContent = "";
      items.forEach(function (it, i) {
        var li = document.createElement("li");
        li.className = "pal-item" + (i === active ? " is-active" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === active ? "true" : "false");
        li.id = "pal-opt-" + i;

        var ic = document.createElement("span");
        ic.className = "pal-icon";
        ic.textContent = it.icon;
        ic.setAttribute("aria-hidden", "true");

        var body = document.createElement("span");
        body.className = "pal-body";
        var label = document.createElement("span");
        label.className = "pal-label";
        label.textContent = it.label;
        body.appendChild(label);
        if (it.snippet) {
          var sn = document.createElement("span");
          sn.className = "pal-snippet";
          appendHighlighted(sn, it.snippet, it.terms);
          body.appendChild(sn);
        }

        var hint = document.createElement("span");
        hint.className = "pal-hint";
        hint.textContent = it.hint || "";

        li.appendChild(ic);
        li.appendChild(body);
        li.appendChild(hint);
        li.addEventListener("mousemove", function () {
          if (active !== i) setActive(i, false);
        });
        li.addEventListener("click", function () {
          runItem(i);
        });
        palList.appendChild(li);
      });
      if (!items.length) {
        var empty = document.createElement("li");
        empty.className = "pal-empty";
        empty.textContent = tr("No matches. Try a different word.", "Không có kết quả. Thử từ khóa khác nhé.");
        palList.appendChild(empty);
      }
      palInput.setAttribute("aria-activedescendant", items.length ? "pal-opt-" + active : "");
    }

    function setActive(i, scroll) {
      var rows = palList.querySelectorAll(".pal-item");
      if (!rows.length) return;
      active = (i + rows.length) % rows.length;
      rows.forEach(function (r, idx) {
        r.classList.toggle("is-active", idx === active);
        r.setAttribute("aria-selected", idx === active ? "true" : "false");
      });
      palInput.setAttribute("aria-activedescendant", "pal-opt-" + active);
      if (scroll !== false) rows[active].scrollIntoView({ block: "nearest" });
    }

    function runItem(i) {
      var it = items[i];
      if (!it) return;
      pal.close();
      it.run();
    }

    /* Wrap occurrences of the (folded) query terms in <mark>. Because fold()
       keeps string length for the characters we care about, we can map match
       positions straight back onto the original text. */
    function appendHighlighted(node, text, terms) {
      var folded = fold(text);
      if (folded.length !== text.length || !terms || !terms.length) {
        node.textContent = text;
        return;
      }
      var marks = new Array(text.length);
      terms.forEach(function (t) {
        if (!t) return;
        var from = 0;
        var at;
        while ((at = folded.indexOf(t, from)) !== -1) {
          for (var k = at; k < at + t.length; k++) marks[k] = true;
          from = at + t.length;
        }
      });
      var buf = "";
      var on = false;
      function flush() {
        if (!buf) return;
        if (on) {
          var m = document.createElement("mark");
          m.textContent = buf;
          node.appendChild(m);
        } else {
          node.appendChild(document.createTextNode(buf));
        }
        buf = "";
      }
      for (var i = 0; i < text.length; i++) {
        var flag = !!marks[i];
        if (flag !== on) {
          flush();
          on = flag;
        }
        buf += text.charAt(i);
      }
      flush();
    }

    function snippetFor(p, terms) {
      var text = p.x || "";
      var f = p._text;
      if (f.length !== text.length) return "";
      var best = -1;
      for (var i = 0; i < terms.length; i++) {
        var at = f.indexOf(terms[i]);
        if (at !== -1 && (best === -1 || at < best)) best = at;
      }
      if (best === -1) return "";
      var start = Math.max(0, best - 48);
      var end = Math.min(text.length, best + 96);
      return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
    }

    function scorePost(p, terms) {
      var total = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i];
        var s = 0;
        if (p._title.indexOf(t) !== -1) s += p._title.indexOf(t) === 0 ? 14 : 10;
        if (p._tags.indexOf(t) !== -1) s += 6;
        if (p._exc.indexOf(t) !== -1) s += 3;
        if (p._text.indexOf(t) !== -1) s += 1;
        if (!s) return 0; // every term must match somewhere
        total += s;
      }
      return total;
    }

    function postItem(p, terms) {
      return {
        label: postTitle(p),
        icon: p.c === "book-notes" ? "▤" : "✎",
        hint: p.d,
        snippet: terms && terms.length ? snippetFor(p, terms) : "",
        terms: terms,
        run: function () { location.href = p.u; }
      };
    }

    function update() {
      var q = fold(palInput.value).trim();
      var terms = q ? q.split(/\s+/) : [];

      loadIndex().then(function (posts) {
        // the input may have changed while the index was loading
        if (fold(palInput.value).trim() !== q) return;

        var rows = [];
        COMMANDS.forEach(function (c) {
          var hay = fold(c.en + " " + c.vi + " " + c.kw);
          var ok = terms.every(function (t) { return hay.indexOf(t) !== -1; });
          if (ok) {
            rows.push({
              label: tr(c.en, c.vi),
              icon: c.icon,
              hint: tr("command", "lệnh"),
              run: c.run,
              _cmd: true
            });
          }
        });

        var postRows;
        if (!terms.length) {
          postRows = posts.slice(0, 5).map(function (p) { return postItem(p, null); });
          rows = rows.slice(0, 7).concat(postRows);
        } else {
          postRows = posts
            .map(function (p) { return { p: p, s: scorePost(p, terms) }; })
            .filter(function (r) { return r.s > 0; })
            .sort(function (a, b) { return b.s - a.s; })
            .slice(0, 8)
            .map(function (r) { return postItem(r.p, terms); });
          // posts first when searching, then matching commands
          rows = postRows.concat(rows.slice(0, 5));
        }

        items = rows;
        active = 0;
        renderList();
      });
    }

    function openPalette() {
      if (pal.open) return;
      palInput.value = "";
      palInput.placeholder = palInput.getAttribute("data-ph-" + lang()) || palInput.placeholder;
      pal.showModal();
      document.body.classList.add("pal-lock");
      update();
      palInput.focus();
    }

    document.addEventListener("keydown", function (e) {
      var isK = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey);
      if (isK) {
        e.preventDefault();
        if (pal.open) pal.close();
        else openPalette();
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !pal.open && !isTyping(document.activeElement)) {
        e.preventDefault();
        openPalette();
      }
    });

    document.querySelectorAll("[data-palette-open]").forEach(function (b) {
      b.addEventListener("click", openPalette);
    });

    palInput.addEventListener("input", update);
    palInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
      else if (e.key === "Enter") { e.preventDefault(); runItem(active); }
    });

    pal.addEventListener("click", function (e) {
      if (e.target === pal) pal.close();
    });
    pal.addEventListener("close", function () {
      document.body.classList.remove("pal-lock");
    });
  }

  /* ------------------------------------------------------------------
     3. Hero terminal
  ------------------------------------------------------------------ */
  (function initTerminal() {
    var shell = document.querySelector("[data-term]");
    if (!shell) return;

    var log = shell.querySelector("[data-term-log]");
    var form = shell.querySelector("[data-term-form]");
    var input = shell.querySelector("[data-term-input]");
    var dataEl = document.getElementById("term-data");
    var D = { author: {}, projects: [], roadmap: [] };
    try {
      if (dataEl) D = JSON.parse(dataEl.textContent);
    } catch (e) { /* keep defaults */ }

    var history = [];
    var hIndex = 0;

    function print(text, cls) {
      var d = document.createElement("div");
      d.className = "term-line" + (cls ? " " + cls : "");
      d.textContent = text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d;
    }

    function printLink(label, href) {
      var d = document.createElement("div");
      d.className = "term-line";
      var a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      d.appendChild(a);
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }

    function pad(n) { return n < 10 ? "0" + n : String(n); }

    function findProject(q) {
      q = fold(q);
      return D.projects.filter(function (p) { return fold(p.name).indexOf(q) !== -1; })[0];
    }

    var SECTIONS = {
      about: "#about", roadmap: "#roadmap", projects: "#projects", blog: "#blog", contact: "#contact"
    };

    var commands = {
      help: function () {
        [
          ["whoami", tr("who is this?", "đây là ai?")],
          ["ls [projects|posts|roadmap]", tr("list things", "liệt kê")],
          ["cat <roadmap|about|project>", tr("read something", "đọc nội dung")],
          ["open <project|post #|section>", tr("go there", "mở ra")],
          ["search <words>", tr("search every post", "tìm trong mọi bài viết")],
          ["theme [dark|light]", tr("switch theme", "đổi giao diện")],
          ["lang [en|vi]", tr("switch language", "đổi ngôn ngữ")],
          ["contact", tr("how to reach me", "cách liên hệ")],
          ["clear", tr("clear the screen", "xóa màn hình")]
        ].forEach(function (r) { print("  " + (r[0] + "                              ").slice(0, 30) + r[1], "dim"); });
        print(tr("Tip: Ctrl+K opens the full search palette.", "Mẹo: Ctrl+K mở bảng tìm kiếm đầy đủ."), "dim");
      },

      whoami: function () {
        var a = D.author;
        print((a.name || "Vi Le") + " — " + tr(a.role, a.role_vi) + ", " + tr(a.tagline, a.tagline_vi));
      },

      ls: function (args) {
        var what = fold(args[0] || "");
        if (!what) {
          print("projects/  posts/  roadmap  about  contact");
        } else if (what.indexOf("proj") === 0) {
          D.projects.forEach(function (p) { print("  " + p.name); });
        } else if (what.indexOf("road") === 0) {
          commands.cat(["roadmap"]);
        } else if (what.indexOf("post") === 0 || what.indexOf("note") === 0 || what === "blog") {
          var loading = print(tr("loading…", "đang tải…"), "dim");
          loadIndex().then(function (posts) {
            if (loading.parentNode) loading.parentNode.removeChild(loading);
            posts.slice(0, 10).forEach(function (p, i) { print("  " + pad(i + 1) + "  " + postTitle(p)); });
            print(tr("open <number> to read one", "gõ open <số> để đọc"), "dim");
          });
        } else {
          print("ls: " + args[0] + ": " + tr("No such directory", "Không có thư mục này"), "err");
        }
      },

      cat: function (args) {
        var what = fold(args.join(" "));
        if (!what) { print("cat: " + tr("missing operand", "thiếu đối số"), "err"); return; }
        if (what === "roadmap") {
          D.roadmap.forEach(function (m, i) {
            print(pad(i + 1) + " [" + m.status + "] " + m.label + "  " + tr(m.title, m.title_vi));
          });
        } else if (what === "about") {
          print(tr(D.author.bio, D.author.bio_vi));
        } else {
          var p = findProject(what);
          if (p) {
            print(p.name, "hl");
            print(tr(p.description, p.description_vi));
          } else {
            print("cat: " + args.join(" ") + ": " + tr("No such file", "Không có tệp này"), "err");
          }
        }
      },

      open: function (args) {
        var what = fold(args.join(" "));
        if (!what) { print("open: " + tr("what should I open?", "mở cái gì đây?"), "err"); return; }
        if (SECTIONS[what]) {
          print(tr("opening ", "đang mở ") + what + "…", "dim");
          goTo(base, SECTIONS[what]);
          return;
        }
        if (what === "notes") { goTo(base + "notes/", ""); return; }
        if (/^\d+$/.test(what)) {
          loadIndex().then(function (posts) {
            var p = posts[parseInt(what, 10) - 1];
            if (p) { print(tr("opening ", "đang mở ") + postTitle(p) + "…", "dim"); location.href = p.u; }
            else print("open: " + what + ": " + tr("no such post", "không có bài này"), "err");
          });
          return;
        }
        var proj = findProject(what);
        if (proj) {
          var url = proj.demo || proj.github;
          if (url) { printLink("→ " + url, url); window.open(url, "_blank", "noopener"); }
          else print(proj.name + ": " + tr("no public link yet", "chưa có link công khai"), "dim");
          return;
        }
        print("open: " + args.join(" ") + ": " + tr("not found", "không tìm thấy"), "err");
      },

      search: function (args) {
        var terms = fold(args.join(" ")).split(/\s+/).filter(Boolean);
        if (!terms.length) { print("search: " + tr("give me a word", "cho mình một từ khóa"), "err"); return; }
        loadIndex().then(function (posts) {
          var hits = posts.filter(function (p) {
            return terms.every(function (t) {
              return (p._title + " " + p._tags + " " + p._exc + " " + p._text).indexOf(t) !== -1;
            });
          }).slice(0, 6);
          if (!hits.length) { print(tr("no matches", "không có kết quả"), "dim"); return; }
          hits.forEach(function (p) { printLink("  " + postTitle(p), p.u); });
        });
      },

      theme: function (args) {
        var want = args[0];
        var cur = root.getAttribute("data-theme") === "light" ? "light" : "dark";
        if (want && want !== "dark" && want !== "light") { print("theme: dark | light", "err"); return; }
        if (!want || want !== cur) clickIf("[data-theme-toggle]");
        print(tr("theme → ", "giao diện → ") + (want || (cur === "dark" ? "light" : "dark")), "dim");
      },

      lang: function (args) {
        var want = args[0];
        if (want && want !== "en" && want !== "vi") { print("lang: en | vi", "err"); return; }
        if (!want || want !== lang()) clickIf("[data-lang-toggle]");
        print("lang → " + (want || (lang() === "en" ? "vi" : "en")), "dim");
      },

      contact: function () {
        if (D.author.email) printLink("  " + D.author.email, "mailto:" + D.author.email);
        if (D.author.github) printLink("  github.com/" + D.author.github, "https://github.com/" + D.author.github);
        if (D.author.linkedin) printLink("  " + D.author.linkedin.replace(/^https?:\/\//, ""), D.author.linkedin);
      },

      clear: function () {
        log.textContent = "";
      },

      sudo: function (args) {
        if (fold(args.join(" ")).replace(/\s+/g, " ") === "hire me") {
          print("[sudo] password for recruiter: ********", "dim");
          print(tr("Permission granted. Opening contact…", "Đã cấp quyền. Đang mở phần liên hệ…"), "hl");
          setTimeout(function () { goTo(base, "#contact"); }, 700);
        } else {
          print(tr("recruiter is not in the sudoers file. This incident will be reported.", "recruiter không có trong sudoers. Sự cố này sẽ được báo cáo."), "err");
        }
      }
    };

    function clickIf(sel) {
      var el = document.querySelector(sel);
      if (el) el.click();
    }

    function run(line) {
      var parts = line.trim().split(/\s+/);
      var name = parts.shift().toLowerCase();
      if (!name) return;
      print("$ " + line, "cmd");
      if (commands.hasOwnProperty(name)) commands[name](parts);
      else print(name + ": " + tr("command not found. Try `help`.", "không có lệnh này. Thử `help` nhé."), "err");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var line = input.value;
      input.value = "";
      if (line.trim()) {
        history.push(line);
        hIndex = history.length;
      }
      run(line);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp" && history.length) {
        e.preventDefault();
        hIndex = Math.max(0, hIndex - 1);
        input.value = history[hIndex] || "";
      } else if (e.key === "ArrowDown" && history.length) {
        e.preventDefault();
        hIndex = Math.min(history.length, hIndex + 1);
        input.value = history[hIndex] || "";
      }
    });

    // clicking anywhere on the terminal focuses the prompt (but don't steal text selection)
    shell.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      if (String(window.getSelection && window.getSelection()).length) return;
      input.focus({ preventScroll: true });
    });
  })();

  /* ------------------------------------------------------------------
     4. Knowledge graph: posts <-> the tags they share
  ------------------------------------------------------------------ */
  (function initGraph() {
    var host = document.querySelector("[data-graph]");
    if (!host) return;

    var SVG = "http://www.w3.org/2000/svg";
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    loadIndex().then(function (posts) {
      if (!posts.length) { host.hidden = true; return; }

      // tags used by 2+ posts become hubs; one-off tags would just be clutter
      var tagCount = {};
      posts.forEach(function (p) { (p.g || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });

      var nodes = [];
      var links = [];
      var tagNode = {};

      posts.forEach(function (p) {
        p._node = { type: "post", post: p, deg: 0 };
        nodes.push(p._node);
      });
      Object.keys(tagCount).forEach(function (t) {
        if (tagCount[t] < 2) return;
        tagNode[t] = { type: "tag", label: t, deg: 0 };
        nodes.push(tagNode[t]);
      });
      posts.forEach(function (p) {
        (p.g || []).forEach(function (t) {
          if (!tagNode[t]) return;
          links.push({ a: p._node, b: tagNode[t] });
          p._node.deg++;
          tagNode[t].deg++;
        });
      });

      var stage = host.querySelector("[data-graph-stage]");
      var tip = host.querySelector("[data-graph-tip]");
      var W = stage.clientWidth || 800;
      var H = stage.clientHeight || 440;

      var svg = document.createElementNS(SVG, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("role", "group");
      svg.setAttribute("aria-label", tr("Knowledge graph of posts and tags", "Đồ thị tri thức giữa bài viết và thẻ"));
      var gLinks = document.createElementNS(SVG, "g");
      var gNodes = document.createElementNS(SVG, "g");
      svg.appendChild(gLinks);
      svg.appendChild(gNodes);
      stage.appendChild(svg);

      nodes.forEach(function (n, i) {
        var ang = (i / nodes.length) * Math.PI * 2;
        var r = Math.min(W, H) * 0.3 * (0.6 + Math.random() * 0.5);
        n.x = W / 2 + Math.cos(ang) * r;
        n.y = H / 2 + Math.sin(ang) * r;
        n.vx = 0;
        n.vy = 0;
        n.r = n.type === "tag" ? 6 + Math.min(n.deg, 14) * 0.9 : 5;
      });

      links.forEach(function (l) {
        var line = document.createElementNS(SVG, "line");
        line.setAttribute("class", "g-link");
        gLinks.appendChild(line);
        l.el = line;
      });

      nodes.forEach(function (n) {
        var el;
        if (n.type === "post") {
          el = document.createElementNS(SVG, "a");
          el.setAttribute("href", n.post.u);
          el.setAttribute("class", "g-node g-post" + (n.post.c === "book-notes" ? " is-book" : ""));
        } else {
          el = document.createElementNS(SVG, "g");
          el.setAttribute("class", "g-node g-tag");
        }
        var c = document.createElementNS(SVG, "circle");
        c.setAttribute("r", n.r);
        el.appendChild(c);
        if (n.type === "tag") {
          var t = document.createElementNS(SVG, "text");
          t.setAttribute("class", "g-label");
          t.setAttribute("dy", n.r + 13);
          t.setAttribute("text-anchor", "middle");
          t.textContent = n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label;
          el.appendChild(t);
        } else {
          el.setAttribute("tabindex", "0");
        }
        gNodes.appendChild(el);
        n.el = el;
      });

      function neighbours(n) {
        var set = [n];
        links.forEach(function (l) {
          if (l.a === n) set.push(l.b);
          else if (l.b === n) set.push(l.a);
        });
        return set;
      }

      function focusNode(n, on) {
        host.classList.toggle("is-focus", on);
        nodes.forEach(function (m) { m.el.classList.remove("is-near"); });
        links.forEach(function (l) { l.el.classList.remove("is-near"); });
        if (!on) { tip.hidden = true; return; }
        var near = neighbours(n);
        near.forEach(function (m) { m.el.classList.add("is-near"); });
        links.forEach(function (l) {
          if (l.a === n || l.b === n) l.el.classList.add("is-near");
        });
        tip.hidden = false;
        tip.textContent = n.type === "post" ? postTitle(n.post) : "#" + n.label + " · " + (n.deg) + " " + tr("posts", "bài");
        placeTip(n);
      }

      function placeTip(n) {
        var x = Math.min(Math.max(n.x, 90), W - 90);
        tip.style.left = x + "px";
        tip.style.top = Math.max(n.y - n.r - 14, 16) + "px";
      }

      /* ---- tiny force simulation ---- */
      var alpha = 1;
      var running = false;
      var dragging = null;

      function step() {
        var i, j, a, b, dx, dy, d2, d, f;
        for (i = 0; i < nodes.length; i++) {
          a = nodes[i];
          for (j = i + 1; j < nodes.length; j++) {
            b = nodes[j];
            dx = a.x - b.x;
            dy = a.y - b.y;
            d2 = dx * dx + dy * dy + 0.5;
            if (d2 > 160000) continue; // ignore far pairs
            d = Math.sqrt(d2);
            f = (6500 / d2) * alpha;
            a.vx += (dx / d) * f; a.vy += (dy / d) * f;
            b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
          }
        }
        links.forEach(function (l) {
          dx = l.b.x - l.a.x;
          dy = l.b.y - l.a.y;
          d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          var rest = 70 + l.b.r * 2.4;
          f = (d - rest) * 0.03 * alpha;
          l.a.vx += (dx / d) * f; l.a.vy += (dy / d) * f;
          l.b.vx -= (dx / d) * f; l.b.vy -= (dy / d) * f;
        });
        nodes.forEach(function (n) {
          n.vx += (W / 2 - n.x) * 0.006 * alpha;
          n.vy += (H / 2 - n.y) * 0.009 * alpha;
          if (n === dragging) { n.vx = 0; n.vy = 0; return; }
          n.vx *= 0.82;
          n.vy *= 0.82;
          n.x = Math.min(W - n.r - 6, Math.max(n.r + 6, n.x + n.vx));
          n.y = Math.min(H - n.r - 18, Math.max(n.r + 6, n.y + n.vy));
        });
      }

      function draw() {
        links.forEach(function (l) {
          l.el.setAttribute("x1", l.a.x); l.el.setAttribute("y1", l.a.y);
          l.el.setAttribute("x2", l.b.x); l.el.setAttribute("y2", l.b.y);
        });
        nodes.forEach(function (n) {
          n.el.setAttribute("transform", "translate(" + n.x.toFixed(1) + "," + n.y.toFixed(1) + ")");
        });
      }

      function frame() {
        step();
        draw();
        alpha *= 0.985;
        if (alpha > 0.015 || dragging) requestAnimationFrame(frame);
        else running = false;
      }

      function heat(a) {
        alpha = Math.max(alpha, a);
        if (!running) {
          running = true;
          requestAnimationFrame(frame);
        }
      }

      // settle immediately (also the whole story for reduced-motion users)
      for (var k = 0; k < 260; k++) { step(); alpha *= 0.985; }
      alpha = 0.3;
      draw();
      if (!reduce) heat(0.3);

      /* ---- interaction ---- */
      nodes.forEach(function (n) {
        n.el.addEventListener("pointerenter", function () { if (!dragging) focusNode(n, true); });
        n.el.addEventListener("pointerleave", function () { if (!dragging) focusNode(n, false); });
        n.el.addEventListener("focus", function () { focusNode(n, true); });
        n.el.addEventListener("blur", function () { focusNode(n, false); });

        n.el.addEventListener("pointerdown", function (e) {
          if (e.button !== 0) return;
          var startX = e.clientX;
          var startY = e.clientY;
          var moved = false;
          var rect = stage.getBoundingClientRect();
          dragging = n;
          n.el.setPointerCapture(e.pointerId);
          heat(0.25);

          function move(ev) {
            if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) moved = true;
            n.x = Math.min(W - n.r, Math.max(n.r, ev.clientX - rect.left));
            n.y = Math.min(H - n.r, Math.max(n.r, ev.clientY - rect.top));
            placeTip(n);
            if (reduce) draw();
          }
          function up(ev) {
            n.el.releasePointerCapture(ev.pointerId);
            n.el.removeEventListener("pointermove", move);
            n.el.removeEventListener("pointerup", up);
            n.el.removeEventListener("pointercancel", up);
            dragging = null;
            if (moved) {
              // it was a drag, not a click: swallow the link navigation once
              n.el.addEventListener("click", function stop(c) { c.preventDefault(); n.el.removeEventListener("click", stop); }, { once: true });
            }
          }
          n.el.addEventListener("pointermove", move);
          n.el.addEventListener("pointerup", up);
          n.el.addEventListener("pointercancel", up);
        });
      });

      // keep the layout fitted when the container changes width
      if (window.ResizeObserver) {
        var lastW = W;
        new ResizeObserver(function () {
          var nw = stage.clientWidth;
          if (!nw || Math.abs(nw - lastW) < 8) return;
          var k2 = nw / lastW;
          nodes.forEach(function (n) { n.x *= k2; });
          W = nw;
          lastW = nw;
          draw();
          if (!reduce) heat(0.2);
        }).observe(stage);
      }
    });
  })();
})();

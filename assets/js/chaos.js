/* ==========================================================================
   Chaos engineering for a blog.
     monkey()  — Chaos Monkey: randomly "kills" parts of the page (503) and
                 they recover with exponential backoff. Click a dead one to
                 restart it by hand.
     panic()   — Kernel panic: gravity is deleted, the whole page falls to the
                 bottom of the window. Esc / Reboot puts everything back.
   Triggered from the hero terminal (`chaos`, `panic`, `sudo rm -rf /`) and the
   command palette.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function tr(en, vi) {
    return root.getAttribute("data-lang") === "vi" && vi ? vi : en;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function inView(n) {
    var r = n.getBoundingClientRect();
    return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  }

  /* ----------------------------------------------------------------------
     Chaos Monkey
  ---------------------------------------------------------------------- */
  var VICTIMS = ".project-card, .blog-item, .rm-card, .stat-row > *, .nav-links li, .post-nav-link, .lab-card, .terminal, .contact-card, .about-card, .skill, .tag";
  var run = null;   // active session

  function monkey(seconds) {
    if (run || panicState) return;
    var total = (seconds || 20) * 1000;
    run = { killed: 0, healed: 0, manual: 0, left: total, live: [], tick: null, spawn: null };

    var hud = el("div", "chaos-hud");
    hud.setAttribute("role", "status");
    var title = el("b", "", "🐒 CHAOS MONKEY");
    var stats = el("span", "chaos-hud-stats");
    var stop = el("button", "chaos-hud-stop", tr("Stop · Esc", "Dừng · Esc"));
    stop.type = "button";
    hud.appendChild(title); hud.appendChild(stats); hud.appendChild(stop);
    document.body.appendChild(hud);
    run.hud = hud;
    stop.addEventListener("click", endMonkey);

    function paint() {
      stats.textContent = "  ⏱ " + Math.ceil(run.left / 1000) + "s   ⬇ " + run.live.length + "   ✔ " + run.healed + "   ✋ " + run.manual;
    }

    function kill() {
      var pool = Array.prototype.slice.call(document.querySelectorAll(VICTIMS)).filter(function (n) {
        return inView(n) && !n.classList.contains("chaos-down") && !n.closest(".chaos-down") && !n.querySelector(".chaos-down");
      });
      if (!pool.length) return;
      var v = pool[(Math.random() * pool.length) | 0];
      var rec = { node: v, attempt: 0, wait: 0 };
      run.killed++;
      v.classList.add("chaos-down");
      run.live.push(rec);
      schedule(rec);
    }

    function schedule(rec) {
      rec.attempt++;
      rec.wait = Math.pow(2, rec.attempt - 1) * (800 + Math.random() * 600);   // backoff: ~1s, 2s, 4s…
      rec.left = rec.wait;
      show(rec);
    }

    function show(rec) {
      rec.node.setAttribute("data-chaos-msg", "503  " + tr("Service Unavailable", "Dịch vụ không khả dụng") + "\n" +
        tr("retry #" + rec.attempt + " in " + Math.max(1, Math.ceil(rec.left / 1000)) + "s", "thử lại #" + rec.attempt + " sau " + Math.max(1, Math.ceil(rec.left / 1000)) + "s") +
        "\n" + tr("(click to restart)", "(bấm để khởi động lại)"));
    }

    function heal(rec, byHand) {
      var i = run.live.indexOf(rec);
      if (i < 0) return;
      run.live.splice(i, 1);
      rec.node.classList.remove("chaos-down");
      rec.node.removeAttribute("data-chaos-msg");
      rec.node.classList.add("chaos-healed");
      setTimeout(function () { rec.node.classList.remove("chaos-healed"); }, 900);
      run.healed++;
      if (byHand) run.manual++;
    }

    run.onClick = function (e) {
      if (!run) return;
      var down = e.target.closest && e.target.closest(".chaos-down");
      if (!down) return;
      e.preventDefault(); e.stopPropagation();
      var rec = run.live.filter(function (r) { return r.node === down; })[0];
      if (rec) heal(rec, true);
    };
    document.addEventListener("click", run.onClick, true);

    var last = performance.now();
    var nextKill = 400;
    run.tick = setInterval(function () {
      var now = performance.now(), dt = now - last;
      last = now;
      run.left -= dt;
      nextKill -= dt;
      if (run.left > 0 && nextKill <= 0) { kill(); nextKill = 500 + Math.random() * 900; }
      run.live.slice().forEach(function (rec) {
        rec.left -= dt;
        if (rec.left <= 0) {
          // each retry has a chance to fail again → longer backoff, like the real thing
          if (rec.attempt < 4 && Math.random() < 0.35) schedule(rec);
          else heal(rec, false);
        } else {
          show(rec);
        }
      });
      paint();
      if (run.left <= 0 && !run.live.length) endMonkey();
    }, 250);
    paint();
  }

  function endMonkey() {
    if (!run) return;
    var r = run;
    run = null;
    clearInterval(r.tick);
    document.removeEventListener("click", r.onClick, true);
    r.live.forEach(function (rec) { rec.node.classList.remove("chaos-down"); rec.node.removeAttribute("data-chaos-msg"); });
    if (r.hud.parentNode) r.hud.parentNode.removeChild(r.hud);
    var msg = tr("Chaos over: " + r.killed + " services killed, " + r.manual + " restarted by you. The site survived.",
                 "Kết thúc hỗn loạn: " + r.killed + " dịch vụ bị hạ, bạn tự khởi động lại " + r.manual + ". Site vẫn sống.");
    toast(msg);
  }

  function toast(msg) {
    if (window.ViSite && window.ViSite.flash) { window.ViSite.flash(msg); return; }
    var t = el("div", "rd-toast is-on", msg);
    t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(function () { t.classList.remove("is-on"); }, 3200);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3600);
  }

  /* ----------------------------------------------------------------------
     Kernel panic: everything falls
  ---------------------------------------------------------------------- */
  var panicState = null;
  var FALLERS = "h1, h2, h3, p, li, .btn, .brand, .icon-btn, .eyebrow, .project-card, .blog-item, .rm-card, .stat-row > *, .terminal, .post-nav-link, .lab-card, .tag, img, .hero-code, pre, figure, code";

  function panic() {
    if (panicState) return;
    if (run) endMonkey();
    var vh = window.innerHeight, vw = window.innerWidth;
    var picked = Array.prototype.slice.call(document.querySelectorAll(FALLERS)).filter(function (n) {
      if (!inView(n) || n.closest("dialog, .chaos-bsod, .chaos-hud, .rd-toast")) return false;
      var r = n.getBoundingClientRect();
      return r.height < vh * 0.6 && r.width < vw * 0.95;
    });
    // keep only outermost pieces so a card falls as one block
    picked = picked.filter(function (n) {
      return !picked.some(function (o) { return o !== n && o.contains(n); });
    }).slice(0, 90);

    var bsod = el("div", "chaos-bsod");
    bsod.setAttribute("role", "alertdialog");
    bsod.setAttribute("aria-label", "Kernel panic");
    var face = el("div", "chaos-bsod-face", ":(");
    var h = el("p", "chaos-bsod-h", tr("Kernel panic — not syncing: gravity not found", "Kernel panic — not syncing: không tìm thấy trọng lực"));
    var d = el("p", "chaos-bsod-d", "VFS: Unable to mount root fs on unknown-block(0,0)\n" +
      tr("Somebody ran `sudo rm -rf /` on the layout engine.", "Ai đó đã chạy `sudo rm -rf /` trên layout engine.") + "\n0x000000G · CPU: 0 PID: 1 Comm: swapper/0");
    var btn = el("button", "chaos-bsod-btn", tr("Reboot · Esc", "Khởi động lại · Esc"));
    btn.type = "button";
    bsod.appendChild(face); bsod.appendChild(h); bsod.appendChild(d); bsod.appendChild(btn);
    document.body.appendChild(bsod);

    panicState = { picked: [], bsod: bsod, raf: 0, auto: 0, overflow: root.style.overflow };
    btn.addEventListener("click", reboot);
    btn.focus({ preventScroll: true });

    if (reduceMotion) {
      panicState.auto = setTimeout(reboot, 4500);
      return;
    }

    root.style.overflow = "hidden";
    var items = picked.map(function (n) {
      var r = n.getBoundingClientRect();
      n.classList.add("chaos-fall");
      return {
        n: n, y: 0, x: 0, vy: 0, vx: (Math.random() - 0.5) * 2.4, rot: 0, rv: (Math.random() - 0.5) * 0.35,
        rest: (Math.random() - 0.5) * 38, delay: (1 - r.bottom / vh) * 650 + Math.random() * 350,
        floor: vh - r.bottom - Math.random() * 46, landed: false
      };
    });
    panicState.picked = items;

    var last = performance.now(), t = 0;
    function frame(now) {
      var dt = Math.min(now - last, 40) / 16.67;
      last = now;
      t += dt * 16.67;
      items.forEach(function (it) {
        if (t < it.delay) return;
        if (!it.landed) {
          it.vy += 0.55 * dt;
          it.y += it.vy * dt;
          it.x += it.vx * dt;
          it.rot += it.rv * dt * 4;
          if (it.y >= it.floor) {
            it.y = it.floor;
            it.vy *= -0.38;
            it.vx *= 0.7;
            it.rv *= 0.6;
            if (Math.abs(it.vy) < 1.2) { it.landed = true; it.vy = 0; }
          }
        } else {
          it.rot += (it.rest - it.rot) * 0.12 * dt;
        }
        it.n.style.transform = "translate(" + it.x.toFixed(1) + "px," + it.y.toFixed(1) + "px) rotate(" + it.rot.toFixed(1) + "deg)";
      });
      panicState.raf = requestAnimationFrame(frame);
    }
    panicState.raf = requestAnimationFrame(frame);
    panicState.auto = setTimeout(reboot, 14000);
  }

  function reboot() {
    var p = panicState;
    if (!p) return;
    panicState = null;
    cancelAnimationFrame(p.raf);
    clearTimeout(p.auto);
    p.picked.forEach(function (it) {
      it.n.style.transition = "transform 0.9s cubic-bezier(0.2, 0.9, 0.25, 1)";
      it.n.style.transform = "";
    });
    p.bsod.classList.add("is-out");
    setTimeout(function () {
      p.picked.forEach(function (it) {
        it.n.style.transition = "";
        it.n.style.transform = "";
        it.n.classList.remove("chaos-fall");
      });
      if (p.bsod.parentNode) p.bsod.parentNode.removeChild(p.bsod);
      root.style.overflow = p.overflow;
    }, 1000);
    toast(tr("System rebooted. Everything is back (probably).", "Đã khởi động lại hệ thống. Mọi thứ đã về chỗ (chắc vậy)."));
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (panicState) { e.preventDefault(); reboot(); }
    else if (run) endMonkey();
  });

  window.ViChaos = { monkey: monkey, panic: panic, stop: function () { reboot(); endMonkey(); } };
})();

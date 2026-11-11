/* ==========================================================================
   The Lab (/lab/): three small distributed-systems simulations.
     1. Raft         — leader election, crashes, network partition, quorum writes
     2. Hash ring    — consistent hashing with virtual nodes vs. hash mod N
     3. Quorums      — N / W / R and the stale-read probability
   Everything is deterministic-enough, dependency-free, and pauses while off-screen.
   ========================================================================== */
(function () {
  "use strict";

  var Site = window.ViSite || {};
  var root = document.documentElement;
  var SVGNS = "http://www.w3.org/2000/svg";

  function tr(en, vi) {
    return root.getAttribute("data-lang") === "vi" && vi ? vi : en;
  }
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* Run fn(dtMs) every frame, but only while `host` is on screen and the tab is visible. */
  function loop(host, fn) {
    var on = true;
    var last = performance.now();
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { on = es[0].isIntersecting; last = performance.now(); }).observe(host);
    }
    function frame(now) {
      var dt = Math.min(now - last, 100);
      last = now;
      if (on && !document.hidden) fn(dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------------------
     1. RAFT
  ---------------------------------------------------------------------- */
  (function raft() {
    var card = $('[data-lab="raft"]');
    if (!card) return;
    var S = $("[data-raft-svg]", card);
    var logEl = $("[data-raft-log]", card);
    var btnWrite = $("[data-raft-write]", card);
    var btnSplit = $("[data-raft-split]", card);
    var speedEl = $("[data-raft-speed]", card);

    var N = 5, CX = 260, CY = 190, R = 135;
    var HB = 650;               // heartbeat interval (ms of sim time)
    var LAT = 420;              // message latency
    var nodes, msgs, split, writes, clock, logLines;
    var edgesG, msgG, nodesG, nodeEls = [], edgeEls = {}, banner;

    function reset() {
      clock = 0; msgs = []; split = false; writes = []; logLines = [];
      nodes = [];
      for (var i = 0; i < N; i++) {
        var a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
        nodes.push({
          id: i, x: CX + R * Math.cos(a), y: CY + R * Math.sin(a),
          alive: true, role: "follower", term: 0, votedFor: null, votes: 0,
          timer: rnd(1400, 2800), hbTimer: 0, side: i < 2 ? 0 : 1, lastValue: 0
        });
      }
      btnSplit.setAttribute("aria-pressed", "false");
      btnSplit.classList.remove("is-on");
      logEl.textContent = "";
      build();
      log(tr("Cluster started. Waiting for a heartbeat…", "Cụm khởi động. Đang chờ heartbeat…"));
    }

    function log(text, cls) {
      var li = document.createElement("li");
      if (cls) li.className = cls;
      li.textContent = text;
      logEl.insertBefore(li, logEl.firstChild);
      while (logEl.children.length > 7) logEl.removeChild(logEl.lastChild);
    }

    function build() {
      S.textContent = "";
      edgesG = svg("g", { "class": "r-edges" }, S);
      edgeEls = {};
      for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) {
        edgeEls[i + "-" + j] = svg("line", { x1: nodes[i].x, y1: nodes[i].y, x2: nodes[j].x, y2: nodes[j].y, "class": "r-edge" }, edgesG);
      }
      banner = svg("line", { x1: 0, y1: 0, x2: 0, y2: 0, "class": "r-cut" }, S);
      msgG = svg("g", {}, S);
      nodesG = svg("g", {}, S);
      nodeEls = nodes.map(function (n) {
        var g = svg("g", { "class": "r-node", tabindex: 0, role: "button", "aria-label": "node " + n.id }, nodesG);
        svg("circle", { cx: n.x, cy: n.y, r: 32, "class": "r-ring" }, g);
        var arc = svg("circle", { cx: n.x, cy: n.y, r: 38, "class": "r-timer", transform: "rotate(-90 " + n.x + " " + n.y + ")" }, g);
        svg("circle", { cx: n.x, cy: n.y, r: 28, "class": "r-body" }, g);
        var t1 = svg("text", { x: n.x, y: n.y - 3, "class": "r-id" }, g);
        t1.textContent = "N" + n.id;
        var t2 = svg("text", { x: n.x, y: n.y + 12, "class": "r-term" }, g);
        var crown = svg("text", { x: n.x, y: n.y - 40, "class": "r-crown" }, g);
        crown.textContent = "♛";
        function toggle() {
          n.alive = !n.alive;
          if (!n.alive) { n.role = "follower"; n.votes = 0; log("N" + n.id + tr(" crashed.", " bị sập."), "bad"); }
          else { n.timer = rnd(1400, 2800); log("N" + n.id + tr(" is back online as a follower.", " hoạt động lại với vai trò follower."), "ok"); }
        }
        g.addEventListener("click", toggle);
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
        n.el = { g: g, arc: arc, term: t2, crown: crown };
        return n.el;
      });
      layoutSplit();
    }

    function reach(a, b) {
      if (!nodes[a].alive || !nodes[b].alive) return false;
      return !split || nodes[a].side === nodes[b].side;
    }

    function layoutSplit() {
      for (var k in edgeEls) {
        var p = k.split("-");
        edgeEls[k].classList.toggle("is-cut", split && nodes[+p[0]].side !== nodes[+p[1]].side);
      }
      if (split) {
        // dashed divider between side 0 {N0,N1} and side 1 {N2,N3,N4}
        var a = nodes[1], b = nodes[2], c = nodes[0], d = nodes[4];
        var mx1 = (a.x + b.x) / 2, my1 = (a.y + b.y) / 2, mx2 = (c.x + d.x) / 2, my2 = (c.y + d.y) / 2;
        var dx = mx2 - mx1, dy = my2 - my1;
        banner.setAttribute("x1", mx1 - dx * 0.55); banner.setAttribute("y1", my1 - dy * 0.55);
        banner.setAttribute("x2", mx2 + dx * 0.55); banner.setAttribute("y2", my2 + dy * 0.55);
        banner.style.opacity = 1;
      } else {
        banner.style.opacity = 0;
      }
    }

    function send(from, to, type, extra) {
      if (!nodes[from].alive) return;
      var m = { from: from, to: to, type: type, t: 0, term: nodes[from].term };
      for (var k in extra) m[k] = extra[k];
      m.el = svg("circle", { r: type === "hb" || type === "ae" ? 4 : 5, "class": "r-msg r-msg-" + type }, msgG);
      msgs.push(m);
    }

    function becomeFollower(n, term) {
      if (term > n.term) { n.term = term; n.votedFor = null; }
      n.role = "follower";
      n.votes = 0;
      n.timer = rnd(1400, 2800);
    }

    function startElection(n) {
      n.role = "candidate";
      n.term++;
      n.votedFor = n.id;
      n.votes = 1;
      n.timer = rnd(1400, 2800);
      log("N" + n.id + tr(" timed out → candidate for term ", " hết giờ → ứng cử term ") + n.term + ".", "warn");
      for (var j = 0; j < N; j++) if (j !== n.id) send(n.id, j, "rv");
    }

    function becomeLeader(n) {
      n.role = "leader";
      n.hbTimer = 0;
      log("N" + n.id + tr(" won the election (", " thắng cử (") + n.votes + "/" + N + tr(" votes) — leader of term ", " phiếu) — leader của term ") + n.term + ".", "ok");
    }

    function deliver(m) {
      var to = nodes[m.to], from = nodes[m.from];
      if (!reach(m.from, m.to) && m.type !== "gone") return;
      if (m.type === "rv") {
        if (m.term > to.term) becomeFollower(to, m.term);
        var grant = m.term === to.term && (to.votedFor === null || to.votedFor === m.from) && to.role !== "leader";
        if (grant) { to.votedFor = m.from; to.timer = rnd(1400, 2800); }
        send(m.to, m.from, "vote", { granted: grant, replyTerm: to.term });
      } else if (m.type === "vote") {
        if (m.replyTerm > to.term) { becomeFollower(to, m.replyTerm); return; }
        if (to.role === "candidate" && m.granted && m.term === to.term) {
          to.votes++;
          if (to.votes > N / 2) becomeLeader(to);
        }
      } else if (m.type === "hb" || m.type === "ae") {
        if (m.term < to.term) { send(m.to, m.from, "nack", { replyTerm: to.term }); return; }
        if (m.term > to.term || to.role !== "follower") {
          if (to.role === "leader") log("N" + to.id + tr(" steps down (saw term ", " nhường chức (thấy term ") + m.term + ").", "warn");
          becomeFollower(to, m.term);
        }
        to.timer = rnd(1400, 2800);
        if (m.type === "ae") { to.lastValue = m.value; send(m.to, m.from, "ack", { wid: m.wid }); }
      } else if (m.type === "nack") {
        if (m.replyTerm > to.term) {
          log("N" + to.id + tr(" is stale (term ", " đã cũ (term ") + to.term + tr(") — steps down.", ") — nhường chức."), "warn");
          becomeFollower(to, m.replyTerm);
        }
      } else if (m.type === "ack") {
        for (var i = 0; i < writes.length; i++) {
          var w = writes[i];
          if (w.id === m.wid && w.leader === m.to && !w.done) {
            w.acks++;
            if (w.acks > N / 2) {
              w.done = true;
              log(tr("Write #", "Ghi #") + w.id + tr(" committed by N", " đã commit bởi N") + w.leader + " (" + w.acks + "/" + N + tr(" acks) ✔", " ack) ✔"), "ok");
              nodes[w.leader].lastValue = w.id;
            }
          }
        }
      }
    }

    var wid = 0;
    btnWrite.addEventListener("click", function () {
      var leaders = nodes.filter(function (n) { return n.alive && n.role === "leader"; });
      if (!leaders.length) { log(tr("No leader to talk to — the write is rejected.", "Không có leader — thao tác ghi bị từ chối."), "bad"); return; }
      var L = leaders[(Math.random() * leaders.length) | 0];
      wid++;
      var w = { id: wid, leader: L.id, acks: 1, done: false, age: 0 };
      writes.push(w);
      log(tr("Client → N", "Client → N") + L.id + ": write #" + wid + (leaders.length > 1 ? tr("  (two leaders exist!)", "  (đang có hai leader!)") : ""));
      for (var j = 0; j < N; j++) if (j !== L.id) send(L.id, j, "ae", { value: wid, wid: wid });
    });

    btnSplit.addEventListener("click", function () {
      split = !split;
      btnSplit.setAttribute("aria-pressed", split ? "true" : "false");
      btnSplit.classList.toggle("is-on", split);
      layoutSplit();
      log(split ? tr("Network split: {N0,N1} | {N2,N3,N4}. The minority can't reach a majority.", "Mạng bị chia: {N0,N1} | {N2,N3,N4}. Phía thiểu số không thể đạt đa số.")
                : tr("Network healed.", "Mạng đã nối lại."), split ? "warn" : "ok");
    });
    $("[data-raft-reset]", card).addEventListener("click", reset);

    function step(dtReal) {
      var dt = dtReal * parseFloat(speedEl.value || 1);
      clock += dt;

      nodes.forEach(function (n) {
        if (!n.alive) return;
        if (n.role === "leader") {
          n.hbTimer -= dt;
          if (n.hbTimer <= 0) {
            n.hbTimer = HB;
            for (var j = 0; j < N; j++) if (j !== n.id) send(n.id, j, "hb");
          }
        } else {
          n.timer -= dt;
          if (n.timer <= 0) startElection(n);
        }
      });

      for (var i = msgs.length - 1; i >= 0; i--) {
        var m = msgs[i];
        m.t += dt;
        var f = Math.min(m.t / LAT, 1);
        var a = nodes[m.from], b = nodes[m.to];
        var blocked = split && a.side !== b.side;
        // messages across a cut stall at the midpoint and fade, to make the partition visible
        var pos = blocked ? Math.min(f, 0.5) : f;
        m.el.setAttribute("cx", a.x + (b.x - a.x) * pos);
        m.el.setAttribute("cy", a.y + (b.y - a.y) * pos);
        m.el.style.opacity = blocked && f > 0.5 ? Math.max(0, 1 - (f - 0.5) * 4) : 1;
        if (f >= 1) {
          deliver(m);
          msgG.removeChild(m.el);
          msgs.splice(i, 1);
        }
      }

      writes = writes.filter(function (w) {
        w.age += dt;
        if (!w.done && w.age > 2600) {
          log(tr("Write #", "Ghi #") + w.id + tr(" stalled: N", " bị treo: N") + w.leader + tr(" can't reach a majority (", " không thể đạt đa số (") + w.acks + "/" + N + ").", "bad");
          return false;
        }
        return w.age < 3000;
      });

      render();
    }

    function render() {
      var leaders = nodes.filter(function (n) { return n.alive && n.role === "leader"; }).length;
      nodes.forEach(function (n) {
        var cls = "r-node " + (n.alive ? "is-" + n.role : "is-dead");
        n.el.g.setAttribute("class", cls);
        n.el.term.textContent = n.alive ? "T" + n.term : "✕";
        n.el.crown.style.opacity = n.alive && n.role === "leader" ? 1 : 0;
        // election-timer ring drains as the timeout approaches
        var frac = n.alive && n.role !== "leader" ? Math.max(0, Math.min(1, n.timer / 2800)) : 0;
        var c = 2 * Math.PI * 38;
        n.el.arc.setAttribute("stroke-dasharray", (c * frac).toFixed(1) + " " + c.toFixed(1));
      });
      card.classList.toggle("has-split-brain", leaders > 1);
    }

    reset();
    loop(card, step);
    new MutationObserver(function () { /* labels are static per language; nothing to rebuild */ }).observe(root, { attributes: true, attributeFilter: ["data-lang"] });
  })();

  /* ----------------------------------------------------------------------
     2. CONSISTENT HASHING RING
  ---------------------------------------------------------------------- */
  (function ring() {
    var card = $('[data-lab="ring"]');
    if (!card) return;
    var S = $("[data-ring-svg]", card);
    var vnEl = $("[data-ring-vn]", card);
    var vnVal = $("[data-ring-vn-val]", card);
    var NAMES = "ABCDEFGHIJKL".split("");
    var COLORS = ["#3ee089", "#7fd4ff", "#ffb454", "#ff7eb6", "#b794f6", "#f6e05e", "#ff8a65", "#4dd0e1", "#aed581", "#f48fb1", "#9fa8da", "#ffcc80"];
    var KEYS = 300, CX = 210, CY = 210, RAD = 150;
    var servers = ["A", "B", "C"];
    var keys = [];
    var owner = [];        // consistent-hash owner per key
    var lastMoved = {};    // key index -> true for the animation

    function hash(str) {      // FNV-1a + avalanche → [0,1)
      var h = 2166136261;
      for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }
    for (var i = 0; i < KEYS; i++) keys.push({ pos: hash("key:" + i), h32: Math.floor(hash("k" + i) * 4294967296) });

    function vnodes(list, vn) {
      var out = [];
      list.forEach(function (s) { for (var v = 0; v < vn; v++) out.push({ s: s, pos: hash(s + "#" + v) }); });
      out.sort(function (a, b) { return a.pos - b.pos; });
      return out;
    }
    function assign(list, vn) {
      var vs = vnodes(list, vn), res = [];
      keys.forEach(function (k) {
        var o = vs[0].s;
        for (var i = 0; i < vs.length; i++) if (vs[i].pos >= k.pos) { o = vs[i].s; break; }
        res.push(o);
      });
      return { owners: res, vnodes: vs };
    }
    function modAssign(list) { return keys.map(function (k) { return list[k.h32 % list.length]; }); }

    function pt(pos, r) {
      var a = pos * 2 * Math.PI - Math.PI / 2;
      return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    }
    function color(s) { return COLORS[NAMES.indexOf(s) % COLORS.length]; }

    var prevOwners = null, prevList = null, moved = null, naive = null;

    function recompute(prevServers) {
      var vn = +vnEl.value;
      var now = assign(servers, vn);
      if (prevOwners && prevServers) {
        var m = 0;
        for (var i = 0; i < KEYS; i++) { var mv = prevOwners[i] !== now.owners[i]; lastMoved[i] = mv; if (mv) m++; }
        moved = m / KEYS;
        var a = modAssign(prevServers), b = modAssign(servers), nm = 0;
        for (var j = 0; j < KEYS; j++) if (a[j] !== b[j]) nm++;
        naive = nm / KEYS;
      } else {
        lastMoved = {};
      }
      owner = now.owners;
      prevOwners = now.owners;
      draw(now.vnodes);
      stats();
    }

    function draw(vs) {
      S.textContent = "";
      svg("circle", { cx: CX, cy: CY, r: RAD, "class": "h-ring" }, S);
      var kg = svg("g", {}, S);
      keys.forEach(function (k, i) {
        var p = pt(k.pos, RAD + (i % 3) * 0 );
        svg("circle", { cx: p[0], cy: p[1], r: lastMoved[i] ? 4.2 : 2.6, fill: color(owner[i]), "class": "h-key" + (lastMoved[i] ? " is-moved" : "") }, kg);
      });
      var vg = svg("g", {}, S);
      vs.forEach(function (v) {
        var a = pt(v.pos, RAD - 10), b = pt(v.pos, RAD + 14);
        svg("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color(v.s), "stroke-width": 3, "stroke-linecap": "round", "class": "h-vn" }, vg);
      });
      // server labels: the first virtual node of each server gets a badge
      servers.forEach(function (s) {
        var first = vs.filter(function (v) { return v.s === s; })[0];
        if (!first) return;
        var p = pt(first.pos, RAD + 34);
        svg("circle", { cx: p[0], cy: p[1], r: 13, fill: color(s), "class": "h-badge" }, S);
        var t = svg("text", { x: p[0], y: p[1] + 4.5, "class": "h-badge-t" }, S);
        t.textContent = s;
      });
      var c = svg("text", { x: CX, y: CY - 4, "class": "h-center" }, S);
      c.textContent = servers.length + tr(" servers", " server");
      var c2 = svg("text", { x: CX, y: CY + 16, "class": "h-center-sub" }, S);
      c2.textContent = KEYS + tr(" keys", " key");
    }

    function stats() {
      var pct = function (x) { return x == null ? "—" : Math.round(x * 100) + "%"; };
      $("[data-ring-moved]", card).textContent = pct(moved);
      $("[data-ring-naive]", card).textContent = pct(naive);
      $("[data-ring-moved-bar]", card).style.width = (moved == null ? 0 : moved * 100) + "%";
      $("[data-ring-naive-bar]", card).style.width = (naive == null ? 0 : naive * 100) + "%";
      var counts = {};
      servers.forEach(function (s) { counts[s] = 0; });
      owner.forEach(function (o) { counts[o]++; });
      var max = Math.max.apply(null, servers.map(function (s) { return counts[s]; }));
      var box = $("[data-ring-load]", card);
      box.textContent = "";
      servers.forEach(function (s) {
        var row = document.createElement("div");
        row.className = "load-row";
        var lab = document.createElement("span");
        lab.className = "load-name";
        lab.textContent = s;
        lab.style.background = color(s);
        var bar = document.createElement("span");
        bar.className = "load-bar";
        var fill = document.createElement("i");
        fill.style.width = (max ? counts[s] / max * 100 : 0) + "%";
        fill.style.background = color(s);
        bar.appendChild(fill);
        var n = document.createElement("span");
        n.className = "load-n";
        n.textContent = counts[s];
        row.appendChild(lab); row.appendChild(bar); row.appendChild(n);
        box.appendChild(row);
      });
    }

    $("[data-ring-add]", card).addEventListener("click", function () {
      if (servers.length >= NAMES.length) return;
      var prev = servers.slice();
      servers.push(NAMES.filter(function (n) { return servers.indexOf(n) < 0; })[0]);
      recompute(prev);
    });
    $("[data-ring-remove]", card).addEventListener("click", function () {
      if (servers.length <= 2) return;
      var prev = servers.slice();
      servers.splice((Math.random() * servers.length) | 0, 1);
      recompute(prev);
    });
    vnEl.addEventListener("input", function () {
      vnVal.textContent = vnEl.value;
      moved = naive = null;
      lastMoved = {};
      prevOwners = null;
      recompute(null);
    });

    recompute(null);
    new MutationObserver(function () { draw(assign(servers, +vnEl.value).vnodes); }).observe(root, { attributes: true, attributeFilter: ["data-lang"] });
  })();

  /* ----------------------------------------------------------------------
     3. QUORUMS
  ---------------------------------------------------------------------- */
  (function quorum() {
    var card = $('[data-lab="quorum"]');
    if (!card) return;
    var nEl = $("[data-q-n]", card), wEl = $("[data-q-w]", card), rEl = $("[data-q-r]", card);
    var box = $("[data-q-replicas]", card);
    var readout = $("[data-q-readout]", card);
    var verdict = $("[data-q-verdict]", card);
    var statsEl = $("[data-q-stats]", card);
    var version = 0, replicas = [], timers = [], touched = {};

    function N() { return +nEl.value; }
    function sync() {
      var n = N();
      [wEl, rEl].forEach(function (e) { e.max = n; if (+e.value > n) e.value = n; });
      $("[data-q-n-val]", card).textContent = n;
      $("[data-q-w-val]", card).textContent = wEl.value;
      $("[data-q-r-val]", card).textContent = rEl.value;
      var w = +wEl.value, r = +rEl.value;
      var ok = w + r > n;
      verdict.className = "lab-verdict " + (ok ? "is-ok" : "is-bad");
      verdict.textContent = "W + R = " + (w + r) + (ok ? " > " : " ≤ ") + "N = " + n + " → " +
        (ok ? tr("overlap guaranteed: reads see the latest write", "đảm bảo giao nhau: đọc luôn thấy bản ghi mới nhất")
            : tr("no overlap: a read can miss the latest write", "không giao nhau: đọc có thể bỏ lỡ bản ghi mới nhất"));
    }

    function resetReplicas() {
      timers.forEach(clearTimeout); timers = [];
      version = 0;
      replicas = [];
      for (var i = 0; i < N(); i++) replicas.push({ v: 0, state: "" });
      renderReplicas();
      readout.textContent = tr("Press Write, then Read.", "Bấm Ghi, rồi bấm Đọc.");
    }

    function renderReplicas() {
      box.textContent = "";
      replicas.forEach(function (r, i) {
        var d = document.createElement("div");
        d.className = "q-rep" + (r.state ? " " + r.state : "") + (r.v === version ? " is-latest" : " is-old");
        var id = document.createElement("span"); id.className = "q-id"; id.textContent = "R" + (i + 1);
        var v = document.createElement("b"); v.className = "q-v"; v.textContent = "v" + r.v;
        d.appendChild(id); d.appendChild(v);
        box.appendChild(d);
      });
    }

    function pick(k, n) {   // k distinct random indices out of n
      var idx = []; for (var i = 0; i < n; i++) idx.push(i);
      for (var j = n - 1; j > 0; j--) { var t = (Math.random() * (j + 1)) | 0; var x = idx[j]; idx[j] = idx[t]; idx[t] = x; }
      return idx.slice(0, k);
    }

    $("[data-q-write]", card).addEventListener("click", function () {
      var w = +wEl.value, n = N();
      version++;
      var now = pick(w, n);
      replicas.forEach(function (r) { r.state = ""; });
      now.forEach(function (i) { replicas[i].v = version; replicas[i].state = "is-written"; });
      var v = version;
      for (var i = 0; i < n; i++) if (now.indexOf(i) < 0) {
        (function (i) {
          timers.push(setTimeout(function () {
            if (replicas[i] && replicas[i].v < v) { replicas[i].v = v; replicas[i].state = "is-written"; renderReplicas(); }
          }, 1800 + i * 250));
        })(i);
      }
      renderReplicas();
      readout.textContent = tr("Wrote v" + v + " to " + w + " replicas. The rest catch up in ~2 s (replication lag).", "Đã ghi v" + v + " vào " + w + " replica. Phần còn lại bắt kịp sau ~2 giây (độ trễ sao chép).");
    });

    $("[data-q-read]", card).addEventListener("click", function () {
      var r = +rEl.value, n = N();
      var ask = pick(r, n);
      var best = 0;
      replicas.forEach(function (x) { x.state = ""; });
      ask.forEach(function (i) { replicas[i].state = "is-read"; best = Math.max(best, replicas[i].v); });
      renderReplicas();
      var stale = best < version;
      readout.className = "q-readout " + (stale ? "is-bad" : "is-ok");
      readout.textContent = tr("Read " + r + " replicas → newest value v" + best + (stale ? "  ✗ STALE — the latest is v" + version : "  ✔ up to date"),
                               "Đọc " + r + " replica → giá trị mới nhất v" + best + (stale ? "  ✗ CŨ — bản mới nhất là v" + version : "  ✔ đã cập nhật"));
    });

    function choose(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }

    $("[data-q-run]", card).addEventListener("click", function () {
      var n = N(), w = +wEl.value, r = +rEl.value, TR = 500, stale = 0;
      for (var t = 0; t < TR; t++) {
        var wr = pick(w, n), rd = pick(r, n), hit = false;
        for (var i = 0; i < rd.length; i++) if (wr.indexOf(rd[i]) >= 0) { hit = true; break; }
        if (!hit) stale++;
      }
      var theory = w + r > n ? 0 : choose(n - w, r) / choose(n, r);
      var sim = stale / TR;
      statsEl.textContent = "";
      [[tr("Measured stale reads", "Đọc dữ liệu cũ (đo được)"), (sim * 100).toFixed(1) + "%", sim],
       [tr("Predicted  C(N−W, R) / C(N, R)", "Dự đoán  C(N−W, R) / C(N, R)"), (theory * 100).toFixed(1) + "%", theory]].forEach(function (row, idx) {
        var line = document.createElement("div"); line.className = "lab-stat-row";
        var a = document.createElement("span"); a.textContent = row[0];
        var b = document.createElement("b"); b.textContent = row[1];
        var bar = document.createElement("div"); bar.className = "lab-bar" + (idx ? "" : " lab-bar-bad");
        var fill = document.createElement("i"); fill.style.width = Math.min(100, row[2] * 100) + "%"; bar.appendChild(fill);
        line.appendChild(a); line.appendChild(b);
        statsEl.appendChild(line); statsEl.appendChild(bar);
      });
      var note = document.createElement("p"); note.className = "lab-note";
      note.textContent = tr("Worst case: every read happens right after a write, before replication lag has healed.",
                            "Trường hợp xấu nhất: mọi lần đọc diễn ra ngay sau lần ghi, trước khi độ trễ sao chép kịp hồi phục.");
      statsEl.appendChild(note);
    });

    nEl.addEventListener("input", function () { sync(); resetReplicas(); });
    wEl.addEventListener("input", sync);
    rEl.addEventListener("input", sync);
    new MutationObserver(function () { sync(); }).observe(root, { attributes: true, attributeFilter: ["data-lang"] });

    sync();
    resetReplicas();
  })();
})();

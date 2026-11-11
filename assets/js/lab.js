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

  var EXP = { raft: {}, ring: {}, quorum: {} };   // one-click experiments, filled in by each sim

  function setRange(input, v) {
    input.value = v;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

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
    var inspectEl = $("[data-raft-inspect]", card);
    var selected = null, insp = null;

    var N = 5, CX = 260, CY = 190, R = 135;
    var HB = 650;               // heartbeat interval (ms of sim time)
    var LAT = 420;              // message latency
    var nodes, msgs, split, writes, clock, logLines;
    var edgesG, msgG, nodesG, nodeEls = [], edgeEls = {}, banner;

    function reset() {
      clock = 0; msgs = []; split = false; writes = []; logLines = []; selected = null; insp = null;
      nodes = [];
      for (var i = 0; i < N; i++) {
        var a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
        nodes.push({
          id: i, x: CX + R * Math.cos(a), y: CY + R * Math.sin(a),
          alive: true, role: "follower", term: 0, votedFor: null, votes: 0,
          timer: rnd(1400, 2800), hbTimer: 0, side: i < 2 ? 0 : 1, lastValue: 0, commits: 0
        });
      }
      btnSplit.setAttribute("aria-pressed", "false");
      btnSplit.classList.remove("is-on");
      logEl.textContent = "";
      build();
      buildInspector();
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
        g.addEventListener("click", function () { select(n.id); });
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(n.id); } });
        n.el = { g: g, arc: arc, term: t2, crown: crown };
        return n.el;
      });
      layoutSplit();
    }

    function setAlive(n, alive) {
      if (n.alive === alive) return;
      n.alive = alive;
      if (!alive) { n.role = "follower"; n.votes = 0; log("N" + n.id + tr(" crashed.", " bị sập."), "bad"); }
      else { n.timer = rnd(1400, 2800); n.role = "follower"; log("N" + n.id + tr(" is back online as a follower.", " hoạt động lại với vai trò follower."), "ok"); }
    }

    /* ---- inspector: click a node to see its internal state ---- */
    function select(i) {
      selected = selected === i ? null : i;
      buildInspector();
    }

    function buildInspector() {
      inspectEl.textContent = "";
      insp = null;
      if (selected == null) {
        var hint = document.createElement("p");
        hint.className = "lab-hint";
        hint.textContent = tr("Click a node to inspect it.", "Bấm vào một node để xem chi tiết.");
        inspectEl.appendChild(hint);
        return;
      }
      var dl = document.createElement("dl");
      dl.className = "lab-kv";
      insp = { rows: {} };
      [["role", tr("Role", "Vai trò")], ["term", tr("Current term", "Term hiện tại")], ["vote", tr("Voted for (this term)", "Đã bầu cho (term này)")],
       ["votes", tr("Votes received", "Phiếu nhận được")], ["timer", tr("Election timer", "Bộ đếm bầu cử")], ["peers", tr("Peers it can reach", "Peer liên lạc được")],
       ["val", tr("Last value stored", "Giá trị lưu gần nhất")]].forEach(function (r) {
        var dt = document.createElement("dt"); dt.textContent = r[1];
        var dd = document.createElement("dd"); insp.rows[r[0]] = dd;
        dl.appendChild(dt); dl.appendChild(dd);
      });
      var head = document.createElement("div");
      head.className = "lab-inspect-head";
      var title = document.createElement("b");
      title.textContent = "N" + selected;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lab-btn lab-btn-ghost lab-btn-sm";
      var i = selected;
      btn.addEventListener("click", function () { setAlive(nodes[i], !nodes[i].alive); fillInspector(); });
      insp.btn = btn;
      head.appendChild(title); head.appendChild(btn);
      inspectEl.appendChild(head);
      inspectEl.appendChild(dl);
      fillInspector();
    }

    function fillInspector() {
      if (!insp || selected == null) return;
      var n = nodes[selected], r = insp.rows;
      var peers = 0;
      for (var j = 0; j < N; j++) if (j !== n.id && reach(n.id, j)) peers++;
      var need = Math.floor(N / 2) + 1;
      r.role.textContent = n.alive ? n.role : tr("down", "đã sập");
      r.term.textContent = n.term;
      r.vote.textContent = n.votedFor == null ? "—" : "N" + n.votedFor;
      r.votes.textContent = n.role === "candidate" ? n.votes + " / " + N + tr("  (needs " + need + ")", "  (cần " + need + ")") : "—";
      r.timer.textContent = !n.alive ? "—" : n.role === "leader" ? tr("leader: sends heartbeats", "leader: gửi heartbeat") : (Math.max(0, n.timer) / 1000).toFixed(1) + " s";
      r.peers.textContent = n.alive ? peers + " / " + (N - 1) : "—";
      r.val.textContent = n.lastValue ? "#" + n.lastValue : "—";
      var label = n.alive ? tr("Crash this node", "Làm sập node này") : tr("Revive this node", "Hồi sinh node này");
      if (insp.btn.textContent !== label) insp.btn.textContent = label;
    }

    function reach(a, b) {
      if (!nodes[a].alive || !nodes[b].alive) return false;
      return !split || nodes[a].side === nodes[b].side;
    }

    function sideNames() {
      var a = [], b = [];
      nodes.forEach(function (n) { (n.side === 0 ? a : b).push("N" + n.id); });
      return "{" + a.join(",") + "} | {" + b.join(",") + "}";
    }

    function layoutSplit() {
      for (var k in edgeEls) {
        var p = k.split("-");
        edgeEls[k].classList.toggle("is-cut", split && nodes[+p[0]].side !== nodes[+p[1]].side);
      }
      if (split) {
        // dashed divider: perpendicular bisector between the two groups' centres
        var ca = { x: 0, y: 0, n: 0 }, cb = { x: 0, y: 0, n: 0 };
        nodes.forEach(function (n) { var c = n.side === 0 ? ca : cb; c.x += n.x; c.y += n.y; c.n++; });
        var ax = ca.x / ca.n, ay = ca.y / ca.n, bx = cb.x / cb.n, by = cb.y / cb.n;
        var mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1;
        var px = -dy / len * 190, py = dx / len * 190;
        banner.setAttribute("x1", mx - px); banner.setAttribute("y1", my - py);
        banner.setAttribute("x2", mx + px); banner.setAttribute("y2", my + py);
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

    function setSplit(on, sideOfNode) {
      split = on;
      if (on) nodes.forEach(function (n) { n.side = sideOfNode ? sideOfNode(n) : (n.id < 2 ? 0 : 1); });
      btnSplit.setAttribute("aria-pressed", split ? "true" : "false");
      btnSplit.classList.toggle("is-on", split);
      layoutSplit();
      log(split ? tr("Network split: " + sideNames() + ". The minority can't reach a majority.", "Mạng bị chia: " + sideNames() + ". Phía thiểu số không thể đạt đa số.")
                : tr("Network healed.", "Mạng đã nối lại."), split ? "warn" : "ok");
    }
    btnSplit.addEventListener("click", function () { setSplit(!split); });

    /* ---- one-click experiments ---- */
    function currentLeader() {
      return nodes.filter(function (n) { return n.alive && n.role === "leader"; })[0] || null;
    }
    function noLeader() {
      log(tr("No leader right now. Wait for an election first.", "Hiện chưa có leader. Hãy chờ một cuộc bầu cử."), "warn");
    }
    EXP.raft["kill-leader"] = function () {
      var L = currentLeader();
      if (!L) { noLeader(); return; }
      selected = L.id; buildInspector();
      setAlive(L, false);
      fillInspector();
      log(tr("Watch the followers: one of them times out first and runs for office.", "Hãy xem các follower: một node sẽ hết giờ trước và ra ứng cử."));
    };
    EXP.raft["isolate-leader"] = function () {
      var L = currentLeader();
      if (!L) { noLeader(); return; }
      nodes.forEach(function (n) { setAlive(n, true); });
      var buddy = (L.id + 1) % N;
      setSplit(true, function (n) { return n.id === L.id || n.id === buddy ? 0 : 1; });
      selected = L.id; buildInspector();
      log(tr("N" + L.id + " still believes it is leader but can reach only 2 of 5 nodes. Press Write: it will stall. The majority elects its own leader.",
             "N" + L.id + " vẫn tin mình là leader nhưng chỉ liên lạc được 2/5 node. Bấm Ghi: sẽ bị treo. Phía đa số tự bầu leader riêng."), "warn");
    };
    EXP.raft["lose-quorum"] = function () {
      var L = currentLeader();
      var order = nodes.slice().sort(function (a, b) { return (b === L) - (a === L) || b.id - a.id; });
      var killed = 0;
      order.forEach(function (n) { if (killed < 3 && n.alive) { setAlive(n, false); killed++; } });
      log(tr("Only 2 of 5 nodes are left. A candidate can collect at most 2 votes (it needs 3), so nobody can ever become leader.",
             "Chỉ còn 2/5 node. Một candidate nhiều nhất gom được 2 phiếu (cần 3) nên không ai có thể thành leader."), "bad");
      fillInspector();
    };
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
        var cls = "r-node " + (n.alive ? "is-" + n.role : "is-dead") + (selected === n.id ? " is-selected" : "");
        n.el.g.setAttribute("class", cls);
        n.el.term.textContent = n.alive ? "T" + n.term : "✕";
        n.el.crown.style.opacity = n.alive && n.role === "leader" ? 1 : 0;
        // election-timer ring drains as the timeout approaches
        var frac = n.alive && n.role !== "leader" ? Math.max(0, Math.min(1, n.timer / 2800)) : 0;
        var c = 2 * Math.PI * 38;
        n.el.arc.setAttribute("stroke-dasharray", (c * frac).toFixed(1) + " " + c.toFixed(1));
      });
      card.classList.toggle("has-split-brain", leaders > 1);
      fillInspector();
    }

    reset();
    loop(card, step);
    new MutationObserver(function () { buildInspector(); }).observe(root, { attributes: true, attributeFilter: ["data-lang"] });
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
    var selServer = null, selKey = null, curV = [];
    var infoEl = $("[data-ring-info]", card);

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
      curV = now.vnodes;
      if (selServer && servers.indexOf(selServer) < 0) selServer = null;
      draw(now.vnodes);
      stats();
      info();
    }

    function draw(vs) {
      S.textContent = "";
      svg("circle", { cx: CX, cy: CY, r: RAD, "class": "h-ring" }, S);
      var dim = function (srv) { return selServer && srv !== selServer; };
      var kg = svg("g", {}, S);
      keys.forEach(function (k, i) {
        var p = pt(k.pos, RAD);
        var isSel = selKey === i;
        var c = svg("circle", {
          cx: p[0], cy: p[1], r: isSel ? 6 : lastMoved[i] ? 4.2 : 2.6, fill: color(owner[i]),
          "class": "h-key" + (lastMoved[i] ? " is-moved" : "") + (isSel ? " is-selected" : ""),
          opacity: dim(owner[i]) && !isSel ? 0.15 : 1, stroke: isSel ? "var(--text-primary)" : "transparent", "stroke-width": isSel ? 2 : 7
        }, kg);
        c.addEventListener("click", function (e) { e.stopPropagation(); selKey = selKey === i ? null : i; draw(curV); info(); });
      });
      var vg = svg("g", {}, S);
      vs.forEach(function (v) {
        var a = pt(v.pos, RAD - 10), b = pt(v.pos, RAD + 14);
        svg("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color(v.s), "stroke-width": selServer === v.s ? 4 : 3, "stroke-linecap": "round", opacity: dim(v.s) ? 0.25 : 1, "class": "h-vn" }, vg);
      });
      // server labels: the first virtual node of each server gets a badge you can click
      servers.forEach(function (s) {
        var first = vs.filter(function (v) { return v.s === s; })[0];
        if (!first) return;
        var p = pt(first.pos, RAD + 34);
        var g = svg("g", { "class": "h-badge-g" + (selServer === s ? " is-selected" : ""), tabindex: 0, role: "button", "aria-label": tr("Server ", "Server ") + s }, S);
        svg("circle", { cx: p[0], cy: p[1], r: 13, fill: color(s), "class": "h-badge" }, g);
        var t = svg("text", { x: p[0], y: p[1] + 4.5, "class": "h-badge-t" }, g);
        t.textContent = s;
        function pick() { selServer = selServer === s ? null : s; selKey = null; draw(curV); stats(); info(); }
        g.addEventListener("click", function (e) { e.stopPropagation(); pick(); });
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      });
      var c = svg("text", { x: CX, y: CY - 4, "class": "h-center" }, S);
      c.textContent = servers.length + tr(" servers", " server");
      var c2 = svg("text", { x: CX, y: CY + 16, "class": "h-center-sub" }, S);
      c2.textContent = KEYS + tr(" keys", " key");
    }

    function kv(parent, rows) {
      var dl = document.createElement("dl");
      dl.className = "lab-kv";
      rows.forEach(function (r) {
        var dt = document.createElement("dt"); dt.textContent = r[0];
        var dd = document.createElement("dd"); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      parent.appendChild(dl);
    }

    function info() {
      infoEl.textContent = "";
      var head = document.createElement("div");
      head.className = "lab-inspect-head";
      var title = document.createElement("b");
      if (selKey != null) {
        var k = keys[selKey];
        var vn = curV.filter(function (v) { return v.pos >= k.pos; })[0] || curV[0];
        var modOwner = modAssign(servers)[selKey];
        title.textContent = "key:" + selKey;
        head.appendChild(title);
        infoEl.appendChild(head);
        kv(infoEl, [
          [tr("Hash position", "Vị trí băm"), k.pos.toFixed(4) + " (" + Math.round(k.pos * 360) + "°)"],
          [tr("Next server clockwise", "Server kế tiếp theo chiều kim đồng hồ"), vn.s + " @ " + vn.pos.toFixed(4)],
          [tr("Owner", "Chủ sở hữu"), owner[selKey]],
          [tr("hash mod N would pick", "hash mod N sẽ chọn"), modOwner + (modOwner === owner[selKey] ? "" : tr("  (different!)", "  (khác!)"))]
        ]);
      } else if (selServer) {
        var cnt = owner.filter(function (o) { return o === selServer; }).length;
        var modCnt = modAssign(servers).filter(function (o) { return o === selServer; }).length;
        var mine = curV.filter(function (v) { return v.s === selServer; });
        title.textContent = tr("Server ", "Server ") + selServer;
        head.appendChild(title);
        infoEl.appendChild(head);
        kv(infoEl, [
          [tr("Keys owned", "Số key sở hữu"), cnt + " / " + KEYS + " (" + Math.round(cnt / KEYS * 100) + "%)"],
          [tr("Ideal share", "Phần lý tưởng"), Math.round(100 / servers.length) + "%"],
          [tr("Virtual nodes", "Virtual node"), String(mine.length)],
          [tr("hash mod N would give it", "hash mod N sẽ cho nó"), modCnt + tr(" keys", " key")]
        ]);
      } else {
        var hint = document.createElement("p");
        hint.className = "lab-hint";
        hint.textContent = tr("Click a server badge, a load bar or any key dot to inspect it.", "Bấm vào server, thanh tải hoặc một chấm key để xem chi tiết.");
        infoEl.appendChild(hint);
      }
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
        row.className = "load-row" + (selServer === s ? " is-selected" : "");
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.addEventListener("click", function () { selServer = selServer === s ? null : s; selKey = null; draw(curV); stats(); info(); });
        row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); } });
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

    function addServer() {
      if (servers.length >= NAMES.length) return;
      var prev = servers.slice();
      servers.push(NAMES.filter(function (n) { return servers.indexOf(n) < 0; })[0]);
      recompute(prev);
    }
    function removeServer() {
      if (servers.length <= 2) return;
      var prev = servers.slice();
      servers.splice((Math.random() * servers.length) | 0, 1);
      recompute(prev);
    }
    $("[data-ring-add]", card).addEventListener("click", addServer);
    $("[data-ring-remove]", card).addEventListener("click", removeServer);

    function baseline(list, vn) {
      servers = list.slice();
      vnEl.value = vn;
      vnVal.textContent = vn;
      moved = naive = null;
      lastMoved = {};
      prevOwners = null;
      selServer = selKey = null;
      recompute(null);
    }
    EXP.ring["few-vnodes"] = function () { baseline(["A", "B", "C"], 1); addServer(); };
    EXP.ring["many-vnodes"] = function () { baseline(["A", "B", "C"], 40); addServer(); };
    EXP.ring["remove-one"] = function () { baseline(["A", "B", "C", "D"], 20); removeServer(); };

    S.addEventListener("click", function () { if (selServer || selKey != null) { selServer = null; selKey = null; draw(curV); stats(); info(); } });
    vnEl.addEventListener("input", function () {
      vnVal.textContent = vnEl.value;
      moved = naive = null;
      lastMoved = {};
      prevOwners = null;
      recompute(null);
    });

    recompute(null);
    new MutationObserver(function () { draw(curV); stats(); info(); }).observe(root, { attributes: true, attributeFilter: ["data-lang"] });
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
    var version = 0, replicas = [], timers = [];

    function N() { return +nEl.value; }
    function aliveIdx() {
      var a = [];
      replicas.forEach(function (r, i) { if (!r.down) a.push(i); });
      return a;
    }

    function sync() {
      var n = N();
      [wEl, rEl].forEach(function (e) { e.max = n; if (+e.value > n) e.value = n; });
      $("[data-q-n-val]", card).textContent = n;
      $("[data-q-w-val]", card).textContent = wEl.value;
      $("[data-q-r-val]", card).textContent = rEl.value;
      var w = +wEl.value, r = +rEl.value;
      var ok = w + r > n;
      var alive = replicas.length ? aliveIdx().length : n;
      var avail = alive >= w && alive >= r;
      verdict.className = "lab-verdict " + (ok && avail ? "is-ok" : "is-bad");
      verdict.textContent = "W + R = " + (w + r) + (ok ? " > " : " ≤ ") + "N = " + n + " → " +
        (ok ? tr("overlap guaranteed: reads see the latest write", "đảm bảo giao nhau: đọc luôn thấy bản ghi mới nhất")
            : tr("no overlap: a read can miss the latest write", "không giao nhau: đọc có thể bỏ lỡ bản ghi mới nhất")) +
        (alive < n ? "  ·  " + alive + "/" + n + tr(" replicas alive", " replica còn sống") : "") +
        (!avail ? "  ·  " + tr("not enough live replicas: " + (alive < w ? "writes" : "reads") + " are rejected", "không đủ replica sống: " + (alive < w ? "ghi" : "đọc") + " bị từ chối") : "");
    }

    function resetReplicas() {
      timers.forEach(clearTimeout); timers = [];
      version = 0;
      replicas = [];
      for (var i = 0; i < N(); i++) replicas.push({ v: 0, state: "", down: false });
      renderReplicas();
      readout.className = "q-readout";
      readout.textContent = tr("Press Write, then Read. Click a replica to crash it.", "Bấm Ghi, rồi bấm Đọc. Bấm vào replica để làm sập nó.");
    }

    function renderReplicas() {
      box.textContent = "";
      replicas.forEach(function (r, i) {
        var d = document.createElement("button");
        d.type = "button";
        d.className = "q-rep" + (r.down ? " is-down" : r.state ? " " + r.state : "") + (!r.down && r.v === version ? " is-latest" : " is-old");
        d.title = tr("Click to crash / revive this replica", "Bấm để làm sập / hồi sinh replica này");
        d.setAttribute("aria-label", "R" + (i + 1) + ", v" + r.v + (r.down ? ", down" : ""));
        var id = document.createElement("span"); id.className = "q-id"; id.textContent = "R" + (i + 1);
        var v = document.createElement("b"); v.className = "q-v"; v.textContent = r.down ? "✕" : "v" + r.v;
        var st = document.createElement("span"); st.className = "q-st"; st.textContent = r.down ? "v" + r.v + tr(" (down)", " (sập)") : "";
        d.appendChild(id); d.appendChild(v); d.appendChild(st);
        d.addEventListener("click", function () { toggleDown(i); });
        box.appendChild(d);
      });
    }

    function toggleDown(i) {
      var r = replicas[i];
      r.down = !r.down;
      if (!r.down) {
        // anti-entropy: a revived replica catches up shortly after coming back
        (function (i) {
          timers.push(setTimeout(function () {
            if (replicas[i] && !replicas[i].down && replicas[i].v < version) { replicas[i].v = version; replicas[i].state = "is-written"; renderReplicas(); }
          }, 1500));
        })(i);
        readout.className = "q-readout";
        readout.textContent = tr("R" + (i + 1) + " is back, stale at v" + r.v + ". It catches up in ~1.5 s.", "R" + (i + 1) + " đã trở lại, đang cũ ở v" + r.v + ". Nó sẽ bắt kịp sau ~1,5 giây.");
      }
      renderReplicas();
      sync();
    }

    function pickFrom(list, k) {   // k distinct random elements of list
      var a = list.slice();
      for (var j = a.length - 1; j > 0; j--) { var t = (Math.random() * (j + 1)) | 0; var x = a[j]; a[j] = a[t]; a[t] = x; }
      return a.slice(0, k);
    }

    function reject(what, have, need) {
      readout.className = "q-readout is-bad";
      readout.textContent = tr(what + " rejected: only " + have + " of " + N() + " replicas are alive but " + (what === "Write" ? "W" : "R") + " = " + need + ".",
                               (what === "Write" ? "Ghi" : "Đọc") + " bị từ chối: chỉ còn " + have + "/" + N() + " replica sống nhưng " + (what === "Write" ? "W" : "R") + " = " + need + ".");
    }

    function doWrite() {
      var w = +wEl.value, n = N(), alive = aliveIdx();
      if (alive.length < w) { reject("Write", alive.length, w); return; }
      version++;
      var now = pickFrom(alive, w);
      replicas.forEach(function (r) { r.state = ""; });
      now.forEach(function (i) { replicas[i].v = version; replicas[i].state = "is-written"; });
      var v = version;
      alive.forEach(function (i, k) {
        if (now.indexOf(i) >= 0) return;
        timers.push(setTimeout(function () {
          if (replicas[i] && !replicas[i].down && replicas[i].v < v) { replicas[i].v = v; replicas[i].state = "is-written"; renderReplicas(); }
        }, 1800 + k * 250));
      });
      renderReplicas();
      readout.className = "q-readout";
      readout.textContent = tr("Wrote v" + v + " to " + w + " replicas. The rest catch up in ~2 s (replication lag).", "Đã ghi v" + v + " vào " + w + " replica. Phần còn lại bắt kịp sau ~2 giây (độ trễ sao chép).");
    }

    function doRead() {
      var r = +rEl.value, alive = aliveIdx();
      if (alive.length < r) { reject("Read", alive.length, r); return; }
      var ask = pickFrom(alive, r);
      var best = 0;
      replicas.forEach(function (x) { x.state = ""; });
      ask.forEach(function (i) { replicas[i].state = "is-read"; best = Math.max(best, replicas[i].v); });
      renderReplicas();
      var stale = best < version;
      readout.className = "q-readout " + (stale ? "is-bad" : "is-ok");
      readout.textContent = tr("Read " + r + " replicas → newest value v" + best + (stale ? "  ✗ STALE — the latest is v" + version : "  ✔ up to date"),
                               "Đọc " + r + " replica → giá trị mới nhất v" + best + (stale ? "  ✗ CŨ — bản mới nhất là v" + version : "  ✔ đã cập nhật"));
    }

    function choose(n, k) { if (k < 0 || k > n) return 0; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }

    function addRow(label, text, frac, bad) {
      var line = document.createElement("div"); line.className = "lab-stat-row";
      var a = document.createElement("span"); a.textContent = label;
      var b = document.createElement("b"); b.textContent = text;
      var bar = document.createElement("div"); bar.className = "lab-bar" + (bad ? " lab-bar-bad" : "");
      var fill = document.createElement("i"); fill.style.width = Math.min(100, frac * 100) + "%"; bar.appendChild(fill);
      line.appendChild(a); line.appendChild(b);
      statsEl.appendChild(line); statsEl.appendChild(bar);
    }

    function runTrials() {
      var n = N(), w = +wEl.value, r = +rEl.value, TR = 500, stale = 0;
      var alive = aliveIdx(), a = alive.length;
      statsEl.textContent = "";
      if (a < w || a < r) {
        addRow(tr("Unavailable requests", "Yêu cầu không phục vụ được"), "100%", 1, true);
        var nn = document.createElement("p"); nn.className = "lab-note";
        nn.textContent = tr("Only " + a + " of " + n + " replicas are alive, but this setting needs W = " + w + " and R = " + r + ". Strict quorums buy freshness with availability.",
                            "Chỉ còn " + a + "/" + n + " replica sống, nhưng cấu hình này cần W = " + w + " và R = " + r + ". Quorum chặt đổi tính sẵn sàng lấy độ tươi.");
        statsEl.appendChild(nn);
        return;
      }
      for (var t = 0; t < TR; t++) {
        var wr = pickFrom(alive, w), rd = pickFrom(alive, r), hit = false;
        for (var i = 0; i < rd.length; i++) if (wr.indexOf(rd[i]) >= 0) { hit = true; break; }
        if (!hit) stale++;
      }
      var theory = w + r > a ? 0 : choose(a - w, r) / choose(a, r);
      var sim = stale / TR;
      addRow(tr("Measured stale reads", "Đọc dữ liệu cũ (đo được)"), (sim * 100).toFixed(1) + "%", sim, true);
      addRow(tr("Predicted  C(N−W, R) / C(N, R)", "Dự đoán  C(N−W, R) / C(N, R)"), (theory * 100).toFixed(1) + "%", theory, false);
      var note = document.createElement("p"); note.className = "lab-note";
      note.textContent = tr("Worst case: every read happens right after a write, before replication lag has healed." + (a < n ? " Computed over the " + a + " live replicas." : ""),
                            "Trường hợp xấu nhất: mọi lần đọc diễn ra ngay sau lần ghi, trước khi độ trễ sao chép kịp hồi phục." + (a < n ? " Tính trên " + a + " replica còn sống." : ""));
      statsEl.appendChild(note);
    }

    $("[data-q-write]", card).addEventListener("click", doWrite);
    $("[data-q-read]", card).addEventListener("click", doRead);
    $("[data-q-run]", card).addEventListener("click", runTrials);

    nEl.addEventListener("input", function () { resetReplicas(); sync(); });
    wEl.addEventListener("input", sync);
    rEl.addEventListener("input", sync);
    new MutationObserver(function () { sync(); renderReplicas(); }).observe(root, { attributes: true, attributeFilter: ["data-lang"] });

    function setup(n, w, r) { setRange(nEl, n); setRange(wEl, w); setRange(rEl, r); }
    EXP.quorum["fast-stale"] = function () { setup(5, 1, 1); runTrials(); };
    EXP.quorum["strict"] = function () { setup(5, 3, 3); runTrials(); };
    EXP.quorum["read-heavy"] = function () { setup(5, 5, 1); runTrials(); };
    EXP.quorum["crash-two"] = function () {
      setup(5, 3, 3);
      [0, 1, 2].forEach(function (i) { replicas[i].down = true; });
      renderReplicas(); sync(); runTrials();
      readout.className = "q-readout is-bad";
      readout.textContent = tr("R1–R3 crashed. 2 of 5 left, but W = 3: writes are rejected. Try Write.", "R1–R3 đã sập. Còn 2/5, nhưng W = 3: ghi bị từ chối. Thử bấm Ghi.");
    };

    sync();
    resetReplicas();
    sync();
  })();

  /* ----------------------------------------------------------------------
     Shared UI: one-click experiments and the deep-dive tabs
  ---------------------------------------------------------------------- */
  document.querySelectorAll("[data-exps]").forEach(function (row) {
    var key = row.closest("[data-lab]").getAttribute("data-lab");
    row.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-exp]");
      if (!chip) return;
      var fn = EXP[key] && EXP[key][chip.getAttribute("data-exp")];
      if (fn) fn();
      row.querySelectorAll(".lab-chip").forEach(function (c) { c.classList.toggle("is-on", c === chip); });
    });
  });

  document.querySelectorAll("[data-deep]").forEach(function (sec) {
    var cardId = sec.closest("[data-lab]").id;
    var panels = Array.prototype.slice.call(sec.querySelectorAll(".lab-panel"));
    var list = document.createElement("div");
    list.className = "lab-tabs";
    list.setAttribute("role", "tablist");
    var tabs = panels.map(function (p, i) {
      var h = p.querySelector(".lab-ph");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "lab-tab";
      b.setAttribute("role", "tab");
      b.id = cardId + "-tab-" + p.getAttribute("data-panel");
      Array.prototype.forEach.call(h.childNodes, function (c) { b.appendChild(c.cloneNode(true)); });
      p.id = cardId + "-" + p.getAttribute("data-panel");
      p.setAttribute("role", "tabpanel");
      p.setAttribute("aria-labelledby", b.id);
      b.setAttribute("aria-controls", p.id);
      b.addEventListener("click", function () { show(i, true); });
      b.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var j = (i + d + panels.length) % panels.length;
        show(j, true);
        tabs[j].focus();
      });
      list.appendChild(b);
      return b;
    });
    sec.insertBefore(list, panels[0]);
    sec.classList.add("has-tabs");

    function show(i, record) {
      panels.forEach(function (p, j) {
        p.hidden = j !== i;
        tabs[j].setAttribute("aria-selected", j === i ? "true" : "false");
        tabs[j].tabIndex = j === i ? 0 : -1;
        tabs[j].classList.toggle("is-on", j === i);
      });
      if (record && history.replaceState) {
        try { history.replaceState(null, "", "#" + panels[i].id); } catch (e) { /* file:// etc. */ }
      }
    }
    show(0, false);

    // deep links like /lab/#raft-papers open the right tab
    function fromHash() {
      var id = decodeURIComponent(location.hash.slice(1));
      for (var i = 0; i < panels.length; i++) {
        if (panels[i].id === id) { show(i, false); sec.scrollIntoView({ block: "start" }); return; }
      }
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
  });
})();

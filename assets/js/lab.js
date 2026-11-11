/* ==========================================================================
   The Lab (/lab/): six small distributed-systems experiments.
     1. Raft         — leader election, crashes, network partition, quorum writes
     2. Hash ring    — consistent hashing with virtual nodes vs. hash mod N
     3. Quorums      — N / W / R and the stale-read probability
     4. Gossip       — rumour spreading and SWIM-style failure detection
     5. CRDTs        — PN-counter and OR-set vs. naive last-write-wins
     6. Tab cluster  — every open tab is a real node (BroadcastChannel + Web Locks)
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

  var EXP = { raft: {}, ring: {}, quorum: {}, gossip: {}, crdt: {}, tabs: {} };   // one-click experiments, filled in by each sim

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
     4. GOSSIP — rumour spreading and SWIM-style failure detection
  ---------------------------------------------------------------------- */
  (function gossip() {
    var card = $('[data-lab="gossip"]');
    if (!card) return;
    var S = $("[data-g-svg]", card);
    var fanEl = $("[data-g-fan]", card), styleEl = $("[data-g-style]", card), kEl = $("[data-g-k]", card);
    var lossEl = $("[data-g-loss]", card), speedEl = $("[data-g-speed]", card);
    var statsEl = $("[data-g-stats]", card), readEl = $("[data-g-readout]", card), legendEl = $("[data-g-legend]", card);

    var N = 24, CX = 260, CY = 220, R = 180;
    var ROUND = 900, DUR = 480;          // sim-ms per protocol round / per message flight
    var SUSP = 6;                        // rounds a suspect has to refute before being declared dead
    var LEFT = Math.ceil(3 * Math.log(N + 1) / Math.LN2);   // how many times an update is piggy-backed
    var STYLES = ["push", "pull", "push-pull"];
    var mode = "rumor", nodes = [], dots = [], acc = 0, round = 0, sent = 0, run, swim, dotsG;

    function lost() { return Math.random() < (+lossEl.value) / 100; }
    function peers(i, pred) {
      var out = [];
      for (var j = 0; j < N; j++) if (j !== i && (!pred || pred(j))) out.push(j);
      return out;
    }
    function sample(list, k) {
      var a = list.slice();
      for (var j = a.length - 1; j > 0; j--) { var t = (Math.random() * (j + 1)) | 0; var x = a[j]; a[j] = a[t]; a[t] = x; }
      return a.slice(0, k);
    }
    function send(from, to, kind, ok, delay) {
      sent++;
      dots.push({ a: from, b: to, kind: kind, ok: ok, t: -(delay || 0), el: null });
    }

    function reset() {
      round = 0; sent = 0; acc = 0; dots = [];
      run = { start: null, msgs0: 0, doneRound: null, doneMsgs: null };
      swim = { crashRound: null, firstDetect: null, allDetect: null, suspicions: 0, falseDead: 0, refutes: 0, declared: {} };
      nodes = [];
      for (var i = 0; i < N; i++) {
        var a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
        var n = { id: i, x: CX + R * Math.cos(a), y: CY + R * Math.sin(a), alive: true, knows: false, hop: 0, inc: 0, view: [], buf: [] };
        for (var j = 0; j < N; j++) n.view.push({ inc: 0, st: 0, t: 0 });   // st: 0 alive, 1 suspect, 2 dead
        nodes.push(n);
      }
      build(); paint(); stats(); hint();
    }

    function build() {
      S.textContent = "";
      dotsG = svg("g", {}, S);
      nodes.forEach(function (n) {
        var g = svg("g", { "class": "g-node", tabindex: 0, role: "button", "aria-label": "node " + n.id }, S);
        svg("circle", { cx: n.x, cy: n.y, r: 15, "class": "g-body" }, g);
        var t = svg("text", { x: n.x, y: n.y + 4, "class": "g-id" }, g); t.textContent = n.id;
        var lab = svg("text", { x: n.x, y: n.y + (n.y < CY ? -21 : 28), "class": "g-label" }, g);
        g.addEventListener("click", function () { clickNode(n.id); });
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clickNode(n.id); } });
        n.el = { g: g, label: lab };
      });
    }

    function clickNode(i) {
      var n = nodes[i];
      if (mode === "rumor") {
        if (n.knows) return;
        if (run.start === null) { run.start = round; run.msgs0 = sent; }
        n.knows = true; n.hop = 0;
      } else {
        setAlive(n, !n.alive);
      }
      paint(); stats(); hint();
    }

    /* ---- failure detector bookkeeping ---- */
    function addBuf(n, j) {
      n.buf = n.buf.filter(function (b) { return b.j !== j; });
      var v = n.view[j];
      n.buf.push({ j: j, inc: v.inc, st: v.st, left: LEFT });
    }
    function takeItems(n) {          // piggy-back up to 4 of the least-gossiped updates
      n.buf.sort(function (a, b) { return b.left - a.left; });
      var out = n.buf.slice(0, 4).map(function (b) { b.left--; return { j: b.j, inc: b.inc, st: b.st }; });
      n.buf = n.buf.filter(function (b) { return b.left > 0; });
      return out;
    }
    function merge(n, items) {
      items.forEach(function (it) {
        if (it.j === n.id) {          // a rumour about me: if it says I'm suspect/dead, refute with a higher incarnation
          if (it.st > 0 && it.inc >= n.inc) {
            n.inc = it.inc + 1; n.view[n.id] = { inc: n.inc, st: 0, t: 0 };
            addBuf(n, n.id); swim.refutes++;
          }
          return;
        }
        var v = n.view[it.j];
        if (it.inc > v.inc || (it.inc === v.inc && it.st > v.st)) {
          v.inc = it.inc; v.st = it.st; v.t = SUSP; addBuf(n, it.j);
        }
      });
    }
    function setAlive(n, alive) {
      if (n.alive === alive) return;
      n.alive = alive;
      var crashed = nodes.filter(function (x) { return !x.alive; }).length;
      if (!alive) {
        if (swim.crashRound === null || swim.allDetect !== null) { swim.crashRound = round; swim.firstDetect = null; swim.allDetect = null; }
      } else {
        n.inc++; n.view[n.id] = { inc: n.inc, st: 0, t: 0 }; n.buf = []; addBuf(n, n.id);   // rejoin announcement
        if (!crashed) { swim.crashRound = null; swim.firstDetect = null; swim.allDetect = null; }
      }
    }

    /* ---- one protocol round ---- */
    function stepRumor() {
      var fan = +fanEl.value, style = STYLES[+styleEl.value], learn = [];
      nodes.forEach(function (n) {
        if (n.knows && style !== "pull") {
          sample(peers(n.id), fan).forEach(function (j) { var ok = !lost(); send(n.id, j, "push", ok); if (ok) learn.push([j, n.hop + 1]); });
        }
        if (!n.knows && style !== "push") {
          sample(peers(n.id), fan).forEach(function (j) {
            var ok = !lost(); send(n.id, j, "pull", ok);
            if (ok && nodes[j].knows) { var ok2 = !lost(); send(j, n.id, "push", ok2, 260); if (ok2) learn.push([n.id, nodes[j].hop + 1]); }
          });
        }
      });
      learn.forEach(function (l) { var n = nodes[l[0]]; if (!n.knows) { n.knows = true; n.hop = l[1]; } });
      var inf = nodes.filter(function (n) { return n.knows; }).length;
      if (inf === N && run.doneRound === null && run.start !== null) { run.doneRound = round - run.start; run.doneMsgs = sent - run.msgs0; }
    }

    function stepSwim() {
      var k = +kEl.value;
      nodes.forEach(function (n) {
        if (!n.alive) return;
        n.view.forEach(function (v, j) {                 // suspicion timeouts
          if (v.st === 1 && --v.t <= 0) {
            v.st = 2; addBuf(n, j);
            var key = j + ":" + v.inc;     // count each wrongful verdict once, not once per observer
            if (nodes[j].alive && !swim.declared[key]) { swim.declared[key] = true; swim.falseDead++; }
          }
        });
        var cand = peers(n.id, function (j) { return n.view[j].st !== 2; });
        if (!cand.length) return;
        var j = cand[(Math.random() * cand.length) | 0], T = nodes[j];
        var ok1 = !lost(), got = false;
        send(n.id, j, "ping", ok1);
        if (ok1 && T.alive) {
          merge(T, takeItems(n));
          var ok2 = !lost(); send(j, n.id, "ack", ok2, 260);
          if (ok2) { merge(n, takeItems(T)); got = true; }
        }
        if (!got && k > 0) {                              // ping-req through k other nodes
          sample(peers(n.id, function (m) { return m !== j && n.view[m].st !== 2; }), k).forEach(function (m) {
            var M = nodes[m], a = !lost();
            send(n.id, m, "preq", a);
            if (!a || !M.alive) return;
            var b = !lost(); send(m, j, "ping", b, 200);
            if (!b || !T.alive) return;
            var c = !lost(); send(j, m, "ack", c, 400);
            if (!c) return;
            var d = !lost(); send(m, n.id, "ack", d, 600);
            if (d) { merge(n, takeItems(T)); got = true; }
          });
        }
        if (!got && n.view[j].st === 0) {
          n.view[j].st = 1; n.view[j].t = SUSP; addBuf(n, j);
          if (T.alive) swim.suspicions++;
        }
        // plus a little gossip on the side (memberlist does this too): two random peers get my latest news
        sample(peers(n.id, function (m) { return n.view[m].st !== 2; }), 2).forEach(function (m) {
          var ok = !lost(); send(n.id, m, "gossip", ok);
          if (ok && nodes[m].alive) merge(nodes[m], takeItems(n));
        });
      });
      // detection tracking
      var down = nodes.filter(function (x) { return !x.alive; }), live = nodes.filter(function (x) { return x.alive; });
      if (down.length && swim.crashRound !== null) {
        var any = false, all = live.length > 0;
        down.forEach(function (d) {
          var cnt = 0; live.forEach(function (o) { if (o.view[d.id].st === 2) cnt++; });
          if (cnt > 0) any = true;
          if (cnt < live.length) all = false;
        });
        if (any && swim.firstDetect === null) swim.firstDetect = round - swim.crashRound;
        if (all && swim.allDetect === null) swim.allDetect = round - swim.crashRound;
      }
    }

    function step() {
      round++;
      if (mode === "rumor") stepRumor(); else stepSwim();
      paint(); stats(); hint();
    }

    /* ---- drawing ---- */
    function paint() {
      nodes.forEach(function (n) {
        var cls = "g-node", label = "";
        if (mode === "rumor") {
          if (n.knows) { cls += " is-informed"; label = "h" + n.hop; }
        } else {
          var live = nodes.filter(function (o) { return o.alive && o.id !== n.id; }), s = 0, d = 0, L = live.length || 1;
          live.forEach(function (o) { var st = o.view[n.id].st; if (st === 1) s++; else if (st === 2) d++; });
          if (!n.alive) cls += d / L > 0.5 ? " is-gone" : " is-down";
          else if (d / L > 0.5) cls += " is-wrong";
          else if (s + d > 0) cls += " is-susp";
          else cls += " is-ok";
          if (d) label = "✝" + Math.round(100 * d / L) + "%"; else if (s) label = "?" + Math.round(100 * s / L) + "%";
        }
        n.el.g.setAttribute("class", cls);
        n.el.label.textContent = label;
      });
    }

    function drawDots(dt) {
      var dur = DUR;
      for (var i = dots.length - 1; i >= 0; i--) {
        var d = dots[i];
        d.t += dt;
        if (!d.el) d.el = svg("circle", { r: 3.5, "class": "g-dot g-" + d.kind + (d.ok ? "" : " is-lost") }, dotsG);
        if (d.t < 0) { d.el.setAttribute("opacity", 0); continue; }
        var f = d.t / dur;
        if (!d.ok) f *= 0.5;
        if (f >= (d.ok ? 1 : 0.5)) { dotsG.removeChild(d.el); dots.splice(i, 1); continue; }
        var A = nodes[d.a], B = nodes[d.b];
        d.el.setAttribute("opacity", d.ok ? 1 : 1 - f * 2);
        d.el.setAttribute("cx", A.x + (B.x - A.x) * f);
        d.el.setAttribute("cy", A.y + (B.y - A.y) * f);
      }
    }

    function legend() {
      var items = mode === "rumor"
        ? [["is-ok", tr("doesn't know", "chưa biết")], ["is-informed", tr("knows the rumour", "đã biết tin")]]
        : [["is-ok", tr("healthy", "khỏe")], ["is-susp", tr("suspected by some", "bị nghi")], ["is-down", tr("crashed", "đã sập")], ["is-wrong", tr("alive but declared dead", "còn sống nhưng bị tuyên bố chết")]];
      legendEl.textContent = "";
      items.forEach(function (it) {
        var s = document.createElement("span");
        var i = document.createElement("i"); i.className = "dot g-key " + it[0];
        s.appendChild(i); s.appendChild(document.createTextNode(it[1]));
        legendEl.appendChild(s);
      });
    }

    function row(label, text, frac, bad) {
      var line = document.createElement("div"); line.className = "lab-stat-row";
      var a = document.createElement("span"); a.textContent = label;
      var b = document.createElement("b"); b.textContent = text;
      line.appendChild(a); line.appendChild(b); statsEl.appendChild(line);
      if (frac !== undefined) {
        var bar = document.createElement("div"); bar.className = "lab-bar" + (bad ? " lab-bar-bad" : "");
        var fill = document.createElement("i"); fill.style.width = Math.min(100, frac * 100) + "%"; bar.appendChild(fill);
        statsEl.appendChild(bar);
      }
    }

    function stats() {
      statsEl.textContent = "";
      row(tr("Round", "Vòng"), String(round));
      if (mode === "rumor") {
        var inf = nodes.filter(function (n) { return n.knows; }).length;
        row(tr("Know the rumour", "Đã biết tin đồn"), inf + " / " + N, inf / N);
        row(tr("Messages sent", "Tin nhắn đã gửi"), String(sent));
        if (run.doneRound !== null) row(tr("Reached everyone in", "Lan khắp cụm sau"), run.doneRound + tr(" rounds · ", " vòng · ") + run.doneMsgs + tr(" msgs", " tin"), 1);
      } else {
        var live = nodes.filter(function (n) { return n.alive; }).length, down = N - live;
        row(tr("Alive / crashed", "Sống / sập"), live + " / " + down);
        if (down) {
          row(tr("First node says “dead” after", "Node đầu tiên báo “chết” sau"), swim.firstDetect === null ? "…" : swim.firstDetect + tr(" rounds", " vòng"));
          row(tr("Every live node knows after", "Mọi node sống đều biết sau"), swim.allDetect === null ? "…" : swim.allDetect + tr(" rounds", " vòng"));
        }
        row(tr("False suspicions", "Nghi ngờ nhầm"), String(swim.suspicions));
        row(tr("Refuted by the victim", "Bị nạn nhân bác bỏ"), String(swim.refutes));
        row(tr("Wrongly declared dead", "Bị tuyên bố chết nhầm"), String(swim.falseDead), swim.falseDead ? Math.min(1, swim.falseDead / 10) : 0, true);
        row(tr("Messages sent", "Tin nhắn đã gửi"), String(sent));
      }
    }

    function hint() {
      readEl.className = "q-readout";
      var f = +fanEl.value;
      if (mode === "rumor") {
        var inf = nodes.filter(function (n) { return n.knows; }).length;
        if (!inf) readEl.textContent = tr("Click any node to whisper a rumour into it.", "Bấm vào một node bất kỳ để thì thầm tin đồn vào đó.");
        else if (inf < N) readEl.textContent = tr(inf + " of " + N + " nodes know. Each round the informed set can at most multiply by " + (f + 1) + ".", inf + "/" + N + " node đã biết. Mỗi vòng tập node biết tối đa nhân " + (f + 1) + " lần.");
        else {
          readEl.className = "q-readout is-ok";
          var lb = Math.ceil(Math.log(N) / Math.log(f + 1));
          readEl.textContent = tr("Everyone knows after " + run.doneRound + " rounds. Hard lower bound with fanout " + f + ": " + lb + " rounds (the set can only multiply by " + (f + 1) + " per round). Randomness costs a few extra.",
                                  "Mọi node đã biết sau " + run.doneRound + " vòng. Cận dưới cứng với fanout " + f + ": " + lb + " vòng (tập node biết chỉ nhân tối đa " + (f + 1) + " mỗi vòng). Tính ngẫu nhiên tốn thêm vài vòng.");
        }
      } else {
        var down = nodes.filter(function (n) { return !n.alive; });
        if (!down.length) readEl.textContent = tr("Click a node to crash it, then watch the others find out without anyone being told.", "Bấm vào node để làm sập, rồi xem các node khác tự phát hiện mà không ai báo.");
        else if (swim.allDetect === null) { readEl.className = "q-readout is-bad"; readEl.textContent = tr(down.length + " crashed. Nobody has been told: peers only find out by probing it and gossiping the result.", "Đã sập " + down.length + " node. Không ai được báo: các node chỉ biết khi dò nó rồi lan truyền kết quả."); }
        else { readEl.className = "q-readout is-ok"; readEl.textContent = tr("All live nodes agree after " + swim.allDetect + " rounds, with no coordinator. Click the crashed node again to revive it: it refutes with a higher incarnation.", "Mọi node sống đã đồng thuận sau " + swim.allDetect + " vòng, không cần điều phối viên. Bấm lại node đã sập để hồi sinh: nó bác bỏ bằng incarnation cao hơn."); }
      }
    }

    function setMode(m) {
      mode = m;
      card.setAttribute("data-g-mode-now", m);
      card.querySelectorAll("[data-g-mode]").forEach(function (b) {
        var on = b.getAttribute("data-g-mode") === m;
        b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      card.querySelectorAll("[data-g-only]").forEach(function (el) { el.hidden = el.getAttribute("data-g-only") !== m; });
      legend(); reset();
    }
    card.querySelectorAll("[data-g-mode]").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-g-mode")); });
    });
    $("[data-g-reset]", card).addEventListener("click", reset);

    function bind(el, valSel, fmt) {
      var out = $(valSel, card);
      function upd() { out.textContent = fmt(+el.value); }
      el.addEventListener("input", function () { upd(); hint(); });
      upd();
    }
    bind(fanEl, "[data-g-fan-val]", String);
    bind(styleEl, "[data-g-style-val]", function (v) { return STYLES[v]; });
    bind(kEl, "[data-g-k-val]", String);
    bind(lossEl, "[data-g-loss-val]", function (v) { return v + "%"; });

    loop(card, function (dt) {
      var s = +speedEl.value;
      acc += dt * s;
      if (acc >= ROUND) {
        acc -= ROUND;
        var running = mode === "swim" || nodes.some(function (n) { return n.knows; });
        if (running) step();
      }
      drawDots(dt * s);
    });

    new MutationObserver(function () { legend(); stats(); hint(); }).observe(root, { attributes: true, attributeFilter: ["data-lang"] });

    function setup(m, fan, style, k, loss) {
      setMode(m); setRange(fanEl, fan); setRange(styleEl, style); setRange(kEl, k); setRange(lossEl, loss);
    }
    EXP.gossip["spread"] = function () { setup("rumor", 1, 0, 2, 0); clickNode(0); };
    EXP.gossip["fanout"] = function () { setup("rumor", 3, 0, 2, 0); clickNode(0); };
    EXP.gossip["lossy"] = function () { setup("rumor", 2, 2, 2, 40); clickNode(0); };
    EXP.gossip["crash-one"] = function () { setup("swim", 1, 0, 2, 0); clickNode(5); };
    EXP.gossip["false-alarm"] = function () { setup("swim", 1, 0, 0, 15); };
    EXP.gossip["indirect"] = function () { setup("swim", 1, 0, 3, 15); };

    setMode("rumor");
  })();

  /* ----------------------------------------------------------------------
     5. CRDTs — PN-counter and OR-set next to naive last-write-wins copies
  ---------------------------------------------------------------------- */
  (function crdt() {
    var card = $('[data-lab="crdt"]');
    if (!card) return;
    var repsEl = $("[data-c-reps]", card), readEl = $("[data-c-readout]", card);
    var verdictEl = $("[data-c-verdict]", card), explainEl = $("[data-c-explain]", card);
    var ITEMS = [["milk", "🥛"], ["bread", "🍞"], ["eggs", "🥚"], ["apple", "🍎"]];
    var type = "counter", reps, clock, ops, timers = [], flash = [];

    function keys(o) { return Object.keys(o); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    function reset() {
      clearTimers();
      clock = 0; ops = { up: 0, down: 0 };
      reps = [0, 1, 2].map(function (i) {
        return { id: i, name: "ABC".charAt(i), online: true, seq: 0,
                 p: [0, 0, 0], n: [0, 0, 0], lww: { v: 0, ts: 0 },          // counter: PN-counter and naive LWW number
                 adds: {}, tomb: {}, cart: { items: {}, ts: 0 } };           // cart: OR-set and naive LWW register of the whole cart
      });
      flash = [false, false, false];
      readEl.textContent = ""; readEl.className = "q-readout";
      render();
    }

    /* ---- operations ---- */
    function inc(i, d) {
      var r = reps[i];
      if (d > 0) { r.p[i]++; ops.up++; } else { r.n[i]++; ops.down++; }
      r.lww.v += d; r.lww.ts = ++clock;
    }
    function has(r, item) {
      var t = r.adds[item];
      return !!t && keys(t).some(function (tag) { return !r.tomb[tag]; });
    }
    function toggle(i, item) {
      var r = reps[i];
      if (has(r, item)) {
        keys(r.adds[item]).forEach(function (tag) { r.tomb[tag] = true; });      // remove only the tags this replica has seen
        r.cart.items[item] = false;
      } else {
        (r.adds[item] = r.adds[item] || {})[r.name + (++r.seq)] = true;          // add = a fresh unique tag
        r.cart.items[item] = true;
      }
      r.cart.ts = ++clock;
    }

    /* ---- state-based merge of b into a ---- */
    function mergeInto(a, b) {
      for (var i = 0; i < 3; i++) { a.p[i] = Math.max(a.p[i], b.p[i]); a.n[i] = Math.max(a.n[i], b.n[i]); }
      if (b.lww.ts > a.lww.ts || (b.lww.ts === a.lww.ts && b.id > a.id)) a.lww = { v: b.lww.v, ts: b.lww.ts };
      keys(b.adds).forEach(function (item) {
        a.adds[item] = a.adds[item] || {};
        keys(b.adds[item]).forEach(function (tag) { a.adds[item][tag] = true; });
      });
      keys(b.tomb).forEach(function (tag) { a.tomb[tag] = true; });
      if (b.cart.ts > a.cart.ts || (b.cart.ts === a.cart.ts && b.id > a.id)) a.cart = { items: JSON.parse(JSON.stringify(b.cart.items)), ts: b.cart.ts };
    }
    function snap(r) { return JSON.stringify([r.p, r.n, r.lww, r.adds, r.tomb, r.cart]); }

    function sync() {
      var online = reps.filter(function (r) { return r.online; }), before = online.map(snap);
      online.forEach(function (a) { online.forEach(function (b) { if (a !== b) mergeInto(a, b); }); });
      online.forEach(function (a) { online.forEach(function (b) { if (a !== b) mergeInto(a, b); }); });   // second pass: everyone has everything
      var changed = false;
      online.forEach(function (r, k) { if (snap(r) !== before[k]) { flash[r.id] = true; changed = true; } });
      if (changed) {
        render();
        timers.push(setTimeout(function () { flash = [false, false, false]; render(); }, 450));
      }
    }

    /* ---- reading values ---- */
    function pnValue(r) { return r.p[0] + r.p[1] + r.p[2] - r.n[0] - r.n[1] - r.n[2]; }
    function crdtCart(r) { return ITEMS.filter(function (it) { return has(r, it[0]); }); }
    function naiveCart(r) { return ITEMS.filter(function (it) { return r.cart.items[it[0]]; }); }
    function emoji(list) { return list.length ? list.map(function (it) { return it[1]; }).join(" ") : "—"; }

    /* ---- rendering ---- */
    function el(tag, cls, text, parent) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }

    function render() {
      repsEl.textContent = "";
      reps.forEach(function (r) {
        var box = el("div", "c-rep" + (r.online ? "" : " is-off") + (flash[r.id] ? " is-sync" : ""), undefined, repsEl);
        var head = el("div", "c-head", undefined, box);
        el("b", "", tr("Replica ", "Replica ") + r.name, head);
        var sw = el("button", "lab-btn lab-btn-sm", r.online ? tr("● online", "● online") : tr("○ offline", "○ offline"), head);
        sw.type = "button"; sw.setAttribute("aria-pressed", r.online ? "false" : "true"); sw.classList.toggle("is-on", !r.online);
        sw.addEventListener("click", function () { r.online = !r.online; if (r.online) sync(); render(); explain(); });
        if (type === "counter") {
          el("div", "c-label", "CRDT (PN-counter)", box);
          el("div", "c-big", String(pnValue(r)), box);
          el("div", "c-sub", "P=[" + r.p.join(",") + "]  N=[" + r.n.join(",") + "]", box);
          el("div", "c-label", tr("naïve last-write-wins", "last-write-wins ngây thơ"), box);
          el("div", "c-big c-naive", String(r.lww.v), box);
          var row = el("div", "c-btns", undefined, box);
          var up = el("button", "lab-btn lab-btn-sm", "+1", row); up.type = "button";
          var dn = el("button", "lab-btn lab-btn-sm lab-btn-ghost", "−1", row); dn.type = "button";
          up.addEventListener("click", function () { inc(r.id, 1); render(); explain(); });
          dn.addEventListener("click", function () { inc(r.id, -1); render(); explain(); });
        } else {
          el("div", "c-label", "CRDT (OR-set)", box);
          var chips = el("div", "c-chips", undefined, box);
          ITEMS.forEach(function (it) {
            var b = el("button", "c-chip" + (has(r, it[0]) ? " is-in" : ""), it[1] + " " + it[0], chips);
            b.type = "button"; b.setAttribute("aria-pressed", has(r, it[0]) ? "true" : "false");
            b.addEventListener("click", function () { toggle(r.id, it[0]); render(); explain(); });
          });
          el("div", "c-label", tr("naïve: whole cart is one LWW value", "ngây thơ: cả giỏ là một giá trị LWW"), box);
          el("div", "c-big c-naive c-cartline", emoji(naiveCart(r)), box);
        }
      });
      explain();
    }

    function explain() {
      var online = reps.filter(function (r) { return r.online; });
      var converged = reps.every(function (r) { return snap(r) === snap(reps[0]); });
      verdictEl.textContent = "";
      function line(label, value, cls) {
        var d = el("div", "lab-stat-row", undefined, verdictEl);
        el("span", "", label, d);
        el("b", cls || "", value, d);
      }
      line(tr("Replicas online", "Replica đang online"), online.length + " / 3");
      line(tr("All replicas identical?", "Các replica giống hệt nhau?"), converged ? "✔" : tr("not yet", "chưa"), converged ? "c-ok" : "c-bad");
      if (type === "counter") {
        var truth = ops.up - ops.down;
        line(tr("Clicks made (+" + ops.up + " −" + ops.down + ")", "Số lần bấm (+" + ops.up + " −" + ops.down + ")"), String(truth));
        if (converged) {
          var cv = pnValue(reps[0]), nv = reps[0].lww.v;
          line("CRDT", String(cv), cv === truth ? "c-ok" : "c-bad");
          line(tr("Naïve LWW", "LWW ngây thơ"), String(nv) + (nv === truth ? "" : tr("  (lost " + Math.abs(truth - nv) + ")", "  (mất " + Math.abs(truth - nv) + ")")), nv === truth ? "c-ok" : "c-bad");
        }
        explainEl.textContent = tr("PN-counter: each replica only ever bumps its own slot (P for +, N for −). Merge is element-wise max, value is ΣP − ΣN. Merging is commutative, associative and idempotent, so order, duplicates and delays don't matter. The naïve copy ships a single number and keeps the one with the latest timestamp, so concurrent +1s overwrite each other.",
                                   "PN-counter: mỗi replica chỉ tăng ô của chính nó (P cho +, N cho −). Gộp = lấy max từng phần tử, giá trị là ΣP − ΣN. Phép gộp có tính giao hoán, kết hợp và lũy đẳng nên thứ tự, bản trùng và độ trễ đều không ảnh hưởng. Bản ngây thơ chỉ gửi một con số và giữ bản có timestamp mới nhất, nên các +1 đồng thời đè lên nhau.");
      } else {
        if (converged) {
          line("CRDT", emoji(crdtCart(reps[0])));
          line(tr("Naïve LWW", "LWW ngây thơ"), emoji(naiveCart(reps[0])));
        }
        explainEl.textContent = tr("OR-set (observed-remove): every add creates a unique tag and a remove only deletes the tags that replica has seen. So an add that happens concurrently with a remove survives (add-wins). The naïve cart treats the whole set as one last-write-wins value, so a concurrent edit on another replica silently disappears.",
                                   "OR-set (observed-remove): mỗi lần thêm tạo một tag duy nhất và lần xóa chỉ xóa các tag mà replica đó đã thấy. Vì vậy một lần thêm diễn ra đồng thời với lần xóa vẫn sống sót (add-wins). Giỏ ngây thơ coi cả tập là một giá trị last-write-wins, nên chỉnh sửa đồng thời ở replica khác lặng lẽ biến mất.");
      }
    }

    function setType(t) {
      type = t;
      card.querySelectorAll("[data-c-type]").forEach(function (b) {
        var on = b.getAttribute("data-c-type") === t;
        b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      reset();
    }
    card.querySelectorAll("[data-c-type]").forEach(function (b) {
      b.addEventListener("click", function () { setType(b.getAttribute("data-c-type")); });
    });
    $("[data-c-sync]", card).addEventListener("click", sync);
    $("[data-c-reset]", card).addEventListener("click", reset);
    timers = [];
    setInterval(function () { if (!document.hidden) sync(); }, 1200);
    new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ["data-lang"] });

    function say(en, vi, cls) { readEl.className = "q-readout" + (cls ? " " + cls : ""); readEl.textContent = tr(en, vi); }

    EXP.crdt["offline-storm"] = function () {
      setType("counter");
      reps.forEach(function (r) { r.online = false; });
      for (var k = 0; k < 5; k++) reps.forEach(function (r) { inc(r.id, 1); });
      render();
      say("All three replicas are partitioned and each took 5 clicks: 15 in total. Reconnecting in 2 s…", "Cả ba replica bị chia cắt và mỗi cái nhận 5 lần bấm: tổng 15. Sẽ nối lại sau 2 giây…");
      timers.push(setTimeout(function () {
        reps.forEach(function (r) { r.online = true; });
        sync(); render();
        say("Reconnected. The CRDT counts all 15. The naïve copy kept only one replica's number.", "Đã nối lại. CRDT đếm đủ 15. Bản ngây thơ chỉ giữ số của một replica.", "is-ok");
      }, 2000));
    };
    EXP.crdt["cart-conflict"] = function () {
      setType("cart");
      toggle(0, "milk"); toggle(0, "bread"); sync();                       // everyone starts with 🥛 🍞
      reps.forEach(function (r) { r.online = false; });
      toggle(2, "eggs");                                                    // C adds eggs
      toggle(1, "milk"); toggle(1, "milk");                                 // B removes milk, then changes its mind and re-adds it
      toggle(0, "milk"); toggle(0, "bread");                                // A (the latest clock) removes milk and bread
      render();
      say("Offline edits: C added eggs; B re-added milk; A (last to write) removed milk and bread. Reconnecting in 2 s…", "Sửa offline: C thêm trứng; B thêm lại sữa; A (ghi sau cùng) xóa sữa và bánh mì. Sẽ nối lại sau 2 giây…");
      timers.push(setTimeout(function () {
        reps.forEach(function (r) { r.online = true; });
        sync(); render();
        say("Merged. The OR-set keeps eggs and milk: nobody had seen B's new milk, so A's remove couldn't touch it. The naïve cart took A's whole cart and lost both.", "Đã gộp. OR-set giữ trứng và sữa: không ai thấy lần thêm sữa mới của B nên lần xóa của A không đụng tới được. Giỏ ngây thơ lấy cả giỏ của A và mất cả hai.", "is-ok");
      }, 2000));
    };

    reset();
  })();

  /* ----------------------------------------------------------------------
     6. TAB CLUSTER — every open tab of this page is a real node
        (BroadcastChannel transport, a small Raft-style election, a leader-replicated counter,
         plus the Web Locks API as a "lock service" comparison)
  ---------------------------------------------------------------------- */
  (function tabCluster() {
    var card = $('[data-lab="tabs"]');
    if (!card) return;
    var S = $("[data-t-svg]", card), infoEl = $("[data-t-info]", card), logEl = $("[data-t-log]", card);
    var btnOpen = $("[data-t-open]", card), btnInc = $("[data-t-inc]", card), btnCrash = $("[data-t-crash]", card);

    if (!("BroadcastChannel" in window)) {
      infoEl.textContent = tr("This browser has no BroadcastChannel, so tabs can't talk to each other.", "Trình duyệt này không có BroadcastChannel nên các tab không nói chuyện với nhau được.");
      [btnOpen, btnInc, btnCrash].forEach(function (b) { b.disabled = true; });
      return;
    }

    var ME = Math.random().toString(36).slice(2, 5).toUpperCase();
    var ch = new BroadcastChannel("vi-lab-tab-cluster");
    var HB = 700, TTL = 3600, T_MIN = 2800, T_MAX = 5000;
    var baseTitle = document.title.replace(/^[♛✕]\s*/, "");
    var CX = 260, CY = 185, R = 125;

    var me = { role: "follower", term: 0, votedFor: null, leader: null, votes: {}, crashed: false, deadline: 0, lastHb: 0, lock: false };
    var peers = {};                          // id -> {seen, role, term, lock}
    var st = { commit: 0, val: 0 };          // committed state of the replicated counter
    var last = { idx: 0, val: 0 };           // leader's last proposed entry
    var pending = {};                        // idx -> {val, acks}
    var pulses = [], nodeEls = {}, lines = [];
    var releaseLock = null;

    function now() { return Date.now(); }
    function log(text, cls) {
      var li = document.createElement("li");
      if (cls) li.className = cls;
      li.textContent = "[" + ME + "] " + text;
      logEl.insertBefore(li, logEl.firstChild);
      while (logEl.children.length > 7) logEl.removeChild(logEl.lastChild);
    }
    function members() { return [ME].concat(Object.keys(peers)).sort(); }
    function majority() { return Math.floor(members().length / 2) + 1; }
    function resetDeadline() { me.deadline = now() + T_MIN + Math.random() * (T_MAX - T_MIN); }
    function post(m) {
      if (me.crashed) return;
      m.from = ME; m.term = me.term; m.role = me.role; m.lk = me.lock;
      ch.postMessage(m);
    }

    /* ---- Web Locks: the browser's own lock service (instant failover, no timeouts) ---- */
    function acquireLock() {
      if (!navigator.locks) return;
      navigator.locks.request("vi-lab-leader", function () {
        me.lock = true;
        Object.keys(peers).forEach(function (id) { peers[id].lock = false; });
        post({ t: "pres" });
        log(tr("Got the Web Lock.", "Đã lấy được Web Lock."), "ok");
        render();
        return new Promise(function (resolve) { releaseLock = resolve; });
      }).catch(function () {});
    }

    /* ---- Raft-style election ---- */
    function stepDown(term) {
      if (term > me.term) { me.term = term; me.votedFor = null; }
      if (me.role !== "follower") log(tr("Stepping down to follower (term " + me.term + ").", "Hạ xuống follower (term " + me.term + ")."), "warn");
      me.role = "follower";
    }
    function startElection() {
      me.role = "candidate"; me.term++; me.votedFor = ME; me.votes = {}; me.votes[ME] = true; me.leader = null;
      resetDeadline();
      log(tr("Election timeout → candidate for term " + me.term + ".", "Hết giờ bầu cử → ứng cử term " + me.term + "."), "warn");
      post({ t: "rv" });
      checkWin();
    }
    function checkWin() {
      if (me.role === "candidate" && Object.keys(me.votes).length >= majority()) {
        me.role = "leader"; me.leader = ME; me.lastHb = 0;
        last.idx = st.commit; last.val = st.val; pending = {};   // uncommitted entries of the old leader are dropped
        log(tr("Won term " + me.term + " with " + Object.keys(me.votes).length + "/" + members().length + " votes. I am the leader ♛", "Thắng term " + me.term + " với " + Object.keys(me.votes).length + "/" + members().length + " phiếu. Tôi là leader ♛"), "ok");
        sendHb();
      }
    }
    function sendHb() { me.lastHb = now(); post({ t: "hb", commit: st.commit, val: st.val }); members().forEach(function (id) { if (id !== ME) pulse(ME, id); }); }

    function propose() {          // leader only
      last.idx++; last.val++;
      pending[last.idx] = { val: last.val, acks: 1 };
      post({ t: "ae", idx: last.idx, val: last.val });
      maybeCommit(last.idx);
    }
    function maybeCommit(idx) {
      var p = pending[idx];
      if (p && p.acks >= majority() && idx > st.commit) {
        st.commit = idx; st.val = p.val; delete pending[idx];
        log(tr("Entry " + idx + " committed (value " + p.val + "): " + p.acks + "/" + members().length + " stored it.", "Entry " + idx + " đã commit (giá trị " + p.val + "): " + p.acks + "/" + members().length + " đã lưu."), "ok");
        sendHb();
      }
    }

    /* ---- incoming messages ---- */
    ch.onmessage = function (e) {
      var m = e.data;
      if (!m || m.from === ME || me.crashed) return;
      if (m.to && m.to !== ME) return;
      var isNew = !peers[m.from];
      peers[m.from] = { seen: now(), role: m.role, term: m.term, lock: !!m.lk };
      if (m.lk) Object.keys(peers).forEach(function (id) { if (id !== m.from) peers[id].lock = false; });   // only one holder exists
      if (isNew) { log(tr("Tab " + m.from + " joined the cluster.", "Tab " + m.from + " tham gia cụm."), "ok"); post({ t: "pres" }); }
      if (m.term > me.term) { stepDown(m.term); }
      switch (m.t) {
        case "rv":
          if (m.term === me.term && me.role === "follower" && (me.votedFor === null || me.votedFor === m.from)) {
            me.votedFor = m.from; resetDeadline();
            post({ t: "vote", to: m.from });
            log(tr("Voted for " + m.from + " in term " + m.term + ".", "Bỏ phiếu cho " + m.from + " ở term " + m.term + "."));
          }
          break;
        case "vote":
          if (me.role === "candidate" && m.term === me.term) { me.votes[m.from] = true; checkWin(); }
          break;
        case "hb":
          if (m.term >= me.term) {
            if (me.role !== "follower") stepDown(m.term);
            if (me.leader !== m.from) log(tr("Following leader " + m.from + " (term " + m.term + ").", "Theo leader " + m.from + " (term " + m.term + ")."), "ok");
            me.leader = m.from; resetDeadline(); pulse(m.from, ME);
            if (m.commit > st.commit) { st.commit = m.commit; st.val = m.val; }
          }
          break;
        case "ae":
          if (m.term >= me.term && me.leader === m.from) { post({ t: "ack", to: m.from, idx: m.idx }); }
          break;
        case "ack":
          if (me.role === "leader" && pending[m.idx]) { pending[m.idx].acks++; maybeCommit(m.idx); }
          break;
        case "inc":
          if (me.role === "leader") { log(tr("Increment forwarded by " + m.from + ".", "Lệnh tăng được " + m.from + " chuyển tới.")); propose(); }
          break;
        case "pres": break;
      }
      render();
    };

    /* ---- the clock ---- */
    function tick() {
      var t = now();
      Object.keys(peers).forEach(function (id) {
        if (t - peers[id].seen > TTL) {
          log(tr("Tab " + id + " went silent, treating it as gone.", "Tab " + id + " im lặng, coi như đã đi."), "bad");
          if (me.leader === id) me.leader = null;
          delete peers[id];
        }
      });
      if (!me.crashed) {
        if (me.role === "leader") { if (t - me.lastHb >= HB) sendHb(); }
        else {
          if (t - (me.beacon || 0) >= HB) { me.beacon = t; post({ t: "pres" }); }
          if (t >= me.deadline) startElection();
        }
      }
      render();
    }

    /* ---- UI ---- */
    function pulse(a, b) { pulses.push({ a: a, b: b, t: 0 }); }
    function pos(id) {
      var list = members(), i = list.indexOf(id), n = list.length;
      if (i < 0) return null;
      var ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: CX + (n === 1 ? 0 : R * Math.cos(ang)), y: CY + (n === 1 ? 0 : R * Math.sin(ang)) };
    }
    var pulseG = null, nodeG = null, edgeG = null;
    function render() {
      var list = members();
      if (!pulseG) { edgeG = svg("g", {}, S); pulseG = svg("g", {}, S); nodeG = svg("g", {}, S); }
      // edges
      edgeG.textContent = "";
      list.forEach(function (a, i) { list.slice(i + 1).forEach(function (b) {
        var A = pos(a), B = pos(b);
        svg("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, "class": "r-edge" }, edgeG);
      }); });
      nodeG.textContent = "";
      list.forEach(function (id) {
        var p = pos(id), mine = id === ME;
        var role = mine ? (me.crashed ? "dead" : me.role) : peers[id].role;
        var g = svg("g", { "class": "t-node t-" + role + (mine ? " is-me" : "") }, nodeG);
        if (mine) svg("circle", { cx: p.x, cy: p.y, r: 40, "class": "t-you" }, g);
        svg("circle", { cx: p.x, cy: p.y, r: 30, "class": "t-body" }, g);
        var t1 = svg("text", { x: p.x, y: p.y + 1, "class": "r-id" }, g); t1.textContent = id;
        var t2 = svg("text", { x: p.x, y: p.y + 15, "class": "r-term" }, g);
        t2.textContent = (mine ? tr("you · ", "bạn · ") : "") + "t" + (mine ? me.term : peers[id].term);
        if (role === "leader") { var c = svg("text", { x: p.x, y: p.y - 38, "class": "r-crown", style: "opacity:1" }, g); c.textContent = "♛"; }
        if (!mine && peers[id].lock) { var lk = svg("text", { x: p.x + 24, y: p.y + 30, "class": "t-lock" }, g); lk.textContent = "🔒"; }
        if (mine && me.lock) { var lk2 = svg("text", { x: p.x + 24, y: p.y + 30, "class": "t-lock" }, g); lk2.textContent = "🔒"; }
      });
      // title
      var want = me.crashed ? "✕ " + baseTitle : me.role === "leader" ? "♛ " + baseTitle : baseTitle;
      if (document.title !== want) document.title = want;
      // buttons
      btnCrash.setAttribute("aria-pressed", me.crashed ? "true" : "false");
      btnCrash.classList.toggle("is-on", me.crashed);
      // info
      var lockHolder = me.lock ? ME : (Object.keys(peers).filter(function (id) { return peers[id].lock; })[0] || "—");
      var rows = [
        [tr("This tab", "Tab này"), ME],
        [tr("Role", "Vai trò"), me.crashed ? tr("crashed", "đã sập") : me.role],
        [tr("Term", "Term"), String(me.term)],
        [tr("Leader", "Leader"), me.role === "leader" ? ME + tr(" (me)", " (tôi)") : (me.leader || "—")],
        [tr("Tabs in cluster", "Số tab trong cụm"), list.length + tr("  (majority " + majority() + ")", "  (đa số " + majority() + ")")],
        [tr("Committed counter", "Bộ đếm đã commit"), st.val + "  (entry " + st.commit + ")"],
        [tr("Web Lock holder", "Người giữ Web Lock"), String(lockHolder)]
      ];
      infoEl.textContent = "";
      var dl = document.createElement("dl"); dl.className = "lab-kv";
      rows.forEach(function (r) {
        var dt = document.createElement("dt"); dt.textContent = r[0];
        var dd = document.createElement("dd"); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      infoEl.appendChild(dl);
      var h = document.createElement("p"); h.className = "lab-hint";
      h.textContent = tr("Raft elects by votes and needs a timeout to notice a dead leader; the Web Lock moves the instant the holder's tab closes, because the browser itself is the lock service.",
                         "Raft bầu bằng phiếu và cần hết giờ mới nhận ra leader chết; Web Lock chuyển ngay khi tab giữ nó đóng lại, vì chính trình duyệt là dịch vụ khóa.");
      infoEl.appendChild(h);
    }

    loop(card, function (dt) {
      if (!pulseG) return;
      pulseG.textContent = "";
      for (var i = pulses.length - 1; i >= 0; i--) {
        var p = pulses[i]; p.t += dt;
        var A = pos(p.a), B = pos(p.b);
        if (p.t > 600 || !A || !B) { pulses.splice(i, 1); continue; }
        var f = p.t / 600;
        svg("circle", { cx: A.x + (B.x - A.x) * f, cy: A.y + (B.y - A.y) * f, r: 4, "class": "r-msg r-msg-hb", opacity: 1 - f * 0.5 }, pulseG);
      }
    });

    /* ---- controls ---- */
    function openTab() {
      var w = window.open(location.href.split("#")[0] + "#tabs", "_blank");
      if (!w) log(tr("The browser blocked the popup. Open this page in another tab yourself.", "Trình duyệt chặn cửa sổ bật lên. Hãy tự mở trang này ở tab khác."), "bad");
    }
    function requestInc() {
      if (me.crashed) { log(tr("This tab is crashed.", "Tab này đang sập."), "bad"); return; }
      if (me.role === "leader") { propose(); }
      else if (me.leader) { post({ t: "inc", to: me.leader }); log(tr("Forwarded +1 to leader " + me.leader + ".", "Đã chuyển +1 cho leader " + me.leader + ".")); }
      else log(tr("No leader yet: writes must wait for an election.", "Chưa có leader: ghi phải chờ bầu cử."), "bad");
    }
    function setCrashed(c) {
      if (me.crashed === c) return;
      me.crashed = c;
      if (c) {
        me.role = "follower"; me.leader = null; me.lock = false;
        if (releaseLock) { releaseLock(); releaseLock = null; }
        log(tr("Crashed (simulated): no heartbeats, no votes, lock released.", "Sập (mô phỏng): không heartbeat, không bỏ phiếu, đã nhả khóa."), "bad");
      } else {
        resetDeadline(); me.beacon = 0;
        log(tr("Recovered. Waiting to hear from the cluster.", "Đã hồi phục. Đang chờ nghe từ cụm."), "ok");
        post({ t: "pres" }); acquireLock();
      }
      render();
    }
    btnOpen.addEventListener("click", openTab);
    btnInc.addEventListener("click", requestInc);
    btnCrash.addEventListener("click", function () { setCrashed(!me.crashed); });

    EXP.tabs["open-two"] = function () { openTab(); setTimeout(openTab, 150); };
    EXP.tabs["crash-me"] = function () { setCrashed(!me.crashed); };
    EXP.tabs["burst"] = function () { for (var i = 0; i < 5; i++) requestInc(); };

    window.addEventListener("pagehide", function () { document.title = baseTitle; });
    new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ["data-lang"] });

    resetDeadline(); me.deadline = now() + 1500 + Math.random() * 1000;   // first election a little sooner on a fresh tab
    post({ t: "pres" });
    acquireLock();
    log(tr("Tab started. Listening for the cluster…", "Tab khởi động. Đang lắng nghe cụm…"));
    setInterval(tick, 150);
    render();
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

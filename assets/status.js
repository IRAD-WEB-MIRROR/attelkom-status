/* StatusBoard 1.4.2 (WebStudio Talas) - Attelkom service status */
(function () {
  "use strict";
  var H6 = 6 * 36e5, DAY = 864e5;
  var root = document.body.getAttribute("data-root") || "";
  var el = document.getElementById("statusdata");
  var D = el ? JSON.parse(el.textContent) : null;
  var RANK = { ok: 0, maint: 1, minor: 2, partial: 3, major: 4 };
  var LBL = { ok: "Operational", maint: "Under maintenance", minor: "Degraded performance", partial: "Partial outage", major: "Major outage" };
  var power = [], today = null, incs = [];

  function d2(n) { return (n < 10 ? "0" : "") + n; }
  function irt(t) { return new Date((t || Date.now()) + H6); }           // read with getUTC*
  function ep(s) {                                                        // "YYYY-MM-DD HH:MM" Irad Time -> epoch
    var m = /^(\d+)-(\d+)-(\d+)(?: (\d+):(\d+))?/.exec(s);
    return Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - H6;
  }
  function ymd(t) { var d = irt(t); return d.getUTCFullYear() + "-" + d2(d.getUTCMonth() + 1) + "-" + d2(d.getUTCDate()); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // clock
  function tick() {
    var c = document.getElementById("clk"); if (!c) return;
    var d = irt();
    c.textContent = d2(d.getUTCDate()) + "." + d2(d.getUTCMonth() + 1) + "." + d.getUTCFullYear() + " " + d2(d.getUTCHours()) + ":" + d2(d.getUTCMinutes());
  }

  // subscribe box
  var sb = document.getElementById("subbtn");
  if (sb) sb.addEventListener("click", function () { var b = document.getElementById("subbox"); b.hidden = !b.hidden; });

  if (!D) { tick(); setInterval(tick, 30000); return; }

  // ---------- 90-day bars ----------
  function drawBars() {
    var now = Date.now(), t0 = ep(ymd(now)) - 89 * DAY, t1 = ep(ymd(now)) + DAY;
    var marks = {}, mins = {};
    D.inc.forEach(function (i) {
      var a = ep(i.a), b = i.b ? ep(i.b) : t1;
      if (b < t0 || a > t1) return;
      var a2 = Math.max(a, t0), b2 = Math.min(b, t1);
      for (var t = ep(ymd(a2)); t < b2; t += DAY) {
        var k = Math.round((t - t0) / DAY);
        i.c.forEach(function (c) { var m = marks[c] = marks[c] || {}; if (!m[k] || RANK[i.k] > RANK[m[k]]) m[k] = i.k; });
      }
      if (i.k !== "maint") i.c.forEach(function (c) { mins[c] = (mins[c] || 0) + ({ major: 1, partial: .5, minor: .1 }[i.k]) * (b2 - a2) / 6e4; });
    });
    var bars = document.querySelectorAll(".bars[data-c]");
    for (var n = 0; n < bars.length; n++) {
      var c = bars[n].getAttribute("data-c"), h = "";
      for (var k = 0; k < 90; k++) {
        var kind = (marks[c] && marks[c][k]) || "ok", d = irt(t0 + k * DAY);
        h += '<i class="' + kind + '" title="' + d2(d.getUTCDate()) + "." + d2(d.getUTCMonth() + 1) + "." + d.getUTCFullYear() + ": " + (kind === "ok" ? "No incidents" : kind === "maint" ? "Planned maintenance" : LBL[kind]) + '"></i>';
      }
      bars[n].innerHTML = h;
      var up = bars[n].nextElementSibling && bars[n].nextElementSibling.querySelector(".up");
      if (up) up.textContent = (100 - 100 * (mins[c] || 0) / (90 * 1440)).toFixed(2) + " % uptime";
    }
  }

  // ---------- current status ----------
  var roads = null;
  function evaluate() {
    var now = Date.now(), d = irt(now), wd = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes(), day = d.getUTCDate();
    var st = {}, cards = [];
    function set(c, k, note) {
      var s = st[c] = st[c] || { k: "ok", n: [] };
      if (RANK[k] > RANK[s.k]) s.k = k;
      if (note && s.n.indexOf(note) < 0) s.n.push(note);
    }
    function card(kind, title, meta, text) { cards.push('<article class="inc ' + kind + ' dyn"><h3>' + esc(title) + '</h3><p class="meta">' + esc(meta) + "</p><p>" + esc(text) + "</p></article>"); }

    D.inc.forEach(function (i) {
      var a = ep(i.a), b = i.b ? ep(i.b) : Infinity;
      if (a <= now && now < b) i.c.forEach(function (c) { set(c, i.k); });
    });
    D.planned.forEach(function (p) {
      if (ep(p.a) <= now && now < ep(p.b)) {
        p.c.forEach(function (c) { set(c, "maint"); });
        card("maint", p.t, "Planned maintenance · in progress until " + p.b.slice(11), p.x);
      }
    });
    // regular gateway window: Tue + Thu 02:00-04:30
    if ((wd === 2 || wd === 4) && m >= 120 && m < 270) {
      set("intl", "maint", "Regular maintenance window until 04:30");
      card("maint", "Regular maintenance window of the international gateway", "Planned maintenance · 02:00 – 04:30", "Access to some foreign resources may be slower until the end of the window.");
    }
    // Izdöö weekly index, Monday 02:41
    if (wd === 1 && m >= 161 && m < 250) set("search", "minor", "Weekly indexing: results may be incomplete until about 04:10.");
    // Talasbank night works, Sunday 01:00-05:00
    if (wd === 0 && m >= 60 && m < 300) set("pay", "partial", "CASH and transfers to cards are not available during planned works of Talasbank (until 05:00). Payments for Attelkom services work.");
    // pension day
    if (day === 10 && m >= 480 && m < 720) set("pay", "minor", "High load: payments are processed with delays. Repeated SMS are not necessary.");
    // electricity supplier
    var td = ymd(now);
    power.forEach(function (r) {
      if (r.date !== td) return;
      var a = ep(r.date + " " + r.from), b = ep(r.date + " " + r.to), c = D.net[r.net];
      if (!c || now < a || now >= b) return;
      var note = "Power works of the electricity supplier, " + r.area + " (" + r.from + "–" + r.to + "): equipment on reserve power.";
      set(c, (b - a) >= 5 * 36e5 ? "minor" : "ok", note);
    });
    // today's incidents (the shared list in today's numbers): storm damage, a closed pass; the same times as Iradenergo
    var passInc = false;
    incs.forEach(function (x) {
      (x.telecom || []).forEach(function (r) {
        var a = ep(r.from), b = r.to ? ep(r.to) : Infinity;
        if (now < a) return;
        if (x.kind === "pass" && now < b) passInc = true;
        if (now < b) {
          r.comps.forEach(function (c) { set(c, r.impact, r.title + "."); });
          card(r.impact, r.title, LBL[r.impact] + " · since " + r.from.slice(8, 10) + "." + r.from.slice(5, 7) + " " + r.from.slice(11) + (r.to ? " · expected restoration " + r.to.slice(11) : ""), r.text);
        } else if (now - b < 12 * 36e5) {
          card("notice", r.title, "Resolved · " + r.from.slice(11) + " – " + r.to.slice(11), "Service has been restored. We apologise for the inconvenience.");
        }
      });
    });
    // mountain roads (today's numbers)
    if (roads && !passInc) roads.forEach(function (r) {
      if ((r.id === "alabel" || r.id === "otmek") && r.status === "closed")
        set("r-toktogul", "minor", "Road to relay towers closed (" + (r.name && r.name.en || r.id) + "): restoration after faults may take longer.");
    });

    // paint
    var worst = "ok", comps = document.querySelectorAll(".comp");
    for (var n = 0; n < comps.length; n++) {
      var c = comps[n].id.slice(2), s = st[c] || { k: "ok", n: [] };
      var p = comps[n].querySelector(".pill");
      p.className = "pill " + s.k; p.textContent = LBL[s.k];
      comps[n].querySelector(".note").innerHTML = s.n.map(esc).join("<br>");
      if (RANK[s.k] > RANK[worst]) worst = s.k;
    }
    var bn = document.getElementById("banner"), bt = document.getElementById("bannertxt");
    if (bn) {
      bn.className = "banner " + worst;
      bt.textContent = { ok: "All systems are operating in normal mode", maint: "Planned works are in progress", minor: "Some services are working with limitations", partial: "Some services are not available", major: "Serious interruption of services" }[worst];
    }
    var act = document.getElementById("active");
    if (act) {
      var old = act.querySelectorAll(".dyn"); for (var q = 0; q < old.length; q++) act.removeChild(old[q]);
      act.insertAdjacentHTML("afterbegin", cards.join(""));
    }
    // planned list: drop finished
    var pl = document.querySelectorAll(".pl[data-to]");
    for (var j = 0; j < pl.length; j++) if (ep(pl[j].getAttribute("data-to")) < now) pl[j].style.display = "none";
    tick();
  }

  function drawPower() {
    var ul = document.getElementById("powerlist"); if (!ul || !power.length) return;
    var t = Date.now(), from = ymd(t), to = ymd(t + DAY), h = "";
    power.forEach(function (r) {
      if (r.date < from || r.date > to) return;
      if (r.date === from && ep(r.date + " " + r.to) < t) return;
      h += "<li><b>" + r.date.slice(8) + "." + r.date.slice(5, 7) + "</b> " + r.from + "–" + r.to + " &nbsp;" + esc(D.names[D.net[r.net]]) + ": " + esc(r.area) + "</li>";
    });
    ul.innerHTML = h || "<li>No planned power cuts are announced for the next days.</li>";
  }

  drawBars(); evaluate();
  setInterval(evaluate, 60000);
  var refr = document.getElementById("refr"), sec = 60;
  if (refr) setInterval(function () { sec = sec <= 1 ? 60 : sec - 1; refr.textContent = "next update in " + sec + " s"; }, 1000);

  try {
    fetch(root + "data/power.json").then(function (r) { return r.json(); }).then(function (j) { power = j.rows || []; drawPower(); evaluate(); })["catch"](function () {});
    fetch("https://iradone.com/data/today.json").then(function (r) { return r.json(); }).then(function (j) { roads = (j.season && j.season.roads) || null; incs = (j.incidents && j.incidents.list) || []; evaluate(); })["catch"](function () {});
  } catch (e) {}
})();

/* for the duty desk */
try { console.log("%cstatus.attelkom.net%c  status.js 1.4.2, rechecks every 60 s.\nIf this page is red and you have the console open, you are on shift. Internal duty line 1-11. Don't refresh it every second, it only makes the graph worse.", "color:#1F8A2B;font-weight:bold", "color:inherit"); } catch (e) {}

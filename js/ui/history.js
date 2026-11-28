/*
 * 历史：所有 Wins 永久保存、按日期存，这里负责「看」
 * - 「历史」页：月历（每天几个 Wins）+ 按天往回翻 + 点某一天看那天的完整清单
 * - 「本月」页：这个月的统计和每天的 Wins，更早的月份一行一个，点进去就是历史
 * - 打开网站时，如果这个浏览器里一条记录都没有，提示可以从备份导入
 * 只读：不改任何数据。数据从 Store 来（Store.dayKeys / Store.dayInfo）。
 */
var History = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var T = function (k, p) { return I18n.t(k, p); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var NODATA_KEY = "winslog-nodata-dismissed"; // 只在这一次打开期间有效（sessionStorage）

  var state = { ym: null, day: null }; // 日历现在看哪个月、选中了哪一天

  function today() { return Store.dayKey(); }
  function monthName(m) { var a = T("months"); return Array.isArray(a) ? a[m - 1] : String(m); }
  function dayTitle(key) {
    var m = +key.slice(5, 7), d = +key.slice(8, 10), w = T("week")[new Date(key + "T12:00:00").getDay()];
    return T("hist.dayTitle", { m: m, d: d, w: w, mon: monthName(m) });
  }
  function monthTitle(ym) { var y = ym.slice(0, 4), m = +ym.slice(5); return T("i3.monthTitle", { y: y, m: m, mon: monthName(m) }); }
  function count(n) { return T(n === 1 ? "hist.countOne" : "hist.count", { n: n }); }
  function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function level(n) { return n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0; }
  function shiftMonth(ym, delta) { var y = +ym.slice(0, 4), m = +ym.slice(5) - 1 + delta; var d = new Date(y, m, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function monthStats(ym) { // 这个月：件数、有记录的天数、最多的一天
    var wins = 0, days = 0, best = null;
    Store.dayKeys().forEach(function (k) {
      if (k.slice(0, 7) !== ym) return;
      var n = Store.dayInfo(k).done; if (!n) return;
      wins += n; days++; if (!best || n > best.n) best = { key: k, n: n };
    });
    return { wins: wins, days: days, best: best };
  }
  function streak() { // 到今天（或昨天，如果今天还没记）为止连续几天有 Wins
    var d = new Date(), n = 0;
    if (!Store.dayInfo(Store.dayKey(d)).done) d.setDate(d.getDate() - 1);
    while (Store.dayInfo(Store.dayKey(d)).done) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // 跳到某一页（island3d.js 听这个事件来切换右边面板）
  function goPage(page) { document.dispatchEvent(new CustomEvent("island:page", { detail: { page: page } })); }
  function openDay(key) { state.day = key; state.ym = key.slice(0, 7); goPage("history"); }
  function openMonth(ym) { state.ym = ym; goPage("history"); }

  /* ================= 「历史」页：月历 + 那天的清单 ================= */
  function renderCalendar(el) {
    var t = today();
    if (!state.ym) state.ym = t.slice(0, 7);
    if (!state.day) state.day = t;
    var ym = state.ym, y = +ym.slice(0, 4), m = +ym.slice(5);
    var first = (new Date(y, m - 1, 1).getDay() + 6) % 7, n = new Date(y, m, 0).getDate(); // 星期一排第一列
    var ms = monthStats(ym);
    var h = '<div class="hist-nav">' +
      '<button type="button" class="i3-btn hist-arrow" data-act="prev-month" aria-label="' + esc(T("hist.prevMonth")) + '">‹</button>' +
      '<div class="hist-month-name"><b>' + esc(monthTitle(ym)) + "</b><small>" + esc(ms.wins ? T("hist.monthSum", { n: ms.wins, d: ms.days }) : T("hist.monthNone")) + "</small></div>" +
      '<button type="button" class="i3-btn hist-arrow" data-act="next-month" aria-label="' + esc(T("hist.nextMonth")) + '">›</button>' +
      '<button type="button" class="i3-btn" data-act="today">' + esc(T("hist.today")) + "</button></div>";
    h += '<div class="hist-wk">' + T("hist.wk").map(function (w) { return "<span>" + esc(w) + "</span>"; }).join("") + '</div><div class="hist-grid">';
    for (var i = 0; i < first; i++) h += '<i class="hist-pad"></i>';
    for (var d = 1; d <= n; d++) {
      var key = ym + "-" + pad(d), info = Store.dayInfo(key), cls = ["hist-day", "lv" + level(info.done)];
      if (key === t) cls.push("is-today"); if (key === state.day) cls.push("is-on"); if (key > t) cls.push("is-future");
      if (info.total && !info.done) cls.push("has-open");
      h += '<button type="button" class="' + cls.join(" ") + '" data-day="' + key + '" aria-label="' + esc(dayTitle(key) + (info.done ? "，" + count(info.done) : "")) + '"' + (key > t ? " disabled" : "") + '><span class="n">' + d + "</span>" + (info.done ? "<b>" + info.done + "</b>" : "") + "</button>";
    }
    h += "</div>" + dayDetail(state.day, t);
    el.innerHTML = h;
    el.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.day) { state.day = b.dataset.day; renderCalendar(el); return; }
      var act = b.dataset.act, keys = Store.dayKeys();
      if (act === "prev-month") { state.ym = shiftMonth(state.ym, -1); renderCalendar(el); }
      else if (act === "next-month") { state.ym = shiftMonth(state.ym, 1); renderCalendar(el); }
      else if (act === "today") { state.ym = today().slice(0, 7); state.day = today(); renderCalendar(el); }
      else if (act === "prev-day" || act === "next-day") { // 按天往回翻：跳到前一个 / 后一个有记录的日子
        var target = act === "prev-day" ? keys.filter(function (k) { return k < state.day; }).pop() : keys.filter(function (k) { return k > state.day; })[0];
        if (target) { state.day = target; state.ym = target.slice(0, 7); renderCalendar(el); }
      }
    };
  }
  function dayDetail(key, t) {
    var info = Store.dayInfo(key), keys = Store.dayKeys();
    var hasPrev = keys.some(function (k) { return k < key; }), hasNext = keys.some(function (k) { return k > key; });
    var h = '<section class="hist-detail"><div class="hist-detail-head">' +
      '<button type="button" class="i3-btn hist-arrow" data-act="prev-day" aria-label="' + esc(T("hist.prevDay")) + '"' + (hasPrev ? "" : " disabled") + ">‹</button>" +
      "<div><b>" + esc(dayTitle(key)) + (key === t ? ' <em class="hist-badge">' + esc(T("hist.today")) + "</em>" : "") + "</b><small>" + esc(info.total ? count(info.done) + (info.open.length ? " · " + T("hist.openCount", { n: info.open.length }) : "") : "") + "</small></div>" +
      '<button type="button" class="i3-btn hist-arrow" data-act="next-day" aria-label="' + esc(T("hist.nextDay")) + '"' + (hasNext ? "" : " disabled") + ">›</button></div>";
    if (key > t) h += '<p class="i3-note">' + esc(T("hist.future")) + "</p>";
    else if (!info.total) h += '<p class="i3-note">' + esc(T("hist.empty")) + "</p>";
    else {
      h += '<ol class="hist-list">' + info.wins.map(function (w) { return '<li class="is-done"><span class="star">★</span><span class="txt">' + esc(w.text) + "</span><time>" + hhmm(w.doneAt) + "</time></li>"; }).join("") +
        info.open.map(function (w) { return '<li class="is-open"><span class="star">·</span><span class="txt">' + esc(w.text) + "</span><time>" + esc(T("hist.notDone")) + "</time></li>"; }).join("") + "</ol>";
      if (info.endedAt) h += '<p class="i3-note">🖨 ' + esc(T("hist.ended", { t: hhmm(info.endedAt) })) + "</p>";
    }
    return h + "</section>";
  }

  /* ================= 「本月」页：用历史数据 ================= */
  function renderMonth(el) {
    var t = today(), ym = t.slice(0, 7), y = +ym.slice(0, 4), m = +ym.slice(5), n = new Date(y, m, 0).getDate();
    var ms = monthStats(ym), keys = Store.dayKeys();
    var h = '<div class="hist-monthpage"><h3 class="hist-h">' + esc(monthTitle(ym)) + "</h3>";
    if (!ms.wins) h += '<p class="i3-note">' + esc(T("i3.monthEmpty")) + "</p>";
    else {
      h += '<p class="hist-sub">' + esc(T("i3.monthTrees", { n: ms.wins })) + "</p>" +
        '<div class="hist-stats"><div><b>' + ms.wins + "</b><span>" + esc(T("hist.stat.wins")) + "</span></div><div><b>" + ms.days + "</b><span>" + esc(T("hist.stat.days")) + "</span></div>" +
        "<div><b>" + streak() + "</b><span>" + esc(T("hist.stat.streak")) + "</span></div></div>";
      if (ms.best) h += '<p class="hist-sub">' + esc(T("hist.stat.best")) + "：" + esc(dayTitle(ms.best.key)) + " · " + esc(count(ms.best.n)) + "</p>";
      var max = 1, counts = [];
      for (var d = 1; d <= n; d++) { var c = Store.dayInfo(ym + "-" + pad(d)).done; counts.push(c); if (c > max) max = c; }
      h += '<div class="hist-bars" role="group" aria-label="' + esc(monthTitle(ym)) + '">' + counts.map(function (c, i) {
        var key = ym + "-" + pad(i + 1);
        return '<button type="button" class="' + (key === t ? "is-today" : "") + '" data-day="' + key + '" aria-label="' + esc(dayTitle(key) + "，" + count(c)) + '"' + (key > t ? " disabled" : "") + '><i style="height:' + (c ? Math.max(14, Math.round(c / max * 100)) : 4) + '%"></i></button>';
      }).join("") + "</div>";
      var days = keys.filter(function (k) { return k.slice(0, 7) === ym && Store.dayInfo(k).done; }).reverse();
      h += days.map(function (k) {
        var info = Store.dayInfo(k);
        return '<section class="hist-daylist"><button type="button" class="hist-dayhead" data-day="' + k + '"><b>' + esc(dayTitle(k)) + "</b><span>" + esc(count(info.done)) + "</span></button><ul>" +
          info.wins.map(function (w) { return '<li><span class="star">★</span><span class="txt">' + esc(w.text) + "</span><time>" + hhmm(w.doneAt) + "</time></li>"; }).join("") + "</ul></section>";
      }).join("");
    }
    // 更早的月份：一行一个，点进去就是那个月的日历
    var months = {}; keys.forEach(function (k) { var q = k.slice(0, 7); if (q !== ym && Store.dayInfo(k).done) { months[q] = months[q] || { n: 0, d: 0 }; months[q].n += Store.dayInfo(k).done; months[q].d++; } });
    var list = Object.keys(months).sort().reverse();
    if (list.length) h += '<h4 class="hist-h2">' + esc(T("hist.earlier")) + "</h4>" + list.map(function (q) {
      return '<button type="button" class="hist-monthrow" data-month="' + q + '"><b>' + esc(monthTitle(q)) + "</b><span>" + esc(T("hist.monthRow", { n: months[q].n, d: months[q].d })) + "</span></button>";
    }).join("");
    h += '<button type="button" class="i3-btn hist-all" data-month="' + ym + '">' + esc(T("hist.openCalendar")) + "</button></div>";
    el.innerHTML = h;
    el.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.day) openDay(b.dataset.day); else if (b.dataset.month) openMonth(b.dataset.month);
    };
  }

  /* ================= 没有任何记录时的提示 ================= */
  function updateNotice() {
    var box = $("nodata-notice"); if (!box) return;
    var dismissed = false; try { dismissed = sessionStorage.getItem(NODATA_KEY) === "1"; } catch (e) {}
    box.hidden = Store.hasData() || dismissed;
  }
  function init() {
    var box = $("nodata-notice"); if (!box) return;
    $("nodata-import").addEventListener("click", function () { if (window.Settings) Settings.importPrompt(); });
    $("nodata-dismiss").addEventListener("click", function () { try { sessionStorage.setItem(NODATA_KEY, "1"); } catch (e) {} updateNotice(); });
    document.addEventListener("wins:change", updateNotice);
    updateNotice();
  }

  return { init: init, renderCalendar: renderCalendar, renderMonth: renderMonth, openDay: openDay, openMonth: openMonth, updateNotice: updateNotice };
})();

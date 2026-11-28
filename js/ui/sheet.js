/*
 * 竖屏版面的底部抽屉
 * 小岛占满整个屏幕（不缩放），任务、商店、本月、历史、助手都在底部的抽屉里，抽屉盖在小岛的下半部分上。
 * 三档高度：
 *   收起（默认）：只有一行，约 64px：左边「下一件」小事（太长就省略），右边说话按钮和「更多」按钮，顶上有小把手
 *   半开：今天的任务列表，大约半屏
 *   全开：完整的任务和 Wins 列表（顶到顶栏下面）
 * 操作：把手 / 这一行 / 标签栏都能上下拖，跟手移动，松手吸附到最近的一档（200～300ms 的动画，
 *       快速一甩会按方向去到下一档）；点把手按 收起 → 半开 → 全开 → 收起 轮流切换。
 * 收起时点「下一件」的文字：开始这件事（陪伴模式在第 2 期做，现在先发出 companion:start 事件、展开任务列表并让它闪一下）。
 * 只在竖屏版面（<body class="layout-portrait">）里起作用，横屏和电脑上完全不动。
 */
var Sheet = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var T = function (k, p) { return I18n.t(k, p); };
  var lastRelease = null; // 最近一次松手的情况（速度、位置、去了哪一档），检查手感用
  var view, panel, state = "peek", vis = 0, H = 0, peekH = 64, halfH = 0, fullH = 0, drag = null, suppress = false, snapTimer = 0;
  var kb = 0;            // 屏幕键盘挡住的高度（iOS 上从 visualViewport 算出来）
  var MOVE = 6;          // 手指动了多少才算「拖」，不然就是点
  var FLICK = 0.45;      // 甩的速度（像素 / 毫秒）

  function portrait() { return document.body.classList.contains("layout-portrait"); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function safeBottom() { // 手机底部的安全区（比如 iPhone 的横条）
    var p = document.createElement("div");
    p.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none";
    document.body.appendChild(p); var h = p.offsetHeight; p.remove(); return h;
  }
  function measure() {
    H = view.clientHeight;
    peekH = 60 + safeBottom(); // 把手 16 + 一行 44
    halfH = Math.round(H * 0.5);
    var tb = document.querySelector(".topbar");
    fullH = Math.max(halfH + 60, Math.round(H - (tb ? tb.getBoundingClientRect().bottom : 52) - 6));
    view.style.setProperty("--sheet-full", fullH + "px");
  }
  function visFor(s) { return s === "peek" ? peekH : s === "half" ? halfH : fullH; }
  function setVis(v) {
    vis = v;
    // 键盘弹出时：抽屉整体往上抬键盘那么高；露出来的部分不能超过键盘上面剩下的空间
    var eff = v;
    if (kb) {
      var vv = window.visualViewport, room = (vv ? vv.height : window.innerHeight) - 8;
      eff = Math.max(peekH, Math.min(v, room));
    }
    view.style.setProperty("--sheet-vis", eff + "px");
    view.style.setProperty("--sheet-y", (fullH - eff - kb) + "px");
    view.classList.toggle("sheet-open", v > peekH + 24); // 展开了：收起那一行换成标签栏，控制条让开
    fitHelper(eff);
  }

  // 助手页：整页高度 = 抽屉露出来的那部分，聊天记录在中间滚，输入框永远贴在看得见的最底下（半开、全开、键盘弹出都一样）
  var lastEff = 0;
  function fitHelper(eff) {
    if (eff == null) eff = lastEff; else lastEff = eff;
    var page = panel && panel.querySelector(".i3-page.helper");
    if (!page) return;
    if (!portrait() || page.hidden) { page.style.height = ""; return; }
    var log = $("chat-log"), atBottom = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    var top = page.getBoundingClientRect().top - panel.getBoundingClientRect().top; // 页面在抽屉里的位置（不受 transform 影响）
    var pad = 8 + safeBottomCached;
    page.style.height = Math.max(0, Math.round(eff - top - pad)) + "px";
    if (log && atBottom) log.scrollTop = log.scrollHeight; // 本来在看最新一条：高度变了也停在最新一条
  }
  var safeBottomCached = 0;

  // iOS：键盘弹出时页面不会变矮，只有 visualViewport 变矮；按它算出键盘挡住了多少
  function onViewport() {
    if (!portrait()) { if (kb) { kb = 0; setVis(vis); } return; }
    var vv = window.visualViewport; if (!vv) return;
    var k = Math.round(window.innerHeight - vv.height - vv.offsetTop);
    k = k > 80 ? k : 0;                       // 小于 80 像素的变化是地址栏伸缩，不是键盘
    if (k === kb) return;
    kb = k;
    view.classList.toggle("kb-open", kb > 0);
    setVis(vis);
  }
  function go(s, animate) {
    state = s;
    clearTimeout(snapTimer);
    if (animate) { view.classList.add("is-snapping"); snapTimer = setTimeout(function () { view.classList.remove("is-snapping"); }, 300); }
    else view.classList.remove("is-snapping");
    setVis(visFor(s));
    panel.setAttribute("data-sheet", s);
  }
  function ensure(min) { // 至少展开到这一档
    var order = { peek: 0, half: 1, full: 2 };
    if (portrait() && order[state] < order[min]) go(min, true);
  }
  function nearest(v) {
    var best = "peek", bd = 1e9;
    ["peek", "half", "full"].forEach(function (s) { var d = Math.abs(visFor(s) - v); if (d < bd) { bd = d; best = s; } });
    return best;
  }
  function stepFrom(v, up) { // 甩一下：去到上面 / 下面的下一档
    var list = ["peek", "half", "full"].map(visFor);
    if (up) { for (var i = 0; i < list.length; i++) if (list[i] > v + 12) return ["peek", "half", "full"][i]; return "full"; }
    for (var j = list.length - 1; j >= 0; j--) if (list[j] < v - 12) return ["peek", "half", "full"][j];
    return "peek";
  }

  /* ---------- 拖动 ---------- */
  function down(e) {
    if (!portrait() || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag = { id: e.pointerId, y0: e.clientY, v0: vis, moved: false, lastY: e.clientY, lastT: performance.now(), vy: 0 };
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) > MOVE) {
      drag.moved = true; // 从超过门槛的这一刻开始跟手
      drag.y0 = e.clientY; drag.v0 = vis; drag.lastY = e.clientY; drag.lastT = performance.now();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件抓不了，不影响 */ }
      clearTimeout(snapTimer); view.classList.remove("is-snapping");
      return;
    }
    if (!drag.moved) return;
    var now = performance.now(), dt = Math.max(1, now - drag.lastT);
    drag.vy = .6 * drag.vy + .4 * ((e.clientY - drag.lastY) / dt); drag.lastY = e.clientY; drag.lastT = now;
    setVis(clamp(drag.v0 - (e.clientY - drag.y0), peekH, fullH));
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (!d.moved) return; // 只是点了一下：交给按钮自己的点击
    suppress = true; setTimeout(function () { suppress = false; }, 0);
    var target = Math.abs(d.vy) > FLICK ? stepFrom(vis, d.vy < 0) : nearest(vis);
    lastRelease = { vy: +d.vy.toFixed(2), vis: Math.round(vis), target: target };
    go(target, true);
  }
  function cancel() { if (drag && drag.moved) go(nearest(vis), true); drag = null; }

  /* ---------- 收起那一行 ---------- */
  function nextTask() { var t = Store.todosOf(); return t.length ? t[0] : null; }
  function renderPeek() {
    var t = nextTask(), el = $("i3-next-text"); if (!el) return;
    var label = document.querySelector("#i3-next b");
    if (t) { label.hidden = false; el.textContent = t.text; }
    else { label.hidden = true; el.textContent = T(Store.winsOf().length ? "sheet.allDone" : "sheet.none"); }
  }
  function openHelper(listen, ev) {
    document.dispatchEvent(new CustomEvent("island:page", { detail: { page: "helper" } }));
    go("half", true);
    if (listen && window.Chat) Chat.listen("click:peek-mic", ev); // 说话：必须就在这次点按里同步开始听（iOS 上隔一会儿再 start() 会被拒绝）
  }
  function startNext() {
    var t = nextTask();
    if (!t) { openHelper(false); return; }
    document.dispatchEvent(new CustomEvent("island:page", { detail: { page: "tasks" } }));
    go("half", true);
    document.dispatchEvent(new CustomEvent("companion:start", { detail: { id: t.id, text: t.text } }));
    setTimeout(function () {
      var li = document.querySelector('#todo li[data-id="' + t.id + '"]');
      if (li) { li.classList.add("is-focus"); li.scrollIntoView({ block: "nearest" }); setTimeout(function () { li.classList.remove("is-focus"); }, 1800); }
    }, 120);
  }

  function init() {
    view = $("view-island"); panel = $("i3-panel"); if (!view || !panel || !$("i3-sheet-head")) return;
    var head = $("i3-sheet-head"), tabs = panel.querySelector(".i3-tabs");
    [head, tabs].forEach(function (z) {
      z.addEventListener("pointerdown", down); z.addEventListener("pointermove", move);
      z.addEventListener("pointerup", up); z.addEventListener("pointercancel", cancel);
      z.addEventListener("click", function (e) { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true); // 拖完松手不算点击
    });
    $("i3-handle").addEventListener("click", function () { go(state === "peek" ? "half" : state === "half" ? "full" : "peek", true); });
    $("i3-next").addEventListener("click", startNext);
    $("i3-peek-mic").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openHelper(true, e); });
    document.addEventListener("voice:state", function (e) { // 说话按钮跟着变：准备中 / 正在听（红色）
      var b = $("i3-peek-mic"), st = e.detail && e.detail.state;
      b.classList.toggle("is-listening", st === "listening"); b.classList.toggle("is-starting", st === "starting");
    });
    $("i3-peek-more").addEventListener("click", function () { go("half", true); });
    document.addEventListener("sheet:collapse", function () { if (portrait()) go("peek", true); });
    document.addEventListener("island:page", function () { ensure("half"); setTimeout(function () { fitHelper(); }, 0); });   // 从别处跳到某一页（比如历史）：抽屉要打开
    document.addEventListener("wins:ask", function () { ensure("half"); });
    document.addEventListener("wins:change", renderPeek);
    panel.addEventListener("focusin", function (e) { if (portrait() && /INPUT|TEXTAREA/.test(e.target.tagName)) ensure("full"); }); // 打字时拉到最高，别被键盘挡住
    function relayout() { if (!portrait()) return; measure(); go(state, false); }
    document.addEventListener("layout:change", function () { setTimeout(relayout, 0); });
    window.addEventListener("resize", relayout);
    measure(); renderPeek();
    safeBottomCached = safeBottom();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewport);
      window.visualViewport.addEventListener("scroll", onViewport);
    }
    // 切到助手页 / 离开助手页（标签点击不发事件，看 hidden 属性的变化）：重新量一下
    var hp = panel.querySelector(".i3-page.helper");
    if (hp && window.MutationObserver) new MutationObserver(function () { fitHelper(); var log = $("chat-log"); if (log && !hp.hidden) log.scrollTop = log.scrollHeight; }).observe(hp, { attributes: true, attributeFilter: ["hidden"] });
    view.addEventListener("transitionend", function () { fitHelper(); }); // 收起那一行折叠完，页面位置会变
    var q = /sheet=(peek|half|full)/.exec(location.hash); // 网址加 #sheet=half 直接看某一档（截图检查用）
    go(q ? q[1] : "peek", false);
  }

  return { init: init, last: function () { return lastRelease; }, go: function (s) { go(s, true); }, state: function () { return state; }, renderPeek: renderPeek, fit: function () { fitHelper(); }, keyboard: function (px) { kb = px || 0; view.classList.toggle("kb-open", kb > 0); setVis(vis); } };
})();

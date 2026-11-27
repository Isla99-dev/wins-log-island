/*
 * 版面：横屏 / 竖屏
 * - 竖屏版面：小岛占满屏幕，任务、商店、本月、历史、助手收在底部的三档抽屉里（js/sheet.js）
 * - 横屏版面：小岛全屏，助手和导航在右边的侧边栏（电脑上也是这个）
 * - 自动：手机竖着拿（窗口比较窄、又比宽度高）用竖屏版面，其他情况用横屏版面
 * - 设置里可以固定成横屏或竖屏。注意：手机浏览器没办法真正锁住屏幕方向（iPhone 完全不行，
 *   Android 也要全屏才行），所以这里固定的是「版面」；能锁的地方会顺便试着锁一下，锁不了也没关系。
 * 结果写在 <body> 的 class 上：layout-portrait / layout-landscape，CSS 和 3D 小岛都看这个。
 * 偏好存在 localStorage 的 winslog-layout（只是界面偏好，不在备份里）。
 */
var Layout = (function () {
  var KEY = "winslog-layout";
  var pref = "auto", mode = null;
  try { var v = localStorage.getItem(KEY); if (v === "landscape" || v === "portrait") pref = v; } catch (e) { /* 读不到就用自动 */ }

  function detect() {
    if (pref !== "auto") return pref;
    return window.innerWidth < 900 && window.innerHeight > window.innerWidth ? "portrait" : "landscape";
  }
  function apply() {
    var m = detect();
    if (m === mode) return;
    mode = m;
    document.body.classList.toggle("layout-portrait", m === "portrait");
    document.body.classList.toggle("layout-landscape", m === "landscape");
    document.dispatchEvent(new CustomEvent("layout:change", { detail: { mode: m, pref: pref } }));
  }
  function tryLock() {
    try {
      var o = window.screen && screen.orientation; if (!o) return;
      if (pref === "auto") { if (o.unlock) o.unlock(); }
      else if (o.lock) { var r = o.lock(pref); if (r && r.catch) r.catch(function () { /* 不支持就算了 */ }); }
    } catch (e) { /* 同上 */ }
  }
  function set(p) {
    pref = (p === "landscape" || p === "portrait") ? p : "auto";
    try { if (pref === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch (e) {}
    apply();
    document.dispatchEvent(new CustomEvent("layout:change", { detail: { mode: mode, pref: pref } })); // 设置面板要刷新「现在用的是哪个」
    tryLock();
  }
  function init() {
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", function () { setTimeout(apply, 150); });
  }

  return { init: init, set: set, pref: function () { return pref; }, mode: function () { return mode; } };
})();

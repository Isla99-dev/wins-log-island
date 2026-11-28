/* 页面主逻辑：日期、切换页面和语言，并启动各个模块 */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  // ---- 日期 ----
  var now = new Date();
  if (I18n.isEn()) {
    $("date-main").textContent = now.getDate() + " " + I18n.t("months")[now.getMonth()] + " " + now.getFullYear();
  } else {
    $("date-main").textContent = now.getFullYear() + "." + (now.getMonth() + 1) + "." + now.getDate();
  }
  $("date-week").textContent = I18n.t("week")[now.getDay()];

  // ---- 语言切换：中 / EN ----
  var toggle = $("lang-toggle");
  toggle.querySelector('[data-lang="' + I18n.lang() + '"]').classList.add("is-current");
  toggle.addEventListener("click", function () {
    I18n.set(I18n.isEn() ? "zh" : "en");
  });

  // ---- 版面：横屏 / 竖屏（要最先定下来，别的模块量尺寸时看它） ----
  Layout.init();

  // ---- 旧版数据导入 ----
  Store.importV1();

  // ---- 今日任务 & 今天的 Wins ----
  Tasks.init();

  // ---- 结束今天：小打印机 ----
  Receipt.init();

  // ---- 小岛助手 ----
  Chat.init();

  // ---- 世界地图 ----
  WorldMap.init();

  // ---- 设置：音效、备份 ----
  Settings.init();
  Energy.init(); // 每天第一次打开：问今天有多少电
  Memory.init(); // 小助手的记忆：每天第一次对话结束后更新用户摘要
  if (window.ChibiPreview) ChibiPreview.init();

  // ---- 历史、本月；没有记录时提示可以从备份导入 ----
  History.init();

  // ---- 竖屏版面的底部抽屉 ----
  Sheet.init();

  // ---- 切换 小岛 / 世界地图 ----
  var tabs = document.querySelectorAll(".tab[data-view]");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var view = tab.dataset.view;
      tabs.forEach(function (t) { t.classList.toggle("is-active", t === tab); });
      $("view-island").hidden = view !== "island";
      $("view-map").hidden = view !== "map";
      document.body.classList.toggle("on-island", view === "island");
      window.scrollTo(0, 0);
    });
  });

  // ---- 3D 小岛 ----
  Island.init();

  // 网址后面加 #view=map、#modal=settings、#modal=printer，截图检查用
  var hv = /view=(\w+)/.exec(location.hash), hm = /modal=(\w+)/.exec(location.hash);
  if (hv && hv[1] === "map") { var mapTab = document.querySelector('.tab[data-view="map"]'); if (mapTab) mapTab.click(); }
  if (hm) setTimeout(function () {
    if (hm[1] === "settings") Settings.open();
    else if (hm[1] === "printer") $("end-day").click();
  }, 700);
})();

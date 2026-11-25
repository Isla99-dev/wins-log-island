/* 页面主逻辑：日期、切换页面，并启动各个模块 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

  // ---- 日期 ----
  var now = new Date();
  $("date-main").textContent = now.getFullYear() + "." + (now.getMonth() + 1) + "." + now.getDate();
  $("date-week").textContent = WEEK[now.getDay()];

  // ---- 旧版数据导入 ----
  Store.importV1();

  // ---- 今日任务 & 今天的 Wins ----
  Tasks.init();

  // ---- 结束今天：小打印机 ----
  Receipt.init();

  // ---- 切换 小岛 / 世界地图 ----
  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var view = tab.dataset.view;
      tabs.forEach(function (t) { t.classList.toggle("is-active", t === tab); });
      $("view-island").hidden = view !== "island";
      $("view-map").hidden = view !== "map";
    });
  });

  // ---- 小岛 ----
  Island.init($("island"));
})();

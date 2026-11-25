/* 页面主逻辑（第 1 步：日期、切换页面、显示今天的 Wins） */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

  // ---- 日期 ----
  var now = new Date();
  $("date-main").textContent = now.getFullYear() + "." + (now.getMonth() + 1) + "." + now.getDate();
  $("date-week").textContent = WEEK[now.getDay()];

  // ---- 旧版数据导入 ----
  Store.importV1();

  // ---- 今天的 Wins ----
  function pad(n) { return String(n).padStart(2, "0"); }

  function renderWins() {
    var wins = Store.winsOf();
    var list = $("wins");
    list.innerHTML = "";
    wins.forEach(function (w) {
      var li = document.createElement("li");
      li.innerHTML = '<svg viewBox="0 0 7 7" aria-hidden="true"><use href="#px-star"/></svg>' +
        '<span class="text"></span><span class="time"></span>';
      li.querySelector(".text").textContent = w.text;
      var d = new Date(w.doneAt);
      li.querySelector(".time").textContent = pad(d.getHours()) + ":" + pad(d.getMinutes());
      list.appendChild(li);
    });
    $("win-count").textContent = wins.length;
    $("wins-empty").hidden = wins.length > 0;
  }
  renderWins();

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

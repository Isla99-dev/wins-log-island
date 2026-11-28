/*
 * 今天的电量：每天第一次打开时，弹出一张小卡片问「今天有多少电？」🔋低 / 🔋🔋中 / 🔋🔋🔋高，可以跳过。
 * - 选的结果存在当天的记录里（Store.setEnergy），随每次 AI 请求一起发给小助手（电量低时第一步更小、多肯定休息）。
 * - 跳过也算问过，今天不再弹。助手页的模式标签旁边有一个小电池，点它可以改。
 * - 如果「欢迎回到小岛」的说明还开着，等它关掉再弹。
 */
var Energy = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var LEVELS = ["low", "mid", "high"];
  var ICON = { low: "🔋", mid: "🔋🔋", high: "🔋🔋🔋" };

  function open() {
    var card = $("energy-card");
    card.hidden = false;
    var cur = Store.userMeta().energy;
    card.querySelectorAll("[data-energy]").forEach(function (b) { b.classList.toggle("is-on", b.dataset.energy === cur); });
    setTimeout(function () { var f = card.querySelector("[data-energy]"); if (f) f.focus(); }, 50);
  }
  function close() { $("energy-card").hidden = true; }

  function choose(level) {
    Store.setEnergy(level);
    close();
    paintChip();
    document.dispatchEvent(new CustomEvent("energy:change", { detail: { level: Store.userMeta().energy } }));
  }

  // 助手页模式标签旁边的小电池：显示今天的电量，点一下重新选
  function paintChip() {
    var chip = $("energy-chip"); if (!chip) return;
    var lv = Store.userMeta().energy;
    chip.textContent = lv ? ICON[lv] + " " + I18n.t("energy." + lv) : "🔋 " + I18n.t("energy.unset");
    chip.title = I18n.t("energy.chipTitle");
  }

  function maybeAsk() {
    if (Store.energyAsked()) return;
    if (Onboarding.isActive()) return; // 第一次打开：等第一个 Win 和介绍说完（onboarding:done）再问
    var tip = $("i3-tip");
    if (tip && !tip.hidden) { setTimeout(maybeAsk, 600); return; } // 等说明关掉
    open();
  }

  function init() {
    var card = $("energy-card");
    card.addEventListener("click", function (e) {
      var b = e.target.closest("[data-energy]");
      if (b) { choose(b.dataset.energy); return; }
      if (e.target.closest("#energy-skip")) choose(null);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !card.hidden) choose(Store.userMeta().energy); });
    var chip = $("energy-chip");
    if (chip) chip.addEventListener("click", open);
    paintChip();
    if (/[#&]energy=ask/.test(location.hash)) { open(); return; } // 截图检查用
    setTimeout(maybeAsk, 800);
    document.addEventListener("onboarding:done", function () { setTimeout(maybeAsk, 7000); }); // 先让人看完功能介绍
  }

  return { init: init, open: open, LEVELS: LEVELS };
})();

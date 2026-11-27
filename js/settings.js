/*
 * 设置（第 9 步）
 * - 音效开关
 * - 导出备份（.json，可以再导入）
 * - 导入备份（会先告诉你备份里有什么，确认后才替换）
 * - 导出 Wins 记录（.txt，按日期列出所有完成的事，方便阅读或打印）
 */
var Settings = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var pending = null, lastFocus = null;
  var DEBUG_KEY = "winslog-debug";
  var debugOn = false;
  try { debugOn = localStorage.getItem(DEBUG_KEY) === "on"; } catch (e) { /* 读不到就当关着 */ }

  function pad(n) { return String(n).padStart(2, "0"); }
  function today() { return Store.dayKey(); }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function say(text, isError) {
    var el = $("settings-msg");
    el.textContent = text;
    el.classList.toggle("is-error", !!isError);
  }

  // ---------- 状态 ----------
  function renderStatus() {
    var last = Store.lastBackupAt();
    var text;
    if (!last) text = I18n.t("settings.neverBacked");
    else {
      var days = Math.floor((Date.now() - last) / 86400000);
      text = days === 0 ? I18n.t("settings.backedToday") : I18n.t(days === 1 ? "settings.backedDay" : "settings.backedDays", { n: days });
    }
    var wins = Store.allWins().length, dayCount = Store.allDays().filter(function (d) { return d.tasks.length; }).length;
    $("backup-status").textContent = I18n.t("settings.stats", { days: dayCount, wins: wins }) + " " + text;

    var n = window.Characters ? Characters.count() : 0;
    $("chars-status").textContent = n ? I18n.t("settings.charsCount", { n: n }) : I18n.t("settings.charsNone");

    renderLayout();

    var sw = $("sound-switch");
    sw.setAttribute("aria-checked", Sound.isOn() ? "true" : "false");
    sw.querySelector(".switch-label").textContent = I18n.t(Sound.isOn() ? "settings.on" : "settings.off");
    renderVoiceExp();
    var dw = $("debug-switch");
    dw.setAttribute("aria-checked", debugOn ? "true" : "false");
    dw.querySelector(".switch-label").textContent = I18n.t(debugOn ? "settings.on" : "settings.off");
  }

  // ---------- 语音实验（调试模式里才显示）：一个一个在手机上试，找到有效的就停 ----------
  function renderVoiceExp() {
    var box = $("voice-exp"); if (!box) return;
    box.hidden = !debugOn;
    if (!debugOn) return;
    var cur = Chat.expId();
    $("voice-exp-list").innerHTML = Chat.EXPERIMENTS.map(function (x) {
      return '<button type="button" class="i3-btn' + (x.id === cur ? " is-on" : "") + '" data-exp="' + x.id + '" aria-pressed="' + (x.id === cur) + '">' + I18n.t("settings.exp." + x.id) + "</button>";
    }).join("");
  }

  // ---------- 版面：自动 / 横屏 / 竖屏 ----------
  function renderLayout() {
    var pref = Layout.pref();
    document.querySelectorAll("#layout-btns [data-layout]").forEach(function (b) {
      var on = b.dataset.layout === pref; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $("layout-status").textContent = I18n.t("layout.now", { mode: I18n.t("layout.mode." + Layout.mode()) });
  }

  // ---------- 动作 ----------
  function exportBackup() {
    download("wins-log-backup-" + today() + ".json", JSON.stringify(Store.exportData(), null, 2), "application/json");
    Store.markBackup();
    renderStatus();
    say(I18n.t("settings.exported"));
    Sound.play("save");
  }

  function exportText() {
    var week = I18n.t("week");
    var lines = [I18n.t("settings.textTitle"), "", I18n.t("settings.textExported", { date: today() }), ""];
    var days = Store.allDays().slice().reverse();
    var any = false;
    days.forEach(function (d) {
      var wins = d.tasks.filter(function (t) { return t.doneAt; }).sort(function (a, b) { return a.doneAt - b.doneAt; });
      if (!wins.length) return;
      any = true;
      var date = new Date(d.key + "T12:00:00");
      lines.push("## " + d.key + " " + week[date.getDay()] + " · " + I18n.t("settings.textCount", { n: wins.length }));
      wins.forEach(function (w) {
        var t = new Date(w.doneAt);
        lines.push("★ " + w.text + "  (" + pad(t.getHours()) + ":" + pad(t.getMinutes()) + ")");
      });
      lines.push("");
    });
    if (!any) { say(I18n.t("settings.nothingYet"), true); return; }
    download("wins-log-" + today() + ".txt", lines.join("\n"), "text/plain;charset=utf-8");
    say(I18n.t("settings.textDone"));
    Sound.play("save");
  }

  function chooseFile() {
    $("import-file").value = "";
    $("import-file").click();
  }

  function readFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var obj = null;
      try { obj = JSON.parse(reader.result); } catch (e) {}
      var info = Store.inspectBackup(obj);
      if (!info) { say(I18n.t("settings.badFile"), true); return; }
      pending = obj;
      $("import-confirm-text").textContent = I18n.t("settings.confirmImport", {
        days: info.days, wins: info.wins, now: Store.allWins().length
      });
      $("import-confirm").hidden = false;
      say("");
      $("import-yes").focus();
    };
    reader.onerror = function () { say(I18n.t("settings.badFile"), true); };
    reader.readAsText(file);
  }

  function confirmImport() {
    if (!pending) return;
    Store.importData(pending);
    pending = null;
    $("import-confirm").hidden = true;
    say(I18n.t("settings.imported"));
    setTimeout(function () { location.reload(); }, 900);
  }

  // ---------- 打开 / 关闭 ----------
  function open() {
    lastFocus = document.activeElement;
    pending = null;
    $("import-confirm").hidden = true;
    say("");
    renderStatus();
    $("settings-modal").hidden = false;
    document.body.classList.add("has-modal");
    $("settings-close").focus();
  }

  function close() {
    $("settings-modal").hidden = true;
    document.body.classList.remove("has-modal");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function init() {
    $("open-settings").addEventListener("click", open);
    $("settings-close").addEventListener("click", close);
    $("settings-modal").addEventListener("click", function (e) { if (e.target === e.currentTarget) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("settings-modal").hidden) close();
    });

    $("sound-switch").addEventListener("click", function () {
      Sound.set(!Sound.isOn());
      renderStatus();
      Sound.play("add"); // 打开时给一点声音，让你知道它在
    });
    $("voice-exp-list").addEventListener("click", function (e) {
      var b = e.target.closest("[data-exp]"); if (!b) return;
      Chat.setExp(+b.dataset.exp);
      location.reload(); // 换实验后刷新页面：每个实验都要从干净的页面开始（尤其是音频会话）
    });
    $("debug-switch").addEventListener("click", function () {
      debugOn = !debugOn;
      try { localStorage.setItem(DEBUG_KEY, debugOn ? "on" : "off"); } catch (e) {}
      renderStatus();
      document.dispatchEvent(new CustomEvent("debug:change", { detail: { on: debugOn } })); // 语音状态日志跟着显示 / 隐藏
    });
    $("layout-btns").addEventListener("click", function (e) {
      var b = e.target.closest("[data-layout]"); if (!b) return;
      Layout.set(b.dataset.layout); renderLayout();
    });
    document.addEventListener("layout:change", renderLayout);
    $("export-backup").addEventListener("click", exportBackup);
    $("export-text").addEventListener("click", exportText);
    $("import-backup").addEventListener("click", chooseFile);
    $("import-file").addEventListener("change", function () { readFile(this.files && this.files[0]); });
    $("import-yes").addEventListener("click", confirmImport);
    // 角色图片：导入自己画的 PNG（me_stand.png、cat_sit.png……），存在这个浏览器里
    $("chars-import").addEventListener("click", function () { $("chars-file").value = ""; $("chars-file").click(); });
    $("chars-file").addEventListener("change", function () {
      if (!this.files || !this.files.length) return;
      Characters.importFiles(this.files, function (r) {
        if (r.full) { say(I18n.t("settings.charsFull"), true); return; }
        var text = I18n.t("settings.charsDone", { n: r.ok });
        if (r.skipped.length) text += " " + I18n.t("settings.charsSkipped", { list: r.skipped.join("、") });
        say(text, !r.ok);
        if (r.ok) setTimeout(function () { location.reload(); }, 1400);
      });
    });
    $("chars-reset").addEventListener("click", function () {
      Characters.reset(); say(I18n.t("settings.charsResetDone"));
      setTimeout(function () { location.reload(); }, 900);
    });
    $("import-no").addEventListener("click", function () {
      pending = null;
      $("import-confirm").hidden = true;
      say(I18n.t("settings.importCancelled"));
    });
  }

  // 从别处（比如「没有记录」的提示）直接打开设置并选备份文件
  function importPrompt() { open(); chooseFile(); }

  return { init: init, open: open, importPrompt: importPrompt, isDebug: function () { return debugOn; } };
})();

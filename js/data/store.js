/*
 * 数据层：所有数据存在浏览器 localStorage。
 *
 * 结构（版本 2）：
 * {
 *   version: 2,
 *   days: {
 *     "2026-11-25": { tasks: [{ id, text, createdAt, doneAt }], chat?: [], endedAt?: 时间戳 }   // doneAt 为 null 表示未完成
 *   },
 *   island: { spent, rain, objs: [{ type, x, z, rot, date }], trees: { 任务id: "x,z" } },   // 金币、商店买的东西、树的位置
 *   meta: { importedV1, importedIsland3d, lastBackupAt }
 * }
 *
 * 版本号和升级：
 * - 数据里的 version 记着它是哪一版的格式；SCHEMA 是现在这份代码认识的最新一版。
 * - 打开网页时，如果存档比 SCHEMA 旧，就按 MIGRATIONS 里的步骤一版一版升上去。
 * - 升级之前，先把整份旧存档原样另存到 "winslog-island-v1.before-migrate-v<旧版本>"，
 *   这样不管升级出什么问题，原来的数据都还在。
 * - 以后改存档格式：SCHEMA 加 1，在 MIGRATIONS 里加一个“从旧版本升到下一版”的函数，别的不用动。
 * - 存档比 SCHEMA 还新（比如在新版网页里存的、又拿回旧版用）：不改动、不降级，原样保留。
 */
var Store = (function () {
  var KEY = "winslog-island-v1";
  var OLD_KEY = "wins-log-v1"; // 旧版单文件原型 wins-log.html 的数据

  function pad(n) { return String(n).padStart(2, "0"); }

  function dayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  var SCHEMA = 2;

  function fresh() {
    return { version: SCHEMA, days: {}, meta: {} };
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }

  // 整理一项任务：只补缺的、纠正类型，不删文字、不改时间
  function cleanTask(t) {
    if (!t || typeof t !== "object" || t.text == null || t.text === "") return null;
    t.id = t.id ? String(t.id) : newId();
    t.text = String(t.text);
    t.createdAt = num(t.createdAt) || num(t.doneAt) || Date.now();
    t.doneAt = num(t.doneAt) || (t.doneAt ? t.createdAt : null);
    return t;
  }

  // 每一项：from 版本 → from + 1 版本。只做“整理 / 补全”，不删记录。
  var MIGRATIONS = {
    // 1 → 2：把早期随用随加的字段整理成固定结构（每天都有 tasks 数组、每个任务字段齐全，小岛数据 island 固定存在）
    1: function (d) {
      if (!d.meta || typeof d.meta !== "object") d.meta = {};
      Object.keys(d.days).forEach(function (k) {
        var day = d.days[k];
        if (!day || typeof day !== "object") { d.days[k] = { tasks: [] }; return; }
        day.tasks = (Array.isArray(day.tasks) ? day.tasks : []).map(cleanTask).filter(Boolean);
        if (day.chat && !Array.isArray(day.chat)) delete day.chat;
        if (day.endedAt != null && num(day.endedAt) === null) delete day.endedAt;
      });
      normalizeIsland(d);
      return d;
    }
  };

  function normalizeIsland(d) {
    if (!d.island || typeof d.island !== "object") d.island = {};
    var s = d.island;
    if (typeof s.spent === "string" && isFinite(Number(s.spent))) s.spent = Number(s.spent);
    if (typeof s.spent !== "number") s.spent = 0;
    if (typeof s.rain !== "boolean") s.rain = true;
    if (!Array.isArray(s.objs)) s.objs = [];
    if (!s.trees || typeof s.trees !== "object") s.trees = {};
    return s;
  }

  // 把一份存档升到最新版。返回 { data, from, migrated }。
  // backup=true 时，真的要升级之前先把原样的整份另存一份。
  function migrate(d, backup) {
    var from = typeof d.version === "number" ? d.version : 1;
    if (from >= SCHEMA) return { data: d, from: from, migrated: false };
    if (backup) {
      try {
        var bk = KEY + ".before-migrate-v" + from;
        if (localStorage.getItem(bk) === null) localStorage.setItem(bk, JSON.stringify(d));
      } catch (e) { /* 存不了备份也不能让页面打不开 */ }
    }
    for (var v = from; v < SCHEMA; v++) d = MIGRATIONS[v](d);
    d.version = SCHEMA;
    return { data: d, from: from, migrated: true };
  }

  // 记录永久保存、按日期存，任何时候都不自动删除。
  // 读不出来的旧数据也不会被盖掉：先原样留一份，再另起一份新的。
  var rawLoaded = null;
  try { rawLoaded = localStorage.getItem(KEY); } catch (e) { /* 读不到就当没有 */ }
  var hadStorage = rawLoaded !== null; // 这个浏览器里以前有没有存过
  var data = read(KEY);
  if (!data || typeof data !== "object" || !data.days) {
    if (rawLoaded) { try { localStorage.setItem(KEY + ".unreadable-" + Date.now(), rawLoaded); } catch (e) {} }
    data = fresh();
  }
  if (!data.meta) data.meta = {};
  var migration = migrate(data, true); // 旧版存档先备份再升级
  data = migration.data;
  if (migration.migrated) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 存不了就算了，页面照常用 */ }
  }

  function getDay(key) {
    key = key || dayKey();
    if (!data.days[key]) data.days[key] = { tasks: [] };
    return data.days[key];
  }

  // 把旧版记录导入成“已完成”的任务（只导入一次，不会重复）
  function importV1() {
    if (data.meta.importedV1) return 0;
    var old = read(OLD_KEY);
    var added = 0;
    if (old && typeof old === "object") {
      Object.keys(old).forEach(function (k) {
        if (!Array.isArray(old[k])) return;
        var day = getDay(k);
        var seen = {};
        day.tasks.forEach(function (t) { seen[t.id] = true; });
        old[k].forEach(function (item) {
          if (!item || !item.text || seen[item.id]) return;
          day.tasks.push({
            id: item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            text: String(item.text),
            createdAt: item.t || Date.now(),
            doneAt: item.t || Date.now()
          });
          added++;
        });
      });
    }
    data.meta.importedV1 = true;
    save();
    return added;
  }

  function find(id) {
    var tasks = getDay().tasks;
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }

  return {
    SCHEMA: SCHEMA,
    version: function () { return data.version; },
    migratedFrom: migration.migrated ? migration.from : null, // 这次打开时从哪一版升上来的（没升级过是 null）
    dayKey: dayKey,
    getDay: getDay,
    save: save,
    importV1: importV1,

    // 今天还没完成的任务（按添加顺序）
    todosOf: function (key) {
      return getDay(key).tasks.filter(function (t) { return !t.doneAt; });
    },
    // 今天已完成的（按完成时间排序）
    winsOf: function (key) {
      return getDay(key).tasks
        .filter(function (t) { return t.doneAt; })
        .sort(function (a, b) { return a.doneAt - b.doneAt; });
    },

    // 所有日子里完成过的事（按完成时间排序），小岛用它来决定长出什么
    allWins: function () {
      var all = [];
      Object.keys(data.days).forEach(function (k) {
        data.days[k].tasks.forEach(function (t) { if (t.doneAt) all.push(t); });
      });
      return all.sort(function (a, b) { return a.doneAt - b.doneAt; });
    },

    addTask: function (text) {
      var task = { id: newId(), text: String(text).slice(0, 200), createdAt: Date.now(), doneAt: null };
      getDay().tasks.push(task);
      save();
      return task;
    },
    completeTask: function (id) {
      var t = find(id);
      if (t && !t.doneAt) { t.doneAt = Date.now(); save(); }
      return t;
    },
    uncompleteTask: function (id) {
      var t = find(id);
      if (t) { t.doneAt = null; save(); }
      return t;
    },
    // ---------- 备份 ----------
    exportData: function () {
      return { app: "wins-log-island", version: SCHEMA, exportedAt: new Date().toISOString(), data: data };
    },
    // 看看一个文件是不是我们的备份；是的话返回里面有多少天、多少件 Wins
    inspectBackup: function (obj) {
      if (!obj || obj.app !== "wins-log-island" || !obj.data || typeof obj.data.days !== "object") return null;
      var days = Object.keys(obj.data.days), wins = 0;
      days.forEach(function (k) {
        var d = obj.data.days[k];
        if (d && Array.isArray(d.tasks)) d.tasks.forEach(function (t) { if (t && t.doneAt) wins++; });
      });
      return { days: days.length, wins: wins };
    },
    importData: function (obj) {
      // 导入会替换现在的记录：替换之前先把现在的整份留一份，万一导错了还能找回来
      try { localStorage.setItem(KEY + ".before-import", JSON.stringify(data)); } catch (e) {}
      data = obj.data;
      if (!data.meta) data.meta = {};
      data = migrate(data, false).data; // 旧版备份文件：导入时升到最新格式（现在的整份已经另存过了）
      data.meta.importedV1 = true; // 导入后不再从旧版原型重复导入
      save();
    },
    // 用户摘要、今天的电量（低 / 中 / 高）等给 AI 用的小信息，放在 meta 里；现在只留字段，还没有界面去改
    userMeta: function () {
      return { summary: data.meta.userSummary || "", energy: data.meta.energy || null };
    },
    markBackup: function () {
      data.meta.lastBackupAt = Date.now();
      save();
    },
    lastBackupAt: function () { return data.meta.lastBackupAt || null; },
    // ---------- 历史：按天查（只读，不会新建空的一天） ----------
    hadStorage: hadStorage,
    dayKeys: dayKeys,                       // 有记录的日期，从早到晚
    hasData: function () { return dayKeys().length > 0; },
    dayInfo: dayInfo,                       // { key, total, done, wins:[已完成，按时间], open:[没做完], endedAt }
    allDays: function () {
      return Object.keys(data.days).sort().map(function (k) { return { key: k, tasks: data.days[k].tasks || [] }; });
    },

    // 今天和小助手的聊天记录（只保留最近 60 条）
    getChat: function () {
      var day = getDay();
      if (!day.chat) day.chat = [];
      return day.chat;
    },
    saveChat: function (list) {
      getDay().chat = list.slice(-60);
      save();
    },

    // 记下“结束今天”的时间（可以重复打印，以最后一次为准）
    markEnded: function () {
      getDay().endedAt = Date.now();
      save();
    },
    removeTask: function (id) {
      var day = getDay();
      day.tasks = day.tasks.filter(function (t) { return t.id !== id; });
      save();
    },

    // ---------- 3D 小岛 ----------
    // island: { spent, rain, objs:[{type,x,z,rot,date}], trees:{taskId:"x,z"} }
    // 金币 = 60 + 每件完成的事 10 枚 − 商店里花掉的
    island: island,
    coins: function () {
      var n = 0;
      Object.keys(data.days).forEach(function (k) {
        data.days[k].tasks.forEach(function (t) { if (t.doneAt) n++; });
      });
      return 60 + n * 10 - (island().spent || 0);
    },
    importIsland3d: importIsland3d
  };

  function dayKeys() {
    return Object.keys(data.days).filter(function (k) { return data.days[k] && data.days[k].tasks && data.days[k].tasks.length; }).sort();
  }
  function dayInfo(key) {
    var d = data.days[key], tasks = (d && d.tasks) || [];
    var wins = tasks.filter(function (t) { return t.doneAt; }).sort(function (a, b) { return a.doneAt - b.doneAt; });
    return { key: key, total: tasks.length, done: wins.length, wins: wins, open: tasks.filter(function (t) { return !t.doneAt; }), endedAt: (d && d.endedAt) || null };
  }

  function island() { return normalizeIsland(data); }

  // 导入 3D 原型（Desktop/index.html）的存档：做过的事、买过的东西（只导入一次）
  // prices：商店价格表，用来算出原型里花掉了多少金币
  function importIsland3d(prices) {
    if (data.meta.importedIsland3d) return 0;
    var old = read("winsIsland3d.v2");
    var s = island(), added = 0;
    if (old && typeof old === "object") {
      var SAMPLE = ["写 300 字论文 draft", "打开 Google Scholar 找三篇文献", "出门晒十分钟太阳"];
      (old.tasks || []).forEach(function (t) {
        if (!t || !t.text) return;
        if (!t.done && SAMPLE.indexOf(t.text) >= 0) return; // 原型自带的示例任务
        var key = t.done && /^\d{4}-\d\d-\d\d$/.test(t.doneDate || "") ? t.doneDate : dayKey();
        var stamp = new Date(key + "T12:00:00").getTime();
        getDay(key).tasks.push({ id: newId(), text: String(t.text).slice(0, 200), createdAt: stamp, doneAt: t.done ? stamp : null });
        added++;
      });
      (old.objs || []).forEach(function (o) {
        if (!o || o.sample || o.type === "tree" || !prices[o.type]) return;
        var p = String(o.key || "").split(",").map(Number);
        s.objs.push({ type: o.type, x: p[0] || 0, z: p[1] || 0, rot: o.rot || 0, date: o.date || dayKey() });
        s.spent += prices[o.type];
        added++;
      });
      if (typeof old.rain === "boolean") s.rain = old.rain;
    }
    data.meta.importedIsland3d = true;
    save();
    return added;
  }
})();

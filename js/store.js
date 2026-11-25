/*
 * 数据层：所有数据存在浏览器 localStorage。
 *
 * 结构：
 * {
 *   version: 1,
 *   days: {
 *     "2026-11-25": { tasks: [{ id, text, createdAt, doneAt }] }   // doneAt 为 null 表示未完成
 *   },
 *   meta: { importedV1: true }
 * }
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

  function fresh() {
    return { version: 1, days: {}, meta: {} };
  }

  var data = read(KEY);
  if (!data || typeof data !== "object" || !data.days) data = fresh();
  if (!data.meta) data.meta = {};

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

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function find(id) {
    var tasks = getDay().tasks;
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }

  return {
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
    removeTask: function (id) {
      var day = getDay();
      day.tasks = day.tasks.filter(function (t) { return t.id !== id; });
      save();
    }
  };
})();

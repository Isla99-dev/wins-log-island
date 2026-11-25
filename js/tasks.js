/*
 * 今日任务（第 2 步）
 * - 手动添加任务
 * - 点击完成：手写感划线 → 星星弹出 → 移到「今天的 Wins」
 * - 写错了可以删除；完成错了可以在 Wins 里撤回
 */
var Tasks = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var SVGNS = "http://www.w3.org/2000/svg";
  var STAR = '<svg viewBox="0 0 7 7" aria-hidden="true"><use href="#px-star"/></svg>';
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var todoEl, winsEl;

  function pad(n) { return String(n).padStart(2, "0"); }

  // 通知其他模块（比如小岛）：任务有变化
  function announce(type, id) {
    document.dispatchEvent(new CustomEvent("wins:change", { detail: { type: type, id: id } }));
  }
  function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  // ---------- 渲染 ----------
  function renderTodos() {
    var todos = Store.todosOf();
    todoEl.innerHTML = "";
    todos.forEach(function (t) { todoEl.appendChild(todoItem(t)); });
    $("todo-empty").hidden = todos.length > 0;
  }

  function todoItem(t) {
    var li = document.createElement("li");
    li.dataset.id = t.id;
    li.innerHTML =
      '<button class="check" type="button"></button>' +
      '<span class="text"></span>' +
      '<button class="mini-btn split" type="button">✂</button>' +
      '<button class="mini-btn del" type="button">×</button>';
    li.querySelector(".text").textContent = t.text;
    li.querySelector(".check").setAttribute("aria-label", I18n.t("tasks.completeAria", { text: t.text }));
    var split = li.querySelector(".split");
    split.setAttribute("aria-label", I18n.t("tasks.splitAria"));
    split.title = I18n.t("tasks.splitTitle");
    li.querySelector(".del").setAttribute("aria-label", I18n.t("tasks.deleteAria"));
    return li;
  }

  function renderWins(newIds) {
    if (newIds && !Array.isArray(newIds)) newIds = [newIds];
    var wins = Store.winsOf();
    winsEl.innerHTML = "";
    wins.forEach(function (w) {
      var li = document.createElement("li");
      li.dataset.id = w.id;
      if (newIds && newIds.indexOf(w.id) >= 0) li.className = "is-new";
      li.innerHTML = STAR + '<span class="text"></span><span class="time"></span>' +
        '<button class="mini-btn undo" type="button">↩</button>';
      li.querySelector(".undo").setAttribute("aria-label", I18n.t("wins.undoAria"));
      li.querySelector(".text").textContent = w.text;
      li.querySelector(".time").textContent = hhmm(w.doneAt);
      winsEl.appendChild(li);
    });
    var badge = $("win-count");
    badge.textContent = wins.length;
    $("wins-empty").hidden = wins.length > 0;
    if (newIds && newIds.length) {
      var wrap = badge.parentNode;
      wrap.classList.remove("bump");
      void wrap.offsetWidth; // 让动画可以重复播放
      wrap.classList.add("bump");
    }
  }

  // ---------- 手写感划线 ----------
  // 按文字实际占的每一行，画一条略微抖动的线
  function drawStrike(li) {
    var textEl = li.querySelector(".text");
    var range = document.createRange();
    range.selectNodeContents(textEl);
    var rects = range.getClientRects();
    var box = li.getBoundingClientRect();

    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "strike");
    svg.setAttribute("width", box.width);
    svg.setAttribute("height", box.height);

    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (r.width < 2) continue;
      var x0 = r.left - box.left - 3;
      var x1 = r.right - box.left + 3;
      var y = r.top - box.top + r.height * 0.56;
      var d = "M" + x0.toFixed(1) + " " + (y + 1).toFixed(1);
      var steps = Math.max(2, Math.round((x1 - x0) / 16));
      for (var s = 1; s <= steps; s++) {
        var x = x0 + (x1 - x0) * s / steps;
        var cx = x - (x1 - x0) / steps / 2;
        var jitter = function () { return (Math.random() - 0.5) * 3; };
        d += " Q" + cx.toFixed(1) + " " + (y + jitter()).toFixed(1) + " " + x.toFixed(1) + " " + (y + jitter() * 0.6 - s * 0.15).toFixed(1);
      }
      var path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    li.appendChild(svg); // 放进页面后才能量出线的长度

    var paths = svg.querySelectorAll("path");
    var delay = 0;
    paths.forEach(function (p) {
      var len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      var dur = Math.min(520, 160 + len * 1.4);
      p.style.animation = "strike-draw " + dur + "ms cubic-bezier(.4,.1,.3,1) " + delay + "ms forwards";
      delay += dur * 0.85;
    });
    return delay;
  }

  // ---------- 星星弹出 ----------
  function burst(li) {
    var check = li.querySelector(".check");
    var cb = check.getBoundingClientRect();
    var box = li.getBoundingClientRect();
    var cx = cb.left - box.left + cb.width / 2;
    var cy = cb.top - box.top + cb.height / 2;
    var dirs = [[-14, -20], [6, -26], [22, -12], [-20, 4], [18, 10]];
    dirs.forEach(function (d, i) {
      var s = document.createElement("span");
      s.className = "spark" + (i % 2 ? " spark--small" : "");
      s.innerHTML = STAR;
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      s.style.setProperty("--dx", d[0] + "px");
      s.style.setProperty("--dy", d[1] + "px");
      s.style.animationDelay = (i * 40) + "ms";
      li.appendChild(s);
    });
  }

  // ---------- 动作 ----------
  function complete(li) {
    if (li.classList.contains("is-done")) return;
    var id = li.dataset.id;
    Store.completeTask(id); // 先存，动画中途关掉页面也不会丢
    announce("complete", id);
    Sound.play("done");

    if (reduceMotion) { renderTodos(); renderWins(id); return; }

    li.classList.add("is-done");
    burst(li);
    var strikeTime = drawStrike(li);

    // 划完线停一下，再收起来，移到 Wins
    setTimeout(function () {
      li.style.height = li.offsetHeight + "px";
      void li.offsetHeight;
      li.classList.add("is-leaving");
      setTimeout(function () {
        renderTodos();
        renderWins(id);
      }, 320);
    }, strikeTime + 380);
  }

  function remove(li) {
    var id = li.dataset.id;
    Store.removeTask(id);
    announce("remove", id);
    li.style.height = li.offsetHeight + "px";
    void li.offsetHeight;
    li.classList.add("is-leaving");
    setTimeout(renderTodos, reduceMotion ? 0 : 300);
  }

  function undo(li) {
    Store.uncompleteTask(li.dataset.id);
    announce("undo", li.dataset.id);
    Sound.play("undo");
    renderWins();
    renderTodos();
  }

  // ---------- 给小助手用的批量操作 ----------
  // 把几件想做的事加进今日任务
  function addMany(texts) {
    var ids = texts.map(function (t) { return Store.addTask(t).id; });
    renderTodos();
    ids.forEach(function (id) {
      var li = todoEl.querySelector('li[data-id="' + id + '"]');
      if (li) li.classList.add("is-new");
    });
    ids.forEach(function (id) { announce("add", id); });
    Sound.play("add");
    return ids.length;
  }

  // 比较两件事是不是同一件：忽略空格、标点、“了”，以及英文里常见的 the / my / a
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/\b(the|my|a|an)\b/g, "")
      .replace(/[\s，,。.！!了'"]/g, "");
  }

  // 记下几件做完的事：和已有任务意思一样的就直接完成它，没有的就新建再完成
  function recordDone(texts) {
    var ids = [];
    texts.forEach(function (text) {
      var n = norm(text), match = null;
      Store.todosOf().forEach(function (t) {
        var m = norm(t.text);
        if (!match && m.length >= 2 && (m.indexOf(n) >= 0 || n.indexOf(m) >= 0)) match = t;
      });
      var task = match || Store.addTask(text);
      Store.completeTask(task.id);
      ids.push(task.id);
    });
    renderTodos();
    renderWins(ids);
    ids.forEach(function (id) { announce("complete", id); });
    Sound.play("done");
    return ids.length;
  }

  // 把一件大任务换成几个小步骤；今天没有这件任务就直接加进去。返回是否真的替换了
  function replaceWith(source, steps) {
    var n = norm(source), match = null;
    Store.todosOf().forEach(function (t) {
      if (!match && norm(t.text) === n) match = t;
    });
    if (match) {
      Store.removeTask(match.id);
      announce("remove", match.id);
    }
    addMany(steps);
    return !!match;
  }

  function init() {
    todoEl = $("todo");
    winsEl = $("wins");

    $("task-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("task-input");
      var text = input.value.trim();
      if (!text) return;
      var task = Store.addTask(text);
      var li = todoItem(task);
      li.classList.add("is-new");
      todoEl.appendChild(li);
      $("todo-empty").hidden = true;
      input.value = "";
      announce("add", task.id);
      Sound.play("add");
    });

    // 点一整行就算完成；删除按钮单独处理
    todoEl.addEventListener("click", function (e) {
      var li = e.target.closest("li");
      if (!li) return;
      if (e.target.closest(".del")) remove(li);
      else if (e.target.closest(".split")) {
        var text = li.querySelector(".text").textContent;
        document.dispatchEvent(new CustomEvent("wins:ask", { detail: { text: I18n.t("tasks.splitRequest", { text: text }) } }));
      }
      else complete(li);
    });

    winsEl.addEventListener("click", function (e) {
      if (e.target.closest(".undo")) undo(e.target.closest("li"));
    });

    renderTodos();
    renderWins();
  }

  return {
    init: init,
    addMany: addMany,
    recordDone: recordDone,
    replaceWith: replaceWith,
    todayTexts: function () {
      return {
        todos: Store.todosOf().map(function (t) { return t.text; }),
        wins: Store.winsOf().map(function (t) { return t.text; })
      };
    }
  };
})();

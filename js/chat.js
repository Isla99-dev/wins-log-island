/*
 * 小岛助手聊天面板（第 5 步）
 * - 文字或语音输入
 * - 助手回复里可以带一张“清单卡片”：
 *     想做的事 → 「种到田里」加进今日任务
 *     做完的事 → 「全部划掉」记为已完成
 * - 今天的聊天记录存在浏览器里
 * 助手怎么回答由 js/ai.js 决定，这里只管界面。
 */
var Chat = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var log, input, history;

  function save() { Store.saveChat(history); }

  function scrollDown() { log.scrollTop = log.scrollHeight; }

  // ---------- 画一条消息 ----------
  function renderMessage(msg, index) {
    var wrap = document.createElement("div");
    wrap.className = "msg " + (msg.role === "user" ? "msg--me" : "msg--ai");
    var bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    // 开场白跟着当前语言显示；其他消息保持当时说的样子
    // （第 8 步之前存下的开场白没有 greeting 标记，按开头文字认出来）
    var isGreeting = msg.greeting || (index === 0 && msg.role === "assistant" && /^嗨，我是住在岛上的小助手/.test(msg.text));
    bubble.textContent = isGreeting ? I18n.t("chat.greeting") : msg.text;
    wrap.appendChild(bubble);
    if (msg.plan) wrap.appendChild(renderPlan(msg, index));
    if (msg.quickReplies && msg.quickReplies.length) {
      var qr = document.createElement("div");
      qr.className = "quick-replies";
      msg.quickReplies.forEach(function (text) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = text;
        b.addEventListener("click", function () { send(text); });
        qr.appendChild(b);
      });
      wrap.appendChild(qr);
    }
    log.appendChild(wrap);
    return wrap;
  }

  // 只有最新一条助手消息的快捷回答可以点，旧的收起来
  function retireQuickReplies() {
    log.querySelectorAll(".quick-replies").forEach(function (q) { q.remove(); });
  }

  function renderPlan(msg, index) {
    var plan = msg.plan;
    var card = document.createElement("div");
    card.className = "plan plan--" + plan.mode + (plan.applied ? " is-applied" : "");
    card.dataset.index = index;

    var ul = document.createElement("ul");
    plan.items.forEach(function (item, i) {
      var li = document.createElement("li");
      li.innerHTML = '<label><input type="checkbox"><span class="plan-text"></span></label>';
      var box = li.querySelector("input");
      box.checked = item.checked !== false;
      box.disabled = !!plan.applied;
      box.dataset.i = i;
      li.querySelector(".plan-text").textContent = item.text;
      if (plan.applied && plan.mode === "done" && item.checked !== false) li.classList.add("is-struck");
      ul.appendChild(li);
    });
    card.appendChild(ul);

    var foot = document.createElement("div");
    foot.className = "plan-foot";
    if (plan.applied) {
      foot.innerHTML = '<span class="plan-done"></span>';
      var doneKey = {
        todo: "plan.todoDone",
        done: "plan.doneDone",
        split: plan.replaced ? "plan.splitReplaced" : "plan.splitAdded"
      }[plan.mode];
      foot.firstChild.textContent = I18n.t(doneKey, { n: plan.appliedCount });
    } else {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pixel-btn" + (plan.mode === "done" ? " pixel-btn--warm" : "");
      btn.textContent = I18n.t("plan." + plan.mode);
      btn.addEventListener("click", function () { applyPlan(card, index); });
      foot.appendChild(btn);
    }
    card.appendChild(foot);

    // 勾选变化记下来
    ul.addEventListener("change", function (e) {
      var i = e.target.dataset.i;
      if (i == null) return;
      history[index].plan.items[i].checked = e.target.checked;
      save();
    });
    return card;
  }

  function renderAll() {
    log.innerHTML = "";
    history.forEach(renderMessage);
    // 刷新后只保留最后一条的快捷回答
    var all = log.querySelectorAll(".quick-replies");
    for (var i = 0; i < all.length - 1; i++) all[i].remove();
    if (all.length && history[history.length - 1].role !== "assistant") all[all.length - 1].remove();
    scrollDown();
  }

  // ---------- 执行清单 ----------
  function applyPlan(card, index) {
    var plan = history[index].plan;
    if (plan.applied) return;
    var chosen = plan.items.filter(function (it) { return it.checked !== false; });
    if (!chosen.length) { hint(I18n.t("chat.pickOne")); return; }
    var texts = chosen.map(function (it) { return it.text; });

    plan.applied = true;
    plan.appliedCount = texts.length;
    save();

    if (plan.mode === "todo") {
      Tasks.addMany(texts);
      replaceCard(card, index);
      return;
    }

    if (plan.mode === "split") {
      // 今日任务里有这件大任务，就换成小步骤；没有就直接加进去
      plan.replaced = Tasks.replaceWith(plan.source, texts);
      save();
      replaceCard(card, index);
      return;
    }

    // 做完的事：在卡片里一条一条划掉，然后记到 Wins
    card.querySelectorAll("input").forEach(function (b) { b.disabled = true; });
    var btn = card.querySelector(".plan-foot button");
    if (btn) btn.disabled = true;
    var lis = Array.prototype.filter.call(card.querySelectorAll("li"), function (li) {
      return li.querySelector("input").checked;
    });
    lis.forEach(function (li, i) {
      setTimeout(function () { li.classList.add("is-struck"); }, i * 260);
    });
    setTimeout(function () {
      Tasks.recordDone(texts);
      replaceCard(card, index);
    }, lis.length * 260 + 450);
  }

  function replaceCard(card, index) {
    var fresh = renderPlan(history[index], index);
    card.parentNode.replaceChild(fresh, card);
  }

  // ---------- 发送 ----------
  var busy = false;

  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;
    retireQuickReplies();
    history.push({ role: "user", text: text, t: Date.now() });
    save();
    renderMessage(history[history.length - 1]);

    var typing = document.createElement("div");
    typing.className = "msg msg--ai";
    typing.innerHTML = '<div class="msg-bubble typing"><i></i><i></i><i></i></div>';
    typing.firstChild.setAttribute("aria-label", I18n.t("chat.typing"));
    log.appendChild(typing);
    scrollDown();

    var messages = history.map(function (m) { return { role: m.role, text: m.text, flow: m.flow || null }; });
    var context = Tasks.todayTexts();
    context.lang = I18n.lang();
    AI.chat(messages, context)
      .then(function (res) {
        var msg = { role: "assistant", text: res.reply, t: Date.now() };
        if (res.plan && res.plan.items && res.plan.items.length) {
          msg.plan = {
            mode: res.plan.mode,
            source: res.plan.source || null,
            items: res.plan.items.map(function (t) { return { text: t, checked: true }; })
          };
        }
        if (res.quickReplies && res.quickReplies.length) msg.quickReplies = res.quickReplies;
        if (res.flow) msg.flow = res.flow;
        return msg;
      })
      .catch(function () {
        return { role: "assistant", text: I18n.t("chat.oops"), t: Date.now() };
      })
      .then(function (msg) {
        typing.remove();
        history.push(msg);
        save();
        renderMessage(msg, history.length - 1);
        scrollDown();
        busy = false;
      });
  }

  function hint(text) {
    var el = $("chat-hint");
    el.textContent = text;
    clearTimeout(hint.timer);
    hint.timer = setTimeout(function () { el.textContent = I18n.t("chat.hint"); }, 4000);
  }

  // ---------- 语音输入 ----------
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, listening = false;

  function toggleMic() {
    var mic = $("chat-mic");
    if (!Recognition) {
      hint(I18n.t("mic.unsupported"));
      return;
    }
    if (listening) { rec.stop(); return; }

    rec = new Recognition();
    rec.lang = I18n.t("mic.lang");
    rec.interimResults = true;
    rec.continuous = false;
    var finalText = "";

    rec.onstart = function () {
      listening = true;
      mic.classList.add("is-listening");
      mic.setAttribute("aria-label", I18n.t("chat.micStop"));
      hint(I18n.t("mic.listening"));
    };
    rec.onresult = function (e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      input.value = finalText + interim;
    };
    rec.onerror = function (e) {
      var key = {
        "not-allowed": "mic.notAllowed",
        "service-not-allowed": "mic.serviceNotAllowed",
        "no-speech": "mic.noSpeech",
        "network": "mic.network",
        "audio-capture": "mic.audioCapture"
      }[e.error];
      hint(I18n.t(key || "mic.other"));
    };
    rec.onend = function () {
      listening = false;
      mic.classList.remove("is-listening");
      mic.setAttribute("aria-label", I18n.t("chat.mic"));
      if (finalText.trim()) {
        input.value = "";
        send(finalText);
      }
    };
    try { rec.start(); } catch (err) { hint(I18n.t("mic.startFailed")); }
  }

  // ---------- 初始化 ----------
  function init() {
    log = $("chat-log");
    input = $("chat-input");
    history = Store.getChat();
    if (!history.length) {
      history.push({ role: "assistant", greeting: true, text: I18n.t("chat.greeting"), t: Date.now() });
      save();
    }
    renderAll();

    $("ai-mode").hidden = !AI.isMock();

    $("chat-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value;
      input.value = "";
      send(text);
    });

    $("chat-mic").addEventListener("click", toggleMic);

    // 任务旁边的 ✂ 按钮：请助手把这件事拆小
    document.addEventListener("wins:ask", function (e) {
      if (!e.detail || !e.detail.text) return;
      document.querySelector(".helper").scrollIntoView({ behavior: "smooth", block: "nearest" });
      send(e.detail.text);
    });

    $("chat-chips").addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      var kind = chip.dataset.chip;
      var fill = I18n.t("chip." + kind + "Fill");
      // 「有点不想动」直接发出去；其他的放进输入框，等你接着写
      if (kind === "stuck") { send(fill); return; }
      input.value = fill;
      input.focus();
      input.setSelectionRange(fill.length, fill.length);
    });
  }

  return { init: init };
})();

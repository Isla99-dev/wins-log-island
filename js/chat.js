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
  // iPhone 上的 Chrome 用的是 WebKit 内核，语音识别很娇气。这里的做法：
  //  1. 每次点按都新建一个 SpeechRecognition，结束就丢掉（onend 里清理），不复用旧的
  //  2. start() 在点按的事件里同步调用，前面没有 await / setTimeout
  //  3. 正在启动 / 识别 / 收尾时不会再 start()；start() 抛 InvalidStateError 也接住
  //  4. 开始前先把页面的音效关掉（Sound.hold），结束后放开（Sound.release）
  //  5. 每一次 start / onstart / onresult / onerror / onend 都写在页面的小提示里，方便在手机上看原因
  //  6. 连续失败 2 次，自动换成「用输入法的语音」的提示
  // 现在是「点一下开始，再点一下结束」；停下说话它也会自己结束。
  var voice = { rec: null, phase: "idle", n: 0, fails: 0, started: false, failed: false, dictation: false, watch: 0, stopWatch: 0, lines: [] };
  var HARD_ERRORS = { "not-allowed": 1, "service-not-allowed": 1, "audio-capture": 1, "network": 1, "language-not-supported": 1, "bad-grammar": 1 }; // 这些算失败；no-speech、aborted 不算

  function getRecognition() { return window.SpeechRecognition || window.webkitSpeechRecognition; } // 点的时候再取，不在加载时取

  function vlog(ev, newAttempt) { // 小提示：最近 3 次的经过，一次一行
    if (newAttempt || !voice.lines.length) voice.lines.push("#" + voice.n + " ");
    voice.lines[voice.lines.length - 1] += (/ $/.test(voice.lines[voice.lines.length - 1]) ? "" : " → ") + ev;
    if (voice.lines.length > 3) voice.lines.shift();
    var el = $("chat-voice");
    if (el) { el.textContent = I18n.t("mic.status") + "\n" + voice.lines.join("\n") + (voice.fails ? "\n" + I18n.t("mic.failCount", { n: voice.fails }) : ""); el.hidden = false; }
  }

  function setMicUI(on) {
    var mic = $("chat-mic");
    mic.classList.toggle("is-listening", on);
    mic.setAttribute("aria-label", I18n.t(on ? "chat.micStop" : "chat.mic"));
  }

  function showDictation(on) {
    voice.dictation = on;
    $("chat-dictation").hidden = !on;
    $("chat-form").classList.toggle("is-dictation", on);
    input.placeholder = I18n.t(on ? "chat.dictationPlaceholder" : "chat.placeholder");
    if (on) { try { input.focus(); } catch (e) { /* 不是点按触发的，弹不出键盘也没关系 */ } }
  }

  function countFail() {
    voice.fails++;
    vlog("失败 " + voice.fails);
    if (voice.fails >= 2 && !voice.dictation) showDictation(true);
  }

  // 一次识别彻底结束：丢掉这个实例，放开音效，判断算成功还是失败
  function finish(rec, finalText, noCount) {
    if (voice.rec !== rec) return; // 已经收拾过了（或者是旧实例迟到的事件）
    clearTimeout(voice.watch); clearTimeout(voice.stopWatch);
    rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
    voice.rec = null; voice.phase = "idle";
    setMicUI(false);
    Sound.release();
    var text = (finalText || "").trim();
    if (text) {
      voice.fails = 0;
      if (voice.dictation) showDictation(false);
      if (busy) { // 助手还在回上一句：send() 会直接忽略，别把说的话弄丢，留在输入框里
        input.value = text; vlog("听到了，助手还在回复，文字留在输入框"); hint(I18n.t("mic.busy"));
      } else { vlog("听到了，发送"); input.value = ""; send(text); }
    } else if (!noCount && (voice.failed || !voice.started)) {
      countFail();
    }
  }

  function abortRec(rec) { try { rec.abort(); } catch (e) { /* 已经停了 */ } }
  function forceEnd(rec) { // abort() 之后也可能迟迟没有 onend：过一会儿强行收拾
    clearTimeout(voice.stopWatch);
    voice.stopWatch = setTimeout(function () { if (voice.rec === rec) { vlog("3 秒没有 onend，强行结束"); finish(rec, rec.__text); } }, 3000);
  }

  function stopListening() {
    var rec = voice.rec; if (!rec) return;
    voice.phase = "stopping"; vlog("stop()");
    try { rec.stop(); } catch (e) { vlog(e.name); }
    clearTimeout(voice.stopWatch);
    voice.stopWatch = setTimeout(function () { // stop() 后迟迟没有 onend（iOS 上会发生）：强行收拾，别卡在「还没结束」
      if (voice.rec === rec) { vlog("3 秒没有 onend，abort()"); abortRec(rec); finish(rec, rec.__text); }
    }, 3000);
  }

  function startListening() {
    var Recognition = getRecognition();
    if (!Recognition) { hint(I18n.t("mic.unsupported")); showDictation(true); return; }
    voice.n++; voice.started = false; voice.failed = false;
    var finalText = "", rec;
    try { rec = new Recognition(); } catch (err) { vlog("new " + err.name, true); countFail(); hint(I18n.t("mic.startFailed")); return; }
    voice.rec = rec; voice.phase = "starting";
    rec.lang = I18n.t("mic.lang"); rec.interimResults = true; rec.continuous = false;

    rec.onstart = function () {
      if (voice.rec !== rec) return;
      clearTimeout(voice.watch);
      voice.phase = "listening"; voice.started = true; vlog("onstart");
      setMicUI(true); hint(I18n.t("mic.listening"));
    };
    rec.onresult = function (e) {
      if (voice.rec !== rec) return;
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      rec.__text = finalText; input.value = finalText + interim; vlog("onresult");
    };
    rec.onerror = function (e) {
      if (voice.rec !== rec) return;
      vlog("onerror: " + e.error);
      if (HARD_ERRORS[e.error] || (e.error !== "no-speech" && e.error !== "aborted")) voice.failed = true;
      var key = { "not-allowed": "mic.notAllowed", "service-not-allowed": "mic.serviceNotAllowed", "no-speech": "mic.noSpeech", "network": "mic.network", "audio-capture": "mic.audioCapture" }[e.error];
      if (e.error !== "aborted") hint(I18n.t(key || "mic.other"));
      abortRec(rec); forceEnd(rec); // 出错就 abort()，不留半死不活的会话
    };
    rec.onend = function () { if (voice.rec !== rec) return; vlog("onend"); finish(rec, finalText); };

    Sound.hold(); // 先关掉页面里的音效，让出音频会话
    try {
      rec.start(); // 就在点按的事件里同步调用
      vlog("start()", true);
    } catch (err) {
      vlog("start() 抛出 " + err.name, true);
      voice.failed = err.name !== "InvalidStateError"; // 正在识别时重复 start 不算失败
      hint(I18n.t("mic.startFailed"));
      if (err.name === "InvalidStateError") abortRec(rec);
      rec.onend = null; finish(rec, "", err.name === "InvalidStateError");
      return;
    }
    voice.watch = setTimeout(function () { // 5 秒还没 onstart：放弃这次
      if (voice.rec === rec && voice.phase === "starting") { vlog("5 秒没有 onstart，abort()"); hint(I18n.t("mic.noStart")); abortRec(rec); finish(rec, ""); }
    }, 5000);
  }

  function toggleMic() {
    if (voice.phase === "listening") { stopListening(); return; }
    if (voice.phase !== "idle") { vlog("忽略这次点按（上一次还没结束）"); hint(I18n.t("mic.wait")); return; } // 防止重复启动
    startListening();
  }

  function dropVoice() { var rec = voice.rec; if (rec) { vlog("页面切到后台，abort()"); abortRec(rec); finish(rec, ""); } }

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
    $("chat-dictation-retry").addEventListener("click", function () { voice.fails = 0; showDictation(false); vlog("重新试内置语音"); hint(I18n.t("chat.hint")); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) dropVoice(); }); // 切到别的应用：别让识别会话挂着
    window.addEventListener("pagehide", dropVoice);

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

  return { init: init, listen: toggleMic, voiceState: function () { return { phase: voice.phase, fails: voice.fails, dictation: voice.dictation, n: voice.n, lines: voice.lines.slice() }; } };
})();

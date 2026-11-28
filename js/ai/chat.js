/*
 * 小岛助手聊天面板（第 5 步）
 * - 文字或语音输入
 * - 助手回复里可以带一张“清单卡片”：
 *     想做的事 → 「种到田里」加进今日任务
 *     做完的事 → 「全部划掉」记为已完成
 * - 今天的聊天记录存在浏览器里
 * 助手怎么回答由 js/ai/ai.js 决定，这里只管界面。
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

  function hint(text, ms) {
    var el = $("chat-hint");
    el.textContent = text;
    clearTimeout(hint.timer);
    hint.timer = setTimeout(function () { el.textContent = I18n.t("chat.hint"); }, ms || 4000);
  }

  // ---------- 语音输入 ----------
  // iPhone 上的 Chrome 用的是 WebKit 内核，语音识别很娇气。最新日志：从第 2 次起 onstart 正常、说话 5～7 秒，
  // 但一次 onresult 都没有——识别启动了，麦克风却没收到声音。原因还没确定，所以做了几个「语音实验」（设置里打开
  // 「调试模式」才看得到，一个一个在手机上试），日志里会写清楚当前是哪个实验：
  //   0 基准：每次点按新建一个 SpeechRecognition（之前的做法）
  //   1 A0：页面完全不发声（Sound 不创建任何 AudioContext）——排查音频冲突用
  //   2 A ：识别期间和结束后 1 秒不发声，音效用完 suspend()，不占着音频会话（默认）
  // 所有实验共用：每个 start / stop / abort 写来源；500ms 点按防抖；start() 后 1 秒内忽略停止；
  //   onstart 后 4 秒没有任何 onresult 就自动停止、提示「语音没听到……」、把焦点放进输入框（兜底）。
  // 页面上的两个 🎙（聊天面板、抽屉）都走 micTap()，共用同一份状态和同一套识别逻辑，没有各自创建实例。
  var EXP_KEY = "winslog-voice-exp";
  var EXPERIMENTS = [
    { id: 0, tag: "0 基准",        sound: "normal", reuse: false, warm: false },
    { id: 1, tag: "1 A0 完全不发声", sound: "silent", reuse: false, warm: false },
    { id: 2, tag: "2 A 前后不发声",  sound: "soft",   reuse: false, warm: false }
  ];
  var DEFAULT_EXP = 2;
  function expId() { var v = NaN; try { v = parseInt(localStorage.getItem(EXP_KEY), 10); } catch (e) { /* 读不到就用默认 */ } return v >= 0 && v < EXPERIMENTS.length ? v : DEFAULT_EXP; }
  function exp() { return EXPERIMENTS[expId()]; }
  function setExp(id) { try { localStorage.setItem(EXP_KEY, String(id)); } catch (e) {} }

  var voice = { rec: null, sid: 0, phase: "idle", n: 0, fails: 0, started: false, failed: false, gotResult: false, dictation: false,
                watch: 0, stopWatch: 0, resultWatch: 0, lines: [], startedAt: 0, lastTap: 0, cooldownUntil: 0 };
  var DEBOUNCE = 500;     // 点按防抖：500ms 内的重复点按忽略
  var STOP_GUARD = 1000;  // start() 之后 1 秒内忽略任何「停止」请求
  var NO_RESULT_MS = 4000; // onstart 之后这么久还没有任何 onresult：当作麦克风没收到声音
  var HARD_ERRORS = { "not-allowed": 1, "service-not-allowed": 1, "audio-capture": 1, "network": 1, "language-not-supported": 1, "bad-grammar": 1 }; // 这些算失败；no-speech、aborted 不算

  function getRecognition() { return window.SpeechRecognition || window.webkitSpeechRecognition; } // 点的时候再取，不在加载时取

  function vlog(ev, newAttempt) { // 小提示：最近 3 次的经过，一次一行
    if (newAttempt || !voice.lines.length) voice.lines.push("#" + voice.n + " [" + exp().tag + "] ");
    voice.lines[voice.lines.length - 1] += (/ $/.test(voice.lines[voice.lines.length - 1]) ? "" : " → ") + ev;
    if (voice.lines.length > 3) voice.lines.shift();
    renderVoiceLog();
  }
  function renderVoiceLog() { // 日志一直在记，但只有设置里打开「调试模式」才显示
    var el = $("chat-voice"); if (!el) return;
    var dbg = !!(window.Settings && Settings.isDebug && Settings.isDebug());
    el.hidden = !dbg || !voice.lines.length;
    if (!el.hidden) el.textContent = I18n.t("mic.status") + "\n" + voice.lines.join("\n") + (voice.fails ? "\n" + I18n.t("mic.failCount", { n: voice.fails }) : "");
  }

  // 按钮状态：idle 平时 / starting 刚点下去、还没开始听（准备中…）/ listening 正在听（红色，正在听…）
  // 点下去的同一刻就变（不等 onstart），不然 iPhone 上 onstart 要等半秒，会让人以为没点上、又点一下。
  function setMicUI(state) {
    var mic = $("chat-mic"), label = $("chat-mic-label");
    mic.classList.toggle("is-starting", state === "starting");
    mic.classList.toggle("is-listening", state === "listening");
    mic.setAttribute("aria-label", I18n.t(state === "listening" ? "chat.micStop" : "chat.mic"));
    if (label) label.textContent = state === "starting" ? I18n.t("mic.labelStarting") : state === "listening" ? I18n.t("mic.labelListening") : "";
    document.dispatchEvent(new CustomEvent("voice:state", { detail: { state: state } })); // 抽屉里的说话按钮跟着变
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

  // 一次识别彻底结束：重置状态、实例设为 null，放开音效，判断算成功还是失败
  function finish(rec, finalText, noCount) {
    if (voice.rec !== rec) return; // 已经收拾过了
    clearTimeout(voice.watch); clearTimeout(voice.stopWatch); clearTimeout(voice.resultWatch);
    voice.rec = null; voice.phase = "idle"; voice.startedAt = 0;
    voice.cooldownUntil = performance.now() + 400; // 刚结束的一小会儿不接新的 start()，别和还没收尾的旧实例叠在一起
    setMicUI("idle");
    Sound.release(exp().sound === "soft" ? 1000 : 0); // 实验 A：结束后 1 秒内也不发声
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

  function abortRec(rec, source) { vlog("abort() ← " + source); try { rec.abort(); } catch (e) { /* 已经停了 */ } }
  function forceEnd(rec) { // abort() 之后也可能迟迟没有 onend：过一会儿强行收拾
    clearTimeout(voice.stopWatch);
    voice.stopWatch = setTimeout(function () { if (voice.rec === rec) { vlog("3 秒没有 onend，强行结束"); finish(rec, rec.__text); } }, 3000);
  }

  function stopListening(source) {
    var rec = voice.rec; if (!rec) return;
    voice.phase = "stopping"; vlog("stop() ← " + source); // 来源：谁、什么事件、start() 之后多少毫秒
    try { rec.stop(); } catch (e) { vlog(e.name); }
    clearTimeout(voice.stopWatch);
    voice.stopWatch = setTimeout(function () { // stop() 后迟迟没有 onend（iOS 上会发生）：强行收拾，别卡在「还没结束」
      if (voice.rec === rec) { vlog("3 秒没有 onend"); abortRec(rec, "stop() 看门狗"); finish(rec, rec.__text); }
    }, 3000);
  }

  function startListening(source) {
    var Recognition = getRecognition(), cfg = exp();
    if (!Recognition) { hint(I18n.t("mic.unsupported")); showDictation(true); finishNoRec(); return; }
    voice.started = false; voice.failed = false; voice.gotResult = false;
    var sid = ++voice.sid, finalText = "", rec;
    try {
      rec = new Recognition(); // 每次新建
    } catch (err) { vlog("new " + err.name); voice.phase = "idle"; setMicUI("idle"); countFail(); hint(I18n.t("mic.startFailed")); return; }
    voice.rec = rec; voice.phase = "starting";
    var cur = function () { return voice.sid === sid && voice.rec === rec; }; // 还是「这一次」吗（共用实例时旧事件会撞进来）

    function go() { // 真正 start()：就在点按的事件里同步调用（实验 B 在等旧的 onend 时，是在 onend 里调用）
      rec.lang = I18n.t("mic.lang"); rec.interimResults = true; rec.continuous = false;
      rec.onstart = function () {
        if (!cur()) { vlog("旧实例的 onstart（已忽略）"); return; }
        clearTimeout(voice.watch);
        voice.phase = "listening"; voice.started = true; vlog("onstart (start() 后 " + Math.round(performance.now() - voice.startedAt) + "ms)");
        setMicUI("listening"); hint(I18n.t("mic.listening"));
        // 兜底：onstart 后 4 秒内没有任何 onresult，说明麦克风没收到声音（iPhone 上第 2 次起会这样）
        voice.resultWatch = setTimeout(function () {
          if (!cur() || voice.gotResult || voice.phase !== "listening") return;
          vlog(Math.round(NO_RESULT_MS / 1000) + " 秒没有 onresult（麦克风没收到声音）");
          voice.failed = true;
          hint(I18n.t("mic.noAudio"), 8000);
          stopListening("4 秒没有 onresult 看门狗"); // 自动停止
          try { input.focus(); } catch (e) { /* 弹不出键盘也没关系 */ } // 焦点放进输入框，点键盘上的麦克风就能说
        }, NO_RESULT_MS);
      };
      rec.onresult = function (e) {
        if (!cur()) { vlog("旧实例的 onresult（已忽略）"); return; }
        voice.gotResult = true; clearTimeout(voice.resultWatch);
        var interim = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
        }
        rec.__text = finalText; input.value = finalText + interim; vlog("onresult");
      };
      rec.onerror = function (e) {
        if (!cur()) { vlog("旧实例的 onerror: " + e.error + "（已忽略）"); return; }
        vlog("onerror: " + e.error);
        if (HARD_ERRORS[e.error] || (e.error !== "no-speech" && e.error !== "aborted")) voice.failed = true;
        var key = { "not-allowed": "mic.notAllowed", "service-not-allowed": "mic.serviceNotAllowed", "no-speech": "mic.noSpeech", "network": "mic.network", "audio-capture": "mic.audioCapture" }[e.error];
        if (e.error !== "aborted") hint(I18n.t(key || "mic.other"));
        abortRec(rec, "onerror"); // 出错就 abort()，同时马上把状态重置、实例设为 null（后面迟到的 onend 会被当成旧实例忽略）
        finish(rec, finalText);
      };
      rec.onend = function () {
        if (!cur()) { vlog("旧实例的 onend（已忽略）"); return; }
        vlog("onend"); finish(rec, finalText);
      };

      Sound.hold(); // 先让出音频会话（实验 A）
      try {
        rec.start();
        voice.startedAt = performance.now();
        vlog("start() ← " + source);
        setMicUI("starting"); // 马上给反馈：准备中…
      } catch (err) {
        vlog("start() 抛出 " + err.name);
        voice.failed = err.name !== "InvalidStateError"; // 正在识别时重复 start 不算失败
        hint(I18n.t("mic.startFailed"));
        if (err.name === "InvalidStateError") abortRec(rec, "start() 抛出 InvalidStateError");
        finish(rec, "", err.name === "InvalidStateError");
        return;
      }
      voice.watch = setTimeout(function () { // 5 秒还没 onstart：放弃这次
        if (cur() && voice.phase === "starting") { vlog("5 秒没有 onstart"); hint(I18n.t("mic.noStart")); abortRec(rec, "onstart 看门狗"); finish(rec, ""); }
      }, 5000);
    }

    go();
  }
  function finishNoRec() { voice.phase = "idle"; setMicUI("idle"); }

  // 麦克风按钮的唯一入口（聊天面板里的 🎙 和抽屉里的 🎙 都走这里，共用同一份状态）。只认 click，不碰 touchstart / mousedown。
  // 带来源标签：谁点的、是不是真的点击、click 的 detail（连点第几下）、距离 start() 多少毫秒——日志里能直接看出 stop() 是谁叫的。
  function micTap(source, ev) {
    var now = performance.now();
    var tag = source + (ev ? "·" + (ev.isTrusted ? "真点击" : "程序触发") + (ev.detail ? " detail=" + ev.detail : "") : "");
    var since = voice.startedAt ? Math.round(now - voice.startedAt) : null;
    if (now - voice.lastTap < DEBOUNCE) { vlog("忽略点按：" + Math.round(now - voice.lastTap) + "ms 内重复 [" + tag + "]"); return; } // 防抖
    voice.lastTap = now;
    if (voice.phase === "listening") {
      if (since !== null && since < STOP_GUARD) { vlog("忽略 stop：start() 后才 " + since + "ms [" + tag + "]"); return; } // start 后 1 秒内不接受停止
      stopListening(tag + "，start() 后 " + since + "ms"); return;
    }
    if (voice.phase !== "idle") { vlog("忽略点按：" + voice.phase + (since !== null ? "，start() 后 " + since + "ms" : "") + " [" + tag + "]"); hint(I18n.t("mic.wait")); return; } // 防止重复启动
    if (now < voice.cooldownUntil) { vlog("忽略点按：上一次刚结束 [" + tag + "]"); return; }
    voice.n++; voice.lines.push("#" + voice.n + " [" + exp().tag + "] "); if (voice.lines.length > 3) voice.lines.shift();
    startListening(tag);
  }

  function dropVoice() { var rec = voice.rec; if (rec) { vlog("页面切到后台"); abortRec(rec, "visibilitychange / pagehide"); finish(rec, ""); } }

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

    Sound.setMode(exp().sound); // 语音实验：音效的三种做法（normal / soft / silent）
    var mic = $("chat-mic");
    mic.innerHTML = '<span aria-hidden="true">🎙</span><span class="mic-label" id="chat-mic-label"></span>';
    mic.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); micTap("click:chat-mic", e); }); // 只绑 click 这一种
    document.addEventListener("debug:change", renderVoiceLog);
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

  return { init: init, listen: micTap, EXPERIMENTS: EXPERIMENTS, expId: expId, setExp: setExp, voiceState: function () { return { phase: voice.phase, fails: voice.fails, dictation: voice.dictation, n: voice.n, lines: voice.lines.slice() }; } };
})();

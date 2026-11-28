/*
 * 「练习模式」和「AI 模式」的开关，以及 AI 模式怎么拿到回复
 *
 *   练习模式：现在的规则回复（js/ai/ai.js 里的 MockBrain，按关键词套模板）
 *   AI 模式 ：把这次的话 + 最近 7 天的 Wins + 用户摘要 + 今天的电量打成一个请求，交给 transport，
 *             拿回结构化 JSON（格式见 js/ai/schema.js），校验后变成聊天面板能显示的回复。
 *
 * transport（请求发到哪里）：
 *   现在是 MockAPI（js/ai/mock-api.js，写死的示例，不联网）。
 *   接真后端时：把 ENDPOINT 改成 worker 部署后的地址（见 worker/README.md），transport 就会 fetch 过去。
 *   ⚠️ 这里只有地址，没有 key。key 只存在 Cloudflare Worker 的环境变量里。
 *
 * 开关存在 localStorage 的 winslog-ai-mode（"practice" | "ai"），属于界面偏好，不在备份里。
 */
var AIMode = (function () {
  var KEY = "winslog-ai-mode";
  var ENDPOINT = ""; // 例如 "https://wins-log-ai.<你的名字>.workers.dev/chat"；留空 = 用假接口
  var TIMEOUT_MS = 15000;

  function get() { try { return localStorage.getItem(KEY) === "ai" ? "ai" : "practice"; } catch (e) { return "practice"; } }
  function set(m) {
    try { localStorage.setItem(KEY, m === "ai" ? "ai" : "practice"); } catch (e) {}
    document.dispatchEvent(new CustomEvent("aimode:change", { detail: get() }));
  }
  function isAI() { return get() === "ai"; }

  var DAY = 24 * 3600 * 1000;

  // 最近 7 天的 Wins（只带文字和日期，不带别的）
  function recentWins() {
    var since = Date.now() - 7 * DAY;
    return Store.allWins().filter(function (t) { return t.doneAt >= since; }).slice(-60).map(function (t) {
      return { text: t.text, date: Store.dayKey(new Date(t.doneAt)) };
    });
  }
  // 一份很短的用户摘要（先放事实，以后可以由用户自己改）
  function summary() {
    var m = Store.userMeta();
    if (m.summary) return String(m.summary).slice(0, 500);
    var days = Store.dayKeys().length, all = Store.allWins().length;
    return days ? "已经记录了 " + days + " 天、共 " + all + " 件 Wins。" : "";
  }

  function buildRequest(text, lang) {
    return { text: text, wins: recentWins(), summary: summary(), energy: Store.userMeta().energy || null, lang: lang };
  }

  function transport(request) {
    if (!ENDPOINT) return MockAPI.chat(request);
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : 0;
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) { clearTimeout(timer); return r.json(); }, function (e) { clearTimeout(timer); throw e; });
  }

  // 返回聊天面板用的 Reply（和 ai.js 的格式一致，再加 nextStep / safety / fallback）
  function chat(messages, context) {
    var last = messages.length ? messages[messages.length - 1].text : "";
    return transport(buildRequest(last, context && context.lang || "zh"))
      .then(function (raw) { return AISchema.validate(raw) || AISchema.fallback(); }, function () { return AISchema.fallback(); })
      .then(toReply);
  }

  function toReply(r) {
    if (r.safety) return { reply: "", safety: true, plan: null };
    var out = { reply: r.reply, plan: null, safety: false, fallback: !!r.fallback };
    if (r.wins.length) out.plan = { mode: "done", items: r.wins.map(function (w) { return { text: w.text, note: w.note }; }) };
    if (r.next_step) out.nextStep = { text: r.next_step, smaller: r.smaller_step };
    return out;
  }

  return { get: get, set: set, isAI: isAI, chat: chat, buildRequest: buildRequest };
})();

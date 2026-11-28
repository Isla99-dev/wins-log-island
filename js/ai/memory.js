/*
 * 小助手的记忆：一份 200 字以内的用户摘要
 *
 * - 只记录用户在做的事和偏好，不记录健康信息（worker 的 SUMMARY_PROMPT 规定 + 后端再过滤一遍）。
 * - 存在这台电脑的浏览器里（Store 的 meta.userSummary），每次 AI 请求作为背景带上；设置里可以查看和清空。
 * - 什么时候更新：每天第一次对话结束后更新一次。「结束」= AI 模式下最后一条回复之后 3 分钟没有新消息，
 *   或者页面切到后台 / 关掉。那天没来得及更新（比如直接关了电脑），下次打开网页时补上。
 * - 更新失败不要紧：旧摘要原样保留，下次再试。
 */
var Memory = (function () {
  var IDLE_MS = 3 * 60 * 1000;
  var timer = 0, busy = false;

  function eligible(day) {
    if (!AIMode.isAI() || AIMode.tiredToday()) return false;
    if ((Store.summaryDay() || "") >= day) return false;     // 这天（或更晚）已经总结过
    var chat = Store.chatOf(day).filter(function (m) { return !m.greeting && m.text && !m.safety; });
    return chat.some(function (m) { return m.role === "user"; }) ? chat : false;
  }

  function update(day, reason) {
    var chat = eligible(day);
    if (!chat || busy) return Promise.resolve(false);
    busy = true;
    var body = {
      summary: Store.userMeta().summary || "",
      chat: chat.slice(-40).map(function (m) { return { role: m.role, text: String(m.text).slice(0, 300) }; }),
      date: day,
      lang: I18n.lang()
    };
    var p = AIMode.post("/summary", body) || MockAPI.summary(body);
    return p.then(function (res) {
      busy = false;
      if (!res || res.limited || typeof res.summary !== "string" || res.updated === false) return false;
      Store.setSummary(res.summary, day);
      document.dispatchEvent(new CustomEvent("memory:change", { detail: { reason: reason } }));
      return true;
    }, function () { busy = false; return false; });
  }

  // 聊天面板每收到一条 AI 回复就叫一次：重新开始 3 分钟倒计时
  function touch() {
    clearTimeout(timer);
    timer = setTimeout(function () { update(Store.dayKey(), "idle"); }, IDLE_MS);
  }

  // 打开网页时：补上最近一个还没总结过的、有对话的日子（只看最近 7 天）
  function catchUp() {
    var today = Store.dayKey(), days = Store.dayKeys().filter(function (k) { return k < today; }).slice(-7).reverse();
    for (var i = 0; i < days.length; i++) {
      if (eligible(days[i])) { update(days[i], "catch-up"); return; }
    }
  }

  function init() {
    document.addEventListener("visibilitychange", function () { if (document.hidden) update(Store.dayKey(), "hidden"); });
    window.addEventListener("pagehide", function () { update(Store.dayKey(), "pagehide"); });
    setTimeout(catchUp, 4000); // 等页面先加载完
  }

  return {
    init: init,
    touch: touch,
    update: update,
    text: function () { return Store.userMeta().summary || ""; },
    clear: function () { Store.clearSummary(); document.dispatchEvent(new CustomEvent("memory:change", { detail: { reason: "clear" } })); }
  };
})();

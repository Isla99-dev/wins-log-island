/*
 * AI 返回的结构化 JSON：定义和校验
 *
 * 后端（worker/）和模拟接口（js/ai/mock-api.js）都返回下面这个格式：
 *
 *   {
 *     "wins":         [ { "text": "已经做到的小事", "note": "一句不肉麻的话" } ],   // 可以是空数组
 *     "next_step":    "下一件 2 分钟就能开始的小事"  | null,
 *     "smaller_step": "更小的一步（点「换更小的」时用）" | null,
 *     "steps":        [ { "text": "拆出来的一步", "size": "🌱" | "🌿" | "🌳" } ],   // 拆任务时用，不拆为 []
 *     "reply":        "小助手要说的话",                                         // 必填
 *     "safety":       false                       // true = 用户表达了伤害自己的念头
 *   }
 *
 * AISchema.validate(obj) → 整理好的结果；格式不对（缺 reply、类型错得没法用）返回 null。
 * 网页拿到 null 时用 AISchema.fallback()，页面不会因为 AI 返回了奇怪的东西而崩掉。
 */
var AISchema = (function () {
  var MAX_REPLY = 600, MAX_TEXT = 80, MAX_NOTE = 80, MAX_WINS = 8, MAX_STEPS = 6;
  var SIZES = ["🌱", "🌿", "🌳"]; // 很小 / 小 / 稍大

  function str(v, max) {
    if (typeof v !== "string") return "";
    v = v.replace(/\s+/g, " ").trim();
    return v.length > max ? v.slice(0, max) : v;
  }

  function validate(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    var reply = str(obj.reply, MAX_REPLY);
    var safety = obj.safety === true;
    if (!reply && !safety) return null; // 没有可说的话，也不是安全提示 → 当作格式不对

    var wins = [];
    if (Array.isArray(obj.wins)) {
      obj.wins.forEach(function (w) {
        if (wins.length >= MAX_WINS) return;
        var text = str(typeof w === "string" ? w : w && w.text, MAX_TEXT);
        if (!text) return;
        wins.push({ text: text, note: typeof w === "object" && w ? str(w.note, MAX_NOTE) : "" });
      });
    }
    var steps = [];
    if (Array.isArray(obj.steps)) {
      obj.steps.forEach(function (st) {
        if (steps.length >= MAX_STEPS) return;
        var text = str(typeof st === "string" ? st : st && st.text, MAX_TEXT);
        if (!text) return;
        steps.push({ text: text, size: st && SIZES.indexOf(st.size) >= 0 ? st.size : "🌿" });
      });
    }
    if (safety) return { wins: [], next_step: null, smaller_step: null, steps: [], reply: "", safety: true };
    return {
      wins: wins,
      steps: steps,
      next_step: str(obj.next_step, MAX_TEXT) || null,
      smaller_step: str(obj.smaller_step, MAX_TEXT) || null,
      reply: reply,
      safety: safety
    };
  }

  // 去掉和「最近 7 天记录」重复的 Wins（后端也会做一遍；这里是第二道保险）：
  // 旧记录已经记过了，再放进卡片、点「全部划掉」就会被当成今天的事重复记一遍
  function norm(t) {
    return String(t || "")
      .replace(/^\s*(\d{1,2}[-/.月]\d{1,2}日?|前几天|这几天|这两天|昨天|前天)\s*/, "")
      .replace(/[\s，,。.！!？?、；;：:「」“”"'（）()]/g, "")
      .toLowerCase();
  }
  // 用户这次又说了同一件事（比如今天又洗了碗）就保留：只去掉这次没提到的旧记录
  function dropOldWins(r, recent, text) {
    if (!r || !r.wins.length || !recent || !recent.length) return r;
    var said = norm(text);
    var olds = recent.map(function (w) { return norm(w.text); }).filter(function (t) { return t.length >= 2 && said.indexOf(t) < 0; });
    r.wins = r.wins.filter(function (w) {
      var n = norm(w.text);
      return !olds.some(function (o) { return n === o || n.indexOf(o) >= 0 || o.indexOf(n) >= 0; });
    });
    return r;
  }

  // 出错、超时、格式不对时用的兜底回复（界面文字在 js/ui/i18n.js 里）
  function fallback() {
    return { wins: [], next_step: null, smaller_step: null, steps: [], reply: I18n.t("ai.fallback"), safety: false, fallback: true };
  }

  return { validate: validate, fallback: fallback, dropOldWins: dropOldWins };
})();

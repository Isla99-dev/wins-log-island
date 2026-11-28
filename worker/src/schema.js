// 校验模型返回的 JSON（和网页里的 js/ai/schema.js 是同一份约定）。
// 返回整理好的对象；格式不对返回 null。
const MAX_REPLY = 600, MAX_TEXT = 80, MAX_NOTE = 80, MAX_WINS = 8;

function str(v, max) {
  if (typeof v !== "string") return "";
  v = v.replace(/\s+/g, " ").trim();
  return v.length > max ? v.slice(0, max) : v;
}

export function validateReply(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const reply = str(obj.reply, MAX_REPLY);
  const safety = obj.safety === true;
  if (!reply && !safety) return null;
  const wins = [];
  if (Array.isArray(obj.wins)) {
    for (const w of obj.wins) {
      if (wins.length >= MAX_WINS) break;
      const text = str(typeof w === "string" ? w : w && w.text, MAX_TEXT);
      if (text) wins.push({ text, note: w && typeof w === "object" ? str(w.note, MAX_NOTE) : "" });
    }
  }
  return {
    wins,
    next_step: str(obj.next_step, MAX_TEXT) || null,
    smaller_step: str(obj.smaller_step, MAX_TEXT) || null,
    reply,
    safety,
  };
}

// 出错、超时、模型返回的东西没法用时，给用户的兜底回复
export function fallbackReply(lang) {
  return {
    wins: [],
    next_step: null,
    smaller_step: null,
    reply: lang === "en"
      ? "Something hiccupped on my side and I didn't catch that. Say it again, or just do the tiniest thing in front of you. I'm here."
      : "我这边好像卡了一下，没听清楚。你可以再说一次，或者先做眼前最小的一件事，我在这里。",
    safety: false,
    fallback: true,
  };
}

// 检查网页发来的请求，整理成安全的大小。不合格返回 null。
export function cleanRequest(body) {
  if (!body || typeof body !== "object") return null;
  const text = str(body.text, 1000);
  if (!text) return null;
  const wins = Array.isArray(body.wins)
    ? body.wins.slice(-60).map((w) => ({ text: str(w && w.text, MAX_TEXT), date: str(w && w.date, 10) })).filter((w) => w.text)
    : [];
  const energy = ["low", "mid", "high"].includes(body.energy) ? body.energy : null;
  return { text, wins, summary: str(body.summary, 500), energy, lang: body.lang === "en" ? "en" : "zh" };
}

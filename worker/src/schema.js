// 校验模型返回的 JSON（和网页里的 js/ai/schema.js 是同一份约定）。
// 返回整理好的对象；格式不对返回 null。
const MAX_REPLY = 600, MAX_TEXT = 80, MAX_NOTE = 80, MAX_WINS = 8, MAX_STEPS = 6;
const SIZES = ["🌱", "🌿", "🌳"];

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
  const steps = [];
  if (Array.isArray(obj.steps)) {
    for (const st of obj.steps) {
      if (steps.length >= MAX_STEPS) break;
      const text = str(typeof st === "string" ? st : st && st.text, MAX_TEXT);
      if (text) steps.push({ text, size: st && SIZES.includes(st.size) ? st.size : "🌿" });
    }
  }
  if (safety) return { wins: [], next_step: null, smaller_step: null, steps: [], reply: "", safety: true };
  return {
    wins,
    steps,
    next_step: str(obj.next_step, MAX_TEXT) || null,
    smaller_step: str(obj.smaller_step, MAX_TEXT) || null,
    reply,
    safety,
  };
}

// 去掉和「最近 7 天记录」重复的 Wins：旧记录已经记过了，再放进卡片会被当成今天的事重复记一遍
function norm(t) {
  return String(t || "")
    .replace(/^\s*(\d{1,2}[-/.月]\d{1,2}日?|前几天|这几天|这两天|昨天|前天)\s*/, "")
    .replace(/[\s，,。.！!？?、；;：:「」“”"'（）()]/g, "")
    .toLowerCase();
}
// 用户这次又说了同一件事（比如今天又洗了碗）就保留：只去掉这次没提到的旧记录
export function dropOldWins(reply, recent, text) {
  if (!reply || !reply.wins.length || !recent || !recent.length) return reply;
  const said = norm(text);
  const olds = recent.map((w) => norm(w.text)).filter((t) => t.length >= 2 && !said.includes(t));
  reply.wins = reply.wins.filter((w) => {
    const n = norm(w.text);
    return !olds.some((o) => n === o || n.includes(o) || o.includes(n));
  });
  return reply;
}

// ---------- 用户摘要（/summary） ----------
export const SUMMARY_MAX = 200;
// 兜底：就算模型没守规则，含健康相关词的句子也整句去掉
const HEALTH = /(失眠|褪黑素|安眠|助眠|睡不好|睡眠|抑郁|焦虑症|躁郁|双相|ADHD|多动|病|药|医生|医院|治疗|诊断|心理咨询|咨询师|自残|自杀|不想活|体重|减肥|经期|怀孕|insomnia|melatonin|sleeping pill|depress|anxiety disorder|adhd|medicat|doctor|therap|diagnos|suicid|self[- ]harm)/i;
export function cleanSummary(text) {
  if (typeof text !== "string") return "";
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[。！？；.!?;])/);
  let out = parts.filter((p) => p.trim() && !HEALTH.test(p)).join("").trim();
  if (out.length > SUMMARY_MAX) out = out.slice(0, SUMMARY_MAX);
  return out;
}
export function cleanSummaryRequest(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.chat)) return null;
  const chat = body.chat.slice(-40)
    .map((m) => ({ role: m && m.role === "assistant" ? "assistant" : "user", text: str(m && m.text, 300) }))
    .filter((m) => m.text);
  if (!chat.some((m) => m.role === "user")) return null;
  return { summary: cleanSummary(body.summary || ""), chat, date: str(body.date, 10), lang: body.lang === "en" ? "en" : "zh" };
}

// 出错、超时、模型返回的东西没法用时，给用户的兜底回复
export function fallbackReply(lang) {
  return {
    wins: [],
    next_step: null,
    smaller_step: null,
    steps: [],
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
  // 用户当地时间，例如 "21:30"（提示词第 15 条「晚上回顾」要用）
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time || "") ? body.time : null;
  return { text, wins, summary: str(body.summary, 500), energy, time, lang: body.lang === "en" ? "en" : "zh" };
}

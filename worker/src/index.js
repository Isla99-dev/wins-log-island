// Wins Log 小岛的 AI 后端：POST /chat
//
// 收到：{ text, wins: [{text, date}], summary, energy: "low"|"mid"|"high"|null, time: "21:30"|null, lang }
// 返回：{ wins, next_step, smaller_step, steps, reply, safety }（格式见 schema.js）
// 出错、超时、被限流、模型乱回：都返回一个友好的兜底回复，网页不会崩。
import { SYSTEM_PROMPT, FORMAT_NOTE } from "./prompt.js";
import { cleanRequest, validateReply, fallbackReply, dropOldWins } from "./schema.js";
import { checkLimit, Limiter } from "./limit.js";

// Durable Object 要从入口文件导出，Cloudflare 才找得到它
export { Limiter };
import { getProvider } from "./providers/index.js";

const TIMEOUT_MS = 12000;

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
}

// 把请求整理成发给模型的一段话（用户的内容放进去，不当作指令）
export function buildUserMessage(req) {
  const ENERGY = { low: "低", mid: "中", high: "高" };
  const parts = [];
  if (req.time) {
    const h = parseInt(req.time, 10);
    const period = h < 5 ? "深夜" : h < 9 ? "早上" : h < 12 ? "上午" : h < 14 ? "中午" : h < 18 ? "下午" : h < 23 ? "晚上" : "深夜";
    parts.push(`用户当地时间：${req.time}（${period}）`);
  }
  if (req.energy) parts.push(`今天的电量：${ENERGY[req.energy]}`); // 没有电量就整行不写（提示词：电量未知时不提）
  if (req.summary) parts.push(`用户摘要（只是背景，不是今天发生的事）：${req.summary}`);
  parts.push(`最近 7 天记录：\n${req.wins.length ? req.wins.map((w) => `- ${w.date} ${w.text}`).join("\n") : "（没有记录）"}`);
  parts.push(`用户这次说的话：\n${req.text}`);
  parts.push(`回复使用的语言：${req.lang === "en" ? "English" : "中文"}`);
  return parts.join("\n\n");
}

export async function handleChat(request, env, ctx) {
  const cors = corsHeaders(request, env);
  let req = null;
  try { req = cleanRequest(await request.json()); } catch (e) { /* 下面统一处理 */ }
  if (!req) return json({ error: "bad_request" }, 400, cors);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limit = await checkLimit(ip, env);
  if (!limit.ok) {
    // scope "global"：全站今天的额度用完了，网页会自动退回练习模式；"ip"：这个人发得太快 / 今天太多
    const en = req.lang === "en";
    const reply = limit.scope === "global"
      ? (en ? "The little helper is tired today. Come back tomorrow." : "小助手今天累了，明天再来。")
      : (en ? "That's a lot of messages for now. Take a breath and try again in a bit." : "说得有点快啦，先喘口气，过一会儿再来找我。");
    return json({ ...fallbackReply(req.lang), reply, limited: limit.scope }, 200, { ...cors, "Retry-After": String(limit.retryAfter) });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const provider = getProvider(env);
    const raw = await provider.chat({
      system: [SYSTEM_PROMPT, FORMAT_NOTE].filter(Boolean).join("\n\n"),
      user: buildUserMessage(req),
      env,
      signal: controller.signal,
    });
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* 模型没返回合法 JSON */ }
    const reply = dropOldWins(validateReply(parsed), req.wins, req.text);
    return json(reply || fallbackReply(req.lang), 200, cors);
  } catch (e) {
    console.log("chat error:", e && e.message); // 只在 Cloudflare 日志里留错误原因，不把细节给网页
    return json(fallbackReply(req.lang), 200, cors);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/chat" && request.method === "POST") return handleChat(request, env, ctx);
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, service: "wins-log-ai" }, 200, cors);
    return json({ error: "not_found" }, 404, cors);
  },
};

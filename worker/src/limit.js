// 防止被刷：按 IP 限流 + 全站每日总上限
//
// 计数放在一个 Durable Object（Limiter）里：Cloudflare 全世界所有机器共用这一份计数，
// 不会因为请求落到不同机器、Worker 重启就清零。免费账号可以用（SQLite 存储）。
// 上限在 wrangler.toml 的 [vars] 里改（见 README「修改上限」）：
//   RATE_PER_MINUTE    每个 IP 每分钟最多几次（默认 5）
//   RATE_PER_DAY       每个 IP 每天最多几次（默认 50）
//   DAILY_TOTAL_LIMIT  全站每天最多几次（默认 300）
// 「每天」按 UTC 零点重置（北京时间早上 8 点，英国冬令时午夜）。
// IP 不原样存，只存它的 SHA-256 摘要的前 16 位。

function limits(env) {
  return {
    perMin: parseInt(env.RATE_PER_MINUTE, 10) || 5,
    perDay: parseInt(env.RATE_PER_DAY, 10) || 50,
    total: parseInt(env.DAILY_TOTAL_LIMIT, 10) || 300,
  };
}

async function hashIp(ip) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("wins-log:" + ip));
  return Array.from(new Uint8Array(buf)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 计数规则（Durable Object 和内存兜底共用）。store 需要 get(key) / put(key, value)。
// 返回 { ok: true } 或 { ok: false, scope: "ip" | "global", retryAfter: 秒 }
export async function count(store, ipKey, lim, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const minute = Math.floor(now / 60000);
  const kTotal = "total:" + day, kDay = "ip:" + ipKey + ":" + day, kMin = "ipm:" + ipKey + ":" + minute;
  const [total, perDay, perMin] = await Promise.all([store.get(kTotal), store.get(kDay), store.get(kMin)]);
  const secsToMidnight = Math.ceil((Date.UTC(...day.split("-").map((v, i) => (i === 1 ? v - 1 : +v))) + 86400000 - now) / 1000);
  if ((total || 0) >= lim.total) return { ok: false, scope: "global", retryAfter: secsToMidnight };
  if ((perDay || 0) >= lim.perDay) return { ok: false, scope: "ip", retryAfter: secsToMidnight };
  if ((perMin || 0) >= lim.perMin) return { ok: false, scope: "ip", retryAfter: 60 - Math.floor((now % 60000) / 1000) };
  await Promise.all([store.put(kTotal, (total || 0) + 1), store.put(kDay, (perDay || 0) + 1), store.put(kMin, (perMin || 0) + 1)]);
  return { ok: true };
}

// Durable Object：只有一个实例（名字 "global"），所有请求排队经过它，计数不会算重
export class Limiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    const { ipKey } = await request.json();
    const res = await count(this.state.storage, ipKey, limits(this.env));
    // 每天清一次旧计数，存储不会越积越多
    if (!(await this.state.storage.getAlarm())) {
      const t = new Date(); t.setUTCHours(24, 5, 0, 0);
      await this.state.storage.setAlarm(t.getTime());
    }
    return Response.json(res);
  }
  async alarm() {
    const today = new Date().toISOString().slice(0, 10);
    const all = await this.state.storage.list();
    const old = [...all.keys()].filter((k) => !k.includes(today) && !k.startsWith("ipm:"));
    const minuteNow = Math.floor(Date.now() / 60000);
    for (const k of all.keys()) if (k.startsWith("ipm:") && +k.split(":").pop() < minuteNow - 2) old.push(k);
    for (let i = 0; i < old.length; i += 128) await this.state.storage.delete(old.slice(i, i + 128));
  }
}

// 没配 Durable Object 时（比如旧的部署）退回内存计数：只在同一台机器上有效，聊胜于无
const mem = new Map();
const memStore = { get: async (k) => mem.get(k), put: async (k, v) => { mem.set(k, v); if (mem.size > 20000) mem.clear(); } };

export async function checkLimit(ip, env) {
  const ipKey = await hashIp(ip || "unknown");
  if (env.LIMITER) {
    try {
      const stub = env.LIMITER.get(env.LIMITER.idFromName("global"));
      const r = await stub.fetch("https://limiter/check", { method: "POST", body: JSON.stringify({ ipKey }) });
      return await r.json();
    } catch (e) {
      console.log("limiter error:", e && e.message); // 计数器坏了也不挡住用户，退回内存计数
    }
  }
  return count(memStore, ipKey, limits(env));
}

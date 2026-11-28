// 简单限流：按访问者 IP，每分钟 / 每天各一个上限。
// 数据放在 Worker 的内存里，Worker 重启或多个实例之间不共享，所以这是「挡住手滑和小滥用」的第一道门，不是严格的计费保护。
// 想要更严格：在 Cloudflare 后台给这个 Worker 加 Rate Limiting 规则（README 里有说明），或者换成 KV。
const hits = new Map(); // ip → { minute: {start, n}, day: {start, n} }

export function checkLimit(ip, env, now = Date.now()) {
  const perMin = parseInt(env.RATE_PER_MINUTE, 10) || 6;
  const perDay = parseInt(env.RATE_PER_DAY, 10) || 100;
  let h = hits.get(ip);
  if (!h) { h = { minute: { start: now, n: 0 }, day: { start: now, n: 0 } }; hits.set(ip, h); }
  if (now - h.minute.start >= 60_000) h.minute = { start: now, n: 0 };
  if (now - h.day.start >= 86_400_000) h.day = { start: now, n: 0 };
  if (h.minute.n >= perMin || h.day.n >= perDay) {
    return { ok: false, retryAfter: Math.ceil((h.minute.n >= perMin ? 60_000 - (now - h.minute.start) : 86_400_000 - (now - h.day.start)) / 1000) };
  }
  h.minute.n++; h.day.n++;
  if (hits.size > 5000) { for (const [k, v] of hits) { if (now - v.day.start >= 86_400_000) hits.delete(k); } } // 清理旧记录
  return { ok: true };
}

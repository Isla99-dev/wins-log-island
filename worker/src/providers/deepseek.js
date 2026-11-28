// 调用 DeepSeek 的那一层。别的模型（Claude、通义……）照这个文件的样子再写一个，
// 只要导出同样的 chat({ system, user, env, signal }) → 返回模型的文字，就能在 wrangler.toml 里用 PROVIDER 换掉。
//
// ⚠️ 密钥只从 env.DEEPSEEK_API_KEY 读（Worker 的加密环境变量），不写在任何文件里。
export async function chat({ system, user, env, signal }) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY 没有设置（见 worker/README.md 第 4 步）");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.DEEPSEEK_API_KEY },
    body: JSON.stringify({
      model: env.MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 700,
    }),
    signal,
  });
  if (!res.ok) throw new Error("模型接口返回 " + res.status);
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error("模型没有返回内容");
  return text;
}

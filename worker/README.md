# Wins Log 小岛 · AI 后端（Cloudflare Worker）

这是一个很小的「中转站」：网页把你说的话发给它，它带着**密钥**去问 AI 模型，再把整理好的结果还给网页。
**密钥只放在 Cloudflare 里，不会出现在任何网页文件或这个仓库里。**

现在网页里的「AI 模式」用的还是写死的示例（不联网）。你把下面步骤做完、把地址填进网页，才会真的联网。
这些步骤都由你自己操作，我不会替你登录任何账号。

## 需要准备
- 一个 Cloudflare 账号（免费的就够用）
- 一个 DeepSeek 账号和 API Key（按用量付费，充很少的钱就能用很久）
- 电脑上装好 Node.js（官网 https://nodejs.org 下载「LTS」版，一路下一步）

## 第 1 步：注册 Cloudflare
1. 打开 https://dash.cloudflare.com/sign-up ，用邮箱注册并验证邮箱。
2. 不需要买域名，也不需要绑银行卡。

## 第 2 步：注册 DeepSeek 并拿到 Key
1. 打开 https://platform.deepseek.com ，注册并登录。
2. 左边「API keys」→「创建 API key」，取个名字（比如 wins-log）。
3. 创建后会**只显示一次**这串 Key，先复制下来放在安全的地方（比如密码管理器）。不要发给任何人，不要写进网页文件、不要发到聊天里。
4. 在「充值」里充一点点钱（比如 10 元），不充值调用会失败。

## 第 3 步：登录 Cloudflare（在终端里）
打开「终端」，一行一行执行（每行回车一次）：

```bash
cd "/Users/huhuhuhuhu/Desktop/Wins Log/worker"
```

```bash
npm install
```

```bash
npx wrangler login
```

最后一行会自动打开浏览器，让你在 Cloudflare 里点「允许」。登录这一步只有你自己能做。

## 第 4 步：把 Key 存进 Cloudflare
```bash
npx wrangler secret put DEEPSEEK_API_KEY
```
终端会问你要值，把第 2 步复制的 Key 粘贴进去（粘贴时屏幕上不会显示，正常），回车。
如果问「要不要先创建 Worker」，选 yes。

## 第 5 步：部署
```bash
npx wrangler deploy
```
成功后会打印一个地址，长得像 `https://wins-log-ai.你的名字.workers.dev`。把它抄下来。

## 第 6 步：试一下
把下面命令里的地址换成你自己的，在终端里执行：

```bash
curl -X POST "https://wins-log-ai.你的名字.workers.dev/chat" -H "Content-Type: application/json" -d '{"text":"我今天打开了电脑","wins":[],"summary":"","energy":null,"lang":"zh"}'
```

应该返回一段 JSON，里面有 `reply`。如果返回的是「我这边好像卡了一下」，说明 Key 没设置对、没充值或模型出错了，看第 8 步。

## 第 7 步：让网页用上它
1. 打开 `js/ai/ai-mode.js`，把 `var ENDPOINT = "";` 改成 `var ENDPOINT = "https://wins-log-ai.你的名字.workers.dev/chat";`（这里只放地址，不放 Key）。
2. 打开 `worker/wrangler.toml`，确认 `ALLOWED_ORIGINS` 里有你的网站地址 `https://isla99-dev.github.io`，然后重新 `npx wrangler deploy`。
3. 网页里「小助手」页点一下「练习模式」切到「AI 模式」。

> 提示词（小助手的性格和说话方式）放在 `worker/src/prompt.js`，现在是空的，等你提供后再写进去。

## 第 8 步：出问题时
- 看日志：`npx wrangler tail`，然后在网页里说一句话，终端里会显示错误原因。
- 「DEEPSEEK_API_KEY 没有设置」：重做第 4 步。
- 「模型接口返回 401」：Key 抄错了。「返回 402」：账户没钱了，去 DeepSeek 充值。
- 想本地试：在 `worker/` 里新建文件 `.dev.vars`（已经被 `.gitignore` 忽略，不会上传），写一行 `DEEPSEEK_API_KEY=你的key`，然后 `npx wrangler dev`。

## 这个后端做了什么
| 文件 | 作用 |
| --- | --- |
| `src/index.js` | 入口：`POST /chat`，检查请求、限流、调用模型、校验结果、出错时给兜底回复 |
| `src/providers/deepseek.js` | 调用 DeepSeek 的那一层。以后换模型：照它写一个新文件，在 `providers/index.js` 登记，`wrangler.toml` 里改 `PROVIDER` |
| `src/schema.js` | AI 返回格式的校验（和网页里 `js/ai/schema.js` 是同一份约定）、兜底回复 |
| `src/limit.js` | 限流：每个访问者每分钟 6 次、每天 100 次（可在 `wrangler.toml` 改） |
| `src/prompt.js` | 提示词的位置（现在留空） |

**限流说明**：现在的限流存在 Worker 的内存里，是「挡住手滑和小滥用」的第一道门。想更严格，可以在 Cloudflare 后台这个 Worker 的 Security / Rules 里加 Rate limiting 规则。
**费用说明**：Cloudflare Workers 免费额度每天 10 万次请求，对个人使用绰绰有余；DeepSeek 按字数计费。

## 返回格式
```json
{
  "wins":  [ { "text": "已经做到的小事", "note": "一句不肉麻的话" } ],
  "next_step": "下一件 2 分钟就能开始的小事",
  "smaller_step": "更小的一步（点「换更小的」时用）",
  "steps": [ { "text": "拆出来的一步", "size": "🌱" } ],
  "reply": "小助手要说的话",
  "safety": false
}
```
`safety: true` 表示用户表达了伤害自己的念头，网页会停止游戏化回应，只显示求助信息。

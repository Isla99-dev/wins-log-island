/*
 * 假的 AI 接口（第 1 期 1a）：不联网、不需要 key，返回写死的示例 JSON，
 * 用来把「说话 → 回复 → Wins 卡片 → 小岛 +1」整个流程先跑通。
 *
 * 和真正的后端（worker/ 的 /chat）收发同一种东西：
 *   MockAPI.chat(request) → Promise<返回 JSON>
 *   request = { text, wins: [{ text, date }], summary, energy, lang }   见 js/ai/ai-mode.js
 * 以后接真接口时，只要 ai-mode.js 里把 transport 换成 fetch 到 worker 的地址，这个文件就用不上了。
 */
var MockAPI = (function () {
  var CRISIS = /(想死|不想活|活着没意思|自杀|轻生|结束生命|伤害自己|自残|割腕|kill myself|suicid|end my life|hurt myself|self[- ]harm)/i;
  var EN = /[a-z]{3,}/i;

  var SAMPLES = {
    zh: {
      wins: [
        { text: "打开了电脑", note: "最难的是开始，这一步你已经迈过了。" },
        { text: "回了一封邮件", note: "一件悬着的事落地了。" }
      ],
      next_step: "把要写的文档打开，只写一个标题",
      smaller_step: "只把文档打开，先不用写",
      reply: "听起来你今天已经动起来了，这不算小。接下来不用冲刺，只要一个很小的开头就好。"
    },
    en: {
      wins: [
        { text: "Opened the laptop", note: "Starting is the hard part, and you've done it." },
        { text: "Replied to one email", note: "One loose end, tied." }
      ],
      next_step: "Open the document and write just the title",
      smaller_step: "Just open the document, no writing yet",
      reply: "Sounds like you've already got moving today, and that counts. No sprinting needed, just one tiny start."
    }
  };

  function chat(request) {
    var text = (request && request.text) || "";
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (CRISIS.test(text)) {
          resolve({ wins: [], next_step: null, smaller_step: null, reply: "", safety: true });
          return;
        }
        var s = SAMPLES[(request && request.lang === "en") || (EN.test(text) && !/[一-鿿]/.test(text)) ? "en" : "zh"];
        resolve({ wins: s.wins, next_step: s.next_step, smaller_step: s.smaller_step, reply: s.reply, safety: false });
      }, 700 + Math.random() * 500);
    });
  }

  return { chat: chat };
})();

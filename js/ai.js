/*
 * 小岛助手的“大脑”（第 5 步：模拟回复）
 *
 * 页面上的其他代码只用一个接口：
 *
 *   AI.chat(messages, context)  →  Promise<{ reply: string, plan: null | { mode, items } }>
 *
 *   messages: [{ role: "user" | "assistant", text: "..." }, ...]   最新一条在最后
 *   context:  { todos: [文字...], wins: [文字...] }                  今天的任务情况
 *   plan.mode: "todo"（想做的事 → 加进任务）或 "done"（做完的事 → 全部划掉）
 *   plan.items: ["回邮件", "洗衣服", ...]
 *
 * 现在用的是 MockBrain：按关键词判断意图，把一句话拆成几件小事，没有真正的理解能力。
 *
 * 以后接入真正的 AI：
 *   写一个新的 brain（比如 RemoteBrain），在 chat() 里把 messages 发到本地小后端
 *   （例如 http://localhost:8787/api/chat），由后端带着密钥去调用 AI 接口，
 *   再把结果整理成上面同样的格式返回，然后 AI.use(RemoteBrain) 即可。
 *   ⚠️ 密钥只放在后端，绝不能写进这个文件或任何网页文件。
 */
var AI = (function () {

  // ---------- 模拟大脑 ----------
  var MockBrain = (function () {
    var DONE_RE = /(已经|做完|完成了|搞定|弄完|写完|跑完|看完|读完|做好|弄好|整理好|收拾好|交了|发了|回了|买了|去了|刚刚|刚才|今天做了)/;
    var TODO_RE = /(想|要|打算|计划|准备|需要|得去|待会|等下|一会儿|今天.{0,4}做|安排)/;
    var STUCK_RE = /(不想动|不想做|没动力|没劲|好累|太累|拖延|提不起|焦虑|好烦|烦死|启动不了|动不了|不想起|摆烂)/;
    var HELLO_RE = /^(你好|您好|嗨|hi|hello|hey|在吗|哈喽|早上好|早安|晚上好)/i;

    var LEAD_RE = /^(我今天|今天我|今天上午|今天下午|今天晚上|今天|我|上午|下午|晚上|已经|刚刚|刚才|然后|还要|还想|也要|也想|想要|想|要|打算|计划|准备|需要|先|再|另外|也|还(?![书钱款债了]))+/;
    var TAIL_RE = /(了|吧|啦|呢|哦|呀|啊|嘛|的说)+$/;
    var SPLIT_RE = /[，,、；;。！!？?\n：:]|还有|然后|以及|接着|另外|再就是|之后/;
    var FILLER_RE = /^(做)?(这些|这几件|几件事|以下|下面|一些事|点事|事情)/;

    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    function extract(text) {
      var seen = {};
      return text.split(SPLIT_RE)
        .map(function (s) {
          s = s.trim();
          for (var i = 0; i < 3; i++) s = s.replace(LEAD_RE, "").replace(TAIL_RE, "").trim();
          return s;
        })
        .filter(function (s) {
          if (s.length < 2 || FILLER_RE.test(s) || seen[s]) return false;
          seen[s] = true;
          return true;
        })
        .slice(0, 8);
    }

    function chat(messages) {
      var last = messages[messages.length - 1];
      var text = (last && last.text || "").trim();

      if (STUCK_RE.test(text)) {
        return {
          reply: pick([
            "听起来有点卡住了，这很正常，不是你不够好。",
            "嗯，会有这样的时候。先别急着逼自己。"
          ]) + "我的「启动助手」本领还在练习中，第 6 步就会上线。现在可以试一个超小的动作：只做 2 分钟，或者只把要用的东西拿出来放在面前。",
          plan: null
        };
      }

      if (HELLO_RE.test(text) && text.length < 8) {
        return {
          reply: pick(["嗨！今天想做点什么？", "你好呀～今天过得怎么样？"]) +
            "你可以告诉我今天想做的事，或者已经做完的事，我帮你整理成清单。",
          plan: null
        };
      }

      var mode = DONE_RE.test(text) ? "done" : TODO_RE.test(text) ? "todo" : null;
      var items = extract(text);
      // 没说“想做”还是“做完了”，但列了好几件事 → 当作想做的事
      if (!mode && items.length >= 2) mode = "todo";

      if (mode && items.length) {
        if (mode === "todo") {
          return {
            reply: "好呀，我帮你整理成 " + items.length + " 件小事。不想做的可以取消勾选，然后点「种到田里」。" +
              pick(["先从最简单的那件开始吧。", "一件一件来，不用一口气做完。", "做完一件，小岛就会长出一样东西。"]),
            plan: { mode: "todo", items: items }
          };
        }
        return {
          reply: pick(["哇，", "真棒，", "好厉害，"]) + "已经做完 " + items.length + " 件了！我把它们记下来，点一下就全部划掉。",
          plan: { mode: "done", items: items }
        };
      }

      if (mode) {
        return {
          reply: "听起来你有安排了！可以一件一件告诉我，用逗号或顿号隔开，比如「回邮件、洗衣服、读 10 页书」。",
          plan: null
        };
      }

      return {
        reply: "我现在还在练习模式，只能听懂简单的话。你可以告诉我今天想做什么（比如「今天想回邮件、洗衣服」），或者已经做完了什么（比如「我已经跑完步了，还写完了周报」）。",
        plan: null
      };
    }

    return { chat: chat };
  })();

  // ---------- 对外接口 ----------
  var brain = MockBrain;

  function chat(messages, context) {
    // 模拟一点“思考”的时间，让对话更自然
    var delay = 500 + Math.random() * 600;
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(brain.chat(messages, context || {})); } catch (e) { reject(e); }
      }, delay);
    });
  }

  return {
    chat: chat,
    use: function (b) { brain = b; },
    isMock: function () { return brain === MockBrain; }
  };
})();

/*
 * 小岛助手的“大脑”（第 5–6 步：模拟回复）
 *
 * 页面上的其他代码只用一个接口：
 *
 *   AI.chat(messages, context)  →  Promise<Reply>
 *
 *   messages: [{ role: "user" | "assistant", text, flow? }, ...]   最新一条在最后
 *   context:  { todos: [文字...], wins: [文字...] }                  今天的任务情况
 *
 *   Reply = {
 *     reply: "要说的话",
 *     plan:  null | { mode, items, source? },
 *            mode = "todo"  想做的事 → 加进任务
 *                   "done"  做完的事 → 全部划掉
 *                   "split" 把 source 这件大任务换成 items 这几个小步骤
 *     quickReplies: ["可以直接点的回答", ...]   （可选）
 *     flow: { name, stage }                       （可选，多轮对话走到哪一步了）
 *   }
 *
 * 现在用的是 MockBrain：按关键词判断意图、套用写好的模板，没有真正的理解能力。
 *
 * 以后接入真正的 AI：
 *   写一个新的 brain（比如 RemoteBrain），在 chat() 里把 messages 发到本地小后端
 *   （例如 http://localhost:8787/api/chat），由后端带着密钥去调用 AI 接口，
 *   再把结果整理成上面同样的格式返回，然后 AI.use(RemoteBrain) 即可。
 *   ⚠️ 密钥只放在后端，绝不能写进这个文件或任何网页文件。
 *
 * 启动助手的定位：鼓励和陪伴，不是心理治疗；遇到危机表达时优先建议寻求专业帮助。
 */
var AI = (function () {

  var MockBrain = (function () {
    // ---------- 关键词 ----------
    var CRISIS_RE = /(想死|不想活|活着没意思|自杀|轻生|结束生命|伤害自己|自残|割腕)/;
    var DONE_RE = /(已经|做完|完成了|搞定|弄完|写完|跑完|看完|读完|做好|弄好|整理好|收拾好|交了|发了|回了|买了|去了|刚刚|刚才|今天做了)/;
    var TODO_RE = /(想|要|打算|计划|准备|需要|得去|待会|等下|一会儿|今天.{0,4}做|安排)/;
    var STUCK_RE = /(不想动|不想做|没动力|没劲|好累|太累|拖延|提不起|焦虑|好烦|烦死|启动不了|动不了|不想起|摆烂|帮我启动)/;
    var SPLIT_RE_INTENT = /(拆|分解|分成|切小|太大了)/;
    var BETTER_RE = /^(我好一点了|好多了|好一点了|可以了|谢谢)/;
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

    // ---------- 卡住的原因 & 对应的小方法 ----------
    var REASONS = [
      {
        key: "tired", label: "😴 太累了，没电", re: /(累|困|没精神|没力气|疲|睡不好|没睡)/,
        reply: "累的时候，大脑会把每件事都看得比实际更难，这不是你懒。先照顾一下身体，再挑一件最轻松的小事。",
        step: "喝一杯水，站起来伸个懒腰"
      },
      {
        key: "big", label: "🏔 事情太大，不知道从哪开始", re: /(太大|太难|从哪|无从下手|复杂|好多步|工程)/
      },
      {
        key: "fear", label: "😟 怕做不好", re: /(怕|担心|做不好|完美|失败|丢人|紧张|压力)/,
        reply: "怕做不好，往往是因为你很在乎。试试「允许第一版很烂」：先做一个粗糙的版本，之后再慢慢改，粗糙的开始也比完美的空白好。",
        step: "给自己 10 分钟，做一个「很烂也没关系」的初稿"
      },
      {
        key: "choice", label: "🌫 事情太多，不知道先做哪个", re: /(太多|先做哪|选不|不知道先|一堆|好多事)/
      },
      {
        key: "phone", label: "📱 总想刷手机", re: /(手机|刷|分心|视频|游戏|小红书|抖音|微博|b站)/i,
        reply: "手机就在手边时，大脑很难抵抗，这跟意志力关系不大。我们让开始更容易、分心更难一点。",
        step: "把手机放到另一个房间，定一个 15 分钟的计时器"
      },
      {
        key: "unclear", label: "💭 说不上来", re: /(说不上|不知道为什么|就是不想|没原因|不清楚)/,
        reply: "说不上来也没关系，有时候就是没状态。我们不找原因了，试试「2 分钟法则」：只做 2 分钟，2 分钟后想停就停。",
        step: "挑一件事，只做 2 分钟"
      }
    ];

    // ---------- 大任务拆小的模板 ----------
    var SPLITS = [
      { re: /(写|论文|报告|文章|作业|周报|稿|essay|简历|ppt|总结)/i, steps: ["打开文档，只写下标题（2 分钟）", "列 3 个要点，不用写成完整句子", "挑最简单的要点写一小段", "把其他要点各补几句", "从头读一遍，改掉最明显的问题"] },
      { re: /(学|复习|背|读|看书|课|考试|题|单词|网课)/, steps: ["把书或资料打开放在面前（1 分钟）", "定一个 15 分钟的计时器", "只看第一小节，或只做第一道题", "用一句话写下学到了什么", "休息 5 分钟，再决定要不要继续"] },
      { re: /(打扫|收拾|整理|洗|房间|卫生|衣服|碗|桌|厨房|冰箱)/, steps: ["拿一个袋子，把看得到的垃圾装进去（2 分钟）", "只整理一个小区域，比如桌面的左半边", "把东西放回原位", "擦一擦表面", "看看成果，拍张照给自己"] },
      { re: /(邮件|回复|消息|电话|联系|发给|微信|沟通|申请)/, steps: ["打开邮箱或聊天窗口（1 分钟）", "只写第一句话", "把要说的事列成 2–3 点", "补完整，读一遍", "点发送"] },
      { re: /(跑|运动|健身|锻炼|瑜伽|走路|散步|游泳|骑车)/, steps: ["换上运动的衣服和鞋（2 分钟）", "先慢走或热身 5 分钟", "完成计划的一半", "还有力气的话，完成剩下的", "拉伸 3 分钟"] },
      { re: /(买|超市|取|寄|办|银行|预约|缴费|快递)/, steps: ["写下要买或要办的清单（2 分钟）", "查一下地点和开门时间", "带上需要的东西出门", "办完一件就划掉一件"] }
    ];
    var SPLIT_DEFAULT = ["花 2 分钟写下：做完是什么样子", "找出一个小到不可能失败的第一个动作", "只做这个动作 5 分钟", "决定下一步，再做 10 分钟", "收尾，记下完成了什么"];

    function shortName(text) {
      return text.length > 8 ? text.slice(0, 8) + "…" : text;
    }

    function splitTask(task) {
      var tpl = SPLIT_DEFAULT;
      for (var i = 0; i < SPLITS.length; i++) if (SPLITS[i].re.test(task)) { tpl = SPLITS[i].steps; break; }
      var name = shortName(task);
      return {
        reply: "我们把「" + task + "」切到小得不可能失败。第一步只要几分钟，做完它就算启动成功了。不合适的步骤可以取消勾选。",
        plan: { mode: "split", source: task, items: tpl.map(function (s) { return name + " · " + s; }) },
        quickReplies: ["换个原因", "我好一点了"],
        flow: null
      };
    }

    // 从“帮我把「写论文」拆小一点”这类话里找出任务名
    function findSplitTarget(text, todos) {
      var m = text.match(/[「“"『](.+?)[」”"』]/);
      if (m) return m[1];
      m = text.match(/拆[一下小点开]*[:：]\s*(.+)$/);
      if (m) return m[1].trim();
      for (var i = 0; i < todos.length; i++) if (text.indexOf(todos[i]) >= 0) return todos[i];
      return null;
    }

    function tinyStep(reason) {
      return {
        reply: reason.reply + "\n\n超小第一步：" + reason.step + "。要不要把它种到田里？做完我帮你记下来。",
        plan: { mode: "todo", items: [reason.step] },
        quickReplies: ["换个原因", "帮我拆一个任务", "我好一点了"],
        flow: null
      };
    }

    function askWhich(todos, stage, question) {
      var replies = todos.slice(0, 4);
      return {
        reply: question + (replies.length ? "可以直接点下面的任务，也可以打字告诉我。" : "打字告诉我是哪件事就好，比如「写论文」。"),
        plan: null,
        quickReplies: replies,
        flow: { name: "unstuck", stage: stage }
      };
    }

    function startUnstuck() {
      return {
        reply: pick(["听起来有点卡住了，这很正常，不是你不够好。", "嗯，会有这样的时候，先别急着逼自己。"]) +
          "我们一起看看是什么拦住了你？选一个最像的就好。\n（我不是心理咨询师，只是陪你想想办法。）",
        plan: null,
        quickReplies: REASONS.map(function (r) { return r.label; }),
        flow: { name: "unstuck", stage: "reason" }
      };
    }

    function matchReason(text) {
      for (var i = 0; i < REASONS.length; i++) {
        if (text === REASONS[i].label || REASONS[i].re.test(text)) return REASONS[i];
      }
      return null;
    }

    function handleReason(reason, todos) {
      if (reason.key === "big") {
        return askWhich(todos, "split", "任务太大时，大脑看不到起点，就会想逃开。我们把它切小一点。是哪件事？");
      }
      if (reason.key === "choice") {
        return askWhich(todos, "pickOne", "事情太多时，光是选择就会耗掉力气。规则很简单：挑最小的那件，或者最想做的那件，其他的先不管。选一件吧？");
      }
      return tinyStep(reason);
    }

    // ---------- 主入口 ----------
    function chat(messages, context) {
      var last = messages[messages.length - 1];
      var text = (last && last.text || "").trim();
      var todos = (context && context.todos) || [];
      var prev = null;
      for (var i = messages.length - 2; i >= 0; i--) if (messages[i].role === "assistant") { prev = messages[i]; break; }
      var flow = prev && prev.flow;

      // 0. 安全第一
      if (CRISIS_RE.test(text)) {
        return {
          reply: "听到你这么说，我很担心你。你现在的感受很重要，值得被认真对待。\n\n" +
            "我只是一个小助手，给不了你此刻需要的支持。请联系一位信任的人，或者专业的心理援助热线：\n" +
            "· 英国 Samaritans：116 123（24 小时，免费）\n" +
            "· 北京心理危机研究与干预中心：010-82951332\n" +
            "· 如果有立即的危险，请拨打当地急救电话（英国 999 / 中国 120）\n\n" +
            "你不需要一个人扛着。",
          plan: null, quickReplies: null, flow: null
        };
      }

      // 1. 快捷回答（优先于多轮对话，避免把「换个原因」当成任务名）
      if (text === "换个原因") return startUnstuck();
      if (text === "帮我拆一个任务") return askWhich(todos, "split", "好，拆哪一件？");
      if (BETTER_RE.test(text)) {
        return {
          reply: pick(["太好了。记住：开始的那一刻是最难的，你已经在路上了 🌱", "真好。慢慢来，一件一件做，小岛会陪着你。"]),
          plan: null, quickReplies: null, flow: null
        };
      }

      // 2. 多轮对话：接着上一个问题
      if (flow && flow.name === "unstuck") {
        if (flow.stage === "reason") {
          var reason = matchReason(text);
          if (reason) return handleReason(reason, todos);
        }
        if (flow.stage === "split" && text.length >= 2 && !STUCK_RE.test(text)) {
          return splitTask(findSplitTarget(text, todos) || text.replace(TAIL_RE, ""));
        }
        if (flow.stage === "pickOne" && text.length >= 2) {
          var task = findSplitTarget(text, todos) || text;
          return {
            reply: "就它了。不用想着做完，只要开始：先对「" + task + "」做 5 分钟，5 分钟后你可以停下，也可以继续。",
            plan: { mode: "todo", items: [shortName(task) + " · 只做 5 分钟"] },
            quickReplies: ["帮我拆一个任务", "我好一点了"],
            flow: null
          };
        }
      }

      // 3. 拆任务
      if (SPLIT_RE_INTENT.test(text)) {
        var target = findSplitTarget(text, todos);
        if (target) return splitTask(target);
        return askWhich(todos, "split", "好，拆哪一件？");
      }

      // 4. 卡住了
      if (STUCK_RE.test(text)) return startUnstuck();

      // 5. 打招呼
      if (HELLO_RE.test(text) && text.length < 8) {
        return {
          reply: pick(["嗨！今天想做点什么？", "你好呀～今天过得怎么样？"]) +
            "你可以告诉我今天想做的事、已经做完的事，或者跟我说你有点不想动。",
          plan: null
        };
      }

      // 6. 想做的事 / 做完的事
      var mode = DONE_RE.test(text) ? "done" : TODO_RE.test(text) ? "todo" : null;
      var items = extract(text);
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
        reply: "我现在还在练习模式，只能听懂简单的话。你可以告诉我今天想做什么、已经做完了什么，或者说「有点不想动」「帮我拆：写论文」。",
        plan: null
      };
    }

    return { chat: chat };
  })();

  // ---------- 对外接口 ----------
  var brain = MockBrain;

  function chat(messages, context) {
    var delay = 500 + Math.random() * 600; // 模拟一点“思考”的时间
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

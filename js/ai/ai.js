/*
 * 小岛助手的“大脑”（第 5–8 步：模拟回复，中英双语）
 *
 * 页面上的其他代码只用一个接口：
 *
 *   AI.chat(messages, context)  →  Promise<Reply>
 *
 *   messages: [{ role: "user" | "assistant", text, flow? }, ...]   最新一条在最后
 *   context:  { todos: [文字...], wins: [文字...], lang: "zh" | "en" }
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
 * 中文和英文各有一套关键词和回复模板（下面的 PACKS），用你这句话的语言回答。
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

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // ======================= 中文 =======================
  var ZH = {
    re: {
      crisis: /(想死|不想活|活着没意思|自杀|轻生|结束生命|伤害自己|自残|割腕)/,
      done: /(已经|做完|完成了|搞定|弄完|写完|跑完|看完|读完|做好|弄好|整理好|收拾好|交了|发了|回了|买了|去了|刚刚|刚才|今天做了)/,
      todo: /(想|要|打算|计划|准备|需要|得去|待会|等下|一会儿|今天.{0,4}做|安排)/,
      stuck: /(不想动|不想做|没动力|没劲|好累|太累|拖延|提不起|焦虑|好烦|烦死|启动不了|动不了|不想起|摆烂|帮我启动)/,
      split: /(拆|分解|分成|切小|太大了)/,
      better: /^(我好一点了|好多了|好一点了|可以了|谢谢)/,
      hello: /^(你好|您好|嗨|hi|hello|hey|在吗|哈喽|早上好|早安|晚上好)/i
    },
    lead: /^(我今天|今天我|今天上午|今天下午|今天晚上|今天|我|上午|下午|晚上|已经|刚刚|刚才|然后|还要|还想|也要|也想|想要|想|要|打算|计划|准备|需要|先|再|另外|也|还(?![书钱款债了]))+/,
    tail: /(了|吧|啦|呢|哦|呀|啊|嘛|的说)+$/,
    splitter: /[，,、；;。！!？?\n：:]|还有|然后|以及|接着|另外|再就是|之后/,
    filler: /^(做)?(这些|这几件|几件事|以下|下面|一些事|点事|事情)/,
    minLen: 2,
    quick: { another: "换个原因", split: "帮我拆一个任务", better: "我好一点了" },

    reasons: [
      { key: "tired", label: "😴 太累了，没电", re: /(累|困|没精神|没力气|疲|睡不好|没睡)/,
        reply: "累的时候，大脑会把每件事都看得比实际更难，这不是你懒。先照顾一下身体，再挑一件最轻松的小事。",
        step: "喝一杯水，站起来伸个懒腰" },
      { key: "big", label: "🏔 事情太大，不知道从哪开始", re: /(太大|太难|从哪|无从下手|复杂|好多步|工程)/ },
      { key: "fear", label: "😟 怕做不好", re: /(怕|担心|做不好|完美|失败|丢人|紧张|压力)/,
        reply: "怕做不好，往往是因为你很在乎。试试「允许第一版很烂」：先做一个粗糙的版本，之后再慢慢改，粗糙的开始也比完美的空白好。",
        step: "给自己 10 分钟，做一个「很烂也没关系」的初稿" },
      { key: "choice", label: "🌫 事情太多，不知道先做哪个", re: /(太多|先做哪|选不|不知道先|一堆|好多事)/ },
      { key: "phone", label: "📱 总想刷手机", re: /(手机|刷|分心|视频|游戏|小红书|抖音|微博|b站)/i,
        reply: "手机就在手边时，大脑很难抵抗，这跟意志力关系不大。我们让开始更容易、分心更难一点。",
        step: "把手机放到另一个房间，定一个 15 分钟的计时器" },
      { key: "unclear", label: "💭 说不上来", re: /(说不上|不知道为什么|就是不想|没原因|不清楚)/,
        reply: "说不上来也没关系，有时候就是没状态。我们不找原因了，试试「2 分钟法则」：只做 2 分钟，2 分钟后想停就停。",
        step: "挑一件事，只做 2 分钟" }
    ],

    splits: [
      { re: /(写|论文|报告|文章|作业|周报|稿|essay|简历|ppt|总结)/i, steps: ["打开文档，只写下标题（2 分钟）", "列 3 个要点，不用写成完整句子", "挑最简单的要点写一小段", "把其他要点各补几句", "从头读一遍，改掉最明显的问题"] },
      { re: /(学|复习|背|读|看书|课|考试|题|单词|网课)/, steps: ["把书或资料打开放在面前（1 分钟）", "定一个 15 分钟的计时器", "只看第一小节，或只做第一道题", "用一句话写下学到了什么", "休息 5 分钟，再决定要不要继续"] },
      { re: /(打扫|收拾|整理|洗|房间|卫生|衣服|碗|桌|厨房|冰箱)/, steps: ["拿一个袋子，把看得到的垃圾装进去（2 分钟）", "只整理一个小区域，比如桌面的左半边", "把东西放回原位", "擦一擦表面", "看看成果，拍张照给自己"] },
      { re: /(邮件|回复|消息|电话|联系|发给|微信|沟通|申请)/, steps: ["打开邮箱或聊天窗口（1 分钟）", "只写第一句话", "把要说的事列成 2–3 点", "补完整，读一遍", "点发送"] },
      { re: /(跑|运动|健身|锻炼|瑜伽|走路|散步|游泳|骑车)/, steps: ["换上运动的衣服和鞋（2 分钟）", "先慢走或热身 5 分钟", "完成计划的一半", "还有力气的话，完成剩下的", "拉伸 3 分钟"] },
      { re: /(买|超市|取|寄|办|银行|预约|缴费|快递)/, steps: ["写下要买或要办的清单（2 分钟）", "查一下地点和开门时间", "带上需要的东西出门", "办完一件就划掉一件"] }
    ],
    splitDefault: ["花 2 分钟写下：做完是什么样子", "找出一个小到不可能失败的第一个动作", "只做这个动作 5 分钟", "决定下一步，再做 10 分钟", "收尾，记下完成了什么"],

    shortName: function (t) { return t.length > 8 ? t.slice(0, 8) + "…" : t; },
    findTarget: function (text, todos) {
      var m = text.match(/[「“"『](.+?)[」”"』]/);
      if (m) return m[1];
      m = text.match(/拆[一下小点开]*[:：]\s*(.+)$/);
      if (m) return m[1].trim();
      return null;
    },

    say: {
      crisis: "听到你这么说，我很担心你。你现在的感受很重要，值得被认真对待。\n\n" +
        "我只是一个小助手，给不了你此刻需要的支持。请联系一位信任的人，或者专业的心理援助热线：\n" +
        "· 英国 Samaritans：116 123（24 小时，免费）\n" +
        "· 北京心理危机研究与干预中心：010-82951332\n" +
        "· 如果有立即的危险，请拨打当地急救电话（英国 999 / 中国 120）\n\n" +
        "你不需要一个人扛着。",
      stuckOpen: function () {
        return pick(["听起来有点卡住了，这很正常，不是你不够好。", "嗯，会有这样的时候，先别急着逼自己。"]) +
          "我们一起看看是什么拦住了你？选一个最像的就好。\n（我不是心理咨询师，只是陪你想想办法。）";
      },
      tiny: function (r) { return r.reply + "\n\n超小第一步：" + r.step + "。要不要把它种到田里？做完我帮你记下来。"; },
      askBig: "任务太大时，大脑看不到起点，就会想逃开。我们把它切小一点。是哪件事？",
      askChoice: "事情太多时，光是选择就会耗掉力气。规则很简单：挑最小的那件，或者最想做的那件，其他的先不管。选一件吧？",
      askSplit: "好，拆哪一件？",
      askTail: function (has) { return has ? "可以直接点下面的任务，也可以打字告诉我。" : "打字告诉我是哪件事就好，比如「写论文」。"; },
      pickOne: function (t) { return "就它了。不用想着做完，只要开始：先对「" + t + "」做 5 分钟，5 分钟后你可以停下，也可以继续。"; },
      pickOneItem: function (name) { return name + " · 只做 5 分钟"; },
      split: function (t) { return "我们把「" + t + "」切到小得不可能失败。第一步只要几分钟，做完它就算启动成功了。不合适的步骤可以取消勾选。"; },
      better: function () { return pick(["太好了。记住：开始的那一刻是最难的，你已经在路上了 🌱", "真好。慢慢来，一件一件做，小岛会陪着你。"]); },
      hello: function () {
        return pick(["嗨！今天想做点什么？", "你好呀～今天过得怎么样？"]) + "你可以告诉我今天想做的事、已经做完的事，或者跟我说你有点不想动。";
      },
      todo: function (n) {
        return "好呀，我帮你整理成 " + n + " 件小事。不想做的可以取消勾选，然后点「种到田里」。" +
          pick(["先从最简单的那件开始吧。", "一件一件来，不用一口气做完。", "做完一件，小岛就会长出一样东西。"]);
      },
      done: function (n) { return pick(["哇，", "真棒，", "好厉害，"]) + "已经做完 " + n + " 件了！我把它们记下来，点一下就全部划掉。"; },
      needList: "听起来你有安排了！可以一件一件告诉我，用逗号或顿号隔开，比如「回邮件、洗衣服、读 10 页书」。",
      fallback: "我现在还在练习模式，只能听懂简单的话。你可以告诉我今天想做什么、已经做完了什么，或者说「有点不想动」「帮我拆：写论文」。"
    },

    // 中文：先看“做完了”，再看“想做”
    mode: function (text) { return this.re.done.test(text) ? "done" : this.re.todo.test(text) ? "todo" : null; },
    tidy: function (s) { return s; }
  };

  // ======================= English =======================
  var EN = {
    re: {
      crisis: /(kill myself|suicid|end my life|don'?t want to (live|be alive)|want to die|hurt myself|self[- ]?harm)/i,
      done: /\b(already|finished|completed|done|did)\b/i,
      pastVerb: /\b(went|wrote|sent|cleaned|tidied|replied|bought|ran|called|cooked|washed|walked|submitted|paid|fixed|just)\b/i,
      todo: /\b(want to|wanna|need to|have to|got to|gotta|going to|gonna|plan to|planning to|would like to|i'?d like to|should|hope to|today i'?ll|to-?do)\b/i,
      stuck: /(don'?t feel like|can'?t get (myself )?started|can'?t start|no motivation|unmotivated|procrastinat|so tired|exhausted|stuck|lazy|overwhelmed|help me (get )?start)/i,
      split: /\b(break (it |this |that )?down|break .+ down|split|chunk|smaller steps)\b/i,
      better: /^(i feel better|i'?m feeling better|feeling better|better now|i'?m (ok|okay|good) now|thanks|thank you)/i,
      hello: /^(hi|hello|hey|hiya|good (morning|afternoon|evening)|yo)\b/i
    },
    lead: /^(today|tonight|this (morning|afternoon|evening)|i'?ve|i have|i'?d like to|i'?m going to|i am going to|i want to|i wanna|i need to|i have to|i'?ll|i will|i'?m|i am|i|already|just|then|also|and|finally|want to|wanna|need to|have to|going to|gonna|plan to|would like to|should|to)\b[\s:,]*/i,
    tail: /([\s.!?]+|\s+(today|already|too|as well|this morning|tonight))$/i,
    splitter: /[,;!?\n:]|\.(?!\d)|\band then\b|\bthen\b|\band\b|\balso\b|\bplus\b/i,
    filler: /^(some things|a few things|these|the following|stuff|things|this|that)$/i,
    minLen: 3,
    quick: { another: "Try another reason", split: "Help me break down a task", better: "I feel better" },

    reasons: [
      { key: "tired", label: "😴 Too tired, no energy", re: /(tired|exhausted|sleepy|no energy|drained|burn(ed|t) out)/i,
        reply: "When you're tired, your brain makes everything look harder than it really is. That's not laziness. Look after your body first, then pick the easiest small thing.",
        step: "Drink a glass of water and stretch" },
      { key: "big", label: "🏔 It's too big, no idea where to start", re: /(too big|too hard|where to start|huge|complicated|so many steps)/i },
      { key: "fear", label: "😟 Scared of doing it badly", re: /(afraid|scared|worried|not good enough|perfect|fail|pressure|nervous)/i,
        reply: "Being scared of doing it badly usually means you care. Try \"let the first draft be bad\": make a rough version now and improve it later. A rough start beats a perfect blank page.",
        step: "Spend 10 minutes on a draft that's allowed to be bad" },
      { key: "choice", label: "🌫 Too many things, can't pick one", re: /(too many|too much to do|which (one )?first|can'?t (choose|decide|pick)|so much)/i },
      { key: "phone", label: "📱 I keep reaching for my phone", re: /(phone|scroll|social media|tiktok|instagram|youtube|distract|games?)/i,
        reply: "With your phone right there, anyone's brain would struggle. It isn't really about willpower. Let's make starting easier and distraction harder.",
        step: "Put your phone in another room and set a 15-minute timer" },
      { key: "unclear", label: "💭 Not sure why", re: /(not sure|don'?t know why|no reason|just don'?t)/i,
        reply: "Not knowing why is fine. Sometimes you're just not in the mood. Let's skip the why and try the 2-minute rule: do it for 2 minutes, then you're allowed to stop.",
        step: "Pick one thing and do it for just 2 minutes" }
    ],

    splits: [
      { re: /(writ|essay|report|thesis|paper|draft|cv|resume|slides|presentation|homework|article)/i, steps: ["Open the document and write just the title (2 min)", "List 3 key points, no full sentences needed", "Write a short paragraph for the easiest point", "Add a few sentences for each other point", "Read it through and fix the most obvious issues"] },
      { re: /(study|revis|learn|read|exam|course|lecture|chapter|vocab|homework)/i, steps: ["Open the book or notes in front of you (1 min)", "Set a 15-minute timer", "Do only the first section, or the first question", "Write one sentence about what you learned", "Take 5 minutes off, then decide whether to go on"] },
      { re: /(clean|tidy|laundry|dishes|room|kitchen|organi[sz]e|declutter|fridge|desk)/i, steps: ["Grab a bag and collect the rubbish you can see (2 min)", "Tidy just one small area, like the left half of the desk", "Put things back where they belong", "Wipe the surfaces", "Look at the result and take a photo for yourself"] },
      { re: /(email|reply|message|call|text|contact|apply|application)/i, steps: ["Open your inbox or chat (1 min)", "Write only the first sentence", "List what you need to say in 2–3 points", "Fill it in and read it once", "Hit send"] },
      { re: /(run|gym|workout|exercise|yoga|walk|swim|cycl|bike)/i, steps: ["Change into your workout clothes and shoes (2 min)", "Walk or warm up for 5 minutes", "Do half of what you planned", "If you've got energy left, do the rest", "Stretch for 3 minutes"] },
      { re: /(buy|shop|groceries|post office|bank|appointment|pick up|errand|parcel)/i, steps: ["Write the shopping or errand list (2 min)", "Check the address and opening hours", "Head out with what you need", "Cross off each one as you go"] }
    ],
    splitDefault: ["Spend 2 minutes writing what 'done' looks like", "Find a first action so small it can't fail", "Do just that action for 5 minutes", "Decide the next step and do 10 more minutes", "Wrap up and note what you finished"],

    shortName: function (t) {
      if (t.length <= 30) return t;
      var cut = t.slice(0, 30);
      var sp = cut.lastIndexOf(" ");
      return (sp > 10 ? cut.slice(0, sp) : cut) + "…";
    },
    findTarget: function (text) {
      var m = text.match(/["“'‘](.+?)["”'’]/);
      if (m) return m[1];
      m = text.match(/(?:break|split|chunk)\s*(?:it|this|that)?\s*(?:down|up)?\s*:?\s*(.+)$/i);
      if (!m) return null;
      var t = m[1].replace(/\s+(into|in)\s+(smaller|small|tiny)?\s*(steps|pieces|chunks|parts)\s*$/i, "")
        .replace(/^(down|up|the|my)\s+/i, "").replace(/[.!?]+$/, "").trim();
      if (!t || /^(a |one )?(task|thing)s?$/i.test(t) || /^(down|up)$/i.test(t)) return null;
      return t;
    },

    say: {
      crisis: "I'm really sorry you're feeling this way, and I'm worried about you. What you're feeling matters.\n\n" +
        "I'm only a little helper and can't give you the support you need right now. Please reach out to someone you trust, or a crisis line:\n" +
        "· UK Samaritans: 116 123 (24/7, free)\n" +
        "· Beijing Psychological Crisis Research and Intervention Center: 010-82951332\n" +
        "· If you're in immediate danger, call your local emergency number (UK 999 / China 120)\n\n" +
        "You don't have to carry this alone.",
      stuckOpen: function () {
        return pick(["Sounds like you're a bit stuck. That's normal, and it doesn't mean you're not good enough. ", "Mm, that happens. No need to push yourself just yet. "]) +
          "Let's look at what's in the way. Pick whichever fits best.\n(I'm not a therapist, just here to help you find a way in.)";
      },
      tiny: function (r) { return r.reply + "\n\nTiny first step: " + r.step + ". Want to plant it in your field? I'll log it once you're done."; },
      askBig: "When a task is too big, your brain can't see where to start, so it wants to run away. Let's cut it smaller. Which one is it? ",
      askChoice: "With too many things, just choosing drains your energy. Simple rule: pick the smallest one, or the one you most want to do, and ignore the rest for now. Which one? ",
      askSplit: "Sure, which one should we break down? ",
      askTail: function (has) { return has ? "Tap a task below, or type it." : "Just type which one, like \"write my essay\"."; },
      pickOne: function (t) { return "That one it is. Don't think about finishing, just start: give \"" + t + "\" 5 minutes. After that you can stop or keep going."; },
      pickOneItem: function (name) { return name + " · just 5 minutes"; },
      split: function (t) { return "Let's cut \"" + t + "\" so small it can't fail. The first step only takes a few minutes, and once it's done, you've started. Untick any step that doesn't fit."; },
      better: function () { return pick(["Wonderful. Remember: starting is the hardest part, and you're already on your way 🌱", "Lovely. One thing at a time. The island's right here with you."]); },
      hello: function () {
        return pick(["Hi! What would you like to do today? ", "Hello! How's your day going? "]) + "Tell me what you'd like to do, what you've already done, or that you're feeling stuck.";
      },
      todo: function (n) {
        return "Sure, I've turned that into " + n + " small thing" + (n === 1 ? "" : "s") + ". Untick anything you don't want, then tap \"Plant them\". " +
          pick(["Start with the easiest one.", "One at a time, no need to do it all at once.", "Each one you finish grows something on your island."]);
      },
      done: function (n) { return pick(["Wow, ", "Amazing, ", "Nice work, "]) + "you've already done " + n + "! I've noted " + (n === 1 ? "it" : "them") + " down. One tap crosses " + (n === 1 ? "it" : "them all") + " off."; },
      needList: "Sounds like you've got plans! Tell me one by one, separated by commas, like \"reply to emails, do laundry, read 10 pages\".",
      fallback: "I'm still in practice mode, so I only understand simple sentences. Tell me what you'd like to do today, what you've already done, or say \"I'm feeling stuck\" or \"break down: write my essay\"."
    },

    // 英文：明确说了 already / finished → 做完；说了 want to / need to → 想做；只有过去式动词 → 做完
    mode: function (text) {
      if (this.re.done.test(text)) return "done";
      if (this.re.todo.test(text)) return "todo";
      if (this.re.pastVerb.test(text)) return "done";
      return null;
    },
    tidy: function (s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  };

  var PACKS = { zh: ZH, en: EN };

  // ======================= 共用的对话逻辑 =======================
  var MockBrain = (function () {

    function extract(P, text) {
      var seen = {};
      return text.split(P.splitter)
        .map(function (s) {
          s = (s || "").trim();
          for (var i = 0; i < 4; i++) s = s.replace(P.lead, "").replace(P.tail, "").trim();
          return s;
        })
        .filter(function (s) {
          if (s.length < P.minLen || P.filler.test(s) || seen[s.toLowerCase()]) return false;
          seen[s.toLowerCase()] = true;
          return true;
        })
        .map(function (s) { return P.tidy(s); })
        .slice(0, 8);
    }

    function splitTask(P, task) {
      task = P.tidy(task);
      var tpl = P.splitDefault;
      for (var i = 0; i < P.splits.length; i++) if (P.splits[i].re.test(task)) { tpl = P.splits[i].steps; break; }
      var name = P.shortName(task);
      return {
        reply: P.say.split(task),
        plan: { mode: "split", source: task, items: tpl.map(function (s) { return name + " · " + s; }) },
        quickReplies: [P.quick.another, P.quick.better],
        flow: null
      };
    }

    function askWhich(P, todos, stage, question) {
      var replies = todos.slice(0, 4);
      return {
        reply: question + P.say.askTail(replies.length > 0),
        plan: null,
        quickReplies: replies,
        flow: { name: "unstuck", stage: stage }
      };
    }

    function startUnstuck(P) {
      return {
        reply: P.say.stuckOpen(),
        plan: null,
        quickReplies: P.reasons.map(function (r) { return r.label; }),
        flow: { name: "unstuck", stage: "reason" }
      };
    }

    function matchReason(P, text) {
      for (var i = 0; i < P.reasons.length; i++) {
        if (text === P.reasons[i].label || P.reasons[i].re.test(text)) return P.reasons[i];
      }
      return null;
    }

    function handleReason(P, reason, todos) {
      if (reason.key === "big") return askWhich(P, todos, "split", P.say.askBig);
      if (reason.key === "choice") return askWhich(P, todos, "pickOne", P.say.askChoice);
      return {
        reply: P.say.tiny(reason),
        plan: { mode: "todo", items: [reason.step] },
        quickReplies: [P.quick.another, P.quick.split, P.quick.better],
        flow: null
      };
    }

    function findTarget(P, text, todos) {
      var t = P.findTarget(text, todos);
      if (t) return t;
      for (var i = 0; i < todos.length; i++) if (text.indexOf(todos[i]) >= 0) return todos[i];
      return null;
    }

    // 用哪种语言回答：这句话里有中文就用中文，有英文字母就用英文，都没有就跟界面一致
    function packFor(text, context) {
      if (/[一-鿿]/.test(text)) return ZH;
      if (/[a-z]/i.test(text)) return EN;
      return PACKS[context.lang] || ZH;
    }

    function chat(messages, context) {
      var last = messages[messages.length - 1];
      var text = (last && last.text || "").trim();
      var todos = context.todos || [];
      var prev = null;
      for (var i = messages.length - 2; i >= 0; i--) if (messages[i].role === "assistant") { prev = messages[i]; break; }
      var flow = prev && prev.flow;

      // 快捷回答按钮的文字，按它本身的语言来认
      var P = packFor(text, context);
      [ZH, EN].forEach(function (pk) {
        var q = pk.quick;
        if (text === q.another || text === q.split || text === q.better) P = pk;
        pk.reasons.forEach(function (r) { if (text === r.label) P = pk; });
      });

      // 0. 安全第一（两种语言都检查）
      if (ZH.re.crisis.test(text) || EN.re.crisis.test(text)) {
        return { reply: P.say.crisis, plan: null, quickReplies: null, flow: null };
      }

      // 1. 快捷回答（优先于多轮对话，避免把「换个原因」当成任务名）
      if (text === P.quick.another) return startUnstuck(P);
      if (text === P.quick.split) return askWhich(P, todos, "split", P.say.askSplit);
      if (P.re.better.test(text)) return { reply: P.say.better(), plan: null, quickReplies: null, flow: null };

      // 2. 多轮对话：接着上一个问题
      if (flow && flow.name === "unstuck") {
        if (flow.stage === "reason") {
          var reason = matchReason(P, text);
          if (reason) return handleReason(P, reason, todos);
        }
        if (flow.stage === "split" && text.length >= 2 && !P.re.stuck.test(text)) {
          return splitTask(P, findTarget(P, text, todos) || text.replace(P.tail, ""));
        }
        if (flow.stage === "pickOne" && text.length >= 2) {
          var task = findTarget(P, text, todos) || text;
          return {
            reply: P.say.pickOne(task),
            plan: { mode: "todo", items: [P.say.pickOneItem(P.shortName(task))] },
            quickReplies: [P.quick.split, P.quick.better],
            flow: null
          };
        }
      }

      // 3. 拆任务
      if (P.re.split.test(text)) {
        var target = findTarget(P, text, todos);
        if (target) return splitTask(P, target);
        return askWhich(P, todos, "split", P.say.askSplit);
      }

      // 4. 卡住了
      if (P.re.stuck.test(text)) return startUnstuck(P);

      // 5. 打招呼
      if (P.re.hello.test(text) && text.length < 20) return { reply: P.say.hello(), plan: null };

      // 6. 想做的事 / 做完的事
      var mode = P.mode(text);
      var items = extract(P, text);
      if (!mode && items.length >= 2) mode = "todo";

      if (mode && items.length) {
        return {
          reply: mode === "todo" ? P.say.todo(items.length) : P.say.done(items.length),
          plan: { mode: mode, items: items }
        };
      }
      if (mode) return { reply: P.say.needList, plan: null };
      return { reply: P.say.fallback, plan: null };
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

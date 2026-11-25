/*
 * 双语（第 8 步）
 *
 * - 界面上的文字都写在下面的字典里，用 I18n.t("key") 取
 * - 文字里的 {name} 会被替换：I18n.t("island.next", { n: 3, name: "小屋" })
 * - HTML 里可以写 data-i18n="key"（文字）、data-i18n-placeholder、data-i18n-aria、data-i18n-title
 * - 切换语言会记住选择，然后刷新页面
 * - 用户自己写的任务和聊天内容不翻译
 */
var I18n = (function () {
  var KEY = "winslog-lang";
  var lang = "zh";
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "zh" || saved === "en") lang = saved;
  } catch (e) { /* 读不到就用中文 */ }

  var D = {
    zh: {
      "app.title": "Wins Log 小岛",
      "brand.island": "小岛",
      "date.aria": "今天的日期",
      "tabs.aria": "切换页面",
      "tab.island": "🏝 我的小岛",
      "tab.map": "🗺 世界地图",
      "lang.aria": "切换语言：现在是中文",
      "week": ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],

      "tasks.title": "今日任务",
      "tasks.placeholder": "写下今天想做的一件事…",
      "tasks.inputAria": "新任务",
      "tasks.add": "种下",
      "tasks.empty": "今天还没有任务。写下一件小事，按回车就好。",
      "tasks.completeAria": "完成：{text}",
      "tasks.splitAria": "请小助手拆小一点",
      "tasks.splitTitle": "太大了？让小助手拆小一点",
      "tasks.deleteAria": "删除这条",
      "tasks.splitRequest": "帮我把「{text}」拆小一点",
      "wins.title": "今天的 Wins",
      "wins.unit": "件",
      "wins.empty": "还没有记录。完成一件小事，就会出现在这里。",
      "wins.undoAria": "撤回，放回任务",
      "endDay": "🖨 结束今天",

      "island.title": "我的小岛",
      "island.aria": "像素小岛：今天的任务种在田里，完成过的事都长在岛上",
      "island.zero": "完成第一件事，岛上就会长出第一样东西。",
      "island.count": "小岛上已经长出 {n} 样东西。",
      "island.countOne": "小岛上已经长出 1 样东西。",
      "island.next": "再完成 {n} 件，会出现{name}。",
      "island.full": "小岛已经很热闹啦，继续让它更茂盛吧。",
      "island.m15": "温馨小屋",
      "island.m30": "小码头和小船",
      "island.m60": "海上灯塔",
      "island.tipDone": "🌾 {text}（今天完成）",
      "island.tipGrowing": "🌱 {text}（还在长）",
      "island.tipItem": "⭐ {text} · {date}",
      "island.date": "{m} 月 {d} 日",

      "helper.title": "小岛助手",
      "helper.mode": "练习模式",
      "helper.modeTitle": "现在是模拟回复，以后会接入真正的 AI",
      "chip.plan": "🌱 今天想做…",
      "chip.planFill": "今天想做：",
      "chip.done": "✨ 我已经做完了…",
      "chip.doneFill": "我已经做完了：",
      "chip.stuck": "🫠 有点不想动",
      "chip.stuckFill": "有点不想动",
      "chat.placeholder": "跟小助手说点什么…",
      "chat.inputAria": "和小助手聊天",
      "chat.mic": "语音输入",
      "chat.micStop": "停止语音输入",
      "chat.micTitle": "点一下开始说，再点一下结束",
      "chat.send": "发送",
      "chat.hint": "可以打字，也可以点 🎙 用说的。",
      "chat.greeting": "嗨，我是住在岛上的小助手 🌱 告诉我今天想做什么，或者已经做完了什么，我帮你整理成清单。",
      "chat.typing": "小助手正在输入",
      "chat.oops": "哎呀，我刚刚走神了，可以再说一次吗？",
      "chat.pickOne": "先勾选至少一件哦。",
      "plan.todo": "🌱 种到田里",
      "plan.done": "✨ 全部划掉",
      "plan.split": "✂ 换成这几步",
      "plan.todoDone": "✓ 已种下 {n} 件",
      "plan.doneDone": "✓ 已划掉 {n} 件",
      "plan.splitReplaced": "✓ 已换成 {n} 个小步骤",
      "plan.splitAdded": "✓ 已种下 {n} 个小步骤",
      "mic.unsupported": "这个浏览器暂时不支持语音输入，可以换 Chrome 或 Safari 试试，或者直接打字。",
      "mic.listening": "我在听…说完再点一下 🎙，或者停一下就好。",
      "mic.notAllowed": "没有拿到麦克风权限。可以在浏览器地址栏左边允许使用麦克风，再试一次。",
      "mic.serviceNotAllowed": "没有拿到麦克风权限。可以在浏览器设置里允许使用麦克风，再试一次。",
      "mic.noSpeech": "好像没听到声音，再试一次？",
      "mic.network": "语音识别需要联网，检查一下网络再试试。",
      "mic.audioCapture": "没找到麦克风，检查一下设备再试试。",
      "mic.other": "语音输入出了点问题，先打字也可以。",
      "mic.startFailed": "语音输入没能启动，先打字也可以。",
      "mic.lang": "zh-CN",

      "map.title": "世界地图",
      "map.tag": "示例留言",
      "map.tagTitle": "现在是示例留言，以后会接入真实用户",
      "map.intro": "鼠标移到城市上，看看那里的人今天想做什么。星星是你的小岛。",
      "map.cityAria": "{name}：看看大家今天想做什么",
      "map.myIsland": "我的小岛",
      "map.meDone": "✓ 做完了：{text}",
      "map.meTodo": "今天想：{text}",
      "map.meEmpty": "今天还没写下想做的事，写一件小事吧～",
      "map.me": "我",
      "map.island": "小岛",

      "printer.printing": "正在打印……",
      "printer.ready": "打印好啦",
      "printer.saved": "已保存到「下载」文件夹",
      "printer.save": "💾 保存成图片",
      "printer.close": "关闭",
      "receipt.title": "WINS LOG 小岛",
      "receipt.date": "{y} 年 {m} 月 {d} 日  {w}",
      "receipt.printedAt": "打印于 {t}",
      "receipt.wins": "今天的 Wins",
      "receipt.total": "合计",
      "receipt.count": "{n} 件",
      "receipt.rest": "今天没有记下 Win 也没关系，休息也是一种完成。",
      "receipt.bye": "明天见，小岛会一直在这里。",
      "receipt.cheers": [
        "今天的你，已经很棒了。",
        "一件一件，都是真的发生过的事。",
        "启动很难，但你还是做到了。",
        "好好休息，明天的小岛还在等你。",
        "做完的每一件小事，都在悄悄长大。",
        "谢谢今天认真生活的自己。"
      ],

      "settings.open": "设置",
      "settings.title": "设置",
      "settings.close": "关闭设置",
      "settings.sound": "音效",
      "settings.soundHint": "添加、完成、长出东西、打印时的小声音",
      "settings.on": "开",
      "settings.off": "关",
      "settings.data": "数据备份",
      "settings.dataHint": "所有记录只存在这个浏览器里。清理浏览器数据、换浏览器或换电脑之前，记得先导出备份。",
      "settings.stats": "现在有 {days} 天的记录，共 {wins} 件 Wins。",
      "settings.neverBacked": "还没有导出过备份。",
      "settings.backedToday": "今天已经备份过了。",
      "settings.backedDay": "上次备份是 1 天前。",
      "settings.backedDays": "上次备份是 {n} 天前。",
      "settings.export": "💾 导出备份",
      "settings.import": "📂 导入备份",
      "settings.exportText": "📝 导出 Wins 记录",
      "settings.exported": "备份已保存到「下载」文件夹。以后可以用「导入备份」恢复。",
      "settings.textDone": "Wins 记录已保存到「下载」文件夹，可以用任何文本编辑器打开。",
      "settings.nothingYet": "还没有完成的事可以导出，先完成一件小事吧。",
      "settings.badFile": "这个文件不是 Wins Log 小岛的备份，换一个试试？",
      "settings.confirmImport": "这个备份里有 {days} 天的记录、{wins} 件 Wins。导入会替换掉现在浏览器里的所有记录（现在有 {now} 件 Wins），确定吗？",
      "settings.importYes": "确定导入",
      "settings.importNo": "取消",
      "settings.imported": "导入好了，页面马上刷新……",
      "settings.importCancelled": "已取消，现在的记录没有变。",
      "settings.textTitle": "# Wins Log 小岛 · 我的 Wins",
      "settings.textExported": "导出于 {date}",
      "settings.textCount": "{n} 件",

      "footnote": "数据只保存在这台电脑的浏览器里"
    },

    en: {
      "app.title": "Wins Log Island",
      "brand.island": "Island",
      "date.aria": "Today's date",
      "tabs.aria": "Switch page",
      "tab.island": "🏝 My island",
      "tab.map": "🗺 World map",
      "lang.aria": "Switch language: currently English",
      "week": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      "months": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],

      "tasks.title": "Today's tasks",
      "tasks.placeholder": "One thing you'd like to do today…",
      "tasks.inputAria": "New task",
      "tasks.add": "Plant",
      "tasks.empty": "No tasks yet. Write one small thing and press Enter.",
      "tasks.completeAria": "Done: {text}",
      "tasks.splitAria": "Ask the helper to break this down",
      "tasks.splitTitle": "Too big? Let the helper break it down",
      "tasks.deleteAria": "Delete",
      "tasks.splitRequest": "Help me break down \"{text}\"",
      "wins.title": "Today's Wins",
      "wins.unit": "done",
      "wins.empty": "Nothing yet. Finish one small thing and it'll show up here.",
      "wins.undoAria": "Undo, move back to tasks",
      "endDay": "🖨 End the day",

      "island.title": "My island",
      "island.aria": "Pixel island: today's tasks are planted in the field, and everything you've finished grows on the island",
      "island.zero": "Finish your first thing and the island will grow its first plant.",
      "island.count": "{n} things have grown on your island. ",
      "island.countOne": "1 thing has grown on your island. ",
      "island.next": "{n} more to unlock {name}.",
      "island.full": "Your island is bustling now. Keep it blooming!",
      "island.m15": "a cozy cottage",
      "island.m30": "a dock and a little boat",
      "island.m60": "a lighthouse",
      "island.tipDone": "🌾 {text} (done today)",
      "island.tipGrowing": "🌱 {text} (still growing)",
      "island.tipItem": "⭐ {text} · {date}",
      "island.date": "{d} {mon}",

      "helper.title": "Island helper",
      "helper.mode": "Practice mode",
      "helper.modeTitle": "Replies are simulated for now; a real AI comes later",
      "chip.plan": "🌱 Today I want to…",
      "chip.planFill": "Today I want to: ",
      "chip.done": "✨ I've already done…",
      "chip.doneFill": "I've already finished: ",
      "chip.stuck": "🫠 Feeling stuck",
      "chip.stuckFill": "I'm feeling stuck",
      "chat.placeholder": "Say something to the helper…",
      "chat.inputAria": "Chat with the helper",
      "chat.mic": "Voice input",
      "chat.micStop": "Stop voice input",
      "chat.micTitle": "Click to start talking, click again to stop",
      "chat.send": "Send",
      "chat.hint": "Type, or tap 🎙 to talk.",
      "chat.greeting": "Hi, I'm the little helper who lives on the island 🌱 Tell me what you'd like to do today, or what you've already done, and I'll turn it into a list.",
      "chat.typing": "The helper is typing",
      "chat.oops": "Oops, my mind wandered. Could you say that again?",
      "chat.pickOne": "Tick at least one first.",
      "plan.todo": "🌱 Plant them",
      "plan.done": "✨ Cross them all off",
      "plan.split": "✂ Swap for these steps",
      "plan.todoDone": "✓ Planted {n}",
      "plan.doneDone": "✓ Crossed off {n}",
      "plan.splitReplaced": "✓ Swapped for {n} small steps",
      "plan.splitAdded": "✓ Planted {n} small steps",
      "mic.unsupported": "This browser doesn't support voice input yet. Try Chrome or Safari, or just type.",
      "mic.listening": "I'm listening… tap 🎙 again when you're done, or just pause.",
      "mic.notAllowed": "No microphone permission. Allow the microphone from the left of the address bar and try again.",
      "mic.serviceNotAllowed": "No microphone permission. Allow the microphone in your browser settings and try again.",
      "mic.noSpeech": "I didn't hear anything. Try again?",
      "mic.network": "Voice input needs the internet. Check your connection and try again.",
      "mic.audioCapture": "No microphone found. Check your device and try again.",
      "mic.other": "Something went wrong with voice input. Typing works too.",
      "mic.startFailed": "Voice input couldn't start. Typing works too.",
      "mic.lang": "en-US",

      "map.title": "World map",
      "map.tag": "Sample notes",
      "map.tagTitle": "These are sample notes; real people come later",
      "map.intro": "Hover over a city to see what people there want to do today. The star is your island.",
      "map.cityAria": "{name}: see what people want to do today",
      "map.myIsland": "My island",
      "map.meDone": "✓ Done: {text}",
      "map.meTodo": "Today: {text}",
      "map.meEmpty": "Nothing written yet today. Add something small!",
      "map.me": "me",
      "map.island": "Island",

      "printer.printing": "Printing…",
      "printer.ready": "All printed",
      "printer.saved": "Saved to your Downloads folder",
      "printer.save": "💾 Save as image",
      "printer.close": "Close",
      "receipt.title": "WINS LOG ISLAND",
      "receipt.date": "{w}, {d} {mon} {y}",
      "receipt.printedAt": "Printed at {t}",
      "receipt.wins": "Today's Wins",
      "receipt.total": "Total",
      "receipt.count": "{n} done",
      "receipt.rest": "No Wins logged today, and that's okay. Resting counts too.",
      "receipt.bye": "See you tomorrow. The island will be here.",
      "receipt.cheers": [
        "You did great today.",
        "Every one of these really happened.",
        "Starting is hard, and you did it anyway.",
        "Rest well. Your island will be waiting tomorrow.",
        "Every small thing you finish keeps quietly growing.",
        "Thank you for showing up for yourself today."
      ],

      "settings.open": "Settings",
      "settings.title": "Settings",
      "settings.close": "Close settings",
      "settings.sound": "Sound effects",
      "settings.soundHint": "Little sounds when you add, finish, grow or print",
      "settings.on": "On",
      "settings.off": "Off",
      "settings.data": "Backup",
      "settings.dataHint": "Everything is stored only in this browser. Export a backup before clearing browser data, switching browsers or changing computers.",
      "settings.stats": "You have {days} days of records and {wins} Wins.",
      "settings.neverBacked": "No backup exported yet.",
      "settings.backedToday": "Backed up today.",
      "settings.backedDay": "Last backup: 1 day ago.",
      "settings.backedDays": "Last backup: {n} days ago.",
      "settings.export": "💾 Export backup",
      "settings.import": "📂 Import backup",
      "settings.exportText": "📝 Export my Wins",
      "settings.exported": "Backup saved to your Downloads folder. Use \"Import backup\" to restore it later.",
      "settings.textDone": "Your Wins were saved to your Downloads folder. Any text editor can open the file.",
      "settings.nothingYet": "Nothing finished yet to export. Finish one small thing first!",
      "settings.badFile": "This file isn't a Wins Log Island backup. Try another one?",
      "settings.confirmImport": "This backup has {days} days of records and {wins} Wins. Importing will replace everything currently in this browser ({now} Wins). Continue?",
      "settings.importYes": "Import",
      "settings.importNo": "Cancel",
      "settings.imported": "Imported. Refreshing the page…",
      "settings.importCancelled": "Cancelled. Your current records are unchanged.",
      "settings.textTitle": "# Wins Log Island · My Wins",
      "settings.textExported": "Exported on {date}",
      "settings.textCount": "{n} done",

      "footnote": "Your data stays in this computer's browser"
    }
  };

  function t(key, params) {
    var s = D[lang][key];
    if (s === undefined) s = D.zh[key];
    if (s === undefined) return key;
    if (typeof s !== "string" || !params) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] != null ? params[k] : m; });
  }

  // 把 HTML 里标了 data-i18n 的地方都换成当前语言
  function apply(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    root.querySelectorAll("[data-i18n-title]").forEach(function (el) { el.title = t(el.dataset.i18nTitle); });
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    document.title = t("app.title");
  }

  function set(next) {
    if (next === lang) return;
    try { localStorage.setItem(KEY, next); } catch (e) {}
    location.reload();
  }

  return {
    t: t,
    apply: apply,
    set: set,
    lang: function () { return lang; },
    isEn: function () { return lang === "en"; }
  };
})();

// 尽早设好页面语言，避免先闪一下中文
I18n.apply();

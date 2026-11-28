/*
 * 第一次打开的 2 分钟（全新用户）
 *
 * 不先弹教程，直接让小助手问「今天做了什么？哪怕只是起床也算」。
 * 用户回一句 → 马上把它记成第一个 Win（不等 AI，不联网），小岛长出第一棵苗、冲出 +1 →
 * 再用一条消息简单介绍其他功能 → 之后照常（每天的电量卡片这时才弹）。
 *
 * 「全新用户」= 这个浏览器里没有任何记录，也没走过这个流程。老用户第一次打开新版时直接标记为走过，不打扰。
 * 截图检查用：网址后面加 #onboard 可以强制再走一遍（不会删任何记录）。
 */
var Onboarding = (function () {
  var active = false;

  function shouldStart() {
    if (/[#&]onboard\b/.test(location.hash)) return true;
    if (Store.onboarded()) return false;
    if (Store.hasData()) { Store.markOnboarded(); return false; } // 老用户：不打扰
    return true;
  }

  // Chat.init 里调用：返回 true 表示这次要走「第一次打开」流程（开场白换成提问）
  function begin() {
    if (!shouldStart()) return false;
    active = true;
    try { localStorage.setItem("winslog-island3d-tip", "1"); } catch (e) {} // 不先弹教程（介绍放在第一个 Win 之后）
    // 等页面都准备好，再把助手页翻出来（手机竖屏：抽屉拉到半屏）
    setTimeout(function () {
      document.dispatchEvent(new CustomEvent("island:page", { detail: { page: "helper" } }));
      // 手机竖屏：抽屉拉到顶，问题和输入框都看得见（半开时输入框在屏幕外）；回答之后再降到半开，让人看到小岛长苗
      if (document.body.classList.contains("layout-portrait") && window.Sheet) Sheet.go("full");
      var input = document.getElementById("chat-input");
      if (!input) return;
      if (!document.body.classList.contains("layout-portrait")) input.focus(); // 手机上不自动弹键盘
    }, 400);
    return true;
  }

  // 把用户的话整理成一条短短的 Win：去掉「我今天」「就」这类开头、句尾语气词，只取第一小句，最多 30 字
  function toWin(text) {
    var s = String(text || "").trim();
    s = s.split(/[。！!？?\n；;，,]/)[0]; // 只取第一小句（「起了个床，别的啥也没干」→「起了个床」）
    s = s.replace(/^(我今天|今天我|今天|我|就|只|已经|刚刚|刚才|嗯|额|呃|才|也就)+[，,、\s]*/, "");
    s = s.replace(/^(i|today i|i just|i've|i have)\s+/i, "");
    s = s.replace(/[了吧啦呢哦呀啊嘛～~。.!！\s]+$/, "");
    // 「啥也没干」「nothing」这种不能当 Win：换成「来小岛看了看」（来了本身就算）
    if (/(没干|没做|没有做|什么都没|啥也没|啥都没|nothing|didn't do|did nothing)/i.test(s)) s = "";
    if (s.length > 30) s = s.slice(0, 30) + "…";
    return s || I18n.t("onboard.fallbackWin");
  }

  // 用户的第一句回话：记下第一个 Win，返回小助手要说的两条消息
  function reply(text) {
    active = false;
    Store.markOnboarded();
    if (document.body.classList.contains("layout-portrait") && window.Sheet) Sheet.go("half"); // 露出小岛：看第一棵苗冒出来
    var win = toWin(text);
    return {
      win: win,
      first: I18n.t("onboard.firstWin", { win: win }),
      intro: I18n.t("onboard.intro")
    };
  }

  return { begin: begin, isActive: function () { return active; }, reply: reply, toWin: toWin };
})();

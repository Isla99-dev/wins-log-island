/*
 * 结束今天：小打印机吐出一张小票（第 3 步）
 *
 * 小票直接画在 <canvas> 上，所以「保存成图片」就是把这块画布导出成 PNG，
 * 不依赖任何外部截图库，双击打开网页也能用。
 */
var Receipt = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var W = 300;          // 小票宽度（CSS 像素）
  var PAD = 22;
  var ZIG = 7;          // 撕口锯齿高度

  var COLOR = {
    paper: "#fffdf5", ink: "#4a2f22", soft: "#9a7d66",
    line: "#d9c6a6", star: "#ffcf4a", starEdge: "#6e4029", berry: "#e06a62"
  };
  var FONT = {
    title: "600 24px 'Pixelify Sans', 'ZCOOL KuaiLe', sans-serif",
    cute: "'ZCOOL KuaiLe', 'PingFang SC', sans-serif",
    body: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    pixel: "'Pixelify Sans', monospace"
  };

  function pad2(n) { return String(n).padStart(2, "0"); }

  // ---------- 文字换行（中英文混排：中文按字，英文按词） ----------
  var TOKEN_RE = /[⺀-鿿豈-﫿＀-￯]|[^\s⺀-鿿豈-﫿＀-￯]+|\s+/g;
  function wrap(ctx, text, maxWidth) {
    var lines = [], line = "";
    var tokens = text.match(TOKEN_RE) || [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var test = line + tok;
      if (ctx.measureText(test).width <= maxWidth || !line.trim()) {
        // 单个英文词比一整行还长时，只好按字母拆开
        if (ctx.measureText(test).width > maxWidth && tok.length > 1) {
          tokens.splice.apply(tokens, [i + 1, 0].concat(tok.split("")));
          continue;
        }
        line = test;
      } else {
        lines.push(line.trimEnd());
        line = /^\s+$/.test(tok) ? "" : tok;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // 7×7 像素星星（和页面上的图标同一个形状）
  var STAR_MAP = ["...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#..."];
  function pixelStar(ctx, x, y, size, color) {
    var u = size / 7;
    ctx.fillStyle = color;
    for (var r = 0; r < 7; r++) for (var c = 0; c < 7; c++) {
      if (STAR_MAP[r][c] === "#") ctx.fillRect(x + c * u, y + r * u, u, u);
    }
  }

  function dashed(ctx, y) {
    ctx.fillStyle = COLOR.line;
    for (var x = PAD; x < W - PAD; x += 8) ctx.fillRect(x, y, 4, 2);
  }

  // 根据日期生成一排“条形码”，每天都不一样
  function barcode(ctx, y, seed) {
    var s = 0;
    for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    var x = PAD + 30;
    ctx.fillStyle = COLOR.ink;
    while (x < W - PAD - 30) {
      s = (s * 1664525 + 1013904223) >>> 0;
      var w = 1 + (s % 3);
      if ((s >> 4) % 3) ctx.fillRect(x, y, w, 26);
      x += w + 1 + ((s >> 8) % 2);
    }
  }

  // ---------- 画小票：先量高度，再真正画 ----------
  function paint(ctx, info, draw) {
    var y = ZIG + 20;
    function text(str, x, yy, font, color, align) {
      if (!draw) return;
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "left";
      ctx.fillText(str, x, yy);
    }

    // 标题
    if (draw) { pixelStar(ctx, PAD + 2, y + 2, 14, COLOR.star); pixelStar(ctx, W - PAD - 16, y + 2, 14, COLOR.star); }
    text(I18n.t("receipt.title"), W / 2, y + 16, FONT.title, COLOR.ink, "center");
    y += 40;
    text(info.dateText, W / 2, y, "16px " + FONT.cute, COLOR.ink, "center");
    y += 20;
    text(I18n.t("receipt.printedAt", { t: info.printedAt }), W / 2, y, "12px " + FONT.body, COLOR.soft, "center");
    y += 16;
    if (draw) dashed(ctx, y);
    y += 22;

    text(I18n.t("receipt.wins"), PAD, y, "15px " + FONT.cute, COLOR.ink);
    y += 14;

    // 每一条
    ctx.font = "14px " + FONT.body;
    var textX = PAD + 20, timeW = 40;
    var maxW = W - PAD - textX - timeW;
    if (info.wins.length === 0) {
      y += 10;
      ctx.font = "13px " + FONT.body;
      wrap(ctx, I18n.t("receipt.rest"), W - PAD * 2).forEach(function (l) {
        y += 20;
        text(l, PAD, y, "13px " + FONT.body, COLOR.soft);
      });
    }
    info.wins.forEach(function (w) {
      y += 12;
      ctx.font = "14px " + FONT.body;
      var lines = wrap(ctx, w.text, maxW);
      if (draw) pixelStar(ctx, PAD, y + 3, 11, COLOR.starEdge);
      text(w.time, W - PAD, y + 13, "12px " + FONT.body, COLOR.soft, "right");
      lines.forEach(function (l, i) {
        text(l, textX, y + 13 + i * 20, "14px " + FONT.body, COLOR.ink);
      });
      y += lines.length * 20;
    });

    y += 16;
    if (draw) dashed(ctx, y);
    y += 30;
    text(I18n.t("receipt.total"), PAD, y, "15px " + FONT.cute, COLOR.ink);
    text(I18n.t("receipt.count", { n: info.wins.length }), W - PAD, y, "22px " + FONT.cute, COLOR.berry, "right");
    y += 16;
    if (draw) dashed(ctx, y);

    // 鼓励的话
    y += 8;
    ctx.font = "14px " + FONT.cute;
    wrap(ctx, info.cheer, W - PAD * 2).forEach(function (l) {
      y += 22;
      text(l, W / 2, y, "14px " + FONT.cute, COLOR.ink, "center");
    });

    y += 22;
    if (draw) barcode(ctx, y, info.dayKey);
    y += 42;
    text("THANK YOU, ME!", W / 2, y, "13px " + FONT.pixel, COLOR.soft, "center");
    y += 18 + ZIG;
    return y;
  }

  // 纸张形状：上下是撕开的锯齿
  function paper(ctx, h) {
    ctx.fillStyle = COLOR.paper;
    ctx.beginPath();
    ctx.moveTo(0, ZIG);
    for (var x = 0; x < W; x += ZIG * 2) { ctx.lineTo(x + ZIG, 0); ctx.lineTo(x + ZIG * 2, ZIG); }
    ctx.lineTo(W, h - ZIG);
    for (var x2 = W; x2 > 0; x2 -= ZIG * 2) { ctx.lineTo(x2 - ZIG, h); ctx.lineTo(x2 - ZIG * 2, h - ZIG); }
    ctx.closePath();
    ctx.fill();
  }

  function render(info) {
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    var h = Math.ceil(paint(ctx, info, false));
    var scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = W * scale;
    canvas.height = h * scale;
    canvas.style.width = W + "px";
    canvas.style.height = h + "px";
    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";
    paper(ctx, h);
    paint(ctx, info, true);
    return canvas;
  }

  function collect() {
    var now = new Date();
    var cheers = I18n.t("receipt.cheers");
    return {
      dayKey: Store.dayKey(now),
      dateText: I18n.t("receipt.date", {
        y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(),
        mon: (I18n.t("months") || [])[now.getMonth()], w: I18n.t("week")[now.getDay()]
      }),
      printedAt: pad2(now.getHours()) + ":" + pad2(now.getMinutes()),
      wins: Store.winsOf().map(function (w) {
        var d = new Date(w.doneAt);
        return { text: w.text, time: pad2(d.getHours()) + ":" + pad2(d.getMinutes()) };
      }),
      cheer: Store.winsOf().length ? cheers[Math.floor(Math.random() * cheers.length)] : I18n.t("receipt.bye")
    };
  }

  // 等字体加载好再画，不然画布上会是系统默认字体；没网就直接用备用字体
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var loads = [
      document.fonts.load("16px 'ZCOOL KuaiLe'", "今天小岛合计"),
      document.fonts.load("600 24px 'Pixelify Sans'", "WINS LOG")
    ];
    var timeout = new Promise(function (r) { setTimeout(r, 1500); });
    return Promise.race([Promise.all(loads), timeout]).catch(function () {});
  }

  // ---------- 弹窗 & 打印动画 ----------
  var currentCanvas = null, lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    var modal = $("printer-modal");
    var slot = $("receipt-slot");
    var actions = $("printer-actions");
    slot.innerHTML = "";
    actions.hidden = true;
    modal.hidden = false;
    document.body.classList.add("has-modal");
    $("printer").classList.add("is-printing");
    $("printer-status").textContent = I18n.t("printer.printing");

    fontsReady().then(function () {
      Store.markEnded();
      var canvas = render(collect());
      currentCanvas = canvas;
      var roll = document.createElement("div");
      roll.className = "receipt-roll";
      roll.appendChild(canvas);
      slot.appendChild(roll);

      var h = parseFloat(canvas.style.height);
      var dur = reduceMotion ? 0 : Math.max(1400, Math.min(4200, h * 6));
      roll.style.setProperty("--print-dur", dur + "ms");
      roll.style.setProperty("--print-steps", Math.max(8, Math.round(h / 14)));
      void roll.offsetHeight;
      roll.classList.add("is-out");
      Sound.play("print", dur / 1000);

      setTimeout(function () {
        $("printer").classList.remove("is-printing");
        $("printer-status").textContent = I18n.t("printer.ready");
        actions.hidden = false;
        $("receipt-save").focus();
      }, dur + 150);
    });
  }

  function close() {
    $("printer-modal").hidden = true;
    document.body.classList.remove("has-modal");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function save() {
    if (!currentCanvas) return;
    var name = "wins-" + Store.dayKey() + ".png";
    function download(url) {
      var a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    if (currentCanvas.toBlob) {
      currentCanvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        download(url);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }, "image/png");
    } else {
      download(currentCanvas.toDataURL("image/png"));
    }
    $("printer-status").textContent = I18n.t("printer.saved");
    Sound.play("save");
  }

  function init() {
    $("end-day").addEventListener("click", open);
    $("receipt-close").addEventListener("click", close);
    $("receipt-save").addEventListener("click", save);
    $("printer-modal").addEventListener("click", function (e) {
      if (e.target === e.currentTarget) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("printer-modal").hidden) close();
    });
  }

  return { init: init };
})();

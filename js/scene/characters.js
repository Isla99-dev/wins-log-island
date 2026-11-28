/*
 * 小岛上的黑猫：2D 插画立牌，放在 3D 世界里，始终面向镜头（小人是 3D 的，见 js/avatar.js）
 *
 * 每个状态一张图，猫画成「朝右」，朝左时程序会水平翻转。脚踩在图片最下边、左右居中。
 *   cat_：walk1~walk3 走路、sit 坐着、stretch 伸懒腰、rub 蹭小人
 *
 * 换成自己画的图（PNG，透明背景）：
 *   1. 网站（GitHub Pages）：把 cat_sit.png 这样命名的图放进 assets/characters/，把下面的 USE_FOLDER_IMAGES 改成 true，推送即可。
 *   2. 双击打开的本地版：浏览器不让 3D 直接读文件夹里的图，请在 ⚙ 设置 →「角色图片」里导入，
 *      导入的图存在这台电脑的浏览器里。
 *   没提供的状态会继续用下面这些代码画的临时版本。
 * 优先级：设置里导入的图 > assets/characters/ 里的图 > 代码画的临时版本。
 */
var Characters = (function () {
  var NAMES = {
    cat: ["walk1", "walk2", "walk3", "sit", "stretch", "rub"],
  };
  var SIZE = { cat: [320, 256] };
  var KEY = "winslog-characters";
  // assets/characters/ 里放了猫的 PNG 之后，把这里改成 true 才会去读（现在文件夹是空的，
  // 不读就不会在控制台里报 404）。设置里导入的图不受这个开关影响。
  var USE_FOLDER_IMAGES = false;
  var INK = "#2a2630", CAT_INK = "#0d0c12";

  /* ---------------- 画图小工具 ---------------- */
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function fillStroke(g, fill, ink, lw) {
    if (fill) { g.fillStyle = fill; g.fill(); }
    g.lineWidth = lw || 4; g.strokeStyle = ink || INK; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
  }
  // 手脚：先画一条粗的描边色，再画一条细一点的颜色，像平涂 + 细描边
  function limb(g, x1, y1, x2, y2, w, fill, ink, cx, cy) {
    g.lineCap = "round"; g.lineJoin = "round";
    [[ink || INK, w + 8], [fill, w]].forEach(function (p) {
      g.beginPath(); g.moveTo(x1, y1);
      if (cx != null) g.quadraticCurveTo(cx, cy, x2, y2); else g.lineTo(x2, y2);
      g.strokeStyle = p[0]; g.lineWidth = p[1]; g.stroke();
    });
  }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function sparkle(g, x, y, s, color) {
    g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s); g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s);
    g.fillStyle = color; g.fill();
  }

  /* ---------------- 黑猫（修长优雅，琥珀金眼睛，皮毛上零星的金色小斑点） ---------------- */
  var FUR = "#26232d", GOLD = "#d9b04a", EYE = "#ffbf3a";
  function catEyes(g, gg, x, y, closed, s) {
    s = s || 1;
    if (closed) { g.lineWidth = 3; g.strokeStyle = GOLD; g.beginPath(); g.arc(x, y + 2, 6 * s, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); return; }
    ell(g, x, y, 7 * s, 5 * s, -.15); g.fillStyle = EYE; g.fill(); g.lineWidth = 2; g.strokeStyle = CAT_INK; g.stroke();
    ell(g, x + 1, y, 1.8 * s, 4.4 * s); g.fillStyle = CAT_INK; g.fill();
    if (gg) { var r = gg.createRadialGradient(x, y, 0, x, y, 18 * s); r.addColorStop(0, "rgba(255,200,90,.95)"); r.addColorStop(.35, "rgba(255,180,60,.45)"); r.addColorStop(1, "rgba(255,170,50,0)"); gg.fillStyle = r; gg.fillRect(x - 20 * s, y - 20 * s, 40 * s, 40 * s); }
  }
  function flecks(g, pts) { g.fillStyle = GOLD; pts.forEach(function (p) { g.save(); g.translate(p[0], p[1]); g.rotate(.6); g.fillRect(-p[2] / 2, -p[2] / 2, p[2], p[2]); g.restore(); }); }
  function catHead(g, gg, x, y, opt) {
    opt = opt || {};
    // 耳朵
    g.beginPath(); g.moveTo(x - 20, y - 12); g.lineTo(x - 14, y - 40); g.lineTo(x + 2, y - 20); g.closePath(); fillStroke(g, FUR, CAT_INK, 3);
    g.beginPath(); g.moveTo(x + 2, y - 20); g.lineTo(x + 14, y - 42); g.lineTo(x + 22, y - 12); g.closePath(); fillStroke(g, FUR, CAT_INK, 3);
    g.beginPath(); g.moveTo(x + 6, y - 22); g.lineTo(x + 13, y - 35); g.lineTo(x + 17, y - 18); g.closePath(); g.fillStyle = "#4a3f4f"; g.fill();
    // 小小的头 + 尖一点的嘴
    g.beginPath(); g.ellipse(x, y, 25, 21, 0, 0, Math.PI * 2); fillStroke(g, FUR, CAT_INK, 3);
    g.beginPath(); g.moveTo(x + 14, y - 4); g.quadraticCurveTo(x + 34, y + 2, x + 22, y + 13); g.quadraticCurveTo(x + 14, y + 16, x + 10, y + 12); fillStroke(g, FUR, CAT_INK, 3);
    g.fillStyle = "#3a2e3a"; ell(g, x + 27, y + 2, 3, 2.4); g.fill();
    catEyes(g, gg, x + 9, y - 3, opt.closed);
    // 胡须（金色细线）
    g.strokeStyle = "rgba(217,176,74,.7)"; g.lineWidth = 1.5;
    [[-2, 10], [2, 14]].forEach(function (d) { g.beginPath(); g.moveTo(x + 24, y + 6); g.lineTo(x + 46, y + d[0] - 4 + d[1] / 3); g.stroke(); });
  }
  function catTail(g, pts, w) {
    g.lineCap = "round"; g.lineJoin = "round";
    [[CAT_INK, w + 5], [FUR, w]].forEach(function (p) {
      g.beginPath(); g.moveTo(pts[0], pts[1]); g.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
      g.strokeStyle = p[0]; g.lineWidth = p[1]; g.stroke();
    });
  }
  function drawCat(name) {
    var c = canvas(320, 256), g = c.getContext("2d");
    var gc = canvas(320, 256), gg = gc.getContext("2d");
    var ground = 246, LW = 6;
    var walk = { walk1: -1, walk2: 0, walk3: 1 }[name];
    if (walk != null || name === "rub") {
      var a = walk || 0, rub = name === "rub";
      var bodyY = rub ? 180 : 174;
      // 又长又高高翘起的尾巴
      catTail(g, [84, bodyY - 6, 40, bodyY - 50, 30 - a * 4, 50, rub ? 70 : 60, 30], 8);
      // 后面两条腿
      limb(g, 104, bodyY + 8, 96 - a * 14, ground, LW, FUR, CAT_INK);
      limb(g, 204, bodyY + 6, 214 + a * 14, ground, LW, FUR, CAT_INK);
      // 修长的身体
      ell(g, 152, bodyY, 72, 20, rub ? .08 : -.03); fillStroke(g, FUR, CAT_INK, 3);
      // 前面两条腿
      limb(g, 118, bodyY + 10, 124 + a * 14, ground, LW, FUR, CAT_INK);
      limb(g, 196, bodyY + 10, 194 - a * 14, ground, LW, FUR, CAT_INK);
      // 细长的脖子 + 头
      if (rub) { limb(g, 206, bodyY - 4, 234, bodyY + 6, 18, FUR, CAT_INK); catHead(g, gg, 244, bodyY + 10, { closed: true }); }
      else { limb(g, 206, bodyY - 8, 230, bodyY - 36, 18, FUR, CAT_INK); catHead(g, gg, 238, bodyY - 48); }
      flecks(g, [[126, bodyY - 6, 4], [148, bodyY + 4, 3], [170, bodyY - 10, 3.5], [96, bodyY + 2, 3], [46, 80, 3.5], [36, 118, 3]]);
      if (rub) { g.fillStyle = "#e0795a"; g.beginPath(); var hx = 280, hy = 100; g.moveTo(hx, hy + 8); g.bezierCurveTo(hx - 16, hy - 4, hx - 6, hy - 16, hx, hy - 6); g.bezierCurveTo(hx + 6, hy - 16, hx + 16, hy - 4, hx, hy + 8); g.fill(); }
    } else if (name === "sit") {
      // 坐着：身体挺直，尾巴高高地从身后翘起来
      catTail(g, [128, 226, 70, 210, 64, 110, 96, 64], 9);
      ell(g, 150, 196, 44, 46); fillStroke(g, FUR, CAT_INK, 3);
      limb(g, 178, 150, 196, 108, 22, FUR, CAT_INK);
      ell(g, 176, 160, 26, 44, .15); fillStroke(g, FUR, CAT_INK, 3);
      limb(g, 182, 176, 186, ground, LW, FUR, CAT_INK); limb(g, 168, 180, 170, ground, LW, FUR, CAT_INK);
      ell(g, 132, 234, 30, 12); fillStroke(g, FUR, CAT_INK, 3);
      catHead(g, gg, 204, 92);
      flecks(g, [[140, 178, 4], [126, 204, 3], [160, 212, 3.5], [70, 150, 3], [74, 112, 3.5]]);
    } else {
      // 伸懒腰：前腿往前伸、胸口贴低，屁股翘高，尾巴竖起来
      catTail(g, [88, 112, 70, 70, 60, 26, 82, 12], 9);
      limb(g, 100, 124, 92, ground, LW, FUR, CAT_INK); limb(g, 112, 126, 116, ground, LW, FUR, CAT_INK);
      g.save(); g.translate(160, 160); g.rotate(.32); ell(g, 0, 0, 74, 21); fillStroke(g, FUR, CAT_INK, 3); g.restore();
      limb(g, 214, 196, 286, 240, LW, FUR, CAT_INK); limb(g, 206, 200, 270, 242, LW, FUR, CAT_INK);
      catHead(g, gg, 232, 196, { closed: true });
      flecks(g, [[126, 140, 4], [152, 156, 3], [184, 176, 3.5], [72, 60, 3]]);
    }
    return { image: c, glow: gc };
  }

  /* ---------------- 读取：导入的图 > 文件夹里的图 > 代码画的 ---------------- */
  function stored() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function usable(img) { // 浏览器允许 3D 读这张图吗？（双击打开时，文件夹里的图通常不行）
    try { var c = canvas(1, 1), g = c.getContext("2d"); g.drawImage(img, 0, 0, 1, 1); g.getImageData(0, 0, 1, 1); return true; } catch (e) { return false; }
  }
  function loadImg(src, cb) { var img = new Image(); img.onload = function () { cb(usable(img) ? img : null); }; img.onerror = function () { cb(null); }; img.src = src; }

  function load(done) {
    var out = { cat: {} };
    Object.keys(NAMES).forEach(function (k) { NAMES[k].forEach(function (n) { out[k][n] = drawCat(n); out[k][n].custom = false; }); });
    var saved = stored(), jobs = [];
    // 文件夹里的图：先看第一张在不在、能不能用，在的话再读这个角色的其他状态
    if (USE_FOLDER_IMAGES) Object.keys(NAMES).forEach(function (k) {
      jobs.push(function (next) {
        loadImg("assets/characters/" + k + "_" + NAMES[k][0] + ".png", function (first) {
          if (!first) { next(); return; }
          var left = NAMES[k].length;
          NAMES[k].forEach(function (n, i) {
            var set = function (img) { if (img) out[k][n] = { image: img, glow: null, custom: true }; if (--left === 0) next(); };
            if (i === 0) set(first); else loadImg("assets/characters/" + k + "_" + n + ".png", set);
          });
        });
      });
    });
    // 设置里导入的图（最优先）
    Object.keys(saved).forEach(function (key) {
      var m = /^(cat)_(\w+)$/.exec(key); if (!m || NAMES[m[1]].indexOf(m[2]) < 0) return;
      jobs.push(function (next) { loadImg(saved[key], function (img) { if (img) out[m[1]][m[2]] = { image: img, glow: null, custom: true }; next(); }); });
    });
    (function run() { var j = jobs.shift(); if (!j) { done(out); return; } j(run); })();
  }

  // 设置里导入：文件名要是 cat_sit.png 这样的；太大的图缩小到 512 高，省空间
  function importFiles(files, cb) {
    var saved = stored(), ok = 0, skipped = [], list = Array.prototype.slice.call(files || []);
    (function next() {
      var f = list.shift();
      if (!f) { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { cb({ ok: 0, skipped: skipped, full: true }); return; } cb({ ok: ok, skipped: skipped }); return; }
      var name = f.name.replace(/\.png$/i, "").toLowerCase();
      var m = /^(cat)_(\w+)$/.exec(name);
      if (!m || NAMES[m[1]].indexOf(m[2]) < 0) { skipped.push(f.name); next(); return; }
      var r = new FileReader();
      r.onload = function () {
        var img = new Image();
        img.onload = function () {
          var s = Math.min(1, 512 / img.height), c = canvas(Math.round(img.width * s), Math.round(img.height * s));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          saved[name] = c.toDataURL("image/png"); ok++; next();
        };
        img.onerror = function () { skipped.push(f.name); next(); };
        img.src = r.result;
      };
      r.onerror = function () { skipped.push(f.name); next(); };
      r.readAsDataURL(f);
    })();
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function count() { return Object.keys(stored()).length; }

  return { NAMES: NAMES, SIZE: SIZE, load: load, importFiles: importFiles, reset: reset, count: count };
})();

/*
 * 像素小岛（第 1 步：静态场景 + 小人待机动画）
 * 画布逻辑尺寸 96×60，每个格子就是一个像素，CSS 放大显示。
 * 所有图案都是本项目原创绘制。
 */
var Island = (function () {
  var W = 96, H = 60;

  var C = {
    sea: "#62b7c9", seaDeep: "#4fa3b8", wave: "#a6e0e6", foam: "#e8fbf6",
    sand: "#f2d59a", sandDark: "#dcb877",
    grass: "#7cc35a", grassDark: "#5ea64b", grassLight: "#9ad671",
    dirt: "#9a6440", dirtDark: "#7a4a2e",
    trunk: "#7a4a2e", leaf: "#4f9a45", leafLight: "#6fbb55",
    wood: "#c0804e", woodDark: "#6e4029",
    k: "#4a2f22", skin: "#f6c9a0", hair: "#7a4a2e", shirt: "#e06a62",
    pants: "#5873a8", blush: "#f19a8f", star: "#ffcf4a"
  };

  // 原创 Q 版小人（10×14）
  var HERO = [
    "..kkkkkk..",
    ".khhhhhhk.",
    "khhhhhhhhk",
    "khsssssshk",
    "kssksskssk",
    "kpsssssspk",
    ".kssssssk.",
    "..krrrrk..",
    ".krrrrrrk.",
    "ksrrrrrrsk",
    ".kbbbbbbk.",
    ".kbbkkbbk.",
    ".kbk..kbk.",
    ".kk....kk."
  ];
  var HERO_COLORS = { k: C.k, h: C.hair, s: C.skin, p: C.blush, r: C.shirt, b: C.pants };

  // 小树（9×11）
  var TREE = [
    "...LLL...",
    ".LLLlLL..",
    "LLlLLLLL.",
    "LLLLLlLLL",
    "LlLLLLLLL",
    ".LLLLLlL.",
    "..LLLLL..",
    "....t....",
    "....t....",
    "...ttt...",
    "..t...t.."
  ];
  var TREE_COLORS = { L: C.leaf, l: C.leafLight, t: C.trunk };

  // 木牌（7×7）
  var SIGN = [
    "wwwwwww",
    "wkwkwkw",
    "wwwwwww",
    "...d...",
    "...d...",
    "...d...",
    "...d..."
  ];
  var SIGN_COLORS = { w: C.wood, k: C.woodDark, d: C.woodDark };

  var canvas, ctx, frame = 0, last = 0;

  // 固定种子的随机数，让草地纹理每次都一样
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function px(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }

  function sprite(map, colors, ox, oy) {
    for (var y = 0; y < map.length; y++) {
      for (var x = 0; x < map[y].length; x++) {
        var c = colors[map[y][x]];
        if (c) px(ox + x, oy + y, c);
      }
    }
  }

  function inEllipse(x, y, cx, cy, rx, ry) {
    var dx = (x - cx) / rx, dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  // 地形只画一次，存到离屏画布
  var ground;
  function buildGround() {
    ground = document.createElement("canvas");
    ground.width = W; ground.height = H;
    var g = ground.getContext("2d");
    var rand = rng(7);
    var cx = 48, cy = 32;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var color;
        if (inEllipse(x, y, cx, cy - 2, 31, 16)) {
          var r = rand();
          color = r < 0.08 ? C.grassDark : r < 0.14 ? C.grassLight : C.grass;
        } else if (inEllipse(x, y, cx, cy, 35, 20)) {
          color = rand() < 0.1 ? C.sandDark : C.sand;
        } else if (inEllipse(x, y, cx, cy, 37, 22)) {
          color = C.foam;
        } else {
          color = rand() < 0.04 ? C.seaDeep : C.sea;
        }
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
    }
    // 小田地：3 列 × 2 行
    for (var row = 0; row < 2; row++) {
      for (var col = 0; col < 3; col++) {
        var fx = 26 + col * 7, fy = 28 + row * 6;
        g.fillStyle = C.dirtDark; g.fillRect(fx, fy, 6, 5);
        g.fillStyle = C.dirt; g.fillRect(fx, fy, 6, 4);
        g.fillStyle = C.dirtDark; g.fillRect(fx + 1, fy + 1, 4, 1);
      }
    }
  }

  function drawWaves() {
    // 几道会慢慢移动的浪花
    var waves = [[6, 6], [78, 10], [14, 52], [70, 54], [86, 34], [4, 30]];
    waves.forEach(function (w, i) {
      var shift = (frame + i * 3) % 8 < 4 ? 0 : 1;
      var x = w[0] + shift, y = w[1];
      px(x, y, C.wave); px(x + 1, y - 1, C.wave); px(x + 2, y - 1, C.wave); px(x + 3, y, C.wave);
    });
  }

  function draw() {
    ctx.drawImage(ground, 0, 0);
    drawWaves();
    sprite(TREE, TREE_COLORS, 66, 14);
    sprite(TREE, TREE_COLORS, 16, 18);
    sprite(SIGN, SIGN_COLORS, 58, 30);

    // 小人：轻轻上下呼吸
    var bob = frame % 4 < 2 ? 0 : 1;
    // 影子
    ctx.fillStyle = "rgba(74,47,34,0.25)";
    ctx.fillRect(48, 37, 8, 1);
    sprite(HERO, HERO_COLORS, 47, 24 + bob);

    // 头顶偶尔冒一颗小星星
    if (frame % 16 >= 12) {
      var sy = 20 - (frame % 16 - 12);
      px(51, sy, C.star); px(50, sy + 1, C.star); px(51, sy + 1, C.star); px(52, sy + 1, C.star); px(51, sy + 2, C.star);
    }
  }

  function loop(t) {
    if (t - last > 280) { // 像素游戏的“慢帧”节奏
      last = t;
      frame++;
      draw();
    }
    requestAnimationFrame(loop);
  }

  function init(el) {
    canvas = el;
    if (!canvas || !canvas.getContext) return;
    ctx = canvas.getContext("2d");
    buildGround();
    draw();
    if (!window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      requestAnimationFrame(loop);
    }
  }

  return { init: init };
})();

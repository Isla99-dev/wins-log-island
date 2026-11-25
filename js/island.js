/*
 * 像素小岛（第 4 步）
 *
 * - 画布逻辑尺寸 128×80，每格就是一个像素，CSS 放大显示
 * - 今天的任务种在田里：没完成是小芽，完成了就成熟
 * - 所有完成过的事（不只今天）都会在岛上长出一样东西，越多岛越热闹
 * - 累计到 15 / 30 / 60 件时，小岛会升级：小屋、码头和小船、灯塔
 * - Q 版小人会自己走动、浇水；你完成一件事时，它会跑去浇水，让新东西长出来
 *
 * 所有图案都是本项目原创绘制。
 */
var Island = (function () {
  var W = 128, H = 80, TICK = 110;
  var GRASS = { cx: 64, cy: 39, rx: 44, ry: 22 };
  var SAND = { cx: 64, cy: 41, rx: 49, ry: 27 };
  var FOAM = { cx: 64, cy: 41, rx: 51, ry: 29 };
  var MILESTONES = [
    { at: 15, name: "island.m15" },   // 温馨小屋
    { at: 30, name: "island.m30" },   // 小码头和小船
    { at: 60, name: "island.m60" }    // 海上灯塔
  ];

  var C = {
    sea: "#62b7c9", seaDeep: "#4fa3b8", wave: "#a6e0e6", foam: "#e8fbf6",
    sand: "#f2d59a", sandDark: "#dcb877",
    grass: "#7cc35a", grassDark: "#5ea64b", grassLight: "#9ad671",
    dirt: "#9a6440", dirtDark: "#7a4a2e", dirtWet: "#6e4029",
    k: "#4a2f22", skin: "#f6c9a0", hair: "#7a4a2e", shirt: "#e06a62",
    pants: "#5873a8", blush: "#f19a8f", star: "#ffcf4a",
    wood: "#c0804e", woodDark: "#6e4029", woodLight: "#e3ad72",
    leaf: "#4f9a45", leafLight: "#6fbb55", trunk: "#7a4a2e",
    metal: "#8fb3c9", metalDark: "#5d7f96", water: "#bfeaf5"
  };

  // ---------------- 原创像素图案 ----------------
  var HERO_TOP = [
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
    ".kbbbbbbk."
  ];
  var LEGS = {
    stand: [".kbbkkbbk.", ".kbk..kbk.", ".kk....kk."],
    walk1: [".kbbkkbbk.", ".kbk.kbk..", ".kk..kk..."],
    walk2: [".kbbkkbbk.", "..kbk..kbk", "..kk....kk"]
  };
  var HERO_PAL = { k: C.k, h: C.hair, s: C.skin, p: C.blush, r: C.shirt, b: C.pants };

  var CAN = [
    "..kk...",
    ".kmmk.k",
    "kmmmmkm",
    "kmMmmk.",
    ".kkkk.."
  ];
  var CAN_PAL = { k: C.k, m: C.metal, M: C.metalDark };

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
  var TREE_PAL = { L: C.leaf, l: C.leafLight, t: C.trunk };

  var SIGN = ["wwwwwww", "wkwkwkw", "wwwwwww", "...d...", "...d...", "...d...", "...d..."];
  var SIGN_PAL = { w: C.wood, k: C.woodDark, d: C.woodDark };

  var TENT = [
    "......k......",
    ".....kTk.....",
    "....kTtTk....",
    "...kTttdTk...",
    "..kTttdddTk..",
    ".kTtttdddtTk.",
    "kTttttdddttTk",
    "kkkkkkkkkkkkk"
  ];
  var TENT_PAL = { k: C.k, t: "#efdcb2", T: "#c9a876", d: C.woodDark };

  var COTTAGE = [
    "..........cc...",
    "...kkkkkkkcck..",
    "..krrrrrrrrrrk.",
    ".krrrrrrrrrrrrk",
    "kRRRRRRRRRRRRRk",
    ".kwwwwwwwwwwwk.",
    ".kwbbwwwwwbbwk.",
    ".kwbbwwddwbbwk.",
    ".kwwwwwddwwwwk.",
    ".kWWWWWddWWWWk.",
    ".kkkkkkkkkkkkk."
  ];
  var COTTAGE_PAL = { k: C.k, r: "#d0645a", R: "#93403a", w: "#f6e7c6", W: "#dcc49a", b: "#a6e0e6", d: C.woodDark, c: "#8a8079" };

  var BOAT = [
    ".....m......",
    ".....ms.....",
    ".....mss....",
    ".....msss...",
    "hhhhhhhhhhh.",
    ".HhhhhhhhhH.",
    "..HHHHHHHH.."
  ];
  var BOAT_PAL = { m: C.woodDark, s: "#fffaf0", h: C.wood, H: C.woodDark };

  var LIGHTHOUSE = [
    "...kkk...",
    "..klllk..",
    "..kkkkk..",
    "...krk...",
    "...kwk...",
    "..krrrk..",
    "..kwwwk..",
    "..krrrk..",
    "..kwwwk..",
    "..krrrk..",
    ".kkkkkkk.",
    "gggGggggg",
    "GgggggGgg",
    ".GGgggGG."
  ];
  var LIGHTHOUSE_PAL = { k: C.k, l: C.star, r: "#e06a62", w: "#fffaf0", g: "#a39b8f", G: "#7d756a" };

  // 会长在岛上的东西（P = 花瓣颜色，会变）
  var ITEMS = {
    flower:    { map: ["..P..", ".PyP.", "..P..", "..g..", ".gg..", "..g.."], pal: { y: C.star, g: C.leaf } },
    tulip:     { map: [".P.P.", ".PPP.", ".PPP.", "..g..", ".gg..", "..g.."], pal: { g: C.leaf } },
    sunflower: { map: [".YYY.", "YYbYY", ".YYY.", "..g..", ".gg..", "..gg.", "..g.."], pal: { Y: "#ffd23f", b: "#8a5a2b", g: C.leaf } },
    bush:      { map: ["..GGG..", ".GgGPG.", "GGPGgGG", "GgGGGPG", ".GGGGG."], pal: { G: C.leaf, g: C.leafLight } },
    mushroom:  { map: [".RRR.", "RRwRR", "RRRRR", ".www.", ".www."], pal: { R: "#d9584e", w: "#fbefd6" } },
    pumpkin:   { map: ["...g..", ".OOOO.", "OoOOoO", "OoOOoO", ".OOOO."], pal: { g: C.leaf, O: "#f0913a", o: "#c9702a" } },
    sprout:    { map: ["g...g", ".g.g.", "..g.."], pal: { g: C.leafLight } },
    rock:      { map: [".sSs..", "smssSs", "ssssss"], pal: { s: "#b3aa9c", S: "#8f877a", m: C.leafLight } },
    sapling:   { map: ["..LLL..", ".LLlLL.", "LLLLLlL", "LlLLLLL", ".LLLLL.", "...t...", "...t...", "..ttt.."], pal: { L: C.leaf, l: C.leafLight, t: C.trunk } }
  };
  var PETALS = ["#f29bb0", "#ffd75e", "#8fb8ff", "#fff6e6", "#c79bf2", "#ff9f7a"];
  var BERRIES = ["#e05a4e", "#8fb8ff", "#c79bf2"];
  var KIND_WEIGHTS = [[26, "flower"], [40, "tulip"], [50, "sunflower"], [62, "bush"], [70, "mushroom"], [79, "pumpkin"], [90, "sprout"], [100, "rock"]];

  // 田里的作物
  var CROPS = {
    seed:    { map: [".g..g.", "gg.gg."], pal: { g: C.leafLight } },
    carrot:  { map: ["..gg..", ".gGGg.", "..oo..", "..oo.."], pal: { g: C.leafLight, G: C.leaf, o: "#f0913a" } },
    cabbage: { map: [".gGGg.", "gGllGg", "gGllGg", ".gGGg."], pal: { g: C.leaf, G: C.leafLight, l: "#c8eba0" } },
    berry:   { map: [".g..g.", "rr.rr.", "rw.rw."], pal: { g: C.leaf, r: "#e05a4e", w: "#ffe1dc" } }
  };
  var CROP_KINDS = ["carrot", "cabbage", "berry"];

  // ---------------- 地图布局 ----------------
  var PLOTS = [];
  for (var pr = 0; pr < 2; pr++) for (var pc = 0; pc < 3; pc++) {
    PLOTS.push({ x: 28 + pc * 10, y: 37 + pr * 8, w: 8, h: 6 });
  }
  var HOUSE = { x: 70, y: 19 };        // 帐篷 / 小屋的左上角
  var TREE_POS = { x: 91, y: 21 };
  var SIGN_POS = { x: 58, y: 41 };
  var DOCK = { x: 103, y: 46 };
  var HOME = { x: 80, y: 41 };          // 小人的“家门口”

  // ---------------- 工具 ----------------
  var canvas, ctx, ground, frame = 0, last = 0;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function rng(seed) {
    return function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  }
  function inEllipse(x, y, e, margin) {
    var m = margin || 0;
    var dx = (x - e.cx) / (e.rx - m), dy = (y - e.cy) / (e.ry - m);
    return dx * dx + dy * dy <= 1;
  }
  function px(x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }

  // 画一个像素图：opt.flip 镜像，opt.rows 只画最下面几行（用于“长出来”的动画）
  function sprite(map, pal, ox, oy, opt) {
    opt = opt || {};
    var h = map.length, w = map[0].length;
    var from = opt.rows != null ? Math.max(0, h - opt.rows) : 0;
    for (var y = from; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ch = map[y][opt.flip ? w - 1 - x : x];
        var c = pal[ch];
        if (c) px(ox + x, oy + y, c);
      }
    }
  }

  // ---------------- 地面（只画一次） ----------------
  function buildGround() {
    ground = document.createElement("canvas");
    ground.width = W; ground.height = H;
    var g = ground.getContext("2d");
    var rand = rng(7);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var color, r = rand();
        if (inEllipse(x, y, GRASS)) color = r < 0.08 ? C.grassDark : r < 0.14 ? C.grassLight : C.grass;
        else if (inEllipse(x, y, SAND)) color = r < 0.1 ? C.sandDark : C.sand;
        else if (inEllipse(x, y, FOAM)) color = C.foam;
        else color = r < 0.04 ? C.seaDeep : C.sea;
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
    }
    PLOTS.forEach(function (p) {
      g.fillStyle = C.dirtDark; g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = C.dirt; g.fillRect(p.x, p.y, p.w, p.h - 1);
      g.fillStyle = C.dirtDark; g.fillRect(p.x + 1, p.y + 2, p.w - 2, 1);
    });
  }

  // ---------------- 生长位置 ----------------
  var SLOTS = [];
  function blocked(x, y) {
    var zones = [
      [25, 34, 60, 57],   // 田地
      [66, 16, 89, 33],   // 小屋
      [88, 18, 103, 34],  // 大树
      [55, 38, 67, 50],   // 木牌
      [73, 33, 87, 44],   // 家门口
      [98, 42, 110, 51]   // 码头入口
    ];
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3]) return true;
    }
    return false;
  }
  function buildSlots() {
    var r = rng(42);
    for (var y = 22; y <= 59; y += 5) {
      for (var x = 22; x <= 106; x += 6) {
        var sx = x + Math.floor(r() * 3) - 1 + ((y / 5) % 2 ? 3 : 0);
        var sy = y + Math.floor(r() * 2);
        if (!inEllipse(sx, sy, GRASS, 4)) continue;
        if (blocked(sx, sy)) continue;
        SLOTS.push({ x: sx, y: sy, d: Math.hypot(sx - 66, (sy - 40) * 1.6) });
      }
    }
    // 从岛中间往外长
    SLOTS.sort(function (a, b) { return a.d - b.d; });
  }

  // ---------------- 由数据得出岛上的东西 ----------------
  var items = [], crops = [], winTotal = 0;
  var reveal = null;      // 正在“长出来”的那一样东西 { id, start }
  var hiddenId = null;    // 等小人浇完水才显示

  function itemFor(win, index) {
    var h = hash(win.id || win.text);
    var kind;
    if (index % 10 === 9) kind = "sapling";
    else {
      var roll = h % 100;
      for (var i = 0; i < KIND_WEIGHTS.length; i++) if (roll < KIND_WEIGHTS[i][0]) { kind = KIND_WEIGHTS[i][1]; break; }
    }
    var def = ITEMS[kind];
    var pal = {};
    for (var k in def.pal) pal[k] = def.pal[k];
    pal.P = kind === "bush" ? BERRIES[(h >> 8) % BERRIES.length] : PETALS[(h >> 8) % PETALS.length];
    var slot = SLOTS[index % SLOTS.length];
    var w = def.map[0].length, hgt = def.map.length;
    return {
      id: win.id, text: win.text, doneAt: win.doneAt, kind: kind,
      map: def.map, pal: pal, w: w, h: hgt,
      x: slot.x - Math.floor(w / 2), y: slot.y - hgt + 1,
      base: slot.y, slot: slot,
      level: Math.floor(index / SLOTS.length) // 位置都长满后，再长就让原来的东西更茂盛
    };
  }

  function refresh() {
    var wins = Store.allWins();
    winTotal = wins.length;
    items = wins.map(itemFor);
    var today = Store.getDay().tasks;
    crops = PLOTS.map(function (p, i) {
      var t = today[i];
      if (!t) return null;
      var kind = t.doneAt ? CROP_KINDS[hash(t.id) % CROP_KINDS.length] : "seed";
      return { task: t, kind: kind, plot: p };
    });
    updateCaption();
  }

  // ---------------- 小人 ----------------
  var hero = { x: HOME.x, y: HOME.y, face: 1, mode: "idle", jobs: [], wait: 12, cheer: 0 };

  function standNear(x, y) {
    // 站在目标左边，面朝右；左边站不下就站右边
    var left = { x: x - 7, y: y, face: 1 };
    if (inEllipse(left.x, left.y, GRASS, 2)) return left;
    return { x: x + 7, y: y, face: -1 };
  }

  function plotStand(p) { return { x: p.x - 3, y: p.y + 6, face: 1 }; }

  function goTo(spot, fast) {
    hero.jobs.push({ t: "go", x: spot.x, y: spot.y, face: spot.face, fast: !!fast });
  }

  function planIdle() {
    var r = Math.random();
    if (r < 0.5) {
      var p = PLOTS[Math.floor(Math.random() * PLOTS.length)];
      goTo(plotStand(p));
      hero.jobs.push({ t: "water", n: 14 });
    } else if (r < 0.8 && items.length) {
      var it = items[Math.floor(Math.random() * items.length)];
      goTo(standNear(it.slot.x, it.slot.y));
      hero.jobs.push({ t: "water", n: 10 });
    } else {
      goTo({ x: HOME.x, y: HOME.y, face: Math.random() < 0.5 ? 1 : -1 });
    }
    hero.jobs.push({ t: "rest", n: 20 + Math.floor(Math.random() * 30) });
  }

  // 完成了一件事：去田里浇水 → 去新位置浇水 → 东西长出来 → 开心跳一下
  function celebrate(id) {
    if (hiddenId) finishReveal();
    var item = null;
    for (var i = 0; i < items.length; i++) if (items[i].id === id) item = items[i];
    if (!item || reduceMotion) { if (item) startReveal(item.id); return; }
    hiddenId = item.id;
    hero.jobs = [];
    for (var j = 0; j < crops.length; j++) {
      if (crops[j] && crops[j].task.id === id) {
        goTo(plotStand(crops[j].plot), true);
        hero.jobs.push({ t: "water", n: 6 });
      }
    }
    goTo(standNear(item.slot.x, item.slot.y), true);
    hero.jobs.push({ t: "water", n: 8 });
    hero.jobs.push({ t: "reveal" });
    hero.jobs.push({ t: "cheer", n: 10 });
    hero.jobs.push({ t: "rest", n: 30 });
  }

  function startReveal(id) { hiddenId = null; reveal = { id: id, start: frame }; }
  function finishReveal() { if (hiddenId) startReveal(hiddenId); }

  function stepHero() {
    var job = hero.jobs[0];
    if (!job) {
      hero.mode = "idle";
      if (--hero.wait <= 0) { planIdle(); hero.wait = 1; }
      return;
    }
    if (job.t === "go") {
      var dx = job.x - hero.x, dy = job.y - hero.y;
      if (dx === 0 && dy === 0) {
        if (job.face) hero.face = job.face;
        hero.jobs.shift();
        return;
      }
      hero.mode = "walk";
      var step = job.fast ? 2 : 1; // 有好消息时小跑过去
      if (dx) { hero.x += Math.sign(dx) * Math.min(step, Math.abs(dx)); hero.face = dx > 0 ? 1 : -1; }
      if (dy && (job.fast || frame % 2 === 0 || !dx)) hero.y += Math.sign(dy) * Math.min(step, Math.abs(dy));
    } else if (job.t === "water" || job.t === "rest" || job.t === "cheer") {
      hero.mode = job.t === "rest" ? "idle" : job.t;
      if (--job.n <= 0) hero.jobs.shift();
    } else if (job.t === "reveal") {
      finishReveal();
      hero.jobs.shift();
    }
  }

  function drawHero() {
    var ox = hero.x - 5, oy = hero.y - 13;
    var flip = hero.face < 0;
    if (hero.mode === "idle" && frame % 10 >= 5) oy += 1;            // 呼吸
    if (hero.mode === "cheer") oy -= (frame % 4 < 2 ? 2 : 0);          // 跳一跳

    // 影子
    ctx.fillStyle = "rgba(74,47,34,0.25)";
    ctx.fillRect(hero.x - 4, hero.y + 1, 8, 1);

    var legs = LEGS.stand;
    if (hero.mode === "walk") legs = frame % 4 < 2 ? LEGS.walk1 : LEGS.walk2;
    sprite(HERO_TOP.concat(legs), HERO_PAL, ox, oy, { flip: flip });

    if (hero.mode === "water") {
      var cx = flip ? ox - 6 : ox + 9;
      sprite(CAN, CAN_PAL, cx, oy + 6, { flip: flip });
      // 水滴往下落
      var sx = flip ? cx - 1 : cx + 7;
      for (var d = 0; d < 3; d++) {
        var fy = oy + 8 + ((frame + d * 2) % 6);
        px(sx + (d % 2 ? (flip ? -1 : 1) : 0), fy, C.water);
      }
    }
    if (hero.mode === "cheer") {
      var sy = oy - 4 - (frame % 4);
      px(hero.x, sy, C.star); px(hero.x - 1, sy + 1, C.star); px(hero.x, sy + 1, C.star);
      px(hero.x + 1, sy + 1, C.star); px(hero.x, sy + 2, C.star);
    }
  }

  // ---------------- 每一帧 ----------------
  function drawWaves() {
    var waves = [[20, 6], [100, 8], [14, 70], [92, 74], [118, 30], [4, 40], [60, 4], [50, 76]];
    waves.forEach(function (w, i) {
      var shift = (frame + i * 3) % 16 < 8 ? 0 : 1;
      var x = w[0] + shift, y = w[1];
      px(x, y, C.wave); px(x + 1, y - 1, C.wave); px(x + 2, y - 1, C.wave); px(x + 3, y, C.wave);
    });
  }

  function drawDock() {
    ctx.fillStyle = C.woodDark;
    ctx.fillRect(DOCK.x, DOCK.y + 3, 20, 1);
    for (var x = DOCK.x; x < DOCK.x + 20; x += 3) {
      ctx.fillStyle = x % 2 ? C.wood : C.woodLight;
      ctx.fillRect(x, DOCK.y, 2, 3);
    }
    ctx.fillStyle = C.woodDark;
    ctx.fillRect(DOCK.x + 4, DOCK.y + 4, 1, 3);
    ctx.fillRect(DOCK.x + 16, DOCK.y + 4, 1, 3);
  }

  function itemSparkles(it, age) {
    var pts = [[-2, 0], [it.w + 1, 2], [Math.floor(it.w / 2), -3], [-1, it.h - 1], [it.w, it.h - 2]];
    pts.forEach(function (p, i) {
      if ((age + i) % 3 === 0) return;
      px(it.x + p[0], it.y + p[1] - Math.floor(age / 3), C.star);
    });
  }

  function draw() {
    ctx.drawImage(ground, 0, 0);
    drawWaves();

    if (winTotal >= 30) {
      drawDock();
      var bob = frame % 12 < 6 ? 0 : 1;
      sprite(BOAT, BOAT_PAL, 112, 48 + bob);
    }
    if (winTotal >= 60) {
      sprite(LIGHTHOUSE, LIGHTHOUSE_PAL, 4, 3);
      if (frame % 12 < 6) { px(5, 4, C.star); px(11, 4, C.star); px(8, 0, C.star); }
    }

    // 田里的作物
    crops.forEach(function (c) {
      if (!c) return;
      var def = CROPS[c.kind];
      var w = def.map[0].length, h = def.map.length;
      sprite(def.map, def.pal, c.plot.x + Math.floor((c.plot.w - w) / 2), c.plot.y + c.plot.h - h - 1);
    });

    // 需要按前后（y）排序画的东西
    var list = [];
    list.push({ base: HOUSE.y + 10, draw: function () {
      if (winTotal >= 15) sprite(COTTAGE, COTTAGE_PAL, HOUSE.x, HOUSE.y);
      else sprite(TENT, TENT_PAL, HOUSE.x + 1, HOUSE.y + 3);
    } });
    list.push({ base: TREE_POS.y + 10, draw: function () { sprite(TREE, TREE_PAL, TREE_POS.x, TREE_POS.y); } });
    list.push({ base: SIGN_POS.y + 6, draw: function () { sprite(SIGN, SIGN_PAL, SIGN_POS.x, SIGN_POS.y); } });

    items.forEach(function (it) {
      if (it.id === hiddenId) return;
      list.push({ base: it.base, draw: function () {
        var age = reveal && reveal.id === it.id ? frame - reveal.start : null;
        var rows = age !== null && age < it.h ? age + 1 : null;
        // 更茂盛：旁边多开几朵小花
        for (var l = 0; l < Math.min(it.level, 3); l++) {
          var fx = it.x + (l % 2 ? it.w : -2), fy = it.base - 1 - l;
          px(fx, fy, PETALS[(l + it.w) % PETALS.length]);
          px(fx, fy + 1, C.leaf);
        }
        sprite(it.map, it.pal, it.x, it.y, { rows: rows });
        if (age !== null && age < 14) itemSparkles(it, age);
      } });
    });
    list.push({ base: hero.y, draw: drawHero });

    list.sort(function (a, b) { return a.base - b.base; });
    list.forEach(function (e) { e.draw(); });

    if (reveal && frame - reveal.start > 16) reveal = null;
  }

  function loop(t) {
    if (t - last > TICK) {
      last = t;
      frame++;
      stepHero();
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---------------- 说明文字 & 鼠标提示 ----------------
  function updateCaption() {
    var el = document.getElementById("island-caption");
    if (!el) return;
    var next = null;
    for (var i = 0; i < MILESTONES.length; i++) if (winTotal < MILESTONES[i].at) { next = MILESTONES[i]; break; }
    var text = winTotal === 0 ? I18n.t("island.zero")
      : winTotal === 1 ? I18n.t("island.countOne")
      : I18n.t("island.count", { n: winTotal });
    if (next) {
      if (winTotal > 0) text += I18n.t("island.next", { n: next.at - winTotal, name: I18n.t(next.name) });
    } else {
      text += I18n.t("island.full");
    }
    el.textContent = text;
  }

  function fmtDay(t) {
    var d = new Date(t);
    var months = I18n.t("months");
    return I18n.t("island.date", { m: d.getMonth() + 1, d: d.getDate(), mon: Array.isArray(months) ? months[d.getMonth()] : "" });
  }

  function hitTest(lx, ly) {
    // 先看作物，再看岛上的东西（从前往后）
    for (var i = 0; i < crops.length; i++) {
      var c = crops[i];
      if (c && lx >= c.plot.x && lx < c.plot.x + c.plot.w && ly >= c.plot.y - 2 && ly < c.plot.y + c.plot.h) {
        return I18n.t(c.task.doneAt ? "island.tipDone" : "island.tipGrowing", { text: c.task.text });
      }
    }
    var sorted = items.slice().sort(function (a, b) { return b.base - a.base; });
    for (var j = 0; j < sorted.length; j++) {
      var it = sorted[j];
      if (it.id === hiddenId) continue;
      if (lx >= it.x - 1 && lx <= it.x + it.w && ly >= it.y - 1 && ly <= it.base) {
        return I18n.t("island.tipItem", { text: it.text, date: fmtDay(it.doneAt) });
      }
    }
    return null;
  }

  function setupTips() {
    var tip = document.getElementById("island-tip");
    if (!tip) return;
    canvas.addEventListener("mousemove", function (e) {
      var rect = canvas.getBoundingClientRect();
      var lx = Math.floor((e.clientX - rect.left) / rect.width * W);
      var ly = Math.floor((e.clientY - rect.top) / rect.height * H);
      var text = hitTest(lx, ly);
      if (!text) { tip.hidden = true; canvas.style.cursor = ""; return; }
      tip.textContent = text;
      tip.hidden = false;
      canvas.style.cursor = "help";
      var frameRect = canvas.parentNode.getBoundingClientRect();
      var x = e.clientX - frameRect.left, y = e.clientY - frameRect.top;
      tip.style.left = Math.min(x + 12, frameRect.width - tip.offsetWidth - 6) + "px";
      tip.style.top = Math.max(6, y - tip.offsetHeight - 10) + "px";
    });
    canvas.addEventListener("mouseleave", function () { tip.hidden = true; });
  }

  // ---------------- 对外 ----------------
  function onChange(e) {
    var d = e.detail || {};
    refresh();
    if (d.type === "complete") celebrate(d.id);
    if (!ctx) return;
    if (reduceMotion) draw();
  }

  function init(el) {
    canvas = el;
    if (!canvas || !canvas.getContext) return;
    ctx = canvas.getContext("2d");
    buildGround();
    buildSlots();
    refresh();
    draw();
    setupTips();
    document.addEventListener("wins:change", onChange);
    if (!reduceMotion) requestAnimationFrame(loop);
  }

  return { init: init };
})();

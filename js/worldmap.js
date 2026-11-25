/*
 * 世界地图（第 7 步）
 *
 * - 原创 Q 版像素世界地图：大陆是用一组椭圆“捏”出来的圆润形状，不照搬任何现成地图素材
 * - 鼠标移到城市上：城市闪光、微微凸起，随机弹出几张留言纸条
 * - 留言现在是示例数据（SAMPLE_NOTES），以后接入真实用户时，只要把 notesFor() 换成从服务器读取
 * - 城市名和留言都同时写了中文和英文，方便以后做双语版
 */
var WorldMap = (function () {
  var W = 160, H = 80;
  var LAT_TOP = 84, LAT_SPAN = 144;   // 地图从北纬 84° 画到南纬 60°
  var TICK = 220;

  var C = {
    sea: "#62b7c9", seaDeep: "#4fa3b8", wave: "#a6e0e6", shore: "#d8f4ef",
    sand: "#f2d59a", grass: "#7cc35a", grassDark: "#5ea64b", grassLight: "#9ad671",
    desert: "#e8c88a", desertDark: "#d4ad6c", snow: "#f4f7f2", snowShade: "#dbe6e4",
    tree: "#3f8a3c", treeLight: "#5ea64b", trunk: "#7a4a2e",
    rock: "#a39b8f", rockDark: "#7d756a", cloud: "#ffffff", cloudShade: "#e6f3f6"
  };

  // 大陆：[经度, 纬度, 横向半径°, 纵向半径°]
  var LAND = [
    // 北美
    [-100, 48, 28, 16], [-115, 60, 22, 10], [-152, 64, 12, 6], [-85, 36, 14, 10], [-102, 25, 9, 7],
    [-88, 15, 5, 4], [-78, 70, 16, 8], [-42, 72, 12, 8], [-66, 50, 8, 6],
    // 南美
    [-60, -5, 16, 12], [-62, -22, 12, 10], [-68, -40, 6, 12], [-74, 6, 6, 6],
    // 欧洲
    [10, 50, 14, 8], [28, 58, 14, 8], [-4, 40, 5, 4], [13, 43, 3, 4], [-2, 54, 2.5, 3.5], [16, 64, 6, 6],
    // 非洲
    [12, 12, 24, 13], [26, -8, 14, 13], [24, -25, 9, 7], [47, -19, 2.5, 5], [40, 8, 8, 6],
    // 亚洲
    [90, 56, 45, 14], [80, 36, 24, 12], [78, 20, 8, 8], [105, 18, 9, 9], [45, 28, 12, 8],
    [118, 32, 10, 10], [138, 37, 3, 6], [128, 37, 2, 3], [150, 62, 14, 7],
    // 东南亚岛屿 & 大洋洲
    [113, -2, 12, 3], [123, 9, 3, 5], [138, -5, 6, 3],
    [134, -25, 17, 11], [172, -42, 3, 5]
  ];
  var DESERT = [[2, 23, 20, 7], [46, 23, 9, 6], [133, -25, 9, 6], [-112, 33, 6, 4], [100, 42, 12, 4]];
  var MOUNTAINS = [[-112, 46], [-106, 39], [-70, -18], [-70, -32], [84, 31], [93, 31], [10, 46], [60, 55]];
  var MY_ISLAND = { lon: -150, lat: -18 };

  // ---------------- 城市 & 示例留言 ----------------
  var CITIES = [
    { id: "sf",   zh: "旧金山",   en: "San Francisco", lon: -122.4, lat: 37.8 },
    { id: "nyc",  zh: "纽约",     en: "New York",      lon: -74,    lat: 40.7 },
    { id: "mex",  zh: "墨西哥城", en: "Mexico City",   lon: -99.1,  lat: 19.4 },
    { id: "sp",   zh: "圣保罗",   en: "São Paulo",     lon: -46.6,  lat: -23.5 },
    { id: "ldn",  zh: "伦敦",     en: "London",        lon: -0.1,   lat: 51.5 },
    { id: "ber",  zh: "柏林",     en: "Berlin",        lon: 13.4,   lat: 52.5 },
    { id: "cai",  zh: "开罗",     en: "Cairo",         lon: 31.2,   lat: 30 },
    { id: "nbo",  zh: "内罗毕",   en: "Nairobi",       lon: 36.8,   lat: -1.3 },
    { id: "bom",  zh: "孟买",     en: "Mumbai",        lon: 72.8,   lat: 19 },
    { id: "sin",  zh: "新加坡",   en: "Singapore",     lon: 103.8,  lat: 1.35 },
    { id: "sha",  zh: "上海",     en: "Shanghai",      lon: 121.5,  lat: 31.2 },
    { id: "tyo",  zh: "东京",     en: "Tokyo",         lon: 139.7,  lat: 35.7 },
    { id: "syd",  zh: "悉尼",     en: "Sydney",        lon: 151.2,  lat: -33.9 }
  ];

  // 示例留言（不是真实用户），每条：中文、英文、昵称
  var SAMPLE_NOTES = {
    sf:  [["早起去海边跑 3 公里 🏃", "Run 3km by the bay before work 🏃", "雾里的鹿"], ["把拖了一周的报销填完", "Finally file the expenses I've put off", "Kai"], ["学会做一道新菜", "Learn to cook one new dish", "Mia"], ["给老朋友发条消息", "Text an old friend", "Leo"]],
    nyc: [["午休时读 20 页书 📖", "Read 20 pages at lunch 📖", "Ava"], ["整理衣柜，捐掉三件衣服", "Clear out the closet, donate 3 things", "小苹果"], ["准备明天的面试", "Prep for tomorrow's interview", "Sam"], ["走路去上班，不坐地铁", "Walk to work instead of the subway", "Noah"]],
    mex: [["去市场买新鲜的水果 🥭", "Get fresh fruit at the market 🥭", "Lucía"], ["练 15 分钟吉他", "Practice guitar for 15 minutes", "Diego"], ["给奶奶打个电话", "Call grandma", "Sofi"]],
    sp:  [["写完论文的第一节", "Finish the first section of my thesis", "Bia"], ["晚上去公园散步", "Evening walk in the park", "Rafa"], ["把房间打扫干净 ✨", "Clean my room ✨", "Gabi"]],
    ldn: [["下雨也要出门跑步 ☔", "Go for a run even if it rains ☔", "Olivia"], ["回完积压的邮件", "Clear my email backlog", "小熊"], ["去图书馆复习三小时", "Three hours of revision at the library", "Tom"], ["给自己泡一壶好茶，休息一下", "Make a proper pot of tea and rest", "Ellie"]],
    ber: [["骑车去上班 🚲", "Cycle to work 🚲", "Jonas"], ["学 20 个德语单词", "Learn 20 German words", "阿柚"], ["把画了一半的画画完", "Finish the half-done painting", "Lena"]],
    cai: [["早上背 30 个单词", "Memorise 30 words this morning", "Omar"], ["帮妈妈准备晚饭", "Help mum make dinner", "Nour"], ["整理好下周的计划", "Plan out next week", "Yara"]],
    nbo: [["晨跑 5 公里 🌅", "Morning 5k run 🌅", "Wanjiru"], ["提交项目申请", "Submit the project application", "Brian"], ["读完那本小说", "Finish that novel", "Achieng"]],
    bom: [["做 20 分钟瑜伽 🧘", "20 minutes of yoga 🧘", "Priya"], ["复习统计学第三章", "Revise chapter 3 of stats", "Arjun"], ["给植物换盆", "Repot my plants", "小芒果"], ["早点睡觉，不熬夜", "Go to bed early tonight", "Neha"]],
    sin: [["去小贩中心吃早餐，然后开始工作", "Hawker breakfast, then start work", "Wei"], ["把 PPT 做完", "Finish the slides", "Rachel"], ["游泳 30 分钟", "Swim for 30 minutes", "Marcus"]],
    sha: [["写完周报，准时下班 💼", "Finish the weekly report, leave on time 💼", "小满"], ["去菜市场买菜做饭", "Buy groceries and cook at home", "阿杰"], ["背 50 个单词", "Learn 50 vocabulary words", "橘子汽水"], ["晚上散步半小时", "Half-hour walk tonight", "Echo"]],
    tyo: [["把房间的一个角落收拾好", "Tidy one corner of my room", "Yuki"], ["画一张小插画 🎨", "Draw one small illustration 🎨", "Haru"], ["学一首新歌的前奏", "Learn the intro of a new song", "小樱"], ["早上不看手机 30 分钟", "No phone for the first 30 minutes", "Ren"]],
    syd: [["去海边游个泳 🌊", "Swim at the beach 🌊", "Chloe"], ["写完作业再玩", "Homework first, then play", "Jack"], ["给家里人做一顿早午餐", "Make brunch for the family", "Grace"]]
  };

  // ---------------- 工具 ----------------
  var canvas, ctx, base, wrap, notesLayer, view, frame = 0, last = 0;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rng(seed) {
    return function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  }
  function toLL(x, y) { return [x / W * 360 - 180, LAT_TOP - y / H * LAT_SPAN]; }
  function toXY(lon, lat) { return [(lon + 180) / 360 * W, (LAT_TOP - lat) / LAT_SPAN * H]; }
  function inBlobs(list, lon, lat) {
    for (var i = 0; i < list.length; i++) {
      var b = list[i], dx = (lon - b[0]) / b[2], dy = (lat - b[1]) / b[3];
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  }
  function px(g, x, y, color) { g.fillStyle = color; g.fillRect(x, y, 1, 1); }
  function sprite(g, map, pal, ox, oy) {
    for (var y = 0; y < map.length; y++) for (var x = 0; x < map[y].length; x++) {
      var c = pal[map[y][x]];
      if (c) px(g, ox + x, oy + y, c);
    }
  }

  var MOUNTAIN = ["..w..", ".wrR.", "rrRRR", "rRRRR"];
  var TREE = [".g.", "ggG", "gGG", ".t."];
  var CLOUD = ["..ccc....", ".ccccccc.", "cccccccss", ".sssssss."];

  // ---------------- 底图（只画一次） ----------------
  function buildBase() {
    base = document.createElement("canvas");
    base.width = W; base.height = H;
    var g = base.getContext("2d");
    var rand = rng(11);

    var land = [];
    for (var y = 0; y < H; y++) {
      land.push([]);
      for (var x = 0; x < W; x++) {
        var ll = toLL(x + 0.5, y + 0.5);
        land[y].push(inBlobs(LAND, ll[0], ll[1]));
      }
    }
    function isLand(x, y) { return y >= 0 && y < H && x >= 0 && x < W && land[y][x]; }
    function nearSea(x, y) { return !isLand(x - 1, y) || !isLand(x + 1, y) || !isLand(x, y - 1) || !isLand(x, y + 1); }
    function nearLand(x, y) { return isLand(x - 1, y) || isLand(x + 1, y) || isLand(x, y - 1) || isLand(x, y + 1); }

    for (var yy = 0; yy < H; yy++) {
      for (var xx = 0; xx < W; xx++) {
        var r = rand(), color;
        var lat = toLL(xx, yy)[1], lon = toLL(xx, yy)[0];
        if (isLand(xx, yy)) {
          if (nearSea(xx, yy)) color = lat > 64 ? C.snowShade : C.sand;
          else if (lat > 64) color = r < 0.15 ? C.snowShade : C.snow;
          else if (inBlobs(DESERT, lon, lat)) color = r < 0.12 ? C.desertDark : C.desert;
          else color = r < 0.1 ? C.grassDark : r < 0.16 ? C.grassLight : C.grass;
        } else {
          color = nearLand(xx, yy) ? C.shore : (r < 0.04 ? C.seaDeep : C.sea);
        }
        px(g, xx, yy, color);
      }
    }

    // 小树（只长在草地上）
    var trees = rng(5);
    for (var i = 0; i < 260; i++) {
      var tx = Math.floor(trees() * (W - 3)), ty = Math.floor(trees() * (H - 4));
      var ok = true;
      for (var a = 0; a < 3 && ok; a++) for (var b = 0; b < 4 && ok; b++) {
        var ll2 = toLL(tx + a, ty + b);
        if (!isLand(tx + a, ty + b) || nearSea(tx + a, ty + b) || ll2[1] > 62 || inBlobs(DESERT, ll2[0], ll2[1])) ok = false;
      }
      if (ok && trees() < 0.35) sprite(g, TREE, { g: C.tree, G: C.treeLight, t: C.trunk }, tx, ty);
    }
    // 山
    MOUNTAINS.forEach(function (m) {
      var p = toXY(m[0], m[1]);
      sprite(g, MOUNTAIN, { w: C.snow, r: C.rock, R: C.rockDark }, Math.round(p[0]) - 2, Math.round(p[1]) - 3);
    });
    // 我的小岛：太平洋里的一个小点
    var mi = toXY(MY_ISLAND.lon, MY_ISLAND.lat);
    var ix = Math.round(mi[0]), iy = Math.round(mi[1]);
    for (var dy = -2; dy <= 2; dy++) for (var dx = -3; dx <= 3; dx++) {
      var e = (dx * dx) / 9 + (dy * dy) / 4;
      if (e <= 1.05) px(g, ix + dx, iy + dy, e > 0.5 ? C.sand : C.grass);
      else if (e <= 1.7) px(g, ix + dx, iy + dy, C.shore);
    }
    px(g, ix, iy - 1, C.tree); px(g, ix - 1, iy - 2, C.tree); px(g, ix + 1, iy - 2, C.tree); px(g, ix, iy, C.trunk);
  }

  // ---------------- 每一帧：浪花和云 ----------------
  var waves = [], clouds = [];
  function setupMotion() {
    var r = rng(23);
    var g = base.getContext("2d");
    for (var tries = 0; waves.length < 34 && tries < 2000; tries++) {
      var x = Math.floor(r() * (W - 4)), y = Math.floor(r() * H);
      var d = g.getImageData(x, y, 4, 1).data;
      var allSea = true;
      for (var i = 0; i < 16; i += 4) if (!(d[i] === 0x62 && d[i + 1] === 0xb7) && !(d[i] === 0x4f && d[i + 1] === 0xa3)) allSea = false;
      if (allSea) waves.push([x, y, Math.floor(r() * 8)]);
    }
    clouds = [[20, 8], [70, 30], [118, 14], [140, 52], [40, 60]].map(function (c) { return { x: c[0], y: c[1] }; });
  }

  function draw() {
    ctx.drawImage(base, 0, 0);
    waves.forEach(function (w) {
      var on = (frame + w[2]) % 10 < 6;
      if (!on) return;
      px(ctx, w[0], w[1], C.wave); px(ctx, w[0] + 1, w[1] - 1, C.wave); px(ctx, w[0] + 2, w[1] - 1, C.wave); px(ctx, w[0] + 3, w[1], C.wave);
    });
    clouds.forEach(function (c) {
      ctx.globalAlpha = 0.85;
      sprite(ctx, CLOUD, { c: C.cloud, s: C.cloudShade }, Math.round(c.x), c.y);
      ctx.globalAlpha = 1;
    });
  }

  function step() {
    frame++;
    clouds.forEach(function (c) {
      c.x += 0.25;
      if (c.x > W + 2) c.x = -10;
    });
  }

  function loop(t) {
    if (t - last > TICK) {
      last = t;
      if (!view.hidden) { step(); draw(); }
    }
    requestAnimationFrame(loop);
  }

  // ---------------- 城市标记 ----------------
  var CITY_SVG =
    '<svg class="city-icon" viewBox="0 0 11 10" shape-rendering="crispEdges" aria-hidden="true">' +
    '<rect x="0" y="4" width="4" height="6" fill="#4a2f22"/><rect x="1" y="5" width="2" height="5" fill="#e3ad72"/>' +
    '<rect x="3" y="0" width="5" height="10" fill="#4a2f22"/><rect x="4" y="1" width="3" height="9" fill="#f6e7c6"/>' +
    '<rect x="7" y="3" width="4" height="7" fill="#4a2f22"/><rect x="8" y="4" width="2" height="6" fill="#d0645a"/>' +
    '<rect x="5" y="3" width="1" height="1" fill="#62b7c9"/><rect x="5" y="6" width="1" height="1" fill="#62b7c9"/>' +
    '<rect x="1" y="6" width="1" height="1" fill="#fffaf0"/><rect x="8" y="6" width="1" height="1" fill="#fffaf0"/>' +
    '</svg>';
  var HOME_SVG =
    '<svg class="city-icon" viewBox="0 0 7 7" aria-hidden="true"><use href="#px-star"/></svg>';

  function lang() { return I18n.lang(); }

  function addMarker(opts) {
    var p = toXY(opts.lon, opts.lat);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "city" + (opts.me ? " city--me" : "");
    btn.style.left = (p[0] / W * 100) + "%";
    btn.style.top = (p[1] / H * 100) + "%";
    btn.innerHTML = (opts.me ? HOME_SVG : CITY_SVG) + '<span class="city-name"></span>';
    btn.querySelector(".city-name").textContent = opts.name;
    btn.setAttribute("aria-label", I18n.t("map.cityAria", { name: opts.name }));
    btn.dataset.id = opts.id;
    wrap.appendChild(btn);
    return btn;
  }

  // ---------------- 留言纸条 ----------------
  var PAPER = ["#fffaf0", "#ffe3e3", "#e3f4d7", "#fff1b8", "#e3eefc"];
  var OFFSETS = [[-170, -120], [24, -128], [34, -26], [-180, -20], [-74, -176], [40, 60], [-160, 50]];
  var hideTimer = null, activeId = null;

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // 以后接入真实用户：把这里换成从服务器读取
  function notesFor(id) {
    var L = lang();
    if (id === "me") {
      var todos = Store.todosOf(), wins = Store.winsOf(), me = I18n.t("map.me");
      var mine = wins.map(function (w) { return { text: I18n.t("map.meDone", { text: w.text }), who: me }; })
        .concat(todos.map(function (t) { return { text: I18n.t("map.meTodo", { text: t.text }), who: me }; }));
      if (!mine.length) mine = [{ text: I18n.t("map.meEmpty"), who: I18n.t("map.island") }];
      return mine.slice(-3).reverse();
    }
    var pool = shuffle(SAMPLE_NOTES[id] || []);
    var n = Math.min(pool.length, 2 + Math.floor(Math.random() * 2));
    return pool.slice(0, n).map(function (row) { return { text: L === "en" ? row[1] : row[0], who: row[2] }; });
  }

  function clearNotes(immediate) {
    var old = document.querySelectorAll("#world-notes .note, #world-notes-below .note");
    old.forEach(function (n) {
      if (immediate) n.remove();
      else { n.classList.add("is-leaving"); setTimeout(function () { n.remove(); }, 260); }
    });
  }

  function showNotes(btn) {
    clearTimeout(hideTimer);
    var id = btn.dataset.id;
    if (activeId === id) return;
    activeId = id;
    clearNotes(true);
    wrap.querySelectorAll(".city.is-active").forEach(function (c) { c.classList.remove("is-active"); });
    btn.classList.add("is-active");

    var box = wrap.getBoundingClientRect();
    var stacked = box.width < 560; // 地图太小时，纸条排在地图下面
    var below = document.getElementById("world-notes-below");
    var cx = parseFloat(btn.style.left) / 100 * box.width;
    var cy = parseFloat(btn.style.top) / 100 * box.height;
    var offsets = shuffle(OFFSETS);
    var placed = [];

    notesFor(id).forEach(function (note, i) {
      var el = document.createElement("div");
      el.className = "note";
      el.style.setProperty("--paper", PAPER[Math.floor(Math.random() * PAPER.length)]);
      el.style.setProperty("--tilt", (Math.random() * 8 - 4).toFixed(1) + "deg");
      el.style.animationDelay = (i * 90) + "ms";
      el.innerHTML = '<span class="note-text"></span><span class="note-who"></span>';
      el.querySelector(".note-text").textContent = note.text;
      el.querySelector(".note-who").textContent = "— " + note.who;
      if (stacked) { below.appendChild(el); return; }
      notesLayer.appendChild(el);

      // 找一个不出界、不和别的纸条重叠太多的位置
      var w = el.offsetWidth, h = el.offsetHeight, best = null;
      for (var k = 0; k < offsets.length; k++) {
        var x = Math.max(6, Math.min(box.width - w - 6, cx + offsets[k][0]));
        var y = Math.max(6, Math.min(box.height - h - 6, cy + offsets[k][1]));
        var overlap = placed.reduce(function (s, p) {
          var ox = Math.max(0, Math.min(x + w, p.x + p.w) - Math.max(x, p.x));
          var oy = Math.max(0, Math.min(y + h, p.y + p.h) - Math.max(y, p.y));
          return s + ox * oy;
        }, 0);
        if (!best || overlap < best.overlap) best = { x: x, y: y, overlap: overlap, k: k };
        if (overlap === 0) break;
      }
      offsets.splice(best.k, 1);
      placed.push({ x: best.x, y: best.y, w: w, h: h });
      el.style.left = best.x + "px";
      el.style.top = best.y + "px";
    });
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      activeId = null;
      clearNotes(false);
      wrap.querySelectorAll(".city.is-active").forEach(function (c) { c.classList.remove("is-active"); });
    }, 1100);
  }

  // ---------------- 初始化 ----------------
  function init() {
    canvas = document.getElementById("world");
    wrap = document.getElementById("world-wrap");
    notesLayer = document.getElementById("world-notes");
    view = document.getElementById("view-map");
    if (!canvas || !canvas.getContext) return;
    ctx = canvas.getContext("2d");
    buildBase();
    setupMotion();
    draw();

    var L = lang();
    CITIES.forEach(function (c) { addMarker({ id: c.id, name: L === "en" ? c.en : c.zh, lon: c.lon, lat: c.lat }); });
    addMarker({ id: "me", me: true, name: I18n.t("map.myIsland"), lon: MY_ISLAND.lon, lat: MY_ISLAND.lat });

    wrap.addEventListener("mouseover", function (e) {
      var btn = e.target.closest(".city");
      if (btn) showNotes(btn);
    });
    wrap.addEventListener("mouseout", function (e) {
      var btn = e.target.closest(".city");
      if (btn && !btn.contains(e.relatedTarget)) scheduleHide();
    });
    // 键盘和触屏：聚焦或点击也会弹出纸条
    wrap.addEventListener("focusin", function (e) {
      var btn = e.target.closest(".city");
      if (btn) showNotes(btn);
    });
    wrap.addEventListener("focusout", scheduleHide);
    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest(".city");
      if (!btn) return;
      activeId = null; // 再点一次换一批留言
      showNotes(btn);
    });

    if (!reduceMotion) requestAnimationFrame(loop);
  }

  return { init: init };
})();

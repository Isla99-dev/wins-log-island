/*
 * 我的小岛（3D）
 * 三渲二卡通着色 + 轮廓线 + 微缩模型感 + 雨夜暖光（three.js r128，放在 lib/）
 *
 * 小岛分成几个区域，小路连起来：
 *   小屋和院子（左中）· 小树林（右后）· 小溪和木桥（中间）· 小山坡和观景台（左后）
 *   沙滩和小码头（右前）· 果园（左前，完成的事优先种在这里）
 *
 * - 完成一件事（来自「今日任务」或小助手）→ 岛上种一棵树，+10 金币
 * - 金币在商店买东西，点空地放下
 * - 撤回完成 → 那棵树也收回去
 * 数据都在 Store 里（Store.island()、Store.coins()），这里只负责画和交互。
 * 树、石头、木箱等用 Kenney 的 CC0 模型（js/models.js），统一换成卡通材质 + 轮廓线。
 */
var Island = (function () {
  const $ = id => document.getElementById(id);
  const T = (k, p) => I18n.t(k, p);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(21);
  function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function fmtDate(key) {
    const m = +key.slice(5, 7), d = +key.slice(8, 10);
    return T("i3.date", { m: m, d: d, mon: (T("months") || [])[m - 1] || m });
  }

  const SHOP = [
    { id: "flowers", price: 20 },
    { id: "bush", price: 25 },
    { id: "pot", price: 30 },
    { id: "bench", price: 40 },
    { id: "lantern", price: 50 },
    { id: "lamp", price: 60 },
  ];
  const PRICE = {}; SHOP.forEach(s => PRICE[s.id] = s.price);
  const itemName = id => T("i3.item." + id);

  let started = false;
  function init() {
    if (started || !window.THREE) return;
    started = true;
    Store.importIsland3d(PRICE);
    loadModels(build);
  }

  /* ================= Kenney 模型：从 base64 读出来 ================= */
  const RAW = {};
  function loadModels(done) {
    const src = window.ISLAND_MODELS || {};
    const names = Object.keys(src).filter(k => k[0] !== "_");
    if (!names.length || !THREE.GLTFLoader) { done(); return; }
    const mgr = new THREE.LoadingManager();
    mgr.setURLModifier(u => /colormap/.test(u) ? src._colormap : u);
    const loader = new THREE.GLTFLoader(mgr);
    let left = names.length;
    const finish = () => { if (--left === 0) done(); };
    names.forEach(n => {
      try {
        const b = atob(src[n]), u = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        loader.parse(u.buffer, "", g => { RAW[n] = g.scene; finish(); }, finish);
      } catch (e) { finish(); }
    });
  }

  function build() {
    const view = $("view-island");
    const cv = $("island3d");
    const isl = Store.island();

    /* ================= cel shading kit ================= */
    const grad = new THREE.DataTexture(new Uint8Array([96, 96, 96, 178, 178, 178, 255, 255, 255]), 3, 1, THREE.RGBFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
    const matCache = new Map();
    function toon(c, o) {
      if (!o) { let m = matCache.get(c); if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: grad }); matCache.set(c, m); } return m; }
      return new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: grad }, o));
    }
    const EDGE = new THREE.LineBasicMaterial({ color: 0x1b2133, transparent: true, opacity: .75 });
    const edgeCache = new Map();
    function outline(m, th) { const k = m.geometry.uuid + (th || 25); let e = edgeCache.get(k); if (!e) { e = new THREE.EdgesGeometry(m.geometry, th || 25); edgeCache.set(k, e); } const l = new THREE.LineSegments(e, EDGE); l.raycast = () => {}; m.add(l); return l; }
    const GEO = new Map();
    function boxGeo(w, h, d) { const k = w + "|" + h + "|" + d; let g = GEO.get(k); if (!g) { g = new THREE.BoxGeometry(w, h, d); GEO.set(k, g); } return g; }
    const scene = new THREE.Scene();
    let DEF = scene; // 默认放进哪个组（盖小屋时临时换成院子）
    function mesh(geo, mat, x, y, z, p, line) { const m = new THREE.Mesh(geo, typeof mat === "number" ? toon(mat) : mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (p || DEF).add(m); if (line !== false) outline(m, typeof line === "number" ? line : 25); return m; }
    const B = (w, h, d, c, x, y, z, p, line) => mesh(boxGeo(w, h, d), c, x, y, z, p, line);
    const C = (rt, rb, h, seg, c, x, y, z, p, line) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, p, line);
    const S = (r, c, x, y, z, p, det, line) => mesh(new THREE.IcosahedronGeometry(r, det == null ? 1 : det), c, x, y, z, p, line == null ? false : line);
    const glow = (c, i) => toon(c, { emissive: c, emissiveIntensity: i == null ? 1 : i });
    const basic = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
    // 从下到上的方块：给出 x/z 范围和 y 范围
    // 平的地块不投影子（不然傍晚太阳低时会出现一道道条纹），悬崖另外打开
    const slab = (x0, x1, z0, z1, y0, y1, c, p, line) => { const m = B(x1 - x0, y1 - y0, z1 - z0, c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, p || scene, line); m.castShadow = false; return m; };

    /* ---------- Kenney 模型 → 卡通材质 + 轮廓线 ---------- */
    const PAL = {
      leafsGreen: 0x6fae5c, leafsDark: 0x4f8f4c, leafsFall: 0xe59a52, woodBark: 0x7a5236, woodBarkDark: 0x5e3f2a,
      woodBirch: 0xeadfca, woodDark: 0x6b4a33, wood: 0xb07a48, woodInner: 0xdcb47e, stone: 0xa7aab0, dirt: 0x8b6a4e,
      grass: 0x6fa75a, colorRed: 0xe0795a, colorYellow: 0xf2c14e, colorPurple: 0xb592e0, colorWhite: 0xf6f1e7,
      colorTan: 0xdcc6a2, corn: 0xf2c14e, plant: 0x5e9f55, metal: 0x5a5f6a, metalMedium: 0x7a808a, lamp: 0xffe2a8,
      carpetWhite: 0xf6f1e7, carpetDarker: 0x5d7fa8,
    };
    const texMat = new Map();
    const PROTO = {};
    function proto(name) {
      if (PROTO[name]) return PROTO[name];
      const raw = RAW[name]; if (!raw) return null;
      const g = raw.clone(true);
      g.traverse(o => {
        if (!o.isMesh) return;
        const m = o.material;
        if (m.map) {
          let t = texMat.get(m.map.uuid);
          if (!t) { m.map.encoding = THREE.LinearEncoding; t = toon(0xffffff, { map: m.map }); texMat.set(m.map.uuid, t); }
          o.material = t;
        } else {
          o.material = toon(PAL[m.name] != null ? PAL[m.name] : m.color.getHex());
        }
        o.castShadow = o.receiveShadow = true;
        outline(o, 38);
      });
      PROTO[name] = g;
      return g;
    }
    // 放一个模型：K("tree_oak", x, y, z, { s: 缩放, r: 朝向, p: 父节点 })
    function K(name, x, y, z, o) {
      o = o || {};
      const pr = proto(name); if (!pr) return null;
      const g = pr.clone(true);
      const s = o.s || 1; if (Array.isArray(s)) g.scale.set(s[0], s[1], s[2]); else g.scale.setScalar(s);
      g.position.set(x, y, z); g.rotation.y = o.r || 0;
      (o.p || DEF).add(g);
      return g;
    }

    /* ================= renderer / sky ================= */
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const skyC = document.createElement("canvas"); skyC.width = 2; skyC.height = 256;
    const skyG = skyC.getContext("2d"), skyTex = new THREE.CanvasTexture(skyC);
    scene.background = skyTex; scene.fog = new THREE.Fog(0x1a2238, 70, 150);
    let skyKey = "";
    function paintSky(top, bot) { const k = top + bot; if (k === skyKey) return; skyKey = k; const g = skyG.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, top); g.addColorStop(1, bot); skyG.fillStyle = g; skyG.fillRect(0, 0, 2, 256); skyTex.needsUpdate = true; scene.fog.color.set(bot); }
    const cam = new THREE.PerspectiveCamera(28, 1, .1, 400);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x4e5a46, .6); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, .9);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 90 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
    scene.add(sun); scene.add(sun.target);

    /* ================= 地块：25 × 25 格（-12..12） ================= */
    const N = 12, H1 = .9, H2 = 1.8;
    const cells = new Map();
    const ck = (x, z) => Math.round(x) + "," + Math.round(z);
    const cellAt = (x, z) => cells.get(ck(x, z));
    for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) {
      let zone = "meadow", h = 0, res = null;
      if (x <= -1 && z >= 6) zone = "orchard";
      if (x >= -10 && x <= -4 && z >= -3 && z <= 5) zone = "yard";
      if (x >= 4 && z <= -3) zone = "forest";
      if (x >= 3 && z >= 5 && z <= 8) zone = "beach";
      if (x <= -5 && z <= -5) { zone = "hill"; h = H1; }
      if (x <= -9 && z <= -9) h = H2;
      if ((x === 1 || x === 2) && z <= 8) res = "water";      // 小溪
      if (x >= 1 && z >= 9) { res = "water"; zone = "sea"; }  // 海
      cells.set(x + "," + z, { x, z, h, zone, res, occ: null });
    }
    const reserve = (x, z, r) => { const c = cells.get(x + "," + z); if (c && !c.res) c.res = r || "static"; };
    // 不能直接穿过的格子边（篱笆）
    const walls = new Set();
    const wallKey = (a, b) => a < b ? a + "|" + b : b + "|" + a;
    function wall(x1, z1, x2, z2) { walls.add(wallKey(x1 + "," + z1, x2 + "," + z2)); }

    /* ---------- 地形（几个大块拼起来，像桌上的微缩模型） ---------- */
    const terrain = [];
    const GRASS = 0x86b86a, DIRT = 0x8b6a4e, SAND = 0xe6d3a0, CLIFF = 0x9b8e7c, BED = 0xb9a77c;
    const E = N + .5; // 12.5
    // 左边陆地（小溪左侧，一直到前沿）
    terrain.push(slab(-E, .5, -E, E, -.3, 0, GRASS));
    slab(-E, .5, -E, E, -1.6, -.3, DIRT);
    // 右边陆地：草地 + 沙滩
    terrain.push(slab(2.5, E, -E, 4.5, -.3, 0, GRASS));
    terrain.push(slab(2.5, E, 4.5, 8.5, -.3, 0, SAND));
    slab(2.5, E, -E, 8.5, -1.6, -.3, DIRT);
    // 小溪：河床 + 半透明的水（侧面能看到水的截面）
    slab(.5, 2.5, -E, 8.5, -1.6, -.62, DIRT);
    terrain.push(slab(.5, 2.5, -E, 8.5, -.62, -.52, BED, null, false));
    // 海：沙底 + 水
    slab(.5, E, 8.5, E, -1.6, -1.12, DIRT);
    terrain.push(slab(.5, E, 8.5, E, -1.12, -1.02, BED, null, false));
    const waterMat = toon(0x4f8fc0, { transparent: true, opacity: .78, depthWrite: false });
    const streamW = slab(.5, 2.5, -E, 8.5, -.52, -.1, waterMat, null, 30); streamW.castShadow = false;
    const seaW = slab(.5, E, 8.5, E, -1.02, -.1, waterMat, null, 30); seaW.castShadow = false;
    terrain.push(streamW, seaW);
    // 底座
    B(25.4, .28, 25.4, 0x4f5566, 0, -1.74, 0);
    for (const [w, d, x, z] of [[25.4, .08, 0, 12.72], [25.4, .08, 0, -12.72], [.08, 25.4, 12.72, 0], [.08, 25.4, -12.72, 0]]) B(w, .04, d, 0x6d5240, x, -.62, z, scene, false);
    // 小山坡：两层台地，侧面是石头
    slab(-E, -4.5, -E, -4.5, 0.01, H1 - .12, CLIFF).castShadow = true;
    terrain.push(slab(-E, -4.5, -E, -4.5, H1 - .12, H1, GRASS));
    slab(-E, -8.5, -E, -8.5, H1 + .01, H2 - .12, CLIFF).castShadow = true;
    terrain.push(slab(-E, -8.5, -E, -8.5, H2 - .12, H2, GRASS));
    // 台阶：从地面到第一层、从第一层到第二层
    function stairs(cx, cz, base, top, dir) {
      const c = cells.get(cx + "," + cz); c.h = (base + top) / 2; c.res = "stair";
      for (let i = 0; i < 3; i++) {
        const hh = base + (top - base) * (i + 1) / 3;
        const x0 = cx + .5 - (i + 1) / 3, x1 = cx + .5 - i / 3; // dir = -x（往左上台阶）
        terrain.push(slab(dir < 0 ? x0 : cx - .5 + i / 3, dir < 0 ? x1 : cx - .5 + (i + 1) / 3, cz - .5, cz + .5, base - .02, hh, 0xb9b8b0));
      }
    }
    stairs(-4, -6, 0, H1, -1);
    stairs(-8, -10, H1, H2, -1);

    /* ---------- 小路 ---------- */
    const PATHS = [
      [[-7, 1], [-7, 2], [-7, 3], [-6, 3], [-5, 3], [-4, 3], [-3, 3]],                                // 小屋 → 路口
      [[-2, 3], [-1, 3], [0, 3], [3, 3], [4, 3], [5, 3], [6, 3]],                                      // 路口 → 木桥 → 东路口
      [[6, 2], [6, 1], [6, 0], [6, -1], [6, -2], [6, -3], [6, -4], [6, -5], [7, -5], [7, -6]],         // → 小树林
      [[6, 4], [6, 5], [6, 6], [6, 7], [6, 8]],                                                        // → 码头
      [[-3, 2], [-3, 1], [-3, 0], [-3, -1], [-3, -2], [-3, -3], [-3, -4], [-3, -5], [-3, -6],
        [-5, -6], [-6, -6], [-7, -6], [-7, -7], [-7, -8], [-7, -9], [-7, -10], [-9, -10]],             // → 山坡
      [[-3, 4], [-3, 5], [-3, 6], [-3, 7], [-3, 8], [-4, 8], [-5, 8], [-6, 8], [-7, 8], [-8, 8], [-9, 8]], // → 果园
    ];
    const stoneGeo = new THREE.CylinderGeometry(.3, .32, .05, 9);
    PATHS.forEach(p => p.forEach(([x, z]) => {
      const c = cells.get(x + "," + z); if (!c) return; if (!c.res) c.res = "path";
      const n = c.zone === "beach" ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const s = mesh(stoneGeo, c.zone === "beach" ? 0xd9c79a : 0xb9b8b0, x + (rnd() - .5) * .45, c.h + .025, z + (rnd() - .5) * .45, scene, 40);
        s.rotation.y = rnd() * 3; s.scale.setScalar(n === 1 ? 1 : .72 + rnd() * .2); s.castShadow = false;
      }
    }));

    /* ---------- 木桥 ---------- */
    for (const x of [1, 2]) { const c = cells.get(x + ",3"); c.res = "bridge"; c.h = .3; }
    const bridge = new THREE.Group(); bridge.position.set(1.5, 0, 3); scene.add(bridge);
    if (!K("bridge_wood", 0, -.05, 0, { s: [2.1, 1.3, 1.5], r: Math.PI / 2, p: bridge })) B(2.2, .12, 1.1, 0xb07a48, 0, .2, 0, bridge);
    bridge.userData.what = "bridge";

    /* ---------- 小码头 ---------- */
    const dock = new THREE.Group(); dock.position.set(6, 0, 0); scene.add(dock);
    for (let z = 8.6; z <= 11.6; z += .36) B(1.15, .07, .3, z % .72 < .36 ? 0xb07a48 : 0xa36d40, 0, .08, z, dock);
    for (const z of [8.8, 10.2, 11.6]) for (const x of [-.55, .55]) C(.07, .07, 1.4, 8, 0x6b4a33, x, -.55, z, dock);
    for (let z = 9; z <= 11; z++) { const c = cells.get("6," + z); c.res = "dock"; c.h = .12; }
    dock.userData.what = "dock";

    /* ================= 小屋和院子（原型里的小屋整体挪过来） ================= */
    const OX = -5, OZ = 1;
    const yard = new THREE.Group(); yard.position.set(OX, 0, OZ); scene.add(yard);
    DEF = yard;
    const yres = (x, z, r) => reserve(x + OX, z + OZ, r);
    const lightsNight = [], flick = [];
    const house = new THREE.Group(); house.position.set(-1.5, 0, -1.6); yard.add(house);
    for (let x = -3; x <= 0; x++) for (let z = -3; z <= -1; z++) yres(x, z);
    const WALL = 0xf1e8d8, FRAME = 0x6b4a33, ROOF = 0x41607f;
    B(3.1, .12, 2.7, 0x6e7381, 0, .06, 0, house);
    B(2.9, .04, 2.5, 0xc49a6c, 0, .14, 0, house, false);
    B(3, 1.6, .12, WALL, 0, .88, -1.24, house);
    B(.12, 1.6, 2.6, WALL, -1.44, .88, 0, house);
    B(.12, 1.6, 2.6, WALL, 1.44, .88, 0, house);
    B(.4, 1.6, .12, WALL, -1.3, .88, 1.24, house);
    B(.6, .38, .12, WALL, -.8, 1.49, 1.24, house);
    B(.3, 1.6, .12, WALL, -.35, .88, 1.24, house);
    B(1.5, .32, .12, WALL, .55, .24, 1.24, house);
    B(1.5, .28, .12, WALL, .55, 1.54, 1.24, house);
    B(.2, 1.6, .12, WALL, 1.4, .88, 1.24, house);
    B(3.04, .1, .16, 0xd9cdb6, 0, 1.7, 1.24, house);
    B(1.56, .05, .07, FRAME, .55, 1.4, 1.27, house); B(1.56, .05, .07, FRAME, .55, .4, 1.27, house);
    B(.05, 1.04, .07, FRAME, -.2, .9, 1.27, house); B(.05, 1.04, .07, FRAME, 1.3, .9, 1.27, house); B(.04, 1.0, .06, FRAME, .55, .9, 1.27, house);
    const glassMat = basic(0xcfe6ff, { transparent: true, opacity: .14, depthWrite: false });
    const glass = mesh(boxGeo(1.5, 1.0, .01), glassMat, .55, .9, 1.25, house, false); glass.castShadow = false;
    B(.6, 1.18, .06, 0x8b5a3c, -.8, .71, 1.25, house);
    const doorWin = B(.3, .26, .02, glow(0xffd391, 0), -.8, 1.0, 1.29, house);
    C(.03, .03, .06, 8, 0xd8b25a, -.6, .7, 1.3, house, false).rotation.x = Math.PI / 2;
    B(.04, .5, .6, FRAME, 1.51, 1.0, -.3, house);
    const sideWin = B(.02, .42, .52, glow(0xffd391, 0), 1.53, 1.0, -.3, house, false);
    const tri = new THREE.Shape(); tri.moveTo(-1.3, 0); tri.lineTo(1.3, 0); tri.lineTo(0, .92); tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: .1, bevelEnabled: false });
    for (const sx of [1.39, -1.49]) { const g = mesh(triGeo, WALL, sx, 1.68, 0, house); g.rotation.y = Math.PI / 2; }
    const ra = Math.atan2(.92, 1.5);
    B(3.5, .12, 1.8, ROOF, 0, 2.16, .76, house).rotation.x = ra;
    B(3.5, .12, 1.8, ROOF, 0, 2.16, -.76, house).rotation.x = -ra;
    B(3.56, .1, .16, 0x2f4660, 0, 2.62, 0, house);
    B(.3, .7, .3, 0xb5654a, .9, 2.55, -.55, house); B(.38, .08, .38, 0x5a5f6a, .9, 2.93, -.55, house);
    const awn = new THREE.Group(); awn.position.set(0, 1.63, 1.52); awn.rotation.x = .2; house.add(awn);
    for (let i = 0; i < 7; i++) B(.4, .05, .56, i % 2 ? 0xf6efe2 : 0xe0795a, -1.2 + i * .4, 0, 0, awn);
    B(.06, .06, .06, FRAME, -1.38, -.03, .27, awn, false); B(.06, .06, .06, FRAME, 1.38, -.03, .27, awn, false);
    B(.9, .08, .36, 0x9aa0aa, -.8, .04, 1.5, house);
    B(.6, .02, .36, 0x6b4f3a, -.8, .01, 1.95, house, false);
    // --- 屋里 ---
    B(1.3, .02, .9, 0xd98a6a, .25, .16, .25, house, false);
    B(1.1, .06, .5, 0x9c6b45, .65, .72, -.92, house);
    for (const [dx, dz] of [[-.5, -.2], [.5, -.2], [-.5, .2], [.5, .2]]) B(.05, .58, .05, 0x7a5236, .65 + dx, .43, -.92 + dz, house, false);
    B(.36, .02, .24, 0x555b66, .6, .76, -.86, house);
    const screen = B(.36, .24, .02, glow(0x9fd4ff, .35), .6, .9, -1.0, house); screen.rotation.x = -.18;
    C(.04, .035, .08, 10, 0xf3efe8, .98, .79, -.8, house, false);
    B(.4, .05, .4, 0x5d7fa8, .65, .46, -.42, house); B(.4, .45, .05, 0x5d7fa8, .65, .7, -.24, house);
    B(.04, .3, .04, 0x3d4552, .65, .28, -.42, house, false);
    B(.9, .25, 1.4, 0xa07650, -.92, .27, -.5, house);
    B(.86, .12, 1.36, 0xf6f1e7, -.92, .45, -.5, house, false);
    B(.88, .07, .9, 0x7fa7d6, -.92, .53, -.25, house);
    B(.6, .1, .3, 0xffffff, -.92, .56, -1.0, house, false);
    B(.3, 1.2, .8, 0x8b5e3c, 1.22, .74, .35, house);
    const bookC = [0xe0795a, 0x5d7fa8, 0xf2c14e, 0x6fae5c, 0xd8d2c4, 0x9a6fb0, 0x41607f];
    for (const y of [.5, .92]) for (let i = 0, z = .02; i < 6; i++) { const h = .18 + rnd() * .12, w = .07 + rnd() * .05; B(.16, h, w, bookC[(i + (y > .6 ? 3 : 0)) % 7], 1.1, y + h / 2 - .06, z + w / 2, house, false); z += w + .02; }
    B(.3, .03, .8, 0x7a5236, 1.22, .86, .35, house, false);
    K("pottedPlant", 1.05, .14, 1.0, { s: .9, p: house });
    B(.5, .36, .02, 0xf2c14e, -.3, 1.15, -1.17, house, false); B(.3, .12, .021, 0xe0795a, -.3, 1.2, -1.165, house, false);
    C(.005, .005, .3, 4, 0x222222, .2, 1.53, -.1, house, false);
    C(.06, .2, .16, 12, glow(0xffd28a, .5), .2, 1.33, -.1, house);
    const room = new THREE.PointLight(0xffbf73, 0, 4, 2); room.position.set(.2, 1.15, 0); house.add(room); lightsNight.push([room, 1.1]);
    const spill = new THREE.PointLight(0xffb866, 0, 2.4, 2); spill.position.set(.3, .9, 2.1); house.add(spill); lightsNight.push([spill, .45]);
    const bulbMat = basic(0xffd89a);
    for (let i = 0; i < 8; i++) { const t = i / 7; const b = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), bulbMat); b.position.set(-.1 + t * 1.3, 1.33 - Math.sin(t * Math.PI) * .07, 1.16); house.add(b); }
    // 雨桶、伞
    K("barrel", -3.25, 0, -3.25, { s: 1.5 });
    yres(-3, 0);
    C(.12, .12, .36, 12, 0x5b6b80, -3.05, .18, .05);
    for (const [c, a] of [[0x7fc4d8, .18], [0xe0795a, -.12]]) { const u = C(.015, .015, .72, 6, c, -3.05 + a * .4, .42, .05, yard, false); u.rotation.z = a; }
    // 邮箱、自行车
    yres(1, 0);
    B(.07, .7, .07, 0x7a5236, .9, .35, .1); B(.3, .22, .2, 0xd9503f, .9, .8, .1); B(.03, .16, .03, 0xf2c14e, 1.07, .9, .1, null, false);
    yres(1, -1);
    const bike = new THREE.Group(); bike.position.set(.85, 0, -1.25); bike.rotation.y = -.35; yard.add(bike);
    for (const x of [-.33, .33]) { const w = new THREE.Mesh(new THREE.TorusGeometry(.2, .022, 6, 20), toon(0x2b3140)); w.position.set(x, .21, 0); w.castShadow = true; bike.add(w); C(.02, .02, .04, 6, 0x9aa0aa, x, .21, 0, bike, false).rotation.x = Math.PI / 2; }
    const fr = (l, x, y, a) => { const b = B(l, .03, .03, 0x4f8fc0, x, y, 0, bike, false); b.rotation.z = a; };
    fr(.46, -.08, .36, -.5); fr(.42, .12, .43, 0); fr(.38, -.16, .27, .75); fr(.3, .25, .3, 1.1);
    B(.14, .04, .07, 0x2b3140, -.12, .56, 0, bike, false); B(.03, .03, .26, 0x2b3140, .3, .56, 0, bike, false);
    B(.18, .1, .16, 0x8b5e3c, .36, .5, 0, bike, false);
    // 院子里的路灯
    yres(-1, 3);
    C(.04, .05, 1.4, 8, 0x3d4552, -1, .7, 3);
    const lantern = B(.2, .26, .2, glow(0xffd391, 0), -1, 1.5, 3); B(.28, .05, .28, 0x2b3140, -1, 1.66, 3);
    const gl = new THREE.PointLight(0xffc46b, 0, 2.8, 2); gl.position.set(-1, 1.35, 3); yard.add(gl);
    lightsNight.push([gl, .7]); flick.push({ l: gl, m: lantern.material, base: .7 });
    // 公告板：今天完成的事
    yres(-4, 1);
    const board = new THREE.Group(); board.position.set(-4.2, 0, 1); board.rotation.y = .35; yard.add(board);
    B(.06, 1.15, .06, 0x7a5236, -.42, .57, 0, board); B(.06, 1.15, .06, 0x7a5236, .42, .57, 0, board);
    B(.95, .64, .06, 0x8b5e3c, 0, .95, 0, board); B(1.05, .06, .18, 0x41607f, 0, 1.3, 0, board);
    const bC = document.createElement("canvas"); bC.width = 320; bC.height = 200; const bTex = new THREE.CanvasTexture(bC);
    const paper = mesh(new THREE.PlaneGeometry(.84, .52), basic(0xffffff, { map: bTex }), 0, .95, .035, board, false); paper.castShadow = false;
    // 小菜地
    for (const [x, z, n] of [[-4, 3, "crop_pumpkin"], [-3, 3, "crop_carrot"], [-4, 4, "crops_wheatStageB"], [-3, 4, "crop_melon"]]) {
      yres(x, z); B(.9, .06, .9, 0x7a5a40, x, .03, z, yard, false);
      for (const [dx, dz] of [[-.2, -.2], [.2, .2]]) K(n, x + dx, .05, z + dz, { s: .8, r: rnd() * 6 });
    }
    // 院子的篱笆（世界坐标）
    DEF = scene;
    const fence = (x, z, r) => K("fence_simple", x, 0, z, { s: [1, 1.5, 1.5], r: r });
    for (let x = -10; x <= -4; x++) { fence(x, -3.5, 0); wall(x, -4, x, -3); }
    for (let x = -10; x <= -4; x++) { if (x === -7) continue; fence(x, 5.5, 0); wall(x, 5, x, 6); }
    for (let z = -3; z <= 5; z++) { fence(-10.5, z, Math.PI / 2); wall(-11, z, -10, z); if (z !== 3) { fence(-3.5, z, Math.PI / 2); wall(-4, z, -3, z); } }
    // 电线杆
    reserve(0, -4);
    C(.07, .09, 3.8, 8, 0x8a8f99, -.1, 1.9, -3.9); B(1.0, .07, .07, 0x6d727c, -.1, 3.45, -3.9);
    C(.15, .15, .42, 12, 0x9aa0aa, .07, 2.85, -3.72);
    for (const x of [-.5, -.1, .3]) C(.03, .04, .1, 6, 0xe8e2d4, x, 3.53, -3.9, scene, false);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x151a28 });
    function wire(a, b, sag) { const m = a.clone().add(b).multiplyScalar(.5); m.y -= sag; const c = new THREE.QuadraticBezierCurve3(a, m, b); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(30)), wireMat); l.raycast = () => {}; scene.add(l); }
    wire(new THREE.Vector3(-.5, 3.56, -3.9), new THREE.Vector3(OX - 1.45, 2.62, OZ - 1.6), .5);
    wire(new THREE.Vector3(.3, 3.56, -3.9), new THREE.Vector3(14, 3.2, -6), .6);
    wire(new THREE.Vector3(-.1, 3.56, -3.9), new THREE.Vector3(10, 3.3, -14), .7);

    /* ================= 小物件 ================= */
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    // 石灯（自己搭的）：晚上灯芯微微亮，不打点光源
    const stoneLamps = [];
    function stoneLamp(x, z, p) {
      const c = cells.get(x + "," + z); const y = c ? c.h : 0; reserve(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); (p || scene).add(g);
      B(.34, .08, .34, 0x9fa3a8, 0, .04, 0, g); C(.07, .09, .4, 6, 0xa7aab0, 0, .28, 0, g);
      B(.3, .06, .3, 0x9fa3a8, 0, .51, 0, g);
      const core = B(.18, .16, .18, glow(0xffd391, 0), 0, .62, 0, g, false); stoneLamps.push(core.material);
      for (const [dx, dz] of [[-.11, -.11], [.11, -.11], [-.11, .11], [.11, .11]]) B(.05, .18, .05, 0xa7aab0, dx, .62, dz, g, false);
      const roof = mesh(new THREE.ConeGeometry(.3, .2, 4), 0x8f9399, 0, .8, 0, g); roof.rotation.y = Math.PI / 4;
      S(.04, 0x8f9399, 0, .93, 0, g, 0);
      g.userData.what = "stoneLamp";
      return g;
    }
    // 路牌
    const signs = [];
    function signpost(x, z, r, to) {
      const c = cells.get(x + "," + z); reserve(x, z);
      const g = K("signpost", x, c.h, z, { s: 2.4, r: r }); if (g) { g.userData.what = "sign"; g.userData.to = to; signs.push(g); }
      return g;
    }
    // 花盆
    function pot(x, z) {
      const c = cells.get(x + "," + z); reserve(x, z);
      K("pot_large", x, c.h, z, { s: .9 }); K(pick(["flower_redA", "flower_yellowA", "flower_purpleA"]), x - .1, c.h + .15, z, { s: 1.3 });
      K(pick(["flower_redC", "flower_yellowC", "plant_bushSmall"]), x + .12, c.h + .15, z + .05, { s: 1.1 });
    }
    function bench(x, z, r) { const c = cells.get(x + "," + z); reserve(x, z); const g = K("bench", x, c.h, z, { s: 2, r: r || 0 }); if (g) g.userData.what = "bench"; return g; }
    function box(x, z, big) { const c = cells.get(x + "," + z); reserve(x, z); K(big ? "box-large" : "box", x, c.h, z, { s: 1.8, r: rnd() * .6 }); if (!big) K("box", x + .05, c.h + .45, z + .05, { s: 1.4, r: rnd() * 2 }); }

    // —— 路边 ——
    stoneLamp(-2, 4); stoneLamp(0, 2); stoneLamp(3, 4); stoneLamp(5, 2); stoneLamp(7, 7); stoneLamp(-4, -7); stoneLamp(-6, -7); stoneLamp(-2, 9);
    signpost(-2, 2, -Math.PI / 4, "hill"); signpost(7, 3, Math.PI / 2, "forest"); signpost(5, 4, 0, "beach"); signpost(-2, -6, 0, "hill");
    pot(-6, 1); pot(-8, 2); pot(-4, 2); pot(0, 4); pot(5, -3);
    bench(-9, 9, 0); bench(-2, 7, -Math.PI / 2); bench(9, 6, Math.PI);
    box(-9, -2, true); box(-10, 0, false); box(5, 8, true); box(7, 8, false);
    reserve(4, 8); K("barrel", 4, 0, 8, { s: 1.5 }); K("bucket", 4.35, 0, 7.7, { s: 1.6 });
    reserve(-9, 4); K("workbench", -9, 0, 4, { s: 1.8, r: Math.PI / 2 }); K("tool-shovel", -9.35, 0, 4.4, { s: 2 });
    reserve(-10, -2); K("log_stack", -10, 0, -2, { s: 1.2, r: Math.PI / 2 });

    // —— 小树林 ——
    const FOREST = ["tree_pineRoundA", "tree_pineRoundC", "tree_pineTallA_detailed", "tree_pineDefaultA", "tree_cone", "tree_default", "tree_detailed", "tree_oak", "tree_pineSmallA"];
    const clearing = (x, z) => x >= 6 && x <= 9 && z >= -8 && z <= -5;
    for (let x = 4; x <= 12; x++) for (let z = -12; z <= -3; z++) {
      const c = cells.get(x + "," + z); if (c.res || clearing(x, z)) continue;
      if (rnd() < .62) { reserve(x, z); K(pick(FOREST), x + (rnd() - .5) * .3, 0, z + (rnd() - .5) * .3, { s: 1.15 + rnd() * .45, r: rnd() * 6 }); }
      else if (rnd() < .45) { reserve(x, z); K(pick(["mushroom_redGroup", "mushroom_tanGroup", "stump_old", "stump_round", "plant_bushDetailed", "rock_smallA", "log"]), x, 0, z, { s: 1.4, r: rnd() * 6 }); }
    }
    // 林间空地：篝火、木头凳、帐篷
    reserve(7, -7); const fire = new THREE.Group(); fire.position.set(7.5, 0, -6.5); scene.add(fire);
    K("campfire_stones", 0, 0, 0, { s: 1.5, p: fire }); K("campfire_logs", 0, .03, 0, { s: 1.6, p: fire });
    const fireCore = S(.12, glow(0xffa04a, 0), 0, .16, 0, fire, 0); fireCore.scale.y = 1.5; fireCore.castShadow = false;
    const fireLight = new THREE.PointLight(0xff9a4a, 0, 3, 2); fireLight.position.y = .5; fire.add(fireLight);
    lightsNight.push([fireLight, .55]); flick.push({ l: fireLight, m: fireCore.material, base: .55, fire: true });
    reserve(8, -6); K("log", 8.4, 0, -6.4, { s: 1.5, r: .3 });
    reserve(6, -7); K("log", 6.6, 0, -6.7, { s: 1.5, r: 1.8 });
    reserve(9, -8); K("tent_detailedOpen", 9, 0, -8, { s: 2.2, r: -Math.PI / 4 });
    reserve(8, -8); K("bedroll-packed", 8, 0, -7.7, { s: 2 });

    // —— 小山坡和观景台 ——
    for (let x = -12; x <= -10; x++) for (let z = -12; z <= -10; z++) { const c = cells.get(x + "," + z); c.res = "deck"; c.h = H2 + .12; }
    const deck = new THREE.Group(); deck.position.set(-11, H2, -11); scene.add(deck);
    for (let i = 0; i < 8; i++) B(3.1, .1, .36, i % 2 ? 0xa36d40 : 0xb07a48, 0, .06, -1.35 + i * .38, deck);
    const rail = (x, z, len, rot) => { const r = new THREE.Group(); r.position.set(x, 0, z); r.rotation.y = rot; deck.add(r); for (let i = 0; i <= len; i++) B(.08, .6, .08, 0x8b5e3c, -len / 2 + i, .4, 0, r); B(len + .1, .06, .08, 0x9c6b45, 0, .68, 0, r); B(len + .1, .05, .06, 0x9c6b45, 0, .4, 0, r); };
    rail(0, -1.5, 3, 0); rail(-1.5, 0, 3, Math.PI / 2);
    // 望远镜
    const scope = new THREE.Group(); scope.position.set(.9, .11, .9); deck.add(scope);
    for (const a of [0, 2.1, 4.2]) { const l = C(.02, .02, .7, 6, 0x3d4552, Math.sin(a) * .14, .32, Math.cos(a) * .14, scope, false); l.rotation.set(Math.cos(a) * .25, 0, -Math.sin(a) * .25); }
    const tube = C(.07, .09, .6, 10, 0xd8b25a, 0, .72, 0, scope); tube.rotation.set(Math.PI / 2.6, Math.PI / 4, 0);
    bench(-12, -10, Math.PI / 2);
    deck.userData.what = "lookout"; scope.userData.what = "lookout";
    for (const [x, z, n, s] of [[-6, -12, "rock_tallA", 1.3], [-12, -6, "rock_largeA", 1.2], [-8, -6, "rock_smallC", 1.6], [-5, -9, "plant_bushDetailed", 1.5],
      [-12, -8, "tree_pineRoundC", 1.4], [-9, -12, "tree_pineTallA_detailed", 1.5], [-6, -9, "tree_oak", 1.3], [-11, -7, "plant_bush", 1.6], [-5, -11, "tree_plateau", 1.3]]) {
      const c = cells.get(x + "," + z); reserve(x, z); K(n, x, c.h, z, { s, r: rnd() * 6 });
    }
    // 山坡边缘的石头，让台地不那么方
    for (let i = 0; i < 14; i++) { const along = -12 + rnd() * 7.5; const onX = i % 2; K(pick(["rock_smallA", "rock_smallC", "rock_largeC"]), onX ? along : -4.45, 0, onX ? -4.45 : along, { s: .8 + rnd() * .6, r: rnd() * 6 }); }

    // —— 小溪两岸 ——
    for (let z = -12; z <= 8; z += 1.3) {
      if (Math.abs(z - 3) < 1.2) continue;
      if (rnd() < .55) K(pick(["rock_smallA", "rock_smallC", "rock_smallFlatA"]), .55 + (rnd() < .5 ? 0 : 1.9), -.12, z, { s: 1 + rnd() * .6, r: rnd() * 6 });
      if (rnd() < .35) K(pick(["lily_large", "lily_small"]), 1 + rnd(), -.11, z + rnd(), { s: 1.6, r: rnd() * 6 });
    }
    for (const [x, z] of [[0, -9], [3, -1], [0, 6], [3, 6]]) { const g = new THREE.Group(); g.position.set(x + (x ? .3 : -.3), 0, z); scene.add(g); for (let i = 0; i < 6; i++) { const r = B(.03, .4 + rnd() * .35, .03, 0x6f9a4f, (rnd() - .5) * .5, .25, (rnd() - .5) * .5, g, false); r.rotation.z = (rnd() - .5) * .35; } }

    // —— 沙滩和码头 ——
    for (const [x, z, n] of [[10, 5, "tree_palmTall"], [12, 7, "tree_palmBend"], [3, 7, "tree_palmShort"], [12, 5, "tree_palmShort"]]) { reserve(x, z); K(n, x, 0, z, { s: 1.6, r: rnd() * 6 }); }
    for (const [x, z] of [[8, 8], [11, 8], [4, 5]]) K(pick(["rock_smallA", "rock_smallFlatA"]), x + .3, 0, z + .3, { s: 1.2, r: rnd() * 6 });
    const canoe = K("canoe", 7.6, -.2, 10.4, { s: 1.6, r: .15 }); K("canoe_paddle", 7.5, -.05, 10.3, { s: 1.6, r: .4 });
    K("fish", 6.3, .12, 11.3, { s: 1.6, r: 1.2 }); K("bucket", 5.75, .12, 11.0, { s: 1.6 });
    // 海里的小石头
    for (const [x, z] of [[11, 11], [3, 11.5], [9.5, 12]]) K("rock_largeC", x, -.75, z, { s: 1.3, r: rnd() * 6 });

    // —— 果园、草地上的花草（不占格子） ——
    const tuftG = new THREE.ConeGeometry(.04, .16, 4);
    const tuftMats = [toon(0x6fa75a), toon(0x7fb869)];
    for (let i = 0; i < 520; i++) {
      const x = (rnd() - .5) * 24.6, z = (rnd() - .5) * 24.6; const c = cellAt(x, z);
      if (!c || c.res === "water" || c.res === "path" || c.res === "deck" || c.zone === "beach") continue;
      const t = new THREE.Mesh(tuftG, tuftMats[i % 2]); t.position.set(x, c.h + .08, z); t.raycast = () => {}; scene.add(t);
    }
    for (let i = 0; i < 34; i++) {
      const x = Math.round((rnd() - .5) * 23) + .5, z = Math.round((rnd() - .5) * 23) + .5; const c = cellAt(x - .5, z - .5);
      if (!c || c.res === "water" || c.zone === "beach" || c.zone === "forest") continue;
      K(pick(["flower_redA", "flower_yellowA", "flower_purpleA", "flower_yellowC", "grass", "grass_leafs"]), x, c.h, z, { s: 1.2, r: rnd() * 6 });
    }
    // 果园边角的灌木
    for (const [x, z] of [[-12, 12], [-12, 6], [-1, 12], [12, -2], [12, 3]]) { reserve(x, z); K(pick(["plant_bushDetailed", "plant_bushLarge"]), x, 0, z, { s: 1.6, r: rnd() * 6 }); }

    // 水洼（下雨时出现）
    const puddles = [];
    for (const [x, z, sx, sz] of [[-7, 2, .75, .4], [-3, 5, .5, .3], [-9, 6, .6, .35], [5, 1, .5, .3], [-3, -2, .6, .3]]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), basic(0x9fbbe0, { transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); m.position.set(x, .008, z); m.raycast = () => {}; scene.add(m); puddles.push(m);
    }

    /* ================= 可以放的东西 ================= */
    const BUILD = {
      flowers(g) { [["flower_redA", -.2, -.12], ["flower_yellowA", .14, .14], ["flower_purpleA", -.02, .24], ["flower_yellowC", .22, -.16], ["flower_redC", .02, -.02]].forEach(([n, x, z]) => K(n, x, 0, z, { s: 1.5, p: g, r: rnd() * 6 })); },
      bush(g) { K("plant_bushDetailed", 0, 0, 0, { s: 1.7, p: g }); },
      pot(g) { K("pot_large", 0, 0, 0, { s: .9, p: g }); K("flower_redA", -.1, .15, 0, { s: 1.3, p: g }); K("flower_yellowC", .12, .15, .05, { s: 1.1, p: g }); },
      bench(g) { K("bench", 0, 0, 0, { s: 2, p: g }); },
      lantern(g) { const s = stoneLamp(0, 0, g); s.position.set(0, 0, 0); },
      lamp(g) { C(.035, .045, 1.2, 8, 0x3d4552, 0, .6, 0, g); const b = B(.18, .22, .18, glow(0xffd391, 0), 0, 1.3, 0, g); B(.24, .05, .24, 0x2b3140, 0, 1.44, 0, g); const l = new THREE.PointLight(0xffc46b, 0, 2.6, 2); l.position.y = 1.2; g.add(l); lightsNight.push([l, .6]); flick.push({ l, m: b.material, base: .6 }); },
    };
    const TREES = ["tree_oak", "tree_default", "tree_fat", "tree_detailed", "tree_plateau", "tree_small", "tree_simple"];
    const FALL = { tree_oak: "tree_oak_fall", tree_default: "tree_default_fall", tree_fat: "tree_fat_fall", tree_detailed: "tree_detailed_fall", tree_small: "tree_small_fall" };
    function buildTree(g, seed, dateKey) {
      const h = hash(seed); let n = TREES[h % TREES.length];
      const mon = +String(dateKey).slice(5, 7);
      if (mon >= 9 && mon <= 11 && FALL[n] && (h >> 8) % 3 === 0) n = FALL[n]; // 秋天种下的，有的会是红叶
      if (!K(n, 0, 0, 0, { s: 1.2 + ((h >> 4) % 5) * .06, p: g })) { C(.06, .09, .6, 8, 0x7a5236, 0, .3, 0, g); S(.42, 0x6fae5c, 0, .85, 0, g); }
    }

    /* ================= state ================= */
    const pickables = terrain.slice();
    pickables.push(house, board, bridge, dock, deck, ...signs);
    terrain.forEach(m => m.userData.what = "ground");
    house.userData.what = "house"; board.userData.what = "board";
    const grows = [], bounces = [];
    const treeOf = new Map(); // taskId -> group
    let me = null; // 小人（下面创建）
    function placeAt(o, key, anim) {
      const c = cells.get(key); if (!c || c.res || c.occ) return null;
      const g = new THREE.Group();
      if (o.type === "tree") buildTree(g, o.taskId, o.date); else BUILD[o.type](g);
      g.position.set(c.x, c.h, c.z); g.rotation.y = o.rot || 0; g.userData.obj = o;
      scene.add(g); c.occ = o; o.g = g; o.cell = c; pickables.push(g);
      if (anim) { g.scale.setScalar(.01); grows.push({ g, t0: performance.now() }); }
      return g;
    }
    function unplace(o) {
      if (!o.g) return;
      scene.remove(o.g); const i = pickables.indexOf(o.g); if (i >= 0) pickables.splice(i, 1);
      if (o.cell) o.cell.occ = null; o.g = null; o.cell = null;
    }
    function canPlace(c) { return !!c && !c.res && !c.occ && (!me || ck(me.x, me.z) !== c.x + "," + c.z); }
    // 找空地：先在 zones 里找，找不到再到别处
    function freeCell(seed, zones) {
      const all = [...cells.values()].filter(canPlace); if (!all.length) return null;
      for (const z of (zones || [])) { const l = all.filter(c => c.zone === z); if (l.length) return l[hash(seed) % l.length]; }
      const l = all.filter(c => c.zone !== "beach" && c.zone !== "forest");
      const pool = l.length ? l : all;
      return pool[hash(seed) % pool.length];
    }
    const shopObjs = [];
    isl.objs.forEach(o => {
      if (!BUILD[o.type]) return;
      const v = { type: o.type, rot: o.rot, date: o.date, saved: o };
      let key = o.x + "," + o.z;
      if (!canPlace(cells.get(key))) { const f = freeCell(o.type + o.date + o.x, ["yard", "meadow"]); if (!f) return; key = f.x + "," + f.z; o.x = f.x; o.z = f.z; }
      if (placeAt(v, key, false)) shopObjs.push(v);
    });

    // 每件完成的事一棵树；位置记在 isl.trees 里，撤回再完成还会长在原地
    function plantTree(task, anim) {
      if (treeOf.has(task.id)) return treeOf.get(task.id);
      let key = isl.trees[task.id];
      if (!key || !canPlace(cells.get(key))) {
        const c = freeCell(task.id, ["orchard", "meadow", "yard", "hill"]); if (!c) return null;
        key = c.x + "," + c.z; isl.trees[task.id] = key;
      }
      const o = { type: "tree", taskId: task.id, label: task.text, date: Store.dayKey(new Date(task.doneAt)), rot: (hash(task.id) % 628) / 100 };
      const g = placeAt(o, key, anim);
      if (g) treeOf.set(task.id, g);
      return g;
    }
    function removeTree(id) {
      const g = treeOf.get(id); if (!g) return;
      unplace(g.userData.obj); treeOf.delete(id);
    }
    Store.allWins().forEach(t => plantTree(t, false));
    Store.save();

    /* ================= little people ================= */
    function faceTex() {
      const c = document.createElement("canvas"); c.width = 64; c.height = 48; const g = c.getContext("2d");
      g.fillStyle = "#2a1d18"; g.beginPath(); g.ellipse(20, 20, 3.2, 4.5, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(44, 20, 3.2, 4.5, 0, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.fillRect(21, 17, 1.6, 1.6); g.fillRect(45, 17, 1.6, 1.6);
      g.fillStyle = "rgba(255,140,150,.65)"; g.beginPath(); g.ellipse(13, 30, 5, 2.6, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(51, 30, 5, 2.6, 0, 0, 7); g.fill();
      g.strokeStyle = "#8a4b42"; g.lineWidth = 1.6; g.beginPath(); g.arc(32, 29, 3, .2, Math.PI - .2); g.stroke();
      return new THREE.CanvasTexture(c);
    }
    function makePerson() {
      const g = new THREE.Group(); scene.add(g);
      const legL = B(.08, .22, .09, 0x3d4560, -.06, .11, 0, g), legR = B(.08, .22, .09, 0x3d4560, .06, .11, 0, g);
      C(.13, .17, .34, 10, 0x7fbf9a, 0, .38, 0, g);
      B(.06, .06, .08, 0xffe1cc, -.17, .34, 0, g, false); B(.06, .06, .08, 0xffe1cc, .17, .34, 0, g, false);
      S(.19, 0xffe1cc, 0, .72, 0, g, 2);
      const hair = mesh(new THREE.SphereGeometry(.205, 20, 14, 0, Math.PI * 2, 0, Math.PI * .55), 0x4a3326, 0, .74, -.015, g, false); hair.rotation.x = -.25;
      B(.3, .07, .06, 0x4a3326, 0, .86, .15, g, false);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(.26, .2), basic(0xffffff, { map: faceTex(), transparent: true })); face.position.set(0, .68, .186); g.add(face);
      const umb = new THREE.Group(); umb.position.set(.12, 0, 0); g.add(umb);
      C(.012, .012, .9, 6, 0xdfe6ee, 0, .75, 0, umb, false);
      const can = mesh(new THREE.ConeGeometry(.5, .2, 12, 1, true), basic(0xd7ecff, { transparent: true, opacity: .42, side: THREE.DoubleSide, depthWrite: false }), 0, 1.18, 0, umb, false); can.castShadow = false;
      const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(.5, .2, 12, 1, true), 1), EDGE); rim.position.y = 1.18; umb.add(rim);
      g.userData.who = "me"; pickables.push(g);
      return { g, legL, legR, umb, x: -7, z: 2, y: 0, path: [] };
    }
    me = makePerson();
    function makeCat() {
      const g = new THREE.Group(); scene.add(g); const O = 0xf0a050;
      B(.28, .14, .13, O, 0, .17, 0, g); B(.15, .13, .13, O, 0, .27, .16, g);
      mesh(new THREE.ConeGeometry(.03, .06, 4), O, -.04, .36, .16, g, false); mesh(new THREE.ConeGeometry(.03, .06, 4), O, .04, .36, .16, g, false);
      for (const [x, z] of [[-.08, -.04], [.08, -.04], [-.08, .05], [.08, .05]]) B(.04, .1, .04, O, x, .05, z, g, false);
      const tail = B(.03, .2, .03, O, 0, .27, -.12, g, false); tail.rotation.x = -.5;
      g.rotation.y = Math.PI / 2; g.userData.who = "cat"; pickables.push(g);
      return { g, x: -6, z: 4, y: 0, path: [], next: 0 };
    }
    const cat = makeCat();

    function walkable(c) { return c && c.res !== "static" && c.res !== "water" && !(c.occ && c.occ.type !== "flowers"); }
    function canStep(a, b) { return Math.abs(a.h - b.h) <= .5 && !walls.has(wallKey(a.x + "," + a.z, b.x + "," + b.z)); }
    function findPath(fx, fz, tx, tz) {
      const start = ck(fx, fz), goal = tx + "," + tz; if (start === goal) return [];
      const prev = new Map([[start, null]]), q = [start];
      while (q.length) {
        const k = q.shift(); if (k === goal) break; const [x, z] = k.split(",").map(Number); const from = cells.get(k);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = (x + dx) + "," + (z + dz); if (prev.has(nk)) continue; const c = cells.get(nk); if (!c) continue;
          if (!walkable(c) && nk !== goal) continue; if (from && !canStep(from, c)) continue;
          prev.set(nk, k); q.push(nk);
        }
      }
      if (!prev.has(goal)) return null;
      const out = []; for (let k = goal; k && k !== start; k = prev.get(k)) out.unshift(k.split(",").map(Number)); return out;
    }
    function goTo(x, z, near) {
      let c = cells.get(x + "," + z);
      if (near || !walkable(c)) { let best = null, bd = 99; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const n = cells.get((x + dx) + "," + (z + dz)); if (walkable(n) && findPath(me.x, me.z, n.x, n.z)) { const d = Math.hypot(n.x - me.x, n.z - me.z); if (d < bd) { bd = d; best = n; } } } c = best; }
      if (!c) return; const p = findPath(me.x, me.z, c.x, c.z); if (p) me.path = p;
    }

    /* ================= camera + input ================= */
    let W = 1, H = 1, theta = Math.PI / 4, phi = .66, dist = 62;
    const DMIN = 10, DMAX = 100;
    const tgt = new THREE.Vector3(0, -.3, 0);
    const panel = $("i3-panel");
    function updateCam() {
      const a = W / H, d = dist * Math.max(1, 1.05 / a);
      cam.aspect = a;
      cam.position.set(tgt.x + Math.sin(theta) * Math.cos(phi) * d, tgt.y + Math.sin(phi) * d, tgt.z + Math.cos(theta) * Math.cos(phi) * d);
      cam.lookAt(tgt);
      const bare = view.classList.contains("is-bare");
      if (W > 820 && !bare) cam.setViewOffset(W, H, (panel.offsetWidth + 14) / 2 - 135, -20, W, H); else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }
    let composer = null, bloom = null;
    try { if (THREE.EffectComposer && THREE.UnrealBloomPass) { composer = new THREE.EffectComposer(renderer); composer.addPass(new THREE.RenderPass(scene, cam)); bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), .2, .3, .95); composer.addPass(bloom); } } catch (e) { composer = null; }
    function resize() {
      W = view.clientWidth || innerWidth; H = view.clientHeight || innerHeight;
      const pr = Math.min(devicePixelRatio || 1, 2); renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
      if (composer) { composer.setPixelRatio(pr); composer.setSize(W, H); }
      updateCam();
    }
    addEventListener("resize", resize);

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function aim(e) { const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, cam); }
    // 点到哪一格：射线打在地形上的那一点
    function groundCell() {
      const hs = ray.intersectObjects(terrain, false); if (!hs.length) return null;
      const p = hs[0].point; const n = hs[0].face && hs[0].face.normal;
      if (n && n.y < .5) return null; // 打在侧面（悬崖、水的截面）上不算
      return cellAt(p.x, p.z) || null;
    }
    function owner(o) { while (o) { if (o.userData.obj || o.userData.who || o.userData.what) return o; o = o.parent; } return null; }

    const ptrs = new Map(); let downAt = null, dragging = false, pinch0 = 0, dist0 = 30;
    cv.addEventListener("pointerdown", e => {
      cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY }; dragging = false; }
      if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); dist0 = dist; downAt = null; }
    });
    cv.addEventListener("pointermove", e => {
      if (!ptrs.has(e.pointerId)) { if (placing) hover(e); return; }
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; dist = clamp(dist0 * pinch0 / Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), DMIN, DMAX); updateCam(); return; }
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) { dragging = true; cv.classList.add("is-drag"); }
      if (dragging) { theta -= (e.clientX - prev.x) * .007; phi = clamp(phi + (e.clientY - prev.y) * .005, .22, 1.25); updateCam(); }
      if (placing) hover(e);
    });
    cv.addEventListener("pointerup", e => { const wasClick = downAt && !dragging && ptrs.size === 1; ptrs.delete(e.pointerId); cv.classList.remove("is-drag"); if (wasClick) click(e); if (!ptrs.size) { downAt = null; dragging = false; } });
    cv.addEventListener("pointercancel", e => ptrs.delete(e.pointerId));
    cv.addEventListener("wheel", e => { e.preventDefault(); dist = clamp(dist * (1 + e.deltaY * .0012), DMIN, DMAX); updateCam(); }, { passive: false });
    $("i3-rotl").onclick = () => { theta += Math.PI / 4; updateCam(); };
    $("i3-rotr").onclick = () => { theta -= Math.PI / 4; updateCam(); };
    $("i3-zin").onclick = () => { dist = clamp(dist / 1.25, DMIN, DMAX); updateCam(); };
    $("i3-zout").onclick = () => { dist = clamp(dist * 1.25, DMIN, DMAX); updateCam(); };
    function setRain(v) { isl.rain = v; $("i3-rain").textContent = T(v ? "i3.rainOff" : "i3.rainOn"); $("i3-rain").setAttribute("aria-pressed", v); Store.save(); }
    $("i3-rain").onclick = () => setRain(!isl.rain); setRain(isl.rain);
    function bare(v) { view.classList.toggle("is-bare", v); updateCam(); }
    $("i3-hide").onclick = () => bare(true); $("i3-show").onclick = () => bare(false);
    addEventListener("keydown", e => {
      if (view.hidden || document.body.classList.contains("has-modal")) return;
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) return;
      if (e.key === "Escape") stopPlacing();
      if (e.key === "h" || e.key === "H") bare(!view.classList.contains("is-bare"));
      if (e.key === "ArrowLeft") { theta += .2; updateCam(); }
      if (e.key === "ArrowRight") { theta -= .2; updateCam(); }
    });

    /* placing */
    let placing = null;
    const hl = new THREE.Mesh(new THREE.BoxGeometry(1, .04, 1), basic(0x7cff7c, { transparent: true, opacity: .45, depthWrite: false })); hl.visible = false; hl.raycast = () => {}; scene.add(hl);
    function hover(e) { aim(e); const c = groundCell(); if (!c) { hl.visible = false; return; } hl.visible = true; hl.position.set(c.x, c.h + .03, c.z); hl.material.color.setHex(canPlace(c) ? 0x7cff7c : 0xff6b6b); }
    function startPlacing(item) {
      placing = item; cv.classList.add("is-place");
      $("i3-ptext").textContent = T("i3.placeHint", { name: itemName(item.id) }); $("i3-placing").hidden = false;
    }
    function stopPlacing() { placing = null; hl.visible = false; cv.classList.remove("is-place"); $("i3-placing").hidden = true; }
    $("i3-pcancel").onclick = stopPlacing;

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const top = (o, up) => o.getWorldPosition(new THREE.Vector3()).add(V(0, up, 0));
    function click(e) {
      aim(e);
      if (placing) {
        const c = groundCell(); if (!c) return;
        if (!canPlace(c)) { say(V(c.x, c.h + .4, c.z), T("i3.cantPlace")); return; }
        if (Store.coins() < placing.price) { stopPlacing(); return; }
        const saved = { type: placing.id, x: c.x, z: c.z, rot: Math.round(theta / (Math.PI / 2)) * Math.PI / 2, date: Store.dayKey() };
        const v = { type: saved.type, rot: saved.rot, date: saved.date, saved };
        if (placeAt(v, c.x + "," + c.z, true)) {
          isl.objs.push(saved); isl.spent += placing.price; shopObjs.push(v); Store.save(); refresh();
          if (window.Sound) Sound.play("grow");
          say(V(c.x, c.h + 1.2, c.z), T("i3.placed"));
        }
        stopPlacing(); return;
      }
      const hs = ray.intersectObjects(pickables, true); if (!hs.length) return;
      const own = owner(hs[0].object); if (!own) return;
      const lines = T("i3.lines"), what = own.userData.what;
      if (own.userData.who === "me") { bounce(me.g); say(top(me.g, 1.1), lines[Math.floor(Math.random() * lines.length)]); return; }
      if (own.userData.who === "cat") { bounce(cat.g); say(top(cat.g, .5), T("i3.meow")); return; }
      if (what === "house") { bounce(house); say(top(house, 3.1), T("i3.house")); return; }
      if (what === "board") { const d = Store.winsOf(); say(top(board, 1.6), d.length ? T("i3.boardDone", { list: d.map(t => t.text).join(T("i3.sep")) }) : T("i3.boardNone")); return; }
      if (what === "sign") { bounce(own); say(top(own, 1.4), T("i3.signTo", { name: T("i3.area." + own.userData.to) })); return; }
      if (what === "bridge" || what === "dock" || what === "lookout") { say(top(own, 1.2), T("i3.area." + (what === "lookout" ? "hill" : what === "dock" ? "beach" : "stream"))); }
      if (own.userData.obj) {
        const o = own.userData.obj; bounce(own); const t = top(own, o.type === "tree" ? 1.9 : o.type === "lamp" ? 1.7 : .9);
        if (o.type === "tree") say(t, T("i3.treeLabel", { text: o.label, date: fmtDate(o.date) }));
        else if (o.type === "bench") { goTo(o.cell.x, o.cell.z, true); say(t, T("i3.sit")); }
        else say(t, itemName(o.type));
        return;
      }
      const c = groundCell(); if (c) goTo(c.x, c.z);
    }
    const bubble = $("i3-bubble"); let bubbleAt = null, bubbleT = 0;
    function say(v, text) { bubbleAt = v; bubble.textContent = text; bubble.classList.add("is-on"); bubbleT = performance.now() + 2800; }
    function bounce(o) { bounces.push({ o, t0: performance.now(), s: o.scale.clone() }); }

    /* ================= panel ================= */
    let page = "tasks";
    function showPage(p) {
      page = p;
      panel.querySelectorAll(".i3-tab").forEach(b => { const on = b.dataset.page === p; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on); });
      panel.querySelectorAll(".i3-page").forEach(el => { el.hidden = el.dataset.page !== p; });
      refresh();
    }
    panel.querySelector(".i3-tabs").addEventListener("click", e => { const b = e.target.closest(".i3-tab"); if (b) showPage(b.dataset.page); });
    document.addEventListener("wins:ask", () => showPage("helper"));

    function drawBoard() {
      const g = bC.getContext("2d"), d = Store.winsOf();
      g.fillStyle = "#fbf5e6"; g.fillRect(0, 0, 320, 200);
      g.fillStyle = "#e0795a"; g.fillRect(0, 0, 320, 8);
      g.fillStyle = "#2f2a2a"; g.font = '30px "ZCOOL KuaiLe", sans-serif'; g.fillText(T("i3.boardTitle", { n: d.length }), 18, 48);
      g.font = '20px "ZCOOL KuaiLe", sans-serif'; g.fillStyle = "#5a4e46";
      const max = I18n.isEn() ? 24 : 13;
      (d.length ? d.slice(-4) : [{ text: T("i3.boardEmpty") }]).forEach((t, i) => { const s = t.text.length > max ? t.text.slice(0, max) + "…" : t.text; g.fillText((d.length ? "✓ " : "") + s, 18, 88 + i * 28); });
      g.fillStyle = "#f2c14e"; g.beginPath(); g.arc(296, 24, 7, 0, 7); g.fill();
      bTex.needsUpdate = true;
    }
    function refresh() {
      const coins = Store.coins();
      $("i3-coins").textContent = coins;
      $("i3-wins").textContent = Store.winsOf().length;
      drawBoard();
      if (page === "shop") {
        $("i3-shop").innerHTML = SHOP.map(s => '<div class="i3-item"><span>' + esc(itemName(s.id)) + "<small>" + esc(T("i3.item." + s.id + "Note")) + '</small></span><b>' + s.price + '</b><button class="i3-btn" type="button" data-buy="' + s.id + '"' + (coins < s.price ? " disabled" : "") + ">" + esc(T("i3.buy")) + "</button></div>").join("") +
          '<p class="i3-note">' + esc(T("i3.shopNote")) + "</p>";
        $("i3-shop").querySelectorAll("[data-buy]").forEach(x => x.onclick = () => startPlacing(SHOP.find(s => s.id === x.dataset.buy)));
      } else if (page === "month") {
        const by = {};
        Store.allWins().forEach(t => { const m = Store.dayKey(new Date(t.doneAt)).slice(0, 7); (by[m] = by[m] || []).push(t); });
        const ms = Object.keys(by).sort().reverse();
        const mons = T("months") || [];
        $("i3-month").innerHTML = ms.length ? ms.map(m => '<div class="i3-month"><b>' + esc(T("i3.monthTitle", { y: m.slice(0, 4), m: +m.slice(5), mon: mons[+m.slice(5) - 1] || "" })) + "</b><p>" + esc(T("i3.monthTrees", { n: by[m].length })) + "</p><p>" + by[m].slice(-4).map(t => esc(t.text)).join(" · ") + "</p></div>").join("")
          : '<p class="i3-note">' + esc(T("i3.monthEmpty")) + "</p>";
      }
    }

    // 任务有变化：完成 → 种树；撤回 / 删除 → 收回
    document.addEventListener("wins:change", e => {
      const d = e.detail || {};
      if (d.type === "complete") {
        const t = Store.winsOf().find(w => w.id === d.id); if (!t) return;
        const g = plantTree(t, true); Store.save();
        if (g) { const c = g.userData.obj.cell; goTo(c.x, c.z, true); setTimeout(() => say(V(c.x, c.h + 2, c.z), T("i3.planted", { text: t.text })), 350); }
        else say(top(me.g, 1.1), T("i3.full"));
      } else if (d.type === "undo" || d.type === "remove") removeTree(d.id);
      refresh();
    });

    showPage("tasks");
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawBoard);

    /* ================= weather ================= */
    let rainK = isl.rain ? 1 : 0;
    const RN = 2600, rainArr = new Float32Array(RN * 6), drops = [];
    for (let i = 0; i < RN; i++) drops.push([(rnd() - .5) * 30, rnd() * 16 - 2, (rnd() - .5) * 30, 9 + rnd() * 4]);
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(rainArr, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false });
    const rainMesh = new THREE.LineSegments(rainGeo, rainMat); rainMesh.frustumCulled = false; rainMesh.raycast = () => {}; scene.add(rainMesh);
    const ripGeo = new THREE.RingGeometry(.06, .085, 20), ripples = [];
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(ripGeo, basic(0xe2efff, { transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.raycast = () => {}; scene.add(m); ripples.push({ m, t: rnd(), f: false }); }
    const rippleSpots = [...cells.values()].filter(c => c.res !== "static" && c.res !== "deck");
    function ripAt(x, y, z) { const r = ripples.find(r => r.t > .8) || ripples[0]; r.t = 0; r.f = true; r.m.position.set(x, y, z); }
    const dripMat = basic(0xdfeeff, { transparent: true, opacity: .8 }), drips = [];
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.022, 6, 4), dripMat); m.scale.y = 1.8; m.raycast = () => {}; yard.add(m); drips.push({ m, x: -2.85 + i * .34 + (rnd() - .5) * .08, y: 1.55, v: 0, wait: rnd() * 2 }); }
    const streakMat = basic(0xeaf4ff, { transparent: true, opacity: 0, depthWrite: false }), streaks = [];
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.012, .11), streakMat); m.raycast = () => {}; house.add(m); streaks.push({ m, x: -.15 + rnd() * 1.4, y: .45 + rnd() * .9, v: .05 + rnd() * .12 }); }
    const sp = []; for (let i = 0; i < 360; i++) { const u = rnd(), a = rnd() * Math.PI * 2, r = 160; sp.push(Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r * .6 + 10, Math.sqrt(1 - u * u) * Math.sin(a) * r); }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    scene.add(new THREE.Points(starGeo, starMat));

    function stepWeather(dt) {
      rainK += ((isl.rain ? 1 : 0) - rainK) * Math.min(1, dt * 1.4);
      const on = rainK > .02;
      rainMat.opacity = rainK * .42; rainMesh.visible = on;
      streakMat.opacity = rainK * .5;
      puddles.forEach(p => p.material.opacity = rainK * .32);
      me.umb.visible = rainK > .4;
      if (!on) { ripples.forEach(r => r.m.material.opacity = 0); drips.forEach(d => d.m.visible = false); return; }
      const spd = reduce ? .25 : 1;
      for (let i = 0; i < RN; i++) {
        const d = drops[i]; d[1] -= d[3] * dt * spd; if (d[1] < -2) d[1] = 14; const j = i * 6;
        rainArr[j] = d[0]; rainArr[j + 1] = d[1]; rainArr[j + 2] = d[2]; rainArr[j + 3] = d[0] + .05; rainArr[j + 4] = d[1] + .42; rainArr[j + 5] = d[2] + .02;
      }
      rainGeo.attributes.position.needsUpdate = true;
      ripples.forEach(r => {
        r.t += dt * 1.25;
        if (r.t > 1) { r.t = 0; r.f = false; const c = rippleSpots[Math.floor(Math.random() * rippleSpots.length)]; r.m.position.set(c.x + (Math.random() - .5) * .9, c.res === "water" ? -.09 : c.h + .012, c.z + (Math.random() - .5) * .9); }
        r.m.scale.setScalar(1 + r.t * 3.2); r.m.material.opacity = (1 - r.t) * .6 * rainK;
      });
      drips.forEach(d => {
        d.m.visible = true; if (d.wait > 0) { d.wait -= dt; d.m.visible = false; return; } d.v += 9.8 * dt * spd; d.y -= d.v * dt;
        if (d.y <= 0) { ripAt(d.x + OX, .012, .32 + OZ); d.y = 1.55; d.v = 0; d.wait = .6 + Math.random() * 2.2; } d.m.position.set(d.x, d.y, .32);
      });
      streaks.forEach(s => { s.y -= s.v * dt * spd; if (s.y < .42) { s.y = 1.36; s.x = -.15 + Math.random() * 1.4; s.v = .05 + Math.random() * .12; } s.m.position.set(s.x, s.y, 1.262); });
    }

    /* ================= time of day ================= */
    let live = true, hours = 12;
    const KF = [[0, "#0f1424", "#222c46"], [4.5, "#0f1424", "#222c46"], [6, "#e9a487", "#8fa8d6"], [8, "#79bde8", "#d3ecfb"], [16, "#79bde8", "#d3ecfb"], [18, "#e48a6c", "#6f6aa4"], [19.5, "#161c34", "#2d3658"], [24, "#0f1424", "#222c46"]];
    const cA = new THREE.Color(), cB = new THREE.Color();
    const lerpHex = (a, b, f) => cA.set(a).lerp(cB.set(b), f).getStyle();
    function skyAt(t) { for (let i = 0; i < KF.length - 1; i++) { const [t0, a0, b0] = KF[i], [t1, a1, b1] = KF[i + 1]; if (t >= t0 && t <= t1) { const f = (t - t0) / (t1 - t0 || 1); return [lerpHex(a0, a1, f), lerpHex(b0, b1, f)]; } } return [KF[0][1], KF[0][2]]; }
    const PER = T("i3.periods");
    const period = t => PER[t < 5 ? 0 : t < 8 ? 1 : t < 11 ? 2 : t < 14 ? 3 : t < 17 ? 4 : t < 19 ? 5 : 6];
    $("i3-marks").innerHTML = T("i3.marks").map(m => "<span>" + esc(m) + "</span>").join("");
    let lampOn = 0;
    function applyTime(t) {
      const sa = (t - 6) / 12 * Math.PI, s = Math.sin(sa), day = clamp(s * 1.6 + .1, 0, 1) * (s > -.05 ? 1 : 0);
      let [tp, bt] = skyAt(t);
      if (rainK > .01) { tp = lerpHex(tp, "#1c2333", rainK * .6); bt = lerpHex(bt, "#2f3a52", rainK * .6); }
      paintSky(tp, bt);
      starMat.opacity = clamp(1 - day * 1.6, 0, 1) * (1 - rainK);
      if (s > 0) { sun.position.set(Math.cos(sa) * 24, Math.max(s, .3) * 32, 16); const warm = 1 - clamp(s * 2.2, 0, 1); sun.color.set(0xffffff).lerp(cB.set(0xffa66b), warm); sun.intensity = .3 + .45 * day; }
      else { sun.position.set(-12, 28, -16); sun.color.set(0x8ea2e8); sun.intensity = .38; }
      sun.intensity *= 1 - .5 * rainK;
      hemi.color.set(0x3e4c80).lerp(cB.set(0xffffff), day); hemi.groundColor.set(0x2a3040).lerp(cB.set(0x5a6a4a), day);
      hemi.intensity = (.5 + .2 * day) * (1 - .15 * rainK);
      const night = clamp(1 - day + rainK * .35, 0, 1); lampOn = clamp((night - .55) / .35, 0, 1);
      glassMat.color.set(0xcfe6ff).lerp(cB.set(0xffd9a0), lampOn); glassMat.opacity = .12 + lampOn * .06;
      puddles.forEach((p, i) => p.material.color.set(0x9fbbe0).lerp(cB.set(i === 0 ? 0xffc27a : 0xb7c6e8), lampOn * .6));
      [doorWin, sideWin].forEach(m => m.material.emissiveIntensity = lampOn * .55);
      stoneLamps.forEach(m => m.emissiveIntensity = lampOn * .7);
      bulbMat.color.set(0xb9a98c).lerp(cB.set(0xffd89a), lampOn);
      if (bloom) bloom.strength = lampOn * .35;
      const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
      $("i3-now").textContent = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); $("i3-period").textContent = period(t);
    }
    $("i3-time").oninput = e => { live = false; $("i3-live").classList.remove("is-on"); $("i3-live").textContent = T("i3.back"); hours = +e.target.value / 60; };
    $("i3-live").onclick = () => { live = true; $("i3-live").classList.add("is-on"); $("i3-live").textContent = T("i3.live"); };

    // 第一次来：小提示
    let tipSeen = false; try { tipSeen = !!localStorage.getItem("winslog-island3d-tip"); } catch (e) {}
    $("i3-tip").hidden = tipSeen;
    $("i3-tipok").onclick = () => { $("i3-tip").hidden = true; try { localStorage.setItem("winslog-island3d-tip", "1"); } catch (e) {} };

    /* ================= loop ================= */
    let last = performance.now(), lastMin = -1;
    function stepWalker(w, dt, speed, now, legs) {
      let moving = false;
      if (w.path.length) {
        const [tx, tz] = w.path[0], dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
        if (d < .04) { w.x = tx; w.z = tz; w.path.shift(); }
        else {
          const st = Math.min(d, speed * dt); w.x += dx / d * st; w.z += dz / d * st; moving = true;
          const want = Math.atan2(dx, dz); let diff = want - w.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); w.g.rotation.y += diff * Math.min(1, dt * 10);
        }
      }
      const c = cellAt(w.x, w.z); const gh = c ? c.h : 0;
      w.y += (gh - w.y) * Math.min(1, dt * 12);
      const sw = moving && !reduce ? Math.sin(now * .016) : 0;
      w.g.position.set(w.x, w.y + (moving && !reduce ? Math.abs(sw) * .04 : 0), w.z);
      if (legs) { legs[0].rotation.x = sw * .5; legs[1].rotation.x = -sw * .5; }
      return moving;
    }
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (view.hidden) return; // 在看世界地图时不画
      if (live) { const d = new Date(); hours = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; const m = d.getHours() * 60 + d.getMinutes(); if (m !== lastMin) { lastMin = m; $("i3-time").value = m; } }
      stepWeather(dt);
      applyTime(hours);
      lightsNight.forEach(([l, b]) => l.intensity = lampOn * b);
      flick.forEach(f => {
        if (f.fire) { const k = reduce ? 1 : .8 + Math.sin(now * .013) * .12 + Math.sin(now * .031) * .08; f.l.intensity = lampOn * f.base * k; f.m.emissiveIntensity = (.3 + lampOn * .7) * k; return; }
        const off = !reduce && Math.random() < .004; f.l.intensity *= off ? .25 : 1; f.m.emissiveIntensity = lampOn * (off ? .2 : .8);
      });
      stepWalker(me, dt, 2.4, now, [me.legL, me.legR]);
      if (!stepWalker(cat, dt, 1.1, now) && now > cat.next) { const n = cells.get((Math.round(cat.x) + Math.round(Math.random() * 2 - 1)) + "," + (Math.round(cat.z) + Math.round(Math.random() * 2 - 1))); const from = cellAt(cat.x, cat.z); if (walkable(n) && from && canStep(from, n)) cat.path = [[n.x, n.z]]; cat.next = now + 2000 + Math.random() * 3500; }
      for (let i = grows.length - 1; i >= 0; i--) { const g = grows[i], k = Math.min(1, (now - g.t0) / 800), e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); g.g.scale.setScalar(Math.max(.01, e)); if (k >= 1) { g.g.scale.setScalar(1); grows.splice(i, 1); } }
      for (let i = bounces.length - 1; i >= 0; i--) { const b = bounces[i], k = (now - b.t0) / 350; if (k >= 1) { b.o.scale.copy(b.s); bounces.splice(i, 1); } else { const q = 1 + Math.sin(k * Math.PI) * .08; b.o.scale.set(b.s.x / q, b.s.y * q, b.s.z / q); } }
      if (bubbleAt) { if (now > bubbleT) { bubble.classList.remove("is-on"); bubbleAt = null; } else { const v = bubbleAt.clone().project(cam); bubble.style.left = ((v.x + 1) / 2 * W) + "px"; bubble.style.top = ((1 - v.y) / 2 * H) + "px"; } }
      if (composer) composer.render(); else renderer.render(scene, cam);
    }
    me.g.position.set(me.x, 0, me.z); cat.g.position.set(cat.x, 0, cat.z);
    resize();
    new MutationObserver(() => { if (!view.hidden) resize(); }).observe(view, { attributes: true, attributeFilter: ["hidden"] });
    requestAnimationFrame(loop);
  }

  return { init: init };
})();

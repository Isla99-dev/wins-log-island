/*
 * 我的小岛（3D）—— 三渲二卡通风格：微缩模型、深色细轮廓线、饱和明快的颜色、雨夜暖光
 * three.js r128（lib/ 里，非 module 版本）
 *
 * 画面：全部用 MeshToonMaterial + 3 档渐变（暗 / 中 / 亮，NearestFilter，最亮一档压在 238），
 *       深色细轮廓线（EdgesGeometry，#1b2133），不做色调映射（NoToneMapping，颜色不发灰），
 *       PCFSoft 阴影，淡淡的远景雾；泛光只给发光物体（阈值 0.95），小灯泡用 InstancedMesh，
 *       点光源不超过 6 个，照亮范围小。画质开关：高 / 低。
 * 玩法（不变）：完成一件事 → 种一棵树、+10 金币；商店买东西放到岛上；公告栏显示今日 Wins。
 * 数据都在 Store 里（Store.island()、Store.coins()）。
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

  // 画质：高（泛光、细阴影、多草丛）/ 低（手机更流畅）。只存在这台电脑的浏览器里。
  const QKEY = "winslog-island3d-quality";
  function quality() {
    let q = null; try { q = localStorage.getItem(QKEY); } catch (e) {}
    if (q === "high" || q === "low") return q;
    const small = Math.min(screen.width, screen.height) < 700 || matchMedia("(pointer: coarse)").matches;
    return small ? "low" : "high";
  }

  let started = false;
  function init() {
    if (started || !window.THREE) return;
    started = true;
    Store.importIsland3d(PRICE);
    loadModels(() => (window.Characters ? Characters.load(build) : build(null)));
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

  /* ================= 季节配色（每季最多三个主色） ================= */
  // 饱和、明快的卡通配色（和最早的 3D 原型一致）；季节切换以后再做。
  const SEASONS = {
    toon: {
      grass: 0x86b86a, grassTip: 0x7fb869, foliage: [0x6fae5c, 0x82c06c, 0x5e9f55], pine: 0x4f8f48,
      wood: 0x8a5a34, cream: 0xf1e8d8, accent: 0xe0795a, roof: 0x41607f, water: 0x4f8fc0, soil: 0x8b6a4e, base: 0x4f5566,
    },
  };
  const SEASON = SEASONS.toon;

  function build(ART) {
    const view = $("view-island");
    const cv = $("island3d");
    const isl = Store.island();
    const Q = quality();
    const HIGH = Q === "high";

    /* ================= 材质工具 ================= */
    const col = h => new THREE.Color(h);
    // 卡通着色：3 档渐变（暗 / 中 / 亮），最亮一档压到 238，灯再近也不会把地面打成一片白
    const grad = new THREE.DataTexture(new Uint8Array([100, 100, 100, 180, 180, 180, 238, 238, 238]), 3, 1, THREE.RGBFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
    const NOT_TOON = ["roughness", "metalness", "clearcoat", "clearcoatRoughness", "envMapIntensity", "flatShading"];
    const TM = o => { const p = Object.assign({}, o); NOT_TOON.forEach(k => delete p[k]); p.gradientMap = grad; return new THREE.MeshToonMaterial(p); };
    // 深色细轮廓线
    const EDGE = new THREE.LineBasicMaterial({ color: 0x1b2133, transparent: true, opacity: .7 });
    const edgeCache = new Map();
    function outline(m, th) {
      const k = m.geometry.uuid + "|" + th; let e = edgeCache.get(k);
      if (!e) { e = new THREE.EdgesGeometry(m.geometry, th); edgeCache.set(k, e); }
      const l = new THREE.LineSegments(e, EDGE); l.raycast = () => {}; m.add(l); return l;
    }
    // 哪些形状加轮廓线：方块、圆柱、圆锥、拉伸体加；球（树冠、小人、猫）和平面不加
    function edgeAngle(geo) {
      const t = geo.type;
      if (t === "BoxGeometry" || t === "BoxBufferGeometry") return 25;
      if (/Cylinder|Cone|Torus/.test(t)) return 40;
      if (/Extrude/.test(t)) return 30;
      return 0;
    }
    const allMats = new Set();
    const MATS = new Map();
    // 干净的纯色 + 真实光泽：rough 越小越亮，metal 是金属感
    function mat(hex, o) {
      o = o || {};
      const key = hex + "|" + (o.side || 0);
      let m = MATS.get(key);
      if (!m) {
        m = TM({ color: col(hex), side: o.side || THREE.FrontSide });
        MATS.set(key, m); allMats.add(m);
      }
      return m;
    }
    function own(m) { allMats.add(m); return m; } // 单独的材质（要单独改亮度的）
    // 会发光的材质：晚上亮、白天不亮（屏幕例外），轻轻呼吸
    const glows = [];
    function glowMat(hex, base, opt) {
      opt = opt || {};
      const m = own(TM({ color: col(opt.color != null ? opt.color : hex), emissive: col(hex), emissiveIntensity: 0, transparent: !!opt.opacity, opacity: opt.opacity || 1 }));
      glows.push({ m, base, day: opt.day || 0, phase: rnd() * 6, breathe: opt.breathe == null ? .07 : opt.breathe, fire: !!opt.fire });
      return m;
    }

    /* ================= 几何工具 ================= */
    const GEO = new Map();
    const cached = (key, fn) => { let g = GEO.get(key); if (!g) { g = fn(); GEO.set(key, g); } return g; };
    // 圆角方块：所有木头、家具都用它，轮廓利落又圆润
    function rbox(w, h, d) { return cached("bx" + [w, h, d].map(v => v.toFixed(3)).join("|"), () => new THREE.BoxGeometry(w, h, d)); }
    function rboxRound(w, h, d, r) {
      r = Math.min(r == null ? .03 : r, w / 2 - .001, h / 2 - .001, d / 2 - .001);
      return cached("rb" + [w, h, d, r].map(v => v.toFixed(3)).join("|"), () => {
        const s = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r, W2 = w - 2 * r, H2 = h - 2 * r;
        s.moveTo(x, y - r); s.lineTo(x + W2, y - r); s.quadraticCurveTo(x + W2 + r, y - r, x + W2 + r, y);
        s.lineTo(x + W2 + r, y + H2); s.quadraticCurveTo(x + W2 + r, y + H2 + r, x + W2, y + H2 + r);
        s.lineTo(x, y + H2 + r); s.quadraticCurveTo(x - r, y + H2 + r, x - r, y + H2);
        s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
        const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: 0, bevelSegments: 3, curveSegments: 3 });
        g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals();
        return g;
      });
    }
    const sphereG = (r, w, h) => cached("sp" + r + "|" + (w || 20), () => new THREE.SphereGeometry(r, w || 20, h || 14));
    const cylG = (rt, rb, h, s) => cached("cy" + [rt, rb, h, s || 16].join("|"), () => new THREE.CylinderGeometry(rt, rb, h, s || 16));
    const coneG = (r, h, s) => cached("co" + [r, h, s || 18].join("|"), () => new THREE.ConeGeometry(r, h, s || 18));
    const scene = new THREE.Scene();
    let DEF = scene;
    function mesh(geo, m, x, y, z, p, shadow) {
      const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0);
      o.castShadow = shadow !== false; o.receiveShadow = true; (p || DEF).add(o);
      const th = edgeAngle(geo); if (th) outline(o, th);
      return o;
    }
    const R = (w, h, d, m, x, y, z, p, r) => mesh(rbox(w, h, d, r), m, x, y, z, p);
    const Cy = (rt, rb, h, m, x, y, z, p, s) => mesh(cylG(rt, rb, h, s), m, x, y, z, p);
    const Sp = (r, m, x, y, z, p) => mesh(sphereG(r), m, x, y, z, p);

    /* ---------- Kenney 模型 → 统一的写实材质（不描边） ---------- */
    const PAL = {
      leafsGreen: 0x6fae5c, leafsDark: 0x4f8f4c, leafsFall: 0xe59a52, woodBark: 0x7a5236, woodBarkDark: 0x5e3f2a,
      woodBirch: 0xeadfca, woodDark: 0x6b4a33, wood: 0xa36d40, woodInner: 0xdcb47e, stone: 0xa7aab0, dirt: 0x8b6a4e,
      grass: 0x6fa75a, colorRed: SEASON.accent, colorYellow: 0xf2c14e, colorPurple: 0xb592e0, colorWhite: 0xf6f1e7,
      colorTan: 0xdcc6a2, corn: 0xf2c14e, plant: 0x5e9f55, metal: 0x5a5f6a, metalMedium: 0x7a808a, lamp: 0xffe2a8,
      carpetWhite: 0xf6f1e7, carpetDarker: 0x5d7fa8,
    };
    const ROUGH = { metal: .35, metalMedium: .4, stone: .88, dirt: .95, woodBark: .85, woodBarkDark: .85, wood: .6, woodDark: .6, woodInner: .7, lamp: .3 };
    const METAL = { metal: .7, metalMedium: .55 };
    const SMOOTH = /^(rock_|stone_|mushroom|plant_bush|flower_|lily|crop_|pot_)/;
    const smoothCache = new Map();
    function smoothGeo(g) {
      let s = smoothCache.get(g.uuid);
      if (!s) {
        s = g.clone(); s.deleteAttribute("normal"); if (s.attributes.uv) s.deleteAttribute("uv");
        try { s = THREE.BufferGeometryUtils.mergeVertices(s, 1e-3); } catch (e) {}
        s.computeVertexNormals(); smoothCache.set(g.uuid, s);
      }
      return s;
    }
    const texMats = new Map();
    const PROTO = {};
    function proto(name) {
      if (PROTO[name]) return PROTO[name];
      const raw = RAW[name]; if (!raw) return null;
      const g = raw.clone(true);
      const smooth = SMOOTH.test(name);
      g.traverse(o => {
        if (!o.isMesh) return;
        const m = o.material;
        if (m.map) {
          let t = texMats.get(m.map.uuid);
          if (!t) { m.map.encoding = THREE.LinearEncoding; t = own(TM({ map: m.map })); texMats.set(m.map.uuid, t); }
          o.material = t;
        } else {
          const over = name.indexOf("bridge") === 0 && m.name === "stone" ? SEASON.wood : null; // 木桥的桥面用木头色
          o.material = mat(over != null ? over : PAL[m.name] != null ? PAL[m.name] : m.color.getHex(), { rough: ROUGH[m.name], metal: METAL[m.name] });
        }
        if (smooth) o.geometry = smoothGeo(o.geometry);
        o.castShadow = o.receiveShadow = true;
        outline(o, 38);
      });
      PROTO[name] = g;
      return g;
    }
    function K(name, x, y, z, o) {
      o = o || {};
      const pr = proto(name); if (!pr) return null;
      const g = pr.clone(true);
      const s = o.s || 1; if (Array.isArray(s)) g.scale.set(s[0], s[1], s[2]); else g.scale.setScalar(s);
      g.position.set(x, y, z); g.rotation.y = o.r || 0;
      (o.p || DEF).add(g);
      return g;
    }

    /* ================= 渲染器、环境光、天空 ================= */
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const usePost = HIGH;
    // 不做色调映射：卡通配色保持饱和明快，不被压灰
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputEncoding = THREE.LinearEncoding;

    const skyC = document.createElement("canvas"); skyC.width = 2; skyC.height = 256;
    const skyG = skyC.getContext("2d"), skyTex = new THREE.CanvasTexture(skyC);
    scene.background = skyTex;
    scene.fog = new THREE.FogExp2(0x283a66, .0075);
    let skyKey = "";
    function paintSky(top, mid, bot) {
      const k = top + mid + bot; if (k === skyKey) return; skyKey = k;
      const g = skyG.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, top); g.addColorStop(.55, mid); g.addColorStop(1, bot);
      skyG.fillStyle = g; skyG.fillRect(0, 0, 2, 256); skyTex.needsUpdate = true;
    }
    const cam = new THREE.PerspectiveCamera(28, 1, .1, 400);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x4e5a46, .5); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.castShadow = true; sun.shadow.mapSize.set(HIGH ? 4096 : 1536, HIGH ? 4096 : 1536);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 100 });
    sun.shadow.bias = -.0003; sun.shadow.normalBias = .03;
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
      if ((x === 1 || x === 2) && z <= 8) res = "water";
      if (x >= 1 && z >= 9) { res = "water"; zone = "sea"; }
      cells.set(x + "," + z, { x, z, h, zone, res, occ: null });
    }
    const reserve = (x, z, r) => { const c = cells.get(x + "," + z); if (c && !c.res) c.res = r || "static"; };
    const walls = new Set();
    const wallKey = (a, b) => a < b ? a + "|" + b : b + "|" + a;
    function wall(x1, z1, x2, z2) { walls.add(wallKey(x1 + "," + z1, x2 + "," + z2)); }

    /* ---------- 地形：侧面是土和石头，上面是有轻微起伏的草地 ---------- */
    const terrain = [];
    const GRASS = SEASON.grass, SOIL = SEASON.soil, SAND = 0xe6d3a0, CLIFF = 0x9b8e7c, BED = 0xb9a77c;
    const E = N + .5;
    const slab = (x0, x1, z0, z1, y0, y1, m) => { const o = mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, scene); o.castShadow = false; return o; };
    // 平缓的起伏（几组正弦叠起来，很柔和，不是噪点）
    const bump = (x, z) => (1 + Math.sin(x * .9 + z * .4) * .5 + Math.sin(z * 1.3 - x * .6 + 1.7) * .35 + Math.sin(x * 2.3 + z * 1.9) * .15) * .03; // 0 ~ 0.06，只往上鼓
    function ground(x0, x1, z0, z1, y, hex) {
      const w = x1 - x0, d = z1 - z0;
      const g = new THREE.PlaneGeometry(w, d, Math.ceil(w * 2), Math.ceil(d * 2)); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), lz = p.getZ(i), wx = lx + (x0 + x1) / 2, wz = lz + (z0 + z1) / 2;
        const edge = clamp(Math.min(wx - x0, x1 - wx, wz - z0, z1 - wz) / .6, 0, 1); // 边缘贴平，和侧面接得上
        p.setY(i, bump(wx, wz) * edge);
      }
      g.computeVertexNormals();
      const o = mesh(g, mat(hex, { rough: .92 }), (x0 + x1) / 2, y, (z0 + z1) / 2, scene, false);
      terrain.push(o); return o;
    }
    const soilM = mat(SOIL, { rough: .95 }), cliffM = mat(CLIFF, { rough: .9 });
    ground(-E, .5, -E, E, 0, GRASS); slab(-E, .5, -E, E, -1.6, -.01, soilM);
    ground(2.5, E, -E, 4.5, 0, GRASS); ground(2.5, E, 4.5, 8.5, 0, SAND); slab(2.5, E, -E, 8.5, -1.6, -.01, soilM);
    slab(.5, 2.5, -E, 8.5, -1.6, -.62, soilM); terrain.push(slab(.5, 2.5, -E, 8.5, -.62, -.52, mat(BED, { rough: .95 })));
    slab(.5, E, 8.5, E, -1.6, -1.12, soilM); terrain.push(slab(.5, E, 8.5, E, -1.12, -1.02, mat(BED, { rough: .95 })));
    // 水面的波纹法线图：用平滑的正弦叠出来
    const waterNormal = (() => {
      const S = 128, c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d"); const img = g.createImageData(S, S);
      const hgt = (x, y) => Math.sin((x / S) * Math.PI * 4 + Math.sin((y / S) * Math.PI * 2) * 1.5) * .5 + Math.sin((y / S) * Math.PI * 6 + (x / S) * Math.PI * 2) * .35 + Math.sin(((x + y) / S) * Math.PI * 8) * .15;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
        const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize(); const i = (y * S + x) * 4;
        img.data[i] = (n.x * .5 + .5) * 255; img.data[i + 1] = (n.y * .5 + .5) * 255; img.data[i + 2] = (n.z * .5 + .5) * 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
    })();
    const waterMat = own(TM({ color: col(SEASON.water), transparent: true, opacity: .85, depthWrite: false, normalMap: waterNormal, normalScale: new THREE.Vector2(.22, .22), clearcoat: .6, clearcoatRoughness: .1 }));
    const streamW = slab(.5, 2.5, -E, 8.5, -.52, -.1, waterMat); streamW.receiveShadow = false;
    const seaW = slab(.5, E, 8.5, E, -1.02, -.1, waterMat); seaW.receiveShadow = false;
    terrain.push(streamW, seaW);
    const baseM = mat(SEASON.base);
    mesh(rbox(25.5, .3, 25.5, .08), baseM, 0, -1.76, 0, scene).castShadow = false;
    slab(-E, -4.5, -E, -4.5, 0, H1 - .01, cliffM).castShadow = true;
    ground(-E, -4.5, -E, -4.5, H1, GRASS);
    slab(-E, -8.5, -E, -8.5, H1, H2 - .01, cliffM).castShadow = true;
    ground(-E, -8.5, -E, -8.5, H2, GRASS);
    const stepM = mat(0x9aa0aa);
    function stairs(cx, cz, base, top) {
      const c = cells.get(cx + "," + cz); c.h = (base + top) / 2; c.res = "stair";
      for (let i = 0; i < 3; i++) {
        const hh = base + (top - base) * (i + 1) / 3, x0 = cx + .5 - (i + 1) / 3, x1 = cx + .5 - i / 3;
        const o = mesh(rbox(x1 - x0 + .02, hh - base + .02, .96, .04), stepM, (x0 + x1) / 2, (hh + base) / 2, cz, scene);
        terrain.push(o);
      }
    }
    stairs(-4, -6, 0, H1);
    stairs(-8, -10, H1, H2);

    /* ---------- 小路：圆润的踏脚石 ---------- */
    const PATHS = [
      [[-7, 1], [-7, 2], [-7, 3], [-6, 3], [-5, 3], [-4, 3], [-3, 3]],
      [[-2, 3], [-1, 3], [0, 3], [3, 3], [4, 3], [5, 3], [6, 3]],
      [[6, 2], [6, 1], [6, 0], [6, -1], [6, -2], [6, -3], [6, -4], [6, -5], [7, -5], [7, -6]],
      [[6, 4], [6, 5], [6, 6], [6, 7], [6, 8]],
      [[-3, 2], [-3, 1], [-3, 0], [-3, -1], [-3, -2], [-3, -3], [-3, -4], [-3, -5], [-3, -6],
        [-5, -6], [-6, -6], [-7, -6], [-7, -7], [-7, -8], [-7, -9], [-7, -10], [-9, -10]],
      [[-3, 4], [-3, 5], [-3, 6], [-3, 7], [-3, 8], [-4, 8], [-5, 8], [-6, 8], [-7, 8], [-8, 8], [-9, 8]],
    ];
    const pebbleG = cached("pebble", () => { const g = new THREE.SphereGeometry(.3, 20, 10); g.scale(1, .16, 1); return g; });
    const pebbleM = mat(0xb9b8b0), pebbleSandM = mat(0xd9c79a);
    PATHS.forEach(p => p.forEach(([x, z]) => {
      const c = cells.get(x + "," + z); if (!c) return; if (!c.res) c.res = "path";
      const n = c.zone === "beach" ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const px = x + (rnd() - .5) * .45, pz = z + (rnd() - .5) * .45;
        const s = mesh(pebbleG, c.zone === "beach" ? pebbleSandM : pebbleM, px, c.h + bump(px, pz) + .02, pz, scene, false);
        s.rotation.y = rnd() * 3; s.scale.set(n === 1 ? 1 : .7 + rnd() * .2, 1, n === 1 ? .9 : .62 + rnd() * .2);
      }
    }));

    /* ---------- 木桥、小码头 ---------- */
    for (const x of [1, 2]) { const c = cells.get(x + ",3"); c.res = "bridge"; c.h = .3; }
    const bridge = new THREE.Group(); bridge.position.set(1.5, 0, 3); scene.add(bridge);
    if (!K("bridge_wood", 0, -.05, 0, { s: [2.1, 1.3, 1.5], r: Math.PI / 2, p: bridge })) R(2.2, .12, 1.1, mat(SEASON.wood), 0, .2, 0, bridge);
    bridge.userData.what = "bridge";
    const dock = new THREE.Group(); dock.position.set(6, 0, 0); scene.add(dock);
    const plankA = mat(0xb07a48), plankB = mat(0xa36d40), postM = mat(0x6b4a33);
    let pi = 0; for (let z = 8.6; z <= 11.6; z += .36) R(1.15, .07, .32, pi++ % 2 ? plankB : plankA, 0, .08, z, dock, .025);
    for (const z of [8.8, 10.2, 11.6]) for (const x of [-.55, .55]) Cy(.07, .07, 1.4, postM, x, -.55, z, dock, 12);
    for (let z = 9; z <= 11; z++) { const c = cells.get("6," + z); c.res = "dock"; c.h = .12; }
    dock.userData.what = "dock";

    /* ================= 小木屋和院子 ================= */
    const OX = -5, OZ = 1;
    const yard = new THREE.Group(); yard.position.set(OX, 0, OZ); scene.add(yard);
    DEF = yard;
    const yres = (x, z, r) => reserve(x + OX, z + OZ, r);
    const lights = []; // 真正的点光源（不超过 6 个）
    function pointLight(parent, x, y, z, base, dist, flicker) {
      const l = new THREE.PointLight(0xffb46b, 0, dist, 2); l.position.set(x, y, z); parent.add(l);
      lights.push({ l, base, flicker: !!flicker, phase: rnd() * 6 }); return l;
    }
    const house = new THREE.Group(); house.position.set(-1.5, 0, -1.6); yard.add(house);
    for (let x = -3; x <= 0; x++) for (let z = -3; z <= -1; z++) yres(x, z);
    const LOG = mat(0xf1e8d8), LOG2 = mat(0xe6dccb), TRIM = mat(0x6b4a33);
    const ROOF = mat(SEASON.roof), STONE = mat(0x6e7381), FLOOR = mat(0xc49a6c);
    const W = 3, D = 2.5, LR = .085, ROWS = 10, FY = .14;
    R(W + .3, .14, D + .3, STONE, 0, .07, 0, house, .04);
    R(W - .1, .03, D - .1, FLOOR, 0, FY, 0, house, .01);
    // 原木墙：一层层圆木，门窗位置空出来
    function logWall(len, along, fixed, openings) {
      for (let i = 0; i < ROWS; i++) {
        const y = FY + LR + i * LR * 1.86;
        let segs = [[-len / 2 - .14, len / 2 + .14]];
        openings.forEach(o => {
          if (y + LR * .6 < o.y0 || y - LR * .6 > o.y1) return;
          const out = [];
          segs.forEach(([a, b]) => { if (o.b <= a || o.a >= b) out.push([a, b]); else { if (o.a > a) out.push([a, o.a]); if (o.b < b) out.push([o.b, b]); } });
          segs = out;
        });
        segs.forEach(([a, b]) => {
          if (b - a < .06) return;
          const L = +(b - a).toFixed(3), m = (a + b) / 2;
          const o = mesh(cylG(LR, LR, L, 12), i % 2 ? LOG : LOG2, 0, y, 0, house);
          if (along === "x") { o.rotation.z = Math.PI / 2; o.position.set(m, y, fixed); }
          else { o.rotation.x = Math.PI / 2; o.position.set(fixed, y, m); }
        });
      }
    }
    const WALLTOP = FY + LR * 1.86 * ROWS;
    logWall(W, "x", D / 2, [{ a: -1.1, b: -.5, y0: 0, y1: 1.28 }, { a: -.25, b: 1.3, y0: .42, y1: 1.42 }]);
    logWall(W, "x", -D / 2, [{ a: -.3, b: .5, y0: .7, y1: 1.3 }]);
    logWall(D, "z", W / 2, [{ a: -.85, b: .35, y0: .5, y1: 1.4 }]);
    logWall(D, "z", -W / 2, [{ a: -.4, b: .4, y0: .6, y1: 1.3 }]);
    // 窗框 + 玻璃（玻璃晚上透出暖光）
    const glassMat = own(TM({ color: col(0xcfe6ff), transparent: true, opacity: .2, depthWrite: false, emissive: col(0xffc27a), emissiveIntensity: 0, side: THREE.DoubleSide }));
    glows.push({ m: glassMat, base: .45, day: 0, phase: 1, breathe: .05 });
    function windowFrame(cx, cy, w, h, axis, pos) {
      const g = new THREE.Group(); house.add(g);
      if (axis === "x") g.position.set(cx, cy, pos); else { g.position.set(pos, cy, cx); g.rotation.y = Math.PI / 2; }
      const t = .06;
      R(w + .12, t, .14, TRIM, 0, h / 2 + t / 2, 0, g, .02); R(w + .2, t, .2, TRIM, 0, -h / 2 - t / 2, .03, g, .02);
      R(t, h, .14, TRIM, -w / 2 - t / 2 + .03, 0, 0, g, .02); R(t, h, .14, TRIM, w / 2 + t / 2 - .03, 0, 0, g, .02);
      R(.035, h, .06, TRIM, 0, 0, 0, g, .012); if (h > .8) R(w, .035, .06, TRIM, 0, h * .12, 0, g, .012);
      const gl = mesh(new THREE.PlaneGeometry(w, h), glassMat, 0, 0, 0, g, false); gl.receiveShadow = false;
      return g;
    }
    windowFrame(.525, .92, 1.5, .98, "x", D / 2);
    windowFrame(.1, 1.0, .75, .56, "x", -D / 2);
    windowFrame(-.25, .95, 1.15, .86, "z", W / 2);
    windowFrame(0, .95, .75, .66, "z", -W / 2);
    // 门：木板门 + 黄铜门把手 + 门框
    R(.58, 1.2, .07, mat(0x8b5a3c), -.8, FY + .6, D / 2, house, .03);
    for (const y of [.35, .85]) R(.46, .36, .02, mat(0x7c5034, { rough: .6 }), -.8, FY + y, D / 2 + .04, house, .02);
    Sp(.035, mat(0xc9a46a, { rough: .25, metal: .85 }), -.58, FY + .62, D / 2 + .07, house);
    R(.08, 1.3, .14, TRIM, -1.12, FY + .64, D / 2, house, .02); R(.08, 1.3, .14, TRIM, -.48, FY + .64, D / 2, house, .02); R(.74, .08, .14, TRIM, -.8, FY + 1.3, D / 2, house, .02);
    // 门口的小平台、台阶、门垫
    R(W + .3, .08, .55, mat(0xa87449, { rough: .6 }), 0, .1, D / 2 + .42, house, .02);
    R(.8, .06, .3, stepM, -.8, .03, D / 2 + .85, house, .02);
    R(.5, .015, .3, mat(0x9c6a4a, { rough: .95 }), -.8, .15, D / 2 + .45, house, .006);
    // 山墙 + 屋顶 + 屋檐 + 屋脊 + 烟囱
    const RISE = .95, eaveY = WALLTOP + .02;
    const tri = new THREE.Shape(); tri.moveTo(-D / 2 - .1, 0); tri.lineTo(D / 2 + .1, 0); tri.lineTo(0, RISE); tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: .12, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2 });
    for (const sx of [W / 2 - .06, -W / 2 - .06]) { const gbl = mesh(triGeo, LOG, sx, eaveY, 0, house); gbl.rotation.y = Math.PI / 2; }
    const slope = Math.atan2(RISE, D / 2 + .1), roofLen = Math.hypot(RISE, D / 2 + .1) + .42;
    for (const s of [1, -1]) {
      const r = R(W + .7, .12, roofLen, ROOF, 0, eaveY + RISE / 2 + .05, s * (D / 4 + .05), house, .04); r.rotation.x = s * slope;
      R(W + .74, .1, .06, mat(0xd9cdb6), 0, eaveY - .1, s * (D / 2 + .43), house, .02); // 屋檐的封檐板
    }
    R(W + .78, .1, .18, mat(0x2f4660), 0, eaveY + RISE + .1, 0, house, .04);
    const chim = new THREE.Group(); chim.position.set(.9, 0, -.55); house.add(chim);
    R(.36, 1.2, .36, STONE, 0, eaveY + RISE - .05, 0, chim, .04); R(.44, .08, .44, mat(0x6f665f, { rough: .8 }), 0, eaveY + RISE + .58, 0, chim, .03);
    // --- 屋里（从大窗户能看到） ---
    const rug = mesh(cylG(.55, .55, .012, 32), mat(0xb86b4b, { rough: .95 }), .1, FY + .02, .25, house, false); rug.scale.z = .7;
    const deskM = mat(0xc08a5c, { rough: .45 });
    R(1.0, .05, .48, deskM, .65, .74, -.9, house, .02);
    for (const [dx, dz] of [[-.44, -.18], [.44, -.18], [-.44, .18], [.44, .18]]) Cy(.022, .022, .6, deskM, .65 + dx, .44, -.9 + dz, house, 8);
    const alu = mat(0x8d9096, { rough: .3, metal: .6 });
    R(.36, .016, .24, alu, .6, .775, -.86, house, .008);
    const lid = R(.36, .24, .014, alu, .6, .9, -.98, house, .008); lid.rotation.x = -.2;
    const scr = mesh(new THREE.PlaneGeometry(.32, .2), glowMat(0x9fd4ff, .7, { day: .5, breathe: .02 }), .6, .9, -.972, house, false); scr.rotation.x = -.2;
    Cy(.05, .04, .1, mat(SEASON.cream, { rough: .4 }), .98, .8, -.82, house, 14);
    const chairM = mat(0x6f7f8f, { rough: .7 });
    R(.42, .05, .4, chairM, .62, .46, -.42, house, .03); R(.42, .42, .05, chairM, .62, .68, -.24, house, .03);
    Cy(.025, .025, .3, mat(0x55585e, { rough: .4, metal: .6 }), .62, .3, -.42, house, 8);
    const bedM = mat(0x9b6a43, { rough: .6 });
    R(.95, .26, 1.45, bedM, -.92, .3, -.45, house, .04);
    R(.9, .12, 1.4, mat(0xf4efe6, { rough: .9 }), -.92, .48, -.45, house, .05);
    R(.92, .08, .95, mat(0x8fa08a, { rough: .9 }), -.92, .56, -.2, house, .04);
    R(.6, .1, .28, mat(0xffffff, { rough: .95 }), -.92, .58, -1.0, house, .05);
    R(.95, .55, .06, bedM, -.92, .5, -1.17, house, .03);
    const shelfM = mat(0x8b5e3c, { rough: .6 });
    R(.3, 1.25, .8, shelfM, 1.22, FY + .62, .45, house, .02);
    const bookCols = [SEASON.accent, 0x5d6f86, 0xe3a83e, 0x7d8f4e, SEASON.cream, 0x8a5a3c];
    for (const y of [.42, .8, 1.12]) {
      R(.26, .025, .76, mat(0xa87449), 1.2, FY + y - .02, .45, house, .008);
      for (let i = 0, z = .1; i < 7 && z < .8; i++) { const h = .2 + rnd() * .08, w = .05 + rnd() * .04; R(.18, h, w, mat(bookCols[(i + (y > .7 ? 2 : 0)) % 6], { rough: .7 }), 1.17, FY + y + h / 2, z + w / 2, house, .01); z += w + .015; }
    }
    Cy(.12, .09, .2, mat(0xc0704f, { rough: .7 }), 1.05, FY + .1, 1.0, house, 16);
    Sp(.18, mat(0x6f7f45, { rough: .8 }), 1.05, FY + .32, 1.0, house); Sp(.12, mat(0x7d8f4e, { rough: .8 }), .98, FY + .45, .95, house);
    // 吊灯：灯罩 + 发光的灯泡 + 屋里的点光源（第 1 个）
    Cy(.004, .004, .45, mat(0x2a2a2a), .15, WALLTOP - .2, .1, house, 4);
    mesh(new THREE.ConeGeometry(.16, .14, 24, 1, true), own(TM({ color: col(SEASON.cream), roughness: .5, side: THREE.DoubleSide })), .15, WALLTOP - .45, .1, house, false);
    Sp(.045, glowMat(0xffd391, 1.1, { color: 0xffe9c8 }), .15, WALLTOP - .5, .1, house);
    pointLight(house, .15, WALLTOP - .55, .1, .6, 2.6);
    // 门口的壁灯（第 2 个点光源）
    R(.12, .16, .1, mat(0x2f2a28, { rough: .4, metal: .5 }), -.3, FY + 1.18, D / 2 + .08, house, .02);
    Sp(.04, glowMat(0xffd391, 1.0, { color: 0xffe9c8 }), -.3, FY + 1.14, D / 2 + .1, house);
    pointLight(house, -.3, FY + 1.0, D / 2 + .5, .22, 1.7);
    // 烟囱的白烟：几团柔和的烟，慢慢往上飘
    const softTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(.5, "rgba(255,255,255,.35)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const smoke = [];
    const smokeTop = new THREE.Vector3();
    for (let i = 0; i < 9; i++) {
      const m = own(new THREE.SpriteMaterial({ map: softTex, color: col(0xe8e4dc), transparent: true, opacity: 0, depthWrite: false }));
      const spr = new THREE.Sprite(m); spr.raycast = () => {}; scene.add(spr); smoke.push({ sp: spr, t: i / 9, seed: rnd() });
    }
    // 小灯串：位置先记下来，最后用一个 InstancedMesh 画
    const bulbSpots = [];
    function stringLights(p0, p1, n, sag, parent) {
      parent = parent || scene; const pts = [];
      for (let i = 0; i <= n; i++) { const k = i / n; const v = new THREE.Vector3().lerpVectors(p0, p1, k); v.y -= Math.sin(k * Math.PI) * sag; pts.push(v); }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2b2522 })); line.raycast = () => {}; parent.add(line);
      scene.updateMatrixWorld(true);
      for (let i = 1; i < n; i++) bulbSpots.push(pts[i].clone().applyMatrix4(parent.matrixWorld).add(new THREE.Vector3(0, -.035, 0)));
    }
    stringLights(new THREE.Vector3(-W / 2 - .3, eaveY - .16, D / 2 + .45), new THREE.Vector3(W / 2 + .3, eaveY - .16, D / 2 + .45), 18, .14, house);
    // 雨桶、伞架
    K("barrel", -3.25, 0, -3.25, { s: 1.5 });
    yres(-3, 0);
    Cy(.12, .12, .36, mat(0x6f7f8f, { rough: .4, metal: .4 }), -3.05, .18, .05, yard);
    for (const [c, a] of [[0x5d6f86, .18], [SEASON.accent, -.12]]) { const u = Cy(.015, .015, .72, mat(c, { rough: .5 }), -3.05 + a * .4, .42, .05, yard, 8); u.rotation.z = a; }
    // 木邮筒
    yres(1, 0);
    Cy(.04, .05, .72, mat(0x7a5338), .9, .36, .1, yard, 10);
    R(.34, .24, .22, mat(SEASON.wood, { rough: .55 }), .9, .82, .1, yard, .06);
    R(.36, .05, .24, mat(0x7a5338, { rough: .6 }), .9, .96, .1, yard, .025);
    R(.025, .16, .025, mat(SEASON.accent, { rough: .5 }), 1.09, .9, .1, yard, .01);
    // 自行车
    yres(1, -1);
    const bike = new THREE.Group(); bike.position.set(.85, 0, -1.25); bike.rotation.y = -.35; yard.add(bike);
    const tireM = mat(0x2a2a2c, { rough: .7 }), frameM = mat(0x5d6f86, { rough: .3, metal: .5 }), chrome = mat(0xc8ccd2, { rough: .2, metal: .9 });
    for (const x of [-.33, .33]) { mesh(new THREE.TorusGeometry(.2, .025, 10, 32), tireM, x, .21, 0, bike); Cy(.025, .025, .05, chrome, x, .21, 0, bike, 10).rotation.x = Math.PI / 2; }
    const fr = (l, x, y, a) => { const b = Cy(.016, .016, l, frameM, x, y, 0, bike, 8); b.rotation.z = a + Math.PI / 2; };
    fr(.46, -.08, .36, -.5); fr(.42, .12, .43, 0); fr(.38, -.16, .27, .75); fr(.3, .25, .3, 1.1);
    R(.15, .045, .07, mat(0x3b302b, { rough: .6 }), -.12, .57, 0, bike, .02); R(.03, .03, .28, chrome, .3, .57, 0, bike, .01);
    R(.2, .1, .17, mat(0xa87449, { rough: .6 }), .37, .5, 0, bike, .02);
    // 庭院灯（第 3 个点光源）
    yres(-1, 3);
    const lampPostM = mat(0x2f2a28, { rough: .35, metal: .6 });
    const lampGlassM = own(TM({ color: col(0xfff4e0), roughness: .1, transparent: true, opacity: .35, depthWrite: false }));
    Cy(.035, .05, 1.35, lampPostM, -1, .68, 3, yard, 12); Cy(.09, .1, .06, lampPostM, -1, .03, 3, yard, 16);
    R(.2, .24, .2, lampGlassM, -1, 1.48, 3, yard, .02);
    Sp(.055, glowMat(0xffd391, 1.1, { color: 0xffe9c8 }), -1, 1.47, 3, yard);
    mesh(coneG(.17, .12, 4), lampPostM, -1, 1.66, 3, yard).rotation.y = Math.PI / 4;
    pointLight(yard, -1, 1.35, 3, .3, 1.9, true);
    // 今日 Wins 公告栏：带个小屋顶，纸会被灯照到
    yres(-4, 1);
    const board = new THREE.Group(); board.position.set(-4.2, 0, 1); board.rotation.y = .35; yard.add(board);
    const bwood = mat(0x8b5e3c, { rough: .6 });
    R(.07, 1.25, .07, bwood, -.46, .62, 0, board, .02); R(.07, 1.25, .07, bwood, .46, .62, 0, board, .02);
    R(1.0, .7, .06, mat(SEASON.wood, { rough: .55 }), 0, .95, 0, board, .03);
    R(1.18, .05, .28, ROOF, 0, 1.36, .02, board, .02).rotation.x = -.18;
    const bC = document.createElement("canvas"); bC.width = 512; bC.height = 320; const bTex = new THREE.CanvasTexture(bC); bTex.anisotropy = 4;
    mesh(new THREE.PlaneGeometry(.86, .54), own(TM({ map: bTex, roughness: .9 })), 0, .95, .036, board, false);
    // 小菜地
    for (const [x, z, n] of [[-4, 3, "crop_pumpkin"], [-3, 3, "crop_carrot"], [-4, 4, "crops_wheatStageB"], [-3, 4, "crop_melon"]]) {
      yres(x, z); R(.9, .06, .9, mat(0x6e5440, { rough: .95 }), x, .03, z, yard, .03);
      for (const [dx, dz] of [[-.2, -.2], [.2, .2]]) K(n, x + dx, .05, z + dz, { s: .8, r: rnd() * 6 });
    }
    // 院子的篱笆（世界坐标）；前面的篱笆上也挂着小灯串
    DEF = scene;
    const fence = (x, z, r) => K("fence_simple", x, 0, z, { s: [1, 1.5, 1.5], r: r });
    for (let x = -10; x <= -4; x++) { fence(x, -3.5, 0); wall(x, -4, x, -3); }
    for (let x = -10; x <= -4; x++) { if (x === -7) continue; fence(x, 5.5, 0); wall(x, 5, x, 6); }
    for (let z = -3; z <= 5; z++) { fence(-10.5, z, Math.PI / 2); wall(-11, z, -10, z); if (z !== 3) { fence(-3.5, z, Math.PI / 2); wall(-4, z, -3, z); } }
    stringLights(new THREE.Vector3(-10.5, .52, 5.5), new THREE.Vector3(-7.5, .52, 5.5), 12, .1);
    stringLights(new THREE.Vector3(-6.5, .52, 5.5), new THREE.Vector3(-3.5, .52, 5.5), 12, .1);
    stringLights(new THREE.Vector3(-3.5, .52, 5.5), new THREE.Vector3(-3.5, .52, 3.6), 7, .08);

    /* ================= 树：树冠一层层，秋天是橙黄色 ================= */
    const trunkM = mat(0x6e4a33, { rough: .85 });
    const shade = (hex, k) => { const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, clamp(hsl.l + k, 0, 1)); return mat(c.getHex(), { rough: .78 }); };
    const pineM = mat(SEASON.pine, { rough: .8 });
    const sways = [];
    function roundTree(g, seed, size) {
      const r = mulberry32(seed), s = size || 1;
      const h = (.9 + r() * .4) * s;
      const trunk = Cy(.06 * s, .1 * s, h, trunkM, 0, h / 2, 0, g, 10);
      trunk.rotation.z = (r() - .5) * .08;
      const crown = new THREE.Group(); crown.position.y = h; g.add(crown);
      // 同一棵树只用一种颜色，深一点、浅一点两档，一团团叠出层次
      const hue = SEASON.foliage[Math.floor(r() * SEASON.foliage.length)];
      const dark = shade(hue, -.12), mid = shade(hue, 0), light = shade(hue, .1);
      Sp(.4 * s, dark, 0, .12 * s, 0, crown);
      const n = 7 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + r() * .5, rr = (.26 + r() * .12) * s, y = (i % 2 ? .05 : .28) * s + r() * .1 * s;
        Sp((.2 + r() * .08) * s, i % 3 === 0 ? dark : mid, Math.cos(a) * rr, y, Math.sin(a) * rr, crown).scale.y = .86;
      }
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + r(); Sp((.18 + r() * .06) * s, light, Math.cos(a) * .12 * s, (.5 + r() * .12) * s, Math.sin(a) * .12 * s, crown); }
      sways.push({ o: crown, ph: r() * 6, k: .018 + r() * .012 });
      return g;
    }
    function pineTree(g, seed, size) {
      const r = mulberry32(seed), s = size || 1;
      Cy(.06 * s, .09 * s, .5 * s, trunkM, 0, .25 * s, 0, g, 10);
      const crown = new THREE.Group(); crown.position.y = .32 * s; g.add(crown);
      for (let i = 0; i < 4; i++) { const k = 1 - i * .2; mesh(coneG(+(.5 * k * s).toFixed(3), +(.62 * s).toFixed(3), 20), pineM, 0, (.3 + i * .32) * s, 0, crown); }
      sways.push({ o: crown, ph: r() * 6, k: .012 });
      return g;
    }
    function tree(g, seed, kind, size) { return kind === "pine" ? pineTree(g, seed, size) : roundTree(g, seed, size); }

    /* ================= 路边小物件 ================= */
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const stoneLampM = mat(0xb0a698, { rough: .85 });
    function stoneLamp(x, z, p) {
      const c = cells.get(x + "," + z); const y = c ? c.h : 0; if (c && !p) reserve(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); (p || scene).add(g);
      R(.34, .08, .34, stoneLampM, 0, .04, 0, g, .03); Cy(.07, .09, .4, stoneLampM, 0, .28, 0, g, 12);
      R(.3, .06, .3, stoneLampM, 0, .51, 0, g, .025);
      Sp(.075, glowMat(0xffd391, 1.1, { color: 0xffe9c8 }), 0, .62, 0, g);
      for (const [dx, dz] of [[-.11, -.11], [.11, -.11], [-.11, .11], [.11, .11]]) R(.05, .18, .05, stoneLampM, dx, .62, dz, g, .015);
      mesh(coneG(.3, .2, 4), stoneLampM, 0, .8, 0, g).rotation.y = Math.PI / 4;
      Sp(.04, stoneLampM, 0, .93, 0, g);
      g.userData.what = "stoneLamp";
      return g;
    }
    const signs = [];
    function signpost(x, z, r, to) {
      const c = cells.get(x + "," + z); reserve(x, z);
      const g = K("signpost", x, c.h, z, { s: 2.4, r: r }); if (g) { g.userData.what = "sign"; g.userData.to = to; signs.push(g); }
      return g;
    }
    function pot(x, z) {
      const c = cells.get(x + "," + z); reserve(x, z);
      K("pot_large", x, c.h, z, { s: .9 }); K(pick(["flower_redA", "flower_yellowA"]), x - .1, c.h + .15, z, { s: 1.3 });
      K(pick(["flower_yellowC", "plant_bushSmall"]), x + .12, c.h + .15, z + .05, { s: 1.1 });
    }
    function bench(x, z, r) { const c = cells.get(x + "," + z); reserve(x, z); const g = K("bench", x, c.h, z, { s: 2, r: r || 0 }); if (g) g.userData.what = "bench"; return g; }
    function box(x, z, big) { const c = cells.get(x + "," + z); reserve(x, z); K(big ? "box-large" : "box", x, c.h, z, { s: 1.8, r: rnd() * .6 }); if (!big) K("box", x + .05, c.h + .45, z + .05, { s: 1.4, r: rnd() * 2 }); }

    stoneLamp(-2, 4); stoneLamp(0, 2); stoneLamp(3, 4); stoneLamp(5, 2); stoneLamp(7, 7); stoneLamp(-4, -7); stoneLamp(-6, -7); stoneLamp(-2, 9);
    signpost(-2, 2, -Math.PI / 4, "hill"); signpost(7, 3, Math.PI / 2, "forest"); signpost(5, 4, 0, "beach"); signpost(-2, -6, 0, "hill");
    pot(-6, 1); pot(-8, 2); pot(-4, 2); pot(0, 4); pot(5, -3);
    bench(-9, 9, 0); bench(-2, 7, -Math.PI / 2); bench(9, 6, Math.PI);
    box(-9, -2, true); box(-10, 0, false); box(5, 8, true); box(7, 8, false);
    reserve(4, 8); K("barrel", 4, 0, 8, { s: 1.5 }); K("bucket", 4.35, 0, 7.7, { s: 1.6 });
    reserve(-9, 4); K("workbench", -9, 0, 4, { s: 1.8, r: Math.PI / 2 }); K("tool-shovel", -9.35, 0, 4.4, { s: 2 });
    reserve(-10, -2); K("log_stack", -10, 0, -2, { s: 1.2, r: Math.PI / 2 });

    // —— 小树林：圆树和松树混着，林间空地有篝火 ——
    const clearing = (x, z) => x >= 6 && x <= 9 && z >= -8 && z <= -5;
    for (let x = 4; x <= 12; x++) for (let z = -12; z <= -3; z++) {
      const c = cells.get(x + "," + z); if (c.res || clearing(x, z)) continue;
      if (rnd() < .5) {
        reserve(x, z); const g = new THREE.Group(); g.position.set(x + (rnd() - .5) * .3, 0, z + (rnd() - .5) * .3); g.rotation.y = rnd() * 6; scene.add(g);
        tree(g, hash("f" + x + "," + z), rnd() < .45 ? "pine" : "round", 1.05 + rnd() * .45);
      } else if (rnd() < .4) { reserve(x, z); K(pick(["mushroom_redGroup", "mushroom_tanGroup", "stump_old", "stump_round", "plant_bushDetailed", "rock_smallA", "log"]), x, 0, z, { s: 1.4, r: rnd() * 6 }); }
    }
    reserve(7, -7); const fire = new THREE.Group(); fire.position.set(7.5, 0, -6.5); scene.add(fire);
    K("campfire_stones", 0, 0, 0, { s: 1.5, p: fire }); K("campfire_logs", 0, .03, 0, { s: 1.6, p: fire });
    const flameM = glowMat(0xffa04a, 1.2, { color: 0xffb060, day: .5, breathe: 0, fire: true });
    const flames = [];
    for (const [x, z, s] of [[0, 0, 1], [.06, .04, .7], [-.05, -.03, .6]]) flames.push(mesh(coneG(+(.09 * s).toFixed(3), +(.3 * s).toFixed(3), 12), flameM, x, .14 * s + .05, z, fire, false));
    pointLight(fire, 0, .5, 0, .35, 2.2, true); // 第 4 个点光源
    fire.userData.what = "camp";
    reserve(8, -6); K("log", 8.4, 0, -6.4, { s: 1.5, r: .3 });
    reserve(6, -7); K("log", 6.6, 0, -6.7, { s: 1.5, r: 1.8 });
    reserve(9, -8);
    const tent = new THREE.Group(); tent.position.set(9.1, 0, -8.1); tent.rotation.y = -Math.PI / 4 - Math.PI / 2; scene.add(tent);
    const tShape = new THREE.Shape(); tShape.moveTo(-.55, 0); tShape.lineTo(.55, 0); tShape.lineTo(0, .78); tShape.closePath();
    const tGeo = new THREE.ExtrudeGeometry(tShape, { depth: 1.1, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2 }); tGeo.translate(0, 0, -.55);
    mesh(tGeo, mat(SEASON.cream, { rough: .8 }), 0, 0, 0, tent);
    const doorS = new THREE.Shape(); doorS.moveTo(-.26, 0); doorS.lineTo(.26, 0); doorS.lineTo(0, .5); doorS.closePath();
    mesh(new THREE.ShapeGeometry(doorS), mat(0x3a302c, { rough: 1 }), 0, .01, .58, tent, false);
    for (const z of [.6, -.6]) Cy(.025, .025, .95, mat(0x6b4a35), 0, .45, z, tent, 8);
    tent.userData.what = "camp";
    reserve(8, -8); K("bedroll-packed", 8, 0, -7.7, { s: 2 });

    // —— 小山坡和观景台 ——
    for (let x = -12; x <= -10; x++) for (let z = -12; z <= -10; z++) { const c = cells.get(x + "," + z); c.res = "deck"; c.h = H2 + .12; }
    const deck = new THREE.Group(); deck.position.set(-11, H2, -11); scene.add(deck);
    for (let i = 0; i < 8; i++) R(3.1, .1, .36, i % 2 ? plankB : plankA, 0, .06, -1.35 + i * .38, deck, .03);
    const railM = mat(0x8b5e3c, { rough: .6 });
    const rail = (x, z, len, rot) => { const r = new THREE.Group(); r.position.set(x, 0, z); r.rotation.y = rot; deck.add(r); for (let i = 0; i <= len; i++) R(.08, .6, .08, railM, -len / 2 + i, .4, 0, r, .02); R(len + .1, .06, .09, railM, 0, .68, 0, r, .025); R(len + .1, .05, .06, railM, 0, .4, 0, r, .02); };
    rail(0, -1.5, 3, 0); rail(-1.5, 0, 3, Math.PI / 2);
    const scope = new THREE.Group(); scope.position.set(.9, .11, .9); deck.add(scope);
    for (const a of [0, 2.1, 4.2]) { const l = Cy(.018, .018, .7, lampPostM, Math.sin(a) * .14, .32, Math.cos(a) * .14, scope, 8); l.rotation.set(Math.cos(a) * .25, 0, -Math.sin(a) * .25); }
    Cy(.065, .085, .6, mat(0xc9a46a, { rough: .25, metal: .85 }), 0, .72, 0, scope, 18).rotation.set(Math.PI / 2.6, Math.PI / 4, 0);
    bench(-12, -10, Math.PI / 2);
    deck.userData.what = "lookout"; scope.userData.what = "lookout";
    for (const [x, z, n, s] of [[-6, -12, "rock_tallA", 1.3], [-12, -6, "rock_largeA", 1.2], [-8, -6, "rock_smallC", 1.6], [-5, -9, "plant_bushDetailed", 1.5], [-11, -7, "plant_bush", 1.6]]) {
      const c = cells.get(x + "," + z); reserve(x, z); K(n, x, c.h, z, { s, r: rnd() * 6 });
    }
    for (const [x, z, kind] of [[-12, -8, "pine"], [-9, -12, "pine"], [-6, -9, "round"], [-5, -11, "round"]]) {
      const c = cells.get(x + "," + z); reserve(x, z); const g = new THREE.Group(); g.position.set(x, c.h, z); scene.add(g); tree(g, hash("h" + x + z), kind, 1.2);
    }
    for (let i = 0; i < 14; i++) { const along = -12 + rnd() * 7.5; const onX = i % 2; K(pick(["rock_smallA", "rock_smallC", "rock_largeC"]), onX ? along : -4.45, 0, onX ? -4.45 : along, { s: .8 + rnd() * .6, r: rnd() * 6 }); }

    // —— 小溪两岸 ——
    for (let z = -12; z <= 8; z += 1.3) {
      if (Math.abs(z - 3) < 1.2) continue;
      if (rnd() < .55) K(pick(["rock_smallA", "rock_smallC", "rock_smallFlatA"]), .55 + (rnd() < .5 ? 0 : 1.9), -.12, z, { s: 1 + rnd() * .6, r: rnd() * 6 });
      if (rnd() < .35) K(pick(["lily_large", "lily_small"]), 1 + rnd(), -.11, z + rnd(), { s: 1.6, r: rnd() * 6 });
    }
    const reedM = mat(0x9a8f5a, { rough: .8 });
    for (const [x, z] of [[0, -9], [3, -1], [0, 6], [3, 6]]) { const g = new THREE.Group(); g.position.set(x + (x ? .3 : -.3), 0, z); scene.add(g); for (let i = 0; i < 7; i++) { const r = Cy(.012, .018, +(.45 + rnd() * .35).toFixed(2), reedM, (rnd() - .5) * .5, .25, (rnd() - .5) * .5, g, 6); r.rotation.z = (rnd() - .5) * .35; } sways.push({ o: g, ph: rnd() * 6, k: .04 }); }

    // —— 沙滩和码头（秋天：松树代替棕榈） ——
    for (const [x, z] of [[10, 5], [12, 7], [3, 7], [12, 5]]) { reserve(x, z); const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g); tree(g, hash("b" + x + z), "pine", 1.1 + rnd() * .3); }
    for (const [x, z] of [[8, 8], [11, 8], [4, 5]]) K(pick(["rock_smallA", "rock_smallFlatA"]), x + .3, 0, z + .3, { s: 1.2, r: rnd() * 6 });
    K("canoe", 7.6, -.2, 10.4, { s: 1.6, r: .15 }); K("canoe_paddle", 7.5, -.05, 10.3, { s: 1.6, r: .4 });
    K("fish", 6.3, .12, 11.3, { s: 1.6, r: 1.2 }); K("bucket", 5.75, .12, 11.0, { s: 1.6 });
    for (const [x, z] of [[11, 11], [3, 11.5], [9.5, 12]]) K("rock_largeC", x, -.75, z, { s: 1.3, r: rnd() * 6 });
    for (const [x, z] of [[-12, 12], [-12, 6], [-1, 12], [12, -2], [12, 3]]) { reserve(x, z); K(pick(["plant_bushDetailed", "plant_bushLarge"]), x, 0, z, { s: 1.6, r: rnd() * 6 }); }
    for (let i = 0; i < 26; i++) {
      const x = Math.round((rnd() - .5) * 23) + .5, z = Math.round((rnd() - .5) * 23) + .5; const c = cellAt(x - .5, z - .5);
      if (!c || c.res === "water" || c.zone === "beach" || c.zone === "forest") continue;
      K(pick(["flower_yellowA", "flower_yellowC", "flower_redA", "grass_leafs"]), x, c.h + bump(x, z), z, { s: 1.2, r: rnd() * 6 });
    }

    /* ---------- 草丛、小石头（InstancedMesh，很多也不卡） ---------- */
    const wind = { value: 0 };
    function windy(m) {
      m.onBeforeCompile = sh => {
        sh.uniforms.uWind = wind;
        sh.vertexShader = "uniform float uWind;\n" + sh.vertexShader.replace("#include <begin_vertex>",
          "#include <begin_vertex>\n#ifdef USE_INSTANCING\nvec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);\n#else\nvec3 ip = vec3(0.0);\n#endif\nfloat sw = sin(uWind * 1.6 + ip.x * .7 + ip.z * .5) * .5 + sin(uWind * 2.7 + ip.z * 1.3) * .25;\ntransformed.x += sw * transformed.y * transformed.y * 1.6;\ntransformed.z += sw * transformed.y * transformed.y * .6;");
      };
      return m;
    }
    const grassGeo = (() => {
      const parts = [];
      for (let i = 0; i < 6; i++) { const hh = .2 + (i % 3) * .05; const g = new THREE.ConeGeometry(.014, hh, 4, 1); g.translate(0, hh / 2, 0); g.rotateZ((i - 2.5) * .12); g.rotateY(i * 1.1); g.translate(Math.cos(i * 2.1) * .03, 0, Math.sin(i * 2.1) * .03); parts.push(g); }
      return THREE.BufferGeometryUtils.mergeBufferGeometries(parts);
    })();
    const grassM = windy(own(TM({ color: 0xffffff, roughness: .85 })));
    const grassSpots = [];
    const GN = HIGH ? 1500 : 600;
    for (let i = 0; i < GN * 3 && grassSpots.length < GN; i++) {
      const x = (rnd() - .5) * 24.6, z = (rnd() - .5) * 24.6, c = cellAt(x, z);
      if (!c || c.res === "water" || c.res === "path" || c.res === "deck" || c.res === "stair" || c.res === "dock" || c.res === "bridge" || c.zone === "beach") continue;
      if (x > -8.6 && x < -4.4 && z > -2.6 && z < 2.1) continue; // 小屋里不长草
      grassSpots.push([x, c.h + bump(x, z), z]);
    }
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();
    const grass = new THREE.InstancedMesh(grassGeo, grassM, Math.max(1, grassSpots.length));
    grassSpots.forEach((p, i) => {
      tmpQ.setFromEuler(tmpE.set(0, rnd() * 6, 0)); const s = .5 + rnd() * .5; tmpS.set(s, s * (.8 + rnd() * .5), s);
      grass.setMatrixAt(i, tmpM.compose(tmpP.set(p[0], p[1], p[2]), tmpQ, tmpS));
      grass.setColorAt(i, tmpC.copy(col(SEASON.grass)).lerp(col(SEASON.grassTip), rnd()));
    });
    grass.receiveShadow = true; grass.castShadow = false; grass.raycast = () => {}; scene.add(grass);
    const stoneGeo = cached("smallstone", () => { const g = new THREE.IcosahedronGeometry(.07, 2); g.scale(1, .6, 1); return g; });
    const stoneN = HIGH ? 160 : 70, stones = new THREE.InstancedMesh(stoneGeo, mat(0xb2a89a, { rough: .8 }), stoneN);
    let sk = 0;
    for (let i = 0; i < stoneN * 4 && sk < stoneN; i++) {
      const x = (rnd() - .5) * 24.6, z = (rnd() - .5) * 24.6, c = cellAt(x, z);
      if (!c || c.res === "water" || c.res === "deck") continue;
      const s = .5 + rnd() * 1.1; tmpQ.setFromEuler(tmpE.set(rnd(), rnd() * 6, rnd()));
      stones.setMatrixAt(sk++, tmpM.compose(tmpP.set(x, c.h + bump(x, z) + .015, z), tmpQ, tmpS.set(s, s, s)));
    }
    stones.count = sk; stones.receiveShadow = true; stones.raycast = () => {}; scene.add(stones);

    // 水洼（下雨时出现）
    const puddles = [];
    for (const [x, z, sx, sz] of [[-7, 2, .75, .4], [-3, 5, .5, .3], [-9, 6, .6, .35], [5, 1, .5, .3], [-3, -2, .6, .3]]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32), own(TM({ color: col(0x9fbbe0), transparent: true, opacity: 0, depthWrite: false })));
      m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); m.position.set(x, bump(x, z) + .012, z); m.raycast = () => {}; scene.add(m); puddles.push(m);
    }

    /* ================= 可以放的东西 ================= */
    const BUILD = {
      flowers(g) { [["flower_redA", -.2, -.12], ["flower_yellowA", .14, .14], ["flower_yellowC", -.02, .24], ["flower_redC", .22, -.16], ["flower_yellowA", .02, -.02]].forEach(([n, x, z]) => K(n, x, 0, z, { s: 1.5, p: g, r: rnd() * 6 })); },
      bush(g) { K("plant_bushDetailed", 0, 0, 0, { s: 1.7, p: g }); },
      pot(g) { K("pot_large", 0, 0, 0, { s: .9, p: g }); K("flower_redA", -.1, .15, 0, { s: 1.3, p: g }); K("flower_yellowC", .12, .15, .05, { s: 1.1, p: g }); },
      bench(g) { K("bench", 0, 0, 0, { s: 2, p: g }); },
      lantern(g) { stoneLamp(0, 0, g).position.set(0, 0, 0); },
      lamp(g) { Cy(.03, .045, 1.2, lampPostM, 0, .6, 0, g, 12); R(.17, .2, .17, lampGlassM, 0, 1.3, 0, g, .02); Sp(.05, glowMat(0xffd391, 1.0, { color: 0xffe9c8 }), 0, 1.3, 0, g); mesh(coneG(.15, .1, 4), lampPostM, 0, 1.45, 0, g).rotation.y = Math.PI / 4; },
    };

    /* ================= 状态 ================= */
    const pickables = terrain.slice();
    pickables.push(house, board, bridge, dock, deck, fire, tent, ...signs);
    terrain.forEach(m => m.userData.what = "ground");
    house.userData.what = "house"; board.userData.what = "board";
    const grows = [], bounces = [];
    const treeOf = new Map();
    let me = null;
    function placeAt(o, key, anim) {
      const c = cells.get(key); if (!c || c.res || c.occ) return null;
      const g = new THREE.Group();
      g.position.set(c.x, c.h + bump(c.x, c.z), c.z); g.rotation.y = o.rot || 0; g.userData.obj = o; scene.add(g);
      if (o.type === "tree") roundTree(g, hash(o.taskId), 1.05 + (hash(o.taskId) % 5) * .05); else BUILD[o.type](g);
      c.occ = o; o.g = g; o.cell = c; pickables.push(g);
      if (anim) { g.scale.setScalar(.01); grows.push({ g, t0: performance.now() }); }
      return g;
    }
    function unplace(o) {
      if (!o.g) return;
      scene.remove(o.g); const i = pickables.indexOf(o.g); if (i >= 0) pickables.splice(i, 1);
      for (let j = sways.length - 1; j >= 0; j--) { let p = sways[j].o; while (p && p !== o.g) p = p.parent; if (p === o.g) sways.splice(j, 1); }
      if (o.cell) o.cell.occ = null; o.g = null; o.cell = null;
    }
    function canPlace(c) { return !!c && !c.res && !c.occ && (!me || ck(me.x, me.z) !== c.x + "," + c.z); }
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
    function removeTree(id) { const g = treeOf.get(id); if (!g) return; unplace(g.userData.obj); treeOf.delete(id); }
    Store.allWins().forEach(t => plantTree(t, false));
    Store.save();

    /* ================= 2D 插画立牌：小人和黑猫（始终面向镜头） ================= */
    // 图从 js/characters.js 来（代码画的临时版本，或者你自己画的 PNG）
    const texOf = new Map();
    function tex(img) { let t = texOf.get(img); if (!t) { t = new THREE.Texture(img); t.needsUpdate = true; t.anisotropy = 4; texOf.set(img, t); } return t; }
    const planeG = cached("billboard", () => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, .5, 0); return g; });
    const blobG = cached("blob", () => new THREE.CircleGeometry(1, 24));
    function billboard(kind, height) {
      const g = new THREE.Group(); scene.add(g);
      const card = new THREE.Group(); g.add(card); // 只绕竖轴转，人物始终站直
      const m = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: .35, side: THREE.DoubleSide });
      const plane = new THREE.Mesh(planeG, m); card.add(plane);
      const gm = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
      const glowP = new THREE.Mesh(planeG, gm); glowP.position.z = .012; glowP.visible = false; glowP.raycast = () => {}; card.add(glowP);
      const blob = new THREE.Mesh(blobG, new THREE.MeshBasicMaterial({ color: 0x1b2133, transparent: true, opacity: .22, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2; blob.position.y = .02; blob.raycast = () => {}; g.add(blob);
      return { g, card, plane, m, glowP, gm, blob, height, frames: (ART && ART[kind]) || {}, cur: null, asp: 1, face: 1, state: "stand", until: 0, after: null, path: [], y: 0 };
    }
    function setFrame(b, name) {
      const f = b.frames[name] || b.frames[Object.keys(b.frames)[0]];
      if (f && b.cur !== f) {
        b.cur = f; b.m.map = tex(f.image); b.m.needsUpdate = true;
        b.glowP.visible = !!f.glow; if (f.glow) { b.gm.map = tex(f.glow); b.gm.needsUpdate = true; }
        b.asp = (f.image.width || 1) / (f.image.height || 1);
      }
      b.plane.scale.set(b.height * b.asp * b.face, b.height, 1); b.glowP.scale.copy(b.plane.scale);
    }
    // 状态：stand 站立 / walk 走路 / happy 开心 / sit 坐着 / work 干活；猫：walk / sit / stretch / rub
    function act(b, state, ms, then) { b.state = state; b.until = ms ? performance.now() + ms : 0; b.after = then || null; }
    function faceTo(b, dx, dz) { const s = dx * Math.cos(theta) - dz * Math.sin(theta); if (Math.abs(s) > .12) b.face = s < 0 ? -1 : 1; } // 朝屏幕左边走就翻转
    // 小人：日系 Q 版人偶（js/chibi.js）：3D 身体 + 手绘脸贴图
    function makePerson() {
      const av = Chibi.create({ glasses: true });
      const g = av.root; g.scale.setScalar(1.15); scene.add(g);
      g.userData.who = "me"; pickables.push(g);
      return { g, av, x: -7, z: 2, y: 0, path: [], state: "stand", until: 0, after: null, onArrive: null, sitAt: null, turns: true, expr: null, exprUntil: 0 };
    }
    me = makePerson();
    function feel(name, ms) { me.expr = name; me.exprUntil = performance.now() + ms; } // 一会儿的表情
    function makeCat() {
      const b = billboard("cat", .52);
      b.g.userData.who = "cat"; pickables.push(b.g); b.blob.scale.set(.27, .08, 1);
      return Object.assign(b, { x: -6, z: 4, state: "sit", next: 0 });
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
      me.onArrive = null; me.sitAt = null; me.until = 0; me.after = null; if (me.state !== "walk") me.state = "stand";
      let c = cells.get(x + "," + z);
      if (near || !walkable(c)) { let best = null, bd = 99; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const n = cells.get((x + dx) + "," + (z + dz)); if (walkable(n) && findPath(me.x, me.z, n.x, n.z)) { const d = Math.hypot(n.x - me.x, n.z - me.z); if (d < bd) { bd = d; best = n; } } } c = best; }
      if (!c) return; const p = findPath(me.x, me.z, c.x, c.z); if (p) me.path = p;
    }

    /* ================= 镜头 ================= */
    // 竖屏（又高又窄）：把小岛转正一点、镜头更往上看，这样岛能撑满屏幕的宽度，不会缩成窄窄一条
    const PORTRAIT = document.body.classList.contains("layout-portrait");
    let VW = 1, VH = 1, theta = PORTRAIT ? .35 : Math.PI / 4, phi = PORTRAIT ? .86 : .62, dist = PORTRAIT ? 50 : 60;
    const DMIN = 4.5, DMAX = 100;
    const tgt = new THREE.Vector3(0, -.3, 0);
    const AREAS = {
      all: { t: [0, -.3, 0], d: PORTRAIT ? 50 : 60, phi: PORTRAIT ? .86 : .62 },
      yard: { t: [-6.5, .5, 0.5], d: 17, phi: .5 },
      orchard: { t: [-6, 0, 9], d: 19, phi: .58 },
      stream: { t: [1.5, 0, 2], d: 15, phi: .5 },
      forest: { t: [8, .3, -7], d: 19, phi: .58 },
      hill: { t: [-9, 1.6, -9], d: 19, phi: .55 },
      beach: { t: [7, 0, 8.5], d: 18, phi: .5 },
    };
    let fly = null;
    const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    function flyTo(t, d, ph, th) {
      const dth = th == null ? 0 : Math.atan2(Math.sin(th - theta), Math.cos(th - theta));
      fly = { t0: performance.now(), dur: reduce ? 1 : 950, from: { t: tgt.clone(), d: dist, phi, theta }, to: { t: new THREE.Vector3(t[0], t[1], t[2]), d, phi: ph == null ? phi : ph, theta: theta + dth } };
    }
    function flyArea(id) {
      const a = AREAS[id]; if (!a) return;
      flyTo(a.t, a.d, a.phi);
      $("i3-areas").querySelectorAll(".i3-btn").forEach(b => b.classList.toggle("is-on", b.dataset.area === id));
    }
    function stepFly(now) {
      if (!fly) return;
      const k = Math.min(1, (now - fly.t0) / fly.dur), e = ease(k), f = fly.from, t = fly.to;
      tgt.lerpVectors(f.t, t.t, e); dist = f.d + (t.d - f.d) * e; phi = f.phi + (t.phi - f.phi) * e; theta = f.theta + (t.theta - f.theta) * e;
      updateCam(); if (k >= 1) fly = null;
    }
    function stopFly() { fly = null; $("i3-areas").querySelectorAll(".is-on").forEach(b => b.classList.remove("is-on")); }
    function pan(dx, dy) {
      const k = dist * .0016 * Math.max(1, 1.05 / (VW / VH));
      const rx = Math.cos(theta), rz = -Math.sin(theta), fx = -Math.sin(theta), fz = -Math.cos(theta);
      tgt.x = clamp(tgt.x - (dx * rx - dy * fx) * k, -15, 15);
      tgt.z = clamp(tgt.z - (dx * rz - dy * fz) * k, -15, 15);
      updateCam();
    }
    $("i3-areas").innerHTML = ["all", "yard", "orchard", "stream", "forest", "hill", "beach"].map(id => '<button class="i3-btn" type="button" data-area="' + id + '">' + esc(T("i3.area." + id)) + "</button>").join("");
    $("i3-areas").addEventListener("click", e => { const b = e.target.closest("[data-area]"); if (b) flyArea(b.dataset.area); });
    const panel = $("i3-panel");
    function updateCam() {
      const a = VW / VH, d = dist * Math.max(1, 1.05 / a);
      cam.aspect = a;
      cam.position.set(tgt.x + Math.sin(theta) * Math.cos(phi) * d, tgt.y + Math.sin(phi) * d, tgt.z + Math.cos(theta) * Math.cos(phi) * d);
      cam.lookAt(tgt);
      const bare = view.classList.contains("is-bare");
      // 横屏版面：小岛往左让出右边的侧边栏。
      // 竖屏版面：小岛占满整个屏幕，把小岛放在上面约 78% 的中间，这样抽屉收起时整座岛都露着、不被底部的一行和控制条挡住；
      //           抽屉展开时只是盖住下半部分，小岛不缩放。
      if (document.body.classList.contains("layout-portrait")) {
        if (bare) cam.clearViewOffset(); else cam.setViewOffset(VW, VH, 0, Math.round(VH * (.5 - .39)), VW, VH);
      } else if (VW > 700 && !bare) cam.setViewOffset(VW, VH, (panel.offsetWidth + 14) / 2 - 135, -20, VW, VH); else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }

    /* ================= 后期：HDR → 选择性泛光 → ACES + sRGB ================= */
    let composer = null, bloom = null;
    if (usePost && THREE.EffectComposer && THREE.UnrealBloomPass) {
      try {
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(scene, cam));
        bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0, .3, .95); // 只有灯泡、窗户、火这么亮的东西会泛光
        composer.addPass(bloom);
      } catch (e) { composer = null; bloom = null; }
    }
    function resize() {
      VW = cv.clientWidth || view.clientWidth || innerWidth; VH = cv.clientHeight || view.clientHeight || innerHeight; // 画布多大就画多大（竖屏时只占上半屏）
      const pr = Math.min(devicePixelRatio || 1, HIGH ? 2 : 1.25); renderer.setPixelRatio(pr); renderer.setSize(VW, VH, false);
      if (composer) { composer.setPixelRatio(pr); composer.setSize(VW, VH); }
      updateCam();
    }
    addEventListener("resize", resize);
    if (window.ResizeObserver) new ResizeObserver(() => { if (!view.hidden) resize(); }).observe(cv); // 切换版面、「只看小岛」时画布大小会变
    document.addEventListener("layout:change", () => requestAnimationFrame(resize));

    /* ================= 输入 ================= */
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function aim(e) { const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, cam); }
    function groundCell() {
      const hs = ray.intersectObjects(terrain, false); if (!hs.length) return null;
      const p = hs[0].point, n = hs[0].face && hs[0].face.normal;
      if (n && n.y < .5) return null;
      return cellAt(p.x, p.z) || null;
    }
    function owner(o) { while (o) { if (o.userData.obj || o.userData.who || o.userData.what) return o; o = o.parent; } return null; }

    const ptrs = new Map(); let downAt = null, dragging = false, panning = false, pinch0 = 0, dist0 = 30, mid0 = null;
    const mid = () => { const [p, q] = [...ptrs.values()]; return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, d: Math.hypot(p.x - q.x, p.y - q.y) }; };
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("pointerdown", e => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY }; dragging = false; panning = e.button === 2 || e.shiftKey; }
      if (ptrs.size === 2) { const m = mid(); pinch0 = m.d; mid0 = m; dist0 = dist; downAt = null; stopFly(); }
    });
    cv.addEventListener("pointermove", e => {
      if (!ptrs.has(e.pointerId)) { if (placing) hover(e); return; }
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const m = mid(); dist = clamp(dist0 * pinch0 / Math.max(1, m.d), DMIN, DMAX); pan(m.x - mid0.x, m.y - mid0.y); mid0 = m; return; }
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) { if (!dragging) stopFly(); dragging = true; cv.classList.add("is-drag"); }
      if (dragging) {
        if (panning) pan(e.clientX - prev.x, e.clientY - prev.y);
        else { theta -= (e.clientX - prev.x) * .007; phi = clamp(phi + (e.clientY - prev.y) * .005, .18, 1.3); updateCam(); }
      }
      if (placing) hover(e);
    });
    let lastClick = 0;
    cv.addEventListener("pointerup", e => {
      const wasClick = downAt && !dragging && ptrs.size === 1 && e.button === 0; ptrs.delete(e.pointerId); cv.classList.remove("is-drag");
      if (wasClick) { const now = performance.now(); if (now - lastClick < 320 && !placing) dblClick(e); else click(e); lastClick = now; }
      if (!ptrs.size) { downAt = null; dragging = false; panning = false; }
    });
    cv.addEventListener("pointercancel", e => { ptrs.delete(e.pointerId); if (!ptrs.size) { downAt = null; dragging = false; panning = false; } });
    cv.addEventListener("wheel", e => {
      e.preventDefault(); stopFly();
      const nd = clamp(dist * (1 + clamp(e.deltaY, -80, 80) * .0015), DMIN, DMAX);
      if (nd < dist) { aim(e); const hs = ray.intersectObjects(terrain, false); if (hs.length) { const p = hs[0].point, k = 1 - nd / dist; tgt.x += (p.x - tgt.x) * k; tgt.z += (p.z - tgt.z) * k; tgt.y += (p.y - tgt.y) * k; } }
      dist = nd; updateCam();
    }, { passive: false });
    function dblClick(e) { aim(e); const c = groundCell(); if (!c) return; flyTo([c.x, c.h, c.z], Math.min(dist, 14), clamp(phi, .4, .7)); }
    $("i3-rotl").onclick = () => { theta += Math.PI / 4; updateCam(); };
    $("i3-rotr").onclick = () => { theta -= Math.PI / 4; updateCam(); };
    $("i3-zin").onclick = () => { stopFly(); dist = clamp(dist / 1.3, DMIN, DMAX); updateCam(); };
    $("i3-zout").onclick = () => { stopFly(); dist = clamp(dist * 1.3, DMIN, DMAX); updateCam(); };
    function setRain(v) { isl.rain = v; $("i3-rain").textContent = T(v ? "i3.rainOff" : "i3.rainOn"); $("i3-rain").setAttribute("aria-pressed", v); Store.save(); }
    $("i3-rain").onclick = () => setRain(!isl.rain); setRain(isl.rain);
    // 画质开关：换了以后刷新页面
    const qb = $("i3-quality");
    if (qb) {
      qb.textContent = T(HIGH ? "i3.qHigh" : "i3.qLow"); qb.title = T("i3.qTitle");
      qb.onclick = () => { try { localStorage.setItem(QKEY, HIGH ? "low" : "high"); } catch (e) {} location.reload(); };
    }
    function bare(v) { view.classList.toggle("is-bare", v); updateCam(); }
    $("i3-hide").onclick = () => bare(true); $("i3-show").onclick = () => bare(false);
    addEventListener("keydown", e => {
      if (view.hidden || document.body.classList.contains("has-modal")) return;
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) return;
      if (e.key === "Escape") stopPlacing();
      if (e.key === "h" || e.key === "H") bare(!view.classList.contains("is-bare"));
      if (e.key === "ArrowLeft") { theta += .2; updateCam(); }
      if (e.key === "ArrowRight") { theta -= .2; updateCam(); }
      const k = { w: [0, 40], s: [0, -40], a: [40, 0], d: [-40, 0] }[e.key.toLowerCase()];
      if (k) { stopFly(); pan(k[0], k[1]); }
    });

    let placing = null;
    const hl = new THREE.Mesh(new THREE.BoxGeometry(1, .03, 1), new THREE.MeshBasicMaterial({ color: 0x9be38a, transparent: true, opacity: .4, depthWrite: false })); hl.visible = false; hl.raycast = () => {}; scene.add(hl);
    function hover(e) { aim(e); const c = groundCell(); if (!c) { hl.visible = false; return; } hl.visible = true; hl.position.set(c.x, c.h + bump(c.x, c.z) + .03, c.z); hl.material.color.setHex(canPlace(c) ? 0x9be38a : 0xe8826e); }
    function startPlacing(item) {
      placing = item; cv.classList.add("is-place");
      document.dispatchEvent(new CustomEvent("sheet:collapse")); // 竖屏：把抽屉收起来，才看得到要放的地方
      $("i3-ptext").textContent = T("i3.placeHint", { name: itemName(item.id) }); $("i3-placing").hidden = false;
    }
    function stopPlacing() { placing = null; hl.visible = false; cv.classList.remove("is-place"); $("i3-placing").hidden = true; }
    $("i3-pcancel").onclick = stopPlacing;

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    function sitOn(x, y, z, rot) { me.sitAt = new THREE.Vector3(x, y + .22, z); me.sitRot = rot; act(me, "sit"); } // 坐到长椅的座位上
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
      const ow = owner(hs[0].object); if (!ow) return;
      const lines = T("i3.lines"), what = ow.userData.what;
      if (ow.userData.who === "me") {
        const r = Math.random();
        if (!me.path.length && !me.sitAt) { if (r < .45) act(me, "wave", 1600); else if (r < .75) { act(me, "stand", 1400); feel("laugh", 1400); } else { act(me, "stand", 1200); feel("surprised", 1200); } }
        else feel(r < .5 ? "laugh" : "surprised", 1200);
        say(top(me.g, 1.25), lines[Math.floor(Math.random() * lines.length)]); return;
      }
      if (ow.userData.who === "cat") { if (!cat.path.length) act(cat, Math.random() < .5 ? "stretch" : "sit", 1700, () => act(cat, "sit", 2500)); say(top(cat.g, .65), T("i3.meow")); return; }
      if (what === "bench") { const p = ow.position; goTo(Math.round(p.x), Math.round(p.z), true); me.onArrive = () => sitOn(p.x, p.y, p.z, ow.rotation.y); say(top(ow, 1.1), T("i3.sit")); return; }
      if (what === "house") { bounce(house); say(top(house, 3.2), T("i3.house")); flyArea("yard"); return; }
      if (what === "board") { const d = Store.winsOf(); say(top(board, 1.6), d.length ? T("i3.boardDone", { list: d.map(t => t.text).join(T("i3.sep")) }) : T("i3.boardNone")); return; }
      if (what === "sign") { bounce(ow); say(top(ow, 1.4), T("i3.signTo", { name: T("i3.area." + ow.userData.to) })); flyArea(ow.userData.to); return; }
      const area = { bridge: "stream", dock: "beach", lookout: "hill", camp: "forest" }[what];
      if (area) { say(top(ow, 1.2), T("i3.area." + area)); flyArea(area); }
      if (ow.userData.obj) {
        const o = ow.userData.obj; bounce(ow); const t = top(ow, o.type === "tree" ? 2.1 : o.type === "lamp" ? 1.7 : .9);
        if (o.type === "tree") say(t, T("i3.treeLabel", { text: o.label, date: fmtDate(o.date) }));
        else if (o.type === "bench") { goTo(o.cell.x, o.cell.z, true); const p = ow.position; me.onArrive = () => sitOn(p.x, p.y, p.z, ow.rotation.y); say(t, T("i3.sit")); }
        else say(t, itemName(o.type));
        return;
      }
      const c = groundCell(); if (c) goTo(c.x, c.z);
    }
    const bubble = $("i3-bubble"); let bubbleAt = null, bubbleT = 0;
    function say(v, text) { bubbleAt = v; bubble.textContent = text; bubble.classList.add("is-on"); bubbleT = performance.now() + 2800; }
    function bounce(o) { bounces.push({ o, t0: performance.now(), s: o.scale.clone() }); }

    /* ================= 面板 ================= */
    let page = "tasks";
    function showPage(p) {
      page = p;
      panel.querySelectorAll(".i3-tab").forEach(b => { const on = b.dataset.page === p; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on); });
      panel.querySelectorAll(".i3-page").forEach(el => { el.hidden = el.dataset.page !== p; });
      refresh();
    }
    panel.querySelector(".i3-tabs").addEventListener("click", e => { const b = e.target.closest(".i3-tab"); if (b) showPage(b.dataset.page); });
    document.addEventListener("island:page", e => { const p = e.detail && e.detail.page; if (p) { showPage(p); const el = panel.querySelector('.i3-page[data-page="' + p + '"]'); if (el) el.scrollTop = 0; } });
    document.addEventListener("wins:ask", () => showPage("helper"));
    document.addEventListener("companion:start", e => { const d = e.detail || {}; if (d.text) say(top(me.g, 1.25), T("sheet.start", { text: d.text })); }); // 点「下一件」：小人先应一声（陪伴模式在第 2 期）

    function drawBoard() {
      const g = bC.getContext("2d"), d = Store.winsOf();
      g.fillStyle = "#f7f1e3"; g.fillRect(0, 0, 512, 320);
      g.fillStyle = "#c4622d"; g.fillRect(0, 0, 512, 12);
      g.fillStyle = "#3a2e28"; g.font = '46px "ZCOOL KuaiLe", sans-serif'; g.fillText(T("i3.boardTitle", { n: d.length }), 28, 74);
      g.font = '31px "ZCOOL KuaiLe", sans-serif'; g.fillStyle = "#5a4a40";
      const max = I18n.isEn() ? 24 : 13;
      (d.length ? d.slice(-4) : [{ text: T("i3.boardEmpty") }]).forEach((t, i) => { const s = t.text.length > max ? t.text.slice(0, max) + "…" : t.text; g.fillText((d.length ? "✓ " : "") + s, 28, 136 + i * 44); });
      g.fillStyle = "#e3a83e"; g.beginPath(); g.arc(470, 40, 12, 0, 7); g.fill();
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
        History.renderMonth($("i3-month")); // 本月：用历史数据（js/history.js）
      } else if (page === "history") {
        History.renderCalendar($("i3-history")); // 历史：月历 + 某一天的完整清单
      }
    }
    document.addEventListener("wins:change", e => {
      const d = e.detail || {};
      if (d.type === "complete") {
        const t = Store.winsOf().find(w => w.id === d.id); if (!t) return;
        const g = plantTree(t, true); Store.save();
        if (g) {
          const c = g.userData.obj.cell; goTo(c.x, c.z, true);
          me.onArrive = () => { me.g.rotation.y = Math.atan2(c.x - me.x, c.z - me.z); act(me, "work", 2400, () => act(me, "happy", 1500)); }; // 走过去浇浇水，然后开心一下
          setTimeout(() => say(V(c.x, c.h + 2.2, c.z), T("i3.planted", { text: t.text })), 350);
        }
        else say(top(me.g, 1.15), T("i3.full"));
      } else if (d.type === "undo" || d.type === "remove") { removeTree(d.id); if (d.type === "undo") feel("sad", 1800); }
      refresh();
    });
    showPage("tasks");
    // 网址后面加 #page=history / #page=month / #day=2026-11-26，截图检查用
    const qpg = /page=(\w+)/.exec(location.hash), qday = /day=(\d{4}-\d\d-\d\d)/.exec(location.hash);
    if (qday) History.openDay(qday[1]); else if (qpg) showPage(qpg[1]);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawBoard);

    /* ================= 天气、落叶、灯泡、星星 ================= */
    let rainK = isl.rain ? 1 : 0;
    const RN = HIGH ? 1800 : 800, rainArr = new Float32Array(RN * 6), drops = [];
    for (let i = 0; i < RN; i++) drops.push([(rnd() - .5) * 30, rnd() * 16 - 2, (rnd() - .5) * 30, 9 + rnd() * 4]);
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(rainArr, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: col(0xc8d6ea), transparent: true, opacity: 0, depthWrite: false });
    const rainMesh = new THREE.LineSegments(rainGeo, rainMat); rainMesh.frustumCulled = false; rainMesh.raycast = () => {}; scene.add(rainMesh);
    const ripGeo = new THREE.RingGeometry(.05, .07, 24), ripples = [];
    for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(ripGeo, new THREE.MeshBasicMaterial({ color: col(0xdfe8f2), transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.raycast = () => {}; scene.add(m); ripples.push({ m, t: rnd() }); }
    const rippleSpots = [...cells.values()].filter(c => c.res !== "static" && c.res !== "deck");
    // 秋天的落叶：慢慢转着飘下来
    const leafGeo = cached("leaf", () => { const s = new THREE.Shape(); s.moveTo(0, -.05); s.quadraticCurveTo(.045, 0, 0, .05); s.quadraticCurveTo(-.045, 0, 0, -.05); return new THREE.ShapeGeometry(s, 6); });
    const LN = HIGH ? 110 : 45;
    const leafMesh = new THREE.InstancedMesh(leafGeo, own(TM({ color: 0xffffff, roughness: .7, side: THREE.DoubleSide })), LN);
    const leaves = [];
    for (let i = 0; i < LN; i++) { leaves.push({ x: (rnd() - .5) * 24, y: rnd() * 5, z: (rnd() - .5) * 24, vy: .25 + rnd() * .25, ph: rnd() * 6, sp: .8 + rnd() * 1.4 }); leafMesh.setColorAt(i, col([0xf2c14e, SEASON.accent, 0x82c06c][i % 3])); }
    leafMesh.castShadow = false; leafMesh.raycast = () => {}; leafMesh.frustumCulled = false; scene.add(leafMesh);
    function stepLeaves(dt, now) {
      const t = now / 1000;
      leaves.forEach((l, i) => {
        l.y -= l.vy * dt; l.x += Math.sin(t * .7 + l.ph) * .25 * dt + .08 * dt; l.z += Math.cos(t * .5 + l.ph) * .18 * dt;
        const c = cellAt(l.x, l.z), gy = c ? (c.res === "water" ? -.1 : c.h) : -2;
        if (l.y < gy + .02) { l.y = 3 + rnd() * 3; l.x = (rnd() - .5) * 24; l.z = (rnd() - .5) * 24; }
        tmpQ.setFromEuler(tmpE.set(t * l.sp + l.ph, t * l.sp * .7, Math.sin(t + l.ph)));
        leafMesh.setMatrixAt(i, tmpM.compose(tmpP.set(l.x, l.y, l.z), tmpQ, tmpS.set(1.4, 1.4, 1.4)));
      });
      leafMesh.instanceMatrix.needsUpdate = true;
    }
    const bulbM = own(TM({ color: col(0xb9a98c), emissive: col(0xffd89a), emissiveIntensity: 0 }));
    glows.push({ m: bulbM, base: 1.0, day: 0, phase: 0, breathe: .08 });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.032, 10, 8), bulbM, Math.max(1, bulbSpots.length));
    bulbSpots.forEach((p, i) => bulbs.setMatrixAt(i, tmpM.makeTranslation(p.x, p.y, p.z)));
    bulbs.castShadow = false; bulbs.raycast = () => {}; scene.add(bulbs);
    const sp = []; for (let i = 0; i < 400; i++) { const u = rnd(), a = rnd() * Math.PI * 2, r = 160; sp.push(Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r * .6 + 10, Math.sqrt(1 - u * u) * Math.sin(a) * r); }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    scene.add(new THREE.Points(starGeo, starMat));

    function stepWeather(dt) {
      rainK += ((isl.rain ? 1 : 0) - rainK) * Math.min(1, dt * 1.4);
      const on = rainK > .02;
      rainMat.opacity = rainK * .28; rainMesh.visible = on;
      puddles.forEach(p => p.material.opacity = rainK * .32);
      if (!on) { ripples.forEach(r => r.m.material.opacity = 0); return; }
      const spd = reduce ? .25 : 1;
      for (let i = 0; i < RN; i++) {
        const d = drops[i]; d[1] -= d[3] * dt * spd; if (d[1] < -2) d[1] = 14; const j = i * 6;
        rainArr[j] = d[0]; rainArr[j + 1] = d[1]; rainArr[j + 2] = d[2]; rainArr[j + 3] = d[0] + .04; rainArr[j + 4] = d[1] + .36; rainArr[j + 5] = d[2] + .02;
      }
      rainGeo.attributes.position.needsUpdate = true;
      ripples.forEach(r => {
        r.t += dt * 1.25;
        if (r.t > 1) { r.t = 0; const c = rippleSpots[Math.floor(Math.random() * rippleSpots.length)]; const x = c.x + (Math.random() - .5) * .9, z = c.z + (Math.random() - .5) * .9; r.m.position.set(x, c.res === "water" ? -.09 : c.h + bump(x, z) + .015, z); }
        r.m.scale.setScalar(1 + r.t * 3); r.m.material.opacity = (1 - r.t) * .35 * rainK;
      });
    }

    /* ================= 时间：傍晚到夜里最好看 ================= */
    let live = true, hours = 12;
    // [时刻, 天顶, 中间, 地平线]
    const KF = [
      [0, "#141d44", "#1d2a5c", "#2d3b6e"], [4.5, "#141d44", "#1d2a5c", "#2d3b6e"], [6, "#e9a487", "#c3a3b8", "#8fa8d6"],
      [8, "#79bde8", "#a9d4f2", "#d3ecfb"], [16, "#79bde8", "#a9d4f2", "#d3ecfb"], [17.6, "#e48a6c", "#b07c8f", "#6f6aa4"],
      [19.2, "#1a2350", "#28336a", "#3a4580"], [24, "#141d44", "#1d2a5c", "#2d3b6e"],
    ];
    const cA = new THREE.Color(), cB = new THREE.Color();
    const lerpHex = (a, b, f) => "#" + cA.set(a).lerp(cB.set(b), f).getHexString();
    function skyAt(t) { for (let i = 0; i < KF.length - 1; i++) { const a = KF[i], b = KF[i + 1]; if (t >= a[0] && t <= b[0]) { const f = (t - a[0]) / (b[0] - a[0] || 1); return [lerpHex(a[1], b[1], f), lerpHex(a[2], b[2], f), lerpHex(a[3], b[3], f)]; } } return KF[0].slice(1); }
    const PER = T("i3.periods");
    const period = t => PER[t < 5 ? 0 : t < 8 ? 1 : t < 11 ? 2 : t < 14 ? 3 : t < 17 ? 4 : t < 19 ? 5 : 6];
    $("i3-marks").innerHTML = T("i3.marks").map(m => "<span>" + esc(m) + "</span>").join("");
    let lampOn = 0;
    function applyTime(t, now) {
      const sa = (t - 6) / 12 * Math.PI, s = Math.sin(sa), day = clamp(s * 1.8 + .05, 0, 1) * (s > -.05 ? 1 : 0);
      const dusk = clamp(1 - Math.abs(t - 17.6) / 1.6, 0, 1) + clamp(1 - Math.abs(t - 6.4) / 1.2, 0, 1) * .7;
      let [tp, md, bt] = skyAt(t);
      if (rainK > .01) { tp = lerpHex(tp, "#232b3d", rainK * .45); md = lerpHex(md, "#38425a", rainK * .45); bt = lerpHex(bt, "#4a5268", rainK * .4); }
      paintSky(tp, md, bt);
      scene.fog.color.copy(col(bt));
      scene.fog.density = .0035 + rainK * .002; // 远处淡淡地柔化，近处保持清楚
      starMat.opacity = clamp(1 - day * 2, 0, 1) * (1 - rainK) * .8;
      if (s > 0) {
        sun.position.set(Math.cos(sa) * 24, Math.max(s, .3) * 32, 16);
        sun.color.copy(col(0xffffff)).lerp(col(0xffa66b), 1 - clamp(s * 2.2, 0, 1));
        sun.intensity = .3 + .45 * day + dusk * .35; // 傍晚的太阳暖一点、亮一点
      } else { sun.position.set(-12, 28, -16); sun.color.copy(col(0xa9b8ee)); sun.intensity = .5; } // 月光
      sun.intensity *= 1 - .4 * rainK;
      hemi.color.copy(col(0x9aa8dc)).lerp(col(0xffffff), day); hemi.groundColor.copy(col(0x4c5878)).lerp(col(0x5a6a4a), day);
      hemi.intensity = Math.max(.5, (.7 + .05 * day) * (1 - .1 * rainK)); // 夜里、雨天也看得清：环境光不低于 0.5
      const night = clamp(1 - day + rainK * .35, 0, 1);
      if (window.Chibi) Chibi.setBrightness(.74 + .26 * day); // 小人用自己的柔和着色，晚上跟着暗一点
      lampOn = clamp((night - .55) / .35, 0, 1);
      const tt = now / 1000;
      glows.forEach(g => {
        const br = 1 + Math.sin(tt * 1.3 + g.phase) * g.breathe;
        g.m.emissiveIntensity = (g.day + (1 - g.day) * lampOn) * g.base * (g.fire ? 1 : br);
      });
      glassMat.opacity = .16 + lampOn * .12;
      if (bloom) bloom.strength = lampOn * .35;
      const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
      $("i3-now").textContent = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); $("i3-period").textContent = period(t);
    }
    $("i3-time").oninput = e => { live = false; $("i3-live").classList.remove("is-on"); $("i3-live").textContent = T("i3.back"); hours = +e.target.value / 60; };
    $("i3-live").onclick = () => { live = true; $("i3-live").classList.add("is-on"); $("i3-live").textContent = T("i3.live"); };

    let tipSeen = false; try { tipSeen = !!localStorage.getItem("winslog-island3d-tip"); } catch (e) {}
    $("i3-tip").hidden = tipSeen;
    $("i3-tipok").onclick = () => { $("i3-tip").hidden = true; try { localStorage.setItem("winslog-island3d-tip", "1"); } catch (e) {} };

    /* ================= 每一帧 ================= */
    let last = performance.now(), lastMin = -1, lastDt = .016;
    function stepWalker(w, dt, speed, now, anim) {
      let moving = false;
      if (w.path.length) {
        const [tx, tz] = w.path[0], dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
        if (d < .04) { w.x = tx; w.z = tz; w.path.shift(); }
        else {
          const st = Math.min(d, speed * dt); w.x += dx / d * st; w.z += dz / d * st; moving = true;
          if (w.turns) { const want = Math.atan2(dx, dz); let diff = want - w.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); w.g.rotation.y += diff * Math.min(1, dt * 10); }
          else faceTo(w, dx, dz);
        }
      }
      const c = cellAt(w.x, w.z); const gh = (c ? c.h : 0) + bump(w.x, w.z);
      w.y += (gh - w.y) * Math.min(1, dt * 12);
      w.g.position.set(w.x, w.y, w.z);
      return moving;
    }
    function updateMe(now, moving) {
      if (moving) { if (me.state !== "walk") { me.state = "walk"; me.until = 0; me.after = null; } }
      else {
        if (me.state === "walk") me.state = "stand";
        if (me.onArrive) { const f = me.onArrive; me.onArrive = null; f(); }
        if (me.until && now > me.until) { const a = me.after; me.until = 0; me.after = null; me.state = "stand"; if (a) a(); }
      }
      if (me.sitAt) { me.g.position.copy(me.sitAt); if (me.sitRot != null) me.g.rotation.y = me.sitRot; }
      // 表情：完成任务时开心；深夜会犯困；被点到时可能大笑或吓一跳
      let expr = hours >= 22.5 || hours < 5 ? "sleepy" : "normal";
      if (me.state === "happy" || me.state === "wave") expr = "happy";
      if (me.expr && now < me.exprUntil) expr = me.expr; else me.expr = null;
      me.av.update({ state: me.state, expr, rain: rainK > .4, now, dt: lastDt });
    }
    // 黑猫：闲逛、坐下、伸懒腰，偶尔跟着小人走、过来蹭蹭
    function decideCat(now) {
      const dx = me.x - cat.x, dz = me.z - cat.z, d = Math.hypot(dx, dz), r = Math.random();
      cat.next = now + 2500 + Math.random() * 3500;
      if (!me.path.length && !me.sitAt && d < 2.3 && r < .45) { act(cat, "rub", 2600); return; }
      if (d > 4 && r < .5) {
        let best = null, bd = 99;
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = cells.get((Math.round(me.x) + ax) + "," + (Math.round(me.z) + az)); if (!walkable(n)) continue;
          const dd = Math.hypot(n.x - cat.x, n.z - cat.z); if (dd < bd) { bd = dd; best = n; }
        }
        const p = best && findPath(cat.x, cat.z, best.x, best.z); if (p && p.length) { cat.path = p.slice(0, 14); return; }
      }
      if (r < .62) {
        const n = cells.get((Math.round(cat.x) + Math.round(Math.random() * 2 - 1)) + "," + (Math.round(cat.z) + Math.round(Math.random() * 2 - 1)));
        const from = cellAt(cat.x, cat.z); if (walkable(n) && from && canStep(from, n)) { cat.path = [[n.x, n.z]]; return; }
      }
      if (r < .82) { act(cat, "stretch", 1700, () => act(cat, "sit", 2500)); return; }
      act(cat, "sit", 3000);
    }
    function updateCat(now, moving, dt) {
      if (moving) { cat.state = "walk"; cat.until = 0; cat.after = null; }
      else {
        if (cat.state === "walk") cat.state = "sit";
        if (cat.until && now > cat.until) { const a = cat.after; cat.until = 0; cat.after = null; cat.state = "sit"; if (a) a(); }
        if (now > cat.next && !cat.until) decideCat(now);
      }
      if (cat.state === "rub") { // 走到小人脚边蹭一蹭
        const dx = me.g.position.x - cat.x, dz = me.g.position.z - cat.z, d = Math.hypot(dx, dz);
        if (d > .45) { const st = Math.min(d - .45, .9 * dt); cat.x += dx / d * st; cat.z += dz / d * st; cat.g.position.x = cat.x; cat.g.position.z = cat.z; }
        faceTo(cat, dx, dz);
      }
      const fr = cat.state === "walk" ? "walk" + (1 + Math.floor(now / 140) % 3) : cat.state;
      setFrame(cat, fr);
      cat.gm.opacity = .3 + lampOn * .7; // 琥珀色的眼睛，晚上更亮一点
    }
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(.05, (now - last) / 1000); last = now; lastDt = dt;
      if (view.hidden) return;
      stepFly(now);
      if (live) { const d = new Date(); hours = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; const m = d.getHours() * 60 + d.getMinutes(); if (m !== lastMin) { lastMin = m; $("i3-time").value = m; } }
      stepWeather(dt);
      applyTime(hours, now);
      const tt = now / 1000;
      wind.value = reduce ? 0 : tt;
      lights.forEach(L => { const f = L.flicker && !reduce ? 1 + Math.sin(tt * 9 + L.phase) * .05 + Math.sin(tt * 23 + L.phase) * .04 : 1; L.l.intensity = lampOn * L.base * f; });
      if (!reduce) {
        sways.forEach(s => { s.o.rotation.z = Math.sin(tt * .9 + s.ph) * s.k; s.o.rotation.x = Math.sin(tt * .7 + s.ph * 1.3) * s.k * .6; });
        flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(tt * 11 + i * 2) * .15; f.scale.x = f.scale.z = 1 + Math.sin(tt * 7 + i) * .08; });
        waterNormal.offset.set(tt * .012, tt * .008);
      }
      leafMesh.visible = rainK < .9;
      if (leafMesh.visible) stepLeaves(dt, now);
      // 烟囱的烟
      chim.getWorldPosition(smokeTop); smokeTop.y = eaveY + RISE + .72;
      smoke.forEach(p => {
        p.t += dt * .09; if (p.t > 1) { p.t -= 1; p.seed = Math.random(); }
        const k = p.t; p.sp.position.set(smokeTop.x + Math.sin(k * 3 + p.seed * 6) * .12 + k * .5, smokeTop.y + k * 2.4, smokeTop.z + k * .25);
        p.sp.scale.setScalar(.22 + k * .9); p.sp.material.opacity = Math.sin(Math.PI * Math.min(1, k * 1.2)) * .32 * (1 - rainK * .5);
      });
      updateMe(now, stepWalker(me, dt, 2.2, now));
      updateCat(now, stepWalker(cat, dt, 1.1, now), dt);
      const tint = 1 - lampOn * .22; // 立牌不受灯光影响，晚上整体稍微暗一点
      cat.card.rotation.y = Math.atan2(cam.position.x - cat.g.position.x, cam.position.z - cat.g.position.z); cat.m.color.setScalar(tint);
      for (let i = grows.length - 1; i >= 0; i--) { const g = grows[i], k = Math.min(1, (now - g.t0) / 900), e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); g.g.scale.setScalar(Math.max(.01, e)); if (k >= 1) { g.g.scale.setScalar(1); grows.splice(i, 1); } }
      for (let i = bounces.length - 1; i >= 0; i--) { const b = bounces[i], k = (now - b.t0) / 350; if (k >= 1) { b.o.scale.copy(b.s); bounces.splice(i, 1); } else { const q = 1 + Math.sin(k * Math.PI) * .07; b.o.scale.set(b.s.x / q, b.s.y * q, b.s.z / q); } }
      if (bubbleAt) { if (now > bubbleT) { bubble.classList.remove("is-on"); bubbleAt = null; } else { const v = bubbleAt.clone().project(cam); bubble.style.left = ((v.x + 1) / 2 * VW) + "px"; bubble.style.top = ((1 - v.y) / 2 * VH) + "px"; } }
      if (composer) composer.render(); else renderer.render(scene, cam);
    }
    me.g.position.set(me.x, 0, me.z); cat.g.position.set(cat.x, 0, cat.z);
    const qa = /area=(\w+)/.exec(location.hash), qt = /time=([\d.]+)/.exec(location.hash);
    if (qa && AREAS[qa[1]]) { const a = AREAS[qa[1]]; tgt.set(a.t[0], a.t[1], a.t[2]); dist = a.d; phi = a.phi; }
    if (qa && qa[1] === "me") { tgt.set(me.x, .55, me.z); dist = 3.2; phi = .2; theta = 0; } // #area=me：拉近看小人（正面）
    const qth = /theta=(-?[\d.]+)/.exec(location.hash); if (qth) theta = +qth[1];
    if (/walk/.test(location.hash)) { me.path = [[-7, 3], [-6, 3], [-5, 3], [-4, 3], [-3, 3], [-3, 4], [-3, 5], [-3, 6], [-3, 7], [-3, 8]]; }
    const freeze = h => { live = false; hours = clamp(h, 0, 23.99); $("i3-time").value = Math.round(hours * 60); $("i3-live").classList.remove("is-on"); $("i3-live").textContent = T("i3.back"); };
    if (qt) freeze(+qt[1]);
    else { const h = new Date().getHours(); if (h >= 21 || h < 5) freeze(18.5); } // 深夜打开时先显示傍晚 18:30，想看现在点「回到现在」
    resize();
    new MutationObserver(() => { if (!view.hidden) resize(); }).observe(view, { attributes: true, attributeFilter: ["hidden"] });
    requestAnimationFrame(loop);
    camInfo = () => ({ x: +tgt.x.toFixed(2), y: +tgt.y.toFixed(2), z: +tgt.z.toFixed(2), dist: +dist.toFixed(2), theta: +theta.toFixed(2), phi: +phi.toFixed(2), quality: Q, lights: lights.length, me: me.state + (me.sitAt ? "@bench" : ""), meFace: me.face, cat: cat.state });
  }

  let camInfo = () => null;
  return { init: init, camInfo: () => camInfo() };
})();

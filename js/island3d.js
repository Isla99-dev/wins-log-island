/*
 * 我的小岛（3D）
 * 三渲二卡通着色 + 轮廓线 + 微缩模型感 + 雨夜暖光（three.js r128，放在 lib/）
 *
 * - 完成一件事（来自「今日任务」或小助手）→ 岛上种一棵树，+10 金币
 * - 金币在商店买东西，点空草地放下
 * - 撤回完成 → 那棵树也收回去
 * 数据都在 Store 里（Store.island()、Store.coins()），这里只负责画和交互。
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
    { id: "bench", price: 40 },
    { id: "lamp", price: 60 },
  ];
  const PRICE = {}; SHOP.forEach(s => PRICE[s.id] = s.price);
  const itemName = id => T("i3.item." + id);

  let started = false;
  function init() {
    if (started || !window.THREE) return;
    started = true;
    Store.importIsland3d(PRICE);
    build();
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
    function mesh(geo, mat, x, y, z, p, line) { const m = new THREE.Mesh(geo, typeof mat === "number" ? toon(mat) : mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (p || scene).add(m); if (line !== false) outline(m, typeof line === "number" ? line : 25); return m; }
    const B = (w, h, d, c, x, y, z, p, line) => mesh(boxGeo(w, h, d), c, x, y, z, p, line);
    const C = (rt, rb, h, seg, c, x, y, z, p, line) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, p, line);
    const S = (r, c, x, y, z, p, det, line) => mesh(new THREE.IcosahedronGeometry(r, det == null ? 1 : det), c, x, y, z, p, line == null ? false : line);
    const glow = (c, i) => toon(c, { emissive: c, emissiveIntensity: i == null ? 1 : i });
    const basic = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));

    /* ================= renderer / sky ================= */
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const skyC = document.createElement("canvas"); skyC.width = 2; skyC.height = 256;
    const skyG = skyC.getContext("2d"), skyTex = new THREE.CanvasTexture(skyC);
    scene.background = skyTex; scene.fog = new THREE.Fog(0x1a2238, 34, 70);
    let skyKey = "";
    function paintSky(top, bot) { const k = top + bot; if (k === skyKey) return; skyKey = k; const g = skyG.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, top); g.addColorStop(1, bot); skyG.fillStyle = g; skyG.fillRect(0, 0, 2, 256); skyTex.needsUpdate = true; scene.fog.color.set(bot); }
    const cam = new THREE.PerspectiveCamera(28, 1, .1, 300);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x4e5a46, .6); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, .9);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 }); sun.shadow.bias = -.0008;
    scene.add(sun); scene.add(sun.target);

    /* ================= the square base ================= */
    const N = 5; // cells -5..5
    const cells = new Map();
    for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) cells.set(x + "," + z, { x, z, res: null, occ: null });
    const ck = (x, z) => Math.round(x) + "," + Math.round(z);
    const reserve = (x, z, r) => { const c = cells.get(x + "," + z); if (c) c.res = r; };

    const ground = B(11.6, .3, 11.6, 0x86b86a, 0, -.15, 0);
    B(11.6, 1.3, 11.6, 0x8b6a4e, 0, -.95, 0);
    B(11.9, .28, 11.9, 0x4f5566, 0, -1.74, 0);
    B(11.9, .04, .08, 0x6d5240, 0, -.62, 5.82, null, false); B(.08, .04, 11.9, 0x6d5240, 5.82, -.62, 0, null, false);
    B(11.9, .04, .08, 0x6d5240, 0, -.62, -5.82, null, false); B(.08, .04, 11.9, 0x6d5240, -5.82, -.62, 0, null, false);

    /* ---------- the cabin ---------- */
    const lightsNight = [], flick = [];
    const house = new THREE.Group(); house.position.set(-1.5, 0, -1.6); scene.add(house);
    for (let x = -3; x <= 0; x++) for (let z = -3; z <= -1; z++) reserve(x, z, "static");
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
    // --- interior ---
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
    C(.12, .09, .2, 12, 0xc0704f, 1.05, .25, 1.0, house);
    S(.2, 0x5e9f55, 1.05, .48, 1.0, house, 0); S(.14, 0x6fae5c, .98, .6, .95, house, 0);
    B(.5, .36, .02, 0xf2c14e, -.3, 1.15, -1.17, house, false); B(.3, .12, .021, 0xe0795a, -.3, 1.2, -1.165, house, false);
    C(.005, .005, .3, 4, 0x222222, .2, 1.53, -.1, house, false);
    C(.06, .2, .16, 12, glow(0xffd28a, .5), .2, 1.33, -.1, house);
    const room = new THREE.PointLight(0xffbf73, 0, 4, 2); room.position.set(.2, 1.15, 0); house.add(room); lightsNight.push([room, 1.1]);
    const spill = new THREE.PointLight(0xffb866, 0, 2.4, 2); spill.position.set(.3, .9, 2.1); house.add(spill); lightsNight.push([spill, .45]);
    const bulbMat = basic(0xffd89a);
    for (let i = 0; i < 8; i++) { const t = i / 7; const b = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), bulbMat); b.position.set(-.1 + t * 1.3, 1.33 - Math.sin(t * Math.PI) * .07, 1.16); house.add(b); }
    C(.22, .2, .45, 12, 0x6b7d8e, -3.25, .23, -3.25, scene);
    reserve(-3, 0, "static");
    C(.12, .12, .36, 12, 0x5b6b80, -3.05, .18, .05);
    for (const [c, a] of [[0x7fc4d8, .18], [0xe0795a, -.12]]) { const u = C(.015, .015, .72, 6, c, -3.05 + a * .4, .42, .05, scene, false); u.rotation.z = a; }

    /* ---------- path, pond, props ---------- */
    const PATH = [[-2, 0], [-2, 1], [-1, 2], [0, 3], [0, 4], [0, 5], [-1, 0]];
    PATH.forEach(([x, z]) => { reserve(x, z, "path"); const s = C(.32, .34, .05, 10, 0xb9b8b0, x + (rnd() - .5) * .15, .025, z + (rnd() - .5) * .15, scene, 40); s.rotation.y = rnd(); });
    const PX = 2.6, PZ = 2.2;
    for (const c of cells.values()) if (Math.hypot(c.x - PX, c.z - PZ) < 1.6) c.res = "pond";
    const waterMat = toon(0x4f8fc0, { transparent: true, opacity: .92 });
    mesh(new THREE.CylinderGeometry(1.36, 1.36, .04, 32), waterMat, PX, .012, PZ, scene, false).castShadow = false;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const s = S(.17 + rnd() * .06, 0x9aa0a8, PX + Math.cos(a) * 1.45, .06, PZ + Math.sin(a) * 1.45, scene, 0, 40); s.scale.y = .6; s.rotation.y = rnd() * 3; }
    for (const [dx, dz] of [[-.4, .3], [.5, -.4], [.1, .7], [-.6, -.5]]) { const p = C(.17, .17, .012, 12, 0x5e9f55, PX + dx, .04, PZ + dz, scene, false); p.rotation.y = rnd() * 6; }
    S(.05, 0xff9fb2, PX - .4, .08, PZ + .3, scene, 1);
    for (let i = 0; i < 7; i++) { const r = B(.03, .4 + rnd() * .3, .03, 0x6f9a4f, PX + 1.0 + rnd() * .3, .25, PZ - .9 + rnd() * .5, scene, false); r.rotation.z = (rnd() - .5) * .3; }
    reserve(1, 0, "static");
    B(.07, .7, .07, 0x7a5236, .9, .35, .1); B(.3, .22, .2, 0xd9503f, .9, .8, .1); B(.03, .16, .03, 0xf2c14e, 1.07, .9, .1, null, false);
    reserve(1, -1, "static");
    const bike = new THREE.Group(); bike.position.set(.85, 0, -1.25); bike.rotation.y = -.35; scene.add(bike);
    for (const x of [-.33, .33]) { const w = new THREE.Mesh(new THREE.TorusGeometry(.2, .022, 6, 20), toon(0x2b3140)); w.position.set(x, .21, 0); w.castShadow = true; bike.add(w); C(.02, .02, .04, 6, 0x9aa0aa, x, .21, 0, bike, false).rotation.x = Math.PI / 2; }
    const fr = (l, x, y, a) => { const b = B(l, .03, .03, 0x4f8fc0, x, y, 0, bike, false); b.rotation.z = a; };
    fr(.46, -.08, .36, -.5); fr(.42, .12, .43, 0); fr(.38, -.16, .27, .75); fr(.3, .25, .3, 1.1);
    B(.14, .04, .07, 0x2b3140, -.12, .56, 0, bike, false); B(.03, .03, .26, 0x2b3140, .3, .56, 0, bike, false);
    B(.18, .1, .16, 0x8b5e3c, .36, .5, 0, bike, false);
    reserve(-1, 3, "static");
    C(.04, .05, 1.4, 8, 0x3d4552, -1, .7, 3);
    const lantern = B(.2, .26, .2, glow(0xffd391, 0), -1, 1.5, 3); B(.28, .05, .28, 0x2b3140, -1, 1.66, 3);
    const gl = new THREE.PointLight(0xffc46b, 0, 2.8, 2); gl.position.set(-1, 1.35, 3); scene.add(gl);
    lightsNight.push([gl, .7]); flick.push({ l: gl, m: lantern.material, base: .7 });
    reserve(-4, 1, "static");
    const board = new THREE.Group(); board.position.set(-4.2, 0, 1); board.rotation.y = .35; scene.add(board);
    B(.06, 1.15, .06, 0x7a5236, -.42, .57, 0, board); B(.06, 1.15, .06, 0x7a5236, .42, .57, 0, board);
    B(.95, .64, .06, 0x8b5e3c, 0, .95, 0, board); B(1.05, .06, .18, 0x41607f, 0, 1.3, 0, board);
    const bC = document.createElement("canvas"); bC.width = 320; bC.height = 200; const bTex = new THREE.CanvasTexture(bC);
    const paper = mesh(new THREE.PlaneGeometry(.84, .52), basic(0xffffff, { map: bTex }), 0, .95, .035, board, false); paper.castShadow = false;
    reserve(5, -5, "static");
    C(.07, .09, 3.8, 8, 0x8a8f99, 4.9, 1.9, -4.9); B(1.0, .07, .07, 0x6d727c, 4.9, 3.45, -4.9);
    C(.15, .15, .42, 12, 0x9aa0aa, 5.07, 2.85, -4.72);
    for (const x of [4.5, 4.9, 5.3]) C(.03, .04, .1, 6, 0xe8e2d4, x, 3.53, -4.9, scene, false);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x151a28 });
    function wire(a, b, sag) { const m = a.clone().add(b).multiplyScalar(.5); m.y -= sag; const c = new THREE.QuadraticBezierCurve3(a, m, b); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(30)), wireMat); l.raycast = () => {}; scene.add(l); }
    wire(new THREE.Vector3(4.5, 3.56, -4.9), new THREE.Vector3(.05, 2.62, -1.6), .45);
    wire(new THREE.Vector3(5.3, 3.56, -4.9), new THREE.Vector3(9, 3.4, 1.5), .5);
    wire(new THREE.Vector3(4.9, 3.56, -4.9), new THREE.Vector3(-8, 3.3, -5.2), .6);
    for (let x = -5.6; x <= 1.7; x += .73) B(.08, .55, .08, 0xece6d8, x, .27, -5.62);
    B(7.4, .05, .04, 0xece6d8, -1.95, .42, -5.62); B(7.4, .05, .04, 0xece6d8, -1.95, .2, -5.62);
    function bush(x, z, s, p) { S(.32 * s, 0x5e9f55, x, .22 * s, z, p, 0); S(.25 * s, 0x6fae5c, x + .22 * s, .18 * s, z + .1 * s, p, 0); S(.22 * s, 0x4f8f48, x - .2 * s, .16 * s, z - .08 * s, p, 0); }
    for (const [x, z] of [[-5, -1], [5, 0], [-5, 5], [5, 5]]) { reserve(x, z, "static"); bush(x, z, 1.1); }
    const tuftG = new THREE.ConeGeometry(.04, .16, 4);
    for (let i = 0; i < 90; i++) { const x = (rnd() - .5) * 11, z = (rnd() - .5) * 11; const c = cells.get(ck(x, z)); if (!c || c.res) continue; const t = new THREE.Mesh(tuftG, toon(i % 2 ? 0x6fa75a : 0x7fb869)); t.position.set(x, .08, z); t.raycast = () => {}; scene.add(t); }

    const puddles = [];
    for (const [x, z, sx, sz] of [[-2.0, .9, .75, .4], [.2, 2.2, .5, .3], [-3.6, 3.1, .6, .35], [1.6, -.2, .4, .25]]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), basic(0x9fbbe0, { transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); m.position.set(x, .008, z); m.raycast = () => {}; scene.add(m); puddles.push(m);
    }

    /* ================= placeable things ================= */
    const BUILD = {
      tree(g) { C(.06, .09, .6, 8, 0x7a5236, 0, .3, 0, g); S(.42, 0x6fae5c, 0, .85, 0, g); S(.32, 0x82c06c, .18, 1.12, .05, g); S(.28, 0x5e9f55, -.16, 1.04, -.12, g); },
      flowers(g) { [[0xff8fa3, -.18, -.1], [0xffd45c, .12, .12], [0xf6f6ff, -.02, .22], [0xb592e0, .2, -.16], [0xff8fa3, .02, -.02]].forEach(([c, x, z]) => { B(.02, .22, .02, 0x4f8f48, x, .11, z, g, false); S(.06, c, x, .24, z, g, 0); }); },
      bush(g) { bush(0, 0, .9, g); },
      bench(g) { B(.82, .06, .3, 0xa0703f, 0, .32, 0, g); B(.82, .2, .04, 0xa0703f, 0, .5, -.14, g); for (const x of [-.34, .34]) { B(.05, .32, .05, 0x3d4552, x, .16, .1, g, false); B(.05, .5, .05, 0x3d4552, x, .25, -.12, g, false); } },
      lamp(g) { C(.035, .045, 1.2, 8, 0x3d4552, 0, .6, 0, g); const b = B(.18, .22, .18, glow(0xffd391, 0), 0, 1.3, 0, g); B(.24, .05, .24, 0x2b3140, 0, 1.44, 0, g); const l = new THREE.PointLight(0xffc46b, 0, 2.6, 2); l.position.y = 1.2; g.add(l); lightsNight.push([l, .6]); flick.push({ l, m: b.material, base: .6 }); },
    };

    /* ================= state ================= */
    const pickables = [house, board, ground];
    house.userData.what = "house"; board.userData.what = "board"; ground.userData.what = "ground";
    const grows = [], bounces = [];
    const treeOf = new Map(); // taskId -> group
    function placeAt(o, key, anim) {
      const c = cells.get(key); if (!c || c.res || c.occ) return null;
      const g = new THREE.Group(); BUILD[o.type](g); g.position.set(c.x, 0, c.z); g.rotation.y = o.rot || 0; g.userData.obj = o;
      scene.add(g); c.occ = o; o.g = g; o.cell = c; pickables.push(g);
      if (anim) { g.scale.setScalar(.01); grows.push({ g, t0: performance.now() }); }
      return g;
    }
    function unplace(o) {
      if (!o.g) return;
      scene.remove(o.g); const i = pickables.indexOf(o.g); if (i >= 0) pickables.splice(i, 1);
      if (o.cell) o.cell.occ = null; o.g = null; o.cell = null;
    }
    let me = null; // 小人（下面创建）
    const shopObjs = [];
    isl.objs.forEach(o => {
      if (!BUILD[o.type]) return;
      const v = { type: o.type, rot: o.rot, date: o.date, saved: o };
      let key = o.x + "," + o.z;
      if (!canPlace(cells.get(key))) { const f = freeCell(o.type + o.date + o.x); if (!f) return; key = f.x + "," + f.z; o.x = f.x; o.z = f.z; }
      if (placeAt(v, key, false)) shopObjs.push(v);
    });

    // 每件完成的事一棵树；位置记在 isl.trees 里，撤回再完成还会长在原地
    function plantTree(task, anim) {
      if (treeOf.has(task.id)) return treeOf.get(task.id);
      let key = isl.trees[task.id];
      if (!key || !canPlace(cells.get(key))) {
        const c = freeCell(task.id); if (!c) return null;
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
      return { g, legL, legR, umb, x: 0, z: 2, path: [] };
    }
    me = makePerson();
    function makeCat() {
      const g = new THREE.Group(); scene.add(g); const O = 0xf0a050;
      B(.28, .14, .13, O, 0, .17, 0, g); B(.15, .13, .13, O, 0, .27, .16, g);
      mesh(new THREE.ConeGeometry(.03, .06, 4), O, -.04, .36, .16, g, false); mesh(new THREE.ConeGeometry(.03, .06, 4), O, .04, .36, .16, g, false);
      for (const [x, z] of [[-.08, -.04], [.08, -.04], [-.08, .05], [.08, .05]]) B(.04, .1, .04, O, x, .05, z, g, false);
      const tail = B(.03, .2, .03, O, 0, .27, -.12, g, false); tail.rotation.x = -.5;
      g.rotation.y = Math.PI / 2; g.userData.who = "cat"; pickables.push(g);
      return { g, x: -2, z: 0, path: [], next: 0 };
    }
    const cat = makeCat();

    function walkable(c) { return c && c.res !== "static" && c.res !== "pond" && !(c.occ && c.occ.type !== "flowers"); }
    function findPath(fx, fz, tx, tz) {
      const start = ck(fx, fz), goal = tx + "," + tz; if (start === goal) return [];
      const prev = new Map([[start, null]]), q = [start];
      while (q.length) {
        const k = q.shift(); if (k === goal) break; const [x, z] = k.split(",").map(Number);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = (x + dx) + "," + (z + dz); if (prev.has(nk)) continue; const c = cells.get(nk); if (!c) continue; if (!walkable(c) && nk !== goal) continue; prev.set(nk, k); q.push(nk); }
      }
      if (!prev.has(goal)) return null;
      const out = []; for (let k = goal; k && k !== start; k = prev.get(k)) out.unshift(k.split(",").map(Number)); return out;
    }
    function goTo(x, z, near) {
      let c = cells.get(x + "," + z);
      if (near || !walkable(c)) { let best = null, bd = 99; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const n = cells.get((x + dx) + "," + (z + dz)); if (walkable(n)) { const d = Math.hypot(n.x - me.x, n.z - me.z); if (d < bd) { bd = d; best = n; } } } c = best; }
      if (!c) return; const p = findPath(me.x, me.z, c.x, c.z); if (p) me.path = p;
    }

    /* ================= camera + input ================= */
    let W = 1, H = 1, theta = Math.PI / 4, phi = .62, dist = 30;
    const panel = $("i3-panel");
    function updateCam() {
      const a = W / H, d = dist * Math.max(1, 1.05 / a);
      cam.aspect = a;
      cam.position.set(Math.sin(theta) * Math.cos(phi) * d, Math.sin(phi) * d, Math.cos(theta) * Math.cos(phi) * d);
      cam.lookAt(0, -.3, 0);
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

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
    function aim(e) { const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, cam); }
    function groundCell() { if (!ray.ray.intersectPlane(groundPlane, hitP)) return null; return cells.get(ck(hitP.x, hitP.z)) || null; }
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
      if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; dist = clamp(dist0 * pinch0 / Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), 14, 46); updateCam(); return; }
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) { dragging = true; cv.classList.add("is-drag"); }
      if (dragging) { theta -= (e.clientX - prev.x) * .007; phi = clamp(phi + (e.clientY - prev.y) * .005, .22, 1.25); updateCam(); }
      if (placing) hover(e);
    });
    cv.addEventListener("pointerup", e => { const wasClick = downAt && !dragging && ptrs.size === 1; ptrs.delete(e.pointerId); cv.classList.remove("is-drag"); if (wasClick) click(e); if (!ptrs.size) { downAt = null; dragging = false; } });
    cv.addEventListener("pointercancel", e => ptrs.delete(e.pointerId));
    cv.addEventListener("wheel", e => { e.preventDefault(); dist = clamp(dist * (1 + e.deltaY * .0012), 14, 46); updateCam(); }, { passive: false });
    $("i3-rotl").onclick = () => { theta += Math.PI / 4; updateCam(); };
    $("i3-rotr").onclick = () => { theta -= Math.PI / 4; updateCam(); };
    $("i3-zin").onclick = () => { dist = clamp(dist / 1.2, 14, 46); updateCam(); };
    $("i3-zout").onclick = () => { dist = clamp(dist * 1.2, 14, 46); updateCam(); };
    function setRain(v) { isl.rain = v; $("i3-rain").textContent = T(v ? "i3.rainOff" : "i3.rainOn"); $("i3-rain").setAttribute("aria-pressed", v); Store.save(); }
    $("i3-rain").onclick = () => setRain(!isl.rain); setRain(isl.rain);
    function bare(v) { view.classList.toggle("is-bare", v); document.body.classList.toggle("is-bare", v); updateCam(); }
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
    function canPlace(c) { return !!c && !c.res && !c.occ && (!me || ck(me.x, me.z) !== c.x + "," + c.z); }
    function freeCell(seed) {
      const l = [...cells.values()].filter(canPlace); if (!l.length) return null;
      return l[hash(seed) % l.length];
    }
    function hover(e) { aim(e); const c = groundCell(); if (!c) { hl.visible = false; return; } hl.visible = true; hl.position.set(c.x, .03, c.z); hl.material.color.setHex(canPlace(c) ? 0x7cff7c : 0xff6b6b); }
    function startPlacing(item) {
      placing = item; cv.classList.add("is-place");
      $("i3-ptext").textContent = T("i3.placeHint", { name: itemName(item.id) }); $("i3-placing").hidden = false;
    }
    function stopPlacing() { placing = null; hl.visible = false; cv.classList.remove("is-place"); $("i3-placing").hidden = true; }
    $("i3-pcancel").onclick = stopPlacing;

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    function click(e) {
      aim(e);
      if (placing) {
        const c = groundCell(); if (!c) return;
        if (!canPlace(c)) { say(V(c.x, .4, c.z), T("i3.cantPlace")); return; }
        if (Store.coins() < placing.price) { stopPlacing(); return; }
        const saved = { type: placing.id, x: c.x, z: c.z, rot: Math.round(theta / (Math.PI / 2)) * Math.PI / 2, date: Store.dayKey() };
        const v = { type: saved.type, rot: saved.rot, date: saved.date, saved };
        if (placeAt(v, c.x + "," + c.z, true)) {
          isl.objs.push(saved); isl.spent += placing.price; shopObjs.push(v); Store.save(); refresh();
          if (window.Sound) Sound.play("grow");
          say(V(c.x, 1.2, c.z), T("i3.placed"));
        }
        stopPlacing(); return;
      }
      const hs = ray.intersectObjects(pickables, true); if (!hs.length) return;
      const own = owner(hs[0].object); if (!own) return;
      const lines = T("i3.lines");
      if (own.userData.who === "me") { bounce(me.g); say(me.g.position.clone().add(V(0, 1.1, 0)), lines[Math.floor(Math.random() * lines.length)]); return; }
      if (own.userData.who === "cat") { bounce(cat.g); say(cat.g.position.clone().add(V(0, .5, 0)), T("i3.meow")); return; }
      if (own.userData.what === "house") { bounce(house); say(V(-1.5, 3.1, -1.6), T("i3.house")); return; }
      if (own.userData.what === "board") { const d = Store.winsOf(); say(V(-4.2, 1.6, 1), d.length ? T("i3.boardDone", { list: d.map(t => t.text).join(T("i3.sep")) }) : T("i3.boardNone")); return; }
      if (own.userData.obj) {
        const o = own.userData.obj; bounce(own); const top = own.position.clone().add(V(0, o.type === "tree" ? 1.6 : o.type === "lamp" ? 1.7 : .8, 0));
        if (o.type === "tree") say(top, T("i3.treeLabel", { text: o.label, date: fmtDate(o.date) }));
        else if (o.type === "bench") { goTo(o.cell.x, o.cell.z, true); say(top, T("i3.sit")); }
        else say(top, itemName(o.type));
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
        if (g) { const c = g.userData.obj.cell; goTo(c.x, c.z, true); setTimeout(() => say(V(c.x, 1.7, c.z), T("i3.planted", { text: t.text })), 350); }
        else say(me.g.position.clone().add(V(0, 1.1, 0)), T("i3.full"));
      } else if (d.type === "undo" || d.type === "remove") removeTree(d.id);
      refresh();
    });

    showPage("tasks");
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawBoard);

    /* ================= weather ================= */
    let rainK = isl.rain ? 1 : 0;
    const RN = 1100, rainArr = new Float32Array(RN * 6), drops = [];
    for (let i = 0; i < RN; i++) drops.push([(rnd() - .5) * 15, rnd() * 12 - 2, (rnd() - .5) * 15, 9 + rnd() * 4]);
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(rainArr, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false });
    const rainMesh = new THREE.LineSegments(rainGeo, rainMat); rainMesh.frustumCulled = false; rainMesh.raycast = () => {}; scene.add(rainMesh);
    const ripGeo = new THREE.RingGeometry(.06, .085, 20), ripples = [];
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(ripGeo, basic(0xe2efff, { transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.raycast = () => {}; scene.add(m); ripples.push({ m, t: rnd(), f: false }); }
    const rippleSpots = [...cells.values()].filter(c => c.res !== "static");
    function ripAt(x, y, z) { const r = ripples.find(r => r.t > .8) || ripples[0]; r.t = 0; r.f = true; r.m.position.set(x, y, z); }
    const dripMat = basic(0xdfeeff, { transparent: true, opacity: .8 }), drips = [];
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.022, 6, 4), dripMat); m.scale.y = 1.8; m.raycast = () => {}; scene.add(m); drips.push({ m, x: -2.85 + i * .34 + (rnd() - .5) * .08, y: 1.55, v: 0, wait: rnd() * 2 }); }
    const streakMat = basic(0xeaf4ff, { transparent: true, opacity: 0, depthWrite: false }), streaks = [];
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.012, .11), streakMat); m.raycast = () => {}; house.add(m); streaks.push({ m, x: -.15 + rnd() * 1.4, y: .45 + rnd() * .9, v: .05 + rnd() * .12 }); }
    const sp = []; for (let i = 0; i < 320; i++) { const u = rnd(), a = rnd() * Math.PI * 2, r = 80; sp.push(Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r * .6 + 6, Math.sqrt(1 - u * u) * Math.sin(a) * r); }
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
        const d = drops[i]; d[1] -= d[3] * dt * spd; if (d[1] < -2) d[1] = 10; const j = i * 6;
        rainArr[j] = d[0]; rainArr[j + 1] = d[1]; rainArr[j + 2] = d[2]; rainArr[j + 3] = d[0] + .05; rainArr[j + 4] = d[1] + .42; rainArr[j + 5] = d[2] + .02;
      }
      rainGeo.attributes.position.needsUpdate = true;
      ripples.forEach(r => {
        r.t += dt * 1.25;
        if (r.t > 1) { r.t = 0; r.f = false; const c = rippleSpots[Math.floor(Math.random() * rippleSpots.length)]; r.m.position.set(c.x + (Math.random() - .5) * .9, c.res === "pond" ? .04 : .012, c.z + (Math.random() - .5) * .9); }
        r.m.scale.setScalar(1 + r.t * 3.2); r.m.material.opacity = (1 - r.t) * .6 * rainK;
      });
      drips.forEach(d => {
        d.m.visible = true; if (d.wait > 0) { d.wait -= dt; d.m.visible = false; return; } d.v += 9.8 * dt * spd; d.y -= d.v * dt;
        if (d.y <= 0) { ripAt(d.x, .012, .32); d.y = 1.55; d.v = 0; d.wait = .6 + Math.random() * 2.2; } d.m.position.set(d.x, d.y, .32);
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
      let [top, bot] = skyAt(t);
      if (rainK > .01) { top = lerpHex(top, "#1c2333", rainK * .6); bot = lerpHex(bot, "#2f3a52", rainK * .6); }
      paintSky(top, bot);
      starMat.opacity = clamp(1 - day * 1.6, 0, 1) * (1 - rainK);
      if (s > 0) { sun.position.set(Math.cos(sa) * 12, Math.max(s, .3) * 16, 8); const warm = 1 - clamp(s * 2.2, 0, 1); sun.color.set(0xffffff).lerp(cB.set(0xffa66b), warm); sun.intensity = .3 + .45 * day; }
      else { sun.position.set(-6, 14, -8); sun.color.set(0x8ea2e8); sun.intensity = .38; }
      sun.intensity *= 1 - .5 * rainK;
      hemi.color.set(0x3e4c80).lerp(cB.set(0xffffff), day); hemi.groundColor.set(0x2a3040).lerp(cB.set(0x5a6a4a), day);
      hemi.intensity = (.5 + .2 * day) * (1 - .15 * rainK);
      const night = clamp(1 - day + rainK * .35, 0, 1); lampOn = clamp((night - .55) / .35, 0, 1);
      glassMat.color.set(0xcfe6ff).lerp(cB.set(0xffd9a0), lampOn); glassMat.opacity = .12 + lampOn * .06;
      puddles.forEach((p, i) => p.material.color.set(0x9fbbe0).lerp(cB.set(i === 0 ? 0xffc27a : 0xb7c6e8), lampOn * .6));
      [doorWin, sideWin].forEach(m => m.material.emissiveIntensity = lampOn * .55);
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
      const sw = moving && !reduce ? Math.sin(now * .016) : 0;
      w.g.position.set(w.x, moving && !reduce ? Math.abs(sw) * .04 : 0, w.z);
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
      flick.forEach(f => { const off = !reduce && Math.random() < .004; f.l.intensity *= off ? .25 : 1; f.m.emissiveIntensity = lampOn * (off ? .2 : .8); });
      stepWalker(me, dt, 2.2, now, [me.legL, me.legR]);
      if (!stepWalker(cat, dt, 1.1, now) && now > cat.next) { const n = cells.get((Math.round(cat.x) + Math.round(Math.random() * 2 - 1)) + "," + (Math.round(cat.z) + Math.round(Math.random() * 2 - 1))); if (walkable(n)) cat.path = [[n.x, n.z]]; cat.next = now + 2000 + Math.random() * 3500; }
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

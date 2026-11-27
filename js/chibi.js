/*
 * 新的小人（重做中）：3D 身体 + 高清手绘脸贴图的日系 Q 版角色（原创）
 * 第 1 步：头和脸。第 2 步：头发（中分黑色长发）和白色粗框眼镜。第 3 步：宽松大 T 恤、手、短裤、腿和鞋。
 * 第 4 步：动作。update({ state, expr, rain, now, dt }) 每帧调用：
 *   stand 待机（呼吸、歪头、张望）、walk 走路、sit 坐（长椅）、wave 挥手、happy 开心挥手、work 拿水壶浇水
 *   陪伴模式用：type 坐在书桌前打字、sleep 躺着睡觉、game 窝在豆袋上玩游戏、fish 坐在栈道上钓鱼
 *   rain: true 时站着 / 走路会撑伞；头发用简单的弹簧摆动，跟着身体动作延迟一点
 *
 * - 头：光滑的略扁球形（宽 > 高 > 深），脸颊稍鼓，下巴圆
 * - 脸：1024×1024 的 canvas 贴图，贴在一块紧贴脸前方的弧面上（截取球面正面一块，半径比头大一点点）
 * - 表情：normal 普通、happy 开心、surprised 惊讶、sleepy 困、sad 难过、blink 闭眼（眨眼用）
 * - 卡通着色：2 阶柔和渐变（暗部带一点暖色），轮廓线用「背面放大」（#3a3440）
 */
var Chibi = (function () {
  var SKIN = "#f7e3d6", SKIN_DARK = "#e8c4b4", OUTLINE = "#3a3440";
  var EXPRESSIONS = ["normal", "happy", "surprised", "sleepy", "sad", "blink"];

  /* ================= 脸的贴图（1024 × 1024，透明背景） ================= */
  // 脸贴图覆盖的范围：左右 FA 弧度、上下 FA 弧度，中心在正前方稍微往下（眼睛在脸的中下部）
  var FA = 1.6, FACE_T = Math.PI / 2 + .12, S = 1024;
  var U = function (a) { return (a / FA + .5) * S; }, V = function (t) { return (t - FACE_T + FA / 2) / FA * S; };
  var K = S / FA; // 每弧度多少像素
  var EYE_A = .43, EYE_T = FACE_T + .1, EYE_RX = .23, EYE_RY = .275;
  var INK = "#231a19";

  function eye(g, side, kind) {
    var cx = U(side * EYE_A), cy = V(EYE_T), rx = EYE_RX * K, ry = EYE_RY * K;
    var out = side; // 眼尾在外侧
    g.lineCap = "round"; g.lineJoin = "round";
    function iris(scaleX, scaleY, clipTop) {
      g.save();
      if (clipTop != null) { g.beginPath(); g.rect(cx - rx * 2, cy + clipTop, rx * 4, ry * 3); g.clip(); }
      // 一点点眼白
      g.fillStyle = "#fffaf6"; g.beginPath(); g.ellipse(cx + rx * .08 * out, cy - ry * .02, rx * .98 * scaleX, ry * .9 * scaleY, 0, 0, Math.PI * 2); g.fill(); // 眼白很少，只在眼尾露一点
      // 瞳孔：从上到下由深到浅
      var gr = g.createLinearGradient(0, cy - ry * scaleY, 0, cy + ry * scaleY);
      gr.addColorStop(0, "#2a1d1a"); gr.addColorStop(.55, "#4a332c"); gr.addColorStop(1, "#6b4a3f");
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy + ry * .06, rx * .92 * scaleX, ry * .94 * scaleY, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(30,20,18,.55)"; g.beginPath(); g.ellipse(cx, cy - ry * .05, rx * .5 * scaleX, ry * .55 * scaleY, 0, 0, Math.PI * 2); g.fill();
      // 高光：左上方一个大的白色方块，右下方一个小白点
      g.fillStyle = "#ffffff";
      var hw = rx * .42 * scaleX, hh = ry * .3 * scaleY, hx = cx - rx * .62 * scaleX, hy = cy - ry * .56 * scaleY;
      roundRect(g, hx, hy, hw, hh, hw * .18); g.fill();
      g.beginPath(); g.arc(cx + rx * .42 * scaleX, cy + ry * .5 * scaleY, rx * .12, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    function upperLid(lift, tip) {
      // 粗而黑的上眼线，眼尾微微上翘
      g.strokeStyle = INK; g.lineWidth = 33;
      g.beginPath(); g.moveTo(cx - rx * 1.05 * out, cy - ry * .45 + lift);
      g.bezierCurveTo(cx - rx * .6 * out, cy - ry * 1.12 + lift, cx + rx * .55 * out, cy - ry * 1.15 + lift, cx + rx * 1.12 * out, cy - ry * (.62 + tip) + lift);
      g.stroke();
      // 两三根睫毛
      g.lineWidth = 12; var ex = cx + rx * 1.12 * out, ey = cy - ry * (.62 + tip) + lift;
      [[34, -30], [40, -6], [24, -46]].forEach(function (d, i) {
        if (i === 2) { ex -= 22 * out; ey -= 22; }
        g.beginPath(); g.moveTo(ex, ey); g.quadraticCurveTo(ex + d[0] * .6 * out, ey + d[1] * .4, ex + d[0] * out, ey + d[1]); g.stroke();
      });
    }
    function lowerLid() { // 下眼线很细，只画几小笔
      g.strokeStyle = "rgba(60,40,36,.75)"; g.lineWidth = 6;
      [[-.55, -.15], [.05, .55]].forEach(function (s) {
        g.beginPath(); g.ellipse(cx, cy + ry * .08, rx * .98, ry * .98, 0, Math.PI * (.5 + s[1] * .5 * out), Math.PI * (.5 + s[0] * .5 * out), out > 0); g.stroke();
      });
    }
    if (kind === "normal" || kind === "sad") {
      iris(1, kind === "sad" ? .96 : 1); upperLid(kind === "sad" ? 6 : 0, kind === "sad" ? -.18 : .06); lowerLid();
      if (kind === "sad") { // 眼尾往下：在外侧补一笔往下的眼线
        g.strokeStyle = INK; g.lineWidth = 14; g.beginPath(); g.moveTo(cx + rx * 1.0 * out, cy - ry * .45); g.lineTo(cx + rx * 1.22 * out, cy - ry * .2); g.stroke();
      }
    } else if (kind === "surprised") { // 眼睛变圆
      g.save(); g.translate(cx, cy); g.scale(1.06, .9); g.translate(-cx, -cy);
      g.fillStyle = "#fffaf6"; g.beginPath(); g.ellipse(cx, cy, rx * 1.08, rx * 1.08, 0, 0, Math.PI * 2); g.fill();
      var gr = g.createLinearGradient(0, cy - rx * .6, 0, cy + rx * .6); gr.addColorStop(0, "#2a1d1a"); gr.addColorStop(1, "#6b4a3f");
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy + 6, rx * .6, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; roundRect(g, cx - rx * .42, cy - rx * .36, rx * .3, rx * .24, 6); g.fill(); g.beginPath(); g.arc(cx + rx * .26, cy + rx * .3, rx * .09, 0, Math.PI * 2); g.fill();
      g.strokeStyle = INK; g.lineWidth = 20; g.beginPath(); g.ellipse(cx, cy, rx * 1.08, rx * 1.08, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      g.restore();
    } else if (kind === "sleepy") { // 半闭眼：眼皮盖住上半
      iris(1, 1, -ry * .05);
      g.strokeStyle = INK; g.lineWidth = 24;
      g.beginPath(); g.moveTo(cx - rx * 1.05 * out, cy - ry * .02); g.quadraticCurveTo(cx, cy - ry * .2, cx + rx * 1.1 * out, cy - ry * .05); g.stroke();
      lowerLid();
    } else if (kind === "blink") { // 闭眼：一条往下弯的线 + 睫毛
      g.strokeStyle = INK; g.lineWidth = 22;
      g.beginPath(); g.moveTo(cx - rx * 1.0 * out, cy + ry * .05); g.quadraticCurveTo(cx, cy + ry * .5, cx + rx * 1.08 * out, cy); g.stroke();
      g.lineWidth = 11; g.beginPath(); g.moveTo(cx + rx * 1.08 * out, cy); g.lineTo(cx + rx * 1.32 * out, cy - ry * .12); g.stroke();
    } else if (kind === "happy") { // ^^
      g.strokeStyle = INK; g.lineWidth = 24;
      g.beginPath(); g.moveTo(cx - rx * .95, cy + ry * .28); g.quadraticCurveTo(cx, cy - ry * .75, cx + rx * .95, cy + ry * .28); g.stroke();
    }
  }
  function roundRectPath(p, x, y, w, h, r) {
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r);
    p.quadraticCurveTo(x + w, y + h, x + w - r, y + h); p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r); p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function blush(g) {
    [-1, 1].forEach(function (side) {
      var cx = U(side * .5), cy = V(EYE_T + .2), r = .27 * K;
      g.save(); g.translate(cx, cy); g.scale(1, .72);
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, r); // 柔和的粉橘色圆，边缘柔化
      gr.addColorStop(0, "rgba(242,165,148,.7)"); gr.addColorStop(.6, "rgba(242,165,148,.64)"); gr.addColorStop(1, "rgba(242,165,148,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
      g.strokeStyle = "rgba(255,255,255,.92)"; g.lineWidth = 7; g.lineCap = "round";
      for (var i = -1.5; i <= 1.5; i++) { var x = cx + i * 30; g.beginPath(); g.moveTo(x - 12, cy + 22); g.lineTo(x + 12, cy - 22); g.stroke(); }
    });
  }
  function mouth(g, kind) {
    var cx = U(0), cy = V(EYE_T + .3);
    g.strokeStyle = INK; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
    if (kind === "surprised") { g.beginPath(); g.ellipse(cx, cy + 4, 14, 17, 0, 0, Math.PI * 2); g.fillStyle = "#8a4a44"; g.fill(); g.lineWidth = 7; g.stroke(); }
    else if (kind === "sad") { g.beginPath(); g.moveTo(cx - 22, cy + 8); g.lineTo(cx - 3, cy - 6); g.lineTo(cx + 22, cy + 8); g.stroke(); } // へ
    else if (kind === "happy") { g.beginPath(); g.moveTo(cx - 24, cy - 4); g.quadraticCurveTo(cx, cy + 22, cx + 24, cy - 4); g.stroke(); }
    else if (kind === "sleepy") { g.beginPath(); g.moveTo(cx - 14, cy + 2); g.quadraticCurveTo(cx, cy - 6, cx + 14, cy + 2); g.stroke(); }
    else { g.beginPath(); g.moveTo(cx - 18, cy + 2); g.quadraticCurveTo(cx, cy + 12, cx + 18, cy + 2); g.stroke(); } // 一笔短弧线
    g.fillStyle = "rgba(200,140,128,.8)"; g.beginPath(); g.arc(U(0), V(EYE_T + .19), 4, 0, Math.PI * 2); g.fill(); // 很小的鼻子
  }
  function drawFace(kind) {
    var c = document.createElement("canvas"); c.width = c.height = S; var g = c.getContext("2d");
    blush(g);
    [-1, 1].forEach(function (s) { eye(g, s, kind); });
    mouth(g, kind);
    return c;
  }

  /* ================= 材质：2 阶柔和渐变 + 背面放大的轮廓线 ================= */
  function gradient(tint) { // 暗部带一点颜色，过渡柔和（4 个格子、线性过滤）
    var T = THREE, d = new Uint8Array(12), sh = tint || [.8, .78, .8];
    var top = 1;
    for (var i = 0; i < 4; i++) { var lit = i >= 2; d[i * 3] = Math.round((lit ? 1 : sh[0]) * top * 255); d[i * 3 + 1] = Math.round((lit ? 1 : sh[1]) * top * 255); d[i * 3 + 2] = Math.round((lit ? 1 : sh[2]) * top * 255); }
    var t = new T.DataTexture(d, 4, 1, T.RGBFormat); t.minFilter = t.magFilter = T.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  }
  // 角色专用的柔和两阶着色：亮面 = 底色，暗面 = 底色 × 暗部色比例，中间柔和过渡。
  // 不跟着环境光叠加（不会发白发黄），整体明暗由 BRIGHT（白天 1、夜里暗一点）控制。
  var BRIGHT = { value: 1 };
  var RAMP = null; // 0→1 的线性渐变：让着色能知道表面朝光多少
  function ramp() {
    if (RAMP) return RAMP;
    var d = new Uint8Array(256 * 3); for (var i = 0; i < 256; i++) d[i * 3] = d[i * 3 + 1] = d[i * 3 + 2] = i;
    RAMP = new THREE.DataTexture(d, 256, 1, THREE.RGBFormat); RAMP.minFilter = RAMP.magFilter = THREE.LinearFilter; RAMP.generateMipmaps = false; RAMP.needsUpdate = true;
    return RAMP;
  }
  function soft(m, shadow) {
    m.gradientMap = ramp();
    var sh3 = new THREE.Vector3(shadow[0], shadow[1], shadow[2]);
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uBright = BRIGHT; sh.uniforms.uShadow = { value: sh3 };
      sh.fragmentShader = "uniform float uBright;\nuniform vec3 uShadow;\n" + sh.fragmentShader.replace(
        "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
        "float lum = dot(reflectedLight.directDiffuse, vec3(.3333)) / max(dot(diffuseColor.rgb, vec3(.3333)), .001);\n" +
        "float k = smoothstep(.1, .26, lum);\n" +
        "float rim = 1.0 - clamp(normalize(normal).z, 0.0, 1.0); k *= 1.0 - smoothstep(.3, .78, rim) * .85;\n" + // 边缘柔和地暗下去，显得圆润有体积
        "vec3 outgoingLight = mix(diffuseColor.rgb * uShadow, diffuseColor.rgb, k) * uBright + totalEmissiveRadiance;");
    };
    m.customProgramCacheKey = function () { return "chibi-soft-" + shadow.join(","); };
    return m;
  }
  function shadowTint(lit, dark) { var a = new THREE.Color(lit), b = new THREE.Color(dark); return [b.r / a.r, b.g / a.g, b.b / a.b]; }
  function outlineMat(width) {
    var m = new THREE.MeshBasicMaterial({ color: new THREE.Color(OUTLINE), side: THREE.BackSide });
    m.onBeforeCompile = function (sh) { sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = position + normal * " + width.toFixed(4) + ";"); };
    m.customProgramCacheKey = function () { return "chibi-outline-" + width; };
    return m;
  }

  /* ================= 头 ================= */
  var HAIR = "#2b2b33", HAIR_DARK = "#1c1c22", HAIR_SHINE = "#7a7a88", GLASSES = "#f4f1ea";
  var TEE = "#e3a072", TEE_DARK = "#c4825a", RIB = "#d4895c", PRINT = "#f6ead7", SHORTS = "#4a4752", SHOE = "#7a6458";

  // T 恤上的印花：米白色的小圆圈、小波浪线、小星星，零散分布（可以无缝平铺）
  function teePrint() {
    var c = document.createElement("canvas"); c.width = c.height = 512; var g = c.getContext("2d");
    g.fillStyle = TEE; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = PRINT; g.fillStyle = PRINT; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
    var rnd = (function (a) { return function () { a = (a * 16807) % 2147483647; return a / 2147483647; }; })(7);
    function star(x, y, r) { g.beginPath(); for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
    function wave(x, y, w, rot) { g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.moveTo(-w / 2, 0); for (var k = 0; k <= 3; k++) g.quadraticCurveTo(-w / 2 + (k + .5) * w / 4, k % 2 ? 9 : -9, -w / 2 + (k + 1) * w / 4, 0); g.stroke(); g.restore(); }
    var pts = [];
    for (var i = 0; i < 34; i++) {
      var x, y, ok = false, tries = 0;
      while (!ok && tries++ < 60) { x = rnd() * 512; y = rnd() * 512; ok = pts.every(function (q) { var dx = Math.min(Math.abs(q[0] - x), 512 - Math.abs(q[0] - x)), dy = Math.min(Math.abs(q[1] - y), 512 - Math.abs(q[1] - y)); return dx * dx + dy * dy > 70 * 70; }); }
      pts.push([x, y]);
      var kind = i % 3, rot = rnd() * Math.PI;
      for (var ox = -512; ox <= 512; ox += 512) for (var oy = -512; oy <= 512; oy += 512) { // 画在边上的也在对面补一份，平铺没有接缝
        var X = x + ox, Y = y + oy; if (X < -60 || X > 572 || Y < -60 || Y > 572) continue;
        if (kind === 0) { g.beginPath(); g.arc(X, Y, 15, 0, Math.PI * 2); g.stroke(); }
        else if (kind === 1) wave(X, Y, 64, rot);
        else star(X, Y, 17);
      }
    }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }

  // 一片有厚度的发片：沿一条曲线，截面是扁椭圆；宽度从发根到中段略鼓，再收成尖尾
  function strandGeo(pts, W, opt) {
    var T = THREE; opt = opt || {};
    var curve = new T.CatmullRomCurve3(pts, false, "centripetal");
    var L = opt.segs || 28, N = 10, depth = opt.depth || .36, pos = [], idx = [];
    var widthAt = opt.width || function (u) {
      var grow = .72 + .28 * Math.sin(Math.min(u / .3, 1) * Math.PI / 2);
      var tail = u < .38 ? 1 : Math.pow(1 - (u - .38) / .62, opt.sharp || 1.05);
      return W * grow * tail;
    };
    for (var i = 0; i <= L; i++) {
      var u = i / L, P = curve.getPoint(u), Tn = curve.getTangent(u);
      var out = new T.Vector3(P.x, P.y > 0 ? P.y : 0, P.z); if (opt.out) out.copy(opt.out(P)); out.normalize();
      var S = new T.Vector3().crossVectors(Tn, out).normalize(), Nn = new T.Vector3().crossVectors(S, Tn).normalize();
      var w = widthAt(u), d = Math.max(w * depth, .0035 * (1 - u));
      for (var j = 0; j < N; j++) {
        var a = j / N * Math.PI * 2;
        pos.push(P.x + S.x * w * Math.cos(a) + Nn.x * d * Math.sin(a), P.y + S.y * w * Math.cos(a) + Nn.y * d * Math.sin(a), P.z + S.z * w * Math.cos(a) + Nn.z * d * Math.sin(a));
      }
    }
    for (var i2 = 0; i2 < L; i2++) for (var j2 = 0; j2 < N; j2++) {
      var a0 = i2 * N + j2, a1 = i2 * N + (j2 + 1) % N, b0 = a0 + N, b1 = a1 + N;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    var c = pos.length / 3, P0 = curve.getPoint(0); pos.push(P0.x, P0.y, P0.z); // 发根封口
    for (var j3 = 0; j3 < N; j3++) idx.push(c, j3, (j3 + 1) % N);
    var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  function create(opts) {
    opts = opts || {};
    var T = THREE, R = .2;
    var root = new T.Group();
    var head = new T.Group(); head.position.y = .62; root.add(head);
    var OUT = outlineMat(.0045);
    // 光滑的略扁球（宽 > 高 > 深），脸颊稍鼓，下巴圆
    function shapeHead(geo, r) {
      var p = geo.attributes.position, v = new T.Vector3();
      for (var i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        var ny = v.y / r, nz = v.z / r;
        var cheek = Math.max(0, nz) * Math.exp(-Math.pow((ny + .3) / .32, 2)) * .045; // 两颊稍鼓
        var s = 1 + cheek;
        v.x *= 1.1 * s; v.y *= (ny < 0 ? .97 : 1.0); v.z *= .95 * (1 + cheek * .4);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals(); return geo;
    }
    var SH = shadowTint(SKIN, SKIN_DARK);
    var skinM = soft(new T.MeshToonMaterial({ color: new T.Color(SKIN) }), SH);
    var headGeo = shapeHead(new T.SphereGeometry(R, 64, 48), R);
    var headMesh = new T.Mesh(headGeo, skinM); head.add(headMesh);
    var hull = new T.Mesh(headGeo, OUT); headMesh.add(hull);
    // 脸：截取球面正面一块，半径比头大一点点，贴 1024 的脸
    var faceGeo = shapeHead(new T.SphereGeometry(R * 1.004, 64, 64, Math.PI / 2 - FA / 2, FA, FACE_T - FA / 2, FA), R * 1.004);
    var faces = {};
    EXPRESSIONS.forEach(function (k) { var t = new T.CanvasTexture(drawFace(k)); t.anisotropy = 8; faces[k] = t; });
    var faceM = soft(new T.MeshToonMaterial({ map: faces.normal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetUnits: -2 }), SH);
    var face = new T.Mesh(faceGeo, faceM); face.renderOrder = 5; head.add(face);
    // ================= 头发 =================
    // 头上一点：a 是绕头的角度（0 = 正前方），t 是从头顶往下的角度，r 是离头中心多远（和头一样压扁）
    function sp(a, t, r) { return new T.Vector3(r * Math.sin(t) * Math.sin(a) * 1.1, r * Math.cos(t), r * Math.sin(t) * Math.cos(a) * .95); }
    function hang(a, y, r) { return new T.Vector3(r * Math.sin(a) * 1.1, y, r * Math.cos(a) * .95); } // 头下面垂着的点
    var hairM = soft(new T.MeshToonMaterial({ color: new T.Color(HAIR) }), shadowTint(HAIR, HAIR_DARK));
    var innerM = soft(new T.MeshToonMaterial({ color: new T.Color(HAIR_DARK), side: T.DoubleSide }), [.85, .85, .85]);
    var shineM = soft(new T.MeshToonMaterial({ color: new T.Color(HAIR_SHINE) }), [.8, .8, .82]);
    var HOUT = outlineMat(.0035);
    var hair = new T.Group(); head.add(hair);
    var locks = []; // 每一片都挂在自己的发根上，之后走路时可以弹簧摆动
    function addStrand(pts, W, opt) {
      opt = opt || {};
      var root0 = pts[0].clone(), geo = strandGeo(pts.map(function (q) { return q.clone().sub(root0); }), W, opt);
      var pivot = new T.Group(); pivot.position.copy(root0); hair.add(pivot);
      var m = new T.Mesh(geo, opt.mat || hairM); pivot.add(m);
      if (!opt.noOutline) m.add(new T.Mesh(geo, HOUT));
      if (opt.swing) locks.push({ pivot: pivot, k: opt.swing, vx: 0, vz: 0, ax: 0, az: 0 });
      return m;
    }
    // 1. 头顶外壳：光滑的头盔形，比头大一圈
    // 头顶一整圈到发际线；两侧和后面再往下盖到耳朵，前面（脸）空出来
    [shapeHead(new T.SphereGeometry(R * 1.055, 64, 20, 0, Math.PI * 2, 0, Math.PI * .3), R * 1.055),
     shapeHead(new T.SphereGeometry(R * 1.055, 48, 16, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, Math.PI * .3, Math.PI * .26), R * 1.055)].forEach(function (g) {
      var m = new T.Mesh(g, hairM); hair.add(m); m.add(new T.Mesh(g, HOUT));
    });
    // 刘海后面的深色底层：发片之间的缝看到的是头发，不是额头
    var under = new T.Mesh(shapeHead(new T.SphereGeometry(R * 1.048, 40, 10, Math.PI / 2 - 1.05, 2.1, Math.PI * .26, Math.PI * .15), R * 1.048), innerM);
    hair.add(under);
    // 中分线：从额头发际沿头顶往后的一道细缝
    var partPts = []; for (var i = 0; i <= 12; i++) partPts.push(sp(0, .36 * Math.PI - i / 12 * .4 * Math.PI, R * 1.062));
    hair.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(partPts), 24, .0028, 6), soft(new T.MeshToonMaterial({ color: new T.Color("#d9bfb0") }), [.8, .75, .75])));
    // 后发里层（深色，挡住缝隙，看不到脖子后面）
    var inner = new T.Mesh(new T.LatheGeometry([[1.02, .25], [1.04, -.1], [1.06, -.6], [1.08, -1.15], [1.1, -1.45]].map(function (q) { return new T.Vector2(q[0] * R, q[1] * R); }), 40, Math.PI * .62, Math.PI * .76), innerM);
    inner.scale.set(1.1, 1, .95); hair.add(inner);
    // 3. 后发：一圈宽发片，外张成钟形，下摆是参差的尖角，长到胸口
    var nBack = 15;
    for (var b = 0; b < nBack; b++) {
      var a = Math.PI * .5 + b / (nBack - 1) * Math.PI; // 从左侧绕到后面再到右侧
      var len = R * (1.45 + ((b * 37) % 7) / 7 * .4), flare = 1.13 + ((b * 13) % 5) / 5 * .05;
      addStrand([sp(a, .3 * Math.PI, R * 1.045), sp(a, .46 * Math.PI, R * 1.075), sp(a, .6 * Math.PI, R * 1.09), hang(a, -R * .72, R * 1.1), hang(a, -len, R * flare)], R * .46, { swing: .9, sharp: 1.15 });
    }
    // 两侧各 2 片发片，垂在肩膀前面
    [-1, 1].forEach(function (s) {
      addStrand([sp(s * .95, .28 * Math.PI, R * 1.06), sp(s * 1.05, .52 * Math.PI, R * 1.1), hang(s * 1.0, -R * .55, R * 1.16), hang(s * .92, -R * 1.45, R * 1.2)], R * .3, { swing: 1.1 });
      addStrand([sp(s * 1.25, .26 * Math.PI, R * 1.06), sp(s * 1.3, .52 * Math.PI, R * 1.11), hang(s * 1.25, -R * .6, R * 1.17), hang(s * 1.18, -R * 1.25, R * 1.21)], R * .32, { swing: 1.0 });
      // 脸两侧的鬓发（遮住耳朵）
      addStrand([sp(s * .82, .3 * Math.PI, R * 1.065), sp(s * .86, .5 * Math.PI, R * 1.085), sp(s * .82, .68 * Math.PI, R * 1.09), hang(s * .78, -R * .95, R * 1.08)], R * .2, { swing: 1.2 });
    });
    // 2. 刘海：从中分线向两边垂下，每边 4 片尖尾发片，在眼睛上方结束
    var BANGS = [[.15, .1, .425, .34], [.37, .33, .44, .35], [.6, .58, .43, .32], [.84, .9, .46, .28]]; // 发尾停在镜框上沿
    [-1, 1].forEach(function (s) {
      BANGS.forEach(function (bg, i) {
        var pts = [sp(s * .03, .1 * Math.PI, R * 1.07), sp(s * bg[0] * .55, .21 * Math.PI, R * 1.085), sp(s * bg[0], .31 * Math.PI, R * 1.09), sp(s * bg[1], bg[2] * Math.PI, R * 1.075)];
        addStrand(pts, R * bg[3], { swing: .35, sharp: 1.25 });
        if (i < 3) { // 刘海上几道细高光
          var hl = [sp(s * bg[0] * .5, .19 * Math.PI, R * 1.112), sp(s * bg[0] * .8, .26 * Math.PI, R * 1.12), sp(s * bg[0] * .97, .31 * Math.PI, R * 1.118)];
          addStrand(hl, R * .032, { mat: shineM, noOutline: true, depth: .3, sharp: .7 });
        }
      });
    });
    // 头顶的光泽带：几道长短不一的浅灰弧形条，围成一圈
    [[.95, 1.5, .2], [1.62, 2.05, .21], [2.2, 2.95, .2], [3.1, 3.5, .21], [3.62, 4.2, .2], [4.35, 4.95, .21], [5.08, 5.4, .2]].forEach(function (h) {
      var pts = []; for (var k = 0; k <= 6; k++) pts.push(sp(h[0] + (h[1] - h[0]) * k / 6, (h[2] + Math.sin(k / 6 * Math.PI) * .015) * Math.PI, R * 1.066));
      addStrand(pts, R * .028, { mat: shineM, noOutline: true, depth: .25, width: function (u) { return R * .028 * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) + .0005; } });
    });

    // ================= 白色粗框眼镜 =================
    var glasses = new T.Group(); head.add(glasses);
    var gM = soft(new T.MeshToonMaterial({ color: new T.Color(GLASSES) }), [.86, .86, .88]);
    var GOUT = outlineMat(.003);
    function frameGeo(w, h, bar, r) {
      var sh = new T.Shape(); roundRectPath(sh, -w / 2, -h / 2, w, h, r);
      var hole = new T.Path(); roundRectPath(hole, -w / 2 + bar, -h / 2 + bar, w - bar * 2, h - bar * 2, Math.max(.004, r - bar)); sh.holes.push(hole);
      var g = new T.ExtrudeGeometry(sh, { depth: .012, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 2, curveSegments: 10 });
      g.translate(0, 0, -.006); g.computeVertexNormals(); return g;
    }
    var fg = frameGeo(.162, .15, .0135, .045);
    [-1, 1].forEach(function (s) {
      var c = sp(s * EYE_A, EYE_T - .05, R * 1.0); c.z += .03; c.x += s * .008;
      var f = new T.Mesh(fg, gM); f.position.copy(c); f.rotation.set(.1, s * .36, 0); glasses.add(f); f.add(new T.Mesh(fg, GOUT));
      // 镜腿：往后伸到耳朵（被头发挡住）
      var tp = new T.Mesh(new T.CylinderGeometry(.007, .007, .2, 8), gM); tp.position.set(s * .205, c.y + .02, -.02); tp.rotation.x = Math.PI / 2; tp.rotation.z = s * .12; glasses.add(tp);
    });
    var cl = sp(-EYE_A, EYE_T, R), cr = sp(EYE_A, EYE_T, R);
    var bridge = new T.Mesh(new T.CylinderGeometry(.008, .008, .05, 8), gM); bridge.rotation.z = Math.PI / 2; bridge.position.set(0, cl.y + .03, cl.z + .05); glasses.add(bridge);
    var wearGlasses = opts.glasses !== false; glasses.visible = wearGlasses;

    // ================= 身体和衣服 =================
    var body = new T.Group(); root.add(body);
    var printTex = teePrint();
    var teeM = soft(new T.MeshToonMaterial({ map: printTex, side: T.DoubleSide }), shadowTint(TEE, TEE_DARK));
    var ribM = soft(new T.MeshToonMaterial({ color: new T.Color(RIB) }), [.86, .84, .84]);
    var shortsM = soft(new T.MeshToonMaterial({ color: new T.Color(SHORTS) }), [.78, .78, .8]);
    var shoeM = soft(new T.MeshToonMaterial({ color: new T.Color(SHOE) }), [.8, .78, .78]);
    var BOUT = outlineMat(.0035), SOUT = outlineMat(.0025);
    function withOutline(mesh, o) { mesh.add(new T.Mesh(mesh.geometry, o || BOUT)); return mesh; }
    // 方方正正的宽松 T 恤：截面是圆角方形，从领口往下展开到肩膀，再直直地垂到过臀，下摆稍微张开
    function teeGeo(rows, n, rep) {
      var pos = [], uv = [], idx = [], N = n || 48, e = 2 / 3.4;
      rows.forEach(function (r, i) {
        for (var j = 0; j <= N; j++) {
          var a = j / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
          pos.push(r[1] * Math.sign(sn) * Math.pow(Math.abs(sn), e), r[0], r[2] * Math.sign(c) * Math.pow(Math.abs(c), e));
          uv.push(j / N * rep, (r[0] - rows[rows.length - 1][0]) * 3.2);
        }
        if (i) for (var k = 0; k < N; k++) { var a0 = (i - 1) * (N + 1) + k, b0 = a0 + N + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      });
      var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    // [高度, 半宽, 半厚]
    var tee = withOutline(new T.Mesh(teeGeo([[.435, .05, .042], [.428, .085, .062], [.412, .13, .088], [.39, .158, .104], [.355, .166, .11], [.3, .166, .112], [.23, .168, .115], [.17, .174, .12], [.125, .182, .126]], 48, 3), teeM));
    body.add(tee);
    var collar = withOutline(new T.Mesh(new T.TorusGeometry(.05, .011, 10, 32), ribM), SOUT); collar.rotation.x = Math.PI / 2; collar.scale.set(1, .85, 1); collar.position.y = .432; body.add(collar);
    var hem = new T.Mesh(new T.TorusGeometry(1, .006, 6, 48), ribM); hem.rotation.x = Math.PI / 2; hem.scale.set(.181, .125, 1); hem.position.y = .127; body.add(hem);
    // 袖子：落肩，又宽又短，到手肘；里面露出小小的圆手
    var arms = [-1, 1].map(function (s) {
      var arm = new T.Group(); arm.position.set(s * .148, .372, 0); arm.rotation.z = s * .62; body.add(arm);
      var sg = new T.CylinderGeometry(.056, .066, .12, 24, 1, true); sg.translate(0, -.055, 0);
      var su = sg.attributes.uv; for (var i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * .9, su.getY(i) * .4);
      arm.add(withOutline(new T.Mesh(sg, teeM)));
      var cuff = withOutline(new T.Mesh(new T.CylinderGeometry(.0665, .068, .02, 24, 1, true), soft(new T.MeshToonMaterial({ color: new T.Color(RIB), side: T.DoubleSide }), [.86, .84, .84])), SOUT); cuff.position.y = -.112; arm.add(cuff); // 袖口的罗纹
      var fore = new T.Group(); fore.position.y = -.1; fore.rotation.z = -s * .5; arm.add(fore); // 前臂往下垂，比袖子更竖
      var f = withOutline(new T.Mesh(new T.CylinderGeometry(.021, .023, .09, 12), skinM), SOUT); f.position.y = -.04; fore.add(f);
      var hand = withOutline(new T.Mesh(new T.SphereGeometry(.031, 16, 12), skinM), SOUT); hand.position.y = -.092; hand.scale.set(.95, 1.05, .9); fore.add(hand);
      return { arm: arm, fore: fore, hand: hand };
    });
    // 深色短裤 + 一小截腿 + 圆头鞋
    var shorts = withOutline(new T.Mesh(new T.CylinderGeometry(.13, .135, .04, 28), shortsM), SOUT); shorts.scale.z = .72; shorts.position.y = .12; body.add(shorts);
    var legs = [-1, 1].map(function (s) {
      var leg = new T.Group(); leg.position.set(s * .062, .12, 0); body.add(leg);
      var pant = withOutline(new T.Mesh(new T.CylinderGeometry(.05, .052, .05, 18), shortsM), SOUT); pant.position.y = -.02; leg.add(pant);
      var shin = withOutline(new T.Mesh(new T.CylinderGeometry(.024, .022, .07, 12), skinM), SOUT); shin.position.y = -.075; leg.add(shin);
      var shoe = withOutline(new T.Mesh(new T.SphereGeometry(.042, 18, 12), shoeM), SOUT); shoe.scale.set(1, .62, 1.42); shoe.position.set(0, -.1, .016); leg.add(shoe);
      return leg;
    });
    // 脖子（被衣领挡住大半）
    var neck = new T.Mesh(new T.CylinderGeometry(.034, .04, .07, 20), skinM); neck.position.y = .44; root.add(neck);
    var expr = "normal", blinkAt = -1, blinkOn = false;
    var baseExpr = "normal";
    function setExpression(k) { baseExpr = faces[k] ? k : "normal"; }
    // ================= 骨架：所有东西放进 rig，头挂在脖子上的关节 =================
    var rig = new T.Group();
    while (root.children.length) rig.add(root.children[0]);
    root.add(rig);
    var headPivot = new T.Group(); headPivot.position.y = .43; rig.add(headPivot);
    head.position.y = .19; headPivot.add(head);
    rig.traverse(function (o) { if (o.isMesh) { var ol = o.material && o.material.side === T.BackSide && o.material.isMeshBasicMaterial; o.castShadow = !ol; o.receiveShadow = !ol; } });

    // ================= 小道具 =================
    function pm(hex, sh) { return soft(new T.MeshToonMaterial({ color: new T.Color(hex) }), sh || [.8, .8, .82]); }
    function prop(geo, mat, x, y, z, parent) { var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.add(new T.Mesh(geo, SOUT)); parent.add(m); return m; }
    // 雨伞（低饱和的灰蓝色）
    var umbrella = new T.Group(); rig.add(umbrella);
    prop(new T.CylinderGeometry(.008, .008, .74, 8), pm("#7a5a44"), 0, .37, 0, umbrella);
    var canopyG = new T.SphereGeometry(.34, 24, 8, 0, Math.PI * 2, 0, Math.PI * .36);
    var canopy = new T.Mesh(canopyG, soft(new T.MeshToonMaterial({ color: new T.Color("#8fa6b8"), side: T.DoubleSide }), [.8, .82, .86])); canopy.position.y = .4; canopy.castShadow = true; canopy.add(new T.Mesh(canopyG, SOUT)); umbrella.add(canopy);
    prop(new T.SphereGeometry(.016, 10, 8), pm("#7a5a44"), 0, .75, 0, umbrella);
    umbrella.position.set(-.13, .3, .06); umbrella.visible = false;
    // 浇水壶
    var can = new T.Group(); rig.add(can);
    prop(new T.CylinderGeometry(.04, .045, .07, 18), pm("#8fa6b8"), 0, 0, 0, can);
    var spout = prop(new T.CylinderGeometry(.007, .011, .1, 8), pm("#8fa6b8"), 0, .01, .07, can); spout.rotation.x = 1.0;
    prop(new T.TorusGeometry(.03, .007, 6, 16, Math.PI), pm("#6f8798"), 0, .035, -.005, can).rotation.y = Math.PI / 2;
    can.position.set(-.15, .19, .16); can.visible = false;
    // 游戏机
    var gamepad = new T.Group(); rig.add(gamepad);
    prop(new T.BoxGeometry(.12, .06, .02), pm("#5d6f86"), 0, 0, 0, gamepad);
    var scr = new T.Mesh(new T.PlaneGeometry(.06, .04), new T.MeshBasicMaterial({ color: 0xbfe0f2 })); scr.position.z = .011; gamepad.add(scr);
    gamepad.position.set(0, .26, .19); gamepad.rotation.x = -.6; gamepad.visible = false;
    // 钓竿和鱼线
    var rod = new T.Group(); rig.add(rod);
    var pole = prop(new T.CylinderGeometry(.005, .01, .9, 8), pm("#8a6a4a"), 0, .45, 0, rod);
    var lineGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0, .9, 0), new T.Vector3(0, .1, .1)]);
    var fishLine = new T.Line(lineGeo, new T.LineBasicMaterial({ color: 0xf6f1e7 })); rod.add(fishLine);
    rod.position.set(0, .23, .2); rod.rotation.x = .95; rod.visible = false;

    // ================= 动作 =================
    var walkT = 0, look = 0, lookTo = 0, tilt = 0, tiltTo = 0, nextLook = 0, last = 0;
    var swingX = 0, swingVX = 0, swingZ = 0, swingVZ = 0;
    var ARM_Z = .62, FORE_Z = .5;
    function rest() { // 回到基本姿势
      rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); body.scale.set(1, 1, 1);
      headPivot.rotation.set(0, 0, 0);
      arms.forEach(function (a, i) { var s = i ? 1 : -1; a.arm.rotation.set(0, 0, s * ARM_Z); a.fore.rotation.set(0, 0, -s * FORE_Z); });
      legs.forEach(function (l) { l.rotation.set(0, 0, 0); });
      umbrella.visible = can.visible = gamepad.visible = rod.visible = false;
      glasses.visible = wearGlasses;
    }
    function reach(i, x, z, foreX, foreZ) { var s = i ? 1 : -1; arms[i].arm.rotation.set(x, 0, s * z); arms[i].fore.rotation.set(foreX || 0, 0, -s * (foreZ || 0)); }
    function sitLegs(a) { legs.forEach(function (l) { l.rotation.x = a; }); }
    function update(st) {
      if (typeof st === "number") st = { now: st };
      var now = st.now || 0, dt = st.dt || (last ? Math.min(.05, (now - last) / 1000) : .016); last = now;
      var state = st.state || "stand";
      // 表情（眨眼：每 3～5 秒随机一次）
      var e = st.expr || baseExpr; if (e === "laugh") e = "happy";
      if (state === "happy" || state === "wave") e = "happy";
      if (state === "sleep") e = "blink";
      expr = faces[e] ? e : "normal";
      if (blinkAt < 0) blinkAt = now + 3000 + Math.random() * 2000;
      if (now > blinkAt) { blinkOn = !blinkOn; blinkAt = now + (blinkOn ? 130 : 3000 + Math.random() * 2000); }
      var k = blinkOn && (expr === "normal" || expr === "sad" || expr === "surprised") ? "blink" : expr;
      if (faceM.map !== faces[k]) { faceM.map = faces[k]; faceM.needsUpdate = true; }

      rest();
      var t = now / 1000, breathe = Math.sin(t * 2.4);
      var walking = state === "walk";
      walkT = walking ? walkT + dt * 9 : 0;
      var sw = Math.sin(walkT);
      if (walking) {
        legs[0].rotation.x = sw * .55; legs[1].rotation.x = -sw * .55;
        reach(0, -sw * .35, ARM_Z, 0, FORE_Z); reach(1, sw * .35, ARM_Z, 0, FORE_Z);
        rig.position.y = Math.abs(Math.cos(walkT)) * .02;
        headPivot.rotation.z = sw * .045; headPivot.rotation.x = .03;
      } else if (state === "sit") { // 坐在长椅上：腿往前伸，手放在腿上
        sitLegs(-1.45); reach(0, -.55, .3, -.5, .1); reach(1, -.55, .3, -.5, .1);
        body.scale.y = 1 + breathe * .008;
      } else if (state === "wave" || state === "happy") { // 挥手：左手举起来左右摆
        reach(1, -1.35, .55 + Math.sin(t * 9) * .3, -1.0, 0); // 手举到胸前、头发前面挥，看得见
        rig.position.y = state === "happy" ? Math.abs(Math.sin(t * 7)) * .03 : 0;
        headPivot.rotation.z = -.08;
      } else if (state === "work") { // 浇水：右手往前提着水壶，壶嘴一下一下往下倾
        reach(0, -.85, .22, -.25, 0); can.visible = true; can.rotation.x = .25 + Math.sin(t * 4) * .3;
        headPivot.rotation.x = .22; legs[0].rotation.x = -.08;
      } else if (state === "type") { // 坐在书桌前打字：双手往前放在键盘上，轮流敲
        sitLegs(-1.45); rig.rotation.x = .06;
        reach(0, -1.05, .2, -.45 + Math.sin(t * 16) * .1, 0); reach(1, -1.05, .2, -.45 + Math.sin(t * 16 + 2) * .1, 0);
        headPivot.rotation.x = .16; body.scale.y = 1 + breathe * .006;
      } else if (state === "sleep") { // 仰躺着睡觉，呼吸更慢更深
        rig.rotation.x = -Math.PI / 2; rig.position.y = .125; glasses.visible = false; // 睡觉时摘掉眼镜
        reach(0, 0, .2, 0, .05); reach(1, 0, .2, 0, .05);
        body.scale.y = 1; body.scale.z = 1 + Math.sin(t * 1.4) * .025;
        headPivot.rotation.z = .18;
      } else if (state === "game") { // 窝在豆袋上：往后靠，腿翘起来，两手捧着游戏机
        rig.rotation.x = -.55; rig.position.y = .02; sitLegs(-1.0);
        reach(0, -.55, .15, -.75, 0); reach(1, -.55, .15, -.75, 0);
        gamepad.visible = true; gamepad.position.y = .26 + Math.sin(t * 3) * .004;
        headPivot.rotation.x = .38;
      } else if (state === "fish") { // 坐在栈道边钓鱼：腿垂下去轻轻晃，两手握竿
        sitLegs(-.4 + Math.sin(t * 1.3) * .12); legs[1].rotation.x = -.4 + Math.sin(t * 1.3 + 1.5) * .12;
        reach(0, -1.0, .25, -.2, 0); reach(1, -1.0, .25, -.2, 0);
        rod.visible = true; rod.rotation.x = .95 + Math.sin(t * .9) * .04;
        body.scale.y = 1 + breathe * .008;
      } else { // 待机：轻轻呼吸，偶尔歪一下头、左右看看
        body.scale.y = 1 + breathe * .01; rig.position.y = breathe * .002;
        if (now > nextLook) { var r = Math.random(); lookTo = r < .55 ? 0 : (Math.random() - .5) * .9; tiltTo = Math.random() < .35 ? (Math.random() < .5 ? -.14 : .14) : 0; nextLook = now + 2500 + Math.random() * 3500; }
      }
      var idle = state === "stand";
      look += ((idle ? lookTo : 0) - look) * Math.min(1, dt * 3); tilt += ((idle ? tiltTo : 0) - tilt) * Math.min(1, dt * 3);
      headPivot.rotation.y += look; headPivot.rotation.z += tilt;
      // 下雨：站着、走路时撑伞（右手举着伞柄）
      if (st.rain && (state === "stand" || walking)) {
        umbrella.visible = true; reach(0, -.35, 2.0, 0, -.9);
        umbrella.rotation.z = walking ? sw * .03 : 0;
      }
      // 头发：简单的弹簧，跟着身体动作晚一点点
      var driveX = walking ? .12 + Math.cos(walkT * 2) * .05 : breathe * .01;
      var driveZ = -(headPivot.rotation.z) * .9 + (walking ? sw * .04 : 0);
      swingVX += ((driveX - swingX) * 60 - swingVX * 9) * dt; swingX += swingVX * dt;
      swingVZ += ((driveZ - swingZ) * 60 - swingVZ * 9) * dt; swingZ += swingVZ * dt;
      locks.forEach(function (l) { l.pivot.rotation.x = swingX * l.k; l.pivot.rotation.z = swingZ * l.k; });
    }
    return { root: root, rig: rig, head: head, body: body, arms: arms, legs: legs, hair: hair, locks: locks, glasses: glasses, setExpression: setExpression, update: update };
  }

  var POSES = ["stand", "walk", "wave", "sit", "work", "type", "sleep", "game", "fish"];
  return { create: create, drawFace: drawFace, EXPRESSIONS: EXPRESSIONS, POSES: POSES, setBrightness: function (v) { BRIGHT.value = v; } };
})();

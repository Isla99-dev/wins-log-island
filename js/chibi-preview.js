/*
 * 小人预览（设置 →「我的小人」）
 * 正面、3/4 侧面、侧面、背面四个角度并排，浅色纯色背景，可以切换动作和表情，方便对照参考图调整。
 * makeStage(pose) 也给截图测试用：搭一个带简单道具（长椅、书桌、床、豆袋、栈道）的小场景。
 */
var ChibiPreview = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = [0, .75, Math.PI / 2, Math.PI];

  function toon(hex) { return new THREE.MeshToonMaterial({ color: new THREE.Color(hex) }); }
  function box(w, h, d, hex, x, y, z, parent) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(hex)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }

  // 每个动作配的小道具，和角色放在哪里
  function props(pose, group) {
    var at = { y: 0, z: 0 };
    if (pose === "sit" || pose === "type") {
      box(.42, .05, .3, "#b08a64", 0, .235, -.02, group); box(.42, .3, .04, "#b08a64", 0, .4, -.16, group);
      [[-.18, -.13], [.18, -.13], [-.18, .1], [.18, .1]].forEach(function (p) { box(.035, .23, .035, "#8a6a4a", p[0], .115, p[1], group); });
      at.y = .16;
      if (pose === "type") {
        box(.7, .04, .34, "#c9a47c", 0, .47, .3, group); [[-.31, .18], [.31, .18], [-.31, .43], [.31, .43]].forEach(function (p) { box(.035, .45, .035, "#a07c58", p[0], .225, p[1], group); });
        box(.26, .012, .18, "#8d9096", 0, .497, .27, group);
        var lid = box(.26, .17, .012, "#8d9096", 0, .58, .36, group); lid.rotation.x = -.25;
        var scr = new THREE.Mesh(new THREE.PlaneGeometry(.23, .14), new THREE.MeshBasicMaterial({ color: 0xcfe3ff })); scr.position.set(0, .58, .353); scr.rotation.set(-.25, Math.PI, 0); group.add(scr);
      }
    } else if (pose === "sleep") {
      box(.7, .16, 1.2, "#b08a64", 0, .08, -.35, group); box(.66, .06, 1.16, "#f4efe6", 0, .19, -.35, group);
      box(.4, .07, .2, "#ffffff", 0, .25, -.82, group); box(.66, .04, .55, "#a8b8a0", 0, .23, -.05, group);
      at.y = .1;
    } else if (pose === "game") {
      var bag = new THREE.Mesh(new THREE.SphereGeometry(.34, 28, 18), toon("#c98a6a")); bag.scale.set(1.15, .55, 1.1); bag.position.set(0, .17, -.16); bag.castShadow = bag.receiveShadow = true; group.add(bag);
      at.y = .15; at.z = .02;
    } else if (pose === "fish") {
      box(.7, .06, .9, "#b07a48", 0, .3, -.38, group); [[-.3, -.75], [.3, -.75], [-.3, -.02], [.3, -.02]].forEach(function (p) { box(.05, .6, .05, "#6b4a33", p[0], 0, p[1], group); });
      var w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ color: 0x8fb8c9, transparent: true, opacity: .7 })); w.rotation.x = -Math.PI / 2; w.position.set(0, .02, .3); group.add(w);
      at.y = .22; at.z = -.04;
    } else if (pose === "work") {
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(.07, .055, .1, 16), toon("#c0704f")); pot.position.set(-.16, .05, .34); group.add(pot);
      var leaf = new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 8), toon("#7d9a5c")); leaf.position.set(-.16, .13, .34); group.add(leaf);
    }
    return at;
  }

  function makeStage(pose, opts) {
    opts = opts || {};
    var scene = new THREE.Scene(); scene.background = new THREE.Color(opts.bg || 0xf3ece2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6a4a, .75));
    var sun = new THREE.DirectionalLight(0xffffff, .75); sun.position.set(2, 4, 4); scene.add(sun);
    var floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: 0xe6dccb })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.002; scene.add(floor);
    var c = Chibi.create({ glasses: true }); scene.add(c.root);
    var group = new THREE.Group(); scene.add(group);
    var stage = { scene: scene, chibi: c, pose: pose, rain: false, expr: null };
    stage.setPose = function (p) {
      while (group.children.length) group.remove(group.children[0]);
      var at = props(p, group); c.root.position.set(0, at.y, at.z); stage.pose = p;
    };
    stage.setPose(pose || "stand");
    stage.update = function (now, dt) { c.update({ state: stage.pose, expr: stage.expr, rain: stage.rain, now: now, dt: dt }); };
    return stage;
  }
  function render(renderer, stage, w, h, views) {
    views = views || VIEWS; var vw = w / views.length;
    var cy = stage.pose === "sleep" ? .3 : stage.pose === "type" || stage.pose === "fish" ? .42 : .45;
    views.forEach(function (th, i) {
      var cam = new THREE.PerspectiveCamera(26, vw / h, .1, 50);
      cam.position.set(Math.sin(th) * 2.6, .75 + (stage.pose === "sleep" ? .7 : 0), Math.cos(th) * 2.6); cam.lookAt(0, cy, stage.pose === "sleep" ? -.3 : 0);
      renderer.setViewport(i * vw, 0, vw, h); renderer.setScissor(i * vw, 0, vw, h); renderer.render(stage.scene, cam);
    });
  }

  /* ---------------- 设置里的预览窗口 ---------------- */
  var renderer = null, stage = null, raf = 0, last = 0;
  function buttons(id, list, prefix, onPick, current) {
    var el = $(id);
    el.innerHTML = list.map(function (k) { return '<button type="button" class="i3-btn' + (k === current ? " is-on" : "") + '" data-k="' + k + '">' + I18n.t(prefix + k) + "</button>"; }).join("");
    el.onclick = function (e) { var b = e.target.closest("[data-k]"); if (!b) return; el.querySelectorAll(".i3-btn").forEach(function (x) { x.classList.toggle("is-on", x === b); }); onPick(b.dataset.k); };
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    stage.update(now, dt);
    var cv = $("chibi-canvas"), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w || cv.height !== h) renderer.setSize(w, h, false);
    render(renderer, stage, w, h);
  }
  function open() {
    if (!window.THREE || !window.Chibi) return;
    $("chibi-modal").hidden = false; document.body.classList.add("has-modal");
    if (!renderer) { renderer = new THREE.WebGLRenderer({ canvas: $("chibi-canvas"), antialias: true }); renderer.setScissorTest(true); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); }
    if (!stage) stage = makeStage("stand");
    $("chibi-views").innerHTML = I18n.t("chibi.views").map(function (v) { return "<span>" + v + "</span>"; }).join("");
    buttons("chibi-poses", Chibi.POSES, "chibi.pose.", function (k) { stage.setPose(k); }, stage.pose);
    buttons("chibi-exprs", ["normal", "happy", "surprised", "sleepy", "sad"], "chibi.expr.", function (k) { stage.expr = k; }, stage.expr || "normal");
    $("chibi-rain").onclick = function () { stage.rain = !stage.rain; this.classList.toggle("is-on", stage.rain); };
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    $("chibi-close").focus();
  }
  function close() { cancelAnimationFrame(raf); $("chibi-modal").hidden = true; if ($("settings-modal").hidden) document.body.classList.remove("has-modal"); }
  function init() {
    if (!$("chibi-open")) return;
    $("chibi-open").addEventListener("click", open);
    $("chibi-close").addEventListener("click", close);
    $("chibi-modal").addEventListener("click", function (e) { if (e.target === e.currentTarget) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("chibi-modal").hidden) { e.stopPropagation(); close(); } }, true);
  }
  return { init: init, open: open, makeStage: makeStage, render: render };
})();

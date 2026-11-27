/*
 * 像素小音效（第 9 步）
 *
 * - 全部用浏览器自带的 Web Audio 现场合成，没有音频文件
 * - 音量很轻；可以在设置里关掉，会记住选择
 * - 用法：Sound.play("done")
 * - 语音输入时要让出音频会话：Sound.hold() / Sound.release()。
 *   iPhone 上（Chrome 也是 WebKit 内核），页面里只要有一个在用的 AudioContext，
 *   下一次语音识别就可能启动失败。hold() 会把它关掉、之后不再发声；release() 之后第一次要发声时再重新创建。
 *   以后加背景声（雨声、柴火、翻书、咖啡馆）也要接在这两个函数上：hold() 时停掉，release() 时恢复。
 */
var Sound = (function () {
  var KEY = "winslog-sound";
  var on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) {}

  var ctx = null, master = null, held = false;
  var VOLUME = 0.07;

  function audio() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    return ctx;
  }

  // 一个音：频率、开始时间（秒，相对现在）、长度、波形、音量
  function tone(freq, start, length, type, gain) {
    var a = ctx, t = a.currentTime + start;
    var osc = a.createOscillator(), g = a.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g); g.connect(master);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  // 一小段沙沙声（纸张、打印机）
  function noise(start, length, gain, highpass) {
    var a = ctx, t = a.currentTime + start;
    var buf = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    var src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = highpass || 2000;
    src.buffer = buf;
    g.gain.setValueAtTime(gain || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  var N = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.5, G6: 1567.98, C7: 2093 };

  var SOUNDS = {
    add:   function () { tone(N.C5, 0, 0.07, "triangle", 0.9); tone(N.G5, 0.06, 0.1, "triangle", 0.9); },
    done:  function () { [N.C6, N.E6, N.G6, N.C7].forEach(function (f, i) { tone(f, i * 0.055, 0.12, "square", 0.45); }); },
    grow:  function () { tone(N.G5, 0, 0.45, "sine", 0.9); tone(N.B5, 0.08, 0.5, "sine", 0.7); tone(N.D6, 0.16, 0.6, "sine", 0.5); },
    undo:  function () { tone(N.G5, 0, 0.07, "triangle", 0.8); tone(N.C5, 0.06, 0.12, "triangle", 0.8); },
    pop:   function () { tone(N.E6, 0, 0.05, "triangle", 0.6); noise(0, 0.05, 0.25, 3000); },
    save:  function () { tone(N.E5, 0, 0.08, "square", 0.4); tone(N.A5, 0.08, 0.16, "square", 0.4); },
    print: function (seconds) {
      var n = Math.max(4, Math.round((seconds || 2) / 0.12));
      for (var i = 0; i < n; i++) noise(i * 0.12, 0.05, 0.35, 1500 + (i % 2) * 1200);
      tone(N.C6, n * 0.12, 0.08, "square", 0.35);
      tone(N.G6, n * 0.12 + 0.08, 0.14, "square", 0.35);
    }
  };

  function hold() {
    held = true;
    if (!ctx) return;
    var old = ctx; ctx = null; master = null;
    try { var p = old.close(); if (p && p.catch) p.catch(function () { /* 关不掉也没关系 */ }); } catch (e) { /* 同上 */ }
  }
  function release() { held = false; } // 不用马上恢复：下一次 play() 会重新创建

  function play(name, arg) {
    if (!on || held || !SOUNDS[name]) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches && name === "print") return;
    try {
      if (!audio()) return;
      if (ctx.state === "suspended") ctx.resume();
      SOUNDS[name](arg);
    } catch (e) { /* 没有声音也不影响使用 */ }
  }

  function set(value) {
    on = !!value;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
  }

  return { play: play, set: set, hold: hold, release: release, isHeld: function () { return held; }, isOn: function () { return on; } };
})();

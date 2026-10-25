// @ts-nocheck
// ═══ 酒馆音效系统 ═══════════════════════════════════════════════════
// 依赖：无前置依赖
// ── 酒馆音效系统（IIFE） ──────────────────────────────────────────
const TAVERN_LINES = [
  'Another round of ale over here!', 'Did you see that last hand? Unbelievable.',
  "I swear he's bluffing again.", 'Three kings? No way that is real.',
  'Bartender, one more whiskey please.', 'Quiet night at the tavern tonight.',
  "He's got a tell, I'm sure of it.", 'Fold or raise, make up your mind.',
  'The luck of the devil, that one.', "I wouldn't trust him with a copper coin.",
  'Last call before the sheriff comes by.', "Deal me in, I'm feeling lucky.",
  'That joker saved my skin back there.', "Pour me something strong, it's been a long day.",
  'Watch your cards, friend. Watch them close.',
];

const TavernAudio = (() => {
  let ctx = null, nodes = {}, timers = [], speechTimers = [], speechUtts = [];
  let _playing = false, _listeners = [];

  function notify() { _listeners.forEach(fn => fn(_playing)); }

  function addListener(fn) { _listeners.push(fn); return () => { _listeners = _listeners.filter(f => f !== fn); }; }

  function ensureCtx() {
    if (!ctx) {
      ctx = new(window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.12;
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }
  let masterGain = null;

  function _preinit(e) {
    if (!ctx) { try { ensureCtx(); ctx.resume(); } catch (ex) {} }
    document.removeEventListener('touchstart', _preinit, true);
    document.removeEventListener('touchend', _preinit, true);
    document.removeEventListener('click', _preinit, true);
  }
  document.addEventListener('touchstart', _preinit, true);
  document.addEventListener('touchend', _preinit, true);
  document.addEventListener('click', _preinit, true);

  function makeNoise(dur, amp) {
    const sr = ctx.sampleRate,
      len = sr * dur,
      buf = ctx.createBuffer(1, len, sr),
      d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * amp;
    return buf;
  }

  function glassClink() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator(),
      o2 = ctx.createOscillator(),
      g = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.value = 3200 + Math.random() * 800;
    o2.type = 'sine';
    o2.frequency.value = 2800 + Math.random() * 600;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o1.connect(g);
    o2.connect(g);
    g.connect(masterGain);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 0.15);
    o2.stop(t + 0.15);
  }

  function liquidPour() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime,
      dur = 0.3 + Math.random() * 0.2;
    const buf = makeNoise(dur, 0.5),
      src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 2000;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(masterGain);
    src.start(t);
    src.stop(t + dur);
  }

  function loopGlass() {
    if (!_playing) return;
    const tid = setTimeout(() => { if (ctx && _playing) { glassClink(); loopGlass(); } }, 1000 + Math.random() * 5000);
    timers.push(tid);
  }

  function loopLiquid() {
    if (!_playing) return;
    const tid = setTimeout(() => { if (ctx && _playing) { liquidPour(); loopLiquid(); } }, 1500 + Math.random() * 6000);
    timers.push(tid);
  }

  function loopChatter() {
    if (!_playing) return;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    if (!voices.length) { const tid = setTimeout(() => { if (_playing) loopChatter(); }, 1000); speechTimers.push(tid); return; }
    const tid = setTimeout(() => {
      if (!ctx || !_playing) return;
      try {
        const line = TAVERN_LINES[Math.floor(Math.random() * TAVERN_LINES.length)];
        const voice = voices[Math.floor(Math.random() * voices.length)];
        const utt = new SpeechSynthesisUtterance(line);
        utt.voice = voice;
        utt.rate = 0.7 + Math.random() * 0.4;
        utt.pitch = 0.7 + Math.random() * 0.6;
        utt.volume = 0.08 + Math.random() * 0.06;
        utt.onend = () => { const i = speechUtts.indexOf(utt); if (i >= 0) speechUtts.splice(i, 1); };
        utt.onerror = utt.onend;
        speechUtts.push(utt);
        speechSynthesis.speak(utt);
      } catch (e) {}
      loopChatter();
    }, 2000 + Math.random() * 3000);
    speechTimers.push(tid);
  }

  function createSoundNodes() {
    const bass = ctx.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = 55;
    const bassG = ctx.createGain();
    bassG.gain.value = 0.25;
    bass.connect(bassG);
    bassG.connect(masterGain);
    bass.start();

    const pad1 = ctx.createOscillator();
    pad1.type = 'triangle';
    pad1.frequency.value = 110;
    const pad2 = ctx.createOscillator();
    pad2.type = 'sine';
    pad2.frequency.value = 220;
    const padG = ctx.createGain();
    padG.gain.value = 0.08;
    pad1.connect(padG);
    pad2.connect(padG);
    padG.connect(masterGain);
    pad1.start();
    pad2.start();

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.03;
    lfo.connect(lfoG);
    lfoG.connect(bassG.gain);
    lfo.start();

    const nBuf = makeNoise(8, 0.3),
      nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    nSrc.loop = true;
    const nLp = ctx.createBiquadFilter();
    nLp.type = 'lowpass';
    nLp.frequency.value = 800;
    const nG = ctx.createGain();
    nG.gain.value = 0.04;
    nSrc.connect(nLp);
    nLp.connect(nG);
    nG.connect(masterGain);
    nSrc.start();

    const rBuf = makeNoise(12, 0.5),
      rSrc = ctx.createBufferSource();
    rSrc.buffer = rBuf;
    rSrc.loop = true;
    const rBp = ctx.createBiquadFilter();
    rBp.type = 'bandpass';
    rBp.frequency.value = 800;
    rBp.Q.value = 0.5;
    const rG = ctx.createGain();
    rG.gain.value = 0.02;
    const rMod = ctx.createOscillator();
    rMod.type = 'sine';
    rMod.frequency.value = 0.3;
    const rModG = ctx.createGain();
    rModG.gain.value = 0.01;
    rMod.connect(rModG);
    rModG.connect(rG.gain);
    rMod.start();
    rSrc.connect(rBp);
    rBp.connect(rG);
    rG.connect(masterGain);
    rSrc.start();

    const sBuf = makeNoise(8, 0.3),
      sSrc = ctx.createBufferSource();
    sSrc.buffer = sBuf;
    sSrc.loop = true;
    const sHp = ctx.createBiquadFilter();
    sHp.type = 'highpass';
    sHp.frequency.value = 3000;
    const sG = ctx.createGain();
    sG.gain.value = 0.005;
    sSrc.connect(sHp);
    sHp.connect(sG);
    sG.connect(masterGain);
    sSrc.start();

    nodes = { bass, pad1, pad2, nSrc, rSrc, sSrc, rMod, lfo };
  }

  function destroySoundNodes() {
    Object.values(nodes).forEach(n => { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
    nodes = {};
  }

  function start() {
    if (_playing) return;
    try { if (localStorage.getItem('ld_sound_master') === '0') return; } catch (e) {} // v86：音效总闸关闭时对局进局 startMusic 也被拦截（刷新后同样生效）
    try {
      ensureCtx();
      if (ctx.state === 'suspended') { ctx.resume(); }
      _playing = true;
      notify();
    } catch (e) {}
    try { createSoundNodes(); } catch (e) { console.warn('createSoundNodes error:', e); }
    try { loopGlass(); } catch (e) {}
    try { loopLiquid(); } catch (e) {}
    try { loopChatter(); } catch (e) {}
  }

  function stop() {
    if (!_playing) return;
    _playing = false;
    notify();
    timers.forEach(clearTimeout);
    timers = [];
    speechTimers.forEach(clearTimeout);
    speechTimers = [];
    speechUtts.forEach(u => { try { u.onend = null;
        u.onerror = null; } catch (e) {} });
    speechUtts = [];
    try { speechSynthesis.cancel(); } catch (e) {}
    destroySoundNodes();
    if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) {} }
  }

  function toggle() { _playing ? stop() : start(); }

  function isPlaying() { return _playing; }

  return { start, stop, toggle, isPlaying, addListener, _dbgState: () => ctx ? ctx.state : 'no ctx' };
})();

// ── Sfx 牌局反馈音效（ 批次二）：WebAudio 纯合成零资源，与氛围音乐独立开关 ──
const Sfx = (() => {
  let ctx = null, master = null;
  const KEY = 'liar_sfx';
  let _enabled = null;
  function getEnabled() {
    if (_enabled == null) { try { _enabled = localStorage.getItem(KEY) !== '0'; } catch (e) { _enabled = true; } }
    return _enabled;
  }
  function setEnabled(v) {
    _enabled = v;
    try { if (v) localStorage.removeItem(KEY); else localStorage.setItem(KEY, '0'); } catch (e) {}
  }
  function ensure() {
    if (!ctx) {
      try { ctx = new(window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, delay, slideTo) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function whoosh(dur, vol) { // 出牌"唰"声：带通滤波噪声扫频
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t);
  }
  const sounds = {
    card: function () { whoosh(0.16, 0.5); },                       // 出牌
    challenge: function () { tone(660, 0.12, 'square', 0.10); tone(880, 0.14, 'square', 0.10, 0.10); }, // 质疑（双音上行）
    roulette: function () { for (let i = 0; i < 6; i++) tone(1400 - i * 90, 0.05, 'square', 0.07, i * 0.09); }, // 扳机连滴答
    shot: function () { tone(160, 0.35, 'sine', 0.28, 0, 55); tone(90, 0.25, 'triangle', 0.2, 0.02, 50); }, // 中弹闷响
    safe: function () { tone(880, 0.08, 'sine', 0.08); },           // 存活轻响
    win: function () { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.13)); }, // 胜利琶音
    lose: function () { [440, 349, 262].forEach((f, i) => tone(f, 0.3, 'sine', 0.12, i * 0.16)); },           // 失败下行
  };
  function play(name) {
    if (!getEnabled()) return;
    const fn = sounds[name];
    if (!fn) return;
    if (!ensure() || ctx.state !== 'running') return;
    try { fn(); } catch (e) {}
  }
  return { play, getEnabled, setEnabled };
})();

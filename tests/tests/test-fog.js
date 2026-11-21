#!/usr/bin/env node
/**
 * v23 F2 白盒测试（v89 剥离精确质疑；v99 迷雾移除，聚焦模糊质疑链路）
 * 覆盖：模糊质疑 peek 流程 / 直判路径 / 天使盾按诚实 / 恶魔双倍 / knownStats 记录 /
 *       旧回放 mode:'exact' 自动降级模糊
 */
const fs = require('fs'), vm = require('vm');
const code = ['js/00-constants.js', 'js/05-i18n.js', 'js/25-roles.js', 'js/10-utils.js', 'js/20-engine.js', 'js/30-ai.js']
  .map(f => fs.readFileSync(f, 'utf8')).join('\n;\n');
const mkEl = () => new Proxy({ style: {}, classList: { add(){}, remove(){}, toggle(){} } }, {
  get(t, k) {
    if (k in t) return t[k];
    if (['appendChild', 'setAttribute', 'addEventListener', 'remove'].includes(k)) return () => {};
    if (k === 'querySelector' || k === 'querySelectorAll') return () => [];
    return t[k];
  }
});
const sb = {
  console, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 1),
  navigator: { userAgent: 'test', clipboard: {} },
  document: { getElementById: () => mkEl(), createElement: () => mkEl(), createTextNode: () => mkEl(), querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, body: mkEl(), documentElement: mkEl(), head: mkEl(), title: '' },
  localStorage: { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=String(v); }, removeItem(k){ delete this._d[k]; } },
  AudioContext: function(){ this.createOscillator = () => ({ connect(){}, start(){}, stop(){}, frequency: { value: 0, setValueAtTime(){} }, type: '' }); this.createGain = () => ({ connect(){}, gain: { value: 0 } }); this.destination = {}; this.currentTime = 0; this.resume = async () => {}; this.state = 'running'; },
  location: { href: 'test', protocol: 'file:', reload(){} }, history: { pushState(){} },
  matchMedia: () => ({ matches: false }), fetch: () => Promise.reject(new Error('x')),
};
sb.window = sb; sb.self = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(code, sb);
sb.__x = vm.runInContext('({ INIT, wrappedReducer, isHonest, hasAngel, hasDemon, AI_PRESETS, makePlayers })', sb);
const { INIT, wrappedReducer, isHonest, hasAngel, hasDemon, AI_PRESETS, makePlayers } = sb.__x;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };

// 构造质疑决策期状态：p1 出了 n 张（前 liarN 张为杂牌 = 吹牌），轮到 p2 决策
function mkChallengeState({ tableN = 3, liarN = tableN, shield = false, demonN = 0 } = {}) {
  let st = wrappedReducer(JSON.parse(JSON.stringify(INIT)), { type: 'START', aiConfigs: null, selectedAIs: [1, 2, 3], mpPlayers: null, difficulty: 'normal', maxPlay: 5 });
  const cards = [];
  for (let i = 0; i < tableN; i++) cards.push({ id: `t${i}`, suit: i < liarN ? 'X' : 'A', mod: i >= tableN - demonN && demonN > 0 ? 'demon' : 'normal' }); // suit X = 杂牌
  st = {
    ...st, phase: 'challenge_phase', curPlayer: 2,
    tableCards: cards, lastClaim: { playerId: 1, count: tableN, suit: 'A' },
    challengeShield: shield, challengeResult: null,
    rouletteShots: 0, doubleRisk: false, frenzy: false, rouletteShift: 0,
    playerStats: {}, knownStats: {},
  };
  return st;
}

// T1 模糊质疑 3 张（>2）→ 进 peek_phase（迷雾揭示流程）
{
  const st = mkChallengeState({ tableN: 3, liarN: 3 });
  const s = wrappedReducer(st, { type: 'CHALLENGE', cid: 2 });
  ok(s.phase === 'peek_phase' && s.challengerId === 2, 'T1 模糊质疑 3 张走 peek 流程');
}

// T2 模糊质疑 2 张（<=2）→ 直接 reveal 判定，跳过 peek
{
  const st = mkChallengeState({ tableN: 2, liarN: 2 });
  const s = wrappedReducer(st, { type: 'CHALLENGE', cid: 2 });
  ok(s.phase === 'reveal' && s.challengeResult === 'lied', 'T2 撒谎 2 张直判 lied');
}

// T3 诚实 2 张 → honest，质疑者受罚
{
  const st = mkChallengeState({ tableN: 2, liarN: 0 });
  let s = wrappedReducer(st, { type: 'CHALLENGE', cid: 2 });
  ok(s.challengeResult === 'honest', 'T3a 诚实判定');
  s = wrappedReducer(s, { type: 'REVEAL_COMPLETE' });
  ok(s.phase === 'roulette' && s.curPlayer === 2, 'T3b 诚实→质疑者(2号)上轮盘');
}

// T4 天使盾：模糊质疑按诚实处理
{
  const st = mkChallengeState({ tableN: 2, liarN: 2, shield: true });
  let s = wrappedReducer(st, { type: 'CHALLENGE', cid: 2 });
  ok(s.challengeResult === 'honest', 'T4a 盾生效→吹牌也判诚实');
  s = wrappedReducer(s, { type: 'REVEAL_COMPLETE' });
  ok(s.curPlayer === 2, 'T4b 盾下质疑者受罚');
}

// T5 恶魔牌双倍风险
{
  const st = mkChallengeState({ tableN: 2, liarN: 0, demonN: 1 });
  const s = wrappedReducer(st, { type: 'CHALLENGE', cid: 2 });
  ok(s.challengeResult === 'honest' && s.doubleRisk === true, 'T5 诚实但含恶魔→honest+doubleRisk');
}

// T6 旧回放兼容：历史局 mode:'exact' action 自动降级模糊（不再产生 exact 结果）
{
  const st = mkChallengeState({ tableN: 3 });
  const s = wrappedReducer(st, { type: 'CHALLENGE', cid: 2, mode: 'exact', guess: 3 });
  ok(s.challengeResult !== 'exact' && s.exactGuess === undefined, 'T6a 旧 exact action 走模糊');
  ok(s.phase === 'peek_phase', 'T6b 3 张照走 peek 流程');
}

// T7 knownStats 质疑数照常记录（模糊路径）
{
  const st = mkChallengeState({ tableN: 3 });
  const s = wrappedReducer(st, { type: 'CHALLENGE', cid: 2 });
  ok(s.knownStats && s.knownStats[2] && s.knownStats[2].challenges === 1, 'T7 质疑计入画像质疑数');
}

// T8 peek→reconsider→继续质疑全链
{
  const st = mkChallengeState({ tableN: 3, liarN: 3 });
  let s = wrappedReducer(st, { type: 'CHALLENGE', cid: 2 });
  s = wrappedReducer(s, { type: 'PEEK_REVEAL', cid: 1, ids: [] }); // 出牌者不展示
  ok(s.phase === 'reconsider_phase', 'T8a 不展示→reconsider');
  s = wrappedReducer(s, { type: 'RECONSIDER', cid: 1, decision: 'challenge' });
  ok(s.phase === 'reveal' && s.challengeResult === 'lied', 'T8b 继续质疑→直判 lied');
}

console.log(`\n✓ ${pass}/${pass + fail} 项断言通过`);
if (fail) process.exit(1);

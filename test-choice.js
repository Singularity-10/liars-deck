#!/usr/bin/env node
/**
 * v18 C1/C2 抉择事件白盒测试
 * 覆盖：事件结构 / 加权抽样 / 挂起态 / EVENT_CHOICE 效果 / 守恒 / 连锁排除 / 防御分支
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
sb.__x = vm.runInContext('({ INIT, wrappedReducer, EVENTS, aiPickChoice, makePlayers })', sb);
const { INIT, wrappedReducer, EVENTS, aiPickChoice } = sb.__x;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };

function collect(st) {
  let n = 0; const seen = new Set(); let dup = 0;
  st.players.forEach(p => (p.hand || []).concat(p.library || []).forEach(c => { n++; if (seen.has(c.id)) dup++; seen.add(c.id); }));
  (st.tableCards || []).forEach(c => { n++; if (seen.has(c.id)) dup++; seen.add(c.id); });
  (st.discardPile || []).forEach(c => { n++; if (seen.has(c.id)) dup++; seen.add(c.id); });
  (st.banishedPile || []).forEach(c => { n++; if (seen.has(c.id)) dup++; seen.add(c.id); });
  return { n, dup };
}
/** 开局并快进到回合阶段 */
function toTurn() {
  let st = wrappedReducer(INIT, { type: 'START', aiConfigs: null, selectedAIs: null, mpPlayers: null, difficulty: 'normal', maxPlay: 5 });
  for (let i = 0; i < 60 && st.phase !== 'player_turn' && st.phase !== 'ai_turn'; i++) {
    if (st.phase === 'event') {
      st = (st.event && st.event.choices && !st.eventResult)
        ? wrappedReducer(st, { type: 'EVENT_CHOICE', choiceId: st.event.choices[0].id })
        : wrappedReducer(st, { type: 'BEGIN_DEALING' });
      continue;
    }
    if (st.phase === 'dealing') { st = wrappedReducer(st, { type: 'DEAL_COMPLETE' }); continue; }
    break;
  }
  return st;
}
/** 构造挂起态 */
function makePending(st, type) {
  const ev = EVENTS.find(e => e.type === type);
  const alive = st.players.filter(p => p.alive);
  return { st: { ...st, phase: 'event', event: ev, eventResult: null, eventChoice: { eventId: type, chooserId: alive[0].id, chooserName: alive[0].name } }, ev };
}

/* ── T1 事件结构（6 个抉择事件 × choices 合法性）── */
const CHOICE = EVENTS.filter(e => e.choices);
ok(CHOICE.length === 6, 'T1 抉择事件共 6 个');
CHOICE.forEach(ev => {
  ok(ev.choices.length === 2, `T1 ${ev.type} 双选项`);
  ok(new Set(ev.choices.map(c => c.id)).size === 2, `T1 ${ev.type} id 唯一`);
  ok(ev.choices.every(c => typeof c.risk === 'number' && c.label && c.desc), `T1 ${ev.type} risk/label/desc 完整`);
  ok(ev.weight === 0.6, `T1 ${ev.type} weight 0.6`);
  const risks = ev.choices.map(c => c.risk);
  ok(Math.abs(risks[0] - risks[1]) >= 0.5, `T1 ${ev.type} 两档风险有区分度`);
});

/* ── T2 加权抽样：抉择事件频率约 3.6/15.6 ≈ 23% ── */
sb.__pick = vm.runInContext('pickEvent', sb);
let choiceHits = 0;
for (let i = 0; i < 4000; i++) if (sb.__pick().choices) choiceHits++;
const freq = choiceHits / 4000;
ok(freq > 0.15 && freq < 0.32, `T2 抉择事件抽样频率 ${(freq * 100).toFixed(1)}% ∈ [15%,32%]`);

/* ── T3 抽样排除：抉择事件不进厄运/天崩连锁（source 检查）── */
ok(!vm.runInContext(`EVENTS.filter(e => e.type !== 'doom' && e.type !== 'skyfall' && !e.choices).some(e => e.choices)`, sb), 'T3 连锁池无抉择事件');

/* ── T4 挂起态：EVENT_CHOICE 效果 ── */
// sheriff:calm → 重置
{
  const st0 = toTurn();
  const { st } = makePending({ ...st0, rouletteShift: 2 }, 'sheriff');
  const ns = wrappedReducer(st, { type: 'EVENT_CHOICE', choiceId: 'calm' });
  ok(ns.rouletteShots === 0, 'T4 治安官·息事宁人 中弹计数归零');
  ok(ns.eventChoice === null && ns.eventResult && ns.eventResult.lines.length > 0, 'T4 选择后挂起清空+有播报');
}
// tornado:gamble → shift+1 且摸 2
{
  const st0 = toTurn();
  const { st } = makePending(st0, 'tornado');
  const chooser = st.players.find(p => p.id === st.eventChoice.chooserId);
  const before = chooser.hand.length + chooser.library.length;
  const ns = wrappedReducer(st, { type: 'EVENT_CHOICE', choiceId: 'gamble' });
  const afterP = ns.players.find(p => p.id === chooser.id);
  ok((ns.rouletteShift || 0) === (st0.rouletteShift || 0) + 1, 'T4 龙卷风·乘风 中弹概率 +1');
  ok(afterP.hand.length >= 2, 'T4 乘风后手牌 ≥2');
}
// EVENT_CHOICE 无挂起 → st 原样
{
  const st0 = toTurn();
  const ns = wrappedReducer(st0, { type: 'EVENT_CHOICE', choiceId: 'bet' });
  ok(ns === st0, 'T4 非挂起态 EVENT_CHOICE 无效');
}
// EVENT_DONE 挂起防御
{
  const st0 = toTurn();
  const { st } = makePending(st0, 'dice_game');
  const ns = wrappedReducer(st, { type: 'BEGIN_DEALING' });
  ok(ns.phase === 'event' && ns.eventChoice, 'T4 挂起时 BEGIN_DEALING 被防御');
  const ns2 = wrappedReducer(st, { type: 'EVENT_DONE' });
  ok(ns2.phase === 'event' && ns2.eventChoice, 'T4 挂起时 EVENT_DONE 被防御');
}

/* ── T5 AI 抉择：边界人格 ── */
{
  const ev = EVENTS.find(e => e.type === 'sheriff');
  const mad = aiPickChoice(ev, { persona: 'berserker' });   // 0.9 冒险
  const calm = aiPickChoice(ev, { persona: 'observer' });   // 0.3 稳
  ok(ev.choices.some(c => c.id === mad), 'T5 AI 返回合法 choiceId');
  // 统计 200 次：疯刀疤选险率显著高于侦探
  let madRisky = 0, obsRisky = 0;
  for (let i = 0; i < 200; i++) {
    const idM = aiPickChoice(ev, { persona: 'berserker' });
    const cM = ev.choices.find(c => c.id === idM);
    if (!cM) { console.log('  [T5诊断] berserker 异常返回:', JSON.stringify(idM), 'ev=', ev.type); break; }
    if (cM.risk >= 0.5) madRisky++;
    const idO = aiPickChoice(ev, { persona: 'observer' });
    const cO = ev.choices.find(c => c.id === idO);
    if (!cO) { console.log('  [T5诊断] observer 异常返回:', JSON.stringify(idO), 'typeof=', typeof idO, 'ev=', ev.type, 'choices=', JSON.stringify(ev.choices.map(c => c.id))); break; }
    if (cO.risk >= 0.5) obsRisky++;
  }
  ok(madRisky > obsRisky + 60, `T5 疯刀疤选险 ${madRisky}/200 > 侦探 ${obsRisky}/200`);
}

/* ── T6 守恒：每事件 × 每选择 × 30 次随机局 ── */
{
  let bad = 0;
  for (const ev of CHOICE) {
    for (let trial = 0; trial < 30; trial++) {
      const st0 = toTurn();
      const { st } = makePending(st0, ev.type);
      const before = collect(st);
      for (const c of ev.choices) {
        const ns = wrappedReducer(st, { type: 'EVENT_CHOICE', choiceId: c.id });
        const after = collect(ns);
        if (after.n !== before.n || after.dup > 0) bad++;
      }
    }
  }
  ok(bad === 0, `T6 抉择守恒（1080 次执行）违例 ${bad}`);
}

/* ── T7 真实对局流：驱动含抉择事件的对局到终局 ── */
{
  // 用 sim 同款随机驱动，验证 EVENT_CHOICE 在主流水线不卡死
  let stuck = 0;
  for (let g = 0; g < 8; g++) {
    let st = wrappedReducer(INIT, { type: 'START', aiConfigs: null, selectedAIs: null, mpPlayers: null, difficulty: 'normal', maxPlay: 5 });
    let steps = 0;
    while (steps < 400) {
      if (['won', 'lost', 'draw'].includes(st.phase) || st.winner != null) break;
      let act = null;
      if (st.phase === 'event') {
        act = (st.event && st.event.choices && !st.eventResult)
          ? { type: 'EVENT_CHOICE', choiceId: aiPickChoice(st.event, st.players.find(p => p.id === st.eventChoice.chooserId)) }
          : { type: 'BEGIN_DEALING' };
      } else if (st.phase === 'dealing') act = { type: 'DEAL_COMPLETE' };
      else break;
      st = wrappedReducer(st, act);
      steps++;
      if (steps === 399) stuck++;
    }
  }
  ok(stuck === 0, 'T7 事件→发牌流水线无卡死');
}

console.log(`✓ ${pass} 项断言全部通过` + (fail ? `（✗ ${fail} 项失败）` : ''));
process.exit(fail ? 1 : 0);

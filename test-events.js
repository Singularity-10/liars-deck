#!/usr/bin/env node
/**
 * 定向白盒测试：12 个新事件的效果断言
 * 直接构造状态驱动 applyEvent / reducer，逐事件校验语义。
 */
const fs = require('fs');
const path = require('path');

let SEED = Number(process.argv[2] || 42);
Math.random = function () {
  SEED = (SEED * 1103515245 + 12345) % 2147483648;
  return SEED / 2147483648;
};
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};

const DIR = path.join(__dirname, 'js');
const modules = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js'];
const code = modules.map(m => fs.readFileSync(path.join(DIR, m), 'utf8')).join('\n;\n');
const sandbox = new Function(`${code}\nreturn { INIT, wrappedReducer, applyEvent, EVENTS, isBlackout, activeFrozen };`)();
const { INIT, wrappedReducer, applyEvent, EVENTS, isBlackout, activeFrozen } = sandbox;

let fails = 0, checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) { console.log('  ✗ ' + msg); fails++; }
}
const EV = t => EVENTS.find(e => e.type === t);
function allCards(st) {
  const c = [];
  st.players.forEach(p => { c.push(...(p.hand || []), ...(p.library || [])); });
  c.push(...(st.tableCards || []), ...(st.discardPile || []), ...(st.banishedPile || []));
  return c;
}
function mkState(hands, extra = {}) {
  // hands: 数组的数组，按玩家 id
  const players = [0, 1, 2, 3].map(i => ({
    id: i, name: ['你', '独眼杰克', '瘸腿老汤姆', '红发玛丽'][i],
    isHuman: i === 0, isAI: i > 0, alive: true,
    hand: (hands[i] || []).map((c, j) => ({ id: `t${i}-${j}`, suit: c[0], mod: c[1] || 'normal' })),
    library: [],
  }));
  return { ...INIT, players, ...extra };
}
function apply(st, evType, ctx = {}) {
  return applyEvent(EV(evType), st.players, 0, st.targetSuit || 'A', st.reversed ?? false, st.cardSeq || 100, {
    difficulty: 'normal', frenzy: false, round: 3,
    banishedCount: (st.banishedPile || []).length,
    specialUsers: st.specialUsers || [], rouletteShift: st.rouletteShift || 0,
    discardPile: st.discardPile || [],
    ...ctx,
  });
}

console.log('── T1: 洪水（每人一半手牌入弃牌区，向上取整） ──');
{
  const st = mkState([['A'], ['A', 'K', 'Q', 'J'], ['A', 'K'], []]);
  const er = apply(st, 'flood');
  const hands = er.players.map(p => p.hand.length);
  assert(hands[0] === 0, `T1 1张牌半张=ceil(1/2)=1 应弃光，实际剩 ${hands[0]}`);
  assert(hands[1] === 2, `T1 4张弃2剩2，实际剩 ${hands[1]}`);
  assert(hands[2] === 1, `T1 2张弃1剩1，实际剩 ${hands[2]}`);
  assert(er.discardPile.length === 4, `T1 弃牌区应4张，实际 ${er.discardPile.length}`);
}

console.log('── T2: 厄运（三个互不相同子事件，排除自身与天崩） ──');
{
  const st = mkState([['A'], ['A'], ['A'], ['A']]);
  const lines = apply(st, 'doom').eventResult.lines[0];
  assert(lines.includes('厄运连环'), 'T2 应有连环标题');
  // 跑多次确认子事件互不相同
  let ok = true;
  for (let i = 0; i < 30; i++) {
    const l = apply(st, 'doom').eventResult.lines[0];
    const names = l.replace('厄运连环：', '').split(' → ');
    if (new Set(names).size !== 3 || names.some(n => n === '厄运' || n === '天崩')) { ok = false; break; }
  }
  assert(ok, 'T2 30次抽取子事件应互不相同且不含厄运/天崩');
}

console.log('── T3: 蘑菇云（全员即时惩罚，死者牌扫入弃牌区） ──');
{
  const st = mkState([['A', 'A'], ['A'], ['A'], ['A']]);
  const before = allCards(st).length;
  const er = apply(st, 'mushroom_cloud');
  const after = er.players.reduce((n, p) => n + p.hand.length, 0) + er.discardPile.length;
  assert(after === before, `T3 牌守恒 ${before}→${after}`);
  assert(er.eventResult.lines[0].includes('蘑菇云惩罚'), 'T3 应有结果行');
  er.players.forEach(p => {
    if (!p.alive) assert(p.hand.length === 0, `T3 死者${p.name}手牌应清空`);
  });
}

console.log('── T4: 希望？（随机观战者 + 进入回合记录） ──');
{
  const st = mkState([['A'], ['A'], ['A'], ['A']]);
  const er = apply(st, 'hope_q', { round: 3 });
  assert(er.spectateId !== null && er.spectateId >= 0 && er.spectateId <= 3, 'T4 应有观战者');
  assert(er.spectateEnterRound === 3, 'T4 进入回合应为3');
}

console.log('── T5: 观战解除时机（紧随事件的发牌不解除，回合推进后解除） ──');
{
  let st = mkState([['A'], ['A'], ['A'], ['A']], { spectateId: 1, spectateEnterRound: 3, round: 3 });
  st = wrappedReducer(st, { type: 'DEAL_COMPLETE' });
  assert(st.spectateId === 1, 'T5 同回合发牌不应解除观战');
  st = wrappedReducer({ ...st, round: 6 }, { type: 'DEAL_COMPLETE' });
  assert(st.spectateId === null, 'T5 回合推进后发牌应解除观战');
}

console.log('── T6: 激发（用过特殊牌者减2张非目标牌，J 不算非目标） ──');
{
  // p1 用过特殊牌，手牌 A K Q J → 非目标(K,Q)2张全减；p2 没用过不减
  const st = mkState([['A'], ['A', 'K', 'Q', 'J'], ['A', 'K'], ['A']], { specialUsers: [1] });
  const er = apply(st, 'inspire');
  assert(er.players[1].hand.length === 2, `T6 p1 应剩2张(A,J)，实际 ${er.players[1].hand.length}`);
  assert(er.players[1].hand.every(c => c.suit === 'A' || c.suit === 'J'), 'T6 p1 剩牌应为目标牌或J');
  assert(er.players[2].hand.length === 2, `T6 p2 未用过不减，实际 ${er.players[2].hand.length}`);
  assert(er.discardPile.length === 2, `T6 弃牌区应2张，实际 ${er.discardPile.length}`);
}

console.log('── T7: 陨石（十次随机销毁，牌进弃牌区守恒） ──');
{
  const st = mkState([['A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A']]);
  const before = allCards(st).length;
  const er = apply(st, 'meteor');
  const after = er.players.reduce((n, p) => n + p.hand.length, 0) + er.discardPile.length;
  assert(er.players.reduce((n, p) => n + p.hand.length, 0) === before - 10, 'T7 应销毁恰好10张');
  assert(after === before, `T7 守恒 ${before}→${after}`);
}

console.log('── T8: 雪崩（八次冻结，冻结牌出牌被拒，让过/出牌后解冻） ──');
{
  const st = mkState([['A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A'], ['A'], ['A']]);
  const er = apply(st, 'avalanche');
  const frozenCount = er.frozen.length;
  assert(frozenCount === 8, `T8 10张牌应冻满8张，实际 ${frozenCount}`);
  // 冻结牌出牌被拒
  // v15 新语义：冻结持续到下一轮（appliedAtRound 记录）
  let st2 = mkState([['A', 'A'], ['A'], ['A'], ['A']]);
  st2 = {
    ...st2, frozen: { 0: ['t0-0'] },
    frozenAdds: [{ playerId: 0, cardId: 't0-0', appliedAtRound: 5 }],
    phase: 'player_turn', curPlayer: 0, round: 5,
  };
  const ns = wrappedReducer(st2, { type: 'PLAY', ids: ['t0-0'] });
  assert(ns === st2, 'T8 本轮出冻结牌应被拒（状态不变）');
  // 本轮出未冻结牌：冻结保留（持续到下一轮）
  const ns2 = wrappedReducer(st2, { type: 'PLAY', ids: ['t0-1'] });
  assert((ns2.frozen[0] || []).includes('t0-0'), 'T8 本轮出牌后冻结应保留');
  // 下一轮：冻结过期，可出
  const ns3 = wrappedReducer({ ...st2, round: 6 }, { type: 'PLAY', ids: ['t0-0'] });
  assert(ns3 !== st2 && !ns3.players[0].hand.some(c => c.id === 't0-0'), 'T8 下一轮冻结牌可出');
}

console.log('── T9: 黑潮（五张放逐含牌库，上限10张后转普通弃牌） ──');
{
  const st = mkState([
    ['A', 'A', 'A', 'A'],
    ['A', 'A'],
    ['A', 'A'],
    ['A', 'A'],
  ]);
  // 给每人塞牌库
  st.players.forEach((p, i) => { p.library = [{ id: `lib${i}`, suit: 'K', mod: 'normal' }]; });
  const er = apply(st, 'blacktide');
  assert(er.banishedPile.length === 5, `T9 应放逐5张，实际 ${er.banishedPile.length}`);
  const total = er.players.reduce((n, p) => n + p.hand.length + p.library.length, 0) + er.banishedPile.length + er.discardPile.length;
  assert(total === 4 + 2 + 2 + 2 + 4, `T9 守恒 14→${total}`);
  // v15 上限测试：已有14张放逐 → 只再放逐1张（补满15）；已有15张 → 事件整体失效
  const st2 = mkState([['A', 'A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A', 'A']]);
  const er2 = apply(st2, 'blacktide', { banishedCount: 14 });
  assert(er2.banishedPile.length === 1, `T9 14张时应只补1张至15，实际 ${er2.banishedPile.length}`);
  const st3 = mkState([['A', 'A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A', 'A']]);
  const er3 = apply(st3, 'blacktide', { banishedCount: 15 });
  assert(er3.banishedPile.length === 0 && er3.discardPile.length === 0, `T9 满后事件应失效（放逐${er3.banishedPile.length} 弃牌${er3.discardPile.length}）`);
}

console.log('── T10: 希望！（概率重置+死者复活16张+即时惩罚） ──');
{
  const st = mkState([['A', 'A'], ['A'], [], []], { rouletteShift: 1, rouletteShots: 3 });
  // 杀死 p2、p3，各 16 张牌已在弃牌区（复活有牌可取，不触发防御性补牌）
  st.players[2].alive = false;
  st.players[3].alive = false;
  const mk = i => Array.from({ length: 16 }, (_, j) => ({ id: `d${i}-${j}`, suit: 'Q', mod: 'normal' }));
  const deadCards = [...mk(2), ...mk(3)];
  const er = apply(st, 'hope_bang', { discardPile: deadCards });
  assert(er.rouletteShift === 0 && er.rouletteShotsReset, 'T10 概率应重置');
  // p2/p3 复活（或复活后又死）——两者之一
  const revivedOrDead = er.players.filter(p => [2, 3].includes(p.id));
  revivedOrDead.forEach(p => {
    if (p.alive) assert(p.hand.length + p.library.length === 16, `T10 复活者应持16张，实际 ${p.hand.length + p.library.length}`);
    else assert(p.hand.length === 0, 'T10 复活失败者应无牌');
  });
  const total = er.players.reduce((n, p) => n + p.hand.length + p.library.length, 0) + er.discardPile.length;
  assert(total === 2 + 1 + 32, `T10 守恒 35→${total}`);
}

console.log('── T11: 长夜（黑潮内嵌+两回合手牌不可见） ──');
{
  const st = mkState([['A', 'A', 'A', 'A'], ['A', 'A'], ['A', 'A'], ['A', 'A']]);
  const er = apply(st, 'long_night', { round: 3 });
  assert(er.blackoutUntil === 5, `T11 blackoutUntil 应为 3+2=5，实际 ${er.blackoutUntil}`);
  assert(er.banishedPile.length === 5, `T11 内嵌黑潮应放逐5张，实际 ${er.banishedPile.length}`);
  assert(isBlackout({ round: 4, blackoutUntil: er.blackoutUntil }), 'T11 round4 应在长夜中');
  assert(!isBlackout({ round: 5, blackoutUntil: er.blackoutUntil }), 'T11 round5 应脱离长夜');
}

console.log('── T12: 天崩（其余事件全触发+概率+1/6+事件放逐，防递归） ──');
{
  const st = mkState([['A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A', 'A']]);
  const er = apply(st, 'skyfall', { rouletteShift: 0 });
  assert(er.rouletteShift === 1, `T12 概率应+1/6，实际 ${er.rouletteShift}`);
  assert(er.exileSelf === true, 'T12 应标记事件放逐');
  // mergeEventState 后 eventExile 含 skyfall → pickEvent 不再抽到
  let st2 = { ...st, eventExile: [] };
  const merged = (() => {
    // 直接调 reducer 路径太繁琐，手动复刻 merge 规则验证
    const er2 = applyEvent(EV('skyfall'), st2.players, 0, 'A', false, 100, { difficulty: 'normal', round: 3, discardPile: [] });
    return er2.exileSelf ? [...st2.eventExile, 'skyfall'] : st2.eventExile;
  })();
  assert(merged.includes('skyfall'), 'T12 eventExile 应含 skyfall');
  const pool = EVENTS.filter(e => !merged.includes(e.type));
  assert(!pool.some(e => e.type === 'skyfall'), 'T12 放逐后事件池无天崩');
  assert(er.eventResult.lines[er.eventResult.lines.length - 1].includes('天崩'), 'T12 应有天崩总结行');
}

console.log('── T13: 转换（出牌顺序反转） ──');
{
  const st = mkState([['A'], ['A'], ['A'], ['A']], { reversed: false });
  assert(apply(st, 'switch_dir').reverseOrder === true, 'T13 顺→逆');
  const st2 = mkState([['A'], ['A'], ['A'], ['A']], { reversed: true });
  assert(apply(st2, 'switch_dir').reverseOrder === false, 'T13 逆→顺');
}

console.log('── T14: 特殊牌使用追踪（PLAY 后 specialUsers 更新） ──');
{
  let st = mkState([['A'], ['K', 'angel'], ['A'], ['A']], { phase: 'player_turn', curPlayer: 0 });
  st = wrappedReducer(st, { type: 'PLAY', ids: ['t0-0'] });
  assert(!st.specialUsers.includes(0), 'T14 普通牌不计');
  let st2 = mkState([[['K', 'angel']], [['A']], [['A']], [['A']]], { phase: 'player_turn', curPlayer: 0 });
  st2 = wrappedReducer(st2, { type: 'PLAY', ids: ['t0-0'] });
  assert(st2.specialUsers.includes(0), 'T14 天使牌应记录使用者');
}

console.log('── T15: 观战者唯一持牌 → 触发重发（防死锁捷径）+ 牌守恒 ──');
{
  let st = mkState([[], [], [], ['A', 'A', 'A', 'A']], { phase: 'player_turn', curPlayer: 0, spectateId: 3, spectateEnterRound: 1, round: 2 });
  const before = allCards(st).length;
  // p0 空手让过 → 引擎判定耗尽 → library_dealt
  const ns = wrappedReducer(st, { type: 'CONTINUE' });
  assert(ns.phase === 'library_dealt', `T15 应触发重发，实际 ${ns.phase}`);
  const rs = wrappedReducer(ns, { type: 'LIBRARY_REDEAL' });
  assert(rs.phase === 'event', 'T15 重发后应进事件');
  // 驱动完事件横幅→发牌→DEAL_COMPLETE，观战应在发牌时解除（回合已推进）
  let fin = wrappedReducer(rs, { type: 'BEGIN_DEALING' });
  fin = wrappedReducer(fin, { type: 'DEAL_COMPLETE' });
  // hope_q 可直抽，也可经 doom/skyfall 连锁抽中（v26.1 修正：原断言漏了连锁路径，seed 44 必现）
  const chainHope = ['hope_q', 'doom', 'skyfall'].includes(rs.event.type);
  assert(fin.spectateId === null || chainHope, `T15 重发链路后观战应解除，实际 ${fin.spectateId}`);
  if (chainHope && fin.spectateId !== null) assert([0, 1, 2, 3].includes(fin.spectateId), 'T15 连锁观战者应合法');
  // 牌量：4 张 + 防御性补牌 → 总量 64
  const after = allCards(fin).length;
  assert(after === 68, `T15 重发后总量应为 4+64=68，实际 ${after}`);
}


console.log('── T16: 冻结跨轮持续（本轮拒、下轮放行）──');
{
  let st = mkState([[['K'], ['K'], ['Q'], ['A']], [['A']], [['A']], [['A']]], { phase: 'player_turn', curPlayer: 0, round: 5 });
  const er = applyEvent(EV('avalanche'), st.players, 0, 'K', false, 100, { difficulty: 'normal', round: 5 });
  const fz = er.frozen.filter(f => f.playerId === 0).map(f => f.cardId);
  if (fz.length) {
    st = { ...st, players: er.players, frozen: { 0: fz }, frozenAdds: er.frozen.filter(f => f.playerId === 0), round: 5 };
    const ns1 = wrappedReducer(st, { type: 'PLAY', ids: [fz[0]] });
    assert(ns1 === st, 'T16 本轮出冻结牌被拒');
    const st2 = { ...st, round: 6 };
    const ns2 = wrappedReducer(st2, { type: 'PLAY', ids: [fz[0]] });
    assert(ns2 !== st2 && !ns2.players[0].hand.some(c => c.id === fz[0]), 'T16 下一轮出冻结牌成功（过期自动放行）');
  }
}

console.log('── T17: 让过（CONTINUE）保留未过期冻结 ──');
{
  // p0 六张手牌，部分被冻结（确保不触发全冻结例外）
  let st = mkState([[['K'], ['K'], ['Q'], ['A'], ['A'], ['A']], [['A']], [['A']], [['A']]], { phase: 'challenge_phase', curPlayer: 1, round: 5, lastClaim: { playerId: 0, count: 1, suit: 'K' } });
  const er = applyEvent(EV('avalanche'), st.players, 1, 'K', false, 100, { difficulty: 'normal', round: 5 });
  const fz = er.frozen.filter(f => f.playerId === 0).map(f => f.cardId);
  const p0hand = er.players[0].hand;
  if (fz.length && fz.length < p0hand.length) {
    st = { ...st, players: er.players, frozen: { 0: fz }, frozenAdds: er.frozen.filter(f => f.playerId === 0) };
    const ns = wrappedReducer(st, { type: 'CONTINUE' });
    const after = (ns.frozen || {})[0] || [];
    assert(after.length === fz.length, `T17 未过期冻结应保留（${fz.length}→${after.length}）`);
  } else {
    assert(false, `T17 测试前提不成立（冻结${fz.length}/手牌${p0hand.length}，需部分冻结）`);
  }
}

console.log('── T18: 手牌全部冻结时让过 → 全解冻（防死锁底线）──');
{
  const st = mkState([[['K'], ['Q']], [['A']], [['A']], [['A']]], { phase: 'challenge_phase', curPlayer: 1, round: 5, lastClaim: { playerId: 0, count: 1, suit: 'K' } });
  const fz = st.players[0].hand.map(c => c.id); // 全部 2 张冻结
  const st2 = {
    ...st,
    frozen: { 0: fz },
    frozenAdds: fz.map(id => ({ playerId: 0, cardId: id, appliedAtRound: 5 })),
  };
  const ns = wrappedReducer(st2, { type: 'CONTINUE' });
  const after = (ns.frozen || {})[0] || [];
  assert(after.length === 0, `T18 全冻结让过应全解冻（剩 ${after.length}）`);
}


console.log('── T19: 事件遥测（eventTally 计数 + floodLoss 冲走量）──');
{
  // 厄运三连：tally 应含 doom 本身 + 3 个互不相同子事件
  const st = mkState([['A', 'A', 'A', 'A'], ['A', 'A'], ['A', 'A'], ['A', 'A']]);
  const er = apply(st, 'doom');
  assert(er.eventTally.doom === 1, `T19 厄运自身计数1（实际 ${er.eventTally.doom}）`);
  const subs = Object.entries(er.eventTally).filter(([k]) => k !== 'doom');
  const subSum = subs.reduce((n, [, v]) => n + v, 0);
  // 3 个子事件；若抽中长夜会内嵌黑潮 → 合计可达 4
  assert(subSum === 3 || subSum === 4, `T19 厄运子事件合计3或4（实际 ${subSum}）`);
  assert(subs.every(([k]) => k !== 'doom' && k !== 'skyfall'), 'T19 子事件不含厄运/天崩');
  assert(new Set(subs.map(([k]) => k)).size === subs.length, 'T19 子事件互不相同');
  if (er.eventTally.longnight) assert(er.eventTally.blacktide === 1, 'T19 长夜内嵌黑潮被计数');
  // 洪水：floodLoss 逐玩家记录
  const st2 = mkState([['A', 'A', 'A', 'A', 'A', 'A'], ['A', 'A', 'A', 'A'], ['A', 'A'], []]);
  const er2 = apply(st2, 'flood');
  const lossSum = Object.values(er2.floodLoss || {}).reduce((a, b) => a + b, 0);
  assert(lossSum === 3 + 2 + 1, `T19 洪水冲走量合计6（实际 ${lossSum}）`);
  assert((er2.floodLoss[0] || 0) === 3 && (er2.floodLoss[1] || 0) === 2 && (er2.floodLoss[2] || 0) === 1, 'T19 floodLoss 按玩家分布正确');
}

console.log(fails === 0 ? `\n✓ ${checks} 项断言全部通过` : `\n✗ ${fails}/${checks} 项失败`);
process.exit(fails === 0 ? 0 : 1);

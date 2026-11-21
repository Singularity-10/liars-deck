/**
 * test-persona.js — F3 出牌上限 + B1 人格/局势动态层白盒
 * 用法：node test-persona.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = 20260902;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

const code = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js'].map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const { AI_PRESETS, AI_NAMES, AI_PERSONAS, makePlayers, aiPlay, aiChallenge, personaMods, aiPickChoice, INIT, wrappedReducer } =
  new Function(code + '\nreturn { AI_PRESETS, AI_NAMES, AI_PERSONAS, makePlayers, aiPlay, aiChallenge, personaMods, aiPickChoice, INIT, wrappedReducer };')();

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

const mkHand = (spec) => spec.map((s, i) => ({ id: 'c' + i, suit: s[0], mod: s[1] || 'normal' }));

console.log('── P1: F3 AI 出牌张数 ≤ maxPlay ──');
{
  const hand = mkHand([['A'], ['A'], ['A'], ['A'], ['A'], ['A'], ['A'], ['A']]);
  for (const mp of [1, 2, 3, 5]) {
    let over = 0;
    for (let i = 0; i < 120; i++) {
      const d = aiPlay(hand, 'A', 'impatient', { honestChance: 0, maxCards: 5, minCards: 1 }, { maxPlay: mp });
      if (d.cards.length > mp) over++;
    }
    assert(over === 0, `maxPlay=${mp} 无超限（违例 ${over}）`);
  }
  // maxPlay=1 → 恒 1 张
  let all1 = true;
  for (let i = 0; i < 60; i++) {
    const d = aiPlay(hand, 'A', 'aggressive', { maxCards: 4, minCards: 1 }, { maxPlay: 1 });
    if (d.cards.length !== 1) all1 = false;
  }
  assert(all1, 'maxPlay=1 时恒出 1 张');
  // 非法输入防御：maxPlay 8 → 钳制 5
  let over5 = 0;
  for (let i = 0; i < 120; i++) {
    const d = aiPlay(hand, 'A', 'impatient', { honestChance: 0, maxCards: 6, minCards: 3 }, { maxPlay: 8 });
    if (d.cards.length > 5) over5++;
  }
  assert(over5 === 0, 'maxPlay=8 非法值被钳到 5');
}

console.log('── P2: F3 引擎 PLAY/AI_PLAY 防御性钳制 ──');
{
  const reducer = wrappedReducer;
  let st = JSON.parse(JSON.stringify(INIT));
  st = reducer(st, { type: 'START', aiConfigs: null, selectedAIs: null, mpPlayers: null, difficulty: 'normal', maxPlay: 2 });
  assert(st.maxPlay === 2, 'START 后 st.maxPlay=2');
  assert(st.phase === 'event' || st.phase === 'player_turn' || st.phase === 'ai_turn' || st.phase === 'dealing', 'START 后进入流程 phase=' + st.phase);
  // 直接推到玩家出牌：构造 PLAY——需要 phase=player_turn 且 curPlayer=0（人类）
  let guard = 0;
  while ((st.phase !== 'player_turn' || st.curPlayer !== 0) && guard++ < 400) {
    if (st.phase === 'event') {
      // v18：抉择事件挂起时先自动抉择，否则 BEGIN_DEALING
      if (st.event && st.event.choices && st.eventChoice && !st.eventResult) {
        const ch = st.players.find(p => p.id === st.eventChoice.chooserId);
        st = reducer(st, { type: 'EVENT_CHOICE', choiceId: aiPickChoice(st.event, ch) });
      } else {
        st = reducer(st, { type: 'BEGIN_DEALING' });
      }
    }
    else if (st.phase === 'dealing') st = reducer(st, { type: 'DEAL_COMPLETE' });
    else if (st.phase === 'library_dealt') st = reducer(st, { type: 'LIBRARY_REDEAL' });
    else if (st.phase === 'ai_turn') { const ai = st.players.find(p => p.id === st.curPlayer); const d = aiPlay(ai.hand, st.targetSuit, ai.personality, ai.customConfig, { frozen: [] }); st = d.cards.length ? reducer(st, { type: 'AI_PLAY', pid: ai.id, cards: d.cards }) : reducer(st, { type: 'CONTINUE' }); }
    else if (st.phase === 'challenge_phase' || st.phase === 'peek_phase' || st.phase === 'reconsider_phase') st = reducer(st, { type: 'CONTINUE' });
    else if (st.phase === 'reveal' || st.phase === 'roulette') { break; }
    else break;
  }
  if (st.phase === 'player_turn' && st.curPlayer === 0) {
    const me = st.players.find(p => p.id === 0);
    const ids = me.hand.slice(0, 6).map(c => c.id); // 试图出 6 张（上限 2）
    st = reducer(st, { type: 'PLAY', ids });
    assert(st.tableCards.length <= 3, `PLAY 6 张被钳到 ≤3（实际 ${st.tableCards.length}）`);
    assert(st.tableCards.every(c => ids.slice(0, 3).includes(c.id)), '桌面牌 = 尝试出牌的前 3 张（含冻结过滤）');
  } else {
    assert(false, '未能推到人类回合（phase=' + st.phase + '）');
  }
}

console.log('── P3: F3 maxPlay=1 对 AI 出牌张数的全局影响（bluffSuccess 节奏变慢）──');
{
  // 统计 200 次 AI_PLAY 张数分布：maxPlay=5 vs maxPlay=1
  const hand = mkHand([['K'], ['K'], ['Q'], ['Q'], ['A'], ['J']]);
  const sum = mp => { let s = 0; for (let i = 0; i < 200; i++) s += aiPlay(hand, 'A', 'aggressive', null, { maxPlay: mp }).cards.length; return s / 200; };
  const avg5 = sum(5), avg1 = sum(1);
  assert(avg1 < avg5 - 0.5, `N=1 均值显著更小（${avg1.toFixed(2)} vs ${avg5.toFixed(2)}）`);
}

console.log('── P4: B1 personaMods 纯函数分支 ──');
{
  const base = { persona: null, handCount: 4, aliveCount: 4, round: 2, lastCaught: false };
  const m0 = personaMods(base);
  assert(m0.honestAdj === 0 && m0.challengeAdj === 0, '基准无修正');
  // 通用局势
  assert(personaMods({ ...base, handCount: 7 }).challengeAdj > 0, '手牌>5 激进（质疑↑）');
  assert(personaMods({ ...base, handCount: 2 }).honestAdj > 0, '手牌<3 保守（诚实↑）');
  assert(personaMods({ ...base, aliveCount: 2 }).challengeAdj < 0, '残局≤2 保守');
  assert(personaMods({ ...base, lastCaught: true }).challengeAdj === 0.10, '上轮被抓 +10% 质疑率');
  // lucky
  const luckyHi = personaMods({ ...base, persona: 'lucky', luck: 0.8 });
  const luckyLo = personaMods({ ...base, persona: 'lucky', luck: 0.1 });
  // 9-12 调平：maxCardsAdj 修正移除（毒点：手气差少出牌 -17pp），保留质疑修正
  assert(luckyHi.maxCardsAdj === 0 && luckyHi.challengeAdj < 0, 'lucky 手气好→少质疑');
  assert(luckyLo.maxCardsAdj === 0 && luckyLo.challengeAdj > 0, 'lucky 手气差→多质疑');
  // observer
  const obsEarly = personaMods({ ...base, persona: 'observer', round: 2 });
  const obsLate = personaMods({ ...base, persona: 'observer', round: 5 });
  assert(obsEarly.challengeAdj < 0 && obsEarly.honestAdj > 0, 'observer 前3轮观望');
  assert(obsLate.challengeAdj > 0, 'observer 第4轮起激进');
  // berserker
  const ber = personaMods({ ...base, persona: 'berserker' });
  assert(ber.maxCardsAdj === 2 && ber.noChallenge === undefined, 'berserker 多出牌；v18.1 已移除永不质疑');
  // stalker
  const stk3 = personaMods({ ...base, persona: 'stalker', claimCnt: 3 });
  const stk2 = personaMods({ ...base, persona: 'stalker', claimCnt: 2 });
  const stk1 = personaMods({ ...base, persona: 'stalker', claimCnt: 1 });
  assert(stk3.challengeAdj === 0.25 && stk2.challengeAdj === 0.12 && stk1.challengeAdj === 0, 'stalker 按声称张数阶梯加码');
}

console.log('── P5: v18.1 berserker 恢复质疑能力 ──');
{
  let challenged = 0;
  for (let i = 0; i < 40; i++) {
    if (aiChallenge(3, 5, 2, 'normal', 'custom', { challengeChance: 90 }, 0, { persona: 'berserker' })) challenged++;
  }
  assert(challenged > 30, 'v18.1 berserker 高质疑 cfg 应大量质疑（实际 ' + challenged + '/40）');
  // 对照：高质疑 cfg 非 berserker 应该大量质疑
  let ctrl = 0;
  for (let i = 0; i < 40; i++) {
    if (aiChallenge(3, 5, 2, 'normal', 'custom', { challengeChance: 90 }, 0, { persona: null })) ctrl++;
  }
  assert(ctrl > 30, '对照组正常质疑（' + ctrl + '/40）');
}

console.log('── P6: B1 人格对质疑率的方向性影响（统计对比）──');
{
  const run = ctx => { let c = 0; for (let i = 0; i < 400; i++) if (aiChallenge(2, 2, 2, 'normal', 'custom', { challengeChance: 40 }, 0, ctx)) c++; return c / 400; };
  const obs = run({ persona: 'observer', round: 1 });
  const obsLate = run({ persona: 'observer', round: 6 });
  const stalk = run({ persona: 'stalker', claimCnt: 3 });
  const plain = run({ persona: null });
  assert(obs < plain - 0.05, `observer 早期质疑率显著更低（${obs.toFixed(2)} < ${plain.toFixed(2)}）`);
  assert(obsLate > plain + 0.05, `observer 后期显著更高（${obsLate.toFixed(2)} > ${plain.toFixed(2)}）`);
  assert(stalk > plain + 0.05, `stalker 对3张声称显著更爱质疑（${stalk.toFixed(2)} > ${plain.toFixed(2)}）`);
}

console.log('── P7: B1 makePlayers 人格标记传递 ──');
{
  assert(AI_NAMES.length === 8 && AI_PRESETS.length === 8, 'AI 名单/预设各 8 套');
  assert(Object.keys(AI_PERSONAS).length === 4, '4 个动态人格标记');
  const ps = makePlayers(AI_PRESETS.map(p => ({ ...p })), [4, 6, 0], null);
  assert(ps[1].persona === 'lucky' && ps[2].persona === 'berserker' && ps[3].persona === null, '选中索引→persona 映射正确（lucky/berserker/null）');
  assert(ps[1].name === '幸运露西' && ps[2].name === '疯刀疤', '新 AI 名字落位');
  const psDef = makePlayers(null, null, null);
  assert(psDef.length === 4 && psDef[1].persona != null, '默认局 3 AI 随机抽 persona（v26.1）');
}

console.log('── P8: REVEAL_COMPLETE 记录 lastCaughtPid（局内闭环）──');
{
  // 用 reducer 全流程：走一局到 CHALLENGE → REVEAL → 检查 lastCaughtPid
  const reducer = wrappedReducer;
  let st = reducer(JSON.parse(JSON.stringify(INIT)), { type: 'START', aiConfigs: AI_PRESETS.map(p => ({ ...p })), selectedAIs: [0, 1, 2], mpPlayers: null, difficulty: 'normal' }); // v26.1 后默认局 persona 随机，快进需固定配置保证确定性
  assert(st.lastCaughtPid == null, '开局 lastCaughtPid 为空');
  // 快进：AI 出牌 → 人类质疑 → REVEAL（简化：找任意 AI_PLAY 后立刻 CHALLENGE）
  let guard = 0, challenged = false;
  while (guard++ < 300 && !challenged) {
    if (st.phase === 'event') {
      // v18：抉择事件挂起时先自动抉择，否则 BEGIN_DEALING
      if (st.event && st.event.choices && st.eventChoice && !st.eventResult) {
        const ch = st.players.find(p => p.id === st.eventChoice.chooserId);
        st = reducer(st, { type: 'EVENT_CHOICE', choiceId: aiPickChoice(st.event, ch) });
      } else {
        st = reducer(st, { type: 'BEGIN_DEALING' });
      }
    }
    else if (st.phase === 'dealing') st = reducer(st, { type: 'DEAL_COMPLETE' });
    else if (st.phase === 'library_dealt') st = reducer(st, { type: 'LIBRARY_REDEAL' });
    else if (st.phase === 'ai_turn') { const ai = st.players.find(p => p.id === st.curPlayer); const d = aiPlay(ai.hand, st.targetSuit, ai.personality, ai.customConfig, { frozen: [] }); st = d.cards.length ? reducer(st, { type: 'AI_PLAY', pid: ai.id, cards: d.cards }) : reducer(st, { type: 'CONTINUE' }); }
    else if (st.phase === 'challenge_phase') { st = reducer(st, { type: 'CHALLENGE', cid: st.curPlayer }); challenged = true; }
    else if (st.phase === 'reveal' || st.phase === 'roulette') { challenged = true; }
    else break;
  }
  if (challenged && st.phase === 'reveal') {
    const claimerId = st.lastClaim?.playerId;
    const willCatch = st.challengeResult === 'lied';
    // 走完 reveal（REVEAL_COMPLETE 由动画层派发，这里直接派）
    const before = st.lastCaughtPid;
    st = reducer(st, { type: 'REVEAL_COMPLETE' });
    assert(st.lastCaughtPid === (willCatch ? claimerId : null), `揭晓后 lastCaughtPid=${st.lastCaughtPid}（骗子=${willCatch ? claimerId : '无'}）`);
    assert(before == null, '质疑决策时 lastCaughtPid 尚未污染');
  } else {
    assert(false, '未能走到 reveal（phase=' + st.phase + '）');
  }
}

console.log(fails === 0 ? `\n✓ ${checks} 项断言全部通过` : `\n✗ ${fails}/${checks} 项失败`);
process.exit(fails ? 1 : 0);

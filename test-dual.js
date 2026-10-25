/**
 * test-dual.js — A3 双色目标牌白盒
 * 用法：node test-dual.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = 20260903;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

const code = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js'].map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const { INIT, wrappedReducer, aiPlay, makePlayers, isHonest, rollTarget, fmtTarget, TARGET_DUALS, TARGET_SUITS } =
  new Function(code + '\nreturn { INIT, wrappedReducer, aiPlay, makePlayers, isHonest, rollTarget, fmtTarget, TARGET_DUALS, TARGET_SUITS };')();

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }
const mk = (s, m) => ({ id: 'c' + Math.random().toString(36).slice(2, 8), suit: s, mod: m || 'normal' });

console.log('── D1: isHonest 双色判定 ──');
{
  assert(isHonest([mk('A'), mk('A')], 'AK') === true, 'AK 目标下全 A = 诚实');
  assert(isHonest([mk('K'), mk('A')], 'AK') === true, 'AK 目标下 A+K 混合 = 诚实');
  assert(isHonest([mk('Q')], 'AK') === false, 'AK 目标下 Q = 撒谎');
  assert(isHonest([mk('J')], 'AK') === true, 'AK 目标下 J 万能 = 诚实');
  assert(isHonest([mk('J')], 'AK', true) === false, '狂乱下 J 不万能');
  assert(isHonest([mk('A'), mk('A')], 'A') === true, '单色 A 向后兼容');
  assert(isHonest([mk('K')], 'A') === false, '单色 A 下 K = 撒谎（兼容）');
  assert(isHonest([mk('J'), mk('Q')], 'AQ') === true, 'AQ 目标下 J+Q = 诚实（J 万能）');
  assert(isHonest([mk('J'), mk('K')], 'AQ') === false, 'AQ 目标下 J+K = 撒谎（K 不在目标集，J 只救自身）');
  assert(isHonest([mk('Q'), mk('Q'), mk('Q'), mk('Q')], 'KQ') === true, '文档场景：KQ 目标 4 张全 Q 诚实');
}

console.log('── D2: rollTarget 分布与"必不同" ──');
{
  let dual = 0, same = 0, bad = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const r = rollTarget('A');
    if (r === 'A') same++;
    if (!TARGET_SUITS.includes(r) && !TARGET_DUALS.includes(r)) bad++;
    if (r.length === 2) dual++;
  }
  assert(bad === 0, '只产出合法目标');
  assert(same === 0, '从不返回与当前相同（单色场景）');
  assert(dual > N * 0.25 && dual < N * 0.42, `双色频率 ≈1/3（实测 ${((dual / N) * 100).toFixed(1)}%）`);
  let sameDual = 0;
  for (let i = 0; i < 1000; i++) if (rollTarget('AK') === 'AK') sameDual++;
  assert(sameDual === 0, '双色场景下也不重复自身');
}

console.log('── D3: AI 可用诚实牌判定（双色）──');
{
  const hand = [mk('A'), mk('K'), mk('Q'), mk('J'), mk('Q')];
  // honest 池：目标牌面。30-ai 内部逻辑用 includes——通过行为验证：AK 目标下 Q 是杂牌
  // aggressive + honestChance 100 → 必诚实出牌
  let bluffCnt = 0, qInHonest = 0;
  for (let i = 0; i < 40; i++) {
    const d = aiPlay(hand, 'AK', 'custom', { honestChance: 100, maxCards: 3, minCards: 1 });
    if (!d.honest) bluffCnt++; // honestChance 100 被 clamp 到 0.95，允许少量残余
    else if (d.cards.some(c => c.suit === 'Q')) qInHonest++;
  }
  assert(qInHonest === 0, 'AK 目标下诚实出牌不含 Q（Q 不属于目标集）');
  assert(bluffCnt <= 4, `残余 bluff ≤10%（实测 ${bluffCnt}/40）`);
  // 反证：目标 'Q' 时 A/K 都不可诚实用
  let noAK = true;
  for (let i = 0; i < 30; i++) {
    const d = aiPlay([mk('A'), mk('K'), mk('Q')], 'Q', 'custom', { honestChance: 100, maxCards: 3, minCards: 1 });
    if (d.honest && d.cards.some(c => c.suit !== 'Q')) noAK = false;
  }
  assert(noAK, '单色 Q 目标下诚实只出 Q');
}

console.log('── D4: 引擎全流程双色局（BEGIN_DEALING 滚出双色）──');
{
  const reducer = wrappedReducer;
  let st = reducer(JSON.parse(JSON.stringify(INIT)), { type: 'START', aiConfigs: null, selectedAIs: null, mpPlayers: null, difficulty: 'normal' });
  // 端到端薄验证：event → BEGIN_DEALING 换目标合法（双色频率统计由 sim-discard 承担）
  if (st.phase === 'event') st = reducer(st, { type: 'BEGIN_DEALING' });
  assert(st.phase === 'dealing', 'BEGIN_DEALING 进入发牌');
  assert(TARGET_SUITS.includes(st.targetSuit) || TARGET_DUALS.includes(st.targetSuit), `新目标合法：${st.targetSuit}`);
  assert(st.targetSuit !== 'A', `目标已更换（${st.targetSuit}）`);
  // 双色状态下出牌 → isHonest 走新路径不崩
  if ((st.targetSuit || '').length === 2) {
    const honest = isHonest(st.tableCards.length ? st.tableCards : [mk(st.targetSuit[0])], st.targetSuit, st.frenzy);
    assert(typeof honest === 'boolean', `双色局 isHonest 正常返回（${honest}）`);
  }
  assert(st.targetSuit !== undefined && st.targetSuit.length >= 1, `终态目标合法：${st.targetSuit}`);
}

console.log('── D5: fmtTarget 显示格式 ──');
{
  assert(fmtTarget('AK') === 'A·K', "fmtTarget('AK') = 'A·K'");
  assert(fmtTarget('AQ') === 'A·Q', "fmtTarget('AQ') = 'A·Q'");
  assert(fmtTarget('KQ') === 'K·Q', "fmtTarget('KQ') = 'K·Q'");
  assert(fmtTarget('A') === 'A', '单色不变');
  assert(fmtTarget(null) === 'A', '空值兜底 A');
}

console.log(fails === 0 ? `\n✓ ${checks} 项断言全部通过` : `\n✗ ${fails}/${checks} 项失败`);
process.exit(fails ? 1 : 0);

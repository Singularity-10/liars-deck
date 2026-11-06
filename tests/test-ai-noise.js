/**
 * test-ai-noise.js — B3 AI 失误率白盒
 * 用法：node test-ai-noise.js
 * 断言：noise 反向决策的安全性 / 质疑放过的确定性 / 冻结与盲打不破坏
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = 20260901;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

const code = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js'].map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const { aiPlay, aiChallenge, AI_NOISE } = new Function(code + '\nreturn { aiPlay, aiChallenge, AI_NOISE };')();

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

const mkHand = (spec) => spec.map((s, i) => ({ id: 'c' + i, suit: s[0], mod: s[1] || 'normal' }));

console.log('── N1: noise 反向决策安全性（200 次随机手牌 × noise=1）──');
{
  let crashes = 0, invalid = 0, honestSeen = 0, bluffSeen = 0;
  for (let i = 0; i < 200; i++) {
    const spec = [];
    for (let j = 0; j < 6; j++) {
      const suits = ['A', 'K', 'Q', 'J'];
      const mods = ['normal', 'normal', 'normal', 'angel', 'demon'];
      spec.push([suits[Math.floor(Math.random() * 4)], mods[Math.floor(Math.random() * 5)]]);
    }
    const hand = mkHand(spec);
    const frozenIds = new Set([hand[0].id]);
    const opts = { frozen: frozenIds, noise: 1 };
    try {
      const d = aiPlay(hand, 'A', 'aggressive', null, opts);
      if (!d.cards || !d.cards.length) invalid++;
      if (!d.cards.every(c => hand.includes(c) && !frozenIds.has(c.id))) invalid++;
      if (d.honest === true) honestSeen++; else bluffSeen++;
    } catch (e) { crashes++; }
  }
  assert(crashes === 0, '零崩溃（实际 ' + crashes + '）');
  assert(invalid === 0, '出牌始终合法且不踩冻结（违例 ' + invalid + '）');
  assert(honestSeen > 0 && bluffSeen > 0, '双向决策都出现（诚实 ' + honestSeen + '/欺诈 ' + bluffSeen + '）');
}

console.log('── N2: 质疑 noise=1 → 必放弃（20 次）──');
{
  let skip = 0;
  for (let i = 0; i < 20; i++) {
    if (!aiChallenge(3, 5, 2, 'normal', 'aggressive', null, 1)) skip++;
  }
  assert(skip === 20, 'noise=1 全部放过（实际 ' + skip + '）');
}

console.log('── N3: noise=0 → 行为与基线一致（随机 200 次不越界）──');
{
  let crashes = 0, invalid = 0;
  for (let i = 0; i < 200; i++) {
    const spec = [];
    for (let j = 0; j < 5; j++) {
      const suits = ['A', 'K', 'Q', 'J'];
      const mods = ['normal', 'normal', 'normal', 'angel', 'demon'];
      spec.push([suits[Math.floor(Math.random() * 4)], mods[Math.floor(Math.random() * 5)]]);
    }
    const hand = mkHand(spec);
    try {
      const d = aiPlay(hand, 'K', 'conservative', null, { frozen: new Set([hand[0].id]) });
      if (!d.cards.length || !d.cards.every(c => hand.includes(c) && c.id !== hand[0].id)) invalid++;
    } catch (e) { crashes++; }
  }
  assert(crashes === 0 && invalid === 0, 'noise=0 零异常零违例');
}

console.log('── N4: 盲打（长夜）+ noise 并存 ──');
{
  const hand = mkHand([['A'], ['K'], ['Q'], ['J'], ['A', 'demon'], ['K']]);
  let crashes = 0;
  for (let i = 0; i < 100; i++) {
    try { aiPlay(hand, 'A', 'impatient', null, { blind: true, noise: 0.5 }); } catch (e) { crashes++; }
  }
  assert(crashes === 0, '盲打+noise 零崩溃');
}

console.log('── N5: AI_NOISE 映射表 ──');
{
  assert(AI_NOISE.easy.play === 0.20 && AI_NOISE.easy.challenge === 0.15, 'easy 档数值');
  assert(AI_NOISE.normal.play === 0.05 && AI_NOISE.normal.challenge === 0.05, 'normal 档数值');
  assert(AI_NOISE.hard.play === 0 && AI_NOISE.hard.challenge === 0, 'hard 零失误');
}

console.log(fails === 0 ? `\n✓ ${checks} 项断言全部通过` : `\n✗ ${fails}/${checks} 项失败`);
process.exit(fails ? 1 : 0);

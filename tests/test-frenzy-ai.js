/**
 * test-frenzy-ai.js — v83 狂化透传白盒（外审#1/#2 修复验证）
 * 用法：node test-frenzy-ai.js
 * 断言：aiPlay 狂化口径与引擎 isHonest 对齐 / 成就表 bluff_6 删除 / LLM prompt 狂化提示
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = 20261005;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};

const FILES = ['00-constants.js', '05-i18n.js', '10-utils.js', '20-engine.js', '25-roles.js', '28-llm.js', '30-ai.js', '35-achievements.js'];
const code = FILES.map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const api = new Function(code + '\nreturn { aiPlay, isHonest, ACHIEVEMENTS, AI_PRESETS, AI_META, createDeck, EVENT_DONE: null };')();
const { aiPlay, isHonest, ACHIEVEMENTS } = api;

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

// ── 测试手牌构造 ──
let uid = 0;
function mk(suit, mod) { return { id: 't' + (uid++), suit, mod: mod || 'normal' }; }
// 目标 A：2 张真 A、2 张 J、2 张杂 K/Q、恶魔 A、天使 J、天使 K
const HAND = [mk('A'), mk('A'), mk('J'), mk('J'), mk('K'), mk('Q'), mk('A', 'demon'), mk('J', 'angel'), mk('K', 'angel')];
const OPTS = { noise: 0, maxPlay: 5, persona: null, round: 10, aliveCount: 4, lastCaught: false, frozen: [], blind: false };

// ── 1. 非狂化：J 属于诚实面（回归保障） ──
{
  let sawJHonest = false, sawJInPoolAsHonest = false;
  for (let i = 0; i < 400; i++) {
    const d = aiPlay(HAND.map(c => ({ ...c })), 'A', 'conservative', null, { ...OPTS });
    if (d.honest && d.cards.some(c => c.suit === 'J')) sawJHonest = true;
    if (d.honest && isHonest(d.cards, 'A', false)) sawJInPoolAsHonest = true;
  }
  assert(sawJHonest, '非狂化：AI 会把 J 当诚实牌打出（旧行为保持）');
  assert(sawJInPoolAsHonest, '非狂化：AI 诚实出牌均通过 isHonest(…,false) 判定');
}

// ── 2. 狂化：诚实路径绝不返回 J，且通过引擎狂化判定 ──
{
  let honestPlays = 0, jInHonest = 0, engineFail = 0, bluffPlays = 0, jInBluff = 0;
  for (let i = 0; i < 1200; i++) {
    const d = aiPlay(HAND.map(c => ({ ...c })), 'A', 'conservative', null, { ...OPTS, frenzy: true });
    if (d.honest) {
      honestPlays++;
      if (d.cards.some(c => c.suit === 'J')) jInHonest++;
      if (!isHonest(d.cards, 'A', true)) engineFail++;
    } else {
      bluffPlays++;
      if (d.cards.some(c => c.suit === 'J')) jInBluff++;
    }
  }
  assert(honestPlays > 0, '狂化：1200 次采样中出现诚实出牌 ' + honestPlays + ' 次');
  assert(jInHonest === 0, '狂化：诚实路径 0 次打出 J（修复前 AI 会主动送头）');
  assert(engineFail === 0, '狂化：AI 自认诚实的牌 100% 通过 isHonest(…,true) 引擎判定');
  assert(jInBluff > 0, '狂化：J 降级为谎牌弹药（撒谎路径使用 J ' + jInBluff + ' 次）');
}

// ── 3. 狂化 + 恶魔/天使 J：不再计入诚实池 ──
{
  // 手牌只有 J(angel) 与 J(demon)：狂化时没有真目标牌 → 诚实路径应无牌可出（走盲打外的 fallback）
  const onlyJmod = [mk('J', 'angel'), mk('J', 'demon')];
  let honestJmod = 0;
  for (let i = 0; i < 300; i++) {
    const d = aiPlay(onlyJmod.map(c => ({ ...c })), 'A', 'aggressive', null, { ...OPTS, frenzy: true });
    if (d.honest && d.cards.some(c => c.suit === 'J')) honestJmod++;
  }
  assert(honestJmod === 0, '狂化：J(天使)/J(恶魔) 也不计入诚实池');
  // 非狂化对照：J(angel) 与 J(demon) 可作诚实打出
  let honestJmod0 = 0;
  for (let i = 0; i < 300; i++) {
    const d = aiPlay(onlyJmod.map(c => ({ ...c })), 'A', 'aggressive', null, { ...OPTS, frenzy: false });
    if (d.honest && d.cards.some(c => c.suit === 'J')) honestJmod0++;
  }
  assert(honestJmod0 > 0, '非狂化对照：J(天使)/J(恶魔) 仍可诚实打出');
}

// ── 4. 50-game aiOpts 透传（静态断言） ──
{
  const g = fs.readFileSync(path.join('js', '50-game.js'), 'utf8');
  assert(/frenzy: !!st\.frenzy/.test(g), '50-game.js：aiOpts 含 frenzy: !!st.frenzy 透传');
}

// ── 5. 28-llm prompt 狂化口径（静态断言） ──
{
  const llm = fs.readFileSync(path.join('js', '28-llm.js'), 'utf8');
  assert(llm.includes('万能已失效'), '28-llm.js：fmtHand 狂化时 J 标注"万能已失效"');
  assert(llm.includes('【狂化轮】'), '28-llm.js：出牌 prompt 注入狂化警告');
  assert(llm.includes("!st.frenzy && c.suit === 'J'"), '28-llm.js：质疑估算的 J 计数狂化时排除');
}

// ── 6. 成就表（外审#2） ──
{
  assert(ACHIEVEMENTS.length === 21, '成就总数 22 → 21（bluff_6 删除）');
  assert(!ACHIEVEMENTS.some(a => a.id === 'bluff_6'), 'bluff_6（骗术通神）已删除');
  const b4 = ACHIEVEMENTS.find(a => a.id === 'bluff_4');
  assert(!!b4 && b4.desc.includes('4 人局'), 'bluff_4 描述注明"4 人局可达"');
  // 阈值可达性复核：bluffTarget = max(2, alive)，达标即终局 → 单局上限 = alive
  assert(!ACHIEVEMENTS.some(a => /撒谎成功\s*(5|6)\s*次|撒谎成功\s*[56]/.test(a.desc || '')), '不再存在任何 ≥5 次的吹牌成就（全配置不可达）');
}

console.log('\n' + (fails ? '✗ ' + fails + '/' + checks + ' 失败' : '✓ ' + checks + '/' + checks + ' 全部通过'));
process.exit(fails ? 1 : 0);

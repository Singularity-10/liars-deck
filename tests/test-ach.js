/**
 * test-ach.js — 成就系统白盒（G1）
 * 用法：node test-ach.js
 * 断言：unlockAchievements 的判定 / 持久化 / 去重 / 客户端场景
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = 7;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};

// 加载 35-achievements.js（浏览器全局脚本，用 new Function 求值并取回导出）
const achCode = fs.readFileSync(path.join('js', '35-achievements.js'), 'utf8');
const { ACHIEVEMENTS, ACH_KEY, loadAch, unlockAchievements } = new Function(
  achCode + '\nreturn { ACHIEVEMENTS, ACH_KEY, loadAch, saveAch, unlockAchievements };'
)();

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

function mkEnd(over = {}) {
  const me = { id: 0, name: '你', isHuman: true, isLocal: true, alive: true, hand: [], library: [], bluffSuccessCount: 0, ...over.me };
  const players = [me, { id: 1, name: 'a', isHuman: false, isLocal: false, alive: false, hand: [] }];
  return {
    phase: over.phase || 'won',
    players,
    stats: { totalGames: 1, wins: 1, losses: 0, maxWinStreak: 1, currentWinStreak: 1, ...(over.stats || {}) },
    playerStats: over.playerStats || {},
    eventTally: over.tally || {},
    floodLoss: over.floodLoss || {},
    frozenAdds: over.frozenAdds || [],
    difficulty: over.difficulty || 'normal',
    round: over.round ?? 5,
    winReason: over.winReason || 'lastStanding',
    ...over.stExtra,
  };
}

console.log('── A1: 基础解锁（首局+首胜）──');
{
  delete store[ACH_KEY];
  const newly = unlockAchievements(mkEnd());
  const ids = newly.map(a => a.id);
  assert(ids.includes('first_game'), '解锁初出茅庐');
  assert(ids.includes('first_win'), '解锁首胜');
  assert(loadAch().unlocked.first_game > 0, '已持久化');
}

console.log('── A2: 重复判定不重复解锁 ──');
{
  const newly = unlockAchievements(mkEnd());
  assert(newly.length === 0, '第二次判定无新解锁');
}

console.log('── A3: 单局类成就 ──');
{
  delete store[ACH_KEY];
  const st = mkEnd({
    me: { bluffSuccessCount: 4, alive: true },
    playerStats: { 0: { playCount: 20, challengeCount: 5, shotCount: 3, revived: 1 } },
    tally: { skyfall: 1, blacktide: 2, mushroom_cloud: 1, longnight: 1 },
    floodLoss: { 0: 4 },
    frozenAdds: [{ playerId: 0, cardId: 'x', appliedAtRound: 3 }],
  });
  const ids = unlockAchievements(st).map(a => a.id);
  assert(ids.includes('bluff_4'), '撒谎大师');
  assert(!ids.includes('bluff_6'), '骗术通神不应解锁（4<6）');
  assert(ids.includes('shots_3'), '死里逃生（中枪3+获胜）');
  assert(ids.includes('challenge_5'), '快枪手');
  assert(ids.includes('play_20'), '勤奋出牌');
  assert(ids.includes('revived'), '希望重燃');
  assert(ids.includes((ACHIEVEMENTS.find(a => a.name.includes('天崩')) || {}).id), '天崩地裂');
  assert(ids.includes((ACHIEVEMENTS.find(a => a.name.includes('黑潮')) || {}).id), '黑潮不灭者');
  assert(ids.includes((ACHIEVEMENTS.find(a => a.name.includes('蘑菇云')) || {}).id), '蘑菇云幸存');
  assert(ids.includes((ACHIEVEMENTS.find(a => a.name.includes('长夜')) || {}).id), '长夜行者');
  assert(ids.includes((ACHIEVEMENTS.find(a => a.name.includes('冰封')) || {}).id), '冰封战神');
  assert(ids.includes((ACHIEVEMENTS.find(a => a.name.includes('激流')) || {}).id), '激流勇退');
}

console.log('── A4: 完美轮盘 / 难度 / 败局边界 ──');
{
  delete store[ACH_KEY];
  // shotCount 0 + 获胜 + round≥3
  const st1 = mkEnd({ playerStats: { 0: { playCount: 5, challengeCount: 1, shotCount: 0 } } });
  assert(unlockAchievements(st1).map(a => a.id).includes('shots_0'), '完美轮盘');
  // shotCount 0 但失败 → 不解锁
  delete store[ACH_KEY];
  const st2 = mkEnd({ phase: 'lost', playerStats: { 0: { shotCount: 0 } } });
  assert(!unlockAchievements(st2).map(a => a.id).includes('shots_0'), '败局不解锁完美轮盘');
  // hard 胜利
  delete store[ACH_KEY];
  const st3 = mkEnd({ difficulty: 'hard' });
  assert(unlockAchievements(st3).map(a => a.id).includes('hard_win'), '深渊行者（hard 胜利）');
  // easy 胜利
  delete store[ACH_KEY];
  const st4 = mkEnd({ difficulty: 'easy' });
  assert(unlockAchievements(st4).map(a => a.id).includes('easy_win'), '新手好运（easy 胜利）');
  // 累计类
  delete store[ACH_KEY];
  const st5 = mkEnd({ stats: { totalGames: 10, wins: 10, maxWinStreak: 5, currentWinStreak: 5 } });
  const ids5 = unlockAchievements(st5).map(a => a.id);
  assert(ids5.includes('games_10') && ids5.includes('wins_10') && ids5.includes('streak_3') && ids5.includes('streak_5'), '累计类批量解锁');
}

console.log('── A5: 无本机玩家（观战/联机客户端）──');
{
  delete store[ACH_KEY];
  const st = mkEnd();
  st.players[0].isLocal = false;
  assert(unlockAchievements(st).length === 0, '无 isLocal 玩家 → 空结果');
}

console.log('── A6: 成就定义完整性 ──');
{
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert(new Set(ids).size === ids.length, 'id 唯一');
  assert(ACHIEVEMENTS.every(a => a.name && a.desc && a.icon && typeof a.check === 'function'), '字段齐全');
  assert(ACHIEVEMENTS.every(a => /^[A-Z]\w+$/.test(a.icon)), 'icon key 形如组件名');
}

console.log(fails === 0 ? `\n✓ ${checks} 项断言全部通过` : `\n✗ ${fails}/${checks} 项失败`);
process.exit(fails ? 1 : 0);

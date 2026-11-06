// @ts-nocheck
/**
 * 35-achievements.js — 成就系统
 * 职责：成就定义 + localStorage 存档 + 终局判定
 * 依赖：无（纯函数 + localStorage）；被 40-components（菜单展示）、50-game（解锁判定）引用
 * 对外暴露：ACH_KEY, ACHIEVEMENTS, loadAch, saveAch, unlockAchievements
 *
 * 判定数据源（全部来自终局状态 st，引擎不感知成就系统）：
 *  - st.stats：累计战绩（endGame 已更新）
 *  - st.playerStats[pid]：单局计数（playCount/challengeCount/shotCount/revived）
 *  - st.eventTally：单局事件触发计数（含连锁子事件）
 *  - st.floodLoss：洪水冲走的每玩家手牌数
 *  - st.frozenAdds / st.difficulty / st.winReason / 玩家字段
 */

const ACH_KEY = 'ld_ach_v1';

/** check(g) 的 g：{ won, alive, stats, ps, tally, floodLoss, me, st } */
const ACHIEVEMENTS = [
  { id: 'first_game', icon: 'Dices', name: '初出茅庐', desc: '完成第一局游戏', check: g => g.stats.totalGames >= 1 },
  { id: 'games_10', icon: 'Globe', name: '酒馆常客', desc: '累计完成 10 局', check: g => g.stats.totalGames >= 10 },
  { id: 'games_50', icon: 'Masks', name: '老酒鬼', desc: '累计完成 50 局', check: g => g.stats.totalGames >= 50 },
  { id: 'first_win', icon: 'Trophy', name: '首胜', desc: '赢得第一场胜利', check: g => g.stats.wins >= 1 },
  { id: 'wins_10', icon: 'Crown', name: '常胜将军', desc: '累计获胜 10 场', check: g => g.stats.wins >= 10 },
  { id: 'streak_3', icon: 'Zap', name: '三连胜', desc: '连胜 3 场', check: g => (g.stats.maxWinStreak || 0) >= 3 },
  { id: 'streak_5', icon: 'Gem', name: '酒馆传说', desc: '连胜 5 场', check: g => (g.stats.maxWinStreak || 0) >= 5 },
  { id: 'hard_win', icon: 'Demon', name: '深渊行者', desc: '在困难模式下获胜', check: g => g.st.difficulty === 'hard' && g.won },
  { id: 'easy_win', icon: 'Clover', name: '新手的运气', desc: '在新手模式下获胜', check: g => g.st.difficulty === 'easy' && g.won },
  // 吹牌成就阈值 = max(2, 存活数) 且达标即终局：单局吹牌上限即阈值本身，≥6 恒不可达故无 bluff_6；
  // bluff_4 仅 4 人局可达（3 人局阈值 3、2 人局阈值 2），描述如实注明。
  { id: 'bluff_4', icon: 'Masks', name: '撒谎大师', desc: '单局累计撒谎成功 4 次（4 人局可达）', check: g => (g.me.bluffSuccessCount || 0) >= 4 },
  { id: 'shots_3', icon: 'Skull', name: '死里逃生', desc: '单局中弹 3 次仍获胜', check: g => (g.ps.shotCount || 0) >= 3 && g.won },
  { id: 'shots_0', icon: 'Shield', name: '完美轮盘', desc: '第 3 轮后获胜且全程未中弹', check: g => !(g.ps.shotCount || 0) && g.won && g.st.round >= 3 },
  { id: 'skyfall', icon: 'Skyfall', name: '天崩地裂', desc: '亲历一次天崩', check: g => (g.tally.skyfall || 0) >= 1 },
  { id: 'blacktide_2', icon: 'BlackTide', name: '黑潮不灭者', desc: '单局经历 2 次黑潮并获胜', check: g => (g.tally.blacktide || 0) >= 2 && g.won },
  { id: 'mushroom_survive', icon: 'Mushroom', name: '蘑菇云幸存', desc: '经历蘑菇云并存活到局终', check: g => (g.tally.mushroom_cloud || 0) >= 1 && g.alive },
  { id: 'longnight_win', icon: 'LongNight', name: '长夜行者', desc: '经历长夜并获胜', check: g => (g.tally.longnight || 0) >= 1 && g.won },
  { id: 'frozen_win', icon: 'Avalanche', name: '冰封战神', desc: '手牌被雪崩冻结仍获胜', check: g => (g.st.frozenAdds || []).some(f => f.playerId === g.me.id) && g.won },
  { id: 'revived', icon: 'HopeBang', name: '希望重燃', desc: '被希望！复活过', check: g => (g.ps.revived || 0) >= 1 },
  { id: 'flood_win', icon: 'Flood', name: '激流勇退', desc: '被洪水冲走 4 张以上手牌仍获胜', check: g => g.floodLoss >= 4 && g.won },
  { id: 'challenge_5', icon: 'Crosshairs', name: '快枪手', desc: '单局发起 5 次质疑', check: g => (g.ps.challengeCount || 0) >= 5 },
  { id: 'play_20', icon: 'Swords', name: '勤奋出牌', desc: '单局出牌 20 张', check: g => (g.ps.playCount || 0) >= 20 },
];

/** 读取成就存档 { unlocked: { id: timestamp } } */
function loadAch() {
  try {
    const raw = localStorage.getItem(ACH_KEY);
    if (raw) {
      const a = JSON.parse(raw);
      if (a && typeof a.unlocked === 'object') return a;
    }
  } catch (e) { /* 损坏则重置 */ }
  return { unlocked: {} };
}

function saveAch(a) {
  try { localStorage.setItem(ACH_KEY, JSON.stringify(a)); } catch (e) { /* 私密模式等场景静默 */ }
}

/**
 * 终局判定：解锁新成就并持久化。
 * @param {object} st 终局状态（phase ∈ won/lost/draw，stats 已由 endGame 更新）
 * @returns {Array} 本局新解锁的成就对象列表（供 toast）
 */
function unlockAchievements(st) {
  const me = (st.players || []).find(p => p.isLocal);
  if (!me) return [];
  const g = {
    st,
    me,
    won: st.phase === 'won',
    alive: !!me.alive,
    stats: st.stats || {},
    ps: (st.playerStats || {})[me.id] || {},
    tally: st.eventTally || {},
    floodLoss: (st.floodLoss || {})[me.id] || 0,
  };
  const ach = loadAch();
  const newly = ACHIEVEMENTS.filter(a => !ach.unlocked[a.id] && a.check(g));
  if (newly.length) {
    const now = Date.now();
    newly.forEach(a => { ach.unlocked[a.id] = now; });
    saveAch(ach);
  }
  return newly;
}

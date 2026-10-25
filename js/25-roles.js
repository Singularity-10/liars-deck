// @ts-nocheck
/* ═══════════════════════════════════════════════════════════
 * 25-roles.js — A1 角色系统
 * 8 个酒馆角色，START 时按人数不重复随机分配。
 *
 * 对外暴露：
 * ROLES 角色定义表（id/name/icon/trigger/desc key）
 * assignRoles(n) n 个玩家不重复随机分配 → {pid: roleId}
 * roleOf(st, pid) 取角色 id（无则 null）
 * chargeOf(st,pid,roleId) / consumeCharge(st,pid,roleId)
 * skillAvailable(st,pid) 主动技能当前是否可发动 → {ok, reason}
 * applySkill(st,pid) 执行主动技能（纯函数，返回新 st 片段）
 * aiWantsSkill(st,pid) AI 自动发动策略
 *
 * 设计约定（与引擎的接缝）：
 * - 一次性技能（老千/恶魔/神枪手/变色龙/天使）：st.skillCharges 计数，用完即止
 * - 冷却技能（酒保/读心者）：st.skillCd[pid][roleId] = 上次发动轮次，间隔 3 轮
 * - 被动（天使=轮盘免死钩 ROULETTE；赏金猎人=质疑成功钩 REVEAL_COMPLETE）
 * - 神枪手复用既有 immuneId 机制（事件免死同源，行为一致可测试）
 * - 变色龙换目标需先成功吹牌 1 次（bluffSuccessCount ≥ 1）
 * - 酒保 buff：st.roundBuffUntil ≥ 当前轮 → 全员出牌上限 +1（仍受 6 封顶）
 * ═══════════════════════════════════════════════════════════ */

const ROLE_CD = 3; // 冷却技能间隔轮数

const ROLES = [
  {
    id: 'swindler', icon: 'Joker', trigger: 'once',
    // 每局 1 次：把一张杂牌变成目标牌（随机）
  },
  {
    id: 'bartender', icon: 'Cylinder', trigger: 'cd',
    // 每 3 轮：下一轮所有人出牌上限 +1
  },
  {
    id: 'bounty', icon: 'Crosshairs', trigger: 'passive',
    // 被动：成功质疑时额外 +1 吹牌计数（加速吹牌胜利）
  },
  {
    id: 'gunslinger', icon: 'Zap', trigger: 'once',
    // 每局 1 次：布防免死——下一次上轮盘必活（复用 immuneId）
  },
  {
    id: 'mindreader', icon: 'Eye', trigger: 'cd',
    // 每 3 轮：偷看一名随机对手的一张随机手牌
  },
  {
    id: 'demonfiend', icon: 'Doom', trigger: 'once',
    // 每局 1 次：把手中一张天使牌变成恶魔牌
  },
  {
    id: 'guardian', icon: 'Shield', trigger: 'passive',
    // 被动：每局 1 次，轮盘死亡时自动免死
  },
  {
    id: 'chameleon', icon: 'SwitchDir', trigger: 'once',
    // 每局 1 次（需先成功吹牌 1 次）：把目标牌面换成随机其他花色
  },
];

const ROLE_IDS = ROLES.map(r => r.id);

/** 一次性技能的角色 id 集合 */
const ONCE_ROLE_IDS = new Set(ROLES.filter(r => r.trigger === 'once').map(r => r.id));

/** n 个玩家不重复随机分配角色 */
function assignRoles(n) {
  const pool = shuffle([...ROLE_IDS]).slice(0, n);
  const map = {};
  for (let i = 0; i < n; i++) map[i] = pool[i];
  return map;
}

function roleOf(st, pid) {
  return (st.roles || {})[pid] || null;
}

/** 剩余发动次数（一次性技能）；冷却/被动返回 Infinity 语义由调用方区分 */
function chargeOf(st, pid, roleId) {
  return ((st.skillCharges || {})[pid] || {})[roleId];
}

/** 消耗一次发动机会，返回新 charges 对象（纯） */
function consumeCharge(st, pid, roleId) {
  const per = { ...((st.skillCharges || {})[pid] || {}) };
  per[roleId] = (per[roleId] || 0) - 1;
  return { ...(st.skillCharges || {}), [pid]: per };
}

/** 冷却技能是否就绪 */
function cdReady(st, pid, roleId) {
  const last = ((st.skillCd || {})[pid] || {})[roleId];
  return last === undefined || st.round - last >= ROLE_CD;
}

/** 冷却剩余轮数（cdReady 为 false 时才有意义） */
function cdLeft(st, pid, roleId) {
  const last = ((st.skillCd || {})[pid] || {})[roleId];
  if (last === undefined) return 0;
  return Math.max(0, ROLE_CD - (st.round - last));
}

/** 是否是我方回合的出牌阶段（主动技能统一发动窗口） */
function isActingTurn(st, pid) {
  return (st.phase === 'player_turn' || st.phase === 'ai_turn') && st.curPlayer === pid && (st.players.find(p => p.id === pid) || {}).alive;
}

/** 主动技能可用性判定（人类 UI 与 AI 共用） */
function skillAvailable(st, pid) {
  const roleId = roleOf(st, pid);
  if (!roleId) return { ok: false, reason: 'noRole' };
  if (roleId === 'bounty' || roleId === 'guardian') return { ok: false, reason: 'passive' };
  if (!isActingTurn(st, pid)) return { ok: false, reason: 'turn' };
  const me = st.players.find(p => p.id === pid);
  if (roleId === 'swindler') {
    if ((chargeOf(st, pid, 'swindler') || 0) <= 0) return { ok: false, reason: 'used' };
    const junk = me.hand.filter(c => !(st.targetSuit || 'A').includes(c.suit) && c.suit !== 'J');
    if (!junk.length) return { ok: false, reason: 'noJunk' };
    return { ok: true };
  }
  if (roleId === 'bartender') {
    if (!cdReady(st, pid, 'bartender')) return { ok: false, reason: 'cd', cdLeft: cdLeft(st, pid, 'bartender') };
    return { ok: true };
  }
  if (roleId === 'gunslinger') {
    if (st.immuneId === pid) return { ok: false, reason: 'armed' };
    if ((chargeOf(st, pid, 'gunslinger') || 0) <= 0) return { ok: false, reason: 'used' };
    return { ok: true };
  }
  if (roleId === 'mindreader') {
    if (!cdReady(st, pid, 'mindreader')) return { ok: false, reason: 'cd', cdLeft: cdLeft(st, pid, 'mindreader') };
    if (!st.players.some(p => p.id !== pid && p.alive && p.hand.length)) return { ok: false, reason: 'noTarget' };
    return { ok: true };
  }
  if (roleId === 'demonfiend') {
    if ((chargeOf(st, pid, 'demonfiend') || 0) <= 0) return { ok: false, reason: 'used' };
    if (!me.hand.some(c => c.mod === 'angel')) return { ok: false, reason: 'noAngel' };
    return { ok: true };
  }
  if (roleId === 'chameleon') {
    if ((chargeOf(st, pid, 'chameleon') || 0) <= 0) return { ok: false, reason: 'used' };
    if ((me.bluffSuccessCount || 0) < 1) return { ok: false, reason: 'needBluff' };
    return { ok: true };
  }
  return { ok: false, reason: 'unknown' };
}

/** 执行主动技能，返回完整新 st（不变式：牌守恒由引擎守恒 sim 验证） */
function applySkill(st, pid) {
  const chk = skillAvailable(st, pid);
  if (!chk.ok) return { st, effect: null };
  const roleId = roleOf(st, pid);
  const me = st.players.find(p => p.id === pid);
  let next = { ...st };

  if (roleId === 'swindler') {
    // 随机一张杂牌 → 目标花色（mod 不变）
    const junk = me.hand.filter(c => !(st.targetSuit || 'A').includes(c.suit) && c.suit !== 'J');
    const pick = junk[Math.floor(Math.random() * junk.length)];
    const players = next.players.map(p => p.id !== pid ? p : {
      ...p,
      hand: p.hand.map(c => c.id === pick.id ? { ...c, suit: st.targetSuit } : c),
    });
    next = { ...next, players, skillCharges: consumeCharge(next, pid, 'swindler') };
    return { st: next, effect: { roleId, kind: 'transform', cardId: pick.id } };
  }
  if (roleId === 'bartender') {
    // 下一轮全员出牌上限 +1
    const cd = { ...((next.skillCd || {})[pid] || {}), [roleId]: next.round };
    next = { ...next, roundBuffUntil: next.round + 1, skillCd: { ...(next.skillCd || {}), [pid]: cd } };
    return { st: next, effect: { roleId, kind: 'buff' } };
  }
  if (roleId === 'gunslinger') {
    next = { ...next, immuneId: pid, skillCharges: consumeCharge(next, pid, 'gunslinger') };
    return { st: next, effect: { roleId, kind: 'armImmune' } };
  }
  if (roleId === 'mindreader') {
    const targets = next.players.filter(p => p.id !== pid && p.alive && p.hand.length);
    const tp = targets[Math.floor(Math.random() * targets.length)];
    const card = tp.hand[Math.floor(Math.random() * tp.hand.length)];
    const cd = { ...((next.skillCd || {})[pid] || {}), [roleId]: next.round };
    next = { ...next, peekReveal: { readerId: pid, targetId: tp.id, card }, skillCd: { ...(next.skillCd || {}), [pid]: cd } };
    return { st: next, effect: { roleId, kind: 'peek', targetId: tp.id, card } };
  }
  if (roleId === 'demonfiend') {
    const angels = me.hand.filter(c => c.mod === 'angel');
    const pick = angels[Math.floor(Math.random() * angels.length)];
    const players = next.players.map(p => p.id !== pid ? p : {
      ...p,
      hand: p.hand.map(c => c.id === pick.id ? { ...c, mod: 'demon' } : c),
    });
    next = { ...next, players, skillCharges: consumeCharge(next, pid, 'demonfiend') };
    return { st: next, effect: { roleId, kind: 'transform', cardId: pick.id } };
  }
  if (roleId === 'chameleon') {
    const suits = ['A', 'K', 'Q', 'J'].filter(s => s !== st.targetSuit);
    const pick = suits[Math.floor(Math.random() * suits.length)];
    next = { ...next, targetSuit: pick, skillCharges: consumeCharge(next, pid, 'chameleon') };
    return { st: next, effect: { roleId, kind: 'retarget', suit: pick } };
  }
  return { st: next, effect: null };
}

/** AI 自动发动策略（在 AI 回合开头调用） */
function aiWantsSkill(st, pid) {
  const roleId = roleOf(st, pid);
  if (!roleId) return false;
  const me = st.players.find(p => p.id === pid);
  const aliveN = st.players.filter(p => p.alive).length;
  switch (roleId) {
    case 'swindler': {
      const chk = skillAvailable(st, pid);
      // 杂牌多或手牌压力大时用
      if (!chk.ok) return false;
      const junkN = me.hand.filter(c => !(st.targetSuit || 'A').includes(c.suit) && c.suit !== 'J').length;
      return junkN >= 2 || me.hand.length >= 6;
    }
    case 'bartender':
      return skillAvailable(st, pid).ok && st.round >= 2;
    case 'gunslinger':
      // 危险感知：已有人上过轮盘，或残局
      return skillAvailable(st, pid).ok && (st.rouletteShots >= 1 || aliveN <= 3);
    case 'mindreader':
      return skillAvailable(st, pid).ok;
    case 'demonfiend':
      return skillAvailable(st, pid).ok;
    case 'chameleon':
      return skillAvailable(st, pid).ok;
    default:
      return false;
  }
}

/** 引擎侧：本轮全员出牌上限（F3 maxPlay + 酒保 buff，封顶 6） */
function effMaxPlay(st) {
  const base = Math.max(1, Math.min(5, st.maxPlay ?? 5));
  const buffed = (st.roundBuffUntil ?? 0) >= (st.round ?? 1) ? 1 : 0;
  return Math.min(6, base + buffed);
}

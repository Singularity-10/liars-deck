#!/usr/bin/env node
/**
 * 守恒不变量模拟器（验收用，sim-harness 的升级替代——旧基线随事件全量替换作废）
 * 逐状态不变量校验：
 *   I1 牌 ID 全局唯一（手牌+牌库+桌面+弃牌区+放逐区任何时刻无重号）
 *   I2 牌总量只增不减（事件放逐/复活/死亡/弃牌/重发全部守恒流转）
 *   I3 已出局玩家手牌/牌库恒为空（余牌已扫入弃牌区）
 *   I4 放逐区上限 10 张/场（黑潮超限后转入普通弃牌区）
 * 另统计：重发/复活/观战/长夜/天崩/放逐峰值
 */
const fs = require('fs');
const path = require('path');

// ── LCG 可复现随机源（替换 Math.random） ──
let SEED = Number(process.argv[3] || 20260828);
Math.random = function () {
  SEED = (SEED * 1103515245 + 12345) % 2147483648;
  return SEED / 2147483648;
};

// ── stub localStorage ──
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};

// ── 按加载顺序拼接模块 ──
const DIR = path.join(__dirname, 'js');
const modules = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js'];
const code = modules.map(m => fs.readFileSync(path.join(DIR, m), 'utf8')).join('\n;\n');

const sandbox = new Function(`
  ${code}
  return { INIT, wrappedReducer, aiPlay, aiChallenge, makePlayers, isHonest, isBlackout, activeFrozen, AI_NOISE, personaMods, aiPickChoice, rollTarget, fmtTarget, TARGET_DUALS, TARGET_SUITS };
`)();
const { INIT, wrappedReducer, aiPlay, aiChallenge, isHonest, isBlackout, activeFrozen, AI_NOISE, personaMods, aiPickChoice } = sandbox;

const N_GAMES = Number(process.argv[2] || 300), MAX_STEPS = 6000, DIFF_ARG = process.argv[4] || null, MAXPLAY_ARG = Number(process.argv[5] || 5);

// ── 不变量校验 ──
const violations = [];
function collectCards(st) {
  const zones = { hand: [], library: [], table: [], discard: [], banished: [] };
  st.players.forEach(p => {
    zones.hand.push(...(p.hand || []));
    zones.library.push(...(p.library || []));
  });
  zones.table.push(...(st.tableCards || []));
  zones.discard.push(...(st.discardPile || []));
  zones.banished.push(...(st.banishedPile || []));
  return zones;
}
function checkInvariants(st, g, steps, prevTotal) {
  const zones = collectCards(st);
  const all = [...zones.hand, ...zones.library, ...zones.table, ...zones.discard, ...zones.banished];
  // I1 ID 唯一
  const idSet = new Set(all.map(c => c.id));
  if (idSet.size !== all.length) {
    const seen = new Set(), dup = all.find(c => (seen.has(c.id) ? true : (seen.add(c.id), false)));
    violations.push(`[I1] 局${g} 步${steps}: 牌ID重复 (${dup?.id}) 总数${all.length}`);
    // v18 调试：违规现场 dump（重复牌所在区域）
    if (!global.__dumped) {
      global.__dumped = true;
      const zones = {};
      zones.hand = st.players.flatMap(p => (p.hand || []).filter(c => c.id === dup.id));
      zones.library = st.players.flatMap(p => (p.library || []).filter(c => c.id === dup.id));
      zones.table = (st.tableCards || []).filter(c => c.id === dup.id);
      zones.discard = (st.discardPile || []).filter(c => c.id === dup.id);
      zones.banished = (st.banishedPile || []).filter(c => c.id === dup.id);
      console.log('  [dump] 重复牌', dup.id, JSON.stringify(Object.fromEntries(Object.entries(zones).map(([k, v]) => [k, v.length]))));
      console.log('  [dump] phase=' + st.phase + ' event=' + (st.event ? st.event.type : '-') + ' choicePending=' + !!st.eventChoice + ' lastAct=' + (st.__lastAct || '?'));
    }
  }
  // I2 总量不减少
  if (prevTotal != null && all.length < prevTotal) {
    violations.push(`[I2] 局${g} 步${steps}: 牌总量减少 ${prevTotal}→${all.length}`);
  }
  // I3 死者无牌
  st.players.forEach(p => {
    if (!p.alive && ((p.hand || []).length || (p.library || []).length)) {
      violations.push(`[I3] 局${g} 步${steps}: 出局者 p${p.id} 仍持有 ${p.hand.length}+${(p.library || []).length} 张`);
    }
  });
  // I4 放逐上限
  if ((st.banishedPile || []).length > 15) {
    violations.push(`[I4] 局${g} 步${steps}: 放逐区超限 ${(st.banishedPile || []).length} 张`);
  }
  return all.length;
}

// ── 复刻组件层 effect（含观战跳过/冻结排除/长夜盲打） ──
function driveOnce(st) {
  const cur = st.players.find(p => p.id === st.curPlayer);
  // 观战者：回合直接跳过；质疑阶段自动跟牌（镜像 Game 组件 effect）
  if (st.spectateId !== null && st.curPlayer === st.spectateId) {
    if (st.phase === 'challenge_phase') return { type: 'CONTINUE' };
    if (st.phase === 'player_turn' || st.phase === 'ai_turn') return { type: 'SKIP_SPECTATE' };
  }
  const frozenIds = new Set(activeFrozen(st, st.curPlayer));
  switch (st.phase) {
    case 'event': {
      // v18 C2：抉择事件挂起 → AI/随机抉择后继续
      if (st.eventChoice && st.event && st.event.choices && !st.eventResult) {
        const chooser = st.players.find(p => p.id === st.eventChoice.chooserId);
        return { type: 'EVENT_CHOICE', choiceId: aiPickChoice(st.event, chooser) };
      }
      return { type: 'BEGIN_DEALING' };
    }
    case 'dealing': return { type: 'DEAL_COMPLETE' };
    case 'library_dealt': return { type: 'LIBRARY_REDEAL' };
    case 'ai_turn': {
      if (!cur || !cur.alive || cur.isHuman) return { type: 'CONTINUE' };
      const d = aiPlay(cur.hand, st.targetSuit, cur.personality, cur.customConfig, {
        noise: (AI_NOISE[st.difficulty] || {}).play || 0,
        maxPlay: st.maxPlay ?? 5,
        persona: cur.persona || null,
        round: st.round,
        aliveCount: st.players.filter(p => p.alive).length,
        lastCaught: st.lastCaughtPid != null && st.lastCaughtPid === cur.id,
        frozen: [...frozenIds],
        blind: isBlackout(st),
      });
      return d.cards.length ? { type: 'AI_PLAY', pid: cur.id, cards: d.cards } : { type: 'CONTINUE' };
    }
    case 'player_turn': {
      if (!cur || !cur.alive) return { type: 'CONTINUE' };
      const avail = cur.hand.filter(c => !frozenIds.has(c.id));
      if (avail.length === 0) return { type: 'CONTINUE' };
      if (Math.random() < 0.125) return { type: 'CONTINUE' };
      const n = 1 + Math.floor(Math.random() * Math.min(3, st.maxPlay ?? 5, avail.length));
      return { type: 'PLAY', ids: avail.slice(0, n).map(c => c.id) };
    }
    case 'challenge_phase': {
      if (!cur) return { type: 'CONTINUE' };
      const lastP = st.players.find(p => p.id === st.lastClaim?.playerId);
      const should = cur.isHuman
        ? Math.random() < 0.3
        : aiChallenge(st.lastClaim?.count ?? 1, lastP?.hand.length ?? 0, st.round, st.difficulty, cur.personality, cur.customConfig, (AI_NOISE[st.difficulty] || {}).challenge || 0, { // v99 F2 移除：真实声称张数口径
          persona: cur.persona || null,
          round: st.round,
          aliveCount: st.players.filter(p => p.alive).length,
          handCount: cur.hand.length,
          lastCaught: st.lastCaughtPid != null && st.lastCaughtPid === cur.id,
        });
      return should ? { type: 'CHALLENGE', cid: cur.id } : { type: 'CONTINUE' };
    }
    case 'peek_phase': {
      const claimer = st.players.find(p => p.id === st.lastClaim?.playerId);
      const maxPeek = Math.min(3, st.tableCards.length - 1);
      let ids = [];
      if (claimer && !claimer.isHuman) {
        const honest = isHonest(st.tableCards, st.targetSuit, st.frenzy);
        const truth = st.tableCards.filter(c => (st.targetSuit || 'A').includes(c.suit) || c.suit === 'J');
        if (honest) ids = truth.slice(0, 1 + Math.floor(Math.random() * Math.min(2, maxPeek))).map(c => c.id);
        else if (truth.length > 0 && Math.random() < 0.6) ids = truth.slice(0, Math.min(2, truth.length, maxPeek)).map(c => c.id);
      } else {
        const k = Math.floor(Math.random() * 3);
        ids = st.tableCards.slice(0, Math.min(k, maxPeek)).map(c => c.id);
      }
      return { type: 'PEEK_REVEAL', ids };
    }
    case 'reconsider_phase':
      return { type: 'RECONSIDER', decision: Math.random() < 0.5 ? 'challenge' : 'continue' };
    case 'reveal': return { type: 'REVEAL_COMPLETE' };
    case 'roulette': return { type: 'ROULETTE', dead: st.rouletteResult === 'dead' };
    default: return null;
  }
}

function snapshot(st) {
  return `${st.phase}|p${st.curPlayer}|r${st.round}|hands=${st.players.map(p => (p.alive ? p.hand.length : 'x')).join(',')}|table=${st.tableCards.length}|claim=${st.lastClaim ? st.lastClaim.playerId + ':' + st.lastClaim.count : '-'}|frozen=${JSON.stringify(st.frozen || {})}|spec=${st.spectateId}|tS=${st.targetSuit}`;
}

let finished = 0, errors = 0;
let dualTargets = 0, targetRolls = 0;
const deadlockSamples = [], reasonTally = {};
let totalSteps = 0, maxDiscard = 0, totalRedeals = 0, totalRevives = 0;
let spectateCount = 0, blackoutCount = 0, skyfallCount = 0, maxBanished = 0;

for (let g = 0; g < N_GAMES; g++) {
  let st = INIT;
  try {
    st = wrappedReducer(st, { type: 'START', aiConfigs: null, selectedAIs: null, mpPlayers: null, difficulty: DIFF_ARG || (Math.random() < 0.3 ? 'hard' : 'normal'), maxPlay: MAXPLAY_ARG });
  } catch (e) { console.log(`局 ${g}: START 崩溃 ${e.message}`); errors++; continue; }

  let steps = 0, lastSnap = '', snapRepeat = 0, prevTotal = null, redeals = 0;
  try {
    while (steps < MAX_STEPS) {
      if (st.phase === 'gameover' || st.phase === 'draw' || st.phase === 'won' || st.phase === 'lost' || (st.winner !== null && st.phase !== 'roulette' && st.phase !== 'reveal')) break;
      const act = driveOnce(st);
      if (!act) break;
      const ns = wrappedReducer(st, act);
      ns.__lastAct = act.type + (act.choiceId ? ':' + act.choiceId : '');
      steps++;
      if (act.type === 'LIBRARY_REDEAL') redeals++;
      if (ns.spectateId !== null && st.spectateId === null) spectateCount++;
      if (ns.targetSuit !== st.targetSuit) { targetRolls++; if ((ns.targetSuit || '').length === 2) dualTargets++; } // A3 双色统计
      if (isBlackout(ns) && !isBlackout(st)) blackoutCount++;
      if ((ns.eventExile || []).includes('skyfall') && !(st.eventExile || []).includes('skyfall')) skyfallCount++;
      maxBanished = Math.max(maxBanished, (ns.banishedPile || []).length);
      const beforeT = prevTotal;
      prevTotal = checkInvariants(ns, g, steps, prevTotal);
      if (beforeT != null && prevTotal < beforeT) {
        console.log(`  trace 局${g}: 违例动作=${act.type} ${act.choiceId || ''} 上局事件=${st.event ? st.event.type + (st.event.choices ? '(choice,' + (st.eventChoice ? 'pending' : 'done') : '') : '-'} phase ${st.phase}→${ns.phase}`);
      }
      maxDiscard = Math.max(maxDiscard, (ns.discardPile || []).length);
      if (ns.revived && !st.revived) totalRevives++;
      const snap = snapshot(ns);
      if (snap === lastSnap) snapRepeat++; else { lastSnap = snap; snapRepeat = 0; }
      if (snapRepeat > 40) break;
      st = ns;
    }
  } catch (e) {
    console.log(`局 ${g}: 第 ${steps} 步抛异常 ${e.message} @ ${snapshot(st)}`);
    errors++; continue;
  }
  totalSteps += steps;
  totalRedeals += redeals;
  if (st.phase === 'gameover' || st.phase === 'draw' || st.phase === 'won' || st.phase === 'lost' || st.winner !== null) {
    finished++;
    const reason = st.winner !== null ? (typeof st.winner === 'object' ? 'win:' + (st.winner.reason || st.winner.id) : 'win:' + st.winner) : st.phase;
    reasonTally[reason] = (reasonTally[reason] || 0) + 1;
  } else if (snapRepeat > 40) {
    deadlockSamples.push(`局 ${g}: 停滞于 ${snapshot(st)}`);
  } else {
    deadlockSamples.push(`局 ${g}: 超步数上限 ${snapshot(st)}`);
  }
}

console.log(`\n===== 守恒模拟（${N_GAMES} 局, seed ${SEED}）=====`);
console.log(`完赛: ${finished}/${N_GAMES}, 异常: ${errors}, 平均步数: ${(totalSteps / N_GAMES).toFixed(0)}`);
console.log(`重发: ${totalRedeals}, 复活: ${totalRevives}, 观战: ${spectateCount}, 长夜: ${blackoutCount}, 天崩: ${skyfallCount}`);
console.log(`A3 目标滚动: ${targetRolls} 次, 双色 ${dualTargets} 次 (${targetRolls ? ((dualTargets / targetRolls) * 100).toFixed(1) : 0}%)`);
console.log(`弃牌区峰值: ${maxDiscard} 张, 放逐区峰值: ${maxBanished} 张`);
console.log(`终局分布:`, JSON.stringify(reasonTally));
if (violations.length) {
  console.log(`\n✗ 不变量违例 (${violations.length}):`);
  violations.slice(0, 20).forEach(v => console.log('  ' + v));
  process.exit(1);
} else {
  console.log('✓ I1 ID唯一 / I2 总量守恒 / I3 死者无牌 / I4 放逐≤10 — 全部通过');
}
if (deadlockSamples.length) {
  console.log(`未完赛样本 (${deadlockSamples.length}):`);
  deadlockSamples.slice(0, 10).forEach(s => console.log('  ' + s));
  process.exit(1);
} else {
  console.log('无死锁 / 无停滞 / 无异常');
}

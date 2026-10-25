/**
 * sim-roles.js — A1 角色强度调平报告：8 角色各带 3 基准 AI 上桌 + 无角色对照
 * 用法：node sim-roles.js [局数] [seed]
 *
 * 实验设计（配对实验）：
 * - 4 人纯 AI 桌，p0 注入待测角色（其余 3 席为基准人格）
 * - 每组前重置 LCG 到同一 seed → 同牌序同事件流，角色为唯一变量
 * - 对照组：全员无角色（roles 清空）
 * - 指标：胜率 / 存活率 / 平均轮 / 吹牌成功每局 / 平局 / 未完
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = 777;
const lcg = () => { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
Math.random = lcg;
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

const code = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js'].map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const sandbox = new Function(code + '\nreturn { INIT, wrappedReducer, aiPlay, aiChallenge, aiPickChoice, AI_PRESETS, AI_NOISE, ROLE_IDS, aiWantsSkill, roleOf };')();
const { INIT, wrappedReducer, aiPlay, aiChallenge, aiPickChoice, AI_PRESETS, AI_NOISE, ROLE_IDS, aiWantsSkill, roleOf } = sandbox;

const N_GAMES = Number(process.argv[2] || 200);
const MAX_STEPS = 3000;

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 与 sim-persona 同源的动作驱动（v23 RECONSIDER 协议 + F2 迷雾启发式）
function driveOnce(st) {
  const cur = st.players.find(p => p.id === st.curPlayer);
  const frozenIds = new Set(st.frozen && st.frozen[st.curPlayer] ? st.frozen[st.curPlayer] : []);
  switch (st.phase) {
    case 'player_turn': {
      // p0 人类位：随机出牌近似人类策略（与 sim-persona 同口径）
      if (!cur || !cur.alive) return { type: 'CONTINUE' };
      const avail = cur.hand.filter(c => !frozenIds.has(c.id));
      if (avail.length === 0) return { type: 'CONTINUE' };
      const n = 1 + Math.floor(Math.random() * Math.min(3, st.maxPlay ?? 5, avail.length));
      return { type: 'PLAY', ids: shuffle([...avail]).slice(0, n).map(c => c.id) };
    }
    case 'dealing': return { type: 'DEAL_COMPLETE' };
    case 'library_dealt': return { type: 'LIBRARY_REDEAL' };
    case 'event': {
      // 复刻 UI 协议：抉择事件 AI 选择 → 事件执行在 reducer 内完成 → 直接开新一轮
      // （EVENT_DONE 为引擎死代码，UI 播报后直接 BEGIN_DEALING，见 50-game 665/896 行）
      if (st.eventChoice && !st.eventResult) {
        const chooser = st.players[st.eventChoice.chooserId];
        const c = aiPickChoice(st.event, chooser); // 返回选项 id 字符串
        return { type: 'EVENT_CHOICE', choiceId: c };
      }
      return { type: 'BEGIN_DEALING' };
    }
    case 'ai_turn': {
      if (!cur || !cur.alive || cur.isHuman) return { type: 'CONTINUE' };
      // A1：AI 主动技能（复刻 50-game 组件层：先技能本拍不出牌）
      if (aiWantsSkill(st, cur.id)) return { type: 'SKILL_USE', pid: cur.id, skillId: roleOf(st, cur.id) };
      const d = aiPlay(cur.hand, st.targetSuit, cur.personality, cur.customConfig, {
        noise: (AI_NOISE[st.difficulty] || {}).play || 0, maxPlay: st.maxPlay ?? 5,
        frozen: [...frozenIds], blind: !!(st.blackoutUntil && st.round < st.blackoutUntil),
        persona: cur.persona || null, round: st.round,
        aliveCount: st.players.filter(p => p.alive).length,
        lastCaught: st.lastCaughtPid != null && st.lastCaughtPid === cur.id,
      });
      if (d.cards && d.cards.length) return { type: 'AI_PLAY', pid: cur.id, cards: d.cards };
      // 没出牌：让过（CONTINUE 走 advanceAfterChallenge 推进）
      return { type: 'CONTINUE' };
    }
    case 'challenge_phase': {
      if (!cur || !cur.alive) return { type: 'CONTINUE' };
      const lastP = st.players.find(p => p.id === st.lastClaim?.playerId);
      const should = aiChallenge(st.lastClaim?.count ?? 0, lastP?.hand.length ?? 0, st.round, st.difficulty, cur.personality, cur.customConfig, (AI_NOISE[st.difficulty] || {}).challenge || 0, {
        persona: cur.persona || null, round: st.round,
        aliveCount: st.players.filter(p => p.alive).length, handCount: cur.hand.length,
        lastCaught: st.lastCaughtPid != null && st.lastCaughtPid === cur.id,
      });
      return should ? { type: 'CHALLENGE', cid: cur.id } : { type: 'CONTINUE' };
    }
    case 'peek_phase': return { type: 'PEEK_REVEAL' };
    case 'reconsider_phase': {
      const peeked = st.peekedCards || [];
      const truthPeeked = peeked.filter(c => (st.targetSuit || 'A').includes(c.suit) || c.suit === 'J').length;
      let cprob = 0.5;
      if (peeked.length > 0) cprob = 1 - (truthPeeked / peeked.length) * 0.7;
      const chP = st.players.find(p => p.id === st.challengerId);
      if (chP) {
        if (chP.personality === 'aggressive') cprob += 0.15;
        if (chP.personality === 'conservative') cprob -= 0.15;
      }
      return { type: 'RECONSIDER', decision: Math.random() < cprob ? 'challenge' : 'continue' };
    }
    case 'reveal': return { type: 'REVEAL_COMPLETE' };
    case 'roulette': return { type: 'ROULETTE', dead: st.rouletteResult === 'dead' };
    default: return null;
  }
}

function isEnd(st) {
  return st.phase === 'gameover' || st.phase === 'draw' || st.phase === 'won' || st.phase === 'lost' ||
    (st.winner !== null && st.phase !== 'roulette' && st.phase !== 'reveal');
}

const results = {};
const GROUPS = [{ label: '（无角色对照）', role: null }].concat(ROLE_IDS.map(id => ({ label: id, role: id })));

for (const g of GROUPS) {
  const r = { games: 0, wins: 0, others: 0, p0Alive: 0, totalRounds: 0, totalBluffs: 0, draws: 0, unfinished: 0, skills: 0 };
  for (let gi = 0; gi < N_GAMES; gi++) {
    SEED = 777 + gi; Math.random = lcg; // 每局同 seed：组间同牌序（配对）
    let st = wrappedReducer(JSON.parse(JSON.stringify(INIT)), { type: 'START', playerNames: ['待测AI', '基准甲', '基准乙', '基准丙'], difficulty: 'normal', maxPlay: 5 });
    // p0 人类位 → 替换为基准 AI（复刻 sim-persona：技能 effect 只对 !isHuman 生效）
    st.players = st.players.map(p => p.id === 0 ? { ...p, isHuman: false, personality: 'custom', customConfig: { ...AI_PRESETS[0] } } : p);
    if (g.role) {
      st = { ...st, roles: { ...st.roles, 0: g.role } };
      st = { ...st, skillCharges: { ...st.skillCharges, 0: { [g.role]: 1 } } };
      st = { ...st, skillCd: { ...st.skillCd, 0: {} } };
    } else {
      st = { ...st, roles: {}, skillCharges: {}, skillCd: {} };
    }
    let steps = 0, snap = '', snapRepeat = 0, stuckPhase = '', skillChain = 0, lastActType = '', rouletteActed = false;
    while (!isEnd(st) && steps < MAX_STEPS) {
      if (process.env.DBG && r.games === 0 && steps < 6) console.error('step' + steps + ' pre phase=' + st.phase + ' choice=' + JSON.stringify(st.eventChoice) + ' event=' + (st.event && st.event.type));
      // 严格模式（SIM_STRICT=1）：禁用"重发 ROULETTE"自愈——真实 UI 的一次性 useEffect 不重发动作，
      // 每个 roulette phase 只允许结算一次；ROULETTE 结算后仍停留 roulette 即判卡死。
      // 注意 REVEAL_COMPLETE 本身就把 phase 置为 'roulette'（预定制），属正常等待态，不算卡。
      if (process.env.SIM_STRICT && st.phase === 'roulette' && rouletteActed) { stuckPhase = 'strict@roulette-stuck'; break; }
      const act = driveOnce(st);
      if (!act) { stuckPhase = 'null@' + st.phase; break; }
      // 引擎软锁绕行：aiWantsSkill=true 但 applySkill 无 effect 时 SKILL_USE 被 reducer 弹回，
      // st 原引用返回 → 模拟/真实 effect 均不重跑 → AI 回合死锁（批三修 aiWantsSkill 前置条件）。
      // 模拟侧连续 8 次 SKILL_USE 强制让过，保对局可推进。
      lastActType = act.type;
      if (act.type === 'SKILL_USE') { skillChain++; if (skillChain > 8) { act = { type: 'CONTINUE' }; lastActType = 'CONTINUE(强制)'; } } else skillChain = 0;
      if (act.type === 'SKILL_USE' && st.curPlayer === 0) r.skills++;
      try { st = wrappedReducer(st, act); } catch (e) {
        // 崩溃现场取证（v89 排障临时钩子：dump 后原样抛出，不影响基线）
        fs.writeFileSync('debug-crash-state.json', JSON.stringify({
          err: String(e && e.stack || e).split('\n')[0], group: g.label, game: gi, steps, act,
          phase: st.phase, curPlayer: st.curPlayer, challengerId: st.challengerId, lastClaim: st.lastClaim,
          targetSuit: st.targetSuit, reversed: st.reversed, spectateId: st.spectateId, round: st.round,
          winner: st.winner, winReason: st.winReason, event: st.event && st.event.type,
          tableCards: st.tableCards.length,
          players: st.players.map(p => ({ id: p.id, alive: p.alive, isHuman: p.isHuman, hand: (p.hand || []).length, library: (p.library || []).length, immune: p.immuneId != null })),
        }, null, 2));
        throw e;
      }
      steps++;
      // 严格模式追踪：ROULETTE 结算后若 phase 仍停留 roulette，标记已结算未推进（下一步即 break）
      rouletteActed = (act.type === 'ROULETTE') && st.phase === 'roulette';
      const sig = JSON.stringify([st.phase, st.curPlayer, st.round, st.players.map(p => p.hand.length)]);
      if (sig === snap) snapRepeat++; else { snap = sig; snapRepeat = 0; }
      if (snapRepeat > 60) {
        stuckPhase = 'loop@' + st.phase;
        if (process.env.DBG) {
          const c0 = st.players[st.curPlayer];
          console.error('LOOP现场: cur=' + st.curPlayer + ' lastAct=' + lastActType + ' chain=' + skillChain + ' alive=' + st.players.map(p => p.id + (p.alive ? 'a' : 'd') + ':' + p.hand.length + '/' + (p.library || []).length).join(' ') + ' round=' + st.round + ' lastClaim=' + JSON.stringify(st.lastClaim));
        }
        break;
      }
    }
    r.games++;
    const wid = typeof st.winner === 'object' ? st.winner?.id : st.winner;
    const ended = st.phase === 'gameover' || st.phase === 'won' || st.phase === 'lost';
    if (ended && wid === 0) r.wins++;
    else if (st.phase === 'draw') r.draws++;
    else if (ended) r.others++; // 正常终局、他人获胜
    else { r.unfinished++; const k = stuckPhase || ('maxsteps@' + st.phase); r.stuckPhases = r.stuckPhases || {}; r.stuckPhases[k] = (r.stuckPhases[k] || 0) + 1; }
    if (st.players[0].alive) r.p0Alive++;
    r.totalRounds += st.round;
    r.totalBluffs += st.players[0].bluffSuccessCount || 0;
  }
  results[g.label] = r;
}

console.log(`\n===== A1 角色强度（各 ${N_GAMES} 局 · 4 人桌 p0 注入角色 · seed 777+gi 配对）=====`);
console.log('组别          胜率    存活率   平均轮  吹牌/局  技能/局  未完');
const rows = Object.entries(results).sort((a, b) => (b[1].wins / b[1].games) - (a[1].wins / a[1].games));
for (const [label, r] of rows) {
  const wr = (r.wins / r.games * 100).toFixed(1).padStart(5);
  const ar = (r.p0Alive / r.games * 100).toFixed(1).padStart(5);
  const rd = (r.totalRounds / r.games).toFixed(1).padStart(6);
  const bf = (r.totalBluffs / r.games).toFixed(2).padStart(7);
  const sk = (r.skills / r.games).toFixed(2).padStart(7);
  console.log(`${label.padEnd(9)} ${wr}%  ${ar}%  ${rd}  ${bf}  ${sk}  ${String(r.unfinished).padStart(3)}`);
}
for (const [label, r] of Object.entries(results)) {
  if (r.unfinished > 0) console.log(`  [未完归因] ${label}: ` + JSON.stringify(r.stuckPhases || {}));
}
const base = results['（无角色对照）'];
console.log('\n—— 相对对照胜率差（±8% 以上视为需调平信号）——');
for (const [label, r] of rows) {
  if (label === '（无角色对照）') continue;
  const d = (r.wins - base.wins) / r.games * 100;
  const flag = Math.abs(d) > 8 ? ' ← 需调平' : '';
  console.log(`${label.padEnd(9)} ${d >= 0 ? '+' : ''}${d.toFixed(1)}%${flag}`);
}

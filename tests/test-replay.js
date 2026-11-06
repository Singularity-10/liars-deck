/**
 * test-replay.js — D1 对局回放白盒（v21）
 * 用法：node test-replay.js
 * 覆盖：录制开/关、RNG 磁带、重建等价性（重放终局 === 实际终局）、
 *       导出/导入 roundtrip、RESTART 重置、SYNC_STATE 旁路、重建确定性、步骤文案
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = 20260910;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

// 注意：45-replay.js 必须与引擎同域求值（它覆写 wrappedReducer / Math.random）
const files = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js', '45-replay.js'];
const code = files.map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const sandbox = new Function(code + `
return { INIT, wrappedReducer, aiPlay, aiChallenge, makePlayers, isHonest, isBlackout, activeFrozen, AI_NOISE, personaMods, aiPickChoice, Replay, replayActionLabel, replayExportCode, replayImportCode, replayBuildSnapshots };`)();
const { INIT, wrappedReducer, aiPlay, aiChallenge, isHonest, isBlackout, activeFrozen, AI_NOISE, personaMods, aiPickChoice, Replay, replayActionLabel, replayExportCode, replayImportCode, replayBuildSnapshots } = sandbox;

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }

function norm(s) {
  // 快照对比前剥离易变字段（UI 组件传入的函数等不会进 JSON；undefined 键在 clone 时已丢）
  const c = JSON.parse(JSON.stringify(s));
  delete c.__lastAct;
  return JSON.stringify(c);
}

function isEnd(st) {
  return st.phase === 'gameover' || st.phase === 'draw' || st.phase === 'won' || st.phase === 'lost' ||
    (st.winner !== null && st.phase !== 'roulette' && st.phase !== 'reveal');
}

// 与 sim-discard 相同的动作驱动：AI 回合走 aiPlay，其余按 phase 派最小动作
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
        : aiChallenge(st.lastClaim?.count ?? 0, lastP?.hand.length ?? 0, st.round, st.difficulty, cur.personality, cur.customConfig, (AI_NOISE[st.difficulty] || {}).challenge || 0, {
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

function playFullGame(maxSteps = 600) {
  let st = INIT;
  st = wrappedReducer(st, { type: 'START', aiConfigs: null, selectedAIs: null, mpPlayers: null, difficulty: 'normal', maxPlay: 5 });
  let steps = 0;
  while (steps < maxSteps) {
    if (isEnd(st)) break;
    const act = driveOnce(st);
    if (!act) break;
    st = wrappedReducer(st, act);
    steps++;
  }
  return { st, steps };
}

console.log('── T1 录制开启：START 入日志、磁带非空 ──');
{
  const { st } = playFullGame(1);
  assert(Replay.actions.length >= 1, 'START 应入日志');
  assert(Replay.actions[0].a.type === 'START', '首条应为 START');
  assert(Replay.tape.length > 0, 'START（洗牌/角色分配）应消耗磁带');
  assert(Array.isArray(Replay.actions[0].a.aiConfigs) || Replay.actions[0].a.aiConfigs === null, 'payload 应可 JSON 化');
  assert(Replay.enabled === true, '默认开启录制');
}

console.log('── T2 完整对局重建等价：重放终局 === 实际终局 ──');
{
  const { st: finalSt, steps } = playFullGame();
  assert(steps > 5, '对局应推进多步（实际 ' + steps + '）');
  assert(Replay.actions.length === steps + 1, '日志条数应等于动作数+1（实际 ' + Replay.actions.length + ' vs ' + (steps + 1) + '）');
  const snaps = replayBuildSnapshots({ actions: Replay.actions, tape: Replay.tape });
  assert(snaps.length === Replay.actions.length + 1, '快照数 = 动作数 + 1（基座）');
  assert(norm(snaps[snaps.length - 1]) === norm(finalSt), '重放终局状态应与实际终局逐位一致');
  assert(isEnd(snaps[snaps.length - 1]), '重放终局应到达终局相位');
}

console.log('── T3 回放码导出/导入 roundtrip ──');
{
  const codeStr = replayExportCode({ tag: 'T3' });
  assert(typeof codeStr === 'string' && codeStr.length > 100, '回放码应为长 base64 串');
  const data = replayImportCode(codeStr);
  assert(data && Array.isArray(data.actions) && Array.isArray(data.tape), '导入应还原 actions/tape');
  assert(data.meta && data.meta.tag === 'T3', 'meta 应随码保存');
  const snaps2 = replayBuildSnapshots(data);
  assert(norm(snaps2[snaps2.length - 1]) === norm(replayBuildSnapshots({ actions: Replay.actions, tape: Replay.tape }).slice(-1)[0]), '导入码重建与直接重建一致');
  // 非法输入
  let threw = false;
  try { replayImportCode('not-a-code'); } catch (e) { threw = true; }
  assert(threw, '非法回放码应抛错');
}

console.log('── T4 RESTART 重置日志与磁带 ──');
{
  const before = Replay.actions.length;
  assert(before > 0, '前置：日志非空');
  let st = INIT;
  st = wrappedReducer(st, { type: 'START', aiConfigs: null, selectedAIs: null, mpPlayers: null, difficulty: 'hard', maxPlay: 5 });
  assert(Replay.actions.length === 1, 'START 应重置日志并作为首条');
  assert(Replay.tape.length > 0 && Replay.tape.length < 500, '磁带应重置且为正常量级');
}

console.log('── T5 SYNC_STATE 旁路 ──');
{
  const before = Replay.actions.length;
  const fakeSync = { type: 'SYNC_STATE', state: { ...INIT, phase: 'ai_turn' } };
  const ns = wrappedReducer(INIT, fakeSync);
  assert(Replay.actions.length === before, 'SYNC_STATE 不应入日志');
  assert(Replay.tape.length < 500, 'SYNC_STATE 不应消耗磁带');
}

console.log('── T6 重建确定性（同码两遍一致）──');
{
  const data = replayImportCode(replayExportCode({}));
  const s1 = replayBuildSnapshots(data);
  const s2 = replayBuildSnapshots(data);
  assert(norm(s1[s1.length - 1]) === norm(s2[s2.length - 1]), '两次重建终局一致');
  assert(s1.length === s2.length, '两次重建步数一致');
}

console.log('── T7 步骤文案 ──');
{
  const data = replayImportCode(replayExportCode({}));
  let allLabeled = true;
  for (let i = 1; i < data.actions.length; i++) {
    const lbl = replayActionLabel(data.actions[i].a, null);
    if (!lbl || typeof lbl !== 'string' || !lbl.trim()) { allLabeled = false; console.log('  空文案:', data.actions[i].a.type); }
  }
  assert(allLabeled, '所有已录动作类型都应有非空文案');
  assert(replayActionLabel({ type: 'START' }, null).indexOf('开局') >= 0, 'START 文案');
}

console.log('── T8 录制关闭（联机客户端口径）──');
{
  Replay.enabled = false;
  const before = Replay.actions.length;
  let st = INIT;
  st = wrappedReducer(st, { type: 'CONTINUE' });
  assert(Replay.actions.length === before, '关闭后不应记录');
  Replay.enabled = true;
}

console.log(`\n===== test-replay: ${pass} 项通过, ${fail} 项失败 =====`);
process.exit(fail ? 1 : 0);

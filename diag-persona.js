/**
 * diag-persona.js — 人格弱项定向诊断（9-12）：露西为何垫底 / 玛丽为何苟局多
 * 用法：node diag-persona.js [局数] [seed]
 * 每局终态收集：待测人格（p0）的 存活名次 / 中枪数 / 出牌数 / 质疑数 / 平局局手牌分布
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = Number(process.argv[3] || 2024);
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

const code = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js'].map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const sandbox = new Function(code + '\nreturn { INIT, wrappedReducer, aiPlay, aiChallenge, aiPickChoice, AI_PRESETS, AI_NAMES, AI_PERSONAS, AI_NOISE };')();
const { INIT, wrappedReducer, aiPlay, aiChallenge, aiPickChoice, AI_PRESETS, AI_NAMES, AI_PERSONAS, AI_NOISE } = sandbox;

const N_GAMES = Number(process.argv[2] || 300);
const MAX_STEPS = 3000;

function driveOnce(st) {
  const cur = st.players.find(p => p.id === st.curPlayer);
  if (st.spectateId !== null && st.curPlayer === st.spectateId) {
    if (st.phase === 'challenge_phase') return { type: 'CONTINUE' };
    if (st.phase === 'player_turn' || st.phase === 'ai_turn') return { type: 'SKIP_SPECTATE' };
  }
  const frozenIds = new Set(st.frozen && st.frozen[st.curPlayer] ? st.frozen[st.curPlayer] : []);
  switch (st.phase) {
    case 'start': return { type: 'BEGIN_DEALING' };
    case 'event': {
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
        noise: (AI_NOISE[st.difficulty] || {}).play || 0, maxPlay: st.maxPlay ?? 5,
        persona: cur.persona || null, round: st.round,
        aliveCount: st.players.filter(p => p.alive).length,
        lastCaught: st.lastCaughtPid != null && st.lastCaughtPid === cur.id,
        frozen: [...frozenIds], blind: !!(st.blackoutUntil && st.round < st.blackoutUntil),
      });
      return d.cards && d.cards.length ? { type: 'AI_PLAY', pid: cur.id, cards: d.cards } : { type: 'CONTINUE' };
    }
    case 'player_turn': {
      if (!cur || !cur.alive) return { type: 'CONTINUE' };
      const avail = cur.hand.filter(c => !frozenIds.has(c.id));
      if (avail.length === 0) return { type: 'CONTINUE' };
      const n = 1 + Math.floor(Math.random() * Math.min(3, st.maxPlay ?? 5, avail.length));
      return { type: 'PLAY', ids: shuffle([...avail]).slice(0, n).map(c => c.id) };
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
    case 'reconsider_phase': return { type: 'RECONSIDER', fold: true };
    case 'reveal': return { type: 'REVEAL_COMPLETE' };
    case 'roulette': return { type: 'ROULETTE', dead: st.rouletteResult === 'dead' };
    default: return null;
  }
}
const { shuffle } = new Function(code + '\nreturn { shuffle };')();

// ── 诊断收集 ──
const names = AI_NAMES;
const agg = {}; // name -> counters
for (const n of names) agg[n] = { games: 0, wins: 0, draws: 0, unfinished: 0,
  placementSum: 0, shotSum: 0, playSum: 0, chalSum: 0, bluffCaughtSum: 0,
  drawGames: 0, drawHandSum: 0, deathRoundSum: 0, deaths: 0 };

function endStat(st) {
  // 待测者是 p0
  const p0 = st.players.find(p => p.id === 0);
  const ps = st.playerStats?.[0] || { playCount: 0, challengeCount: 0, shotCount: 0 };
  const alive = st.players.filter(p => p.alive).length;
  // 名次：活着且未出局 = 1（若胜者）；否则按出局先后不可得，用 alive 近似：越早死名次越大
  return { alive, ps, hand: p0.hand.length, round: st.round };
}

for (let tag = 0; tag < 8; tag++) {
  const name = names[tag];
  const cfgs = [AI_PRESETS[1], AI_PRESETS[2], AI_PRESETS[3]];
  const selected = [tag, 1, 2, 3];
  for (let g = 0; g < N_GAMES; g++) {
    let st = wrappedReducer(JSON.parse(JSON.stringify(INIT)), { type: 'START', aiConfigs: cfgs, selectedAIs: selected.slice(1), mpPlayers: null, difficulty: 'normal', maxPlay: 5 });
    st.players = st.players.map(p => p.id === 0 ? { ...p, isHuman: false, personality: 'custom', customConfig: { ...AI_PRESETS[tag] }, persona: AI_PERSONAS[tag] || null } : p);
    let steps = 0, snap = '', snapRepeat = 0;
    try {
      while (steps < MAX_STEPS) {
        if (st.phase === 'gameover' || st.phase === 'draw' || st.phase === 'won' || st.phase === 'lost' || (st.winner !== null && st.winner !== undefined && st.phase !== 'roulette' && st.phase !== 'reveal')) break;
        const act = driveOnce(st);
        if (!act) break;
        st = wrappedReducer(st, act);
        steps++;
        const s = JSON.stringify([st.phase, st.curPlayer, st.players.map(p => p.hand.length)]);
        if (s === snap) snapRepeat++; else { snap = s; snapRepeat = 0; }
        if (snapRepeat > 40) break;
      }
    } catch (e) { agg[name].unfinished++; agg[name].games++; continue; }
    const a = agg[name];
    a.games++;
    const ended = st.phase === 'gameover' || st.phase === 'won' || st.phase === 'lost';
    const isDraw = st.phase === 'draw';
    if (isDraw) a.draws++;
    else if (ended) {
      const wid = typeof st.winner === 'object' ? st.winner?.id : st.winner;
      if (wid === 0) a.wins++;
    } else { a.unfinished++; continue; }
    const { alive, ps, hand, round } = endStat(st);
    // 名次近似：4 人桌，存活 1（赢）=1 名；平局全员存活记 1；其他按 alive 排（粗粒度够用）
    a.placementSum += isDraw ? 1 : (alive === 1 && !isDraw ? (st.players.find(p => p.id === 0).alive ? 1 : alive) : alive);
    a.shotSum += ps.shotCount || 0;
    a.playSum += ps.playCount || 0;
    a.chalSum += ps.challengeCount || 0;
    a.deathRoundSum += round; a.deaths++;
    if (isDraw) { a.drawGames++; a.drawHandSum += hand; }
  }
}

console.log(`\n===== 人格诊断（各 ${N_GAMES} 局 · seed ${process.argv[3] || 2024}）=====`);
console.log('人格      胜率    平局  中枪/局 出牌/局 质疑/局 平局局手牌');
const rows = Object.entries(agg).sort((a, b) => (b[1].wins / b[1].games) - (a[1].wins / a[1].games));
for (const [name, a] of rows) {
  console.log(`${name.padEnd(6)} ${((a.wins / a.games) * 100).toFixed(1).padStart(5)}%  ${String(a.draws).padStart(4)}  ${(a.shotSum / a.games).toFixed(2).padStart(6)}  ${(a.playSum / a.games).toFixed(1).padStart(6)}  ${(a.chalSum / a.games).toFixed(2).padStart(6)}  ${a.drawGames ? (a.drawHandSum / a.drawGames).toFixed(1) : '-'}${a.drawGames ? `(${a.drawGames})` : ''}`);
}

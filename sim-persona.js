/**
 * sim-persona.js — B1 人格强度调平报告：8 人格各带 3 个基准 AI 上桌
 * 用法：node sim-persona.js [局数] [seed]
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = Number(process.argv[3] || 777);
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

const code = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '30-ai.js'].map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const sandbox = new Function(code + '\nreturn { INIT, wrappedReducer, aiPlay, aiChallenge, aiPickChoice, AI_PRESETS, AI_NAMES, AI_PERSONAS, AI_NOISE };')();
const { INIT, wrappedReducer, aiPlay, aiChallenge, aiPickChoice, AI_PRESETS, AI_NAMES, AI_PERSONAS, AI_NOISE } = sandbox;

const N_GAMES = Number(process.argv[2] || 200);
const MAX_STEPS = 3000;


// 复刻组件层 effect（与 sim-discard 一致的驱动，去掉不变量检查以提速）
function driveOnce(st) {
  const cur = st.players.find(p => p.id === st.curPlayer);
  if (st.spectateId !== null && st.curPlayer === st.spectateId) {
    if (st.phase === 'challenge_phase') return { type: 'CONTINUE' };
    if (st.phase === 'player_turn' || st.phase === 'ai_turn') return { type: 'SKIP_SPECTATE' };
  }
  const activeFrozen = sandbox.ACTIVE_FROZEN ? sandbox.ACTIVE_FROZEN : null;
  const frozenIds = new Set(st.frozen && st.frozen[st.curPlayer] ? st.frozen[st.curPlayer] : []);
  switch (st.phase) {
    case 'event': {
      // v18 C2：抉择事件挂起 → AI 按人格抉择后继续（与 sim-discard 对齐）
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
    case 'reconsider_phase': {
      // v23 F2 起协议为 decision:'challenge'|'continue'（旧 fold:true 已失效，曾致模拟桌 100% 继续质疑）
      // 逐行复刻 50-game.js AI 决策：peeked 真牌占比压质疑率 + aggressive/conservative ±0.15
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
// shuffle 从 10-utils 注入
const { shuffle } = new Function(code + '\nreturn { shuffle };')();

// ── 跑表：每个人格 × N 局（1 个人格 AI + 3 个基准 AI 索引 1/2/3）──
const results = {}; // name -> {games, wins, draws, steps}
const benchIdx = [1, 2, 3]; // 瘸腿老汤姆/红发玛丽/铁手比尔（基准：参数型人格）
for (let tag = 0; tag < 8; tag++) {
  const name = AI_NAMES[tag];
  results[name] = { games: 0, wins: 0, draws: 0, totalSteps: 0, unfinished: 0 };
  const cfgs = [AI_PRESETS[1], AI_PRESETS[2], AI_PRESETS[3]]; // 3 个基准（对应 selectedAIs 里基准索引的 customConfig）
  const selected = [tag, 1, 2, 3]; // 选 4 人？——游戏 4 人桌 = 1 主 + 3 AI？不对：makePlayers cfgs/selectedAIs 是 AI 列表，人类是 p0。
  // 这里要纯 AI 桌：用 mpPlayers 路径构造 4 AI？makePlayers mpPlayers 需要 isAI 标记
  // 简化：p0 当"人类"但由 driveOnce 的 ai 逻辑驱动？p0 是 isHuman → player_turn 分支会走人类策略。
  // 更纯净：mpPlayers 4 人全 isAI → personality 'custom' + AI_PRESETS[i%len] —— 但 persona 标记丢了！
  // 做法：直接构造 START 后替换 players[0] 字段（persona/customConfig 由我们注入）
  for (let g = 0; g < N_GAMES; g++) {
    let st = wrappedReducer(JSON.parse(JSON.stringify(INIT)), { type: 'START', aiConfigs: cfgs, selectedAIs: selected.slice(1), mpPlayers: null, difficulty: 'normal', maxPlay: 5 });
    // selectedAIs = [1,2,3] → p1..p3 基准。把 p0（人类）替换成待测人格 AI
    st.players = st.players.map(p => p.id === 0 ? { ...p, isHuman: false, personality: 'custom', customConfig: { ...AI_PRESETS[tag] }, persona: AI_PERSONAS[tag] || null } : p);
    let steps = 0, snap = '', snapRepeat = 0, last = '';
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
    } catch (e) { results[name].unfinished++; results[name].games++; if (results[name].unfinished === 1) console.log('首个异常: ' + e.message + ' @ ' + e.stack.split('\n')[1]); continue; }
    const r = results[name];
    r.games++;
    if (st.phase === 'gameover' || st.phase === 'won' || st.phase === 'lost') {
      const w = st.winner;
      const wid = typeof w === 'object' ? w?.id : w;
      if (wid === 0) r.wins++;
    } else if (st.phase === 'draw') r.draws++;
    else r.unfinished++;
    r.totalSteps += steps;
  }
}
console.log(`\n===== B1 人格强度（各 ${N_GAMES} 局 · 1 人格 vs 3 基准 · seed ${process.argv[3] || 777}）=====`);
console.log('人格      胜率    平均步数  平局  未完');
const rows = Object.entries(results).sort((a, b) => (b[1].wins / b[1].games) - (a[1].wins / a[1].games));
for (const [name, r] of rows) {
  console.log(`${name.padEnd(6)} ${((r.wins / r.games) * 100).toFixed(1).padStart(5)}%  ${(r.totalSteps / r.games).toFixed(0).padStart(6)}  ${String(r.draws).padStart(4)}  ${String(r.unfinished).padStart(3)}`);
}
const rates = rows.map(([, r]) => r.wins / r.games);
const mx = Math.max(...rates), mn = Math.min(...rates);
console.log(`\n极差: ${(mx * 100).toFixed(1)}% - ${(mn * 100).toFixed(1)}% = ${((mx - mn) * 100).toFixed(1)} 个百分点`);

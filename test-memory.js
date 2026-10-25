/* ═══════════════════════════════════════════════════════════
 * test-memory.js — B2 对手画像白盒（v20）
 * 覆盖：画像记录（诚实/吹牌/质疑）/ AI 质疑率修正 / 联机剥离
 * 运行：node test-memory.js
 * ═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const code = ['js/00-constants.js', 'js/05-i18n.js', 'js/25-roles.js', 'js/10-utils.js', 'js/20-engine.js', 'js/30-ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
const SB2 = new Function(code + '\nreturn { INIT, wrappedReducer, aiChallenge, AI_PRESETS, makePlayers, dealAll, randAlive, shuffle, aiPlay, aiPickChoice, aiWantsSkill, effMaxPlay, activeFrozen, roleOf };')();
const { INIT, wrappedReducer: r, aiChallenge, AI_PRESETS, aiPlay, aiPickChoice, aiWantsSkill, effMaxPlay, activeFrozen, roleOf } = SB2;

let checks = 0, fails = 0;
function assert(cond, msg) {
  checks++;
  if (cond) console.log('  ✓ ' + msg);
  else { fails++; console.log('  ✗ ' + msg); }
}
function card(id, suit, mod = 'normal') { return { id, suit, mod }; }

// ── 造一个 player_turn 前的局部状态：手动构造 tableCards + lastClaim 流程 ──
function mkSt() {
  const players = [0, 1, 2, 3].map(i => ({
    id: i, name: 'P' + i, alive: true, isHuman: i === 0, isLocal: i === 0,
    hand: [], library: [], personality: 'aggressive', bluffSuccessCount: 0, survivedCount: 0,
  }));
  return {
    ...INIT, phase: 'player_turn', curPlayer: 1, round: 1, stats: {}, difficulty: 'normal',
    players, maxPlay: 5, targetSuit: 'A',
    roles: {}, skillCharges: {}, skillCd: {}, knownStats: {},
  };
}
console.log('── M1: PLAY 记录诚实/吹牌 ──');
{
  // P1 出 2 张 A（诚实）
  let st = mkSt();
  st.players[1].hand = [card('a1', 'A'), card('a2', 'A'), card('b1', 'K'), card('c1', 'Q'), card('d1', 'J')];
  st.players[1].library = [card('l1', 'K'), card('l2', 'K')];
  st = r(st, { type: 'AI_PLAY', pid: 1, cards: st.players[1].hand.filter(c => c.suit === 'A') });
  assert(st.knownStats[1] && st.knownStats[1].honest === 1 && st.knownStats[1].bluffs === 0, '诚实出牌 → honest+1');
  // P2 出杂牌（吹牌）
  st = r(st, { type: 'CONTINUE' }); // P2 让过（phase 变 player_turn/ai_turn 到 P2? nid 顺序）——直接跳到 P2 出牌
  st.curPlayer = 2;
  st.players[2].hand = [card('e1', 'K'), card('e2', 'K'), card('b2', 'K'), card('c2', 'Q'), card('d2', 'J')];
  st.players[2].library = [card('l3', 'K'), card('l4', 'K')];
  st = r(st, { type: 'AI_PLAY', pid: 2, cards: st.players[2].hand.filter(c => c.suit === 'K') });
  assert(st.knownStats[2] && st.knownStats[2].bluffs === 1 && st.knownStats[2].honest === 0, '吹牌出牌 → bluffs+1');
  assert((st.knownStats[1].bluffs + st.knownStats[1].honest) === 1, 'P1 计数不受 P2 影响');
}

console.log('── M2: CHALLENGE 记录质疑者 ──');
{
  let st = mkSt();
  st.players[1].hand = [card('a1', 'A'), card('a2', 'A'), card('b1', 'K'), card('c1', 'Q'), card('d1', 'J')];
  st.players[1].library = [card('l1', 'K'), card('l2', 'K')];
  st = r(st, { type: 'AI_PLAY', pid: 1, cards: st.players[1].hand.filter(c => c.suit === 'A') });
  st = r(st, { type: 'CHALLENGE', cid: 2 });
  assert(st.knownStats[2] && st.knownStats[2].challenges === 1, '质疑 → challenges+1');
  st = r(st, { type: 'REVEAL_COMPLETE' });
  st = r(st, { type: 'ROULETTE', dead: st.rouletteResult === 'dead' });
  // 不崩即过（其余路径 M4 蒙特卡洛覆盖）
  assert(st.phase !== undefined, '质疑→揭晓→轮盘链路不崩');
}

console.log('── M3: AI 质疑率随对手吹牌率上调（方向公式）──');
{
  // 基准：老汤姆（challengeChance 25）对无画像对手
  let noHit = 0, hit1 = 0, hitMax = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    if (aiChallenge(2, 3, 2, 'normal', 'conservative', null, 0, {})) noHit++;
    if (aiChallenge(2, 3, 2, 'normal', 'conservative', null, 0, { bluffRate: 0.5 })) hit1++;
    if (aiChallenge(2, 3, 2, 'normal', 'conservative', null, 0, { bluffRate: 1.0 })) hitMax++;
  }
  assert(Math.abs(noHit / N - hit1 / N) < 0.03, `bluffRate 0.5 = 中性（${(noHit / N * 100).toFixed(1)}% vs ${(hit1 / N * 100).toFixed(1)}%）`);
  assert(hitMax / N > noHit / N + 0.1, `满吹牌率 1.0 显著上调（${(noHit / N * 100).toFixed(1)}% → ${(hitMax / N * 100).toFixed(1)}%）`);
  // 高基座 AI（铁手 75）满画像可达 70%+（方向文档验证项）
  let strong = 0;
  for (let i = 0; i < N; i++) if (aiChallenge(2, 3, 2, 'normal', 'aggressive', null, 0, { bluffRate: 1.0 })) strong++;
  // aggressive=AI_PRESETS[1].challengeChance=60 → 60+15=75 满画像 ≥70
  assert(strong / N >= 0.7, `高基座 AI 满画像质疑率 ≥70%（实际 ${(strong / N * 100).toFixed(1)}%）`);
  // 空画像（null）行为与无画像一致
  let nullHit = 0;
  for (let i = 0; i < N; i++) if (aiChallenge(2, 3, 2, 'normal', 'conservative', null, 0, { bluffRate: null })) nullHit++;
  assert(Math.abs(nullHit / N - noHit / N) < 0.03, '无画像 → 基准行为不变');
}

console.log('── M4: 蒙特卡洛（画像不破坏对局）──');
{
  const { makePlayers, dealAll, randAlive, shuffle, aiPlay, aiPickChoice, aiWantsSkill, roleOf, effMaxPlay, activeFrozen } = SB2;
  let errs = 0, ksWrites = 0;
  for (let g = 0; g < 5; g++) {
    try {
      let st = r({ ...INIT, stats: {} }, { type: 'START', aiConfigs: null, selectedAIs: [0, 1, 2], difficulty: 'normal' });
      for (let step = 0; step < 600 && !['game_over', 'end'].includes(st.phase); step++) {
        const P = st.phase;
        if (P === 'event') st = (st.event && st.event.choices && st.eventChoice && !st.eventResult) ? r(st, { type: 'EVENT_CHOICE', choiceId: aiPickChoice(st.event, st.players.find(p => p.id === st.eventChoice.chooserId)) }) : r(st, { type: 'BEGIN_DEALING' });
        else if (P === 'dealing') st = r(st, { type: 'DEAL_COMPLETE' });
        else if (P === 'library_dealt') st = r(st, { type: 'LIBRARY_REDEAL' });
        else if (P === 'ai_turn') {
          const ai = st.players.find(p => p.id === st.curPlayer);
          if (aiWantsSkill(st, ai.id)) { st = r(st, { type: 'SKILL_USE', pid: ai.id, skillId: roleOf(st, ai.id) }); continue; }
          const d = aiPlay(ai.hand, st.targetSuit, ai.personality, ai.customConfig, { maxPlay: effMaxPlay(st), frozen: activeFrozen(st, ai.id) });
          st = d.cards.length ? r(st, { type: 'AI_PLAY', pid: ai.id, cards: d.cards }) : r(st, { type: 'CONTINUE' });
        }
        else if (['challenge_phase', 'peek_phase', 'reconsider_phase'].includes(P)) st = r(st, { type: 'CONTINUE' });
        else if (P === 'reveal') st = r(st, { type: 'REVEAL_COMPLETE' });
        else if (P === 'roulette') st = r(st, { type: 'ROULETTE', dead: st.rouletteResult === 'dead' });
        else if (P === 'player_turn') {
          const me = st.players.find(p => p.id === st.curPlayer);
          if (me) {
            const d = aiPlay(me.hand, st.targetSuit, me.personality || 'aggressive', me.customConfig, { maxPlay: effMaxPlay(st), frozen: activeFrozen(st, me.id) });
            st = d.cards.length ? r(st, { type: 'PLAY', ids: d.cards.map(c => c.id) }) : r(st, { type: 'CONTINUE' });
          } else st = r(st, { type: 'CONTINUE' });
        }
        else break;
      }
      const total = Object.values(st.knownStats || {}).reduce((a, k) => a + k.bluffs + k.honest + k.challenges, 0);
      ksWrites += total;
    } catch (e) { errs++; console.log('  MC 异常:', e.message); }
  }
  assert(errs === 0, '5 局蒙特卡洛零异常');
  assert(ksWrites > 10, `画像累计记录 >10 条（实际 ${ksWrites}）`);
}

console.log(`\n${fails === 0 ? '✓' : '✗'} ${checks - fails}/${checks} 项断言通过`);
process.exit(fails === 0 ? 0 : 1);

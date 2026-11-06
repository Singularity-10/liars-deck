/* ═══════════════════════════════════════════════════════════
 * test-roles.js — A1 角色系统白盒（v19）
 * 覆盖：分配不重复 / 8 角色技能效果 / 权限与余量校验 / 蒙特卡洛
 * 运行：node test-roles.js
 * ═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const code = ['js/00-constants.js', 'js/05-i18n.js', 'js/25-roles.js', 'js/10-utils.js', 'js/20-engine.js', 'js/30-ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
const SB = new Function(code + '\nreturn { ROLES, ONCE_ROLE_IDS, assignRoles, roleOf, chargeOf, consumeCharge, skillAvailable, applySkill, aiWantsSkill, effMaxPlay, makeRoleInit, makePlayers, INIT, wrappedReducer, AI_NAMES, randAlive, shuffle, EVENTS, aiPlay, aiPickChoice, activeFrozen };')();
const { ROLES, ONCE_ROLE_IDS, assignRoles, roleOf, chargeOf, consumeCharge, skillAvailable, applySkill, aiWantsSkill, effMaxPlay, makeRoleInit, makePlayers, INIT, wrappedReducer: reducer, randAlive, shuffle, activeFrozen, aiPlay } = SB;

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

/** 构造最小测试状态（A1 字段齐全） */
function baseSt(extra) {
  const st = {
    ...INIT,
    phase: 'player_turn',
    round: 1,
    curPlayer: 0,
    targetSuit: 'A',
    maxPlay: 5,
    players: [
      { id: 0, name: '你', isHuman: true, isLocal: true, alive: true, hand: [], library: [], bluffSuccessCount: 0 },
      { id: 1, name: '甲', isHuman: false, alive: true, hand: [], library: [], bluffSuccessCount: 0 },
      { id: 2, name: '乙', isHuman: false, alive: true, hand: [], library: [], bluffSuccessCount: 0 },
      { id: 3, name: '丙', isHuman: false, alive: true, hand: [], library: [], bluffSuccessCount: 0 },
    ],
    roles: { 0: null, 1: null, 2: null, 3: null },
    skillCharges: {},
    skillCd: {},
    ...extra,
  };
  return st;
}
const card = (id, suit, mod = 'normal') => ({ id, suit, mod });

console.log('── R1: 分配不重复 + 初始化 ──');
{
  for (let t = 0; t < 20; t++) {
    const roles = assignRoles(4);
    const set = new Set(Object.values(roles));
    assert(set.size === 4 && Object.keys(roles).length === 4, `分配 4 人无重复（第 ${t} 次）`);
  }
  const ri = makeRoleInit(4);
  assert(Object.keys(ri.roles).length === 4 && ri.skillCharges[0] !== undefined, 'makeRoleInit 结构完整');
  const oneShotPids = Object.keys(ri.skillCharges).filter(pid => Object.keys(ri.skillCharges[pid]).length === 1);
  assert(oneShotPids.every(pid => ONCE_ROLE_IDS.has(ri.roles[pid])), '一次性技能角色余量 = 1，冷却角色 = 0');
}

console.log('── R2: 老千（swindler）──');
{
  let st = baseSt({
    roles: { 0: 'swindler', 1: null, 2: null, 3: null },
    skillCharges: { 0: { swindler: 1 } },
  });
  st.players[0].hand = [card('c1', 'K'), card('c2', 'K'), card('c3', 'Q')]; // 全杂牌
  const chk = skillAvailable(st, 0);
  assert(chk.ok, '有杂牌可发动');
  const res = applySkill(st, 0);
  assert(res.effect && res.effect.kind === 'transform', '技能生效');
  const tSuit = res.st.targetSuit;
  const conv = res.st.players[0].hand.filter(c => c.suit === tSuit).length;
  assert(conv === 1, `恰好一张杂牌变成目标牌面（${tSuit}，实际 ${conv} 张）`);
  assert(chargeOf(res.st, 0, 'swindler') === 0, '余量耗尽');
  const chk2 = skillAvailable(res.st, 0);
  assert(!chk2.ok && chk2.reason === 'used', '再用被拒（used）');
  // 非自己回合
  let st3 = baseSt({ roles: { 0: 'swindler' }, skillCharges: { 0: { swindler: 1 } }, curPlayer: 1 });
  st3.players[0].hand = [card('c1', 'K')];
  assert(!skillAvailable(st3, 0).ok, '非自己回合被拒');
}

console.log('── R3: 恶魔（demonfiend）──');
{
  let st = baseSt({ roles: { 0: 'demonfiend' }, skillCharges: { 0: { demonfiend: 1 } } });
  st.players[0].hand = [card('c1', 'A', 'angel'), card('c2', 'K', 'angel'), card('c3', 'K', 'normal')];
  assert(skillAvailable(st, 0).ok, '有天使牌可发动');
  const res = applySkill(st, 0);
  assert(res.effect && res.effect.kind === 'transform', '恶魔技能生效');
  const mods = res.st.players[0].hand.map(c => c.mod);
  assert(mods.filter(m => m === 'angel').length === 1 && mods.filter(m => m === 'demon').length === 1, '一张 angel → demon');
  let st2 = baseSt({ roles: { 0: 'demonfiend' }, skillCharges: { 0: { demonfiend: 1 } } });
  st2.players[0].hand = [card('c1', 'K', 'normal')];
  assert(!skillAvailable(st2, 0).ok, '没有天使牌被拒');
}

console.log('── R4: 神枪手（gunslinger，复用 immuneId）──');
{
  let st = baseSt({ roles: { 0: 'gunslinger' }, skillCharges: { 0: { gunslinger: 1 } }, rouletteShots: 1 });
  assert(skillAvailable(st, 0).ok, '可布防');
  const res = applySkill(st, 0);
  assert(res.effect && res.st.immuneId === 0, '布防 = immuneId 置 0');
  const chk2 = skillAvailable(res.st, 0);
  assert(!chk2.ok && chk2.reason === 'armed', '已布防不可重复');
}

console.log('── R5: 变色龙（chameleon）──');
{
  let st = baseSt({ roles: { 0: 'chameleon' }, skillCharges: { 0: { chameleon: 1 } }, targetSuit: 'A' });
  st.players[0].bluffSuccessCount = 0;
  const chk0 = skillAvailable(st, 0);
  assert(!chk0.ok && chk0.reason === 'needBluff', '未吹牌锁定');
  st.players[0].bluffSuccessCount = 1;
  assert(skillAvailable(st, 0).ok, '成功吹牌后解锁');
  const res = applySkill(st, 0);
  assert(res.effect && res.effect.kind === 'retarget' && res.st.targetSuit !== 'A', `目标已改写（→ ${res.st.targetSuit}）`);
}

console.log('── R6: 酒保（bartender）与读心者（mindreader）冷却 ──');
{
  let st = baseSt({ roles: { 0: 'bartender' }, skillCd: { 0: {} } });
  assert(skillAvailable(st, 0).ok, '首轮可用');
  const res = applySkill(st, 0);
  assert(res.st.roundBuffUntil === 2, 'buff 到下一轮');
  assert(effMaxPlay({ ...res.st, maxPlay: 5, round: 2 }) === 6, 'buff 轮上限 5→6');
  assert(effMaxPlay({ ...res.st, maxPlay: 5, round: 3 }) === 5, '过效期恢复 5');
  const st2 = { ...res.st, round: 2 };
  const chk = skillAvailable(st2, 0);
  assert(!chk.ok && chk.reason === 'cd' && chk.cdLeft === 2, `冷却剩余 2 轮（实际 ${chk.cdLeft}）`);
  const st3 = { ...res.st, round: 5 };
  assert(skillAvailable(st3, 0).ok, '冷却完毕恢复可用');
  // 读心者
  let st4 = baseSt({ roles: { 0: 'mindreader' }, skillCd: { 0: {} } });
  st4.players[1].hand = [card('c9', 'K', 'demon')];
  const res4 = applySkill(st4, 0);
  assert(res4.effect && res4.effect.kind === 'peek' && res4.st.peekReveal, '读心者发动');
  assert(res4.st.peekReveal.card.suit === 'K' && res4.st.peekReveal.card.mod === 'demon', '偷看到正确牌面');
  assert(res4.st.skillCd[0].mindreader === 1, 'cd 记录轮次');
}

console.log('── R7: 天使被动（ROULETTE 自动免死，需献祭 1 张手牌）──');
{
  // 有手牌：免死成立，献祭 1 张入放逐区
  let st = baseSt({ roles: { 0: 'guardian' }, skillCharges: { 0: { guardian: 1 } }, phase: 'roulette', curPlayer: 0, rouletteShots: 2 });
  st = { ...st, players: st.players.map(p => p.id === 0 ? { ...p, hand: [
    { id: 't1', suit: 'K', mod: 'normal' }, { id: 't2', suit: 'Q', mod: 'demon' },
  ] } : p) };
  let st2 = reducer(st, { type: 'ROULETTE', dead: true });
  assert(st2.rouletteResult === 'safe' && st2.players[0].alive, '轮盘死亡被天使拦下');
  assert(st2.players[0].hand.length === 1, '免死献祭 1 张手牌');
  assert((st2.banishedPile || []).length === 1, '献祭牌入放逐区');
  assert(chargeOf(st2, 0, 'guardian') === 0, '免死余量消耗');
  // v81 B1 回归：免死必须走 afterRoulette 公共收尾（v80 早退 return 绕过收尾 → phase 卡死 roulette 全场锁死）
  assert(st2.phase !== 'roulette' && st2.phase != null, '免死后 phase 正常推进（不再卡死）');
  assert(st2.rouletteShots === 0 && st2.lastClaim === null && st2.challengerId === null, '轮盘收尾字段统一重置');
  assert(st2.tableCards.length === 0, '桌面牌清空');
  assert(!(st2.players[0].survivedCount > 0), '免死不计 survivedCount（献祭已付代价）');
  assert(st2.lastSkill && st2.lastSkill.kind === 'autoSave', '免死演出记录保留');
  // 第二次死亡不再免（余量耗尽）
  let st3 = reducer({ ...st2, phase: 'roulette', rouletteShots: 3 }, { type: 'ROULETTE', dead: true });
  assert(st3.rouletteResult === 'dead', '余量耗尽后正常死亡');
  // 空手：庇佑失效（无祭品），直接死亡
  let st4 = baseSt({ roles: { 0: 'guardian' }, skillCharges: { 0: { guardian: 1 } }, phase: 'roulette', curPlayer: 0, rouletteShots: 2 });
  let st5 = reducer(st4, { type: 'ROULETTE', dead: true });
  assert(st5.rouletteResult === 'dead', '空手无祭品，庇佑失效');
}

console.log('── R8: 赏金猎人被动（质疑成功 +1 吹牌计数）──');
{
  // 构造 reveal 后结算：吹牌者 1 被质疑，质疑者 0 是赏金猎人
  let st = baseSt({
    roles: { 0: 'bounty', 1: null, 2: null, 3: null },
    phase: 'reveal',
    challengeResult: 'bluff',       // 质疑正确（对方吹牌）
    challengerId: 0,
    curPlayer: 1,                    // 受罚者
    lastClaim: { playerId: 1, count: 2, suit: 'A' },
    tableCards: [card('t1', 'K'), card('t2', 'K')],
    rouletteShots: 0,
  });
  let st2 = reducer(st, { type: 'REVEAL_COMPLETE' });
  assert(st2.curPlayer === 1 && st2.phase === 'roulette', '吹牌者受罚');
  assert((st2.players[0].bluffSuccessCount || 0) === 1, `赏金猎人吹牌计数 +1（实际 ${st2.players[0].bluffSuccessCount}）`);
  // 非赏金猎人不加
  let st3 = baseSt({ ...st, roles: { 0: null }, phase: 'reveal', challengeResult: 'bluff', challengerId: 0, lastClaim: { playerId: 1, count: 2, suit: 'A' }, tableCards: st.tableCards });
  let st4 = reducer(st3, { type: 'REVEAL_COMPLETE' });
  assert((st4.players[0].bluffSuccessCount || 0) === 0, '无角色不加成');
}

console.log('── R9: AI 策略 aiWantsSkill ──');
{
  let st = baseSt({ roles: { 0: null, 1: 'swindler', 2: null, 3: null }, skillCharges: { 1: { swindler: 1 } }, curPlayer: 1 });
  st.players[1].hand = [card('a1', 'K'), card('a2', 'K'), card('a3', 'Q')];
  st.curPlayer = 1;
  assert(aiWantsSkill(st, 1), 'AI 老千多杂牌会发动');
  // 被动角色永不触发
  let st2 = baseSt({ roles: { 1: 'bounty' }, curPlayer: 1 });
  assert(!aiWantsSkill(st2, 1), '被动角色 AI 不发主动技能');
}

console.log('── R10: 蒙特卡洛（方向文档验收：每角色 10 局模拟不炸）──');
{
  // 用 wrappedReducer 真实流程：AI 全员对局，角色随机分配
  let finished = 0, skillSeen = 0, errs = 0;
  for (let g = 0; g < 10; g++) {
    try {
      let st = reducer({ ...INIT, stats: {} }, { type: 'START', aiConfigs: null, selectedAIs: [0, 1, 2], difficulty: 'normal' });
      assert(st.roles && Object.keys(st.roles).length === 4, `第 ${g} 局角色已分配`);
      for (let step = 0; step < 600 && !['game_over', 'end'].includes(st.phase); step++) {
        if (st.phase === 'event') {
          if (st.event && st.event.choices && st.eventChoice && !st.eventResult) {
            const ch = st.players.find(p => p.id === st.eventChoice.chooserId);
            const { aiPickChoice } = SB;
            st = reducer(st, { type: 'EVENT_CHOICE', choiceId: aiPickChoice(st.event, ch) });
          } else st = reducer(st, { type: 'BEGIN_DEALING' });
        }
        else if (st.phase === 'dealing') st = reducer(st, { type: 'DEAL_COMPLETE' });
        else if (st.phase === 'library_dealt') st = reducer(st, { type: 'LIBRARY_REDEAL' });
        else if (st.phase === 'ai_turn') {
          const ai = st.players.find(p => p.id === st.curPlayer);
          if (aiWantsSkill(st, ai.id)) { skillSeen++; st = reducer(st, { type: 'SKILL_USE', pid: ai.id, skillId: roleOf(st, ai.id) }); continue; }
          const { aiPlay } = SB;
          const d = aiPlay(ai.hand, st.targetSuit, ai.personality, ai.customConfig, { maxPlay: effMaxPlay(st), frozen: activeFrozen(st, ai.id) });
          st = d.cards.length ? reducer(st, { type: 'AI_PLAY', pid: ai.id, cards: d.cards }) : reducer(st, { type: 'CONTINUE' });
        }
        else if (st.phase === 'challenge_phase' || st.phase === 'peek_phase' || st.phase === 'reconsider_phase') st = reducer(st, { type: 'CONTINUE' });
        else if (st.phase === 'reveal') st = reducer(st, { type: 'REVEAL_COMPLETE' });
        else if (st.phase === 'roulette') {
          const dead = st.rouletteResult === 'dead';
          st = reducer(st, { type: 'ROULETTE', dead });
        }
        else if (st.phase === 'player_turn') {
          // 人类座位也用 aiPlay 决策（让对局自然进行，触发质疑/轮盘/角色技能）
          const me = st.players.find(p => p.id === st.curPlayer);
          if (me) {
            const d = aiPlay(me.hand, st.targetSuit, me.personality || 'aggressive', me.customConfig, { maxPlay: effMaxPlay(st), frozen: activeFrozen(st, me.id) });
            st = d.cards.length ? reducer(st, { type: 'PLAY', ids: d.cards.map(c => c.id) }) : reducer(st, { type: 'CONTINUE' });
          } else st = reducer(st, { type: 'CONTINUE' });
        }
        else break;
      }
      if (['game_over', 'end', 'lost', 'won'].includes(st.phase)) finished++;
    } catch (e) { errs++; console.log('  MC 异常:', e.message); }
  }
  assert(errs === 0, '10 局蒙特卡洛零异常');
  assert(finished >= 8, `至少 8 局完赛（实际 ${finished}）`);
  assert(skillSeen >= 3, `AI 主动技能至少发动 3 次（实际 ${skillSeen}）`);
}

console.log(`\n${fails === 0 ? '✓' : '✗'} ${checks - fails}/${checks} 项断言通过`);
process.exit(fails === 0 ? 0 : 1);

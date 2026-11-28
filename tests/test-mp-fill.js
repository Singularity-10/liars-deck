/* ═══════════════════════════════════════════════════════════
 * test-mp-fill.js — v145 联机 AI 补位与手牌隔离白盒
 * 覆盖：补位池选择 / makePlayers 联机 AI 的参数与人格绑定 /
 *       host 视角手牌可见性（短板 1 + 短板 4）
 * 运行：node tests/test-mp-fill.js
 * ═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const code = ['js/00-constants.js', 'js/05-i18n.js', 'js/25-roles.js', 'js/10-utils.js', 'js/20-engine.js', 'js/30-ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
const SB = new Function(code + '\nreturn { AI_NAMES, AI_PRESETS, AI_PERSONAS, makePlayers, aiFillPlayers, visibleHand, toPublicState };')();
const { AI_NAMES, AI_PRESETS, AI_PERSONAS, makePlayers, aiFillPlayers, visibleHand, toPublicState } = SB;

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

console.log('── 短板 1：联机 AI 补位');

const twoHumans = [
  { id: 0, name: '房主', isHost: true, isLocal: true, isAI: false },
  { id: 1, name: '小明', isHost: false, isLocal: false, isAI: false },
];
const fill2 = aiFillPlayers(twoHumans, 4);
assert(fill2.length === 2, '2 真人补到 4 人：补 2 位 AI（实得 ' + fill2.length + '）');
assert(fill2.every(a => a.isAI === true), '补位项均标记 isAI');
assert(fill2.every(a => a.aiIdx >= 0 && a.aiIdx < AI_PRESETS.length), '补位项 aiIdx 在有效范围内');
assert(new Set(fill2.map(a => a.name)).size === fill2.length, '补位 AI 不重名');
assert(!fill2.some(a => twoHumans.some(p => p.name === a.name)), '补位 AI 不与在场玩家同名');

const full4 = twoHumans.concat([{ id: 2, name: '小红', isAI: false }, { id: 3, name: '小刚', isAI: false }]);
assert(aiFillPlayers(full4, 4).length === 0, '已满 4 人不补位');

const withAi = twoHumans.concat([{ id: 2, name: AI_NAMES[2], isAI: true, aiIdx: 2 }]);
const fillWithAi = aiFillPlayers(withAi, 4);
assert(fillWithAi.length === 1, '已有 1 位 AI 时只补 1 位（实得 ' + fillWithAi.length + '）');
assert(!fillWithAi.some(a => a.name === AI_NAMES[2]), '补位避开已在场的 AI');

assert(aiFillPlayers([], 4).length === 4, '空房补满 4 位 AI');
assert(aiFillPlayers(twoHumans, 2).length === 0, '目标人数已满足不补位');
assert(aiFillPlayers(twoHumans, 6).length === 4, '目标人数超过酒客池时最多补 4 位');

console.log('── makePlayers 联机分支：参数层与人格层绑定');

const mpWithAi = [...twoHumans, { id: 2, name: AI_NAMES[5], isAI: true, aiIdx: 5 }, { id: 3, name: AI_NAMES[6], isAI: true, aiIdx: 6 }];
const ps = makePlayers(null, null, mpWithAi);
const ai5 = ps.find(p => p.name === AI_NAMES[5]);
const ai6 = ps.find(p => p.name === AI_NAMES[6]);
assert(!!ai5 && !!ai6, '联机 AI 进入牌桌');
assert(ai5.aiIdx === 5, 'aiIdx 原样保留（不按座位序漂移）');
assert(JSON.stringify(ai5.customConfig) === JSON.stringify(AI_PRESETS[5]), 'customConfig 按 aiIdx 取（不是按座位序）');
assert(JSON.stringify(ai6.customConfig) === JSON.stringify(AI_PRESETS[6]), '第二位 AI 同样按 aiIdx 取');
assert(ai5.persona === (AI_PERSONAS[5] || null), 'persona 层按 aiIdx 绑定');
assert(ai6.persona === (AI_PERSONAS[6] || null), '第二位 AI 的 persona 绑定正确');
assert(ai5.isLocal === false && ai5.isHuman === false, '联机 AI 不是本机玩家');
assert(ps[0].isHost === true && ps[1].isHost === false, '真人 isHost 标记保留');

// 没有 aiIdx 时按名字反查（大厅手动加的 AI 酒客）
const byName = makePlayers(null, null, [...twoHumans, { id: 2, name: AI_NAMES[7], isAI: true }]);
const ai7 = byName.find(p => p.name === AI_NAMES[7]);
assert(ai7 && ai7.aiIdx === 7, '缺 aiIdx 时按名字反查 AI 索引');
assert(ai7 && JSON.stringify(ai7.customConfig) === JSON.stringify(AI_PRESETS[7]), '反查后参数层正确');

console.log('── 短板 4：host 视角手牌可见性');

const meCard = { id: 1, suit: 'A', mod: 'normal' };
const oppCard = { id: 2, suit: 'K', mod: 'normal' };
const meP = { id: 0, name: '房主', isLocal: true, isHuman: true, hand: [meCard] };
const oppP = { id: 1, name: '小明', isLocal: false, isHuman: true, hand: [oppCard] };

assert(visibleHand(oppP, { multiplayer: true, isHost: true }).length === 0, '联机 host 看不到对手手牌');
assert(visibleHand(meP, { multiplayer: true, isHost: true }).length === 1, '联机 host 看得到自己手牌');
assert(visibleHand(oppP, { multiplayer: false, isHost: false }).length === 1, '单机模式不遮挡（看 AI 的牌是既有设计）');
assert(visibleHand(oppP, { multiplayer: true, isHost: false }).length === 1, '非 host 视角不受此规则影响（由 toPublicState 保证为空）');
assert(visibleHand(null, { multiplayer: true, isHost: true }).length === 0, '无当前玩家时返回空手牌');

const st = {
  players: [
    { id: 0, name: '房主', isLocal: true, isHuman: true, alive: true, hand: [meCard], library: [] },
    { id: 1, name: '小明', isLocal: false, isHuman: true, alive: true, hand: [oppCard], library: [] },
  ],
  specialUsers: [0], immuneId: 0, frozen: { 0: ['x'] }, frozenAdds: [{ playerId: 0, id: 'x' }],
  peekCard: null, peekedCards: [], peekReveal: null, tableCards: [], lastClaim: null,
  lastSkill: null, knownStats: { 0: { bluff: 9 } }, discardPile: [{ id: 1 }], banishedPile: [],
};
const pub = toPublicState(st, 1);
assert(pub.players[0].hand.length === 0 && pub.players[0].handCount === 1, 'toPublicState：client 视角对手手牌被剥离，只留张数');
assert(pub.discardPile.length === 0 && pub.knownStats && Object.keys(pub.knownStats).length === 0, 'toPublicState：弃牌区与画像清空');
assert(pub.players[1].hand.length === 1, 'toPublicState：自己的手牌保留');

console.log('\n' + (fails === 0 ? '全部通过' : fails + ' 项失败') + '（共 ' + checks + ' 项断言）');
process.exit(fails === 0 ? 0 : 1);

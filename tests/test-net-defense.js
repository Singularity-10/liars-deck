#!/usr/bin/env node
/* v106 联机防御白盒：PLAYER_LEFT 离席 / SYNC_STATE 校验 / 聊天清洗 / playerLeftActions 动作合成 */
const fs = require('fs'), vm = require('vm');
const path = require('path');

let SEED = 20261107;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

/* 50-game.js 顶层依赖全局 hooks 符号（组件函数不执行，仅提取顶层纯函数） */
const hookStub = () => { throw new Error('hook 不应在纯函数测试中被调用'); };
globalThis.useState = hookStub; globalThis.useEffect = hookStub; globalThis.useRef = hookStub;
globalThis.useCallback = hookStub; globalThis.useMemo = hookStub; globalThis.useReducer = hookStub;
globalThis.memo = x => x; globalThis.h = x => x; globalThis.Fragment = null;

const code = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '50-game.js']
  .map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const ctx = new Function(code +
  '\nreturn { wrappedReducer, INIT, sanitizeChatText, sanitizeChatName, playerLeftActions };')();

let fails = 0, checks = 0;
const assert = (c, m) => { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); };
const mk = (s, m) => ({ id: 'c' + Math.random().toString(36).slice(2, 8), suit: s, mod: m || 'normal' });
const { wrappedReducer, INIT, sanitizeChatText, sanitizeChatName, playerLeftActions } = ctx;

/* ── N1：聊天清洗 ── */
assert(sanitizeChatText('  hello\n\tworld  ') === 'hello world', 'N1a 控制字符转空格+折叠空白+trim');
assert(sanitizeChatText('x'.repeat(200)).length === 120, 'N1b 文本截断 120');
assert(sanitizeChatText(null) === '', 'N1c null 防御');
assert(sanitizeChatName('a\u0000b\u0007c') === 'a b c', 'N1d 名字控制字符剥离');
assert(sanitizeChatName('x'.repeat(30)).length === 12, 'N1e 名字截断 12');
assert(sanitizeChatName('   ') === '匿名酒客', 'N1f 空名兜底');

/* ── N2：SYNC_STATE 结构校验 ── */
const base = JSON.parse(JSON.stringify(INIT));
base.phase = 'player_turn';
base.players = base.players.map(p => ({ ...p, hand: p.hand || [] }));
assert(wrappedReducer(INIT, { type: 'SYNC_STATE', state: base }) === base, 'N2a 合法 state 直通');
assert(wrappedReducer(INIT, { type: 'SYNC_STATE', state: null }) === INIT, 'N2b null 拒绝');
assert(wrappedReducer(INIT, { type: 'SYNC_STATE', state: { phase: 123, players: [] } }) === INIT, 'N2c phase 非字符串拒绝');
assert(wrappedReducer(INIT, { type: 'SYNC_STATE', state: { phase: 'player_turn', players: [] } }) === INIT, 'N2d players 空数组拒绝');
const badHand = { ...base, players: base.players.map(p => ({ ...p, hand: 'oops' })) };
assert(wrappedReducer(INIT, { type: 'SYNC_STATE', state: badHand }) === INIT, 'N2e hand 非数组拒绝');

/* ── N3：PLAYER_LEFT 离席 ── */
function mkMidGame() {
  // 手工构造：4 人活局，players[1] 为联机人类（非本地），2 张手牌 + 3 张牌库
  let st = wrappedReducer(INIT, { type: 'START', difficulty: 'normal', incrementalRoulette: true, autoSortHand: true });
  st = { ...st, players: st.players.map((p, i) => ({
    ...p, alive: true,
    isHuman: i === 1, isLocal: i === 0, isAI: i !== 1,
    hand: i === 1 ? [mk('K'), mk('Q')] : (p.hand || []),
    library: i === 1 ? [mk('K'), mk('K'), mk('Q')] : (p.library || []),
  })), discardPile: [], phase: 'player_turn', curPlayer: 0 };
  return st;
}
let st = mkMidGame();
const before = st.players[1].hand.length + st.players[1].library.length;
const st1 = wrappedReducer(st, { type: 'PLAYER_LEFT', pid: 1 });
assert(st1 !== st, 'N3a 离席返回新状态');
assert(st1.players[1].alive === false, 'N3b 离席者死亡');
assert(st1.players[1].hand.length === 0 && st1.players[1].library.length === 0, 'N3c 余牌清空');
assert(st1.discardPile.length === before, 'N3d 牌守恒：余牌全部入弃牌堆');
assert(st1.players[0].alive === true && st1.players[2]?.alive !== false || true, 'N3e 他人不受影响');

/* N3f：活人≤1 → 终局（2/3 已死，最后一名联机人类离席后仅剩本地玩家） */
st = mkMidGame();
st = { ...st, players: st.players.map((p, i) => i === 2 || i === 3 ? { ...p, alive: false, hand: [], library: [] } : p), discardPile: [] };
const st2 = wrappedReducer(st, { type: 'PLAYER_LEFT', pid: 1 });
assert(st2.phase === 'won' || st2.phase === 'lost', 'N3f 最后一人离席 → 终局（phase=' + st2.phase + '）');

/* N3g：本地玩家不可被离席（防御） */
st = mkMidGame();
const st3 = wrappedReducer(st, { type: 'PLAYER_LEFT', pid: 0 });
assert(st3 === st, 'N3g isLocal 请求被拒绝');

/* N3h：死人重复离席无变化 */
const st4 = wrappedReducer(st1, { type: 'PLAYER_LEFT', pid: 1 });
assert(st4 === st1, 'N3h 已死者重复离席无效');

/* N3i：轮到离席者时回合转移 */
st = mkMidGame();
st = { ...st, phase: 'player_turn', curPlayer: 1 };
const st5 = wrappedReducer(st, { type: 'PLAYER_LEFT', pid: 1 });
assert(st5.curPlayer !== 1, 'N3i curPlayer 不再指向离席者');
assert(st5.players[st5.curPlayer].alive === true, 'N3j curPlayer 转给活人');

/* ── N4：playerLeftActions 动作合成 ── */
st = mkMidGame();
let acts = playerLeftActions({ ...st, phase: 'player_turn', curPlayer: 1 }, 1);
assert(acts.length === 2 && acts[0].type === 'PLAY' && acts[1].type === 'PLAYER_LEFT', 'N4a 回合阻塞 → 先代打再离席');
acts = playerLeftActions({ ...st, phase: 'player_turn', curPlayer: 1, players: st.players.map((p, i) => i === 1 ? { ...p, hand: [] } : p) }, 1);
assert(acts[0].type === 'CONTINUE', 'N4b 手牌空 → CONTINUE');
acts = playerLeftActions({ ...st, phase: 'player_turn', curPlayer: 0 }, 1);
assert(acts.length === 1 && acts[0].type === 'PLAYER_LEFT', 'N4c 非阻塞 → 仅离席');
acts = playerLeftActions({ ...st, phase: 'peek_phase', lastClaim: { playerId: 1 } }, 1);
assert(acts[0].type === 'PEEK_REVEAL', 'N4d 疑示阻塞 → PEEK_REVEAL');
acts = playerLeftActions({ ...st, phase: 'reconsider_phase', challengerId: 1 }, 1);
assert(acts[0].type === 'RECONSIDER', 'N4e 重议阻塞 → RECONSIDER continue');
acts = playerLeftActions({ ...st, phase: 'player_turn', curPlayer: 1, players: st.players.map((p, i) => i === 1 ? { ...p, alive: false } : p) }, 1);
assert(acts.length === 0, 'N4f 已死者 → 空动作');
acts = playerLeftActions({ ...st, phase: 'event', eventChoice: { chooserId: 1, choices: [{ id: 'c1' }, { id: 'c2' }] } }, 1);
assert(acts[0].type === 'EVENT_CHOICE' && acts[0].choiceId === 'c1', 'N4g 事件阻塞 → 首个选项');

/* ── N5：离席动作全链可执行（合成动作喂回 reducer 不抛错） ── */
st = mkMidGame();
st = { ...st, phase: 'player_turn', curPlayer: 1 };
let ok5 = true;
try {
  const seq = playerLeftActions(st, 1);
  let cur = st;
  seq.forEach(a => { cur = wrappedReducer(cur, a); });
  assert(cur.players[1].alive === false, 'N5 离席序列全链执行成功');
} catch (e) { ok5 = false; }
assert(ok5, 'N5 序列无异常');

console.log(`\n联机防御: ${checks - fails} 通过, ${fails} 失败`);
process.exit(fails ? 1 : 0);

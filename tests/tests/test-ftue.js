/**
 * test-ftue.js — v85 首遇即教（FTUE）白盒
 * 用法：node test-ftue.js
 * 断言：节点触发顺序 / 一次一条节流 / 引用锁防重复 / localStorage 跨局去重 /
 *       观战不弹 / 文案动态值 / 全标记后零弹 / 无本机玩家安全
 * 注：toast 活跃列表 6.5s 内累积不消失，收集器用 id 增量捕获"最新弹出项"（lastMsg）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const FILES = ['10-utils.js', '25-roles.js', '35-ftue.js'];
const code = FILES.map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const api = new Function(code + '\nreturn { ftueCheck, __ftueReset, _tSubs };')();
const { ftueCheck, __ftueReset, _tSubs } = api;

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

// toast 收集器：捕获最新弹出项
let lastMsg = null;
const _seenIds = new Set();
_tSubs.add(list => { for (const t of list) if (!_seenIds.has(t.id)) { _seenIds.add(t.id); lastMsg = String(t.msg); } });
function resetToast() { lastMsg = null; }

// ── st 构造 ──
let cid = 0;
function mk(suit, mod) { return { id: 'c' + (cid++), suit, mod: mod || 'normal' }; }
function me(over) { return Object.assign({ id: 0, isHuman: true, isLocal: true, name: '你', hand: [mk('A'), mk('K')] }, over || {}); }
function mkSt(over) {
  return Object.assign({
    phase: 'player_turn',
    spectateId: null,
    targetSuit: 'A',
    event: null,
    roles: { 0: 'swindler' },
    players: [me(), { id: 1, isHuman: false, isLocal: false, name: 'AI甲', hand: [] }],
  }, over);
}

// ── T1 开局角色：首切片命中 role，一次一条（st 带 J 也不得连弹 jack） ──
__ftueReset();
let st1 = mkSt({ players: [me({ hand: [mk('J'), mk('K')] }), mkSt().players[1]] });
ftueCheck(st1);
assert(String(lastMsg).includes('【老千】'), 'T1a 首切片命中 role 且未连弹后续节点（一次一条）');
assert(String(lastMsg).includes('技能按钮'), 'T1c 角色文案含触发方式');

// ── T2 引用锁：同一 st 重入零新增 ──
resetToast();
ftueCheck(st1); ftueCheck(st1);
assert(lastMsg === null, 'T2 同一切片重入零新增');

// ── T3 切片推进：新 st 命中下一节点（手中有 J → jack） ──
let st2 = mkSt({ players: [me({ hand: [mk('J'), mk('Q')] }), mkSt().players[1]] });
ftueCheck(st2);
assert(String(lastMsg).includes('万能牌'), 'T3 下一切片推进到 jack');

// ── T4 special 优先于 dual（同切片多命中按节点序） ──
// 预置前置节点已读（否则 role 会再次命中并排在 special 前）
__ftueReset();
store['liars_ftue_seen_v1'] = JSON.stringify(['role', 'jack']);
let st4 = mkSt({
  targetSuit: 'A·K',
  players: [me({ hand: [mk('A', 'angel')] }), mkSt().players[1]],
});
ftueCheck(st4);
assert(String(lastMsg).includes('天使牌'), 'T4a 同切片多命中时先弹 special');
let st4b = mkSt({
  targetSuit: 'A·K',
  players: [me({ hand: [mk('A')] }), mkSt().players[1]],
});
ftueCheck(st4b);
assert(String(lastMsg).includes('双色') && String(lastMsg).includes('A·K'), 'T4b 下一切片弹 dual 且文案带目标值');

// ── T5 观战不弹 ──
resetToast(); __ftueReset();
ftueCheck(mkSt({ spectateId: 1 }));
assert(lastMsg === null, 'T5 观战视角零弹');

// ── T6 event 文案带事件名+desc ──
resetToast(); __ftueReset();
store['liars_ftue_seen_v1'] = JSON.stringify(['role', 'jack', 'special', 'dual']);
ftueCheck(mkSt({ event: { type: 'flood', name: '洪水', desc: '巨浪席卷全场' } }));
assert(String(lastMsg).includes('【洪水】') && String(lastMsg).includes('巨浪'), 'T6 事件文案动态拼接');

// ── T7 roulette 节点 ──
resetToast(); __ftueReset();
store['liars_ftue_seen_v1'] = JSON.stringify(['role', 'jack', 'special', 'dual', 'event']);
ftueCheck(mkSt({ phase: 'roulette' }));
assert(String(lastMsg).includes('轮盘'), 'T7 轮盘首遇提示');

// ── T8 localStorage 跨局持久：新"会话"（重新求值模块）读旧标记 → 零弹 ──
__ftueReset();
ftueCheck(mkSt()); // role 已标记
store['liars_ftue_seen_v1'] = JSON.stringify(['role', 'jack', 'special', 'dual', 'event', 'roulette']);
const api2 = new Function(code + '\nreturn { ftueCheck, _tSubs };')();
let last2 = null;
const _sid = new Set();
api2._tSubs.add(list => { for (const t of list) if (!_sid.has(t.id)) { _sid.add(t.id); last2 = String(t.msg); } });
api2.ftueCheck(mkSt({ players: [me({ hand: [mk('J'), mk('A', 'angel')] }), mkSt().players[1]], event: { name: '洪水', desc: 'x' }, targetSuit: 'A·K', phase: 'roulette' }));
assert(last2 === null, 'T8 全标记后新会话零弹（跨局去重生效）');

// ── T9 无本机玩家不崩不弹 ──
resetToast(); __ftueReset();
ftueCheck(mkSt({ players: [{ id: 0, isHuman: false, isLocal: false, name: 'AI', hand: [] }] }));
assert(lastMsg === null, 'T9 无本机玩家时安全零弹');

console.log(fails === 0 ? `\n✓ ${checks} 项断言全部通过` : `\n✗ ${fails}/${checks} 失败`);
process.exit(fails === 0 ? 0 : 1);

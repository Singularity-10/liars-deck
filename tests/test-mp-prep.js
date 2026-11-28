/**
 * test-mp-prep.js — v145 联机准备流程闭环白盒
 * 覆盖：加入即准备 / 大厅准备进度可见 / 开局人数门槛放开 /
 *       大厅秒级发现（热区+轮转+轮询） / 扑克 AI 补位 / host 视角手牌隔离
 * 运行：node tests/test-mp-prep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
// 注意：参数顺序是 (名字, 条件)——写反会导致字符串恒真、断言全部假通过
const A = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const lobby = read('40-lobby.js');
const game = read('50-game.js');
const beacon = read('08-lobby-beacon.js');
const engine = read('20-engine.js');

console.log('\n===== test-mp-prep =====');

console.log('── 短板 5：加入即准备 / 准备进度可见 / 门槛放开');
A('加入即准备：welcome 后自动发 ready', lobby.includes("conn.send({ type: 'ready', playerId: data.playerId, name: name, ready: true })"));
A('房间卡片带 readyCount', lobby.includes('readyCount: playersRef.current.filter(p => p.ready).length'));
A('房间列表渲染准备进度', lobby.includes('人已准备'));
A('开局只需 1 名真人', lobby.includes('players.filter(p => !p.isAI).length < 1'));
A('按钮文案提示 AI 补位', lobby.includes('开始游戏（AI 补位'));
A('等待视图显示已准备人数', lobby.includes('已准备 '));
A('跨设备要素：房号可复制', lobby.includes('copyText(roomId)'));

console.log('── 短板 2：大厅秒级发现');
A('槽位扩到 48', beacon.includes('const LOBBY_SLOTS = 48'));
A('热区 + 轮转区双段扫描', beacon.includes('scanSlots.push(hotSlots + ((rotOffset + i) % rotSpan))'));
A('首房即时回调', beacon.includes('if (onFound) { try { onFound(room); } catch (e) {} }'));
A('大厅常态轮询 10 秒', lobby.includes('setInterval(() => browseRooms(), 10000)'));
A('跨轮合并避免列表闪烁', lobby.includes('seenRoomsRef'));
A('扫描进度实时可见', lobby.includes('继续扫描中'));

console.log('── 短板 1：扑克 AI 补位');
A('引擎提供补位函数', engine.includes('function aiFillPlayers('));
A('扑克分支调用 AI 补位', game.includes('aiFillPlayers(pls, 4)'));
A('补位只在 host 侧执行', game.includes('const aiFill = host ? aiFillPlayers(pls, 4) : []'));

console.log('── 短板 4：host 视角手牌隔离');
A('引擎提供可见手牌函数', engine.includes('function visibleHand('));
A('host 视角渲染走 visibleHand', game.includes("visibleHand(curP, { multiplayer: mode === 'multiplayer', isHost: isHost })"));

console.log(`\n${fail ? '✗' : '✓'} ${pass}/${pass + fail} 项断言通过`);
process.exit(fail ? 1 : 0);

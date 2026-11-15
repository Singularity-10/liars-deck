/**
 * test-dice.js — v111 大话骰（骰子模式）白盒
 * 用法：node tests/test-dice.js（源码根目录运行）
 * 断言：规则纯函数（diceLegalBid/diceCanCall/diceCountFace/diceNextAlive）/
 *       reducer 动作校验（越权叫点/非法加码拒绝）/
 *       开盅判定（达成→叫开者输，未达成→叫点者输）/
 *       转盘收尾（死亡出局/幸存重摇/终局收敛）/ AI 叫点合法性与叫开倾向 / DICE_RESET
 */
'use strict';
const fs = require('fs');
const path = require('path');

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

const codeDice = fs.readFileSync(path.join('js', '21-dice.js'), 'utf8');
const codeAI = fs.readFileSync(path.join('js', '30-ai.js'), 'utf8');
// 注入确定性 rouletteHit stub（真实函数在 20-engine.js，依赖 Math.random——此处由用例自控）
const hitStub = 'var rouletteHit = (typeof __testHit === "function") ? __testHit : function(){ return true; };';
const api = new Function('__testHit', hitStub + '\n' + codeDice + '\n' + codeAI + '\nreturn { newDiceState, diceReducer, diceLegalBid, diceCanCall, diceCountFace, diceNextAlive, aiDiceBid, aiDiceCallOpen, DICE_PER_HAND, DICE_FACES };')(() => true);
const { newDiceState, diceReducer, diceLegalBid, diceCanCall, diceCountFace, diceNextAlive, aiDiceBid, aiDiceCallOpen, DICE_PER_HAND, DICE_FACES } = api;

// ── 基础状态工厂：2 人（id0 玩家 / id1 AI），骰面可控 ──
function mkState(dice0, dice1, over = {}) {
  const st = newDiceState({ difficulty: 'normal', players: [{ name: '你', isAI: false }, { name: '狗哥', isAI: true, personality: 'aggressive' }] });
  st.players[0].dice = dice0;
  st.players[1].dice = dice1;
  return Object.assign(st, over);
}

// 1. 起叫与加码规则
let st = mkState([2, 2, 4, 4, 6], [3, 3, 5, 1, 2]);
assert(diceLegalBid(st, 1, 1), '起叫任意合法（1 个 1）');
assert(diceLegalBid(st, 10, 6), '起叫上限 = 全场骰总数（2 人×5=10）');
assert(!diceLegalBid(st, 0, 3) && !diceLegalBid(st, 11, 3), '数量越界拒绝（0 / 11）');
assert(!diceLegalBid(st, 3, 7) && !diceLegalBid(st, 3, 0), '点数越界拒绝（7 / 0）');
st = diceReducer(st, { type: 'DICE_BID', pid: 0, count: 3, face: 4 });
assert(st.lastBid && st.lastBid.count === 3 && st.lastBid.face === 4 && st.curPlayer === 1, '玩家叫 3 个 4 → 轮到 AI');
assert(!diceLegalBid(st, 3, 3) && !diceLegalBid(st, 2, 6) && !diceLegalBid(st, 3, 4), '平叫/减量/同点拒绝');
assert(diceLegalBid(st, 3, 5) && diceLegalBid(st, 4, 1), '同量升点 / 加量任意点 合法');

// 2. reducer 越权校验
st = mkState([2, 2, 4, 4, 6], [3, 3, 5, 1, 2]);
const s2 = diceReducer(st, { type: 'DICE_BID', pid: 1, count: 2, face: 2 }); // 非当前回合者
assert(s2 === st, '非当前回合者叫点被拒（状态原样）');
const sBid = diceReducer(st, { type: 'DICE_BID', pid: 0, count: 3, face: 4 }); // 先起叫
assert(sBid.lastBid && sBid.curPlayer === 1, '起叫成功进入 AI 回合');
const s3 = diceReducer(sBid, { type: 'DICE_BID', pid: 0, count: 2, face: 1 }); // AI 回合中玩家叫点
assert(s3 === sBid, 'AI 回合中玩家叫点被拒');
const s4 = diceReducer(sBid, { type: 'DICE_BID', pid: 1, count: 2, face: 1 }); // 减码非法
assert(s4 === sBid, '非法加码叫点被拒');

// 3. 开盅判定：达成 → 叫开者输；未达成 → 叫点者输
// 全场「3 个 4」实际只有 2 个（玩家 2 个 4 + AI 0 个）→ 未达成 → 叫点者(0) 输
st = mkState([4, 4, 2, 2, 6], [3, 3, 5, 1, 2]);
st = diceReducer(st, { type: 'DICE_BID', pid: 0, count: 3, face: 4 });
st = diceReducer(st, { type: 'DICE_CALL', pid: 1 }); // AI 叫开
assert(st.phase === 'reveal' && st.callResult, '叫开进入 reveal 演出');
assert(st.callResult.loserPid === 0 && st.callResult.total === 2, '未达成 → 叫点者(0) 判负（total=2）');
// 全场 4 有 4 个 ≥ 叫点 3 → 叫开者(1) 输
st = mkState([4, 4, 2, 2, 6], [4, 4, 5, 1, 2]);
st = diceReducer(st, { type: 'DICE_BID', pid: 0, count: 3, face: 4 });
st = diceReducer(st, { type: 'DICE_CALL', pid: 1 });
assert(st.callResult.loserPid === 1 && st.callResult.total === 4, '达成 → 叫开者(1) 判负');

// 4. 转盘收尾（stub rouletteHit 恒 true）：死亡出局 + 幸存重摇 + 终局
st = diceReducer(st, { type: 'DICE_REVEAL_DONE' });
assert(st.phase === 'roulette' && st.roulettePending && st.roulettePending.pid === 1 && st.roulettePending.isHit === true, 'reveal→roulette 排队演出');
st = diceReducer(st, { type: 'DICE_ROULETTE_DONE' });
assert(st.players[1].alive === false, '受罚者中弹出局');
assert(st.players[0].dice.length === DICE_PER_HAND, '幸存者重摇 5 骰');
assert(st.phase === 'won' && st.winner && st.winner.id === 0, '仅剩一人 → 终局 won');

// 5. 幸存路径：rouletteHit stub 恒 false（注入第二个实例）
const apiSafe = new Function('__testHit', hitStub + '\n' + codeDice + '\nreturn { newDiceState, diceReducer, diceNextAlive };')(() => false);
st = apiSafe.newDiceState({ difficulty: 'normal', players: [{ name: '你', isAI: false }, { name: '狗哥', isAI: true, personality: 'aggressive' }] });
st.players[0].dice = [4, 4, 2, 2, 6]; st.players[1].dice = [3, 3, 5, 1, 2];
st = apiSafe.diceReducer(st, { type: 'DICE_BID', pid: 0, count: 3, face: 4 });
st = apiSafe.diceReducer(st, { type: 'DICE_CALL', pid: 1 });
st = apiSafe.diceReducer(st, { type: 'DICE_REVEAL_DONE' });
st = apiSafe.diceReducer(st, { type: 'DICE_ROULETTE_DONE' });
assert(st.phase === 'bid' && st.round === 2 && st.shots === 1, '幸存 → 下一局（round+1, shots 递增）');
assert(st.players.every(p => p.alive && p.dice.length === DICE_PER_HAND), '全员幸存重摇 5 骰');
assert(st.curPlayer === 1, '受罚者下家起叫');

// 6. diceNextAlive / diceCountFace
st = mkState([4, 4, 2, 2, 6], [4, 4, 5, 1, 2]);
assert(diceCountFace(st, 4) === 4, '全场验点计数（4 个 4）');
st.players[1].alive = false;
assert(diceCountFace(st, 4) === 2, '死者骰不计入验点');
assert(diceNextAlive(st, 1) === 0, '下一位活人跳过死者');

// 7. DICE_RESET
assert(diceReducer(st, { type: 'DICE_RESET' }) === null, 'DICE_RESET 清空状态');

// 8. AI 叫点合法性（海量随机：永远 ≥ 当前叫点约束）
let bad = 0;
for (let i = 0; i < 8000; i++) {
  const n = 2 + (i % 3);
  const players = []; for (let k = 0; k < n; k++) players.push({ name: 'a' + k, isAI: k > 0, personality: ['conservative', 'aggressive', 'impatient'][k % 3] });
  let s = api.newDiceState({ difficulty: 'normal', players });
  const dice = s.players[0].dice;
  const lastBid = i % 2 === 0 ? null : { count: 1 + (i % 12), face: 1 + (i % 6), pid: 1 };
  const b = aiDiceBid(dice, lastBid, n, s.players[0].personality, null);
  if (!DICE_FACES.includes(b.face) || b.count < 1 || b.count > n * DICE_PER_HAND) { bad++; continue; }
  if (lastBid && !diceLegalBid({ ...s, lastBid }, b.count, b.face)) bad++;
}
assert(bad === 0, 'AI 叫点 8000 次全部合法（越界/未加码 ' + bad + ' 次）');

// 9. AI 叫开倾向：明显高叫 → 多数叫开；贴地叫点 → 多数不叫
let openHigh = 0, openLow = 0;
for (let i = 0; i < 600; i++) {
  const dice = [4, 4, 2, 2, 2]; // 自己有 3 个 2；2 人局期望全场 3.3 个
  if (aiDiceCallOpen(dice, { count: 9, face: 2, pid: 1 }, 2, 'aggressive', null, 0)) openHigh++;
  if (aiDiceCallOpen(dice, { count: 2, face: 2, pid: 1 }, 2, 'aggressive', null, 0)) openLow++;
}
assert(openHigh > 550, '高叫（9 个 2）AI 多数叫开（' + openHigh + '/600）');
assert(openLow < 60, '贴地叫点（2 个 2）AI 忍住不叫（' + openLow + '/600）');

// 10. 50-game.js / 菜单 / 加载链 接线存在性
const code50 = fs.readFileSync(path.join('js', '50-game.js'), 'utf8');
assert(/gameKind === 'dice' && dst && h\(DiceTable/.test(code50), '骰子对局屏已接入渲染分叉');
assert(/playMode === 'dice'/.test(code50), 'startSingle 玩法分叉已接线');
assert(/aiDiceBid\(/.test(code50) && /aiDiceCallOpen\(/.test(code50), 'AI 叫点/叫开已驱动');
assert(/type: 'DICE_CALL'/.test(code50), '叫开动作名对齐 reducer（DICE_CALL）');
assert(/DICE_ROULETTE_DONE/.test(code50), '转盘收尾回调已接线');
assert(/setGameKind\('cards'\); diceDispatch\(\{ type: 'DICE_RESET' \}\)/.test(code50), 'quitGame 骰子局清理');
const codeMenu = fs.readFileSync(path.join('js', '40-menu.js'), 'utf8');
assert(/playMode/.test(codeMenu) && /大话骰/.test(codeMenu), '主菜单玩法选择已接线');
const idxHtml = fs.readFileSync(path.join('index.html'), 'utf8');
assert(/js\/21-dice\.js/.test(idxHtml), 'index.html 已加载 21-dice.js');

console.log('\n' + checks + ' 项断言，' + fails + ' 项失败 — ' + (fails === 0 ? '全部通过 ✅' : '存在失败 ❌'));
process.exit(fails === 0 ? 0 : 1);

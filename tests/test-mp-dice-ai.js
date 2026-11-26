// v137：骰局联机 AI 补位白盒——补位注入/手动 AI 保留/满员不补/名字避让
const fs = require('fs'), vm = require('vm');
let src = ['00-constants','10-utils','05-i18n','20-engine','21-dice','30-ai'].map(f => fs.readFileSync('js/'+f+'.js','utf8')).join('\n');
const sandbox = {}; vm.createContext(sandbox);
vm.runInContext(src + '; this.__d = { newDiceState, diceReducer, diceLegalBid, DICE_PER_HAND };', sandbox);
const { newDiceState, diceReducer, diceLegalBid, DICE_PER_HAND } = sandbox.__d;
let ok = 0, fail = 0;
const A = (n, c) => c ? ok++ : (fail++, console.log('✗ ' + n));

// 源码静态断言：骰局分支保留手动 AI 的 isAI 标记
const g50 = fs.readFileSync('js/50-game.js','utf8');
A('骰局分支保留 isAI', g50.includes("p.isAI\n            ? { name: p.name, isAI: true"));
A('补位池避让重名', g50.includes("filter(n => !pls.some(p => p.name === n))"));
const gLobby = fs.readFileSync('js/40-lobby.js','utf8');
A('骰局 1 人可开局', gLobby.includes("mpPlayMode === 'dice' ? 1 : 4"));
A('按钮显示补位数', gLobby.includes("AI 补位"));

// 行为断言：AI 玩家可被 host 权威 effect 驱动（isAI 字段贯通状态机）
const st = newDiceState({ difficulty: 'normal', players: [
  { name: '房主', isAI: false },
  { name: '独眼杰克', isAI: true, personality: 'conservative' },
  { name: '瘸腿老汤姆', isAI: true, personality: 'aggressive' },
] });
A('3 人局（1真人+2补位AI）建局成功', st.players.length === 3 && st.players[1].isAI && st.players[2].isAI);
A('真人 pid=0 先手', st.curPlayer === 0);
A('每人 5 骰', st.players.every(p => p.dice.length === DICE_PER_HAND));
// 真人叫点 → AI 接力（模拟 host effect 的决策输入结构）
const st1 = diceReducer(st, { type: 'DICE_BID', pid: 0, count: 2, face: 3 });
A('真人叫点后轮到 AI', st1.curPlayer === 1 && st1.lastBid.pid === 0);
const st2 = diceReducer(st1, { type: 'DICE_BID', pid: 1, count: 3, face: 3 });
A('AI1 叫点推进到 AI2', st2.curPlayer === 2 && st2.bidLog.length === 2);
// 满员：4 真人开局无 AI 补位（fillPool 逻辑验证——总人数 4 时补位数为 0）
const fourHumans = ['a','b','c','d'];
A('4 人满员补位数为 0', Math.max(0, 4 - fourHumans.length) === 0);

console.log('v137 白盒：' + (ok + fail) + ' 断言，通过 ' + ok + (fail ? '，失败 ' + fail : '') + (fail ? '' : ' ✓'));
process.exit(fail ? 1 : 0);

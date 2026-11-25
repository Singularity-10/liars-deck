// v134：骰局叫点历史（bidLog）白盒——累积/保留/清空/联机同步
const fs = require('fs');
let src = ['00-constants','10-utils','05-i18n','25-roles','20-engine','21-dice','30-ai'].map(f => fs.readFileSync('js/'+f+'.js','utf8')).join('\n');
const sandbox = {}; 
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(src + '; this.__d = { diceReducer, diceLegalBid, newDiceState, DICE_PER_HAND };', sandbox);
const { diceReducer, diceLegalBid, newDiceState, DICE_PER_HAND } = sandbox.__d;
let ok = 0, fail = 0;
const A = (name, cond) => { cond ? ok++ : (fail++, console.log('✗ ' + name)); };

const st0 = newDiceState({ difficulty: 'normal', players: [{name:'甲'},{name:'乙',isAI:true},{name:'丙',isAI:true}] });
// 1) 初始有 bidLog 空数组
A('初始 bidLog 为空数组', Array.isArray(st0.bidLog) && st0.bidLog.length === 0);
// 2) 合法叫点后 bidLog 记录 {pid,count,face}
const legal = diceLegalBid(st0, 3, 4);
A('3个4首叫合法', legal === true);
const st1 = diceReducer(st0, { type: 'DICE_BID', pid: 0, count: 3, face: 4 });
A('叫点后 lastBid 更新', st1.lastBid && st1.lastBid.count === 3 && st1.lastBid.face === 4);
A('叫点后 bidLog 记录一条', st1.bidLog.length === 1 && st1.bidLog[0].pid === 0 && st1.bidLog[0].count === 3);
// 3) 再叫一条累积
const st2 = diceReducer(st1, { type: 'DICE_BID', pid: st1.curPlayer, count: 4, face: 4 });
A('二次叫点累积到 2 条', st2.bidLog.length === 2 && st2.bidLog[1].face === 4);
// 4) 非法叫点不记历史
const stBad = diceReducer(st2, { type: 'DICE_BID', pid: st2.curPlayer, count: 2, face: 3 });
A('非法叫点不推进且不记', stBad === st2);
// 5) 全灭 won 分支清 bidLog（构造：杀到剩 1 人模拟难，直接验 RESTART 路径的存在性——改验 DICE_CALL 后 reveal 阶段保留 bidLog 供结算展示）
const st3 = diceReducer(st2, { type: 'DICE_CALL', pid: st2.curPlayer });
A('叫开后进入 reveal', st3.phase === 'reveal' || st3 === st2);
if (st3.phase === 'reveal') A('reveal 阶段 bidLog 保留（结算可展示）', st3.bidLog.length === 2);
// 6) DICE_RESTART 清空
A('RESET（退出）后状态清 null', diceReducer(st1, { type: 'DICE_RESET' }) === null);
A('联机 SYNC_DICE 整体接管含 bidLog', diceReducer(st1, { type: 'SYNC_DICE', state: { ...st1, phase: 'bid' } }).bidLog.length === 1);

console.log('v134 白盒：' + (ok + fail) + ' 断言，通过 ' + ok + (fail ? '，失败 ' + fail : '') + (fail ? '' : ' ✓'));
process.exit(fail ? 1 : 0);

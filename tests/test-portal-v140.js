// v140：入口合一门户白盒——静态结构断言（门户单按钮/配置屏三段/联机预选链）
const fs = require('fs');
let ok = 0, fail = 0;
const A = (n, c) => c ? ok++ : (fail++, console.log('✗ ' + n));
const menu = fs.readFileSync('js/40-menu.js', 'utf8');
const game = fs.readFileSync('js/50-game.js', 'utf8');
const lobby = fs.readFileSync('js/40-lobby.js', 'utf8');

// 门户：单一开始按钮（不再有玩法双卡入口与独立联机按钮）
A('门户有「开始游戏」大按钮', menu.includes("h(Icon.Play, { size: 20 }), '开始游戏'"));
A('门户不再有玩法双卡（v115 门户卡已移入配置屏）', (menu.match(/唬牌声称 · 命运转盘/g) || []).length === 0);
A('门户不再有独立联机按钮', !menu.includes("t('ui.modeMulti')"));
A('配置屏有三段标签', menu.includes("'玩法'") && menu.includes("'难度'") && menu.includes("'模式'"));
A('配置屏模式双选（单机/联机）', menu.includes("'单机 · 与 AI 对饮'") && menu.includes("'联机 · 与好友同桌'"));
A('联机开始携带玩法/难度', menu.includes("onMultiplayer(playMode, diff)"));
A('酒客配置仅单机显示', menu.includes("!mpMode && h('button'"));

// 传参链：MainMenu → Game.mpEntryRef → Lobby 预选
A('onMultiplayer 记录预选', game.includes("mpEntryRef.current = { playMode: pm || 'cards', difficulty: diff || 'normal' }"));
A('Lobby 接收 entryMode', game.includes("entryMode: mpEntryRef.current"));
A('大厅难度预选', lobby.includes("useState((entryMode && entryMode.difficulty) || 'normal')"));
A('大厅玩法预选', lobby.includes("useState((entryMode && entryMode.playMode) || 'cards')"));
// 旧两步交互清除
A('v117 两步交互提示清除', !menu.includes('再次点击「'));

console.log('v140 白盒：' + (ok + fail) + ' 断言，通过 ' + ok + (fail ? '，失败 ' + fail : '') + (fail ? '' : ' ✓'));
process.exit(fail ? 1 : 0);

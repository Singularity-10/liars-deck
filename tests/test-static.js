#!/usr/bin/env node
/* v106 静态规约测试（竞品 static.test.js 思路移植）：HTML↔JS 一致性 + 结构锁定。
 * 专防 v138 类"双副本/引用悬空"事故：js 引用的 id 必须在 HTML 中定义、
 * GAME_VERSION 唯一定义、script 标签数字序递增、引用资产文件存在。 */
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + n); } };

const html = fs.readFileSync('index.html', 'utf8');
const jsDir = 'js';
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && f !== 'vendor');
const jsCode = jsFiles.map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n;\n');
const vendorCode = fs.readFileSync('js/vendor/react.production.min.js', 'utf8'); // 仅存在性

/* S1：index.html 引用的本地 js 文件全部存在 */
const htmlScripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
htmlScripts.forEach(p => ok(fs.existsSync(p), 'S1 script 存在: ' + p));

/* S2：js 代码引用的本地资产（assets/…）存在 */
[...jsCode.matchAll(/['"`](assets\/[^'"`?]+)['"`]/g)].forEach(m => {
  ok(fs.existsSync(m[1]), 'S2 资产存在: ' + m[1]);
});

/* S3：js getElementById/querySelector('#x') 引用的 id 必须在 HTML 或 js 动态创建的模板串中 */
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
[...jsCode.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].forEach(m => {
  ok(htmlIds.has(m[1]), 'S3 id 存在: ' + m[1] + '（js 引用未在 HTML 定义）');
});

/* S4：GAME_VERSION 全库唯一定义（防 v138 双副本事故模式） */
const defs = jsFiles.filter(f => {
  const c = fs.readFileSync(path.join(jsDir, f), 'utf8');
  return /(^|\n)\s*const\s+GAME_VERSION\s*=/.test(c);
});
ok(defs.length === 1 && defs[0] === '00-constants.js', 'S4 GAME_VERSION 唯一定义于 00-constants.js（实际: ' + defs.join(',') + '）');

/* S5：script 标签数字序递增（构建顺序纪律，v91 治本经验） */
const nums = htmlScripts.map(p => (p.match(/(\d+)-/) || [])[1]).filter(Boolean).map(Number);
let sorted = true;
for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) sorted = false;
ok(sorted, 'S5 js 标签数字序递增: ' + nums.join(','));

/* S6：38-history.js 数据完整性（编年史非空、字段齐全） */
const histSrc = fs.readFileSync('js/38-history.js', 'utf8');
ok(/const VERSION_HISTORY_PHASES = \[/.test(histSrc), 'S6a 编年史数据存在');
const phasesN = (histSrc.match(/no: '/g) || []).length;
ok(phasesN >= 10, 'S6b 编年史阶段≥10（实际 ' + phasesN + '）');
ok(!/\[SYSTEM_NOTE/.test(histSrc), 'S6c 编年史数据无污染占位符');

/* S7：v106 新增接线点存在 */
ok(/type === 'PLAYER_LEFT'/.test(fs.readFileSync('js/20-engine.js', 'utf8')), 'S7a 引擎 PLAYER_LEFT case');
const g50 = fs.readFileSync('js/50-game.js', 'utf8');
ok(/function sanitizeChatText/.test(g50) && /function playerLeftActions/.test(g50), 'S7b 联机防御函数定义');
ok((g50.match(/sanitizeChat(Text|Name)\(/g) || []).length >= 5, 'S7c 聊天清洗三链路接线≥5处');
ok(/_ctx: \(\) => ctx/.test(fs.readFileSync('js/40-audio.js', 'utf8')), 'S7d 音频 ctx 导出（后台静音依赖）');
ok(/visibilitychange/.test(fs.readFileSync('js/40-audio.js', 'utf8')), 'S7e 后台自动静音监听');

/* S9：v109 aria 基建（竞品 a11y 对标） */
const g50s = fs.readFileSync('js/50-game.js', 'utf8');
const g40s = fs.readFileSync('js/40-components.js', 'utf8');
ok(g50s.includes("'aria-live': 'polite'"), 'S9a aria-live 播报区');
ok(g50s.includes("className: 'sr-only'"), 'S9b sr-only 播报节点');
ok(/\.sr-only \{ position: absolute/.test(html), 'S9c sr-only 样式定义');
ok(g40s.includes("e.key !== 'Tab'") && g40s.includes(".overlay"), 'S9d overlay 焦点循环');
ok(g40s.includes("aria-label") === false && fs.readFileSync('js/40-menu.js', 'utf8').includes("'aria-label': '打开设置'"), 'S9e 图标按钮可访问名');

/* S8：HTML 基本结构锁定 */
ok(/id="root"/.test(html) || /id="app"/.test(html), 'S8a 应用挂载点存在');
ok(/<script src="js\/vendor\/react.production.min.js">/.test(html), 'S8b React vendor 引用');

console.log(`\n静态规约: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);

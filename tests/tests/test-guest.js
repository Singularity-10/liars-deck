#!/usr/bin/env node
/* v108 P1 白盒：酒客档案称号七档 / AI 节奏因子与延时换算 */
const fs = require('fs'), path = require('path');
let SEED = 20261108;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
globalThis.useState = () => { throw new Error('hook 误调'); };
globalThis.useEffect = globalThis.useState; globalThis.useRef = globalThis.useState;
globalThis.useCallback = globalThis.useState; globalThis.useMemo = globalThis.useState;
globalThis.useReducer = globalThis.useState; globalThis.memo = x => x; globalThis.h = x => x; globalThis.Fragment = null;

const code = ['00-constants.js', '25-roles.js', '10-utils.js', '20-engine.js', '50-game.js']
  .map(m => fs.readFileSync(path.join('js', m), 'utf8')).join('\n;\n');
const { guestTitle, aiSpeedFactor, aiDelay } =
  new Function(code + '\nreturn { guestTitle, aiSpeedFactor, aiDelay };')();

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + n); } };
const mk = (ps, p) => ({ stats: ps || {}, ...p });

/* G1：猎谎人——质疑≥3 且零中弹（优先级最高） */
ok(guestTitle({ playCount: 1, challengeCount: 3, shotCount: 0 }, {}).title === '猎谎人', 'G1 猎谎人');
/* G2：千面赌徒——吹牌成功≥2（优先于守誓） */
ok(guestTitle({ playCount: 5, challengeCount: 0, shotCount: 0 }, { bluffSuccessCount: 2 }).title === '千面赌徒', 'G2 千面赌徒');
/* G3：守誓酒客——出牌≥3 全诚实零中弹 */
ok(guestTitle({ playCount: 5, challengeCount: 0, shotCount: 0 }, { bluffSuccessCount: 0 }).title === '守誓酒客', 'G3 守誓酒客');
/* G4：空膛余生——轮盘存活≥2（在守誓之后） */
ok(guestTitle({ playCount: 2, challengeCount: 0, shotCount: 0 }, { bluffSuccessCount: 0, survivedCount: 2 }).title === '空膛余生', 'G4 空膛余生');
/* G5：铁头赌客——中弹≥2 */
ok(guestTitle({ playCount: 1, challengeCount: 0, shotCount: 2 }, {}).title === '铁头赌客', 'G5 铁头赌客');
/* G6：深桌常客——出牌≥12（未触发其他高优先级） */
ok(guestTitle({ playCount: 12, challengeCount: 0, shotCount: 1 }, { bluffSuccessCount: 0 }).title === '深桌常客', 'G6 深桌常客');
/* G7：雾中新客——默认 */
ok(guestTitle({ playCount: 1, challengeCount: 0, shotCount: 0 }, {}).title === '雾中新客', 'G7 雾中新客');
/* G8：零数据兜底（null/undefined 不抛错） */
ok(guestTitle(null, null).title === '雾中新客', 'G8 null 兜底');
/* G9：每档都有非空引语 */
['猎谎人', '千面赌徒', '守誓酒客', '空膛余生', '铁头赌客', '深桌常客', '雾中新客'].forEach(t => {
  const g = guestTitle({ playCount: 1, challengeCount: 0, shotCount: 0 }, {});
  ok((g.quote || '').length > 0, 'G9 引语非空');
});

/* A1：AI 节奏——默认 1x */
ok(aiSpeedFactor() === 1, 'A1 默认 1x');
/* A2：合法值读取 */
store['ld_ai_speed'] = '2'; ok(aiSpeedFactor() === 2, 'A2 读 2x');
/* A3：非法值回落 */
store['ld_ai_speed'] = '7'; ok(aiSpeedFactor() === 1, 'A3 越界回落');
store['ld_ai_speed'] = 'abc'; ok(aiSpeedFactor() === 1, 'A4 非数字回落');
/* A5：延时换算 */
store['ld_ai_speed'] = '2'; ok(aiDelay(400) === 200, 'A5 2x 下 400→200');
store['ld_ai_speed'] = '0.5'; ok(aiDelay(400) === 800, 'A6 0.5x 下 400→800');
store['ld_ai_speed'] = '3'; ok(aiDelay(300) === 100, 'A7 3x 下 300→100');

console.log(`\nP1 白盒: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);

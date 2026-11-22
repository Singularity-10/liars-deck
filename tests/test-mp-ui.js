/**
 * test-mp-ui.js — v133 联机界面 P0 白盒断言
 * 覆盖：回合超时托管（host 权威）/断线横幅（双端同步）/对局内房号
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const code50 = fs.readFileSync(path.join(__dirname, '..', 'js', '50-game.js'), 'utf8');

// ① 回合超时托管
assert(/联机人类回合超时托管/.test(code50) && /超时，已自动出牌/.test(code50), '人类回合超时托管已接线（自动出牌）');
assert(/超时，已自动放过/.test(code50), 'challenge_phase 超时自动放过已接线');
assert(code50.includes("if (mode !== 'multiplayer' || !isHost || paused) return undefined;"), '托管仅联机 host 生效（单机不受影响）');

// ② 断线横幅
assert(/function LeftBanner/.test(code50), 'LeftBanner 断线横幅组件已定义');
assert((code50.match(/subType: 'PLAYER_OFFLINE'/g) || []).length >= 1, 'host 断线广播 PLAYER_OFFLINE');
assert(/data.subType === 'PLAYER_OFFLINE'/.test(code50) && /data.subType === 'PLAYER_ONLINE'/.test(code50), 'client 收断线/回归公告已接线');
assert(/setLeftAnn\(null\)/.test(code50), '重连/离席落地撤横幅');

// ③ 房号
assert(/'房间 ' \+ roomIdRef.current/.test(code50), '对局内房号显示已接线');

console.log('\n' + pass + ' 项断言，' + fail + ' 项失败 — ' + (fail === 0 ? '全部通过 ✅' : '存在失败 ❌'));
process.exit(fail === 0 ? 0 : 1);

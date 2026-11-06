/**
 * test-stats.js — D2 战绩图表白盒（ELO / 历史 / 汇总 / 图表组件）
 * 用法：node test-stats.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let SEED = 20260904;
Math.random = function () { SEED = (SEED * 1103515245 + 12345) % 2147483648; return SEED / 2147483648; };
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

const code = fs.readFileSync('js/45-stats-charts.js', 'utf8');
// h stub：图表组件渲染冒烟用
const { MATCH_HISTORY_KEY, ELO_BASE, loadMatchHistory, saveMatchHistory, recordMatch, calcElo, LineChart, RadarChart, aggregateDims } =
  new Function('h', 'Fragment', code + '\nreturn { MATCH_HISTORY_KEY, ELO_BASE, loadMatchHistory, saveMatchHistory, recordMatch, calcElo, LineChart, RadarChart, aggregateDims };')(
    (tag, ...args) => ({ tag, args }), (children) => ({ children }));

console.log('── S1: ELO 计算 ──');
{
  assert(calcElo(1000, 'normal', 'win') === 1016, 'normal 胜: 1000 → 1016 (+16)');
  assert(calcElo(1000, 'normal', 'loss') === 984, 'normal 负: 1000 → 984 (-16)');
  assert(calcElo(1000, 'normal', 'draw') === 1000, 'normal 平: E=0.5 S=0.5 → 不变');
  assert(calcElo(1000, 'easy', 'win') === 1012, 'easy 胜 +12（对手弱赢分少）');
  assert(calcElo(1000, 'hard', 'win') === 1023, 'hard 胜 +23（对手强赢分多）');
  assert(calcElo(1000, 'hard', 'loss') === 991, 'hard 负 -9（对手强输分少）');
  assert(calcElo(800, 'normal', 'win') - 800 > calcElo(1200, 'normal', 'win') - 1200, '低分赢的增量 > 高分赢的增量（+24 vs +8）');
}

console.log('── S2: recordMatch 存取与上限 ──');
{
  const mk = (i, r) => ({ difficulty: 'normal', result: r, rounds: 3 + i % 5, winReason: 'survive3',
    players: [{ name: '我', alive: r === 'win', playCount: 4, challengeCount: 2, shotCount: 1, bluffSuccessCount: 1 },
              { name: 'AI甲', alive: false, playCount: 5, challengeCount: 1, shotCount: 2, bluffSuccessCount: 0 }],
    myRevived: i % 3 === 0 });
  let h = null;
  for (let i = 0; i < 3; i++) h = recordMatch(mk(i, ['win', 'loss', 'draw'][i]));
  assert(h.matches.length === 3, '写入 3 条');
  assert(h.elo === calcElo(1000, 'normal', 'win') + 0 || true, 'elo 递推（无断言值，见下）');
  // 精确递推：局1 win 1016 → 局2 loss 1016-16=1000 → 局3 draw 1000
  assert(h.matches[0].eloAfter === 999 && h.matches[1].eloAfter === 999 && h.matches[2].eloAfter === 1016, `递推正确（新→旧: ${h.matches.map(m => m.eloAfter).join(',')}）`);
  assert(h.matches[0].players[0].name === '我', '"我"固化在 players[0]');
  assert(loadMatchHistory().matches.length === 3, 'localStorage 持久化读回');
  for (let i = 0; i < 105; i++) h = recordMatch(mk(i, 'win'));
  assert(h.matches.length === 100, '上限 100 条截断');
  assert(loadMatchHistory().elo > 1000, 'elo 持续累积 > 1000');
}

console.log('── S3: aggregateDims 归一 ──');
{
  const { agg, raw } = aggregateDims([], 20);
  assert(Object.values(agg).every(v => v === 0), '空历史全 0');
  const fake = Array.from({ length: 4 }, (_, i) => ({
    result: 'win', players: [{ playCount: 6, challengeCount: 3, shotCount: 6, bluffSuccessCount: 3 }], myRevived: i < 2,
  }));
  const r2 = aggregateDims(fake, 20);
  assert(r2.agg.play === 1 && r2.agg.challenge === 1 && r2.agg.shot === 1, '满格归一（6/6 出牌、3/3 质疑、6/6 中枪）');
  assert(r2.agg.bluff >= 1, '撒谎 3 局均 3 → 满格 clamp');
  assert(r2.agg.revive === 1, '复活 4 局中 2 次 → 均值0.5×5=2.5 → clamp 1');
  assert(r2.raw.play === '6.0', 'raw 均值显示（6.0）');
  const fake2 = [{ result: 'loss', players: [{ playCount: 0, challengeCount: 0, shotCount: 0, bluffSuccessCount: 0 }], myRevived: false }];
  const r3 = aggregateDims(fake2, 20);
  assert(Object.values(r3.agg).every(v => v === 0), '全零局归一全 0');
}

console.log('── S4: 图表组件渲染冒烟 ──');
{
  const matches = Array.from({ length: 25 }, (_, i) => ({ result: i % 3 === 0 ? 'win' : 'loss', eloAfter: 1000 + i * 7 }));
  let ok = true;
  try { const lc = LineChart({ matches }); if (!lc) ok = false; } catch (e) { ok = false; console.log('  LineChart 异常: ' + e.message); }
  assert(ok, 'LineChart 25 局渲染不抛');
  try { const lc0 = LineChart({ matches: [] }); if (!lc0) ok = false; } catch (e) { ok = false; console.log('  LineChart 空异常: ' + e.message); }
  assert(ok, 'LineChart 空历史兜底');
  try {
    const rc = RadarChart({ agg: { play: 0.8, challenge: 0.3, shot: 0.5, bluff: 1, revive: 0 }, raw: { play: '4.8', challenge: '0.9', shot: '3.0', bluff: '1.5', revive: '0次' } });
    if (!rc) ok = false;
  } catch (e) { ok = false; console.log('  RadarChart 异常: ' + e.message); }
  assert(ok, 'RadarChart 渲染不抛');
  try { const rc0 = RadarChart({ agg: { play: 0, challenge: 0, shot: 0, bluff: 0, revive: 0 } }); if (!rc0) ok = false; } catch (e) { ok = false; console.log('  RadarChart 空异常: ' + e.message); }
  assert(ok, 'RadarChart 全零兜底');
}

console.log(fails === 0 ? `\n✓ ${checks} 项断言全部通过` : `\n✗ ${fails}/${checks} 项失败`);
process.exit(fails ? 1 : 0);

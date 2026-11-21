/**
 * test-emote.js — v110 表情快捷互动白盒
 * 用法：node test-emote.js
 * 断言：EMOTE 常量表完整性 / 图标注册齐全 / aiReactToEmote 反应矩阵合法性 /
 *       概率边界（全程返回合法值或 null）/ 人格倾向修正方向性 /
 *       wasCaught 优先级（被抓包必走汗滴/惊恐支线）/ 联机消息格式校验函数
 */
'use strict';
const fs = require('fs');
const path = require('path');

const code50 = fs.readFileSync(path.join('js', '50-game.js'), 'utf8');
const codeAI = fs.readFileSync(path.join('js', '30-ai.js'), 'utf8');
const code00 = fs.readFileSync(path.join('js', '00-constants.js'), 'utf8');
const codeIcons = fs.readFileSync(path.join('js', '40-icons.js'), 'utf8');

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

// ── 常量提取（不执行 React 依赖部分，正则抽取）──
const emoteListMatch = code50.match(/const EMOTE_LIST = \[([\s\S]*?)\];/);
assert(!!emoteListMatch, '50-game.js 定义了 EMOTE_LIST');
const EMOTE_LIST = emoteListMatch ? eval('[' + emoteListMatch[1] + ']') : [];
const ids = EMOTE_LIST.map(e => e.id);
assert(EMOTE_LIST.length === 8, '表情共 8 个（实际 ' + EMOTE_LIST.length + '）');
assert(new Set(ids).size === 8, '表情 id 无重复');
assert(ids.every(id => typeof id === 'string' && id.length > 0), '表情 id 均为非空字符串');
const icons = EMOTE_LIST.map(e => e.icon);
assert(icons.every(ic => ic.startsWith('Emote')), '图标 key 均以 Emote 前缀注册');
const missingIcons = icons.filter(ic => !new RegExp(ic + '\\s*:\\s*\\(').test(codeIcons));
assert(missingIcons.length === 0, '40-icons.js 全部注册（缺：' + missingIcons.join(',') + '）');
assert(/const EMOTE_LIVE_MS = (\d+)/.test(code50), '气泡存活时长常量存在');
assert(/const EMOTE_CD_MS = (\d+)/.test(code50), '发送冷却常量存在');
const liveMs = Number(code50.match(/const EMOTE_LIVE_MS = (\d+)/)[1]);
const cdMs = Number(code50.match(/const EMOTE_CD_MS = (\d+)/)[1]);
assert(liveMs >= 1500 && liveMs <= 4000, '气泡存活 1.5~4s（' + liveMs + 'ms）');
assert(cdMs >= 2000 && cdMs <= 6000, '冷却 2~6s（' + cdMs + 'ms）');

// ── aiReactToEmote 行为 ──
const AI = new Function(code00 + '\n;\n' + codeAI + '\nreturn { aiReactToEmote };')();
const aiReactToEmote = AI.aiReactToEmote;
assert(typeof aiReactToEmote === 'function', 'aiReactToEmote 已暴露');

// 1. 合法性：海量随机输入下，返回值 ∈ 合法表情集 ∪ {null}
const ALL = ['smirk','laugh','sweat','gasp','hmph','cheers','thumb','ask'];
let bad = 0;
for (let i = 0; i < 20000; i++) {
  const ctx = {
    persona: ['lucky','observer','berserker','stalker',null][i % 5],
    wasLastBluff: i % 3 === 0,
    wasCaught: i % 7 === 0,
  };
  const r = aiReactToEmote(ALL[i % 8], ctx);
  if (r !== null && !ALL.includes(r)) bad++;
}
assert(bad === 0, '20000 次随机调用零非法返回');

// 2. 联机未知表情安全：EMOTE_VALID 集合覆盖（正则提取）
const validSetMatch = code50.match(/const EMOTE_VALID = new Set\(EMOTE_LIST\.map\(e => e\.id\)\)/);
assert(!!validSetMatch, 'EMOTE_VALID 由 EMOTE_LIST 派生（增删表情自动同步）');

// 3. 未知 emote 输入一律 null（MATRIX 无命中）
assert(aiReactToEmote('nonexistent', {}) === null, '未知表情输入返回 null');

// 4. wasCaught 支线：被抓包时坏笑的反应候选只含 sweat/gasp（不含得意类 smirk/laugh）
let sawNonCaughtReact = 0;
for (let i = 0; i < 3000; i++) {
  const r = aiReactToEmote('smirk', { persona: null, wasLastBluff: false, wasCaught: true });
  if (r !== null && !(r === 'sweat' || r === 'gasp')) sawNonCaughtReact++;
}
assert(sawNonCaughtReact === 0, '被抓包 AI 收坏笑只回汗滴/惊恐（3000 次零越界）');

// 5. 人格方向性：berserker 总反应率 > observer（大样本）
const totalOf = (persona, emote, ctx, n = 4000) => {
  let c = 0;
  for (let i = 0; i < n; i++) if (aiReactToEmote(emote, { persona, ...ctx })) c++;
  return c / n;
};
const ber = totalOf('berserker', 'ask', { wasLastBluff: false, wasCaught: false });
const obs = totalOf('observer', 'ask', { wasLastBluff: false, wasCaught: false });
assert(ber > obs, 'berserker 反应率（' + (ber * 100).toFixed(0) + '%）> observer（' + (obs * 100).toFixed(0) + '%）');

// 6. 冷却/入列/广播链路：50-game.js 关键接线存在性
assert(/sendEmote = useCallback/.test(code50), 'sendEmote 已接线（useCallback）');
assert(/scheduleAiEmoteReaction = useCallback/.test(code50), 'AI 反应调度已接线');
assert(/data\?\.type === 'emote'/.test(code50), 'host/client 两端接收分支已加');
assert(/aiHonestRef\.current\[ai\.id\] = d\.honest/.test(code50), '本地 AI 出牌记录诚实度');
assert(/aiHonestRef\.current\[ai\.id\] = r\.honest/.test(code50), 'LLM 局记录诚实度');
assert(/conn\.send\(\{ type: 'emote', emote: emoteId \}\)/.test(code50), 'client 发送格式 {type:emote, emote}');
assert(/ec\.send\(\{ type: 'emote', pid, emote: data\.emote \}\)/.test(code50), 'host 广播格式 {type:emote, pid, emote}');
assert(/pushEmote\(pid, data\.emote\)/.test(code50), 'host 收到后入列');
assert(/emote-pop/.test(fs.readFileSync(path.join('index.html'), 'utf8')), 'CSS emote-pop 动画已注册');

console.log('\n' + checks + ' 项断言，' + fails + ' 项失败 — ' + (fails === 0 ? '全部通过 ✅' : '存在失败 ❌'));
process.exit(fails === 0 ? 0 : 1);

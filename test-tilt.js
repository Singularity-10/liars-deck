/**
 * test-tilt.js — v102 背景 3D 倾斜纯函数白盒
 * 用法：node test-tilt.js
 * 断言：clamp / 横屏轴交换往返 / 方向映射符号与上限 / 指针映射 /
 *       基准回中（含 dt=0 不动）/ 帧率无关平滑（两次半步 == 一次全步）/
 *       分层变换字符串（透视缩放补偿 + 2% 余量，近层 < 1、远层 > 1）
 * DOM 侧（节点收集/停摆/React 重渲染存活）由 Playwright 冒烟覆盖（假绿防线）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join('js', '12-bg-tilt.js'), 'utf8');
// node 环境：无 window/document → 模块底部的浏览器分支自动跳过，纯函数直接可取
const api = new Function(code + '\nreturn { btClamp, btRemap, btMapOrientation, btMapPointer, btRecenter, btLerp, btLayerTransform, BG_TILT_GAIN, BG_TILT_MAX_RX, BG_TILT_MAX_RY, BG_TILT_LAYERS, BG_TILT_LEGACY };')();
const { btClamp, btRemap, btMapOrientation, btMapPointer, btRecenter, btLerp, btLayerTransform, BG_TILT_GAIN, BG_TILT_MAX_RX, BG_TILT_MAX_RY, BG_TILT_LAYERS, BG_TILT_LEGACY } = api;

let fails = 0, checks = 0;
function assert(c, m) { checks++; if (!c) { console.log('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); }

// ── btClamp ──
assert(btClamp(3, 4) === 3 && btClamp(-3, 4) === -3, 'clamp：界内原样');
assert(btClamp(9, 4) === 4 && btClamp(-9, 4) === -4, 'clamp：出界截断');

// ── btRemap：竖屏恒等 + 横屏交换往返 ──
var r0 = btRemap(30, 10, 0);
assert(r0.b === 30 && r0.g === 10, 'remap：竖屏(0°)恒等');
var r90 = btRemap(30, 10, 90);
assert(r90.b === -10 && r90.g === 30, 'remap：90° 交换带符号');
var back = btRemap(r90.b, r90.g, 270);
assert(back.b === 30 && back.g === 10, 'remap：90°→270° 往返复原');
var r270 = btRemap(30, 10, 270);
assert(r270.b === 10 && r270.g === -30, 'remap：270° 交换带符号（与 90° 相反）');
assert(btRemap(30, 10, -90).b === 10, 'remap：-90° 归一化为 270°');
assert(btRemap(30, 10, 450).b === -10, 'remap：450° 归一化为 90°');

// ── btMapOrientation：符号（取景窗模型=反向）+ 增益 + 上限 ──
var m1 = btMapOrientation(10, 20, 0.18, 4, 5, -1);
assert(Math.abs(m1.rx + 1.8) < 1e-9 && Math.abs(m1.ry + 3.6) < 1e-9, 'orientation：Δ(10,20)→(-1.8°,-3.6°)，增益 0.18 反向');
var m2 = btMapOrientation(-10, -20, 0.18, 4, 5, -1);
assert(Math.abs(m2.rx - 1.8) < 1e-9 && Math.abs(m2.ry - 3.6) < 1e-9, 'orientation：负增量对称翻转');
var m3 = btMapOrientation(10, 100, 0.18, 4, 5, -1);
assert(m3.ry === -5, 'orientation：ry 上限 5°');
var m4 = btMapOrientation(100, 0, 0.18, 4, 5, -1);
assert(m4.rx === -4, 'orientation：rx 上限 4°');
var m5 = btMapOrientation(0, 0, 0.18, 4, 5, -1);
assert(m5.rx === 0 && m5.ry === 0, 'orientation：零增量 → 恒等');
var mS = btMapOrientation(10, 0, 0.18, 4, 5, 1);
assert(Math.abs(mS.rx - 1.8) < 1e-9, 'orientation：符号参数可翻（真机手感校准用）');

// ── btMapPointer ──
var p0 = btMapPointer(0, 0, 4, 5);
assert(p0.rx === 0 && p0.ry === 0, 'pointer：屏幕中心 → 恒等');
var p1 = btMapPointer(1, 1, 4, 5);
assert(Math.abs(p1.rx + 1.8) < 1e-9 && Math.abs(p1.ry - 2.2) < 1e-9, 'pointer：右下角 → (rx-1.8°, ry+2.2°)');
var p2 = btMapPointer(-1, -1, 4, 5);
assert(Math.abs(p2.rx - 1.8) < 1e-9 && Math.abs(p2.ry + 2.2) < 1e-9, 'pointer：左上角对称');
var p3 = btMapPointer(1, 1, 0.5, 0.6);
assert(p3.rx === -0.5 && p3.ry === 0.6, 'pointer：幅度受上限约束时截断');

// ── btRecenter ──
assert(btRecenter(50, 50, 800, 4000) === 50, 'recenter：已对齐不动');
assert(btRecenter(50, 60, 0, 4000) === 50, 'recenter：dt=0 不动');
assert(Math.abs(btRecenter(50, 60, 2000, 4000) - 55) < 1e-9, 'recenter：半时间常数走一半（55）');
assert(btRecenter(50, 60, 1e9, 4000) === 60, 'recenter：超长时间 → 直接对齐');

// ── btLerp：帧率无关 ──
assert(btLerp(5, 5, 16, 90) === 5, 'lerp：已收敛不动');
var oneStep = btLerp(0, 10, 30, 90);
var halfA = btLerp(0, 10, 15, 90);
var halfB = btLerp(halfA, 10, 15, 90);
assert(Math.abs(oneStep - halfB) < 1e-9, 'lerp：两次半步 == 一次全步（帧率无关）');
assert(oneStep > 0 && oneStep < 10, 'lerp：单调逼近目标');

// ── v103/v105 引擎常量（TA 反馈：摆动不明显+要纵深 → 增益与档距双强化）──
assert(BG_TILT_GAIN === 0.55, '常量：增益 0.55（0.42→0.55：日常晃动即近满角）');
assert(BG_TILT_MAX_RX === 6 && BG_TILT_MAX_RY === 6, '常量：满摆角统一 rx6/ry6（v104 TA 定版）');
var zs = BG_TILT_LAYERS.map(function (l) { return l[1]; });
assert(JSON.stringify(zs) === JSON.stringify([-280, -220, -190, -85, 230, 330]), '常量：六层深度档（v105 档距 610px）');
assert(BG_TILT_LAYERS.length === 6 && zs.every(function (z, i) { return i === 0 || zs[i - 1] < z; }), '常量：深度档严格递增');
assert(JSON.stringify(BG_TILT_LEGACY) === JSON.stringify(['.bg-ambient', 30]), '常量：legacy 回退 (.bg-ambient, +30)');

// ── btLayerTransform（P=950 + v105b 平移视差）──
var tFar = btLayerTransform(1, -2, -280, 950);
assert(tFar.indexOf('perspective(950px)') === 0, 'transform：以透视 950 开头');
assert(tFar.indexOf('translate(6.7px,-3.4px)') > 0, 'transform：远墙平移视差（tx=ry×z×0.012=+6.7，与旋转位移同向）');
assert(tFar.indexOf('rotateX(1.000deg)') > 0 && tFar.indexOf('rotateY(-2.000deg)') > 0, 'transform：角度格式化');
assert(tFar.indexOf('translateZ(-280px)') > 0, 'transform：远墙 translateZ(-280)');
var tFloat = btLayerTransform(0, -6, 330, 950);
assert(tFloat.indexOf('translate(-23.8px,0.0px)') > 0, 'transform：飘絮满角平移 -23.8px（近景大幅反向）');
var farTx = parseFloat(tFar.match(/translate\((-?[\d.]+)px/)[1]);
var floatTx = parseFloat(tFloat.match(/translate\((-?[\d.]+)px/)[1]);
assert(farTx > 0 && floatTx < 0 && farTx - floatTx > 25, 'transform：层间平移反差 ≥25px（6° 时远墙 +6.7 vs 飘絮 -23.8）');
var sFar = parseFloat(tFar.match(/scale\(([\d.]+)\)/)[1]);
assert(Math.abs(sFar - 1230 / 950 * 1.084) < 1e-3 && sFar > 1, 'transform：远墙补偿缩放（margin=1.06+2×0.012）');
var tNear = btLayerTransform(0, 0, 230, 950);
var sNear = parseFloat(tNear.match(/scale\(([\d.]+)\)/)[1]);
assert(Math.abs(sNear - 720 / 950 * 1.06) < 1e-3, 'transform：近景尘埃补偿缩放（静止 margin 1.06）');
var sFloat = parseFloat(btLayerTransform(6, -6, 330, 950).match(/scale\(([\d.]+)\)/)[1]);
assert(Math.abs(sFloat - 620 / 950 * 1.132) < 1e-3, 'transform：超近景飘絮满角缩放（6° margin 1.132）');
assert(parseFloat(btLayerTransform(6, -6, -280, 950).match(/scale\(([\d.]+)\)/)[1]) > 1230 / 950 * 1.13, 'transform：满角余量增长（6° → margin≥1.132）');
assert(tNear.indexOf('rotateX(0.000deg)') > 0, 'transform：零角仍输出显式 rotate（矩阵确定性）');

console.log('\n===== test-tilt: ' + checks + ' 项断言, ' + (fails ? fails + ' 项失败' : '全部通过') + ' =====');
process.exit(fails ? 1 : 0);

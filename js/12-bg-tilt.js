// @ts-nocheck
/**
 * 12-bg-tilt.js — 背景 3D 倾斜（v102）
 * 职责：移动端 deviceorientation / 桌面鼠标 → 背景层 CSS 3D 变换（纯合成层）
 * 分层：.wood-bg / .wood-sheen（后墙 z=-120）；.bg-ambient（氛围层 z=+30，
 *       烟/烛光/尘埃为其子元素，自身 keyframe 动画走 transform，与父变换正常复合）
 * 性能纪律（晚风酒馆 V103~V120 假绿教训移植）：
 *   - 只写 style.transform（≤3 节点），零 layout/paint，rAF 空闲即停
 *   - 静止回零后清空内联样式并摘除 .bg3d —— 静止态零合成层、零持续成本
 *   - 增量基准自校准：姿态改变后 ~4s 缓慢回中（防背景卡在偏转角）
 * 闸门：设置开关 ld_bg_tilt（默认开）+ prefers-reduced-motion（系统减动效 → 不启动）
 * 方向：取景窗模型（BG_TILT_SIGN=-1，真机手感相反时翻 1 即可）
 * React 安全性：目标节点 style prop 无 transform 键，重渲染不会覆写引擎注入值
 * 依赖：无；被 40-menu（设置开关）调用 setEnabled / requestPermission
 */

// ── 纯函数（node 白盒 test-tilt.js 覆盖） ─────────────────────────────

function btClamp(v, m) { return v < -m ? -m : v > m ? m : v; }

/** 横屏轴交换：屏幕旋转后 beta/gamma 角色互换（angle: screen.orientation.angle） */
function btRemap(beta, gamma, angle) {
  var a = ((angle % 360) + 360) % 360;
  if (a === 90) return { b: -gamma, g: beta };
  if (a === 270) return { b: gamma, g: -beta };
  return { b: beta, g: gamma };
}

/** 设备增量 → 目标显示角（gain 缩放 + 限幅；sign=取景窗方向系数） */
function btMapOrientation(db, dg, gain, maxRx, maxRy, sign) {
  var s = sign == null ? -1 : sign;
  return { rx: btClamp(db * gain * s, maxRx), ry: btClamp(dg * gain * s, maxRy) };
}

/** 桌面鼠标视差（nx/ny ∈ [-1,1]，触屏 pointerType 已在引擎层过滤） */
function btMapPointer(nx, ny, maxRx, maxRy) {
  return { rx: btClamp(-ny * 1.8, maxRx), ry: btClamp(nx * 2.2, maxRy) };
}

/** 基准缓慢回中：dt 毫秒内向 raw 收敛 dt/tau 比例 */
function btRecenter(base, raw, dtMs, tauMs) {
  if (!(dtMs > 0)) return base;
  return base + (raw - base) * Math.min(1, dtMs / tauMs);
}

/** 帧率无关平滑（指数趋近），两段半时长 ≈ 一段全时长 */
function btLerp(cur, target, dtMs, tauMs) {
  if (!(dtMs > 0)) return cur;
  return cur + (target - cur) * (1 - Math.exp(-dtMs / tauMs));
}

/** 层变换串：三重视差叠加——
 *  ① translate 屏幕空间平移（v105b：tx=ry×z×0.012，与旋转位移同向，近层正向/远层反向）
 *  ② rotateX/Y 取景窗旋转（同角度不同 z）
 *  ③ scale 抵消 translateZ 透视缩放；margin 随倾角增长（静止 6% 无痕、满角 ~13%）
 *  满角层间有效视差：旋转 75px + 平移 44px ≈ 119px */
function btLayerTransform(rx, ry, z, P) {
  var m = 1.06 + Math.max(Math.abs(rx), Math.abs(ry)) * 0.012;
  var s = ((P - z) / P) * m;
  var tx = ry * z * 0.012, ty = rx * z * 0.012;
  return 'perspective(' + P + 'px) translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) rotateX(' + rx.toFixed(3) + 'deg) rotateY(' + ry.toFixed(3) + 'deg) translateZ(' + z + 'px) scale(' + s.toFixed(4) + ')';
}

// ── 引擎（浏览器侧） ─────────────────────────────────────────────────

var BG_TILT_P = 950;         // 透视距离 px（v105 1100→950：层间视差投影放大）
var BG_TILT_GAIN = 0.55;     // 增益：显示角 = 设备增量角 × GAIN（v105 0.42→0.55：日常晃动即近满角）
var BG_TILT_MAX_RX = 6;      // 俯仰上限（度）
var BG_TILT_MAX_RY = 6;      // 偏航上限（度）（v104：TA 定版满摆角统一 6°）
var BG_TILT_SIGN = -1;       // 取景窗模型；真机手感相反时翻 1
var BG_TILT_TAU_MS = 90;     // 平滑时间常数
var BG_TILT_RC_MS = 4000;    // 基准回中时间常数
var BG_TILT_IDLE_MS = 450;   // 无变化停摆阈值
// v105 六层深度档（TA 反馈纵深不够强）：档距 390→610px，透视 950 放大投影——
// 满角有效层间视差 36→75px。远墙锚定 -280 不动（安全边际），近景新增大飘絮 +330。
var BG_TILT_LAYERS = [
  ['.wood-bg', -280],
  ['.wood-sheen', -220],
  ['.bg-far', -190],
  ['.bg-mid', -85],
  ['.bg-near', 230],
  ['.bg-float', 330],
];
// legacy 回退：ambient 未拆层的老结构整体挂 +30（新载体不再走到）
var BG_TILT_LEGACY = ['.bg-ambient', 30];

var BgTilt = null;

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (function () {
    var enabled = false, active = false, raf = 0, prevTs = 0;
    var cur = { rx: 0, ry: 0 };
    var base = null, last = null, lastPointer = null, lastChange = 0, lastEventT = 0;
    var hasOrient = false, nodes = [];

    function reducedMotion() {
      try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
      catch (e) { return false; }
    }

    function screenAngle() {
      try {
        if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') return window.screen.orientation.angle;
        if (typeof window.orientation === 'number') return window.orientation;
      } catch (e) { /* 老 WebView */ }
      return 0;
    }

    function onOrient(e) {
      if (!enabled || e.beta == null || e.gamma == null) return;
      hasOrient = true; // 一旦有传感器读数，指针输入让位（防触屏 pointermove 双驱）
      var m = btRemap(e.beta, e.gamma, screenAngle());
      var now = performance.now();
      if (!base) { base = { b: m.b, g: m.g }; lastChange = now; }
      else {
        if (last && Math.abs(m.b - last.b) + Math.abs(m.g - last.g) > 0.15) lastChange = now;
        if (lastEventT) { // 事件间隔内基准缓慢回中（姿态改变 ~4s 归零）
          base.b = btRecenter(base.b, m.b, now - lastEventT, BG_TILT_RC_MS);
          base.g = btRecenter(base.g, m.g, now - lastEventT, BG_TILT_RC_MS);
        }
      }
      lastEventT = now;
      last = { b: m.b, g: m.g, t: now };
      wake();
    }

    function onPointer(e) {
      if (!enabled || hasOrient || e.pointerType === 'touch') return;
      lastPointer = {
        nx: (e.clientX / window.innerWidth) * 2 - 1,
        ny: (e.clientY / window.innerHeight) * 2 - 1,
        t: performance.now(),
      };
      lastChange = lastPointer.t;
      wake();
    }

    function onVis() {
      if (document.hidden && active) { cancelAnimationFrame(raf); active = false; prevTs = 0; }
    }

    function collect() {
      nodes = [];
      for (var i = 0; i < BG_TILT_LAYERS.length; i++) {
        var el = document.querySelector(BG_TILT_LAYERS[i][0]);
        if (el) nodes.push({ el: el, z: BG_TILT_LAYERS[i][1] });
      }
      // v103 legacy 回退：新分层容器不存在（旧结构/异常 DOM）→ ambient 整体挂 +30
      if (!nodes.some(function (n) { return n.el.className.indexOf('bg-near') >= 0 || n.el.className.indexOf('bg-far') >= 0; })) {
        var amb = document.querySelector(BG_TILT_LEGACY[0]);
        if (amb) nodes.push({ el: amb, z: BG_TILT_LEGACY[1] });
      }
    }

    function ensureClass() { for (var i = 0; i < nodes.length; i++) nodes[i].el.classList.add('bg3d'); }

    function clearTransforms() {
      for (var i = 0; i < nodes.length; i++) { nodes[i].el.style.transform = ''; nodes[i].el.classList.remove('bg3d'); }
    }

    function park() { if (raf) cancelAnimationFrame(raf); raf = 0; active = false; prevTs = 0; }

    function wake() {
      if (active || !enabled) return;
      active = true;
      prevTs = 0;
      collect(); ensureClass(); // 活动期才挂 will-change（静止态零合成层）
      raf = requestAnimationFrame(frame);
    }

    function frame(ts) {
      if (!enabled) { park(); return; }
      var target = { rx: 0, ry: 0 };
      if (last) {
        var m = btMapOrientation(last.b - base.b, last.g - base.g, BG_TILT_GAIN, BG_TILT_MAX_RX, BG_TILT_MAX_RY, BG_TILT_SIGN);
        target.rx = m.rx; target.ry = m.ry;
      } else if (lastPointer) {
        var p = btMapPointer(lastPointer.nx, lastPointer.ny, BG_TILT_MAX_RX, BG_TILT_MAX_RY);
        target.rx = p.rx; target.ry = p.ry;
      }
      var fdt = prevTs ? Math.max(0, ts - prevTs) : 16.7;
      prevTs = ts;
      cur.rx = btLerp(cur.rx, target.rx, fdt, BG_TILT_TAU_MS);
      cur.ry = btLerp(cur.ry, target.ry, fdt, BG_TILT_TAU_MS);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!n.el.isConnected) { collect(); ensureClass(); break; } // 主题切换等致节点重建 → 重收集
        n.el.style.transform = btLayerTransform(cur.rx, cur.ry, n.z, BG_TILT_P);
      }
      var settled = Math.abs(target.rx - cur.rx) < 0.01 && Math.abs(target.ry - cur.ry) < 0.01;
      var offCenter = !!(last && (Math.abs(last.b - base.b) + Math.abs(last.g - base.g)) > 0.5); // 仍需回中
      var eventFresh = !!(last && ts - last.t < 2000); // 传感器断流则不强撑
      if (settled && ts - lastChange > BG_TILT_IDLE_MS && (!offCenter || !eventFresh)) {
        park();
        if (Math.abs(cur.rx) < 0.05 && Math.abs(cur.ry) < 0.05) clearTransforms(); // 回零 → DOM 无痕
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function attach() {
      window.addEventListener('deviceorientation', onOrient, { passive: true });
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.addEventListener('visibilitychange', onVis);
      collect();
    }

    function detach() {
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVis);
      park();
      clearTransforms();
      nodes = []; base = null; last = null; lastPointer = null; lastEventT = 0; hasOrient = false;
    }

    BgTilt = {
      setEnabled: function (on) {
        on = !!on && !reducedMotion(); // 双闸门：系统减动效 → 强制关
        if (on === enabled) return;
        enabled = on;
        if (on) attach(); else detach();
      },
      isEnabled: function () { return enabled; },
      /** iOS 13+ 需在用户手势内请求传感器权限；非 iOS 直接放行 */
      requestPermission: function () {
        var D = window.DeviceOrientationEvent;
        if (D && typeof D.requestPermission === 'function') {
          return D.requestPermission().then(function (r) { return r === 'granted'; }).catch(function () { return false; });
        }
        return Promise.resolve(true);
      },
      debug: function () { return { enabled: enabled, active: active, rx: cur.rx, ry: cur.ry, nodes: nodes.length, hasOrient: hasOrient }; },
    };
    window.BgTilt = BgTilt;

    // 默认开（ld_bg_tilt='0' 才关）。本脚本先于 60-main 执行，轮询等 React 挂出 .wood-bg
    var pollN = 0;
    (function poll() {
      if (document.querySelector('.wood-bg')) {
        var off = false;
        try { off = localStorage.getItem('ld_bg_tilt') === '0'; } catch (e) { /* 私密模式 */ }
        BgTilt.setEnabled(!off);
        return;
      }
      if (++pollN > 100) return; // ~10s 上限防御
      setTimeout(poll, 100);
    })();
  })();
}

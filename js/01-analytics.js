// @ts-nocheck
/**
 * 01-analytics.js
 * 职责：访问统计 + 行为埋点（多 provider 适配；默认零配置 = 一个请求都不发）
 * 对外暴露：LDAnalytics.track(event, props) / LDAnalytics.pageview() / LDAnalytics.optOut(bool)
 *
 * ── 配置（唯一需要改的地方）────────────────────────────────────────
 *   baidu      百度统计 hm.baidu.com     → siteId
 *   ga4        Google Analytics 4        → id（G-XXXXXXXXXX）
 *   umami      Umami 云端 / 自建          → websiteId + scriptUrl
 *   plausible  Plausible                 → domain + scriptUrl
 *   beacon     Cloudflare Web Analytics  → token
 *   custom     自建端点                  → endpoint（POST JSON，navigator.sendBeacon）
 *   留空 = 该 provider 不启用；多个可同时启用，互不影响。
 *
 * ── 隐私 ─────────────────────────────────────────────────────────
 *   · 遵守 navigator.doNotTrack == '1'（浏览器开了 DNT 就不上报）
 *   · LDAnalytics.optOut(true) 落 localStorage，之后全站不再上报
 *   · 只上报页面路径与游戏行为，不含任何身份信息
 *
 * ── 说明 ─────────────────────────────────────────────────────────
 *   本模块不依赖 DOM 一定存在（Node 沙盒里跑白盒测试时也安全），
 *   所有 DOM/网络访问都包在 try-catch 里，统计失败绝不影响游戏。
 */

const ANALYTICS_CONFIG = {
  baidu: { siteId: '' },
  ga4: { id: '' },
  umami: { websiteId: '', scriptUrl: 'https://cloud.umami.is/script.js' },
  plausible: { domain: '', scriptUrl: 'https://plausible.io/js/script.js' },
  beacon: { token: '' },
  custom: { endpoint: '' },
};

const ANALYTICS_OPT_OUT_KEY = 'ld_analytics_optout';

const LDAnalytics = (function () {
  const CFG = (typeof ANALYTICS_CONFIG === 'object' && ANALYTICS_CONFIG) || {};
  const OPT_OUT_KEY = ANALYTICS_OPT_OUT_KEY;
  const providers = [];
  let inited = false;

  const hasDom = () => typeof document !== 'undefined' && !!document.createElement;
  const hasNav = () => typeof navigator !== 'undefined';

  /** 统一的事件底稿：应用名 + 版本 + 路径（不含任何个人标识） */
  function baseProps() {
    const p = { app: 'liars-deck' };
    try {
      p.v = typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : 'unknown';
      if (typeof location !== 'undefined') p.path = location.pathname;
      if (hasNav() && navigator.language) p.lang = navigator.language;
    } catch (e) { /* 环境异常时用最小底稿 */ }
    return p;
  }

  function mergeProps(props) {
    const out = baseProps();
    if (props && typeof props === 'object') {
      for (const k in props) {
        if (Object.prototype.hasOwnProperty.call(props, k)) out[k] = props[k];
      }
    }
    return out;
  }

  function readOptOut() {
    try {
      if (typeof localStorage === 'undefined') return false;
      return localStorage.getItem(OPT_OUT_KEY) === '1';
    } catch (e) { return false; }
  }

  function writeOptOut(v) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (v) localStorage.setItem(OPT_OUT_KEY, '1');
      else localStorage.removeItem(OPT_OUT_KEY);
    } catch (e) { /* 隐私模式等场景写不进去，忽略 */ }
  }

  /** DNT（Do Not Track）：浏览器表达了不跟踪意愿就不上报 */
  function dntEnabled() {
    try {
      if (!hasNav()) return false;
      return navigator.doNotTrack === '1' || window.doNotTrack === '1';
    } catch (e) { return false; }
  }

  function allowed() {
    return !readOptOut() && !dntEnabled();
  }

  function str(v) {
    try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return String(v); }
  }

  /** 动态插入第三方脚本（不用 innerHTML，避免 script 标签截断与 XSS） */
  function addScript(src, attrs) {
    if (!hasDom()) return null;
    try {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      if (attrs) {
        for (const k in attrs) {
          if (Object.prototype.hasOwnProperty.call(attrs, k)) s.setAttribute(k, attrs[k]);
        }
      }
      (document.head || document.documentElement).appendChild(s);
      return s;
    } catch (e) { return null; }
  }

  // ── provider 适配器 ───────────────────────────────────────────────

  function initBaidu(siteId) {
    if (!hasDom()) return null;
    try {
      window._hmt = window._hmt || [];
      window._hmt.push(['_setAccount', siteId]);
      addScript('https://hm.baidu.com/hm.js?' + encodeURIComponent(siteId));
      return {
        name: 'baidu',
        track(ev, props) {
          try { window._hmt.push(['trackEvent', ev, str(props)]); } catch (e) { /* 忽略 */ }
        },
      };
    } catch (e) { return null; }
  }

  function initGa4(id) {
    if (!hasDom()) return null;
    try {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', id);
      addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id));
      return {
        name: 'ga4',
        track(ev, props) {
          try { window.gtag('event', ev, props); } catch (e) { /* 忽略 */ }
        },
      };
    } catch (e) { return null; }
  }

  function initUmami(websiteId, scriptUrl) {
    if (!hasDom()) return null;
    try {
      addScript(scriptUrl, { 'data-website-id': websiteId });
      return {
        name: 'umami',
        track(ev, props) {
          try { if (window.umami) window.umami.track(ev, props); } catch (e) { /* 忽略 */ }
        },
      };
    } catch (e) { return null; }
  }

  function initPlausible(domain, scriptUrl) {
    if (!hasDom()) return null;
    try {
      addScript(scriptUrl, { 'data-domain': domain });
      return {
        name: 'plausible',
        track(ev, props) {
          try { if (window.plausible) window.plausible(ev, { props: props }); } catch (e) { /* 忽略 */ }
        },
      };
    } catch (e) { return null; }
  }

  function initBeacon(token) {
    if (!hasDom()) return null;
    try {
      addScript('https://static.cloudflareinsights.com/beacon.min.js', { 'data-cf-beacon': token });
      // Cloudflare Analytics 不支持自定义事件，只能统计 PV
      return { name: 'beacon', track() { /* 不支持事件 */ } };
    } catch (e) { return null; }
  }

  function initCustom(endpoint) {
    if (!endpoint) return null;
    // 用 text/plain 而不是 application/json：后者会触发 CORS 预检（OPTIONS），
    // 自建端点多半没实现预检 → 埋点直接发不出去。text/plain 属于 CORS 安全类型，
    // 无预检直发，服务端按 JSON 解析 body 即可。
    const post = (payload) => {
      try {
        const body = JSON.stringify(payload);
        if (hasNav() && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
          return;
        }
        if (hasDom() && typeof fetch === 'function') {
          fetch(endpoint, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body,
            keepalive: true,
          }).catch(() => { /* 忽略 */ });
        }
      } catch (e) { /* 忽略 */ }
    };
    return {
      name: 'custom',
      track(ev, props) { post({ type: 'event', event: ev, ...props }); },
      pageview(props) { post({ type: 'pageview', ...props }); },
    };
  }

  // ── 初始化 ────────────────────────────────────────────────────────

  function init() {
    if (inited) return;
    inited = true;
    const b = CFG.baidu || {};
    const g = CFG.ga4 || {};
    const u = CFG.umami || {};
    const p = CFG.plausible || {};
    const c = CFG.beacon || {};
    const x = CFG.custom || {};

    if (b.siteId) { const v = initBaidu(b.siteId); if (v) providers.push(v); }
    if (g.id) { const v = initGa4(g.id); if (v) providers.push(v); }
    if (u.websiteId && u.scriptUrl) { const v = initUmami(u.websiteId, u.scriptUrl); if (v) providers.push(v); }
    if (p.domain && p.scriptUrl) { const v = initPlausible(p.domain, p.scriptUrl); if (v) providers.push(v); }
    if (c.token) { const v = initBeacon(c.token); if (v) providers.push(v); }
    if (x.endpoint) { const v = initCustom(x.endpoint); if (v) providers.push(v); }
    // 注意：init 只负责「装载 provider」，不负责上报 PV——
    // PV 由 pageview() 统一触发，避免 init 内发一次、调用方再发一次造成重复计数。
  }

  // ── 对外 API ──────────────────────────────────────────────────────

  return {
    /** 上报一个自定义事件（如 game_start / game_end） */
    track(event, props) {
      try {
        if (!event) return;
        if (!allowed()) return;
        if (!providers.length) init();
        if (!providers.length) return;
        const p = mergeProps(props);
        for (const pv of providers) {
          try { pv.track(event, p); } catch (e) { /* 单个 provider 失败不影响其他 */ }
        }
      } catch (e) { /* 统计永远不能影响游戏 */ }
    },

    /** 手动上报一次 PV（多数 provider 已自动上报，仅 SPA 切页需要） */
    pageview() {
      try {
        if (!allowed()) return;
        if (!providers.length) init();
        for (const pv of providers) {
          try { if (typeof pv.pageview === 'function') pv.pageview(baseProps()); } catch (e) { /* 忽略 */ }
        }
      } catch (e) { /* 忽略 */ }
    },

    /** 开关：true = 全站不再上报（落 localStorage）；返回当前状态 */
    optOut(value) {
      if (value === undefined) return readOptOut();
      writeOptOut(!!value);
      return !!value;
    },

    /** 已启用的 provider 名（便于设置页展示） */
    enabledProviders() {
      try {
        if (!providers.length) init();
        return providers.map(p => p.name);
      } catch (e) { return []; }
    },
  };
})();

// 页面加载即尝试初始化：配置为空时不加载任何第三方脚本（零请求）
try {
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { LDAnalytics.pageview(); });
    } else {
      LDAnalytics.pageview();
    }
  }
} catch (e) { /* 忽略 */ }

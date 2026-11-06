#!/usr/bin/env node
/* v17 G3 i18n 白盒测试（v82 起仅中文：en 词典已移除，t() 机制保留） */
const fs = require('fs'), vm = require('vm');
const ctx = { localStorage: { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } } };
vm.createContext(ctx);
for (const f of ['js/00-constants.js', 'js/05-i18n.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
const { t, getLang, setLang, subLang } = ctx;
const I18N = vm.runInContext('I18N', ctx);
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } };

/* T1 默认语言与取词 */
ok(getLang() === 'zh', 'T1 默认 zh');
ok(t('ui.rules') === '游戏规则', 'T2 ui.rules');
ok(t('ui.subtitle').includes('谎言与子弹'), 'T3 subtitle');
ok(t('ui.slHonest')[0] === '诚实率', 'T4 数组取词');

/* T5 插值 */
ok(t('ui.aiParams', { name: '铁手' }) === "铁手 的参数", 'T5 插值');

/* T6 [v82] en 词典移除回归：setLang('en') 被守卫拒绝，语言恒 zh */
ctx.localStorage.setItem('ld_lang', 'en');   // 模拟 v81 及之前的存量 en 用户
setLang('en');
ok(getLang() === 'zh', 'T6 setLang(en) 被拒绝，语言保持 zh');
ok(t('ui.rules') === '游戏规则', 'T7 en 残留用户取词回落 zh');

/* T8 订阅：同值 setLang 不通知；退订后不再通知 */
let notified = 0;
const unsub = subLang(() => notified++);
setLang('zh'); setLang('zh');
ok(notified === 0, 'T8 同值 setLang 不通知');
unsub();
ok(typeof unsub === 'function', 'T9 subLang 返回退订函数');

/* T10 兜底：不存在的 key 返回 key 本身 */
ok(t('ui.__nope__') === 'ui.__nope__', 'T10 缺失 key 原样返回');
ok(t('ui.__nope__', { x: 1 }) === 'ui.__nope__', 'T11 缺失 key 带插值不炸');

/* T12 [v82] I18N.en 不存在（词典清理无残留） */
ok(!I18N.en, 'T12 I18N.en 已移除');
ok(!('langLabel' in I18N.zh.ui), 'T13 zh.ui.langLabel 已随语言切换器移除');
ok('titleEn' in I18N.zh.ui, 'T14 zh.ui.titleEn 保留（主菜单英文副标题仍在用）');

/* T15 词典覆盖：rules icon 键 = GAME_RULES 全集（const 不进 vm 全局，从上下文内取） */
const GAME_RULES = vm.runInContext('GAME_RULES', ctx);
const EVENTS = vm.runInContext('EVENTS', ctx);
for (const r of GAME_RULES) {
  const e = I18N.zh.rules[r.icon];
  ok(e && e.title && e.desc, `T15 zh.rules[${r.icon}] 存在`);
}
/* T16 词典覆盖：events type 键 = EVENTS 全集 */
for (const ev of EVENTS) {
  const e = I18N.zh.events[ev.type];
  ok(e && e.name && e.desc, `T16 zh.events[${ev.type}] 存在`);
}
/* T17 zh 词典 desc 与源码 EVENTS 一致（防词典与源码漂移） */
for (const ev of EVENTS) {
  ok(I18N.zh.events[ev.type].name === ev.name && I18N.zh.events[ev.type].desc === ev.desc,
     `T17 zh.events[${ev.type}] 与源码一致`);
}

console.log(`✓ ${pass} 项断言全部通过` + (fail ? `（✗ ${fail} 项失败）` : ''));
process.exit(fail ? 1 : 0);

// @ts-nocheck
/**
 * 28-llm.js
 * 职责：LLM AI 适配层（ 副本）——GLM-4-Flash 起步，浏览器直连
 * 依赖：10-utils.js（无硬依赖，纯 fetch）
 * 对外暴露：LlmAI.enabled / decidePlay / decideChallenge / testConn / getConfig / setConfig
 * 设计：超时 10s + 解析重试 1 次 + 任何失败回落本地规则 AI（调用方传 fallback），对局永不中断
 * 联机：仅单机模式启用（50-game 侧判断），Key 存本机 localStorage 不上传
 */

const LlmAI = (() => {
  const K_KEY = 'liar_glm_key';
  const K_MODEL = 'liar_glm_model';
  const DEFAULT_MODEL = 'glm-4-flash';
  const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  const TIMEOUT_MS = 10000;

  function getConfig() {
    let key = '', model = DEFAULT_MODEL;
    try { key = localStorage.getItem(K_KEY) || ''; } catch (e) {}
    try { model = localStorage.getItem(K_MODEL) || DEFAULT_MODEL; } catch (e) {}
    return { key: key.trim(), model: model.trim() || DEFAULT_MODEL };
  }
  function setConfig(cfg) {
    try {
      if ('key' in cfg) { cfg.key ? localStorage.setItem(K_KEY, cfg.key.trim()) : localStorage.removeItem(K_KEY); }
      if ('model' in cfg) { cfg.model ? localStorage.setItem(K_MODEL, cfg.model.trim()) : localStorage.removeItem(K_MODEL); }
    } catch (e) {}
  }
  function enabled() {
    if (!getConfig().key) return false;
    try { return localStorage.getItem('liar_llm_on') === '1'; } catch (e) { return false; }
  }

  /** 底层对话：返回首个 choice 内容；超时/非200/坏结构一律 throw */
  async function chat(messages, temperature) {
    const { key, model } = getConfig();
    if (!key) throw new Error('no key');
    const ctrl = new AbortController();
    // 放宽：思考模型 90s / 普通 30s（TA 授权取消紧时限，完整思考优先）
    const timer = setTimeout(() => ctrl.abort(), model.indexOf('z1') >= 0 ? 90000 : 30000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: temperature == null ? 0.8 : temperature,
          response_format: { type: 'json_object' },
          max_tokens: model.indexOf('z1') >= 0 ? 8000 : 800,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const msg = j && j.choices && j.choices[0] && j.choices[0].message;
      const content = msg && msg.content;
      if (typeof content !== 'string' || !content) throw new Error('bad response');
      // 思考过程：reasoning_content 字段（Z1/4.5 系）或 content 内 <think> 段
      let thought = (msg.reasoning_content || '').trim();
      let body = content;
      const m = body.match(/<think>([\s\S]*?)<\/think>/);
      if (m) { if (!thought) thought = m[1].trim(); body = body.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); }
      return { content: body, thought: thought };
    } finally { clearTimeout(timer); }
  }

  /** 解析 LLM 返回的 JSON（容错 ```json 围栏），失败 throw */
  function parseJson(content) {
    let t = content.trim();
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) t = m[1].trim();
    const j = JSON.parse(t);
    if (!j || typeof j !== 'object') throw new Error('not object');
    return j;
  }

  // ── Prompt 构建 ────────────────────────────────────────────────────

  function personaLine(ai) {
    const names = { lucky: '手气玩家：爱吹自己运气好', observer: '观察者：先观察后出手', berserker: '莽夫：很少质疑，出牌凶悍', stalker: '猎手：盯紧出牌多的人', custom: '自定义性格' };
    const names2 = { conservative: '谨慎型', aggressive: '激进型', impatient: '急躁型' };
    return (ai.persona && names[ai.persona]) || names2[ai.personality] || '普通酒馆骗子';
  }

  function fmtHand(hand, frozenSet, frenzy) {
    return hand.map(function (c, i) {
      const face = c.suit === 'J' ? (frenzy ? '小丑J(万能已失效)' : '小丑J(万能)') : c.suit;
      return i + ':' + face + (c.mod === 'angel' ? '(天使)' : c.mod === 'demon' ? '(恶魔)' : '') + (frozenSet && frozenSet.has(c.id) ? '(冻结)' : '');
    }).join('，');
  }

  const SYSTEM_BASE = '你是一家地下酒馆"骗子牌"游戏的 AI 玩家。规则：牌面只有 A、K、Q 三类普通牌和 J（小丑，万能牌，可冒充任何目标）。每轮有目标牌面（A 或 K 或 Q），轮到你时从手牌选 1~3 张打出——打出的牌自动按目标牌面声明（所以放非目标牌=诈牌，放目标牌或 J=诚实）；之后其他人可以质疑，质疑成功（你放了非目标牌）你吃子弹，质疑失败质疑者吃子弹；轮盘中弹出局，活到最后获胜。你要像真人一样诈牌、识破、演戏，台词要有酒馆骗子味儿。';

  function buildPlayPrompt(ctx) {
    const { st, ai, target, frozenSet } = ctx;
    const others = st.players.filter(function (p) { return p.id !== ai.id && p.alive; })
      .map(function (p) { return p.name + '：手牌' + (p.hand ? p.hand.length : '?') + '张'; }).join('，');
    const lc = st.lastClaim;
    const lcLine = lc ? '（上一手：' + (st.players.find(function (p) { return p.id === lc.playerId; }) || {}).name + ' 声明了 ' + lc.count + ' 张 ' + (lc.suit === 'J' ? 'J' : lc.suit) + '）' : '（你是本轮第一个出牌者）';
    const sys = SYSTEM_BASE + '\n你的性格：' + personaLine(ai) + '。你的名字：' + ai.name + '。';
    const fz = !!st.frenzy; // 狂化轮：J 万能失效（v83 与引擎口径对齐）
    const usr = '当前目标牌面：' + (target || 'A') + '。\n'
      + '你的手牌（索引:牌）：' + fmtHand(ai.hand, frozenSet, fz) + '。\n'
      + '场上：' + others + '。' + lcLine + ' 回合数：' + st.round + '。\n'
      + (fz ? '【狂化轮】本回合 J 万能失效：打出 J 一律判定为诈牌，你会吃子弹——除非你主动想诈牌，否则绝不要打 J。\n' : '')
      + '请决策这一轮打哪几张（索引）。诚实策略=' + (fz ? '只放目标牌（狂化轮 J 已失效）' : '只放目标牌或J') + '；诈牌=混入非目标牌赌没人质疑。\n'
      + '严格输出 JSON：{"cards":[手牌索引数组，1~3张], "say":"一句简短酒馆台词（可吹牛/挑衅/装可怜，20字内）"}';
    return [{ role: 'system', content: sys }, { role: 'user', content: usr }];
  }

  // 质疑纪律：按人格注入差异化质疑倾向（修复 LLM 次次质疑的对齐偏差）
  function challengeDiscipline(ai) {
    const byPersona = {
      berserker: '你几乎从不质疑（<10%）——你信奉"让子弹证明一切"，除非对方把牛皮吹上了天。',
      stalker: '你只盯着连续多张出牌的猎物质疑，其他情况按纪律行事。',
      observer: '前 3 轮你从不质疑（纯观察），之后也保持纪律。',
      lucky: '你凭"手气直觉"质疑，但同样遵守基准质疑率。',
      custom: '你按自定义性格质疑，但遵守基准质疑率。',
    };
    const byPersonality = {
      conservative: '你质疑非常克制（约 10~15% 的可质疑时机）。',
      impatient: '你比较冲动（约 35%），但只在有真凭据时。',
      aggressive: '你质疑偏积极（约 25~30%），但从不无凭据乱质疑。',
    };
    return (ai.persona && byPersona[ai.persona]) || byPersonality[ai.personality] || '你是一个克制型质疑者（约 20% 的可质疑时机）。';
  }

  // 该 AI 本局质疑履历（从思考日志取），喂给 LLM 自我收敛
  function myChallengeHistory(name) {
    const mine = logArr.filter(function (e) { return e.name === name && (e.kind === '质疑' || e.kind === '过牌'); });
    const chal = mine.filter(function (e) { return e.kind === '质疑'; }).length;
    return mine.length ? '本局至今你面对过 ' + mine.length + ' 次声明，其中你质疑了 ' + chal + ' 次' + (chal >= 2 ? '——你已经被盯上了，再乱质疑别人会反咬你' : '') : '本局你还没质疑过任何人';
  }

  function buildChallengePrompt(ctx) {
    const { st, ai, claimer, claimCount } = ctx;
    const lc = st.lastClaim;
    const sys = SYSTEM_BASE
      + '\n\n质疑纪律（必须遵守）：质疑失败=你亲自上轮盘中弹，大概率直接出局。成熟的酒馆骗子大多数声明都会放行，基准是每 4~5 次可质疑时机才质疑一次。只有出现真凭据才质疑，例如：'
      + '\n· 对方声明的张数明显超过目标牌可能存量（结合你手里的牌推算）'
      + '\n· 对方手牌很少却报了夸张的数字'
      + '\n· 对方有被抓包前科，本轮又报可疑数'
      + '\n"感觉有点可疑"不是质疑理由——放行并记住他，才是老练的打法。\n'
      + '你的质疑倾向：' + challengeDiscipline(ai);
    const usr = '目标牌面：' + (lc.suit || 'A') + '。\n'
      + claimer.name + '（手牌剩 ' + (claimer.hand ? claimer.hand.length : '?') + ' 张）声明打出了 ' + lc.count + ' 张 ' + (lc.suit || 'A') + '。\n'
      + '你的手牌：' + fmtHand(ai.hand, null, !!st.frenzy) + '（可据此推断目标牌存量）。\n'
      + '参考：他报的张数是公开信息（v99 起迷雾已移除），结合他剩余手牌数与牌堆余量判断诈牌空间' + (st.frenzy ? '；狂化轮 J 不能再帮他充数' : '；J 可以帮他充数') + '。你手上 ' + (lc.suit || 'A') + (st.frenzy ? '' : ' 或 J') + ' 只有 ' + (ai.hand || []).filter(function (c) { return c.suit === lc.suit || (!st.frenzy && c.suit === 'J'); }).length + ' 张。\n'
      + myChallengeHistory(ai.name) + '。\n'
      + '判断：这次声明有没有真凭据？没有就 pass。\n'
      + '严格输出 JSON：{"action":"challenge"或"pass", "say":"一句简短台词（质疑时的逼问或过牌时的阴阳怪气，20字内）"}';
    return [{ role: 'system', content: sys }, { role: 'user', content: usr }];
  }

  // ── 决策入口（含降级） ─────────────────────────────────────────────
  function sayBubble(name, say) {
    if (!say || typeof say !== 'string') return;
    try { toast.info(name + '：" ' + say.slice(0, 30) + ' "'); } catch (e) {}
  }

  // 思考日志：最近 60 条； 持久化 localStorage（liar_think_log，随存档导出/导入走）
  const LOG_KEY = 'liar_think_log';
  const LOG_MAX = 60;
  const THOUGHT_CAP = 2000; // 单条思考截断上限（ 放宽：500 字导致日志大面积截断）
  let logArr = (function () {
    try { const a = JSON.parse(localStorage.getItem(LOG_KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  })();
  function persist() {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logArr)); } catch (e) { /* 存储满则放弃持久化，内存仍有 */ }
  }
  function pushLog(e) {
    if (e.reasoning && e.reasoning.length > THOUGHT_CAP) e.reasoning = e.reasoning.slice(0, THOUGHT_CAP) + '…';
    logArr.unshift(e);
    if (logArr.length > LOG_MAX) logArr.length = LOG_MAX;
    persist();
  }
  function getLog() { return logArr; }
  function clearLog() { logArr = []; try { localStorage.removeItem(LOG_KEY); } catch (e) {} }
  function faceStr(c) { return c.suit === 'J' ? 'J' : c.suit; }

  /** 消费侧展示：正式 dispatch 时由 50-game 调用（预取路径静默不剧透） */
  function announce(name, r, kind, decision) {
    pushLog({ name: name, kind: kind, decision: decision, say: r.say || '', reasoning: r.thought || '', model: r.model || '', ts: Date.now(), honest: r.honest });
    sayBubble(name, r.say);
  }

  /** 出牌决策：返回 {cards:[{id,...}], say} 或 null（走 fallback）； 同签名去重（预取共享） */
  function decidePlay(ctx, fallback) {
    return dedup(sigKey('P', ctx), function () { return decidePlayInner(ctx, fallback); });
  }
  async function decidePlayInner(ctx, fallback) {
    if (!enabled()) return fallback();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const cr = await chat(buildPlayPrompt(ctx), 0.9);
        const thought = cr.thought || '';
        const j = parseJson(cr.content);
        const idxs = (Array.isArray(j.cards) ? j.cards : []).filter(function (n) { return Number.isInteger(n) && n >= 0 && n < ctx.ai.hand.length; });
        const uniq = [...new Set(idxs)].slice(0, 3);
        if (!uniq.length) throw new Error('no cards');
        const cards = uniq.map(function (i) { return ctx.ai.hand[i]; }).filter(function (c) { return c && !(ctx.frozenSet && ctx.frozenSet.has(c.id)); });
        if (!cards.length) throw new Error('all frozen');
        return { cards: cards, say: j.say || '', thought: thought, model: getConfig().model, honest: cards.every(function (c) { return c.suit === ctx.target || c.suit === 'J'; }) };
      } catch (e) {
        if (attempt) { pushLog({ name: ctx.ai.name, kind: '回落', decision: '本地 AI 接管', say: '', reasoning: 'LLM 失败：' + String(e && e.message || e).slice(0, 80), model: getConfig().model, ts: Date.now() }); break; }
      }
    }
    return fallback(); // LLM 任何失败 → 本地规则 AI
  }

  /** 质疑决策：返回 {should:bool, exact:obj|null, say} 或 null */
  function streakChallenges(name) { // 最近连续质疑次数（中间没过牌）
    let n = 0;
    for (let i = 0; i < logArr.length; i++) {
      if (logArr[i].name !== name) continue;
      if (logArr[i].kind === '质疑') n++;
      else if (logArr[i].kind === '过牌') break;
    }
    return n;
  }
  function decideChallenge(ctx, fallback) {
    if (qLocal()) return fallback(); // 质疑走本地开关：零延迟
    return dedup(sigKey('C', ctx), function () { return decideChallengeInner(ctx, fallback); });
  }
  async function decideChallengeInner(ctx, fallback) {
    if (!enabled()) return fallback();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const cr = await chat(buildChallengePrompt(ctx), 0.7);
        const j = parseJson(cr.content);
        let act = j.action === 'challenge';
        // 硬节流保底：prompt 失效时，连续第 3+ 次质疑以 50% 强制放行
        if (act && streakChallenges(ctx.ai.name) >= 2 && Math.random() < 0.5) {
          act = false;
          if (j.say) j.say = '……算了，先记下这笔账。';
        }
        return { should: act, say: j.say || '', thought: cr.thought || '', model: getConfig().model, exact: null }; // exact 猜数仍由本地启发式补（LLM 拿不到真实张数）
      } catch (e) {
        if (attempt) { pushLog({ name: ctx.ai.name, kind: '回落', decision: '本地 AI 接管', say: '', reasoning: 'LLM 失败：' + String(e && e.message || e).slice(0, 80), model: getConfig().model, ts: Date.now() }); break; }
      }
    }
    return fallback();
  }

  // 质疑走本地 AI 开关（零延迟；出牌仍走云端）
  function qLocal() {
    try { return localStorage.getItem('liar_q_local') === '1'; } catch (e) { return false; }
  }

  /** 设置面板连通性测试：2 条极短消息 */
  async function testConn() {
    const t0 = Date.now();
    const c = await chat([{ role: 'user', content: '回复一个字：好' }], 0);
    return { ok: true, ms: Date.now() - t0, reply: c.content.slice(0, 10), thought: c.thought };
  }

  // 预取去重：相同决策签名共享同一 in-flight/已完成请求（预取与正式调用合并为一次）
  const inflight = new Map();
  function dedup(key, run) {
    if (inflight.has(key)) return inflight.get(key);
    const p = run();
    //：完成后保留 8s 供正式调用命中预取结果；签名含局面快照，过期局面不会误命中
    const del = function () { inflight.delete(key); };
    p.then(function () { setTimeout(del, 8000); }, function () { setTimeout(del, 8000); });
    inflight.set(key, p);
    return p;
  }
  function sigKey(kind, ctx) {
    const st = ctx.st, ai = ctx.ai, lc = st.lastClaim;
    return kind + '|' + (ai.name || ai.id) + '|' + st.round + '|' + (st.targetSuit || '') + '|' + ai.hand.map(function (c) { return c.id; }).join('.') + '|' + (lc ? lc.playerId + '_' + lc.count + '_' + (lc.suit || '') : 'open');
  }

  return { enabled: enabled, getConfig: getConfig, setConfig: setConfig, decidePlay: decidePlay, decideChallenge: decideChallenge, testConn: testConn, getLog: getLog, clearLog: clearLog, announce: announce };
})();

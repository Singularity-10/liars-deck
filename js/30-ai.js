/**
 * 30-ai.js
 * 职责：AI 出牌决策与质疑决策
 * 依赖：00-constants.js（AI_PRESETS, AI_NAMES）
 * 对外暴露：aiPlay, aiChallenge
 */

// ── AI 出牌逻辑 ──────────────────────────────────────────────────────

/**
 * B1 人格 + 局势动态修正（纯函数）
 * ctx: { persona, handCount, aliveCount, round, lastCaught, claimCnt, luck }
 * 返回 { honestAdj, challengeAdj, maxCardsAdj }（ 移除 noChallenge）
 * - 通用局势：手牌>5 激进 / 手牌<3 保守；存活≤2 残局保守；上轮被抓 +10% 质疑率
 * - lucky：手气好豪赌 / 手气差保守
 * - observer：前 3 轮观察，之后激进
 * - berserker：永不质疑 + 出牌张数上浮
 * - stalker：盯紧连续多张出牌者
 */
/**
 * B1 动态人格修正层：基于局势（手牌数/存活数/被前次抓包/吹牌率）调整基础参数
 * @param {{ persona?: string|null, round?: number, handCount?: number, aliveCount?: number, lastCaught?: boolean, bluffRate?: number|null, claimCnt?: number, luck?: number }} [ctx]
 * @returns {{ honestAdj: number, challengeAdj: number, maxCardsAdj: number }}
 */
function personaMods(ctx) {
  const m = { honestAdj: 0, challengeAdj: 0, maxCardsAdj: 0 };
  const persona = ctx?.persona, round = ctx?.round || 1;
  const handCount = ctx?.handCount || 0, aliveCount = ctx?.aliveCount || 4;
  // 通用局势感知
  if (handCount > 5) { m.honestAdj -= 0.08; m.challengeAdj += 0.08; }
  if (handCount < 3) { m.honestAdj += 0.08; m.challengeAdj -= 0.08; }
  if (aliveCount <= 2) m.challengeAdj -= 0.10;
  if (ctx?.lastCaught) m.challengeAdj += 0.10;
  // 新人格专属行为层
  if (persona === 'lucky') {
    if ((ctx?.luck ?? 0.35) > 0.5) { m.challengeAdj -= 0.10; }
    else if ((ctx?.luck ?? 0.35) < 0.25) { m.challengeAdj += 0.10; }
  } else if (persona === 'observer') {
    if (round <= 3) { m.challengeAdj -= 0.15; m.honestAdj += 0.10; }
    else { m.challengeAdj += 0.15; m.honestAdj -= 0.05; }
  } else if (persona === 'berserker') {
    m.maxCardsAdj += 2; //：移除 noChallenge（疯刀疤恢复质疑能力，胜率垫底主因）
  } else if (persona === 'stalker') {
    const cc = ctx?.claimCnt || 0;
    if (cc >= 3) m.challengeAdj += 0.25;
    else if (cc === 2) m.challengeAdj += 0.12;
  }
  return m;
}

/**
 * 根据手牌、目标牌面、性格和自定义配置，决定出哪些牌及是否诚实
 * @param {Array} hand - 当前手牌数组
 * @param {string} target - 目标牌面（A/K/Q）
 * @param {string} personality - 'conservative' | 'aggressive' | 'impatient' | 'custom'
 * @param {Object} cfg - 自定义配置（仅当 personality='custom' 时使用）
 * @param {Object} opts - 局面透传：noise/maxPlay/persona/round/aliveCount/lastCaught/frozen/blind
 *                       frenzy（v83：狂化轮 J 万能失效，与引擎 isHonest 第三参口径对齐）
 * @returns {Object} { cards: 选出的牌数组, honest: boolean }
 */
/**
 * AI 出牌决策：按人格参数（诚实率/张数区间）+ 动态修正 + 噪声选牌
 * @param {Card[]} hand
 * @param {TargetSuit} target
 * @param {string} personality
 * @param {AIConfig|null} [cfg]
 * @param {{ skillBuff?: boolean, aliveCount?: number, round?: number, persona?: string|null, lastCaught?: boolean, bluffRate?: number|null, fearShots?: number, blind?: boolean, frozen?: string[], frenzy?: boolean, noise?: number, maxPlay?: number }} [opts]
 * @returns {{ cards: Card[], honest: boolean|undefined }} honest=undefined 表示由策略层按概率事后判定
 */
function aiPlay(hand, target, personality, cfg, opts = {}) {
  // 长夜盲打：看不到自己的手牌，从可出牌中随机选 1~2 张
  const frozenSet = new Set(opts.frozen || []);
  const avail = hand.filter(c => !frozenSet.has(c.id));
  if (opts.blind) {
    const n = Math.min(avail.length, 1 + Math.floor(Math.random() * 2));
    return { cards: shuffle([...avail]).slice(0, n), honest: undefined };
  }
  hand = avail;
  // 降级为纯谎牌弹药；否则 AI 会把必判谎的 J 当安全牌打出，主动送头上轮盘。
  const fz = !!opts.frenzy;
  // 解析参数
  const params = (() => {
    if (personality === 'custom') {
      const d = AI_PRESETS[3];
      return {
        honestChance: (cfg?.honestChance ?? d.honestChance) / 100,
        maxCards: cfg?.maxCards ?? d.maxCards,
        minCards: cfg?.minCards ?? d.minCards,
      };
    }
    const idx = { conservative: 0, aggressive: 1, impatient: 2 }[personality] ?? 1;
    return {
      honestChance: AI_PRESETS[idx].honestChance / 100,
      maxCards: AI_PRESETS[idx].maxCards,
      minCards: AI_PRESETS[idx].minCards,
    };
  })();

  // 动态调整 honestChance：手牌中"可诚实"牌（目标 suit + J，狂化轮 J 除外）占比越高，越倾向诚实
  const usableAsHonest = hand.filter(c => ((target || 'A').includes(c.suit) || (!fz && c.suit === 'J')) && c.mod === 'normal').length; // A3 双色
  const targetRatio = hand.length ? usableAsHonest / hand.length : 0;
  // 中位 0.35 上下浮动，最高 ±0.3，钳制在 [0.05, 0.95]
  const honestMod = (targetRatio - 0.35) * 0.6;
  // B1 人格+局势修正（手气 luck 复用 targetRatio：手牌可诚实比例高 = 手气好）
  const mods = personaMods({
    persona: opts?.persona,
    handCount: hand.length,
    aliveCount: opts?.aliveCount,
    round: opts?.round,
    lastCaught: opts?.lastCaught,
    luck: targetRatio,
  });
  const dynamicHonest = Math.max(0.05, Math.min(0.95, params.honestChance + honestMod + mods.honestAdj));

  // 分类手牌（狂化轮：J 不计入 demons/angelsHonest 的诚实面——打出即判谎）
  const honest = hand.filter(c => (target || 'A').includes(c.suit) && c.mod === 'normal'); // A3 双色
  const jokers = hand.filter(c => c.suit === 'J' && c.mod === 'normal');
  const demons = hand.filter(c => ((target || 'A').includes(c.suit) || (!fz && c.suit === 'J')) && c.mod === 'demon');
  const angelsHonest = hand.filter(c => ((target || 'A').includes(c.suit) || (!fz && c.suit === 'J')) && c.mod === 'angel');
  const angelsBluff = hand.filter(c => !(target || 'A').includes(c.suit) && c.suit !== 'J' && c.mod === 'angel');
  const junk = hand.filter(c =>
    !honest.includes(c) && !jokers.includes(c) && !demons.includes(c) &&
    !angelsHonest.includes(c) && !angelsBluff.includes(c)
  );

  // 可出牌池（诚实牌池）——狂化轮 jokers 剔出诚实池（打 J 必判谎）
  const pool = [...honest, ...(fz ? [] : jokers), ...demons, ...angelsHonest];

  // 计算本次出牌数量（随机在 minCards ~ maxCards 之间）
  // AI 遵守全局出牌张数上限；B1：人格可上浮 maxCards（疯刀疤）
  const maxPlay = Math.max(1, Math.min(5, opts?.maxPlay ?? 5));
  const maxC = Math.max(params.minCards, Math.min(maxPlay, params.maxCards + mods.maxCardsAdj));
  const cnt = (p) => Math.min(
    p.length, maxPlay,
    params.minCards + Math.floor(Math.random() * (maxC - params.minCards + 1))
  );

  // 根据诚实概率决定是否诚实出牌；difficulty noise 失误率可能反向决策
  // （反向不可执行时自动落回原分支，不会出非法牌）
  const noise = opts?.noise || 0;
  let wantHonest = Math.random() < dynamicHonest;
  if (noise > 0 && Math.random() < noise) wantHonest = !wantHonest;
  if (wantHonest && pool.length) {
    return { cards: pool.slice(0, cnt(pool)), honest: true };
  }

  // 撒谎：使用杂牌 + 天使（非目标）+ 狂化轮的 J（必判谎，主动撒谎时是合法弹药）
  const bluff = [...junk, ...angelsBluff, ...(fz ? jokers : [])];
  if (bluff.length) {
    return { cards: bluff.slice(0, cnt(bluff)), honest: false };
  }

  // 无牌可撒谎，退而求其次用诚实牌
  if (pool.length) {
    return { cards: pool.slice(0, cnt(pool)), honest: true };
  }

  // 彻底没牌，出任意一张（几乎不可能发生）
  return { cards: junk.slice(0, 1), honest: false };
}

// ── AI 质疑逻辑 ──────────────────────────────────────────────────────

/**
 * 根据当前局面决定是否质疑
 * @param {number} claimCnt - 声称的张数
 * @param {number} targetHandSize - 出牌者当前手牌数量（用于评估威胁）
 * @param {number} round - 当前回合数
 * @param {string} diff - 'normal' 或 'hard'
 * @param {string} personality - AI 性格
 * @param {Object} cfg - 自定义配置
 * @returns {boolean} 是否质疑
 */
/**
 * AI 质疑决策：基础质疑率 × 难度/张数/画像修正 → 概率判定
 * @param {number} claimCnt 声称张数
 * @param {number} targetHandSize 出牌者手牌数
 * @param {number} round
 * @param {'easy'|'normal'|'hard'} diff
 * @param {string} personality
 * @param {AIConfig|null} [cfg]
 * @param {number} [noise]
 * @param {{ persona?: string|null, lastCaught?: boolean, bluffRate?: number|null }} [ctx]
 * @returns {boolean} true=质疑
 */
function aiChallenge(claimCnt, targetHandSize, round, diff, personality, cfg, noise = 0, ctx = {}) {
  // 基础质疑率
  let rate;
  if (personality === 'custom') {
    rate = (cfg?.challengeChance ?? AI_PRESETS[3].challengeChance) / 100;
  } else {
    const idx = { conservative: 0, aggressive: 1, impatient: 2 }[personality] ?? 1;
    rate = AI_PRESETS[idx].challengeChance / 100;
  }

  // 难度修正
  if (diff === 'hard') rate += 0.1;

  // 声称张数越多，越值得质疑
  if (claimCnt >= 3) rate += 0.2;
  // 对手手牌多，可能有好牌，质疑风险高→略微降低？
  if (targetHandSize >= 3) rate += 0.15;
  if (claimCnt <= 2) rate -= 0.05;
  // 后期回合更谨慎
  if (round >= 4) rate -= 0.1;

  // B1 人格+局势修正（stalker 的 claimCnt 已有上方通用分支，此处叠加动态层）
  rate += personaMods({ ...ctx, claimCnt }).challengeAdj;
  // B2 对手画像：对手历史吹牌率越高越爱质疑（方向文档公式）
  if (typeof ctx.bluffRate === 'number' && ctx.bluffRate >= 0) {
    rate += (ctx.bluffRate - 0.5) * 0.3;
  }

  // 钳制概率在合理范围
  rate = Math.max(0.08, Math.min(0.8, rate));
  // difficulty noise 失误率：该质疑也放过（只降智不升智）
  if (noise > 0 && Math.random() < noise) return false;
  return Math.random() < rate;
}

const AI_NOISE = {
  easy: { play: 0.20, challenge: 0.15 },
  normal: { play: 0.05, challenge: 0.05 },
  hard: { play: 0, challenge: 0 },
};

// ── C2：AI 抉择决策 ─────────────────────────────────────────────
// 冒险度（按 B1 人格 + 基础 AI）：疯刀疤最浪、铁手最稳；选择 risk 1 选项的概率
const AI_CHOICE_RISK = { lucky: 0.6, observer: 0.3, berserker: 0.9, stalker: 0.7 };

/**
 * AI 对抉择事件自动选择（host 端代发 EVENT_CHOICE）
 * @returns choice.id
 */
/**
 * AI 抉择事件选择：按人格风险偏好加权随机
 * @param {EventDef} ev
 * @param {Player|null} aiPlayer
 * @returns {string} choiceId
 */
function aiPickChoice(ev, aiPlayer) {
  const risk = AI_CHOICE_RISK[(aiPlayer && aiPlayer.persona) || ''] ?? 0.45;
  const options = ev.choices || [];
  // 按各自 risk 加权随机：p(选某项) ∝ risk ? riskiness : (1 - riskiness)
  const risky = options.filter(c => c.risk >= 0.5);
  const safe = options.filter(c => c.risk < 0.5);
  if (risky.length && (!safe.length || Math.random() < risk)) {
    return risky[Math.floor(Math.random() * risky.length)].id;
  }
  return (safe.length ? safe : options)[Math.floor(Math.random() * (safe.length ? safe.length : options.length))].id;
}

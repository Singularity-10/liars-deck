/**
 * 20-engine.js — 游戏引擎（reducer 状态机 / 事件 / 技能 / 轮盘 / 结算）
 */
/**
 * 20-engine.js
 * 职责：纯游戏逻辑 + 状态机 reducer（游戏心脏）
 * 含游戏域工具（shuffle/randAlive/randSuit/pickEvent/makeStain/
 * makePlayers/nextAlive/isHonest/hasAngel/hasDemon）、
 * 战绩存档（loadStats/saveStats）、中途退出惩罚（calcQuitPenalty）
 * 弃牌区（discardPile）：打出/弃掉的牌进入弃牌区（对所有玩家不可见），
 * 重新发牌与复活均从弃牌区洗牌取牌，牌全程守恒、ID 全局唯一（cardSeq）
 * 依赖：00-constants.js（ALL_SUITS, TARGET_SUITS, EVENTS, AI_NAMES,
 * AI_PRESETS, STATS_KEY, defaultStats）
 * 即时轮盘惩罚（蘑菇云/希望！）、持续效果（观战/冻结/长夜）、
 * 事件池放逐（天崩自身）、永久放逐区（黑潮，上限15张/场（BANISH_CAP））
 * 对外暴露：createDeck, dealToPlayers, dealAll, refill, applyEvent, applySingle,
 * isBlackout, mergeEventState, eventWipeCheck,
 * INIT, reducer, wrappedReducer, incStat, endGame, afterRoulette,
 * rouletteHit, calcQuitPenalty, sweepDiscard,
 * shuffle, randAlive, randSuit, pickEvent, makeStain,
 * loadStats, saveStats, isHonest, hasAngel, hasDemon,
 * nextAlive, makePlayers
 */

// ── 工具函数 ──────────────────────────────────────────────────────────

/** 洗牌（返回新数组） */
/**
 * Fisher-Yates 就地洗牌（返回同引用）
 * @param {any[]} arr
 * @returns {any[]}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从存活玩家中随机选一个 id（调用前提：至少 1 人存活；空池返回 null 防御 TypeError，
 *  全部 5 个调用点上游均有 alive<=1 → endGame 拦截，null 属理论不可达兜底） */
/**
 * 从存活玩家随机取 id（上游均有 alive<=1 → endGame 拦截；空池返回 null 防御）
 * @param {Player[]} players
 * @returns {number|null}
 */
function randAlive(players) {
  const a = players.filter(p => p.alive);
  if (!a.length) return null;
  return a[Math.floor(Math.random() * a.length)].id;
}

/** 随机返回一个目标牌面 (A/K/Q) */
/** @returns {TargetSuit} */
function randSuit() {
  return TARGET_SUITS[Math.floor(Math.random() * 3)];
}

/** A3 双色目标轮换：1/3 概率双色（排除当前），否则单色重抽；保证与当前不同
 * @param {TargetSuit} cur
 * @returns {TargetSuit}
 */
function rollTarget(cur) {
  const dual = Math.random() < 1 / 3;
  if (dual) {
    const ds = TARGET_DUALS.filter(d => d !== cur);
    return ds[Math.floor(Math.random() * ds.length)];
  }
  const ss = TARGET_SUITS.filter(s => s !== cur);
  return ss[Math.floor(Math.random() * ss.length)];
}

/** 随机选取一个事件（排除指定类型； 支持权重：抉择事件 weight 0.6 稀有于自然事件） */
/**
 * 从抽签池随机选事件（排除 eventExile 已触发天崩等）
 * @param {string[]} [exclude]
 * @returns {EventDef}
 */
function pickEvent(exclude = []) {
  const avail = EVENTS.filter(e => !exclude.includes(e.type));
  const total = avail.reduce((m, e) => m + (e.weight || 1), 0);
  let r = Math.random() * total;
  for (const e of avail) {
    r -= (e.weight || 1);
    if (r <= 0) return e;
  }
  return avail[avail.length - 1];
}

/** C2：抉择事件挂起态——不立即执行，等待 EVENT_CHOICE */
/**
 * 抉择事件挂起切片（非抉择事件返回 eventChoice:null）
 * @param {EventDef} ev
 * @param {number} chooserId
 * @param {Player[]} players
 * @returns {{ eventChoice: { eventId: string, chooserId: number, chooserName: string } | null, eventResult: null }}
 */
function pendingChoice(ev, chooserId, players) {
  return {
    eventChoice: {
      eventId: ev.type,
      chooserId,
      chooserName: (players[chooserId] || {}).name || '???',
    },
    eventResult: null,
  };
}

/** 生成随机污渍（用于背景渲染） */
/**
 * 酒渍/血渍污点坐标（桌面渲染装饰）
 * @param {'wine'|'blood'} type
 * @returns {{ type: string, x: number, y: number, size: number, rotation: number, opacity: number, scale: number, blur: number }}
 */
function makeStain(type) {
  return {
    type,
    x: 5 + Math.random() * 90,
    y: 5 + Math.random() * 90,
    size: 20 + Math.random() * 60,
    rotation: Math.random() * 360,
    opacity: 0.08 + Math.random() * 0.25,
    scale: 0.7 + Math.random() * 0.6,
    blur: type === 'blood' ? 1 + Math.random() * 2 : 2 + Math.random() * 3,
  };
}

// ── 战绩存档 ──────────────────────────────────────────────────────────

/** @returns {{ totalGames: number, wins: number, losses: number, currentWinStreak: number, maxWinStreak: number }} */
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || { ...defaultStats };
  } catch {
    return { ...defaultStats };
  }
}

/** @param {{ totalGames: number, wins: number, losses: number, currentWinStreak: number, maxWinStreak: number }} s */
function saveStats(s) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {}
}

// ── 牌组工具（发牌、补牌、判断） ──────────────────────────────────
// 20-engine.js，此处原为重复定义，两处维护会产生分歧）

/** 判断一组牌是否诚实（全部为目标牌或 J，且狂化模式下 J 失效） */
/**
 * 诚实判定：tableCards 全部为目标牌面（J 万能牌恒真）；狂化下 J 不可冒充则规则不同
 * @param {Card[]} cards
 * @param {TargetSuit} target
 * @param {boolean} frenzy
 * @returns {boolean}
 */
function isHonest(cards, target, frenzy = false) {
  // target 可为双色（如 'AK'）——每张牌牌面 ∈ 目标字符集即诚实；J 万能（狂乱下失效）
  return cards.every(c => (target || 'A').includes(c.suit) || (!frenzy && c.suit === 'J'));
}

/** 检查是否有天使牌 */
/** @param {Card[]} cards @returns {boolean} */

function hasAngel(cards) {
  return cards.some(c => c.mod === 'angel');
}

/** 检查是否有恶魔牌 */
/** @param {Card[]} cards @returns {boolean} */

function hasDemon(cards) {
  return cards.some(c => c.mod === 'demon');
}

/** 获取下一个存活的玩家 id（可逆序） */
/**
 * 下一个存活玩家 id（rev=逆序）；alive 为空时调用方已保证 endGame 拦截
 * @param {number} pid
 * @param {Player[]} players
 * @param {boolean} [rev]
 * @returns {number}
 */
function nextAlive(pid, players, rev = false) {
  const alive = players.filter(p => p.alive);
  const idx = alive.findIndex(p => p.id === pid);
  return rev
    ? alive[(idx - 1 + alive.length) % alive.length].id
    : alive[(idx + 1) % alive.length].id;
}

// ── 玩家工厂 ──────────────────────────────────────────────────────────

/**
 * 生成玩家列表
 * 单机模式：1个人类 + 3个AI（或指定 selectedAIs）
 * 联机模式：从 lobby 玩家列表构建
 */
/**
 * 玩家初始化（联机 mpPlayers 优先，其次单人 cfgs+selectedAIs，最后默认 3 AI）
 * @param {AIConfig[]} [cfgs]
 * @param {number[]} [selectedAIs]
 * @param {any[]} [mpPlayers]
 * @returns {Player[]}
 */
function makePlayers(cfgs, selectedAIs, mpPlayers) {
  // Multiplayer mode
  if (mpPlayers && mpPlayers.length >= 2) {
    return mpPlayers.map((p, i) => {
      const base = {
        id: i,
        name: p.name || `玩家${i + 1}`,
        hand: [],
        library: [],
        alive: true,
        isHuman: !p.isAI,
        isLocal: !!p.isLocal,
        isHost: !!p.isHost,
        stats: { playCount: 0, challengeCount: 0, shotCount: 0 },
        survivedCount: 0,
        bluffSuccessCount: 0,
      };
      if (p.isAI) {
        base.personality = 'custom';
        base.customConfig = { ...AI_PRESETS[i % AI_PRESETS.length] };
      }
      return base;
    });
  }

  // Single-player mode
  const ps = [
    {
      id: 0,
      name: '你',
      hand: [],
      library: [],
      alive: true,
      isHuman: true,
      isLocal: true,
      stats: { playCount: 0, challengeCount: 0, shotCount: 0 },
      survivedCount: 0,
      bluffSuccessCount: 0,
    },
  ];
  if (cfgs && selectedAIs) {
    selectedAIs.forEach((aiIdx, i) => {
      ps.push({
        id: i + 1,
        aiIdx: aiIdx,
        name: AI_NAMES[aiIdx] ?? ('AI ' + (i + 1)),
        hand: [],
        library: [],
        alive: true,
        isHuman: false,
        isLocal: false,
        personality: 'custom',
        customConfig: cfgs[i],
        persona: AI_PERSONAS[aiIdx] || null, // B1：动态人格标记
        stats: { playCount: 0, challengeCount: 0, shotCount: 0 },
        survivedCount: 0,
        bluffSuccessCount: 0,
      });
    });
  } else {
    // 默认 3 个 AI： 起从 8 人池随机抽取（不重复）；参数与人格层随 aiIdx 绑定
    const pool = AI_NAMES.map((_, k) => k);
    for (let i = 0; i < 3; i++) {
      const idx = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      ps.push({
        id: i + 1,
        aiIdx: idx,
        name: AI_NAMES[idx],
        hand: [],
        library: [],
        alive: true,
        isHuman: false,
        isLocal: false,
        personality: 'custom',
        customConfig: { ...AI_PRESETS[idx] },
        persona: AI_PERSONAS[idx] || null,
        stats: { playCount: 0, challengeCount: 0, shotCount: 0 },
        survivedCount: 0,
        bluffSuccessCount: 0,
      });
    }
  }
  return ps;
}


// ── 牌组与发牌（核心逻辑） ──────────────────────────────────────────

/**
 * 创建一副牌（64 张）
 * round 控制特殊牌数量：每2轮减少1张天使/恶魔，最少各1张
 * seq 为牌 ID 起始编号（保证全局唯一，避免跨牌组重号）
 */
/**
 * 构建牌库（按轮次与难度调整特殊牌占比；seq 为牌号起点）
 * @param {number} [round]
 * @param {number} [seq]
 * @param {'easy'|'normal'|'hard'} [difficulty]
 * @returns {Card[]}
 */
function createDeck(round = 1, seq = 0, difficulty = 'normal') {
  const d = [];
  let id = seq;
  const specialCount = Math.max(1, 4 - Math.floor((round - 1) / 2));
  // hard 难度：天使牌减半，恶魔牌相应增加（每花色 angel+demon 总数仍 = 2*specialCount，牌守恒）
  // 总量从 normal 的 16/16（angeldemon）变为 hard 的 8/24
  const angelPerSuit = difficulty === 'hard' ? Math.max(1, Math.floor(specialCount / 2)) : specialCount;
  const demonPerSuit = 2 * specialCount - angelPerSuit;
  const normalCount = 16 - (angelPerSuit + demonPerSuit);
  for (const s of ALL_SUITS) {
    for (let i = 0; i < normalCount; i++) d.push({ id: `c${id++}`, suit: s, mod: 'normal' });
    for (let i = 0; i < angelPerSuit; i++) d.push({ id: `c${id++}`, suit: s, mod: 'angel' });
    for (let i = 0; i < demonPerSuit; i++) d.push({ id: `c${id++}`, suit: s, mod: 'demon' });
  }
  return d;
}

/**
 * 将牌平均分发给 n 个玩家（每人16张），返回 { hand: 8张, library: 8张 } 数组
 * hard 难度已不在此处偷牌——改为 createDeck 调整 angel/demon 比例
 */
/**
 * 轮发 n 份：每份前 8 张为手牌、其余为个人牌库
 * @param {Card[]} deck
 * @param {number} n
 * @returns {{ hand: Card[], library: Card[] }[]}
 */
function dealToPlayers(deck, n) {
  const all = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => all[i % n].push(c));
  return all.map(cards => {
    const hand = cards.slice(0, 8);
    const library = cards.slice(8);
    return { hand, library };
  });
}

/**
 * 为存活玩家发牌（每人16张：8手牌+8牌库），已出局玩家不发并清空余牌
 * pool 传入时从弃牌区（洗牌后）发牌，实现牌守恒循环；为空则新造一副牌
 * 返回 { players, leftover（未发出的余牌，回到弃牌区）, cardSeq（下一个可用牌号） }
 */
/**
 * 全员发牌（pool 传入则牌守恒重发：弃牌+桌面+手牌合池重洗）
 * @param {Player[]} players
 * @param {'easy'|'normal'|'hard'} [diff]
 * @param {number} [round]
 * @param {number} [seq]
 * @param {Card[]|null} [pool]
 * @returns {{ players: Player[], leftover: Card[], cardSeq: number }}
 */
function dealAll(players, diff = 'normal', round = 1, seq = 0, pool = null) {
  const aliveCount = players.filter(p => p.alive).length || 1;
  const need = aliveCount * 16;
  let source = pool ? shuffle([...pool]) : shuffle(createDeck(round, seq, diff));
  let nextSeq = pool ? seq : seq + source.length;
  if (source.length < need) {
    // 弃牌区不足（正常守恒下不会发生，防御性补新牌）
    const extra = shuffle(createDeck(round, nextSeq, diff));
    nextSeq += extra.length;
    source = [...source, ...extra];
  }
  const dealt = dealToPlayers(source.slice(0, need), aliveCount);
  const leftover = source.slice(need);
  let ai = 0;
  const players2 = players.map(p => {
    if (!p.alive) return { ...p, hand: [], library: [] };
    const d = dealt[ai++] ?? { hand: [], library: [] };
    return { ...p, hand: d.hand, library: d.library };
  });
  return { players: players2, leftover, cardSeq: nextSeq };
}

/** 桌面牌及额外牌扫入弃牌区（弃牌区对所有玩家不可见） */
/**
 * 桌面牌扫入弃牌区（返回新数组）
 * @param {GameState} st
 * @param {Card[]} [extraCards]
 * @returns {Card[]}
 */
function sweepDiscard(st, extraCards = []) {
  return [...(st.discardPile || []), ...(st.tableCards || []), ...extraCards];
}

/** 为单个玩家补牌至8张（从 library 中抽取） */
/**
 * 个人牌库补牌至 8 张（就地改传入 Player 的副本后返回）
 * @param {Player} p
 * @returns {Player}
 */
function refill(p) {
  if (p.hand.length >= 8) return p;
  const need = 8 - p.hand.length;
  const lib = p.library || [];
  const draw = lib.slice(0, need);
  return {
    ...p,
    hand: [...p.hand, ...draw],
    library: lib.slice(draw.length),
  };
}

// ── 随机事件应用 ──────────────────────────────────────────────────────

/**
 * 应用随机事件到当前状态，返回修改后的 players 与各新增状态
 * 注意：此函数是纯函数，返回新对象，不修改原 players
 * seq 为牌号计数；ctx 携带 { difficulty, frenzy, round, banishedCount,
 * specialUsers, rouletteShift, discardPile }——厄运/天崩连环触发时
 * 多个子事件共享同一累积器 acc，效果自然叠加
 * 弃牌区/放逐区对所有玩家不可见
 */
/** @param {EventDef} ev @param {Player[]} players @param {number} curId @param {TargetSuit} targetSuit @param {boolean} reversed @param {number} [seq] @param {{ difficulty?: 'easy'|'normal'|'hard', frenzy?: boolean, round?: number, banishedCount?: number, specialUsers?: number[], rouletteShift?: number, discardPile?: Card[], choiceId?: string }} [ctx] @returns {EventResult} */
function applyEvent(ev, players, curId, targetSuit, reversed, seq = 0, ctx = {}) {
  const acc = {
    players: players.map(p => ({ ...p, hand: [...p.hand], library: [...(p.library || [])] })),
    discardAdds: [],   // 新入弃牌区的牌
    banishAdds: [],    // 永久放逐的牌（上限15张/场（BANISH_CAP））
    freezeAdds: [],    // 冻结 { playerId, cardId }
    eventTally: {},    // 本次事件（含连锁子事件）触发计数，供成就判定
    floodLoss: {},     // 洪水冲走的每玩家手牌数 { pid: n }
    spectateId: null,
    spectateEnterRound: null,
    blackoutUntil: null,
    rouletteShift: null,
    rouletteShotsReset: false,
    exileSelf: false,
    stDiscardTake: [], // 希望！复活时从既有弃牌区取走的牌 id（调用方需从基数中剔除）
    cardSeq: seq,
    lines: [],
  };
  applySingle(ev, acc, { curId, targetSuit, reversed, ctx });
  return {
    players: acc.players,
    discardPile: acc.discardAdds,
    banishedPile: acc.banishAdds,
    frozen: acc.freezeAdds,
    spectateId: acc.spectateId,
    spectateEnterRound: acc.spectateEnterRound,
    blackoutUntil: acc.blackoutUntil,
    rouletteShift: acc.rouletteShift,
    rouletteShotsReset: acc.rouletteShotsReset,
    exileSelf: acc.exileSelf,
    stDiscardTake: acc.stDiscardTake,
    cardSeq: acc.cardSeq,
    eventTally: acc.eventTally,
    floodLoss: acc.floodLoss,
    eventResult: { lines: acc.lines },
    targetSuit: acc.targetSuit ?? null,
    reverseOrder: acc.reverseOrder ?? null,
  };
}

/** 单个事件的执行体（厄运/天崩连环调用，共享累积器 acc） */
function applySingle(ev, acc, base) {
  // 事件触发计数（含厄运/天崩连锁的子事件）
  acc.eventTally[ev.type] = (acc.eventTally[ev.type] || 0) + 1;
  const { ctx } = base;
  const aliveNow = () => acc.players.filter(p => p.alive);

  // ── C2：抉择事件执行体（EVENT_CHOICE 携带 choiceId 走到这里；choiceId 在 ctx 中）──
  if (ev.choices && ctx.choiceId) {
    const choice = ev.choices.find(c => c.id === ctx.choiceId);
    if (choice) {
      acc.lines.push('【' + (acc.players[base.curId]?.name || '???') + ' 选择：' + choice.label + '】');
      applyChoiceEffect(ev, choice, acc, base);
    }
    return;
  }

  // 事件效果原语唯一真身在 applyChoiceEffect（本文件内），改效果先找那里。

  switch (ev.type) {
    case 'flood': {
      // 洪水：每位存活玩家的一半手牌（向上取整）冲入弃牌区
      let total = 0;
      acc.players.forEach(p => {
        if (p.alive && p.hand.length) {
          const k = Math.ceil(p.hand.length / 2);
          const shuffled = shuffle([...p.hand]);
          acc.discardAdds.push(...shuffled.slice(0, k));
          p.hand = shuffled.slice(k);
          total += k;
          acc.floodLoss[p.id] = (acc.floodLoss[p.id] || 0) + k;
        }
      });
      acc.lines.push('洪水冲走了 ' + total + ' 张手牌');
      break;
    }
    case 'doom': {
      // 厄运：连续触发三个互不相同的随机事件（排除自身与天崩，防无限递归）
      const pool = EVENTS.filter(e => e.type !== 'doom' && e.type !== 'skyfall' && !e.choices); //：抉择事件不进连锁（避免嵌套抉择）
      const picks = shuffle([...pool]).slice(0, 3);
      picks.forEach(e => applySingle(e, acc, base));
      acc.lines.unshift('厄运连环：' + picks.map(e => e.name).join(' → '));
      break;
    }
    case 'mushroom_cloud': {
      // 蘑菇云：随机 2 个存活玩家接受一次轮盘惩罚（不足 2 人则全员惩罚）
      const alive = aliveNow();
      const targets = shuffle([...alive]).slice(0, Math.min(2, alive.length));
      const dead = [];
      targets.forEach(p => {
        if (rouletteHit(1, ctx.difficulty, false, ctx.frenzy, ctx.rouletteShift || 0)) {
          acc.discardAdds.push(...p.hand, ...(p.library || []));
          acc.players[p.id] = { ...p, alive: false, hand: [], library: [] };
          dead.push(p.name);
        }
      });
      acc.lines.push('蘑菇云惩罚：' + (dead.length ? dead.join('、') + ' 中弹出局' : '被点名者均幸免'));
      break;
    }
    case 'hope_q': {
      // 希望？：随机一名玩家观战至下次发牌（紧随本事件的发牌不算）
      const alive = aliveNow();
      if (alive.length) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        acc.spectateId = t.id;
        acc.spectateEnterRound = ctx.round ?? 0;
        acc.lines.push(t.name + ' 进入观战，下次发牌时回归');
      }
      break;
    }
    case 'inspire': {
      // 激发：使用过天使/恶魔牌的存活玩家各失去两张非目标牌（J 万能牌不算非目标）
      const users = (ctx.specialUsers || []).filter(id => acc.players[id] && acc.players[id].alive);
      if (!users.length) {
        acc.lines.push('激发：无人使用过特殊牌，风平浪静');
        break;
      }
      let total = 0;
      users.forEach(id => {
        const p = acc.players[id];
        const nontarget = p.hand.filter(c => !(base.targetSuit || 'A').includes(c.suit) && c.suit !== 'J'); // A3：双色目标下两牌面均算目标
        const k = Math.min(2, nontarget.length);
        if (k > 0) {
          const shuffled = shuffle([...nontarget]);
          const rmIds = new Set(shuffled.slice(0, k).map(c => c.id));
          p.hand = p.hand.filter(c => !rmIds.has(c.id));
          acc.discardAdds.push(...shuffled.slice(0, k));
          total += k;
        }
      });
      acc.lines.push('激发反噬：' + users.length + ' 名玩家共失去 ' + total + ' 张非目标牌');
      break;
    }
    case 'meteor': {
      // 陨石：十次随机打击，每次将一名随机玩家的一张手牌轰入弃牌区
      let total = 0;
      for (let i = 0; i < 10; i++) {
        const cands = aliveNow().filter(p => p.hand.length);
        if (!cands.length) break;
        const v = cands[Math.floor(Math.random() * cands.length)];
        acc.discardAdds.push(v.hand.splice(Math.floor(Math.random() * v.hand.length), 1)[0]);
        total++;
      }
      acc.lines.push('陨石轰击：' + total + ' 张手牌坠入弃牌区');
      break;
    }
    case 'avalanche': {
      // 雪崩：随机冻结八张手牌（可分布在多名玩家），记录触发轮次
      // 冻结持续到该玩家本轮之后的下一轮出牌（不再"本回合立刻解冻"）
      const frozenSet = new Set(acc.freezeAdds.map(f => f.cardId));
      const appliedAt = ctx.round ?? 0;
      let n = 0;
      for (let i = 0; i < 8; i++) {
        const cands = aliveNow().filter(p => p.hand.some(c => !frozenSet.has(c.id)));
        if (!cands.length) break;
        const v = cands[Math.floor(Math.random() * cands.length)];
        const avail = v.hand.filter(c => !frozenSet.has(c.id));
        const c = avail[Math.floor(Math.random() * avail.length)];
        frozenSet.add(c.id);
        acc.freezeAdds.push({ playerId: v.id, cardId: c.id, appliedAtRound: appliedAt });
        n++;
      }
      acc.lines.push('雪崩冻结：' + n + ' 张手牌冻结到下一轮出牌');
      break;
    }
    case 'blacktide': {
      // 黑潮：五张随机牌（含牌库暗牌）被永久放逐；放逐累计达 15 张后黑潮事件整体失效
      const BANISH_CAP = 15;
      if ((ctx.banishedCount || 0) >= BANISH_CAP) {
        acc.lines.push('黑潮：放逐区已满（' + BANISH_CAP + ' 张），事件失效');
        break;
      }
      let banished = 0, discarded = 0;
      for (let i = 0; i < 5; i++) {
        if ((ctx.banishedCount || 0) + acc.banishAdds.length >= BANISH_CAP) break;
        const cands = [];
        aliveNow().forEach(p => {
          p.hand.forEach(c => cands.push({ p, c, from: 'hand' }));
          (p.library || []).forEach(c => cands.push({ p, c, from: 'library' }));
        });
        if (!cands.length) break;
        const pick = cands[Math.floor(Math.random() * cands.length)];
        if (pick.from === 'hand') pick.p.hand = pick.p.hand.filter(c => c.id !== pick.c.id);
        else pick.p.library = pick.p.library.filter(c => c.id !== pick.c.id);
        acc.banishAdds.push(pick.c);
        banished++;
      }
      acc.lines.push('黑潮吞噬：' + banished + ' 张永久放逐（累计上限 ' + BANISH_CAP + '）');
      break;
    }
    case 'hope_bang': {
      // 希望！：中弹概率重置；离场者全部复活（从弃牌区取16张）并立即接受一次惩罚
      acc.rouletteShift = 0;
      acc.rouletteShotsReset = true;
      const deadPs = acc.players.filter(p => !p.alive);
      if (!deadPs.length) {
        acc.lines.push('希望！：中弹概率已重置，无人离场');
        break;
      }
      const revivedNames = [];
      const takenAll = new Set(); // 跨复活者累计已取走的牌，防止重复发放
      deadPs.forEach(p => {
        const pool = [...(ctx.discardPile || []), ...acc.discardAdds].filter(c => !takenAll.has(c.id));
        let cards = shuffle([...pool]).slice(0, 16);
        if (cards.length < 16) {
          // 弃牌区不足（守恒下不会发生），防御性补新牌
          const extra = shuffle(createDeck(ctx.round || 1, acc.cardSeq, ctx.difficulty)).slice(0, 16 - cards.length);
          acc.cardSeq += 64;
          cards = [...cards, ...extra];
        }
        cards.forEach(c => takenAll.add(c.id));
        acc.discardAdds = acc.discardAdds.filter(c => !takenAll.has(c.id));
        acc.stDiscardTake.push(...cards.map(c => c.id));
        acc.players[p.id] = { ...p, alive: true, hand: cards.slice(0, 8), library: cards.slice(8, 16) };
        revivedNames.push(p.name);
      });
      const diedAgain = [];
      revivedNames.forEach(name => {
        const p = acc.players.find(x => x.name === name);
        if (p && rouletteHit(1, ctx.difficulty, false, ctx.frenzy, ctx.rouletteShift || 0)) {
          acc.discardAdds.push(...p.hand, ...(p.library || []));
          acc.players[p.id] = { ...p, alive: false, hand: [], library: [] };
          diedAgain.push(p.name);
        }
      });
      acc.lines.push('希望！：' + revivedNames.join('、') + ' 复活' + (diedAgain.length ? '，但 ' + diedAgain.join('、') + ' 复活失败出局' : '，均扛过了惩罚'));
      break;
    }
    case 'long_night': {
      // 长夜：黑潮内嵌一次 + 两回合内所有玩家看不到自己的手牌
      acc.blackoutUntil = (ctx.round ?? 0) + 2;
      applySingle({ type: 'blacktide' }, acc, base);
      acc.lines.push('长夜降临：两回合内手牌不可见');
      break;
    }
    case 'skyfall': {
      // 天崩：其余所有事件依次降临（排除厄运与自身，防递归）；
      // 中弹概率永久 +1/6；此事件本场不再出现（事件池放逐）
      EVENTS.filter(e => e.type !== 'skyfall' && e.type !== 'doom' && !e.choices).forEach(e => applySingle(e, acc, base)); //：抉择事件不进连锁
      acc.rouletteShift = (ctx.rouletteShift || 0) + 1;
      acc.exileSelf = true;
      acc.lines.push('天崩：中弹概率永久 +1/6，天崩本场不再出现');
      break;
    }
    case 'switch_dir': {
      // 转换：出牌顺序反转
      acc.reverseOrder = !base.reversed;
      acc.lines.push('转换：出牌顺序反转');
      break;
    }
  }
}

/** 长夜是否生效中 */
/** 长夜盲窗是否生效 @param {GameState} st @returns {boolean} */
function isBlackout(st) {
  return st.blackoutUntil != null && st.round < st.blackoutUntil;
}

/** 雪崩冻结的有效冻结集：只算未过期条目（st.round ≤ appliedAtRound）。
 * 无 frozenAdds 记录的条目视为已过期（正常流程不会出现，防御性口径） */
/**
 * 指定玩家当前生效中的冻结牌 id（过期自动剔除语义）
 * @param {GameState} st
 * @param {number} pid
 * @returns {string[]}
 */
function activeFrozen(st, pid) {
  const list = (st.frozen || {})[pid] || [];
  const adds = st.frozenAdds || [];
  return list.filter(cardId => {
    const rec = adds.find(f => f.playerId === pid && f.cardId === cardId);
    return rec ? st.round <= rec.appliedAtRound : false;
  });
}

/** 牌耗尽判定：所有存活玩家手牌+牌库为空；
 * 唯一持牌者是观战者时同样视为耗尽——其牌将随重发洗回，且重发正是观战解除条件
 * （否则会出现"观战者持牌+他人全空"的死锁：无人出牌→永不到达重发→观战永不解除） */
/**
 * 除 spectate 外全部玩家手牌+牌库清空（library_dealt 判定）
 * @param {Player[]} players
 * @param {number|null} [spectateId]
 * @returns {boolean}
 */
function allDepletedOf(players, spectateId) {
  const holders = players.filter(p => p.alive && ((p.hand || []).length + (p.library || []).length) > 0);
  return holders.length === 0 || (holders.length === 1 && spectateId !== null && holders[0].id === spectateId);
}

/** 合并事件效果到状态字段（四个事件触发点共用）
 * baseDiscard：事件时刻的弃牌区基数（可能被希望！复活消费，需剔除 take */
/**
 * 事件结果合并进状态（弃牌/放逐/冻结/观战/黑潮/概率平移等切片统一入口）
 * @param {GameState} st
 * @param {EventDef} ev
 * @param {EventResult} er
 * @param {Card[]} baseDiscard
 * @returns {Partial<GameState>}
 */
function mergeEventState(st, ev, er, baseDiscard) {
  const takeIds = new Set(er.stDiscardTake || []);
  const frozen = { ...(st.frozen || {}) };
  // 雪崩冻结：累积 frozenAdds（带 appliedAtRound）以供后续 PLAY 解冻判断
  const frozenAdds = [...(st.frozenAdds || [])];
  (er.frozen || []).forEach(({ playerId, cardId, appliedAtRound }) => {
    frozen[playerId] = [...(frozen[playerId] || []), cardId];
    if (appliedAtRound !== undefined) {
      frozenAdds.push({ playerId, cardId, appliedAtRound });
    }
  });
  return {
    discardPile: [...(baseDiscard || []).filter(c => !takeIds.has(c.id)), ...(er.discardPile || [])],
    banishedPile: [...(st.banishedPile || []), ...(er.banishedPile || [])],
    frozen,
    frozenAdds,
    spectateId: er.spectateId !== null ? er.spectateId : (st.spectateId ?? null),
    spectateEnterRound: er.spectateEnterRound !== null ? er.spectateEnterRound : (st.spectateEnterRound ?? null),
    blackoutUntil: er.blackoutUntil !== null ? er.blackoutUntil : (st.blackoutUntil ?? null),
    rouletteShift: er.rouletteShift !== null ? er.rouletteShift : (st.rouletteShift || 0),
    rouletteShots: er.rouletteShotsReset ? 0 : st.rouletteShots,
    eventTally: Object.entries(er.eventTally || {}).reduce((m, [k, v]) => { m[k] = (m[k] || 0) + v; return m; }, { ...(st.eventTally || {}) }),
    floodLoss: Object.entries(er.floodLoss || {}).reduce((m, [k, v]) => { m[k] = (m[k] || 0) + v; return m; }, { ...(st.floodLoss || {}) }),
    eventExile: er.exileSelf && !(st.eventExile || []).includes(ev.type) ? [...(st.eventExile || []), ev.type] : (st.eventExile || []),
    eventResult: er.eventResult || null,
    cardSeq: er.cardSeq ?? (st.cardSeq || 0),
  };
}

/**
 * C2：抉择事件效果体（choice.apply 的展开形式，原语与 applySingle 一致）
 * 由 applySingle 头部的 choices 分支调用；curId = 抉择者
 */
/** @param {EventDef} ev @param {EventChoiceDef} choice @param {any} acc @param {{ curId: number, targetSuit: TargetSuit, reversed: boolean, ctx?: any }} base */
function applyChoiceEffect(ev, choice, acc, base) {
  const { ctx } = base;
  const pid = base.curId;
  const self = acc.players[pid];
  const others = acc.players.filter(p => p.alive && p.id !== pid);
  const randOther = () => others.length ? others[Math.floor(Math.random() * others.length)] : null;

  // 局部原语（与 applySingle 内同名原语一致；牌库不足从本局新入弃牌区补，仍不足少摸）
  function drawCards(target, n) {
    const p = acc.players[target];
    if (!p || !p.alive || n <= 0) return;
    let got = 0;
    while (got < n && (p.library || []).length) { const c = p.library.pop(); if (c) { p.hand.push(c); got++; } }
    while (got < n && acc.discardAdds.length) { const c = acc.discardAdds.pop(); if (c) { p.hand.push(c); got++; } }
    if (got > 0) acc.lines.push(p.name + ' 摸了 ' + got + ' 张牌');
  }
  function discardRandom(target, n) {
    const p = acc.players[target];
    if (!p || !p.alive || !p.hand.length) return;
    const k = Math.min(n, p.hand.length);
    const shuffled = shuffle([...p.hand]);
    acc.discardAdds.push(...shuffled.slice(0, k));
    p.hand = shuffled.slice(k);
    if (k > 0) acc.lines.push(p.name + ' 弃了 ' + k + ' 张手牌');
  }
  function pullTrigger(target, why) {
    const p = acc.players[target];
    if (!p || !p.alive) return;
    if (rouletteHit(1, ctx.difficulty, false, ctx.frenzy, ctx.rouletteShift || 0)) {
      acc.discardAdds.push(...p.hand, ...(p.library || []));
      acc.players[target] = { ...p, alive: false, hand: [], library: [] };
      acc.lines.push(why + '：' + p.name + ' 中弹出局');
    } else {
      acc.lines.push(why + '：' + p.name + ' 扣下扳机，空枪');
    }
  }
  function banishRandom(n, why) {
    let done = 0;
    for (let i = 0; i < n; i++) {
      if ((ctx.banishedCount || 0) + acc.banishAdds.length >= 15) break;
      const cands = acc.players.filter(pp => pp.alive && pp.hand.length);
      if (!cands.length) break;
      const p = cands[Math.floor(Math.random() * cands.length)];
      const c = p.hand[Math.floor(Math.random() * p.hand.length)];
      p.hand = p.hand.filter(x => x.id !== c.id);
      acc.banishAdds.push(c);
      done++;
    }
    if (done > 0) acc.lines.push(why + '：' + done + ' 张牌被放逐');
  }

  switch (ev.type + ':' + choice.id) {
    case 'dice_game:bet': {
      // 骰子桌·押一把：50% 全场对手各弃 2 张 / 50% 自己弃 4 张
      if (Math.random() < 0.5) {
        acc.lines.push('骰子停在你押的一面——全场对手遭殃');
        others.forEach(o => discardRandom(o.id, 2));
      } else {
        acc.lines.push('骰子背叛了你');
        discardRandom(pid, 4);
      }
      break;
    }
    case 'dice_game:leave': {
      acc.lines.push(self.name + ' 离开了骰子桌');
      drawCards(pid, 1);
      break;
    }
    case 'black_market:buy': {
      // 黑市·买情报：弃 2 张，从黑市（本局新入弃牌区）翻 2 张回手
      discardRandom(pid, 2);
      let got = 0;
      while (got < 2 && acc.discardAdds.length) {
        const c = acc.discardAdds.pop();
        if (c) { acc.players[pid].hand.push(c); got++; }
      }
      if (got > 0) acc.lines.push('黑市翻出 ' + got + ' 张来路不明的牌到 ' + self.name + ' 手中');
      break;
    }
    case 'black_market:sell': {
      // 黑市·卖情报：随机对手摸 2，自己摸 3
      const buyer = randOther();
      if (buyer) drawCards(buyer.id, 2);
      drawCards(pid, 3);
      break;
    }
    case 'sheriff:report': {
      // 治安官·举报：随机对手立即一次轮盘
      const t = randOther();
      if (t) pullTrigger(t.id, '治安官执法');
      else acc.lines.push('无人可执法');
      break;
    }
    case 'sheriff:calm': {
      // 治安官·息事宁人：全场中弹概率重置
      acc.rouletteShotsReset = true;
      acc.lines.push('全场中弹概率重置回 1/6');
      break;
    }
    case 'tornado:protect': {
      // 龙卷风·护牌：自己弃 2，全场随机 3 张放逐
      discardRandom(pid, 2);
      banishRandom(3, '风暴掠过');
      break;
    }
    case 'tornado:gamble': {
      // 龙卷风·乘风：自己摸 2，全场中弹概率永久 +1
      drawCards(pid, 2);
      acc.rouletteShift = (ctx.rouletteShift || 0) + 1;
      acc.lines.push('全场中弹概率永久 +1');
      break;
    }
    case 'duel:fight': {
      // 决斗·应战：自己与随机对手各开一枪
      const foe = randOther();
      if (foe) {
        pullTrigger(pid, '决斗');
        pullTrigger(foe.id, '决斗');
      } else {
        acc.lines.push('无人应战，决斗作罢');
      }
      break;
    }
    case 'duel:yield': {
      // 决斗·认怂：自己弃 3，对手摸 1
      discardRandom(pid, 3);
      const foe = randOther();
      if (foe) drawCards(foe.id, 1);
      break;
    }
    case 'treasure:dig': {
      // 藏宝图·挖宝：50% 摸 4 / 50% 自己 3 张放逐
      if (Math.random() < 0.5) {
        acc.lines.push('铲子碰到了硬物——宝藏！');
        drawCards(pid, 4);
      } else {
        acc.lines.push('挖出了不该挖的东西');
        const p = acc.players[pid];
        let done = 0;
        while (done < 3 && p.hand.length && (ctx.banishedCount || 0) + acc.banishAdds.length < 15) {
          const c = p.hand[Math.floor(Math.random() * p.hand.length)];
          p.hand = p.hand.filter(x => x.id !== c.id);
          acc.banishAdds.push(c);
          done++;
        }
        if (done > 0) acc.lines.push(self.name + ' 的 ' + done + ' 张手牌被放逐');
      }
      break;
    }
    case 'treasure:sell': {
      // 藏宝图·卖图：全场存活各摸 1
      acc.players.filter(pp => pp.alive).forEach(pp => drawCards(pp.id, 1));
      break;
    }
    default:
      acc.lines.push('未知抉择：' + ev.type + ':' + choice.id);
  }
}

/** 事件后存活检查：≤1 人存活则直接终局（蘑菇云/希望！的即时惩罚可能团灭） */
/** B2：画像记录——出牌者诚实/吹牌（引擎权威 isHonest 判定） */
function bumpKnownPlay(st, pid, honest) {
  const ks = { ...(st.knownStats || {}) };
  const cur = ks[pid] || { bluffs: 0, honest: 0, challenges: 0 };
  ks[pid] = { ...cur, bluffs: cur.bluffs + (honest ? 0 : 1), honest: cur.honest + (honest ? 1 : 0) };
  return ks;
}
/** B2：画像记录——质疑行为计数 */
function bumpKnownChallenge(st, cid) {
  const ks = { ...(st.knownStats || {}) };
  const cur = ks[cid] || { bluffs: 0, honest: 0, challenges: 0 };
  ks[cid] = { ...cur, challenges: cur.challenges + 1 };
  return ks;
}

/**
 * 事件全灭收尾：alive<=1 → endGame('eventWipe')；否则返回 null 由调用方继续
 * @param {GameState} st
 * @param {EventDef} ev
 * @param {EventResult} er
 * @param {Partial<GameState>} extraBase
 * @returns {GameState|null}
 */
function eventWipeCheck(st, ev, er, extraBase) {
  const alive = er.players.filter(p => p.alive);
  if (alive.length > 1) return null;
  return endGame(st, !!alive[0]?.isHuman, alive[0] ?? null, 'eventWipe', {
    ...extraBase,
    players: er.players,
    event: ev,
    tableCards: [],
    lastClaim: null,
    challengeResult: null,
    challengerId: null,
  });
}

// ── 辅助函数（reducer 内部使用） ────────────────────────────────────

/** 增加玩家统计计数 */
/**
 * 不可变递增 playerStats[pid][field]
 * @param {GameState} st
 * @param {number} pid
 * @param {'playCount'|'challengeCount'|'shotCount'} field
 * @returns {Record<number, PlayerStats>}
 */
function incStat(st, pid, field) {
  const pstat = { ...st.playerStats };
  const s = pstat[pid] ?? { playCount: 0, challengeCount: 0, shotCount: 0 };
  pstat[pid] = { ...s, [field]: s[field] + 1 };
  return pstat;
}

/** 结束游戏，更新全局战绩 */
// 实际语义 = 单局吹牌成功数达到 max(2, 存活数) 即胜（v84 外审#2 复核：达标即终局，单局上限=阈值本身）。
// 序列化值不可改——已持久化在对局历史/回放码中，旧存档兼容依赖该字符串。
const WIN_REASON_BLUFF = 'bluff5';
/**
 * 终局收尾（唯一出口）：stats 累计 + 终态字段后置（extra 不得覆盖 phase/winner/winReason）
 * @param {GameState} st
 * @param {boolean} won
 * @param {Player|null} winner
 * @param {WinReason} winReason
 * @param {Partial<GameState>} [extra]
 * @returns {GameState}
 */
function endGame(st, won, winner, winReason, extra = {}) {
  const ns = { ...st.stats };
  ns.totalGames++;
  if (won) {
    ns.wins++;
    ns.currentWinStreak++;
    if (ns.currentWinStreak > ns.maxWinStreak) ns.maxWinStreak = ns.currentWinStreak;
  } else {
    ns.losses++;
    ns.currentWinStreak = 0;
  }
  saveStats(ns);
  return {
    ...st,
    ...extra,
    phase: won ? 'won' : 'lost',
    winner,
    stats: ns,
    winReason,
  };
}

/** 轮盘中弹判定（修复：拆分时此函数被遗漏，reducer 调用处会 ReferenceError）
 * shot=已开枪次数, diff=难度, doubleRisk=双倍风险, frenzy=狂热模式 */
/** A1：角色初始化——不重复分配 + 一次性技能余量置 1 */
function makeRoleInit(n) {
  const roles = assignRoles(n);
  const skillCharges = {};
  const skillCd = {};
  for (let i = 0; i < n; i++) {
    const rid = roles[i];
    if (!rid) continue;
    skillCharges[i] = ONCE_ROLE_IDS.has(rid) ? { [rid]: 1 } : {};
    skillCd[i] = {};
  }
  return { roles, skillCharges, skillCd };
}

/**
 * 轮盘中弹判定：prob = min(shot×(难度系数), 上限)/6，doubleRisk ×2，狂化上限 6，shift 平移
 * @param {number} shot 已开枪次数
 * @param {'easy'|'normal'|'hard'} diff
 * @param {boolean} doubleRisk 恶魔牌
 * @param {boolean} frenzy
 * @param {number} shift 天崩累计加值（0~5）
 * @returns {boolean} true=中弹
 */
function rouletteHit(shot, diff = 'normal', doubleRisk = false, frenzy = false, shift = 0) {
  let base = shot * (diff === 'hard' ? 2 : 1);
  if (frenzy) base *= 2;
  let prob = Math.min(base, frenzy ? 6 : 5) / 6;
  if (doubleRisk) prob = Math.min(prob * 2, frenzy ? 1 : 5 / 6);
  if (shift) prob = Math.min(prob + shift / 6, 1); // 天崩：中弹概率永久平移加值
  return Math.random() < prob;
}

/** 轮盘结束后重置通用字段，并返回新的状态 */
/**
 * 轮盘结束后的通用收尾：重置轮盘期临时字段并按 dead/事件挂接推进
 * @param {GameState} st
 * @param {Player[]} ps
 * @param {Record<number, PlayerStats>} pstat
 * @param {number} nxt
 * @param {boolean} dead
 * @param {boolean} usedImmunity
 * @param {Partial<GameState>} [extra]
 * @returns {GameState}
 */
function afterRoulette(st, ps, pstat, nxt, dead, usedImmunity, extra = {}) {
  /** @type {Partial<GameState>} */
  const base = {
    players: ps,
    playerStats: pstat,
    curPlayer: nxt,
    rouletteResult: dead ? 'dead' : 'safe',
    tableCards: [],
    lastClaim: null,
    challengeResult: null,
    challengerId: null,
    peekedCards: [],
    immuneId: usedImmunity ? null : st.immuneId,
    challengeShield: false,
    skipId: null,
    rouletteShots: dead ? 0 : (st.incrementalRoulette ? (st.doubleRisk ? st.rouletteShots + 1 : st.rouletteShots) : 0),
    doubleRisk: false,
  };
  return { ...st, ...base, ...extra };
}

// ── 初始状态 ──────────────────────────────────────────────────────────

/** @type {GameState} */
const INIT = {
  phase: 'idle',
  players: makePlayers(),
  targetSuit: 'A',
  curPlayer: 0,
  fatigueActive: false,
  tableCards: [],
  lastClaim: null,
  round: 0,
  challengeResult: null,
  challengerId: null,
  rouletteResult: null,
  rouletteShots: 0,
  winner: null,
  stats: loadStats(),
  event: null,
  reversed: false,
  skipId: null,
  immuneId: null,
  doubleRisk: false,
  challengeShield: false,
  peekCard: null,
  difficulty: 'normal',
  incrementalRoulette: false,
  autoSortHand: false,
  playerStats: {},
  targetChangeCount: 0,
  winReason: null,
  peekedCards: [],
  frenzy: false,
  stains: [],
  revived: false,
  discardPile: [],
  cardSeq: 0,
  banishedPile: [],
  frozen: {},
  frozenAdds: [],
  eventTally: {},
  floodLoss: {},
  maxPlay: 5,          // F3：出牌张数上限（1~5，START 可配）
  // A1 角色系统：roles 角色映射 / skillCharges 一次性技能余量 /
  // skillCd 冷却技能上次发动轮次 / roundBuffUntil 酒保 buff 截止轮 / peekReveal 读心者偷看（瞬态）
  roles: {},
  skillCharges: {},
  skillCd: {},
  roundBuffUntil: 0,
  peekReveal: null,
  lastSkill: null,
  // B2 对手画像：{pid:{bluffs,honest,challenges}}——引擎按真实诚实度记录，联机不广播给客户端
  knownStats: {},
  lastCaughtPid: null, // B1：上一次被抓的骗子 pid（REVEAL_COMPLETE 持久记录，供 AI 局势感知）
  spectateId: null,
  spectateEnterRound: null,
  blackoutUntil: null,
  rouletteShift: 0,
  eventExile: [],
  specialUsers: [],
  eventResult: null,
  eventChoice: null, // C2：待抉择事件 { eventId, chooserId, chooserName }（选完清 null）
};

// ── 核心 Reducer ─────────────────────────────────────────────────────

// 提取：出牌转移（PLAY / AI_PLAY 共用）——上限钳制、冻结过滤、画像与统计在此统一维护，
// 此前为 52 行双拷贝，历史上 A1/F3/B2 类改动均需双改，属一致性隐患源
/**
 * 出牌转移（PLAY / AI_PLAY 共用）：上限钳制 → 冻结过滤 → 画像与统计 → 推进
 * @param {GameState} st
 * @param {number} pid
 * @param {Card[]} cardsIn
 * @returns {GameState}
 */
function applyPlay(st, pid, cardsIn) {
  const cp = st.players.find(p => p.id === pid);
  if (!cp) return st; // PLAY 原无此守卫只对 AI_PLAY 缺失——统一补齐（act.pid 非法时原会 TypeError）
  // F3：出牌张数上限（防御性钳制，UI/AI 层已拦截；联机两端跑同一 reducer 保持一致）。A1：含酒保 buff
  const capped = (cardsIn || []).slice(0, effMaxPlay(st));
  // 冻结牌不可出（防御性过滤，UI/AI 层已拦截）；已过期的冻结不再拦截
  const frozenIds = new Set(activeFrozen(st, pid));
  const played = capped.filter(c => !frozenIds.has(c.id));
  if (!played.length) return st;
  const playedIds = new Set(played.map(c => c.id));
  const updatedCp = refill({ ...cp, hand: cp.hand.filter(c => !playedIds.has(c.id)) });
  // 特殊牌使用追踪（激发事件的判定依据）
  const usedSpecial = played.some(c => c.mod === 'angel' || c.mod === 'demon');
  const specialUsers = usedSpecial ? [...new Set([...(st.specialUsers || []), pid])] : (st.specialUsers || []);
  // B2：出牌者画像——诚实记 honest、吹牌记 bluffs（联机端此字段被剥离）
  const knownNext = bumpKnownPlay(st, pid, isHonest(played, st.targetSuit, st.frenzy));
  // 雪崩冻结：出牌后仅保留未过期的冻结（activeFrozen 统一口径）
  const frozenNext = { ...(st.frozen || {}) };
  frozenNext[pid] = activeFrozen(st, pid);
  if (!frozenNext[pid].length) delete frozenNext[pid];
  const ps = st.players.map(p => (p.id === pid ? updatedCp : p));
  const nid = nextAlive(pid, ps, st.reversed);
  const pstat = incStat(st, pid, 'playCount');
  const base = {
    players: ps,
    playerStats: pstat,
    tableCards: played,
    peekedCards: [],
    lastClaim: { playerId: pid, count: played.length, suit: st.targetSuit },
    specialUsers,
    knownStats: knownNext,
    frozen: frozenNext,
  };
  if (allDepletedOf(ps, st.spectateId)) return { ...st, phase: 'library_dealt', ...base };
  return { ...st, phase: 'challenge_phase', curPlayer: nid, ...base };
}

// 提取：质疑平息后的"让过推进"（CONTINUE / RECONSIDER-continue 共用）——
// bluff 胜判定、冻结清理、观战排除、空手牌跳转在此统一维护。
// 此前两处口径不一致：RECONSIDER 缺冻结清理（全冻结玩家需多绕一圈 SKIP_TURN）、
// CONTINUE 用并列检查（观战者落中时不查新落点是否空手，靠自动让过 effect 兜底）——重构后统一为跳一步口径
/**
 * 质疑平息后的让过推进（CONTINUE / RECONSIDER-continue 共用）：
 * bluff 胜判定、雪崩冻结保留、观战排除、空手跳转统一在此维护
 * @param {GameState} st
 * @param {Player[]} playersIn
 * @returns {GameState}
 */
function advanceAfterChallenge(st, playersIn) {
  const fromPid = st.lastClaim?.playerId ?? st.curPlayer;
  let players = playersIn;
  let winByBluff = null;
  // bluff 胜阈值：按存活人数动态调整（4人=4, 3人=3, 2人=2，最少 2）
  const bluffTarget = Math.max(2, players.filter(p => p.alive).length);
  if (st.lastClaim && st.tableCards.length > 0 && !isHonest(st.tableCards, st.targetSuit, st.frenzy)) {
    players = players.map(p => {
      if (p.id !== fromPid) return p;
      const cnt = (p.bluffSuccessCount || 0) + 1;
      if (cnt >= bluffTarget) winByBluff = { ...p, bluffSuccessCount: cnt };
      return { ...p, bluffSuccessCount: cnt };
    });
  }
  if (winByBluff) {
    return endGame(st, winByBluff.isHuman, winByBluff, WIN_REASON_BLUFF, {
      players,
      playerStats: { ...st.playerStats },
      tableCards: [],
      lastClaim: null,
      peekedCards: [],
      challengerId: null,
      discardPile: sweepDiscard(st),
    });
  }
  // 雪崩冻结：让过≠出牌，未过期冻结保留到下一轮；仅清除已过期条目。
  // 例外：该玩家手牌被有效冻结全覆盖时全解冻——防止"无牌可出→让过→冻结仍在"的软锁死（与 UI 自动让过 effect 联动）
  const frozenC = { ...(st.frozen || {}) };
  if (frozenC[fromPid]) {
    const fzActive = activeFrozen(st, fromPid);
    if (fzActive.length) {
      const fromP = players.find(p => p.id === fromPid);
      const activeSet = new Set(fzActive);
      const playable = (fromP?.hand || []).filter(c => !activeSet.has(c.id)).length;
      if (playable === 0) delete frozenC[fromPid];
      else frozenC[fromPid] = fzActive;
    } else delete frozenC[fromPid];
  }
  const base = {
    players,
    tableCards: [],
    lastClaim: null,
    peekedCards: [],
    challengerId: null,
    frozen: frozenC,
    discardPile: sweepDiscard(st),
  };
  // 落点起点：CONTINUE 场景 challengerId 恒为 null（无人质疑）→ 回退到出牌者，其下家即原口径；
  // RECONSIDER 场景 challengerId 为质疑者（质疑不成立后维持继续），其下家与原口径等价
  let nid = nextAlive(st.challengerId ?? fromPid, players, st.reversed);
  //：落点排除观战者（否则观战者被落中→SKIP_SPECTATE 绕一圈+toast 噪声）
  if (st.spectateId !== null && nid === st.spectateId) nid = nextAlive(nid, players, st.reversed);
  const np = players.find(p => p.id === nid);
  if (!np) return st;
  if ((np.hand || []).length === 0 && (np.library || []).length === 0) {
    if (allDepletedOf(players, st.spectateId)) return { ...st, phase: 'library_dealt', curPlayer: nid, ...base };
    const skipId = nextAlive(nid, players, st.reversed);
    const skipP = players.find(p => p.id === skipId);
    return { ...st, phase: skipP?.isHuman ? 'player_turn' : 'ai_turn', curPlayer: skipId, ...base };
  }
  return { ...st, phase: np.isHuman ? 'player_turn' : 'ai_turn', curPlayer: nid, ...base };
}

// 提取：模糊质疑判定（CHALLENGE 无特定指定 / RECONSIDER 继续质疑 共用）
// challengeShield（守卫盾）生效时视作诚实
/**
 * 模糊质疑判定（CHALLENGE 无指定 / RECONSIDER 继续质疑共用）；守卫盾视作诚实
 * @param {GameState} st
 * @returns {{ honest: boolean, doubleRisk: boolean }} honest=质疑失败；doubleRisk=恶魔反噬连开两枪
 */
function fuzzyVerdict(st) {
  const honest = st.challengeShield ? true : isHonest(st.tableCards, st.targetSuit, st.frenzy);
  const demonFlag = hasDemon(st.tableCards);
  return { honest, doubleRisk: (demonFlag && honest) ? true : st.doubleRisk };
}

/**
 * 核心 Reducer：唯一状态转移入口（纯函数，联机两端跑同一份保持一致）
 * @param {GameState} st 当前状态（浅不可变约定：分支内均返回新对象或原引用）
 * @param {Action} act 动作（判别联合，见 types/game.d.ts）
 * @returns {GameState} 新状态；非法动作原引用弹回（调用方须比较引用判断是否生效）
 */
function reducer(st, act) {
  switch (act.type) {
    case 'START': {
      const ps = makePlayers(act.aiConfigs, act.selectedAIs, act.mpPlayers);
      const roleInit = makeRoleInit(ps.length); // A1：不重复随机分配
      const dealt = dealAll(ps, act.difficulty, 1, 0);
      const ev = pickEvent();
      const startChooser = randAlive(dealt.players);
      if (ev.choices) {
        return {
          ...INIT,
          phase: 'event',
          players: dealt.players,
          ...roleInit,
          event: ev,
          targetSuit: 'A',
          reversed: false,
          eventChoice: pendingChoice(ev, startChooser, dealt.players).eventChoice,
          cardSeq: dealt.cardSeq,
          stats: st.stats,
          difficulty: act.difficulty,
          incrementalRoulette: act.incrementalRoulette ?? false,
          autoSortHand: act.autoSortHand ?? false,
          maxPlay: Math.max(1, Math.min(5, act.maxPlay ?? 5)),
          playerStats: {},
        };
      }
      const er = applyEvent(ev, dealt.players, startChooser, 'A', false, dealt.cardSeq, {
        difficulty: act.difficulty, frenzy: false, round: 0,
        banishedCount: 0, specialUsers: [], rouletteShift: 0, discardPile: [],
      });
      const merged = mergeEventState(INIT, ev, er, []);
      const wipe = eventWipeCheck(st, ev, er, { ...merged, stats: st.stats });
      if (wipe) return wipe;
      return {
        ...INIT,
        phase: 'event',
        players: er.players,
        ...roleInit,
        event: er.event || ev,
        targetSuit: er.targetSuit ?? 'A',
        reversed: er.reverseOrder ?? false,
        ...merged,
        stats: st.stats,
        difficulty: act.difficulty,
        incrementalRoulette: act.incrementalRoulette ?? false,
        autoSortHand: act.autoSortHand ?? false,
        maxPlay: Math.max(1, Math.min(5, act.maxPlay ?? 5)),
        playerStats: {},
      };
    }

    case 'EVENT_CHOICE': {
      // 玩家/AI 对抉择事件做出选择，执行对应分支并走事件收尾
      // 权限校验（仅 chooser 可选）在联机广播层；引擎层信任合法 dispatch
      if (!st.eventChoice || st.phase !== 'event' || st.eventResult) return st;
      const cEv = EVENTS.find(e => e.type === st.eventChoice.eventId);
      const cCh = cEv && cEv.choices && cEv.choices.find(c => c.id === act.choiceId);
      if (!cCh) return st;
      const cEr = applyEvent(cEv, st.players, st.eventChoice.chooserId, st.targetSuit, st.reversed, st.cardSeq || 0, {
        difficulty: st.difficulty, frenzy: st.frenzy, round: st.round,
        banishedCount: (st.banishedPile || []).length,
        specialUsers: st.specialUsers, rouletteShift: st.rouletteShift,
        discardPile: st.discardPile || [],
        choiceId: act.choiceId,
      });
      const cSwept = sweepDiscard(st);
      const cMerged = mergeEventState(st, cEv, cEr, cSwept);
      // 决斗双全灭时游戏永不结束 → 后续 nextAlive 空池 TypeError（947 局崩溃根因）
      const cWipe = eventWipeCheck(st, cEv, cEr, cMerged);
      if (cWipe) return cWipe;
      return {
        ...st,
        ...cMerged,
        phase: 'event',
        event: cEv,
        players: cEr.players,
        eventChoice: null,
        targetSuit: cEr.targetSuit ?? st.targetSuit,
        reversed: cEr.reverseOrder ?? st.reversed,
        round: st.round,
      };
    }


    case 'BEGIN_DEALING': {
      // C2 防御：抉择事件未选完不允许开新一轮（防联机客户端跳过他人抉择）
      if (st.eventChoice && st.event && st.event.choices && !st.eventResult) return st;
      // 更换目标牌（确保与当前不同；A3：1/3 概率滚出双色目标）
      const newTarget = rollTarget(st.targetSuit);
      //：起始玩家排除观战者（观战者 alive 会进 randAlive 池，选中→发牌后立即 SKIP_SPECTATE 闪跳）
      const starterPool = st.spectateId !== null ? st.players.filter(p => p.alive && p.id !== st.spectateId) : st.players.filter(p => p.alive);
      const starter = randAlive(starterPool);
      return { ...st, phase: 'dealing', curPlayer: starter, targetSuit: newTarget };
    }

    case 'DEAL_COMPLETE': {
      // 观战解除：仅当回合数已越过进入回合（紧随事件的发牌不解除，用户④拍板语义）
      const releaseSpectate = st.spectateId !== null && st.round > (st.spectateEnterRound ?? -1);
      // 疲劳机制：第5回合起，手牌上限10张，超出部分弃入弃牌区
      let players = st.players;
      let discardPile = [...(st.discardPile || [])];
      if (st.round >= 5) {
        players = players.map(p => {
          if (p.alive && p.hand.length > 10) {
            const shuffled = shuffle([...p.hand]);
            discardPile.push(...shuffled.slice(10));
            return { ...p, hand: shuffled.slice(0, 10) };
          }
          return p;
        });
      }
      // 复活机制：出局后下一次目标牌变化时，若只有一人出局且未触发过复活，
      // 从弃牌区洗牌抽 16 张复活（守恒：牌不再凭空产生）
      let didRevive = false;
      let pstatR = st.playerStats;
      let cardSeq = st.cardSeq || 0;
      if (!st.revived) {
        const deadPlayers = players.filter(p => !p.alive);
        if (deadPlayers.length === 1) {
          const deadP = deadPlayers[0];
          const pool = shuffle([...discardPile]);
          let reviveCards = pool.slice(0, 16);
          if (reviveCards.length < 16) {
            // 弃牌区不足16张（守恒下不会发生），补新牌
            const extra = shuffle(createDeck(st.round, cardSeq, st.difficulty)).slice(0, 16 - reviveCards.length);
            cardSeq += 64;
            reviveCards = [...reviveCards, ...extra];
          }
          const reviveHand = reviveCards.slice(0, 8);
          const reviveLib = reviveCards.slice(8, 16);
          discardPile = pool.slice(16);
          players = players.map(p =>
            p.id === deadP.id
              ? {
                  ...p,
                  alive: true,
                  hand: reviveHand,
                  library: reviveLib,
                  survivedCount: p.survivedCount || 0,
                  bluffSuccessCount: p.bluffSuccessCount || 0,
                }
              : p
          );
          didRevive = true;
          // 复活计数（成就判定：希望重燃）
          const sR = pstatR[deadP.id] ?? { playCount: 0, challengeCount: 0, shotCount: 0 };
          pstatR = { ...pstatR, [deadP.id]: { ...sR, revived: (sR.revived || 0) + 1 } };
        }
      }
      const sp = players.find(p => p.id === st.curPlayer);
      const finalPlayer = sp?.alive ? sp : players.find(p => p.alive);
      const newTCC = st.targetChangeCount + 1;
      // 每轮增加1-2个酒渍
      const wineStains = Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => makeStain('wine'));
      const base = {
        players,
        event: null,
        lastClaim: null,
        challengeResult: null,
        challengerId: null,
        rouletteResult: null,
        skipId: null,
        challengeShield: false,
        peekCard: null,
        targetChangeCount: newTCC,
        fatigueActive: st.round >= 5,
        frenzy: st.frenzy || st.round >= (8 - (4 - players.filter(p => p.alive).length) * 2),
        stains: [...st.stains, ...wineStains],
        revived: st.revived || didRevive,
        playerStats: pstatR,
        discardPile,
        cardSeq,
        spectateId: releaseSpectate ? null : st.spectateId,
        spectateEnterRound: releaseSpectate ? null : st.spectateEnterRound,
      };
      // 平局条件：5次目标牌变化后无人出局
      if (newTCC >= 5 && players.every(p => p.alive)) {
        const ns = { ...st.stats };
        ns.totalGames++;
        saveStats(ns);
        return { ...st, ...base, phase: 'draw', stats: ns, winReason: 'draw' };
      }
      return {
        ...st,
        ...base,
        phase: finalPlayer?.isHuman ? 'player_turn' : 'ai_turn',
        curPlayer: finalPlayer?.id ?? 0,
        isRedeal: false,
      };
    }

    case 'LIBRARY_REDEAL': {
      // 牌守恒重发：弃牌区 + 桌面残余 + 全部玩家手牌扫入牌池，再洗牌发给存活玩家。
      // 正常重发时活人手牌全空（无影响）；"唯一持牌者是观战者"的捷径重发时，
      // 其手牌也由此回到牌池，避免凭空消失
      const pool = [
        ...(st.discardPile || []),
        ...(st.tableCards || []),
        ...st.players
          .flatMap(p => [...(p.hand || []), ...(p.library || [])]),
      ];
      const dealt = dealAll(st.players, st.difficulty, st.round + 1, st.cardSeq || 0, pool);
      // 放逐区已满时，黑潮事件整体从抽签池排除
      const eventExclude = [
        ...(st.eventExile || []),
        ...(((st.banishedPile || []).length >= 15) ? ['blacktide'] : []),
      ];
      const ev = pickEvent(eventExclude);
      const redealChooser = randAlive(dealt.players);
      if (ev.choices) {
        return {
          ...st,
          phase: 'event',
          curPlayer: redealChooser,
          players: dealt.players,
          event: ev,
          cardSeq: dealt.cardSeq,
          targetSuit: rollTarget(st.targetSuit),
          reversed: st.reversed,
          eventChoice: pendingChoice(ev, redealChooser, dealt.players).eventChoice,
          // 重发后冻结失效（同自然事件路径）；桌面牌已入重发牌池，必须清空（守恒）
          frozen: {},
          frozenAdds: [],
          discardPile: dealt.leftover,
          tableCards: [],
          lastClaim: null,
        };
      }
      const er = applyEvent(ev, dealt.players, redealChooser, st.targetSuit, st.reversed, dealt.cardSeq, {
        difficulty: st.difficulty, frenzy: st.frenzy, round: st.round + 1,
        banishedCount: (st.banishedPile || []).length,
        specialUsers: st.specialUsers, rouletteShift: st.rouletteShift,
        discardPile: dealt.leftover,
      });
      const merged = mergeEventState(st, ev, er, dealt.leftover);
      const wipe = eventWipeCheck(st, ev, er, { ...merged, round: st.round + 1, playerStats: { ...st.playerStats } });
      if (wipe) return wipe;
      const redealStarter = randAlive(er.players);
      return {
        ...st,
        phase: 'event',
        curPlayer: redealStarter,
        players: er.players,
        event: er.event || ev,
        targetSuit: rollTarget(st.targetSuit), // A3：1/3 概率双色
        reversed: er.reverseOrder ?? st.reversed,
        ...merged,
        // 重发后手牌全部换新：旧冻结失效，只保留本次事件新产生的冻结
        frozen: (er.frozen || []).reduce((m, f) => {
          m[f.playerId] = [...(m[f.playerId] || []), f.cardId];
          return m;
        }, {}),
        frozenAdds: (er.frozen || []).filter(f => f.appliedAtRound !== undefined).map(f => ({ playerId: f.playerId, cardId: f.cardId, appliedAtRound: f.appliedAtRound })),
        tableCards: [],
        lastClaim: null,
        challengeResult: null,
        challengerId: null,
        rouletteResult: null,
        round: st.round + 1,
        isRedeal: true,
      };
    }

    case 'SKILL_USE': {
      // A1：主动技能发动。引擎层信任合法 dispatch；权限校验在 UI/联机广播层
      const chk = skillAvailable(st, act.pid);
      if (!chk.ok) return st;
      const res = applySkill(st, act.pid);
      if (!res.effect) return st;
      return { ...res.st, lastSkill: { pid: act.pid, roleId: res.effect.roleId, round: st.round, kind: res.effect.kind } };
    }

    case 'PLAY': {
      const cp = st.players.find(p => p.id === st.curPlayer);
      if (!cp) return st;
      // ids → 手牌卡对象映射（只接受手牌内 id）；上限钳制/冻结过滤/画像统计统一走 applyPlay
      return applyPlay(st, cp.id, (act.ids || []).map(id => cp.hand.find(c => c.id === id)).filter(Boolean));
    }

    case 'AI_PLAY':
      return applyPlay(st, act.pid, act.cards);

    case 'CONTINUE':
      //：让过推进统一走 advanceAfterChallenge（含 bluff 胜、冻结清理、观战排除、空手跳转）
      // 落点起点说明：CONTINUE 派发时 challengerId 恒为 null（无人质疑/事件继续/空手让过）→ 回退到出牌者口径
      return advanceAfterChallenge(st, st.players);

    case 'CHALLENGE': {
      if (!st.lastClaim) return st;
      const pstat = incStat(st, act.cid, 'challengeCount');
      if (st.tableCards.length > 2) {
        return { ...st, phase: 'peek_phase', challengerId: act.cid, playerStats: pstat, peekedCards: [], knownStats: bumpKnownChallenge(st, act.cid) };
      }
      // 模糊判定（ 统一走 fuzzyVerdict）
      const v = fuzzyVerdict(st);
      return {
        ...st,
        phase: 'reveal',
        challengeResult: v.honest ? 'honest' : 'lied',
        challengerId: act.cid,
        doubleRisk: v.doubleRisk,
        playerStats: pstat,
        knownStats: bumpKnownChallenge(st, act.cid),
      };
    }

    case 'PEEK_REVEAL': {
      const maxPeek = Math.min(3, st.tableCards.length - 1);
      const ids = (act.ids || []).slice(0, maxPeek);
      const peeked = st.tableCards.filter(c => ids.includes(c.id));
      if (peeked.length >= 1) {
        return { ...st, phase: 'reconsider_phase', peekedCards: peeked };
      }
      // 选择"不展示"：直接进入重新考虑阶段
      return { ...st, phase: 'reconsider_phase', peekedCards: [] };
    }

    case 'RECONSIDER': {
      if (act.decision === 'continue') {
        //：让过推进统一走 advanceAfterChallenge（含 bluff 胜、冻结清理、观战排除、空手跳转）
        return advanceAfterChallenge(st, st.players);
      }
      // 继续质疑（模糊判定统一走 fuzzyVerdict）
      const v = fuzzyVerdict(st);
      return {
        ...st,
        phase: 'reveal',
        challengeResult: v.honest ? 'honest' : 'lied',
        doubleRisk: v.doubleRisk,
        peekedCards: [],
      };
    }

    case 'REVEAL_COMPLETE': {
      if (!st.lastClaim) return st;
      const wasHonest = st.challengeResult === 'honest';
      const cid = st.challengerId ?? st.curPlayer;
      const angel = hasAngel(st.tableCards);
      const demon = hasDemon(st.tableCards);
      let punished, dblExtra = false;
      if (!wasHonest && angel) punished = cid;
      else if (wasHonest && demon) { punished = cid; dblExtra = true; }
      else punished = wasHonest ? cid : st.lastClaim.playerId;
      // A1 赏金猎人被动：质疑成功（对方确是吹牌且自己不是恶魔牌反噬）→ 吹牌计数 +1
      const bountyBonus = !wasHonest && punished === st.lastClaim.playerId
        && roleOf(st, cid) === 'bounty' ? 1 : 0;
      const bountyPlayers = bountyBonus
        ? st.players.map(p => p.id === cid ? { ...p, bluffSuccessCount: (p.bluffSuccessCount || 0) + 1 } : p)
        : st.players;
      const shots = st.rouletteShots + 1;
      const hit = rouletteHit(shots, st.difficulty, st.doubleRisk || dblExtra, st.frenzy, st.rouletteShift || 0);
      return {
        ...st,
        players: bountyPlayers,
        lastCaughtPid: !wasHonest ? (st.lastClaim?.playerId ?? null) : null,
        phase: 'roulette',
        rouletteResult: hit ? 'dead' : 'safe',
        rouletteShots: shots,
        doubleRisk: dblExtra || st.doubleRisk,
        curPlayer: punished,
        ...(bountyBonus ? { lastSkill: { pid: cid, roleId: 'bounty', round: st.round, kind: 'bountyBonus' } } : {}),
      };
    }

    case 'ROULETTE': {
      const dead = act.dead;
      const tid = st.curPlayer;
      const usedImmunity = dead && st.immuneId === tid;
      // A1 天使被动：轮盘死亡时自动免死一次（消耗 skillCharges）。
      // 调平（模拟 500 局 +10.6% 独强）：庇佑需要献祭——必须弃 1 张手牌入放逐区，手牌为空则庇佑失效。
      const guardianTid = dead && !usedImmunity && roleOf(st, tid) === 'guardian'
        && (chargeOf(st, tid, 'guardian') || 0) > 0 ? tid : null;
      const guardianHand = guardianTid !== null ? (st.players[tid].hand || []) : [];
      const guardianSave = guardianTid !== null && guardianHand.length > 0;
      // 免死不计 survivedCount：献祭已付 1 张牌代价，再送存活进度属双重收益（v80 平衡数据 +7.2% 语义不变）。
      // 随机献祭 1 张手牌（含目标牌也可能被献，代价真实）——先只计算，统一走公共尾部。
      const sacrifice = guardianSave ? guardianHand[Math.floor(Math.random() * guardianHand.length)] : null;
      const effectiveDead = dead && !guardianSave;
      const newBanished = guardianSave ? [...(st.banishedPile || []), sacrifice] : (st.banishedPile || []);
      const guardianExtra = guardianSave ? {
        banishedPile: newBanished,
        skillCharges: consumeCharge(st, tid, 'guardian'),
        lastSkill: { pid: tid, roleId: 'guardian', round: st.round, kind: 'autoSave' },
      } : {};
      const bloodStains = (effectiveDead && !usedImmunity)
        ? Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => makeStain('blood'))
        : [];
      const newStains = [...st.stains, ...bloodStains];
      let surviveWinner = null;
      // 出局者余牌扫入弃牌区（牌守恒）
      const sweptFromDead = [];
      const ps = st.players.map(p => {
        if (p.id !== tid) return p;
        if (guardianSave) return { ...p, hand: p.hand.filter(c => c.id !== sacrifice.id) };
        if (dead) {
          if (st.immuneId === p.id) return p;
          sweptFromDead.push(...(p.hand || []), ...(p.library || []));
          return { ...p, alive: false, hand: [], library: [] };
        }
        const sc = (p.survivedCount || 0) + 1;
        if (sc >= 3) surviveWinner = { ...p, survivedCount: sc };
        return { ...p, survivedCount: sc };
      });
      const deadSweep = { discardPile: sweepDiscard(st, sweptFromDead) };
      // 3次轮盘存活 → 胜利
      if (surviveWinner) {
        return endGame(st, surviveWinner.isHuman, surviveWinner, 'survive3', {
          players: ps,
          rouletteResult: 'safe',
          playerStats: { ...st.playerStats },
          immuneId: usedImmunity ? null : st.immuneId,
          challengeShield: false,
          skipId: null,
          rouletteShots: 0,
          tableCards: [],
          lastClaim: null,
          challengeResult: null,
          challengerId: null,
          stains: newStains,
          ...deadSweep,
        });
      }
      const alive = ps.filter(p => p.alive);
      if (alive.length <= 1) {
        const won = alive.some(p => p.isHuman);
        const pst = effectiveDead ? incStat(st, tid, 'shotCount') : { ...st.playerStats };
        return endGame(st, won, alive[0] ?? null, 'lastStand', {
          players: ps,
          rouletteResult: dead ? 'dead' : 'safe',
          playerStats: pst,
          immuneId: usedImmunity ? null : st.immuneId,
          challengeShield: false,
          skipId: null,
          rouletteShots: 0,
          tableCards: [],
          lastClaim: null,
          challengeResult: null,
          challengerId: null,
          stains: newStains,
          ...deadSweep,
        });
      }
      // 继续游戏
      const chalId = st.challengerId;
      let nxt = chalId != null ? nextAlive(chalId, ps, st.reversed) : nextAlive(tid, ps, st.reversed);
      //：轮盘后落点排除观战者（观战者 alive 会被 nextAlive 选中，落中→SKIP_SPECTATE 绕行）
      if (st.spectateId !== null && nxt === st.spectateId) nxt = nextAlive(nxt, ps, st.reversed);
      const pst = effectiveDead ? incStat(st, tid, 'shotCount') : { ...st.playerStats };
      const allDepleted = allDepletedOf(alive, st.spectateId);
      if (allDepleted) {
        return afterRoulette(st, ps, pst, nxt, effectiveDead, usedImmunity, { phase: 'library_dealt', stains: newStains, ...deadSweep, ...guardianExtra });
      }
      const np = ps.find(p => p.id === nxt);
      const newRound = st.round + 1;
      if (newRound % 3 === 0) {
        const ev = pickEvent(st.eventExile || []);
        // 抉择事件挂起——不立即执行，等待 chooser（当前回合玩家）选择
        if (ev.choices) {
          // 守恒：挂起态也要把桌面牌 + 死者余牌扫入弃牌区（与正常路径的 swept 同源）
          const sweptPend = sweepDiscard(st, sweptFromDead);
          return afterRoulette(st, ps, pst, nxt, effectiveDead, usedImmunity, {
            phase: 'event',
            event: ev,
            round: newRound,
            stains: newStains,
            discardPile: sweptPend,
            ...pendingChoice(ev, nxt, ps),
            ...guardianExtra,
          });
        }
        const swept = sweepDiscard(st, sweptFromDead);
        const er = applyEvent(ev, ps, nxt, st.targetSuit, st.reversed, st.cardSeq || 0, {
          difficulty: st.difficulty, frenzy: st.frenzy, round: newRound,
          banishedCount: newBanished.length,
          specialUsers: st.specialUsers, rouletteShift: st.rouletteShift,
          discardPile: swept,
        });
        const merged = mergeEventState(st, ev, er, swept);
        const wipe = eventWipeCheck(st, ev, er, { ...merged, round: newRound, stains: newStains, playerStats: pst, rouletteResult: effectiveDead ? 'dead' : 'safe' });
        if (wipe) return wipe;
        return afterRoulette(st, er.players, pst, nxt, effectiveDead, usedImmunity, {
          phase: 'event',
          event: er.event || ev,
          round: newRound,
          stains: newStains,
          targetSuit: er.targetSuit ?? st.targetSuit,
          reversed: er.reverseOrder ?? st.reversed,
          ...merged,
          ...guardianExtra,
        });
      }
      return afterRoulette(st, ps, pst, nxt, effectiveDead, usedImmunity, {
        phase: np?.isHuman ? 'player_turn' : 'ai_turn',
        round: newRound,
        event: null,
        eventResult: null,
        stains: newStains,
        ...deadSweep,
        ...guardianExtra,
      });
    }

    case 'SKIP_TURN': {
      if (st.skipId === null) return st;
      const nid = nextAlive(st.skipId, st.players, st.reversed);
      const np = st.players.find(p => p.id === nid);
      // 被跳过≠行动：仅清除已过期的冻结，未过期冻结保留到下一轮
      const frozenSk = { ...(st.frozen || {}) };
      if (frozenSk[st.skipId]) {
        frozenSk[st.skipId] = activeFrozen(st, st.skipId);
        if (!frozenSk[st.skipId].length) delete frozenSk[st.skipId];
      }
      return {
        ...st,
        phase: np?.isHuman ? 'player_turn' : 'ai_turn',
        curPlayer: nid,
        tableCards: [],
        lastClaim: null,
        skipId: null,
        frozen: frozenSk,
        discardPile: sweepDiscard(st),
      };
    }

    case 'SKIP_SPECTATE': {
      // 观战者回合直接跳过（观战状态保持，直到下次发牌解除）
      if (st.spectateId === null) return st;
      const nid = nextAlive(st.spectateId, st.players, st.reversed);
      const np = st.players.find(p => p.id === nid);
      // 被跳过≠行动：仅清除已过期的冻结，未过期冻结保留到下一轮
      const frozenSp = { ...(st.frozen || {}) };
      if (frozenSp[st.spectateId]) {
        frozenSp[st.spectateId] = activeFrozen(st, st.spectateId);
        if (!frozenSp[st.spectateId].length) delete frozenSp[st.spectateId];
      }
      return {
        ...st,
        phase: np?.isHuman ? 'player_turn' : 'ai_turn',
        curPlayer: nid,
        tableCards: [],
        lastClaim: null,
        frozen: frozenSp,
        discardPile: sweepDiscard(st),
      };
    }

    case 'RESTART': {
      const ps = makePlayers();
      const roleInit = makeRoleInit(ps.length); // A1：不重复随机分配
      const dealt = dealAll(ps, st.difficulty, 1, 0);
      const ev = pickEvent();
      const rsChooser = randAlive(dealt.players);
      if (ev.choices) {
        return {
          ...INIT,
          phase: 'event',
          players: dealt.players,
          ...roleInit,
          event: ev,
          targetSuit: 'A',
          reversed: false,
          eventChoice: pendingChoice(ev, rsChooser, dealt.players).eventChoice,
          stats: st.stats,
          difficulty: st.difficulty,
          incrementalRoulette: st.incrementalRoulette,
          autoSortHand: st.autoSortHand,
          playerStats: {},
        };
      }
      const er = applyEvent(ev, dealt.players, rsChooser, 'A', false, dealt.cardSeq, {
        difficulty: st.difficulty, frenzy: false, round: 0,
        banishedCount: 0, specialUsers: [], rouletteShift: 0, discardPile: [],
      });
      const merged = mergeEventState(INIT, ev, er, []);
      const wipe = eventWipeCheck(st, ev, er, { ...merged, stats: st.stats });
      if (wipe) return wipe;
      return {
        ...INIT,
        phase: 'event',
        players: er.players,
        ...roleInit,
        event: er.event || ev,
        targetSuit: er.targetSuit ?? 'A',
        reversed: er.reverseOrder ?? false,
        ...merged,
        stats: st.stats,
        difficulty: st.difficulty,
        incrementalRoulette: st.incrementalRoulette,
        autoSortHand: st.autoSortHand,
        playerStats: {},
      };
    }

    default:
      return st;
  }
}

// ── 包装 Reducer（含网络同步 + 空手补牌兜底） ──────────────────

/**
 * 在原始 reducer 基础上增加：
 * 1. 处理 SYNC_STATE（联机状态同步）
 * 2. 进入回合时，为"手牌为空但牌库有牌"的玩家自动补牌（修复第9处bug）
 */
/**
 * reducer 包装：事件后手牌清空但牌库有牌时自动补牌（外层兜底）
 * @param {GameState} st
 * @param {Action} act
 * @returns {GameState}
 */
function wrappedReducer(st, act) {
  if (act.type === 'SYNC_STATE') {
    // v106：联机状态基础结构校验（竞品防御思路）——坏包直接丢弃保留当前状态，
    // 防伪造/异常 state 让渲染层崩盘；深字段仍信任房主（威胁模型=传输损坏而非恶意房主）。
    const s = act.state;
    if (!s || typeof s !== 'object') return st;
    if (typeof s.phase !== 'string' || !Array.isArray(s.players) || !s.players.length) return st;
    if (!s.players.every(p => p && typeof p === 'object' && Array.isArray(p.hand))) return st;
    return s;
  }
  if (act.type === 'PLAYER_LEFT') {
    // v106：断线超时自动离席（竞品 forfeit 思路）。被动出局：不走轮盘/免疫/血渍路径，
    // 余牌（手牌+牌库）扫入弃牌堆保牌守恒；活人≤1 直接收官；不清理 tableCards（他人的待质疑牌仍有效）。
    const pid = act.pid;
    const victim = st.players[pid];
    if (!victim || !victim.alive || !victim.isHuman || victim.isLocal) return st;
    const swept = [...(victim.hand || []), ...(victim.library || [])];
    const ps = st.players.map(p => p.id === pid ? { ...p, alive: false, hand: [], library: [] } : p);
    const alive = ps.filter(p => p.alive);
    const discardSweep = { discardPile: [...(st.discardPile || []), ...swept] };
    if (alive.length <= 1) {
      const won = alive.some(p => p.isHuman);
      return endGame(st, won, alive[0] ?? null, 'lastStand', {
        players: ps,
        rouletteResult: 'safe',
        playerStats: { ...st.playerStats },
        immuneId: null,
        challengeShield: false,
        skipId: null,
        rouletteShots: 0,
        tableCards: [],
        lastClaim: null,
        challengeResult: null,
        challengerId: null,
        stains: st.stains,
        ...discardSweep,
      });
    }
    const ns2 = { ...st, players: ps, ...discardSweep };
    // 若离席者正处于回合阻塞点，转给下一活人（phase 保持由调用方后续动作驱动）
    if ((st.phase === 'player_turn' || st.phase === 'ai_turn') && st.curPlayer === pid) {
      let nxt = nextAlive(pid, ps, st.reversed);
      if (st.spectateId !== null && nxt === st.spectateId) nxt = nextAlive(nxt, ps, st.reversed);
      ns2.curPlayer = nxt;
    }
    return ns2;
  }
  const ns = reducer(st, act);
  if (ns.phase === 'player_turn' || ns.phase === 'ai_turn') {
    let changed = false;
    const players = ns.players.map(p => {
      if (p.alive && p.hand.length === 0 && (p.library || []).length > 0) {
        changed = true;
        return refill({ ...p });
      }
      return p;
    });
    if (changed) return { ...ns, players };
  }
  return ns;
}

// ── 中途退出惩罚（从 50-components.js 迁入，属游戏规则） ─────────────

/**
 * 生成客户端可见状态切片（P2）：广播与重连快照的唯一剥离出口
 * · M1 私有剥离：specialUsers 全剥；immuneId/frozen/frozenAdds 仅保留本机玩家条目
 * · B2 画像隐藏：knownStats 清空；弃牌区/放逐区仅房主权威持有
 * v99 变更：F2 迷雾移除（v89 取消精确质疑后张数失去博弈意义，质疑期桌牌与声称张数对全部视角可见）
 * @param {GameState} s
 * @param {number} viewerId 客户端玩家位
 * @returns {GameState}
 */
function toPublicState(s, viewerId) {
  return {
    ...s,
    specialUsers: [],
    immuneId: s.immuneId === viewerId ? s.immuneId : null,
    frozen: s.frozen && s.frozen[viewerId] ? { [viewerId]: s.frozen[viewerId] } : {},
    frozenAdds: (s.frozenAdds || []).filter(f => f.playerId === viewerId),
    peekCard: viewerId === s.curPlayer ? s.peekCard : null,
    peekedCards: viewerId === s.challengerId ? s.peekedCards : [],
    peekReveal: s.peekReveal && s.peekReveal.readerId === viewerId ? s.peekReveal : null,
    tableCards: s.tableCards,
    lastClaim: s.lastClaim,
    lastSkill: s.lastSkill || null,
    knownStats: {},
    discardPile: [],
    banishedPile: [],
    players: s.players.map((p, i) => {
      if (i === viewerId) {
        const mine = { ...p, isLocal: true };
        if (isBlackout(s)) {
          // 长夜：客户端也拿不到自己手牌内容（只留 id 与数量用于盲选）
          mine.hand = mine.hand.map(c => ({ id: c.id, suit: '?', mod: 'normal' }));
        }
        return mine;
      }
      return { ...p, hand: [], handCount: p.hand.length, library: [], libraryCount: p.library.length, isLocal: false };
    }),
  };
}

/**
 * 中途退出信誉惩罚（对局阶段越关键扣越多）
 * @param {GameState|null} st
 * @returns {number} 0~50
 */
function calcQuitPenalty(st) {
  if (!st || st.phase === 'idle') return 0;
  let penalty = 10;
  if (st.phase === 'roulette' || st.phase === 'reveal') penalty += 15;
  else if (st.phase === 'dealing') penalty += 5;
  if (st.round >= 3) penalty += 5;
  if (st.round >= 6) penalty += 5;
  // curPlayer 是出牌者，challengerId 是质疑者；二者之一等于本机玩家 + 处于操作阶段 → +10
  const me = st.players.find(p => p.isLocal);
  const actionPhases = new Set(['player_turn', 'challenge_phase', 'peek_phase', 'reconsider_phase']);
  if (me) {
    const isMyActionTurn = actionPhases.has(st.phase) && (st.curPlayer === me.id || st.challengerId === me.id);
    if (isMyActionTurn) penalty += 10;
  }
  const alive = st.players.filter(p => p.alive).length;
  if (alive <= 2) penalty += 10;
  else if (alive <= 3) penalty += 5;
  return Math.min(penalty, 50);
}

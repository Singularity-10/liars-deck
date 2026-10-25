// @ts-nocheck
/**
 * 45-stats-charts.js — D2 战绩深化：对局历史 / ELO 分 / 折线图 / 雷达图
 * 依赖：00-constants.js（无强依赖，仅约定 localStorage 键）
 * 对外暴露：MATCH_HISTORY_KEY, ELO_BASE, ELO_PER_DIFF, loadMatchHistory,
 * saveMatchHistory, recordMatch, calcElo, LineChart, RadarChart
 */

// ── 历史记录存储 ────────────────────────────────────────────────────
const MATCH_HISTORY_KEY = 'ld_match_history_v1';
const ELO_BASE = 1000;
const ELO_K = 32;
// 难度折算的"对手等级"：新手弱于玩家，困难强于玩家
const ELO_PER_DIFF = { easy: 900, normal: 1000, hard: 1150 };

function loadMatchHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(MATCH_HISTORY_KEY));
    if (!raw || !Array.isArray(raw.matches)) return { matches: [], elo: ELO_BASE };
    return { matches: raw.matches, elo: typeof raw.elo === 'number' ? raw.elo : ELO_BASE };
  } catch {
    return { matches: [], elo: ELO_BASE };
  }
}

function saveMatchHistory(h) {
  try { localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(h)); } catch {}
}

/**
 * 记录一局对局（终局时调用；联机仅房主）
 * @param {object} m - { difficulty, result('win'|'loss'|'draw'), rounds, winReason,
 * players:[{name,alive,playCount,challengeCount,shotCount,bluffSuccessCount}],
 * myRevived }
 * @returns {object} 更新后的历史（含新 elo）
 */
function recordMatch(m) {
  const h = loadMatchHistory();
  const eloBefore = h.elo;
  const eloAfter = calcElo(eloBefore, m.difficulty, m.result);
  h.matches.unshift({
    ts: Date.now(), difficulty: m.difficulty, result: m.result,
    rounds: m.rounds || 0, winReason: m.winReason || null,
    eloBefore, eloAfter,
    players: (m.players || []).map(p => ({
      name: p.name, alive: !!p.alive,
      playCount: p.playCount || 0, challengeCount: p.challengeCount || 0,
      shotCount: p.shotCount || 0, bluffSuccessCount: p.bluffSuccessCount || 0,
    })),
    myRevived: !!m.myRevived,
  });
  if (h.matches.length > 100) h.matches = h.matches.slice(0, 100);
  h.elo = eloAfter;
  saveMatchHistory(h);
  return h;
}

/** ELO：新分 = 旧分 + K × (实际得分 − 期望得分)；平局 S=0.5 */
function calcElo(mine, difficulty, result) {
  const opp = ELO_PER_DIFF[difficulty] ?? ELO_BASE;
  const expected = 1 / (1 + Math.pow(10, (opp - mine) / 400));
  const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  return Math.round(mine + ELO_K * (score - expected));
}

// ── 折线图：最近 N 局 ELO 曲线（SVG） ──────────────────────────────
function LineChart({ matches, width = 320, height = 150 }) {
  const list = matches.slice(0, 20).reverse().map(m => m.eloAfter); // 旧→新
  const padL = 34, padR = 10, padT = 14, padB = 20;
  const W = width, H = height;
  const iw = W - padL - padR, ih = H - padT - padB;
  if (list.length === 0) {
    return h('div', { style: { fontSize: 11, color: 'hsl(0 8% 40%)', textAlign: 'center', padding: '30px 0' } }, '暂无对局记录');
  }
  const lo = Math.min(ELO_BASE - 40, Math.min(...list) - 24);
  const hi = Math.max(ELO_BASE + 40, Math.max(...list) + 24);
  const x = i => padL + (list.length === 1 ? iw / 2 : (i / (list.length - 1)) * iw);
  const y = v => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const pts = list.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  // 网格：基准 1000 + 顶/底
  const baseY = ELO_BASE >= lo && ELO_BASE <= hi ? y(ELO_BASE) : null;
  const grid = [lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.75].map((v, i) =>
    h('line', { key: 'g' + i, x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: 'hsl(0 10% 20%)', strokeWidth: 1, strokeDasharray: '3,4' })
  );
  return h('div', null,
    h('svg', { width: '100%', viewBox: '0 0 ' + W + ' ' + H },
      // 基准线 1000
      baseY !== null && h('line', { x1: padL, x2: W - padR, y1: baseY, y2: baseY, stroke: 'hsl(42 60% 40%)', strokeWidth: 1, strokeDasharray: '5,4', opacity: 0.7 }),
      baseY !== null && h('text', { x: 4, y: baseY + 3, fontSize: 8, fill: 'hsl(42 60% 45%)' }, '1000'),
      ...grid,
      // 折线
      h('polyline', { points: pts, fill: 'none', stroke: 'var(--c-accent)', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
      // 数据点：胜金/负红/平灰
      ...list.map((v, i) => {
        const m = matches.slice(0, 20).reverse()[i];
        const c = m.result === 'win' ? 'hsl(142 72% 50%)' : m.result === 'draw' ? 'hsl(0 8% 55%)' : 'hsl(0 72% 55%)';
        return h('circle', { key: i, cx: x(i), cy: y(v), r: 3, fill: c, stroke: 'hsl(0 10% 8%)', strokeWidth: 1 });
      }),
      // 两端标签
      h('text', { x: padL, y: H - 6, fontSize: 9, fill: 'hsl(0 8% 40%)' }, '20局前'),
      h('text', { x: W - padR, y: H - 6, fontSize: 9, fill: 'hsl(0 8% 40%)', textAnchor: 'end' }, '最新'),
      h('text', { x: 4, y: padT + 4, fontSize: 8, fill: 'hsl(0 8% 40%)' }, Math.round(hi)),
    ),
    h('div', { style: { display: 'flex', justifyContent: 'center', gap: 14, fontSize: 10, marginTop: 4 } },
      h('span', { style: { color: 'hsl(142 72% 50%)' } }, '● 胜'),
      h('span', { style: { color: 'hsl(0 72% 55%)' } }, '● 负'),
      h('span', { style: { color: 'hsl(0 8% 55%)' } }, '● 平'),
    ),
  );
}

// ── 雷达图：五维（出牌/质疑/中枪/撒谎/复活，最近 N 局均值） ────────
/**
 * @param {object} agg - { play, challenge, shot, bluff, revive } 各维度 0~1 归一值
 * @param {object} raw - 各维度原始数值（显示用）
 */
function RadarChart({ agg, raw, width = 240, height = 210 }) {
  const dims = ['play', 'challenge', 'shot', 'bluff', 'revive'];
  const labels = ['出牌', '质疑', '中枪', '撒谎', '复活'];
  const cx = width / 2, cy = height / 2 + 4, R = Math.min(width, height) / 2 - 32;
  const angle = i => -Math.PI / 2 + (i / dims.length) * Math.PI * 2;
  const pt = (i, r) => (cx + Math.cos(angle(i)) * r).toFixed(1) + ',' + (cy + Math.sin(angle(i)) * r).toFixed(1);
  // 三圈网格 + 轴线
  const rings = [1 / 3, 2 / 3, 1].map((r, k) =>
    h('polygon', { key: 'r' + k, points: dims.map((_, i) => pt(i, R * r)).join(' '), fill: 'none', stroke: 'hsl(0 10% 20%)', strokeWidth: 1 })
  );
  const axes = dims.map((_, i) =>
    h('line', { key: 'a' + i, x1: cx, y1: cy, x2: cx + Math.cos(angle(i)) * R, y2: cy + Math.sin(angle(i)) * R, stroke: 'hsl(0 10% 20%)', strokeWidth: 1 })
  );
  const labelsEl = labels.map((lb, i) => {
    const lx = cx + Math.cos(angle(i)) * (R + 14), ly = cy + Math.sin(angle(i)) * (R + 14);
    return h('text', { key: 'l' + i, x: lx, y: ly + 3, fontSize: 10, fill: 'hsl(0 8% 68%)', textAnchor: 'middle' }, lb);
  });
  const hasData = dims.some(d => (agg[d] || 0) > 0);
  const poly = hasData ? [h('polygon', {
    points: dims.map((d, i) => pt(i, R * Math.max(0.04, agg[d] || 0))).join(' '),
    fill: 'hsla(42 85% 55% / 0.25)', stroke: 'var(--c-accent)', strokeWidth: 2, strokeLinejoin: 'round',
  })] : [];
  const dots = hasData ? dims.map((d, i) =>
    h('circle', { key: 'd' + i, cx: cx + Math.cos(angle(i)) * R * Math.max(0.04, agg[d] || 0), cy: cy + Math.sin(angle(i)) * R * Math.max(0.04, agg[d] || 0), r: 2.5, fill: 'hsl(42 85% 65%)' })
  ) : [];
  return h('div', null,
    h('svg', { width: '100%', viewBox: '0 0 ' + width + ' ' + height }, ...rings, ...axes, ...poly, ...dots, ...labelsEl),
    h('div', { style: { display: 'flex', justifyContent: 'center', gap: 10, fontSize: 10, flexWrap: 'wrap' } },
      labels.map((lb, i) => h('span', { key: i, style: { color: 'hsl(0 8% 55%)' } }, lb + ' ' + (raw ? raw[dims[i]] : '—'))),
    ),
  );
}

/** 汇总最近 N 局的五维数据（雷达图数据源）
 * 返回 { agg:{play,challenge,shot,bluff,revive 0~1}, raw:{...原始均值} }
 */
function aggregateDims(matches, n = 20) {
  const list = matches.slice(0, n);
  if (list.length === 0) return { agg: { play: 0, challenge: 0, shot: 0, bluff: 0, revive: 0 }, raw: { play: 0, challenge: 0, shot: 0, bluff: 0, revive: 0 } };
  // 各局取"我"的数据：单机 p0；联机房主视角同样取 isLocal 玩家（历史记录时已固化为第一项）
  const sum = { play: 0, challenge: 0, shot: 0, bluff: 0, revive: 0 };
  list.forEach(m => {
    const me = (m.players && m.players[0]) || {};
    sum.play += me.playCount || 0;
    sum.challenge += me.challengeCount || 0;
    sum.shot += me.shotCount || 0;
    sum.bluff += me.bluffSuccessCount || 0;
    sum.revive += m.myRevived ? 1 : 0;
  });
  const avg = k => sum[k] / list.length;
  // 归一基准：出牌/质疑/中枪按局均 6 次满格；撒谎 1.5 次满格；复活 5 局 1 次满格（ revive 均值×5 ）
  const agg = {
    play: Math.min(1, avg('play') / 6),
    challenge: Math.min(1, avg('challenge') / 3),
    shot: Math.min(1, avg('shot') / 6),
    bluff: Math.min(1, avg('bluff') / 1.5),
    revive: Math.min(1, avg('revive') * 5),
  };
  return { agg, raw: { play: avg('play').toFixed(1), challenge: avg('challenge').toFixed(1), shot: avg('shot').toFixed(1), bluff: avg('bluff').toFixed(1), revive: sum.revive + '次' } };
}

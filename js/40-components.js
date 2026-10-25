// @ts-nocheck
/**
 * 40-components.js — 主界面与基础设施组件层
 * 职责：纯 UI 层——除 Game 外的所有 React 组件 + 音频/主题等界面基础设施
 * （用户账户服务已迁至 10-utils.js；calcQuitPenalty 已迁至 20-engine.js）
 * 依赖：00-constants.js, 10-utils.js, 20-engine.js, 30-ai.js
 * 对外暴露：ToastBox, Card, DealingAnimation, TavernAudio, useTavernAmbience,
 * AuthModal, MainMenu, Lobby, PlayerHand, ErrorBoundary, RussianRoulette
 * 注：Game 组件已拆出至 50-game.js（~1100 行，依赖本文件上述全部声明，
 * 必须在本文件之后加载）
 */

// ── React 解构 ──────────────────────────────────────────────────────
const { useState, useEffect, useRef, useCallback, useMemo, useReducer, memo,
        createElement: h, Fragment } = React;
const { createRoot } = ReactDOM;

// ── Toast 组件（覆盖 10-utils.js 中的同名定义） ──────────────────
function ToastBox() {
  const [list, set] = useState([]);
  useEffect(() => {
    // 订阅 toast 系统（_tSubs 来自 10-utils.js）
    _tSubs.add(set);
    return () => _tSubs.delete(set);
  }, []);
  return h(
    'div',
    { className: 'toast-box' },
    list.map(t =>
      h('div', { key: t.id, className: `toast-item ${t.type}` }, t.msg)
    )
  );
}

// ── 定时器 Hook ─────────────────────────────────────────────────────
function useTimer({ active, paused, isHuman, duration, onTimeout }) {
  const [left, setLeft] = useState(0);
  const ivRef = useRef(null), cntRef = useRef(0), cbRef = useRef(onTimeout);
  cbRef.current = onTimeout;
  const clear = useCallback(() => { if (ivRef.current) { clearInterval(ivRef.current); ivRef.current = null; } }, []);
  useEffect(() => clear, [clear]);
  useEffect(() => {
    clear();
    if (!active || paused || !isHuman || duration <= 0) { setLeft(0); cntRef.current = 0; return; }
    cntRef.current = duration;
    setLeft(duration);
    ivRef.current = setInterval(() => {
      cntRef.current--;
      setLeft(cntRef.current);
      if (cntRef.current <= 0) { clear(); cbRef.current(); }
    }, 1000);
    return clear;
  }, [active, paused, isHuman, duration, clear]);
  return left;
}

// ── 牌面组件 ────────────────────────────────────────────────────────
const PAPER_NOISE =
  `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`;

// 牌面纹样映射：rank → Icon 签名纹章
const RANK_CREST = { A: 'AceGem', K: 'KingCrest', Q: 'QueenCrest', J: 'JackCrest' };
const Card = memo(function ({ card, selected, disabled, onClick, faceDown, small, style: extraStyle, frenzy = false, frozen = false }) {
  const w = small ? 48 : 60,
    ht = small ? 70 : 88;
  const borderColor = frozen ? 'hsl(200 85% 70%)' : (card ? (SUIT_BORDER[card.suit] || '#888') : '#888');
  const modInfo = card ? (MOD_GLOW[card.mod] || MOD_GLOW.normal) : MOD_GLOW.normal;
  if (faceDown || !card) {
    // 修复：长夜中自己的手牌也是卡背（faceDown），卡背必须可选可点——补 onClick + 选中高亮（原卡背纯装饰无交互，导致长夜无法选牌）
    return h('div', {
      className: 'card-back' + (selected ? ' selected' : ''), // 主题专属卡背（背景/边框走 CSS 类，随主题切换）
      style: Object.assign({
        width: w,
        height: ht,
        borderRadius: 8,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: selected ? '2px solid var(--c-danger)' : undefined,
        boxShadow: selected
          ? '0 0 0 2px var(--c-danger), 0 8px 20px rgba(180,30,30,0.3)'
          : '0 2px 8px rgba(0,0,0,0.3)',
        transform: selected ? 'translateY(-10px)' : undefined,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.2s',
      }, extraStyle),
      onClick: disabled ? undefined : onClick,
    },
      h('div', { style: { position: 'absolute', inset: 3, borderRadius: 5, border: '1px solid var(--c-panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        h('span', { style: { color: 'var(--c-accent)', opacity: 0.4, fontSize: small ? 14 : 18, textShadow: '0 0 8px rgba(200,160,50,0.2)' } }, '♦'),
      )
    );
  }
  const glowColor = modInfo.glow;
  const glowShadow = modInfo.shadow;
  const bgBase = 'linear-gradient(135deg,#161210,#1c1816)';
  return h('div', {
    className: `game-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`,
    style: Object.assign({
      width: w,
      height: ht,
      background: bgBase,
      backgroundImage: `${bgBase},${PAPER_NOISE}`,
      border: `2px solid ${selected ? 'var(--c-danger)' : borderColor}`,
      boxShadow: selected
        ? `0 0 0 2px var(--c-danger), 0 8px 20px rgba(180,30,30,0.3), ${glowShadow}`
        : `${glowShadow}, 0 2px 6px rgba(0,0,0,0.4)`,
      transition: 'all 0.2s',
    }, extraStyle),
    onClick: disabled ? undefined : onClick
  },
    h('span', { style: { position: 'absolute', top: 4, left: 5, fontSize: small ? 8 : 10, fontWeight: 'bold', color: SUIT_COLOR[card.suit] || '#fff', opacity: 0.8 } }, card.suit),
    // 牌面纹样：中央 rank 签名纹章替代文字（frenzy J 失效逻辑保留）
    h('span', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: (frenzy && card.suit === 'J') ? 'var(--c-text-faint)' : (SUIT_COLOR[card.suit] || '#fff'), opacity: (frenzy && card.suit === 'J') ? 0.4 : 1 } },
      h(Icon[RANK_CREST[card.suit] || 'AceGem'], { size: small ? 20 : 30 })),
    card.mod === 'angel' && h('span', { style: { position: 'absolute', bottom: 2, right: 3, color: 'hsl(190 70% 60%)', filter: 'drop-shadow(0 0 3px rgba(34,211,238,0.5))' } }, h(Icon.Angel, { size: small ? 9 : 12 })),
    card.mod === 'demon' && h('span', { style: { position: 'absolute', bottom: 2, right: 3, color: 'hsl(25 95% 60%)', filter: 'drop-shadow(0 0 3px rgba(251,146,60,0.5))' } }, h(Icon.Demon, { size: small ? 9 : 12 })),
    card.suit === 'J' && h('span', { style: { position: 'absolute', bottom: 3, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: frenzy ? 'rgba(220,38,38,0.7)' : 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textDecoration: frenzy ? 'line-through' : 'none' } }, frenzy ? '失效' : '万能'),
    // mod 卡箔金：天使冰蓝 / 恶魔暖金高光斜扫
    card.mod === 'angel' && h('div', { className: 'foil-angel', style: { '--foil-delay': (card.id.charCodeAt(card.id.length - 1) % 9) * 0.5 + 's' } }),
    card.mod === 'demon' && h('div', { className: 'foil-demon', style: { '--foil-delay': (card.id.charCodeAt(card.id.length - 1) % 9) * 0.5 + 's' } }),
    frozen && h('div', {
      style: {
        position: 'absolute', inset: 0, borderRadius: 6, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(115deg, transparent, transparent 3px, hsl(200 90% 80% / 0.14) 3px, hsl(200 90% 80% / 0.14) 5px)',
        boxShadow: 'inset 0 0 14px hsl(200 90% 70% / 0.35)',
      },
    }),
  );
});

// ── 发牌动画 ────────────────────────────────────────────────────────
function DealingAnimation({ players, onComplete }) {
  const CARDS_EACH = 16;
  const NP = players.length;
  const TOTAL = CARDS_EACH * NP;
  const DEAL_MS = 35;

  const humanIdx = players.findIndex(p => p.isLocal);
  const opponentIndices = players.map((p, i) => i).filter(i => i !== humanIdx);
  const seats = {};
  const topY = '12%';
  const topPositions = ['22%', '50%', '78%'];
  opponentIndices.forEach((pi, oi) => {
    seats[pi] = { left: topPositions[oi] || '50%', top: topY, isOpp: true };
  });
  seats[humanIdx] = { left: '50%', top: '84%', isOpp: false };

  const cardLandY = {};
  opponentIndices.forEach(pi => { cardLandY[pi] = '28%'; });
  cardLandY[humanIdx] = '68%';

  const flyVec = {};
  Object.keys(seats).forEach(pi => {
    const s = seats[pi];
    const leftPct = parseFloat(s.left);
    const topPct = parseFloat(cardLandY[pi]);
    const tx = (leftPct - 50) * 1.0;
    const ty = (topPct - 50) * 1.0;
    flyVec[pi] = { tx: `${tx}vw`, ty: `${ty}vh` };
  });

  const [flying, setFlying] = useState([]);
  const [stacks, setStacks] = useState(() => Array.from({ length: NP }, () => []));
  const [deckN, setDeckN] = useState(TOTAL);
  const [pulseKey, setPulseKey] = useState(0);
  const mounted = useRef(true);
  const done = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let idx = 0;

    const deal = () => {
      if (!mounted.current) return;
      if (idx >= TOTAL) {
        if (!done.current) { done.current = true; setTimeout(() => { if (mounted.current) onComplete(); }, 450); }
        return;
      }
      const pi = idx % NP;
      const ci = Math.floor(idx / NP);
      const vec = flyVec[pi];
      const rot = (Math.random() - 0.5) * 16;
      const ox = (Math.random() - 0.5) * 12;
      const oy = (Math.random() - 0.5) * 6;
      const id = idx;

      setFlying(p => [...p, { id, pi, tx: vec.tx, ty: vec.ty, rot, ox, oy }]);
      setDeckN(p => p - 1);
      setPulseKey(p => p + 1);

      setTimeout(() => {
        if (!mounted.current) return;
        setFlying(p => p.filter(c => c.id !== id));
        setStacks(p => {
          const n = p.map(a => [...a]);
          n[pi].push({ id, rot, ox, oy, ci });
          return n;
        });
      }, 360);

      idx++;
      setTimeout(deal, DEAL_MS);
    };

    const t0 = setTimeout(deal, 400);
    return () => { mounted.current = false; clearTimeout(t0); };
  }, []);

  const cb = {
    width: 38,
    height: 54,
    borderRadius: 5,
    position: 'absolute',
    background: 'linear-gradient(135deg,#3a1515 0%,#5a2020 50%,#3a1515 100%)',
    border: '1.5px solid rgba(200,160,50,0.28)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const cbInner = h('span', { style: { fontSize: 13, color: 'rgba(200,160,50,0.3)', pointerEvents: 'none' } }, '♦');

  const renderAvatar = (pi, seat) => {
    const p = players[pi];
    const name = p?.name || (p?.isHuman ? '你' : `对手${pi}`);
    const isHuman = p?.isHuman;
    return h('div', {
      key: 'avatar' + pi,
      style: {
        position: 'absolute',
        left: seat.left,
        top: seat.top,
        transform: 'translate(-50%,-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        zIndex: 30,
      }
    },
      h('div', {
        style: {
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: `2px solid ${isHuman ? 'var(--c-accent)' : 'var(--c-border)'}`,
          background: isHuman ? 'rgba(200,160,50,0.12)' : 'var(--c-input-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }
      },
        h('div', { style: { color: 'var(--c-accent)' } },
          aiCrest(p, 20) || h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, // 修复：发牌动画头像随所选 AI 纹章变化（原硬编码通用小人）
            h('path', { d: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2' }),
            h('circle', { cx: 12, cy: 7, r: 4 }),
          )
        )
      ),
      h('span', { style: { fontSize: 12, fontWeight: 500, color: 'var(--c-text)', textShadow: '0 1px 4px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' } }, name),
    );
  };

  // P3-7：点击任意处跳过发牌动画（done 防重入；动画组件随 onComplete 卸载）
  const skipDealing = () => {
    if (done.current) return;
    done.current = true;
    onComplete();
  };

  return h('div', { onClick: skipDealing, style: { position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.72)', overflow: 'hidden', cursor: 'pointer' } },
    ...Object.keys(seats).map(pi => renderAvatar(Number(pi), seats[pi])),
    h('div', {
      key: pulseKey,
      className: deckN > 0 ? 'deal-deck-pulse' : '',
      style: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        width: 52,
        height: 72,
        transition: 'opacity 0.3s',
        opacity: deckN > 0 ? 1 : 0.3,
        zIndex: 35,
      }
    },
      Array.from({ length: Math.min(Math.max(deckN, 0), 6) }).map((_, i) =>
        h('div', {
          key: 'dk' + i,
          style: {
            ...cb,
            left: i * 0.4,
            top: -i * 0.4,
            transform: `rotate(${(i - 3) * 1.2}deg)`,
            opacity: 1 - i * 0.06,
          }
        }, cbInner)
      ),
      h('div', {
        style: {
          position: 'absolute',
          bottom: -22,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          color: 'rgba(200,160,50,0.55)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          textShadow: '0 1px 4px rgba(0,0,0,0.7)',
        }
      }, deckN > 0 ? `剩余 ${deckN} 张` : '发牌完成'),
    ),
    flying.map(c =>
      h('div', {
        key: 'fly' + c.id,
        className: 'deal-card-fly',
        style: {
          ...cb,
          left: '50%',
          top: '50%',
          marginLeft: -19,
          marginTop: -27,
          '--dtx': c.tx,
          '--dty': c.ty,
          '--drot': `${c.rot}deg`,
          '--dox': `${c.ox}px`,
          '--doy': `${c.oy}px`,
          zIndex: 50 + c.id,
        }
      }, cbInner)
    ),
    stacks.map((stack, pi) => {
      if (stack.length === 0) return null;
      const seat = seats[pi];
      const landTop = cardLandY[pi];
      return h('div', {
        key: 'seat' + pi,
        style: {
          position: 'absolute',
          left: seat.left,
          top: landTop,
          transform: 'translateX(-50%)',
          width: 70,
          height: 60,
          zIndex: 36,
        }
      },
        stack.map((c, ci) =>
          h('div', {
            key: c.id,
            className: 'deal-card-land',
            style: {
              ...cb,
              left: `calc(50% - 19px + ${c.ox}px)`,
              top: `${c.oy - Math.min(ci, 7) * 1.5}px`,
              transform: `rotate(${c.rot}deg)`,
              zIndex: ci,
              boxShadow: `0 ${1 + ci * 0.3}px ${3 + ci}px rgba(0,0,0,${0.3 + ci * 0.03})`,
            }
          }, cbInner)
        ),
        stack.length > 0 && h('div', {
          style: {
            position: 'absolute',
            bottom: -16,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 10,
            color: 'rgba(200,160,50,0.5)',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }
        }, `${stack.length} 张`),
      );
    }),
    h('div', {
      style: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,52px)',
        fontSize: 13,
        color: 'var(--c-accent)',
        fontWeight: 600,
        letterSpacing: '0.15em',
        textShadow: '0 2px 8px rgba(0,0,0,0.8)',
        opacity: deckN > 0 ? 1 : 0,
        transition: 'opacity 0.4s',
        zIndex: 36,
      }
    }, '发牌中...'),
    // P3-7：跳过提示（点击任意处即可）
    deckN > 0 && h('div', {
      style: {
        position: 'absolute', right: 20, bottom: 18,
        padding: '8px 16px', borderRadius: 8,
        border: '1px solid rgba(200,160,50,0.4)', background: 'rgba(0,0,0,0.45)',
        fontSize: 12, color: 'rgba(200,160,50,0.9)', letterSpacing: '0.1em',
        animation: 'hint-breath 2.2s ease-in-out infinite', zIndex: 60,
      }
    }, '跳过 ▸'),
  );
}

// ── 玩家手牌组件 ────────────────────────────────────────────────────
function PlayerHand({ hand, targetSuit, onPlay, disabled, autoSort, libraryCount, frenzy = false, frozenIds, blackout = false, maxPlay = 5 }) {
  const frozen = frozenIds || new Set();
  const [sel, setSel] = useState(new Set());
  const sorted = useMemo(() => {
    if (!autoSort || blackout) return hand; // 长夜中不排序——顺序也是信息
    return [...hand].sort((a, b) => {
      const am = ((targetSuit || 'A').includes(a.suit) || a.suit === 'J') ? 0 : 1; // A3 双色目标排序
      const bm = ((targetSuit || 'A').includes(b.suit) || b.suit === 'J') ? 0 : 1;
      return am - bm;
    });
  }, [hand, targetSuit, autoSort, blackout]);
  useEffect(() => setSel(new Set()), [hand]);
  const limit = Math.max(1, Math.min(5, maxPlay || 5)); // F3：出牌张数上限
  // P3-10：超限边界反馈（计数器抖动高亮 + 被拒卡片抖动）
  const [limitFlash, setLimitFlash] = useState(0);
  const [limitHot, setLimitHot] = useState(false);
  const [shakeId, setShakeId] = useState(null);
  const hotTimer = useRef(null);
  const toggle = id => {
    if (!disabled || frozen.has(id)) return;
    setSel(prev => {
      if (prev.has(id)) { const n = new Set(prev); n.delete(id); return n; }
      if (prev.size >= limit) {
        toast.warning('已达本局出牌上限 ' + limit + ' 张，先取消一张'); // F3：超出上限禁选
        setLimitFlash(k => k + 1); setLimitHot(true);
        clearTimeout(hotTimer.current); hotTimer.current = setTimeout(() => setLimitHot(false), 900);
        setShakeId(id); setTimeout(() => setShakeId(cur => (cur === id ? null : cur)), 500);
        return prev;
      }
      const n = new Set(prev); n.add(id); return n;
    });
  };
  const play = () => { if (!sel.size) { toast.warning('请至少选一张牌'); return; } onPlay([...sel]); setSel(new Set()); };
  // D4 快捷键：接收 Game 层派发的 ld-hk 自定义事件（1~9 选牌 / Space 出牌 / Z 清选）
  useEffect(() => {
    const onHK = e => {
      const d = e.detail || {};
      if (d.k === 'toggle') {
        const card = sorted[d.i];
        if (card) toggle(card.id);
      } else if (d.k === 'play') play();
      else if (d.k === 'clear') setSel(new Set());
    };
    window.addEventListener('ld-hk', onHK);
    return () => window.removeEventListener('ld-hk', onHK);
  }, [sorted, sel, disabled, frozen, onPlay, autoSort, hand, targetSuit, blackout]);
  return h('div', { style: { padding: '12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 } },
    h('div', { style: { maxWidth: '100%', overflowX: 'auto', paddingBottom: 4 } },
      h('div', { style: { display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-start', paddingTop: 20, paddingBottom: 4, position: 'relative', paddingLeft: 8 } },
        sorted.map((c, i) => h(Card, { key: c.id, card: c, selected: sel.has(c.id), disabled: !disabled && !frozen.has(c.id), onClick: () => toggle(c.id), style: { marginLeft: i > 0 ? -22 : 0, zIndex: i + 1, animation: shakeId === c.id ? 'shake 0.3s ease' : undefined }, frenzy, frozen: frozen.has(c.id), faceDown: blackout })),
      ),
    ),
    disabled && h('button', { className: 'btn btn-primary', disabled: !sel.size, onClick: play, style: { minWidth: 120 } }, `出牌${sel.size ? ` (${sel.size}/${limit})` : ''}`),
    h('div', { style: { display: 'flex', gap: 16, alignItems: 'center', fontSize: 11 } },
      h('span', { style: { color: libraryCount === 0 ? 'hsl(0 72% 51%)' : 'var(--c-text-dim)' } }, `牌库: ${libraryCount ?? 0} 张`),
      blackout
        ? h('span', { style: { color: 'hsl(250 60% 70%)' } }, '长夜中——你看不到自己的手牌，凭感觉出牌')
        : h('span', { style: { color: 'var(--c-text-faint)' } }, '选择手牌后点击出牌 · ',
          // P3-10：超限时上限计数器抖动+红色高亮 0.9s（key 重挂载重播动画）
          h('span', { key: 'lim' + limitFlash, className: limitFlash > 0 ? 'animate-shake' : '', style: { color: limitHot ? 'hsl(0 72% 60%)' : 'var(--c-text-faint)', fontWeight: limitHot ? 700 : 400 } }, `本局最多 ${limit} 张`),
          ' · F跟牌 D质疑'),
    ),
  );
}

// ── 错误边界 ────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Game crashed:', error, info); }
  render() {
    if (this.state.error) {
      return h('div', { style: { padding: 40, color: 'hsl(0 72% 51%)', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', maxHeight: '80vh', overflow: 'auto', background: 'hsl(0 30% 3%)' } },
        h('h2', { style: { fontFamily: 'var(--font-title)', color: 'var(--c-accent)', marginBottom: 16 } }, '游戏崩溃了'),
        h('p', { style: { color: 'var(--c-text)', marginBottom: 12 } }, this.state.error.message),
        h('pre', { style: { color: 'var(--c-text-dim)', fontSize: 11 } }, this.state.error.stack),
        h('button', {
          onClick: () => { this.setState({ error: null });
            location.reload(); },
          style: { marginTop: 20, padding: '10px 20px', background: 'var(--c-danger)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }
        }, '刷新页面'),
      );
    }
    return this.props.children;
  }
}

// ── 俄罗斯轮盘动画 ──────────────────────────────────────────────────
function RussianRoulette({ playerName, isHit, shotNumber, difficulty, shift = 0, onComplete, skipPenalty = false }) {
  const [phase, setPhase] = useState('intro');
  const [cylinderAngle, setCylinderAngle] = useState(0);
  const [spinSpeed, setSpinSpeed] = useState(0);
  const mountedRef = useRef(true);
  const timersRef = useRef([]);
  const animRef = useRef(null);
  const spinStartTimeRef = useRef(0);
  const bulletPos = useRef(Math.floor(Math.random() * 6));
  const chamberAngles = [0, 60, 120, 180, 240, 300];

  const SPIN_TOTAL = 3.5;
  const ACCEL_TIME = 0.8;
  const DECEL_TIME = 1.2;
  const TOTAL_SPINS = 6;

  const targetAngle = bulletPos.current * 60;
  const finalAngle = TOTAL_SPINS * 360 + targetAngle;
  const uniformTime = SPIN_TOTAL - ACCEL_TIME - DECEL_TIME;
  const maxSpeed = finalAngle / (ACCEL_TIME * 0.5 + uniformTime + DECEL_TIME * 0.5);

  useEffect(() => {
    mountedRef.current = true;
    const t = (fn, ms) => { const id = setTimeout(fn, ms); timersRef.current.push(id); return id; };

    // v100：跳过惩罚动画——跳过亮相/转轮/击发演出，直接显示结果 0.8s
    // 结果音效（shot/safe）由对局层在 rouletteResult 变化时播放，不受此开关影响
    if (skipPenalty) {
      setPhase('result');
      t(() => { if (mountedRef.current) onComplete(); }, 800);
      return () => {
        mountedRef.current = false;
        timersRef.current.forEach(clearTimeout);
        if (animRef.current) cancelAnimationFrame(animRef.current);
      };
    }

    const updateSpin = (timestamp) => {
      if (!mountedRef.current) return;

      const elapsed = (timestamp - spinStartTimeRef.current) / 1000;

      let angle, speed;
      if (elapsed < ACCEL_TIME) {
        const progress = elapsed / ACCEL_TIME;
        speed = maxSpeed * progress;
        angle = 0.5 * maxSpeed * elapsed * progress;
      } else if (elapsed < ACCEL_TIME + uniformTime) {
        speed = maxSpeed;
        const accelAngle = 0.5 * maxSpeed * ACCEL_TIME;
        const uniformElapsed = elapsed - ACCEL_TIME;
        angle = accelAngle + maxSpeed * uniformElapsed;
      } else if (elapsed < SPIN_TOTAL) {
        const decelElapsed = elapsed - ACCEL_TIME - uniformTime;
        const progress = decelElapsed / DECEL_TIME;
        speed = maxSpeed * (1 - progress);
        const accelAngle = 0.5 * maxSpeed * ACCEL_TIME;
        const uniformAngle = maxSpeed * uniformTime;
        angle = accelAngle + uniformAngle + maxSpeed * decelElapsed * (1 - 0.5 * progress);
      } else {
        setCylinderAngle(finalAngle);
        setSpinSpeed(0);
        setPhase('firing');
        return;
      }

      setCylinderAngle(angle);
      setSpinSpeed(speed);
      animRef.current = requestAnimationFrame(updateSpin);
    };

    t(() => {
      if (mountedRef.current) {
        setPhase('spinning');
        Sfx.play('roulette'); // 扳机连滴答
        spinStartTimeRef.current = performance.now();
        animRef.current = requestAnimationFrame(updateSpin);
      }
    }, 1200);

    t(() => {
      if (!mountedRef.current) return;
      setPhase('result');
      t(() => { if (mountedRef.current) onComplete(); }, 2500);
    }, 1200 + SPIN_TOTAL * 1000 + 800);

    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const renderCylinder = () => {
    const isSpinning = phase === 'spinning';
    const speedRatio = spinSpeed / maxSpeed;
    const chamberOpacity = isSpinning ? Math.max(1 - speedRatio * 0.7, 0.3) : 1;

    const chambers = chamberAngles.map((angle, i) => {
      const isBullet = i === bulletPos.current;
      const rad = (angle - 90) * Math.PI / 180;
      const cx = 50 + 30 * Math.cos(rad);
      const cy = 50 + 30 * Math.sin(rad);
      const showBullet = (phase === 'result' || phase === 'firing') && isBullet;
      return h('g', { key: i, transform: `translate(${cx}, ${cy})`, opacity: chamberOpacity },
        h('circle', { r: 6, fill: showBullet ? '#b91c1c' : '#1a0a0a', stroke: showBullet ? '#ef4444' : '#4a1515', strokeWidth: 1.5 }),
        showBullet && h('circle', { r: 3, fill: '#fbbf24', opacity: 0.8 }),
        showBullet && h('circle', { r: 1.5, fill: '#fff', opacity: 0.6 }),
      );
    });

    const animStyle = { transform: `rotate(${cylinderAngle}deg)` };

    return h('svg', { viewBox: '0 0 100 100', width: 180, height: 180, style: animStyle },
      h('circle', { cx: 50, cy: 50, r: 44, fill: 'none', stroke: '#4a3520', strokeWidth: 3 }),
      h('circle', { cx: 50, cy: 50, r: 42, fill: '#1a0e08', stroke: '#8b6914', strokeWidth: 1 }),
      spinSpeed > 0 && h('circle', {
        cx: 50,
        cy: 50,
        r: 30,
        fill: 'none',
        stroke: 'rgba(139, 105, 20, 0.4)',
        strokeWidth: 12,
        opacity: Math.min(speedRatio * 0.7, 0.7),
      }),
      h('circle', { cx: 50, cy: 50, r: 4, fill: '#8b6914' }),
      ...chambers,
    );
  };

  const renderGun = () => {
    return h('div', { style: { position: 'relative', width: 180, height: 220, margin: '0 auto' } },
      h('div', {
        style: {
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: `12px solid ${phase === 'firing' ? '#ef4444' : '#8b6914'}`,
          transition: 'border-color 0.2s',
          filter: phase === 'firing' ? 'drop-shadow(0 0 6px rgba(239,68,68,0.8))' : 'none',
        }
      }),
      renderCylinder(),
      h('div', {
        style: {
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 12,
          height: 40,
          background: 'linear-gradient(to bottom, #4a3520, #2a1a10)',
          borderRadius: '0 0 4px 4px',
          border: '1px solid #8b6914',
        }
      }),
    );
  };

  const renderMuzzleFlash = () => {
    if (phase !== 'result' || !isHit) return null;
    return h(Fragment, null,
      h('div', {
        style: {
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,200,50,0.9) 0%, rgba(255,100,0,0.6) 30%, rgba(200,0,0,0.3) 60%, transparent 80%)',
          animation: 'muzzle-flash 0.6s ease-out forwards',
          pointerEvents: 'none',
        }
      }),
      h('div', {
        style: {
          position: 'absolute',
          top: '55%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 160,
          height: 80,
          background: 'radial-gradient(ellipse, rgba(180,20,20,0.7) 0%, rgba(120,10,10,0.4) 40%, transparent 70%)',
          animation: 'blood-spray 1.5s ease-out forwards',
          animationDelay: '0.2s',
          pointerEvents: 'none',
        }
      }),
      h('div', {
        style: {
          position: 'fixed',
          inset: 0,
          zIndex: 999,
          background: 'rgba(180,20,20,0.4)',
          animation: 'red-pulse 0.8s ease-out forwards',
          pointerEvents: 'none',
        }
      }),
    );
  };

  const renderSafeClick = () => {
    if (phase !== 'result' || isHit) return null;
    return h('div', {
      style: {
        position: 'absolute',
        top: '38%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        animation: 'click-mark 0.8s ease-out forwards',
        pointerEvents: 'none',
        filter: 'drop-shadow(0 0 12px rgba(100,200,100,0.6))',
      }
    }, h(Icon.VolumeX, { size: 44 }));
  };

  const probability = Math.min(shotNumber * (difficulty === 'hard' ? 2 : 1) + shift, 6) / 6;
  const pctStr = Math.round(probability * 100);

  return h('div', {
    className: phase === 'result' && isHit ? 'roulette-shake' : '',
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 60,
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    }
  },
    h('div', { style: { textAlign: 'center', marginBottom: 8 } },
      h('p', { style: { fontSize: 12, color: 'var(--c-text-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 } },
        `${playerName} · 第 `, h('span', { key: shotNumber, className: 'num-pop', style: { display: 'inline-block' } }, shotNumber), ' 枪'),
      h('div', {
        style: {
          display: 'inline-flex',
          gap: 4,
          alignItems: 'center',
          padding: '4px 12px',
          borderRadius: 12,
          background: 'rgba(180,30,30,0.15)',
          border: '1px solid rgba(180,30,30,0.3)',
        }
      },
        h('span', { style: { fontSize: 11, color: 'hsl(0 75% 55%)' } }, `中弹概率 ${pctStr}%`),
        ...Array.from({ length: 6 }, (_, i) =>
          h('span', {
            key: i,
            style: {
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i < Math.round(probability * 6) ? '#ef4444' : '#2a1515',
              border: '1px solid #4a1515',
              transition: 'background 0.3s',
            }
          })
        ),
      ),
    ),
    h('div', { style: { position: 'relative' } },
      renderGun(),
      renderMuzzleFlash(),
      renderSafeClick(),
    ),
    h('div', { style: { textAlign: 'center', minHeight: 60 } },
      phase === 'intro' && h('p', { style: { fontSize: 16, color: 'var(--c-accent)', fontWeight: 600, animation: 'pulse 1.5s ease-in-out infinite' } }, '举起左轮手枪...'),
      phase === 'spinning' && h('p', { style: { fontSize: 14, color: 'hsl(0 8% 60%)', letterSpacing: '0.15em' } }, '弹仓旋转中'),
      phase === 'firing' && h('p', { style: { fontSize: 18, color: '#ef4444', fontWeight: 700, letterSpacing: '0.3em', animation: 'pulse 0.3s ease-in-out infinite' } }, '扣动扳机'),
      phase === 'result' && isHit && h('div', null,
        h('p', { style: { fontSize: 28, fontWeight: 800, color: '#ef4444', textShadow: '0 0 20px rgba(239,68,68,0.6)', letterSpacing: '0.2em' } }, '砰！'),
        h('p', { style: { fontSize: 14, color: 'hsl(0 72% 51%)', marginTop: 8 } }, `${playerName} 中弹出局`),
      ),
      phase === 'result' && !isHit && h('div', null,
        h('p', { style: { fontSize: 24, fontWeight: 700, color: 'hsl(142 72% 45%)', letterSpacing: '0.15em' } }, '咔哒'),
        h('p', { style: { fontSize: 14, color: 'hsl(142 60% 50%)', marginTop: 8 } }, '空枪 · 逃过一劫'),
      ),
    ),
  );
}

// ── 主游戏组件 ──────────────────────────────────────────────────────

// ── Game 组件已拆出至 50-game.js（~1100 行，依赖本文件上述所有声明） ────

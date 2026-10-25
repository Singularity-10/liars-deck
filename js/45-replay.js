/**
 * 45-replay.js — D1 对局回放
 * 职责：录制（动作日志 + RNG 磁带）→ 快照重建 → 回放查看器 UI → 回放码导入/导出
 * 依赖：00-constants（fmtTarget）、20-engine（wrappedReducer/INIT）、25-roles（ROLES）、
 * 40-components（h/useState/useEffect/useRef/Icon/Card）
 * 时机：必须在 40-components 之后、50-game 之前加载（覆写全局 wrappedReducer）
 *
 * ── 原理 ──
 * reducer 内部大量使用 Math.random（洗牌/事件掷骰/角色分配），纯 actionLog 无法重建状态。
 * 因此采用「动作日志 + RNG 磁带」：
 * 录制：仅在 wrappedReducer 执行窗口内捕获 Math.random 的返回序列（磁带）；
 * reducer 之外的调用（AI 决策、UI 动画）不捕获——AI 决策本身以 action 落日志，
 * 回放时无需重跑。
 * 回放：从 INIT 基座出发，按序重放日志中的 action，reducer 窗口内按序回吐磁带——
 * 代码路径与录制时完全一致，状态逐位一致。
 * 联机：录制数据存模块级变量、不进 st，广播/重连的 ...s 展开不会泄露；
 * SYNC_STATE（客户端接收权威状态）不记录；联机客户端整体关闭录制。
 *
 * 对外暴露：Replay（录制器）、replayActionLabel / replayExportCode / replayImportCode /
 * replayBuildSnapshots（逻辑层）、ReplayView（回放查看器组件）
 */
/** 回放数据包（replayExportCode 的 btoa 载荷；v 序列化版本号） */
/**
 * @typedef {Object} ReplayData
 * @property {1} v 序列化版本（replayImportCode 校验 ==1）
 * @property {{ a: any, wt: number }[]} actions 录制的动作流（a=克隆 Action，wt=墙钟时刻）
 * @property {number[]} tape reducer 窗口内消耗的随机数序列
 * @property {{ [k: string]: any }} meta 对局元信息
 */

'use strict';

// ── 录制器 ──────────────────────────────────────────────────────────
const Replay = {
  enabled: true,          // 由 50-game dispatch 包装层同步；replaying=true 时预取重放不录
  capture: false,         // 当前是否处于 reducer 执行窗口
  actions: [],            // [{ a: 克隆的 action, wt: 墙钟时刻 }]，START/RESTART 时清空
  tape: [],               // reducer 窗口内消耗的随机数序列
  _playTape: null,        // 回放模式的磁带（数组）
  _playIdx: 0,            // 回放游标
};

const _origRandom = Math.random.bind(Math);
Math.random = function () {
  if (Replay.capture) {
    if (Replay._playTape) {
      const v = Replay._playTape[Replay._playIdx++];
      return v !== undefined ? v : _origRandom(); // 磁带耗尽防御：回退真随机
    }
    const v2 = _origRandom();
    Replay.tape.push(v2);
    return v2;
  }
  return _origRandom();
};

const _origWrapped = wrappedReducer;
/** v95 审计注：回放覆写全局 wrappedReducer（加载序保证 50-game 拿到的是包装版） */
// @ts-ignore —— 函数声明重绑定（录制窗口包装），回放机制核心
wrappedReducer = function (st, act) {
  if (act.type === 'SYNC_STATE') return _origWrapped(st, act); // 客户端接收权威状态，不录
  if (Replay.replaying) return _origWrapped(st, act); //：预取重放不录（否则回放记录多出幻影出牌）
  if (!Replay.enabled) return _origWrapped(st, act);
  if (act.type === 'START' || act.type === 'RESTART') { Replay.actions = []; Replay.tape = []; }
  let cloned = null;
  try { cloned = JSON.parse(JSON.stringify(act)); } catch (e) { cloned = { type: act.type }; }
  Replay.capture = true;
  let ns;
  try { ns = _origWrapped(st, act); }
  finally { Replay.capture = false; }
  Replay.actions.push({ a: cloned, wt: Date.now() });
  return ns;
};

// ── 逻辑层 ──────────────────────────────────────────────────────────
/** 步骤文案：动作类型 + 关键细节（出牌者名/张数/技能名） */
const _REPLAY_ACT_NAMES = {
  START: '开局', RESTART: '重开一局', BEGIN_DEALING: '开始发牌', DEAL_COMPLETE: '发牌完成',
  PLAY: '出牌', AI_PLAY: 'AI 出牌', CHALLENGE: '质疑', CONTINUE: '跟牌（不质疑）',
  ROULETTE: '俄罗斯轮盘', REVEAL_COMPLETE: '验牌完成', PEEK_REVEAL: '亮牌', RECONSIDER: '重新考虑',
  SKIP_TURN: '让过回合', SKIP_SPECTATE: '观战跳过', EVENT_CHOICE: '事件抉择',
  LIBRARY_REDEAL: '牌库重发', SKILL_USE: '发动技能',
};
/**
 * 动作 → 时间轴文案
 * @param {any} a
 * @param {GameState} stBefore
 * @returns {string}
 */
function replayActionLabel(a, stBefore) {
  const base = _REPLAY_ACT_NAMES[a.type] || a.type;
  const nameOf = pid => {
    const p = stBefore && stBefore.players && stBefore.players.find(x => x.id === pid);
    return p ? p.name : null;
  };
  let detail = '';
  if (a.type === 'PLAY' || a.type === 'AI_PLAY') {
    const n = a.ids ? a.ids.length : (a.cards ? a.cards.length : 0);
    const who = nameOf(a.pid) || (a.type === 'PLAY' ? '你' : null);
    detail = (who ? who + ' ' : '') + '打出 ' + n + ' 张牌';
  } else if (a.type === 'CHALLENGE') {
    const who = nameOf(a.cid) || '质疑者';
    detail = who + ' 发起质疑';
  } else if (a.type === 'SKILL_USE') {
    const who = nameOf(a.pid);
    let skillName = a.skillId || '技能';
    try {
      const i18nRole = I18N[getLang()] && I18N[getLang()].roles && I18N[getLang()].roles[a.skillId];
      if (i18nRole && i18nRole.name) skillName = i18nRole.name;
      else if (typeof ROLES !== 'undefined') {
        const def = ROLES.find(r => r.id === a.skillId);
        if (def) skillName = def.id;
      }
    } catch (e) { /* i18n 未加载时退回 id */ }
    detail = (who ? who + ' ' : '') + '发动' + skillName;
  } else if (a.type === 'EVENT_CHOICE') {
    detail = '作出抉择：' + (a.choiceId || '');
  } else if (a.type === 'CONTINUE') {
    const who = a.pid ? nameOf(a.pid) : null;
    detail = who ? who + ' 选择跟牌' : '';
  }
  return detail ? base + ' · ' + detail : base;
}

/** 导出回放码：base64( encodeURIComponent(JSON) ) */
/**
 * 录制数据 → base64 回放码
 * @param {{ [k: string]: any }} [meta]
 * @returns {string}
 */
function replayExportCode(meta) {
  const data = {
    v: 1,
    actions: Replay.actions,
    tape: Replay.tape,
    meta: meta || {},
  };
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

/** 导入回放码 → { actions, tape, meta }；校验失败抛错 */
/**
 * 回放码 → 数据包（校验失败抛错）
 * @param {string} str
 * @returns {ReplayData}
 */
function replayImportCode(str) {
  const s = String(str || '').trim();
  let data = null;
  try { data = JSON.parse(decodeURIComponent(atob(s))); } catch (e) { /* fallthrough */ }
  if (!data || data.v !== 1 || !Array.isArray(data.actions) || !Array.isArray(data.tape)) {
    throw new Error('不是有效的回放码');
  }
  return data;
}

/** 从 { actions, tape } 重建每一步快照（含初始态，长度 = 步数 + 1） */
/**
 * 从 { actions, tape } 重建每一步快照（含初始态，长度 = 步数+1）
 * @param {ReplayData} data
 * @returns {GameState[]}
 */
function replayBuildSnapshots(data) {
  const snaps = [INIT];
  let cur = INIT;
  Replay._playTape = data.tape;
  Replay._playIdx = 0;
  Replay.capture = true;
  try {
    for (const e of data.actions) {
      if (!e || !e.a || typeof e.a.type !== 'string') throw new Error('日志中存在无效动作');
      cur = _origWrapped(cur, e.a);
      snaps.push(cur);
    }
  } finally {
    Replay.capture = false;
    Replay._playTape = null;
    Replay._playIdx = 0;
  }
  return snaps;
}

// ── 回放查看器组件 ──────────────────────────────────────────────────
const _REPLAY_PHASE_NAMES = {
  idle: '待开局', dealing: '发牌中', player_turn: '玩家回合', ai_turn: 'AI 回合',
  challenge_phase: '质疑阶段', roulette: '轮盘', reveal: '验牌', peek_phase: '亮牌阶段',
  reconsider_phase: '重新考虑', won: '胜利', lost: '失败', draw: '平局',
};
const ReplayView = function ({ data, onClose }) {
  const [snaps, setSnaps] = useState(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  const srcRef = useRef(null); // 挂载时冻结数据源（日志/磁带可能被后续 RESTART 重置）

  useEffect(() => {
    try {
      const src = data || { actions: Replay.actions.slice(), tape: Replay.tape.slice() };
      srcRef.current = src;
      setSnaps(replayBuildSnapshots(src));
    } catch (e) {
      setErr(String((e && e.message) || e));
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing || !snaps) return;
    timerRef.current = setInterval(() => {
      setIdx(i => {
        if (i >= snaps.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 650);
    return () => clearInterval(timerRef.current);
  }, [playing, snaps]);

  if (err) {
    return h('div', { className: 'overlay', style: { zIndex: 120 } },
      h('div', { className: 'panel', style: { textAlign: 'center', padding: 28 } },
        h('p', { style: { fontSize: 14, color: 'hsl(0 72% 60%)' } }, '回放重建失败：' + err),
        h('button', { className: 'btn btn-outline', style: { marginTop: 12 }, onClick: onClose }, '关闭'),
      ));
  }
  if (!snaps) {
    return h('div', { className: 'overlay', style: { zIndex: 120 } },
      h('div', { className: 'panel', style: { textAlign: 'center', padding: 28 } },
        h('p', { style: { fontSize: 14, color: 'hsl(0 8% 55%)' } }, '正在重建对局……'),
      ));
  }

  const st = snaps[idx];
  const srcActions = srcRef.current ? srcRef.current.actions : [];
  const srcEntry = idx > 0 ? srcActions[idx - 1] : null;
  const label = srcEntry ? replayActionLabel(srcEntry.a, snaps[idx - 1]) : '对局初始状态';
  const me = st.players && st.players.find(p => p.isLocal);
  const roleOf = pid => {
    const rid = st.roles && st.roles[pid];
    const def = rid && typeof ROLES !== 'undefined' && ROLES.find(r => r.id === rid);
    if (!def) return null;
    // 角色中文名走 i18n（键=角色 id），拿不到再退回 id
    const i18nRole = (typeof I18N !== 'undefined' && I18N[getLang()] && I18N[getLang()].roles && I18N[getLang()].roles[def.id]) || null;
    return { name: (i18nRole && i18nRole.name) || def.id, id: def.id };
  };
  const doExport = () => {
    try {
      const src = srcRef.current || { actions: [], tape: [] }; // 永远导出挂载时冻结的数据源
      const save = { actions: Replay.actions, tape: Replay.tape };
      Replay.actions = src.actions; Replay.tape = src.tape;
      const code = replayExportCode({
        date: new Date().toISOString(),
        difficulty: st.difficulty || null,
        players: (st.players || []).map(p => p.name),
        result: st.phase === 'won' ? 'win' : st.phase === 'draw' ? 'draw' : st.phase === 'lost' ? 'loss' : 'incomplete',
      });
      Replay.actions = save.actions; Replay.tape = save.tape;
      const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
      //：copyText 降级链，失败再弹 prompt 手动复制
      copyText(code).then(function (ok) {
        if (ok) done();
        else { window.prompt('复制以下回放码：', code); done(); }
      });
    } catch (e) {
      window.alert('导出失败：' + ((e && e.message) || e));
    }
  };

  return h('div', { className: 'overlay', style: { zIndex: 120 } },
    h('div', { className: 'panel animate-slide-up', style: { padding: 20, maxWidth: 520, width: '94%', maxHeight: '88vh', overflowY: 'auto' } },
      // 标题行
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
        h('h3', { style: { fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 } },
          h(Icon.Play, { size: 15 }), '对局回放'),
        h('button', { className: 'btn btn-sm btn-outline', onClick: onClose, style: { padding: '4px 10px' } }, h(Icon.XCircle, { size: 13 }), '退出回放'),
      ),
      // 步骤说明
      h('div', { style: { fontSize: 13, color: 'hsl(42 85% 60%)', fontWeight: 600, marginBottom: 8, minHeight: 18 } },
        `第 ${idx} / ${snaps.length - 1} 步 · ${label}`),
      // 对局信息
      h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'hsl(0 8% 60%)', marginBottom: 10 } },
        h('span', null, `第 ${st.round} 轮`),
        h('span', null, `目标 ${fmtTarget(st.targetSuit)}`),
        h('span', null, _REPLAY_PHASE_NAMES[st.phase] || st.phase),
        st.event && (() => {
          // 事件名走 i18n（键=事件 type），拿不到再退回原始 type
          let evName = st.event.type;
          try {
            const evI18n = I18N[getLang()] && I18N[getLang()].events && I18N[getLang()].events[st.event.type];
            if (evI18n && evI18n.name) evName = evI18n.name;
          } catch (e) { /* i18n 未加载时退回 type */ }
          return h('span', { style: { color: 'hsl(280 60% 65%)' } }, `事件：${evName}`);
        })(),
      ),
      // 玩家面板
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 } },
        (st.players || []).map(p => {
          const role = roleOf(p.id);
          const isCur = p.id === st.curPlayer;
          return h('div', {
            key: p.id,
            style: {
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 9px',
              borderRadius: 8, border: isCur ? '1px solid var(--c-accent)' : '1px solid transparent',
              background: isCur ? 'hsl(42 60% 55% / 0.10)' : 'hsl(0 0% 100% / 0.03)',
              opacity: p.alive ? 1 : 0.45,
            },
          },
            h('span', { style: { fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              p.name, me && p.id === me.id ? '（你）' : '', p.alive ? '' : ' ☠'),
            role && h('span', { style: { fontSize: 10, color: 'hsl(42 60% 55%)' } }, role.name || role.id),
            h('span', { style: { color: 'hsl(0 8% 55%)' } }, `手牌 ${p.hand ? p.hand.length : 0}`),
          );
        }),
      ),
      // 桌面牌
      h('div', { style: { minHeight: 84, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap', gap: 2, padding: '8px 6px', background: 'hsl(0 0% 100% / 0.03)', borderRadius: 10, marginBottom: 6 } },
        (st.tableCards || []).length
          ? st.tableCards.map((c, i) => h(Card, { key: c.id, card: c, small: true, style: { marginLeft: i > 0 ? -18 : 0, zIndex: i + 1 } }))
          : h('span', { style: { fontSize: 12, color: 'hsl(0 8% 45%)', margin: '0 auto' } }, '桌面为空'),
      ),
      st.lastClaim && h('div', { style: { fontSize: 12, color: 'hsl(0 8% 55%)', marginBottom: 10, textAlign: 'center' } },
        `声称 ${st.lastClaim.count} 张全部是 ${fmtTarget(st.lastClaim.suit)}`),
      // 进度条
      h('input', {
        type: 'range', min: 0, max: snaps.length - 1, value: idx,
        onChange: e => { setPlaying(false); setIdx(Number(e.target.value)); },
        style: { width: '100%', accentColor: 'var(--c-accent)', marginBottom: 10 },
      }),
      // 控制条
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 } },
        h('button', { className: 'btn btn-sm btn-outline', disabled: idx <= 0, onClick: () => { setPlaying(false); setIdx(0); } }, '|◀'),
        h('button', { className: 'btn btn-sm btn-outline', disabled: idx <= 0, onClick: () => { setPlaying(false); setIdx(idx - 1); } }, '◀ 上一步'),
        h('button', { className: 'btn btn-sm ' + (playing ? 'btn-outline' : 'btn-primary'), disabled: idx >= snaps.length - 1, onClick: () => setPlaying(p => !p) },
          playing ? '⏸ 暂停' : '▶ 自动播放'),
        h('button', { className: 'btn btn-sm btn-outline', disabled: idx >= snaps.length - 1, onClick: () => { setPlaying(false); setIdx(idx + 1); } }, '下一步 ▶'),
        h('button', { className: 'btn btn-sm btn-outline', disabled: idx >= snaps.length - 1, onClick: () => { setPlaying(false); setIdx(snaps.length - 1); } }, '▶|'),
      ),
      // 导出
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'center' } },
        h('button', { className: 'btn btn-sm btn-outline', onClick: doExport }, h(Icon.Copy, { size: 12 }), copied ? '已复制到剪贴板' : '导出回放码'),
      ),
      h('p', { style: { fontSize: 11, color: 'hsl(0 8% 40%)', textAlign: 'center', marginTop: 8 } },
        '回放码包含本局完整动作与随机数序列，发给朋友即可在「终局 → 导入回放码」中复盘'),
    ));
};

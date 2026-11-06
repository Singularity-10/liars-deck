// @ts-nocheck
/**
 * 50-game.js — Game 组件（游戏主界面）
 * 职责：Game 组件（游戏主界面，~1100 行）
 * 依赖：必须在 40-components.js 之后加载——
 * 本文件不解构 React，直接使用 50 顶部已声明的全局符号：
 * useState / useEffect / useRef / useCallback / useMemo / useReducer
 * / memo / h (createElement) / Fragment
 * 以及 Icon / Card / ToastBox / useTimer / DealingAnimation /
 * RussianRoulette / PlayerHand / ErrorBoundary / TavernAudio 等
 * 对外暴露：Game
 */


// ── 终局演出 ──
// 大标题逐字浮现（blur+scale 入场，之后持续脉冲）
function finaleTitle(phase) {
  const txt = phase === 'draw' ? '平局' : (phase === 'won' ? '胜利' : '出局');
  const cls = phase === 'draw' ? 'finale-draw' : (phase === 'won' ? 'finale-win' : 'finale-lose');
  return h('div', { className: 'finale-title ' + cls },
    [...txt].map((ch, i) => h('span', { key: i, style: { '--d': (0.12 + i * 0.14) + 's' } }, ch)),
  );
}
// 纸屑/灰雨规格：确定性伪随机（每次渲染样式稳定，不受 RNG 磁带影响——纯视觉层）
const FINALE_CONFETTI = Array.from({ length: 16 }, (_, i) => {
  const r = n => { const x = Math.sin(i * 97.13 + n * 41.7) * 10000; return x - Math.floor(x); };
  const colors = ['var(--c-accent)', 'hsl(0 72% 55%)', 'hsl(142 72% 50%)', 'hsl(190 70% 58%)'];
  return {
    left: Math.round(r(1) * 100) + '%',
    '--d': (r(2) * 2.2).toFixed(2) + 's',
    '--sway': Math.round((r(3) - 0.5) * 120) + 'px',
    '--rot': Math.round(360 + r(4) * 720) + 'deg',
    background: colors[i % colors.length],
  };
});

// ── 玩家详情浮层（v98）：点击 HUD 头像/名字查看参与者详细状态 ──
// 数据全部来自 state 可见面：联机客户端看到的是 toPublicState 剥离后的切片，
// 画像/冻结等本机不可见字段自动降级隐藏，不扩大信息面。AI 具体参数（honestChance 等）不展示。
function PlayerDetailPanel({ st, pid, onClose }) {
  const p = st.players.find(x => x.id === pid);
  if (!p) return null;
  const rd = (st.roles || {})[pid] ? ROLES.find(r => r.id === st.roles[pid]) : null;
  const rn = rd ? ((I18N[getLang()].roles || {})[rd.id] || {}) : null;
  const ps = (st.playerStats || {})[pid] || {};
  const handN = (p.hand || []).length || p.handCount || 0;
  const libN = (p.library || []).length || p.libraryCount || 0;
  const aliveN = st.players.filter(x => x.alive).length;
  const bluffTarget = Math.max(2, aliveN);
  const frozen = (st.frozen || {})[pid] || [];
  const known = (st.knownStats || {})[pid];
  const charge = (st.skillCharges || {})[pid] || {};
  const cd = (st.skillCd || {})[pid] || {};
  const isMe = p.isLocal;
  const row = (k, v, accent) => h('div', { key: k, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
    h('span', { style: { fontSize: 12, color: 'var(--c-text-dim)' } }, k),
    h('span', { style: { fontSize: 13, fontWeight: 600, color: accent || 'var(--c-text)' } }, v));
  const tag = (text, color, bg) => h('span', { key: text, style: { fontSize: 10, color, background: bg, padding: '2px 8px', borderRadius: 10, border: '1px solid ' + color.replace(')', ',0.3)').replace('hsl', 'hsla') } }, text);
  return h('div', { style: { position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }, onClick: onClose },
    h('div', { style: { width: 'min(86vw, 340px)', maxHeight: '80vh', overflowY: 'auto', background: 'var(--c-panel, hsl(0 30% 8%))', border: '1px solid rgba(180,30,30,0.35)', borderRadius: 12, padding: '18px 20px' }, onClick: e => e.stopPropagation() },
      // 头部：纹章 + 名字 + 角色徽标
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } },
        h('div', { style: { color: 'var(--c-accent)', display: 'flex' } }, aiCrest(p, 40) || h(Icon.User, { size: 40 })),
        h('div', { style: { flex: 1 } },
          h('div', { style: { fontSize: 17, fontWeight: 700 } }, p.name, isMe && h('span', { style: { fontSize: 11, color: 'hsl(0 70% 60%)', marginLeft: 6 } }, '（你）')),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' } },
            rd && tag(rn.name || rd.id, 'hsl(280 60% 72%)', 'rgba(147,51,234,0.12)'),
            p.persona && tag(String(p.persona), 'hsl(190 70% 60%)', 'rgba(34,211,238,0.1)'),
            !p.isHuman && tag('AI', 'hsl(0 8% 60%)', 'rgba(255,255,255,0.05)'),
          ),
        ),
        h('button', { className: 'btn btn-ghost', style: { padding: '4px 8px' }, onClick: onClose }, h(Icon.ArrowLeft, { size: 16 })),
      ),
      // 状态标签行
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 } },
        !p.alive && tag('已出局', 'hsl(0 8% 55%)', 'rgba(255,255,255,0.04)'),
        p.alive && st.curPlayer === pid && tag('回合中', 'hsl(0 72% 55%)', 'rgba(200,30,30,0.12)'),
        st.challengerId === pid && tag('质疑中', 'hsl(38 92% 50%)', 'rgba(245,158,11,0.12)'),
        st.immuneId === pid && tag('轮盘免疫', 'hsl(142 70% 45%)', 'rgba(34,197,94,0.1)'),
        st.spectateId === pid && tag('观战中', 'hsl(250 60% 70%)', 'rgba(139,92,246,0.1)'),
        st.lastCaughtPid === pid && tag('上局被抓', 'hsl(0 60% 55%)', 'rgba(200,30,30,0.08)'),
      ),
      // 牌况
      h('div', { style: { fontSize: 11, color: 'var(--c-accent)', letterSpacing: 2, margin: '10px 0 2px' } }, '牌况'),
      row('手牌', String(handN)),
      row('个人牌库', String(libN), libN === 0 ? 'hsl(0 72% 51%)' : null),
      frozen.length > 0 && row('被冻结牌', String(frozen.length) + ' 张', 'hsl(250 60% 70%)'),
      // 计数
      h('div', { style: { fontSize: 11, color: 'var(--c-accent)', letterSpacing: 2, margin: '10px 0 2px' } }, '本局计数'),
      row('出牌次数', String(ps.playCount || 0)),
      row('质疑次数', String(ps.challengeCount || 0)),
      row('中弹次数', String(ps.shotCount || 0)),
      (ps.revived || 0) > 0 && row('复活次数', String(ps.revived), 'hsl(142 70% 45%)'),
      row('吹牌成功', (p.bluffSuccessCount || 0) + ' / ' + bluffTarget + '（达标即胜）'),
      row('轮盘存活', String(p.survivedCount || 0) + ' / 3'),
      // 技能
      rd && h('div', null,
        h('div', { style: { fontSize: 11, color: 'var(--c-accent)', letterSpacing: 2, margin: '10px 0 2px' } }, '技能'),
        row('技能', (rn.name || rd.id) + '·' + (rd.trigger === 'once' ? '每局 1 次' : rd.trigger === 'cd' ? '冷却制' : '被动')),
        rd.trigger === 'once' && row('剩余次数', String(charge[rd.id] ?? (ONCE_ROLE_IDS.has(rd.id) ? 1 : 0))),
        rd.trigger === 'cd' && row('冷却状态', (st.skillCd || {})[pid] && (st.skillCd || {})[pid][rd.id] != null ? '第 ' + (st.skillCd || {})[pid][rd.id] + ' 轮已用' : '可用'),
      ),
      // B2 画像（仅本机有数据时显示——联机客户端自动隐藏）
      known && h('div', null,
        h('div', { style: { fontSize: 11, color: 'var(--c-accent)', letterSpacing: 2, margin: '10px 0 2px' } }, '你的观察画像'),
        row('记录样本', String((known.bluffs || 0) + (known.honest || 0)) + ' 局'),
        row('吹牌记录', String(known.bluffs || 0)),
        row('诚实记录', String(known.honest || 0)),
      ),
      h('p', { style: { fontSize: 10, color: 'var(--c-text-faint)', marginTop: 10, textAlign: 'center' } }, '点击空白处关闭'),
    ),
  );
}

function Game() {
  const [st, rawDispatch] = useReducer(wrappedReducer, INIT);
  // 批二：Replay 开关移到 dispatch 包装层同步判定（原 effect 同步存在渲染-提交窗口：
  // isMpClient 已变而 effect 未跑时，一次 reducer 可能该录没录/不该录却录）
  const isMpClientRef = useRef(false);
  const dispatch = useCallback(function (action) {
    Replay.enabled = !isMpClientRef.current;
    rawDispatch(action);
  }, []);
  const [screen, setScreen] = useState('idle');
  const [hkHint, setHkHint] = useState(false);
  const achDoneRef = useRef(null);
  const [mode, setMode] = useState('single');
  const [paused, setPaused] = useState(false);
  const [resultTab, setResultTab] = useState(0); // D2：终局面板 tab（0单局 1累计 2趋势）
  const [endHistory, setEndHistory] = useState(null); // D2：本机对局历史快照
  const [quitConfirm, setQuitConfirm] = useState(false); // P1-1：退出二次确认
  const [mpPlayers, setMpPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [replayOpen, setReplayOpen] = useState(null); // D1：null 关闭 | { data } 回放查看器（data=null 表示用本局日志）
  const mpRef = useRef(null),
    aiRef = useRef(null),
    revRef = useRef(null);
  const stRef = useRef(st);
  stRef.current = st;
  useEffect(() => { if (screen !== 'idle') menuAnimatedRef.current = true; }, [screen]); // 反转：离开主菜单才标记已播（原条件写反，冷启动后首次重渲染即吞掉入场动画）
  const prevRevivedRef = useRef(false);
  useEffect(() => {
    if (st.revived && !prevRevivedRef.current) {
      toast.success(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(Icon.Sparkles, { size: 14 }), '有玩家从死亡中复活，重新加入对局！'));
    }
    prevRevivedRef.current = st.revived;
  }, [st.revived]);
  useEffect(() => { if (st.phase !== 'peek_phase') setPeekSel([]); }, [st.phase]);
  // 牌局音效：state diff 驱动（出牌/质疑/轮盘结果/终局），Sfx 与氛围音乐独立开关
  const prevStSfxRef = useRef(null);
  useEffect(() => {
    const prev = prevStSfxRef.current;
    prevStSfxRef.current = st;
    if (!prev || prev === st) return;
    if (st.lastClaim !== prev.lastClaim && st.lastClaim) Sfx.play('card');
    if (st.phase !== prev.phase && (st.phase === 'reveal')) Sfx.play('challenge');
    if (st.rouletteResult !== prev.rouletteResult && st.rouletteResult) {
      Sfx.play(st.rouletteResult === 'dead' ? 'shot' : 'safe');
    }
    if (st.phase !== prev.phase) {
      if (st.phase === 'won') Sfx.play('win');
      else if (st.phase === 'lost') Sfx.play('lose');
    }
  }, [st]);
  const connRef = useRef(null);
  const localPlayerIdRef = useRef(null);
  const roomIdRef = useRef(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [connVersion, setConnVersion] = useState(0);
  const reconnectTimerRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(() => {
    const s = loadSession();
    if (s) { const u = getUser(s.name); return u ? { name: s.name, ...u } : null; }
    return null;
  });
  const [authMode, setAuthMode] = useState(false);
  const [authR, authClosing] = useExitAnim(authMode, 250); //：登录弹窗退出动画
  const [peekSel, setPeekSel] = useState([]);
  const gameStartRef = useRef(0);
  const menuAnimatedRef = useRef(false);
  const { isPlaying: musicOn, toggle: toggleMusic, start: startMusic } = useTavernAmbience();
  const isMpClient = mode === 'multiplayer' && !isHost;
  isMpClientRef.current = isMpClient;

  // D1：联机客户端不录回放（权威状态在房主，客户端日志不完整）
  //：Replay.enabled 改由 dispatch 包装层同步（上一行 ref 已就绪）

  const active = screen === 'playing' && st.phase !== 'idle' && st.phase !== 'won' && st.phase !== 'lost' && st.phase !== 'draw';
  const curP = useMemo(() => st.players.find(p => p.id === st.curPlayer), [st.players, st.curPlayer]);
  const human = curP?.isHuman && curP?.alive && curP?.isLocal;
  const canAct = active && human && !paused;
  const peekActor = st.phase === 'peek_phase' ? st.players.find(p => p.id === st.lastClaim?.playerId) : null;
  const reconActor = st.phase === 'reconsider_phase' ? st.players.find(p => p.id === st.challengerId) : null;
  const isPeekHuman = peekActor?.isHuman && peekActor?.isLocal;
  const isReconHuman = reconActor?.isHuman && reconActor?.isLocal;
  const baseDur = st.phase === 'player_turn' ? 30 : (st.phase === 'challenge_phase' ? 15 : (st.phase === 'peek_phase' ? 15 : (st.phase === 'reconsider_phase' ? 15 : 0)));
  const dur = st.frenzy ? Math.max(baseDur - 5, 5) : baseDur;
    // 技能播报（lastSkill 变化去重）+ 读心者偷看横幅（4 秒自隐）
  const lastSkillKeyRef = React.useRef('');
  const skillFxKeyRef = React.useRef(0);
  const [peekBanner, setPeekBanner] = React.useState(null);
  const [skillFx, setSkillFx] = React.useState(null);
  const skipPenaltyRef = React.useRef(false); // v100：跳过惩罚动画偏好（对局开始时快照）
  React.useEffect(function () { try { skipPenaltyRef.current = localStorage.getItem('ld_skip_penalty') === '1'; } catch (e) {} }, []);
  const [detailPid, setDetailPid] = React.useState(null);
  React.useEffect(() => {
    const ls = st.lastSkill;
    if (!ls) return;
    const key = [ls.pid, ls.roleId, ls.round, ls.kind].join('-');
    if (lastSkillKeyRef.current === key) return;
    lastSkillKeyRef.current = key;
    skillFxKeyRef.current++;
    const who = (st.players.find(p => p.id === ls.pid) || {}).name || '?';
    const whoP = st.players.find(p => p.id === ls.pid) || {};
    const rI18n = (I18N[getLang()].roles || {})[ls.roleId] || {};
    const roleName = rI18n.name || '技能';
    const rIcon = (ROLES.find(r => r.id === ls.roleId) || {}).icon || 'Sparkles';
    let text = '';
    if (ls.kind === 'autoSave') text = who + ' ' + roleName + '显灵，免死一次！（献祭 1 张手牌）';
    else if (ls.kind === 'bountyBonus') text = who + ' 质疑成功，吹牌计数 +1';
    else if (ls.kind === 'buff') text = who + ' 请全场喝酒：下一轮出牌上限 +1';
    else if (ls.kind === 'peek') text = who + ' 发动了「' + roleName + '」';
    else if (ls.kind === 'retarget') text = who + ' 改写了目标牌面 → ' + ls.suit;
    else if (ls.kind === 'transform') text = who + ' 发动了「' + roleName + '」';
    if (text) {
      setSkillFx({ text, rIcon, crest: aiCrest(whoP, 18) });
      setTimeout(() => setSkillFx(null), 2600);
    }
  }, [st.lastSkill, st.players]);
  React.useEffect(() => {
    const pr = st.peekReveal;
    if (!pr) return;
    setPeekBanner(pr);
    const t = setTimeout(() => setPeekBanner(null), 4200);
    return () => clearTimeout(t);
  }, [st.peekReveal]);


  const onTimeout = useCallback(() => {
    const s = stRef.current;
    const mpClient = mode === 'multiplayer' && !isHost;
  const doAct = (act) => {
      if (mpClient) {
        const conn = connRef.current;
        if (conn && conn.open) { try { conn.send({ type: 'game_action', action: act }); } catch (e) {} }
      } else dispatch(act);
    };
    if (s.phase === 'player_turn') {
      const p = s.players.find(x => x.id === s.curPlayer);
      if (p?.isHuman && p?.alive && p?.isLocal) {
        if (p.hand.length) { doAct({ type: 'PLAY', ids: [p.hand[0].id] });
          toast.info('超时，自动出了一张牌'); } else { doAct({ type: 'CONTINUE' });
          toast.info('手牌为空，已跳过'); }
      }
    } else if (s.phase === 'challenge_phase') {
      const p = s.players.find(x => x.id === s.curPlayer);
      if (p?.isHuman && p?.isLocal) { doAct({ type: 'CONTINUE' });
        toast.info('超时，自动跟牌'); }
    } else if (s.phase === 'peek_phase') {
      const p = s.players.find(x => x.id === s.lastClaim?.playerId);
      if (p?.isHuman && p?.isLocal) { doAct({ type: 'PEEK_REVEAL', ids: [] });
        toast.info('超时，未展示牌'); }
    } else if (s.phase === 'reconsider_phase') {
      const p = s.players.find(x => x.id === s.challengerId);
      if (p?.isHuman && p?.isLocal) { doAct({ type: 'RECONSIDER', decision: 'continue' });
        toast.info('超时，自动跟牌'); }
    }
  }, [mode, isHost]);
  const timer = useTimer({ active, paused, isHuman: human && (st.phase === 'player_turn' || st.phase === 'challenge_phase') || isPeekHuman || isReconHuman, duration: dur, onTimeout });

  // ── C2：AI 抉择自动处理（单机或联机 host 的 AI；人类 chooser 由其客户端 dispatch）──
  useEffect(() => {
    if (st.phase !== 'event' || !st.event || !st.event.choices || !st.eventChoice || st.eventResult) return;
    if (isMpClient) return; // 联机客户端不代 AI 做抉择，host 端统一处理
    const chooser = st.players.find(p => p.id === st.eventChoice.chooserId);
    if (!chooser || chooser.isHuman) return;
    const t = setTimeout(() => {
      dispatch({ type: 'EVENT_CHOICE', choiceId: aiPickChoice(st.event, chooser) });
    }, 900);
    return () => clearTimeout(t);
  }, [st.phase, st.eventChoice, st.eventResult, st.event]);

  const startSingle = useCallback((diff, cfgs, selectedAIs, inc, sort, maxPlay = 5) => {
    setMode('single');
    setScreen('playing');
    setIsHost(false);
    connRef.current = null;
    localPlayerIdRef.current = null;
    dispatch({ type: 'START', difficulty: diff, aiConfigs: cfgs, selectedAIs: selectedAIs, incrementalRoulette: inc, autoSortHand: sort, maxPlay: maxPlay });
    startMusic();
  }, [startMusic]);

  const startMulti = useCallback((rid, pls, host, mp, difficulty = 'normal') => {
    mpRef.current = mp;
    // 信令层自动重连：WebSocket 意外断开时 PeerJS 默认不恢复，这里主动 reconnect
    if (mp && mp.peer && !mp._sigBound) {
      mp._sigBound = true;
      mp.peer.on('disconnected', () => {
        try { if (!mp.peer.destroyed) mp.peer.reconnect(); } catch (e) {}
      });
    }
    setIsHost(host);
    setMpPlayers(pls);
    roomIdRef.current = rid;
    gameStartRef.current = Date.now();
    setMode('multiplayer');
    setScreen('playing');
    const humanLobbyIdx = pls.findIndex(p => p.isLocal);
    localPlayerIdRef.current = humanLobbyIdx;
    connRef.current = !host && mp ? (mp.conns?.[0] || null) : null;
    if (mp) mp.inGame = true;
    const setupHostConnListener = (c) => {
      c.on('close', () => {
        const pid = c.playerId;
        if (pid == null) return;
        if (mpRef.current) mpRef.current.conns = mpRef.current.conns.filter(x => x !== c);
        toast.info('玩家断开连接，等待重连...');
      });
      c.on('data', data => {
        if (data?.type === 'game_action') {
          const act = data.action;
          const s = stRef.current;
          const pid = c.playerId;
          const allowed = ['PLAY', 'CHALLENGE', 'CONTINUE', 'PEEK_REVEAL', 'RECONSIDER', 'BEGIN_DEALING', 'EVENT_CHOICE', 'SKILL_USE'];
          if (!allowed.includes(act.type)) return;
          if (act.type === 'SKILL_USE') {
            // 仅角色本人可发动（引擎 skillAvailable 再校验一层）
            if (pid !== act.pid) return;
            dispatch(act);
            return;
          }
          if (act.type === 'EVENT_CHOICE') {
            // 仅抉择者本人可选
            const ec = s.eventChoice;
            if (!ec || pid !== ec.chooserId) return;
            dispatch(act);
            return;
          }
          if (act.type === 'BEGIN_DEALING') {
            if (s.phase !== 'event') return;
            dispatch(act);
            return;
          }
          const p = s.players.find(x => x.id === pid);
          if (!p || !p.alive) return;
          if (act.type === 'PEEK_REVEAL') {
            if (s.phase !== 'peek_phase') return;
            if (s.lastClaim?.playerId !== pid) return;
            const maxPeek = Math.min(3, s.tableCards.length - 1);
            if (act.ids && act.ids.length > maxPeek) return;
            if (act.ids && !act.ids.every(id => s.tableCards.some(c => c.id === id))) return;
          } else if (act.type === 'RECONSIDER') {
            if (s.phase !== 'reconsider_phase') return;
            if (s.challengerId !== pid) return;
            if (!['challenge', 'continue'].includes(act.decision)) return;
          } else {
            if (pid !== s.curPlayer) return;
            if (act.type === 'PLAY') {
              if (s.phase !== 'player_turn') return;
              const handIds = p.hand.map(card => card.id);
              if (!act.ids || !act.ids.every(id => handIds.includes(id))) return;
            }
            if (act.type === 'CHALLENGE') {
              if (s.phase !== 'challenge_phase') return;
              if (act.cid !== pid) return;
            }
            if (act.type === 'CONTINUE') {
              if (s.phase !== 'player_turn' && s.phase !== 'challenge_phase') return;
            }
          }
          dispatch(act);
        } else if (data?.type === 'meta') {
          // 房主广播的元信息（PAUSE/RESUME），房主自己也会收到
          if (data.subType === 'PAUSE') setPaused(true);
          else if (data.subType === 'RESUME') setPaused(false);
        } else if (data?.type === 'chat') {
          const msg = { name: data.name, text: data.text, time: Date.now() };
          setChatMsgs(prev => [...prev.slice(-50), msg]);
          mpRef.current.conns.forEach(ec => {
            if (ec.open) try { ec.send({ type: 'chat', ...msg }); } catch (e) {}
          });
        } else if (data?.type === 'client_left') {
          try { c.close(); } catch (e) {}
        }
      });
    };
    if (host && mp) {
      mp.onReconnect = (conn) => {
        const onReconnectData = (data) => {
          if (data?.type === 'reconnect') {
            try { conn.off('data', onReconnectData); } catch (e) {}
            const s = stRef.current;
            const targetP = s.players.find(p => p.name === data.name && !p.isLocal && !p.isAI);
            if (targetP) {
              conn.playerId = targetP.id;
              const oldConns = mp.conns.filter(c => c.playerId === targetP.id);
              oldConns.forEach(oc => { try { oc.close(); } catch (e) {} });
              mp.conns = mp.conns.filter(c => c.playerId !== targetP.id);
              mp.conns.push(conn);
              const safe = toPublicState(s, targetP.id); // P2：与广播共用剥离出口（重连角落泄露修复，见引擎注释）
              try { conn.send({ type: 'state_sync', state: safe }); } catch (e) {}
              toast.info(targetP.name + ' 已重连');
              setupHostConnListener(conn);
            } else {
              try { conn.send({ type: 'host_returned_lobby' }); } catch (e) {}
              try { conn.close(); } catch (e) {}
            }
          }
        };
        conn.on('data', onReconnectData);
      };
    }
    if (host && mp && mp.conns) {
      const clientPlayerIds = pls
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => !p.isHost && !p.isAI)
        .map(({ i }) => i);
      mp.conns.forEach((c, ci) => {
        c.playerId = clientPlayerIds[ci] ?? (ci + 1);
        setupHostConnListener(c);
      });
    }
    dispatch({ type: 'START', difficulty: difficulty, mpPlayers: pls, incrementalRoulette: true, autoSortHand: true }); // v86：两项锁定开启（host 权威，SYNC_STATE 广播覆盖 client 本地壳值）
    startMusic();
  }, [startMusic]);

  const broadcastThrottleRef = useRef({ last: 0, pending: null, timer: null });
  const broadcastState = useCallback((state) => {
    const mp = mpRef.current;
    if (!mp || !mp.conns || mp.conns.length === 0) return;
    const now = Date.now();
    const THROTTLE_MS = 16;
    const doBroadcast = (s) => {
      broadcastThrottleRef.current.last = Date.now();
      broadcastThrottleRef.current.pending = null;
      if (broadcastThrottleRef.current.timer) {
        clearTimeout(broadcastThrottleRef.current.timer);
        broadcastThrottleRef.current.timer = null;
      }
      mp.conns.forEach((c, ci) => {
        if (!c.open) return;
        const clientPlayerIdx = c.playerId ?? (ci + 1);
        const safe = toPublicState(s, clientPlayerIdx); // P2：剥离唯一出口（M1/B2 见引擎）
        try { c.send({ type: 'state_sync', state: safe }); } catch (e) {}
      });
    };
    if (now - broadcastThrottleRef.current.last >= THROTTLE_MS) {
      doBroadcast(state);
    } else {
      broadcastThrottleRef.current.pending = state;
      if (!broadcastThrottleRef.current.timer) {
        const delay = THROTTLE_MS - (now - broadcastThrottleRef.current.last);
        broadcastThrottleRef.current.timer = setTimeout(() => {
          const pending = broadcastThrottleRef.current.pending;
          if (pending) doBroadcast(pending);
          else broadcastThrottleRef.current.timer = null;
        }, delay);
      }
    }
  }, []);

  useEffect(() => {
    if (isHost || mode !== 'multiplayer') return;
    const conn = connRef.current;
    if (!conn) return;
    const handler = (data) => {
      if (data?.type === 'meta') {
        if (data.subType === 'PAUSE') setPaused(true);
        else if (data.subType === 'RESUME') setPaused(false);
      } else if (data?.type === 'chat') {
        setChatMsgs(prev => [...prev.slice(-50), { name: data.name, text: data.text, time: data.time }]);
      }
    };
    conn.on('data', handler);
    return () => { try { conn.off?.('data', handler); } catch (e) {} };
  }, [isHost, mode, connVersion]);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    const myName = st.players.find(p => p.isLocal)?.name || '我';
    if (isHost) {
      const msg = { name: myName, text, time: Date.now() };
      setChatMsgs(prev => [...prev.slice(-50), msg]);
      mpRef.current?.conns?.forEach(c => {
        if (c.open) try { c.send({ type: 'chat', ...msg }); } catch (e) {}
      });
    } else if (connRef.current?.open) {
      try { connRef.current.send({ type: 'chat', name: myName, text }); } catch (e) {}
    }
    setChatInput('');
  }, [chatInput, isHost, st.players]);

  // 批二：重连临时 peer 与 timer 引用（防僵尸 peer / 不可取消定时器累积）
  const reconPeerRef = useRef(null);
  const reconTimersRef = useRef([]);
  const reconTimer = function (fn, ms) { const t = setTimeout(fn, ms); reconTimersRef.current.push(t); return t; };
  // 对局卸载时清理重连残留
  const reconCleanup = function () {
    reconTimersRef.current.forEach(function (t) { clearTimeout(t); });
    reconTimersRef.current = [];
    try { reconPeerRef.current?.destroy?.(); } catch (e) {}
    reconPeerRef.current = null;
  };
  const reconnectToHost = useCallback(() => {
    if (isHost) return;
    const rid = roomIdRef.current;
    if (!rid) return;
    setReconnecting(true);
    reconCleanup(); // 清上轮残留 peer/timer
    toast.info('连接断开，正在重连...');

    const tryReconnect = (attempt) => {
      if (attempt > 5) {
        reconCleanup();
        setReconnecting(false);
        toast.error('重连失败，返回主菜单');
        try { mpRef.current?.destroy?.(); } catch (e) {}
        mpRef.current = null;
        connRef.current = null;
        localPlayerIdRef.current = null;
        setScreen('idle');
        setMode('single');
        setIsHost(false);
        dispatch({ type: 'RESTART' });
        return;
      }
      try {
        const mp = mpRef.current;
        if (!mp || !mp.peer) {
          try { reconPeerRef.current?.destroy?.(); } catch (e) {} //：销毁上一次重试的半成品 peer
          const newPeer = new Peer({ debug: 0, config: ICE_CONFIG });
          reconPeerRef.current = newPeer;
          newPeer.on('open', () => {
            const conn = newPeer.connect(`ld-${rid}-h`, { reliable: true, serialization: 'json' });
            conn.on('open', () => {
              mpRef.current = { peer: newPeer, conns: [conn], destroy: () => newPeer.destroy(), inGame: true };
              connRef.current = conn;
              const myName = st.players.find(p => p.isLocal)?.name || '玩家';
              conn.send({ type: 'reconnect', name: myName });
              const onInitialSync = (data) => {
                if (data?.type === 'state_sync') {
                  dispatch({ type: 'SYNC_STATE', state: data.state });
                  reconTimersRef.current.forEach(function (t) { clearTimeout(t); });
                  reconTimersRef.current = [];
                  reconPeerRef.current = null; // newPeer 已转正为正式连接
                  setReconnecting(false);
                  setConnVersion(v => v + 1);
                  toast.success('重连成功');
                  try { conn.off('data', onInitialSync); } catch (e) {}
                } else if (data?.type === 'host_returned_lobby') {
                  setReconnecting(false);
                  connRef.current = null;
                  localPlayerIdRef.current = null;
                  try { mpRef.current?.destroy?.(); } catch (e) {}
                  mpRef.current = null;
                  setScreen('idle');
                  setMode('single');
                  setIsHost(false);
                  dispatch({ type: 'RESTART' });
                  toast.info('房主已结束游戏');
                }
              };
              conn.on('data', onInitialSync);
            });
            conn.on('error', () => {
              reconTimer(() => tryReconnect(attempt + 1), 2000);
            });
          });
          newPeer.on('error', () => {
            reconTimer(() => tryReconnect(attempt + 1), 2000);
          });
        } else {
          const conn = mp.peer.connect(`ld-${rid}-h`, { reliable: true, serialization: 'json' });
          conn.on('open', () => {
            mp.conns = [conn];
            mp.inGame = true;
            connRef.current = conn;
            const myName = st.players.find(p => p.isLocal)?.name || '玩家';
            conn.send({ type: 'reconnect', name: myName });
            const onInitialSync = (data) => {
              if (data?.type === 'state_sync') {
                dispatch({ type: 'SYNC_STATE', state: data.state });
                setReconnecting(false);
                setConnVersion(v => v + 1);
                toast.success('重连成功');
                try { conn.off('data', onInitialSync); } catch (e) {}
              } else if (data?.type === 'host_returned_lobby') {
                setReconnecting(false);
                connRef.current = null;
                localPlayerIdRef.current = null;
                try { mpRef.current?.destroy?.(); } catch (e) {}
                mpRef.current = null;
                setScreen('idle');
                setMode('single');
                setIsHost(false);
                dispatch({ type: 'RESTART' });
                toast.info('房主已结束游戏');
              }
            };
            conn.on('data', onInitialSync);
          });
          conn.on('error', () => {
            reconTimer(() => tryReconnect(attempt + 1), 2000);
          });
        }
      } catch (e) {
        reconTimer(() => tryReconnect(attempt + 1), 2000);
      }
    };
    tryReconnect(1);
  }, [isHost, st.players]);

  useEffect(function () {
    return function () {
      reconTimersRef.current.forEach(function (t) { clearTimeout(t); });
      reconTimersRef.current = [];
      try { reconPeerRef.current?.destroy?.(); } catch (e) {}
      reconPeerRef.current = null;
    };
  }, []);
  const reconnectingRef = useRef(false);
  useEffect(() => { reconnectingRef.current = reconnecting; }, [reconnecting]);
  useEffect(() => {
    if (isHost || mode !== 'multiplayer') return;
    const conn = connRef.current;
    if (!conn) return;
    const onClose = () => {
      if (!reconnectingRef.current) {
        reconnectToHost();
      }
    };
    conn.on('close', onClose);
    return () => { try { conn.off?.('close', onClose); } catch (e) {} };
  }, [isHost, mode, connVersion, reconnectToHost]);

  const sendAction = useCallback((action) => {
    if (mode === 'multiplayer' && !isHost) {
      const conn = connRef.current;
      if (conn && conn.open) {
        if (['PLAY', 'CHALLENGE', 'CONTINUE', 'PEEK_REVEAL', 'RECONSIDER', 'EVENT_CHOICE', 'SKILL_USE'].includes(action.type)) {
          dispatch(action);
        }
        try { conn.send({ type: 'game_action', action }); } catch (e) {}
      }
    } else {
      dispatch(action);
    }
  }, [mode, isHost]);

  // 暂停/继续：房主切换时广播给客户端
  const togglePause = useCallback(() => {
    const next = !paused;
    setPaused(next);
    if (mode === 'multiplayer' && isHost) {
      const mp = mpRef.current;
      if (mp && mp.conns) {
        mp.conns.forEach(c => {
          if (c.open) try { c.send({ type: 'meta', subType: next ? 'PAUSE' : 'RESUME' }); } catch (e) {}
        });
      }
    }
  }, [paused, mode, isHost]);

  useEffect(() => {
    if (mode !== 'multiplayer' || !isHost) return;
    broadcastState(st);
  }, [mode, isHost, st, broadcastState]);

  useEffect(() => {
    if (mode !== 'multiplayer' || isHost) return;
    const conn = connRef.current;
    if (!conn) return;
    const handler = (data) => {
      if (data && data.type === 'state_sync') {
        dispatch({ type: 'SYNC_STATE', state: data.state });
      } else if (data && data.type === 'meta') {
        if (data.subType === 'PAUSE') setPaused(true);
        else if (data.subType === 'RESUME') setPaused(false);
      } else if (data && data.type === 'host_returned_lobby') {
        connRef.current = null;
        localPlayerIdRef.current = null;
        try { mpRef.current?.destroy?.(); } catch (e) {}
        mpRef.current = null;
        setScreen('idle');
        setMode('single');
        setIsHost(false);
        dispatch({ type: 'RESTART' });
        toast.info('房主已返回大厅');
      }
    };
    conn.on('data', handler);
    return () => { try { conn.off('data', handler); } catch (e) {} };
  }, [mode, isHost, connVersion]);

  const onEventContinue = useCallback(() => {
    sendAction({ type: 'BEGIN_DEALING' });
  }, [sendAction]);

  const handleDealingDone = useCallback(() => {
    const s = stRef.current;
    if (s.round >= 5) {
      const over = s.players.filter(p => p.alive && p.hand.length > 10);
      if (over.length > 0) {
        toast.warning('疲劳机制生效：手牌超过10张的玩家已自动弃牌');
      }
    }
    const aliveCount = s.players.filter(p => p.alive).length;
    const frenzyThreshold = 8 - (4 - aliveCount) * 2;
    if (!s.frenzy && aliveCount >= 2 && s.round >= frenzyThreshold) {
      toast.error(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(Icon.Flame, { size: 14 }), '狂热化阶段！计时减少5秒，中枪概率翻倍，万能牌失效！'));
    }
    sendAction({ type: 'DEAL_COMPLETE' });
  }, [sendAction]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'library_dealt' || paused) return;
    const t1 = setTimeout(() => {
      sendAction({ type: 'LIBRARY_REDEAL' });
    }, 2000);
    return () => clearTimeout(t1);
  }, [st.phase, paused, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'ai_turn' || paused || (mode === 'multiplayer' && !isHost)) return;
    if (st.spectateId !== null && st.curPlayer === st.spectateId) return; // 观战者由专门 effect 跳过
    const ai = st.players.find(p => p.id === st.curPlayer && !p.isHuman && p.alive);
    if (!ai) return;
    // AI 主动技能策略——先发动技能，本拍不派 AI_PLAY（effect 重跑后再出牌，防陈旧手牌）
    const skillPending = aiWantsSkill(st, ai.id);
    if (skillPending) {
      aiRef.current = setTimeout(() => sendAction({ type: 'SKILL_USE', pid: ai.id, skillId: roleOf(st, ai.id) }), 300);
      return () => { if (aiRef.current) clearTimeout(aiRef.current); };
    }
    const aiOpts = {
      noise: (AI_NOISE[st.difficulty] || {}).play || 0,
      // F3 出牌上限 + B1 局势感知
      maxPlay: st.maxPlay ?? 5,
      persona: ai.persona || null,
      round: st.round,
      aliveCount: st.players.filter(p => p.alive).length,
      lastCaught: st.lastCaughtPid != null && st.lastCaughtPid === ai.id,
      frozen: activeFrozen(st, ai.id),
      blind: isBlackout(st), // 长夜：AI 也看不到自己的牌，盲打
      frenzy: !!st.frenzy, // 狂化轮透传：J 万能失效（v83，外审#1）
    };
    const localPlay = () => {
      const d = aiPlay(ai.hand, st.targetSuit, ai.personality, ai.customConfig, aiOpts);
      aiRef.current = setTimeout(() => {
        d.cards.length ? sendAction({ type: 'AI_PLAY', pid: ai.id, cards: d.cards }) : sendAction({ type: 'CONTINUE' });
      }, 400 + Math.random() * 400);
      return () => { if (aiRef.current) clearTimeout(aiRef.current); };
    };
    // LLM 大脑：单机 + 已配置 Key 时走 GLM 决策（10s 超时/坏输出自动回落本地 AI）
    if (mode === 'single' && LlmAI.enabled() && !aiOpts.blind) {
      let cancelled = false;
      const fzSet = new Set(aiOpts.frozen || []);
      LlmAI.decidePlay({ st: st, ai: ai, target: st.targetSuit, frozenSet: fzSet }, () => {
        const d = aiPlay(ai.hand, st.targetSuit, ai.personality, ai.customConfig, aiOpts);
        return { cards: d.cards };
      }).then(r => {
        if (cancelled || !r) return;
        LlmAI.announce(ai.name, r, '出牌', r.cards.map(c => c.suit === 'J' ? 'J' : c.suit).join('+') + ' → 声明 ' + st.targetSuit);
        // 演出让位：LLM 等待本身即演出，结果就绪后 400ms 固定节奏即出
        aiRef.current = setTimeout(() => {
          r.cards.length ? sendAction({ type: 'AI_PLAY', pid: ai.id, cards: r.cards }) : sendAction({ type: 'CONTINUE' });
        }, 400);
      });
      return () => { cancelled = true; if (aiRef.current) clearTimeout(aiRef.current); };
    }
    return localPlay();
  }, [st.phase, st.curPlayer, st.players, st.targetSuit, st.reversed, st.frozen, st.spectateId, st.round, st.blackoutUntil, st.roles, st.skillCharges, st.skillCd, paused, mode, isHost, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'player_turn' || paused) return;
    if (st.spectateId !== null && st.curPlayer === st.spectateId) return; // 观战者由专门 effect 跳过
    const hm = st.players.find(p => p.id === st.curPlayer && p.isHuman && p.alive);
    if (!hm || hm.hand.length > 0) return;
    const t = setTimeout(() => sendAction({ type: 'CONTINUE' }), 800);
    return () => clearTimeout(t);
  }, [st.phase, st.curPlayer, st.players, paused, isMpClient]);

  // 手牌全被冻结的玩家：无法出牌，自动让过（引擎让过时解冻）
  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'player_turn' || paused) return;
    const hm = st.players.find(p => p.id === st.curPlayer && p.isHuman && p.alive);
    if (!hm || hm.hand.length === 0) return;
    const fz = new Set(activeFrozen(st, hm.id));
    const playable = hm.hand.filter(c => !fz.has(c.id));
    if (playable.length > 0) return;
    toast.info('手牌全部被冻结，跳过本回合');
    const t = setTimeout(() => sendAction({ type: 'CONTINUE' }), 900);
    return () => clearTimeout(t);
  }, [st.phase, st.curPlayer, st.players, st.frozen, paused, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'challenge_phase' || paused || (mode === 'multiplayer' && !isHost)) return;
    const ai = st.players.find(p => p.id === st.curPlayer && !p.isHuman && p.alive);
    if (!ai) return;
    const lastP = st.players.find(p => p.id === st.lastClaim?.playerId);
    // B2：读出牌者画像吹牌率（host 有权威 knownStats；单机同理）
    const kp = (st.knownStats || {})[st.lastClaim?.playerId];
    const bluffRate = kp && kp.bluffs + kp.honest > 0 ? kp.bluffs / (kp.bluffs + kp.honest) : null;
    // v99 F2 迷雾移除：AI 与人类同等可见真实声称张数，质疑决策基于实际声称
    const should = aiChallenge(st.lastClaim?.count ?? 1, lastP?.hand.length ?? 0, st.round, st.difficulty, ai.personality, ai.customConfig, (AI_NOISE[st.difficulty] || {}).challenge || 0, {
      persona: ai.persona || null,
      round: st.round,
      aliveCount: st.players.filter(p => p.alive).length,
      handCount: ai.hand.length,
      lastCaught: st.lastCaughtPid != null && st.lastCaughtPid === ai.id,
      bluffRate,
    });
    const localChallenge = () => {
      aiRef.current = setTimeout(() => {
        if (should) {
          sendAction({ type: 'CHALLENGE', cid: ai.id }); // v89：AI 一律普通质疑
        } else {
          sendAction({ type: 'CONTINUE' });
        }
      }, 400 + Math.random() * 400);
      return () => { if (aiRef.current) clearTimeout(aiRef.current); };
    };
    // LLM 大脑：质疑决策（10s 超时回落本地启发式）
    if (mode === 'single' && LlmAI.enabled() && lastP) {
      let cancelled = false;
      LlmAI.decideChallenge({ st: st, ai: ai, claimer: lastP, claimCount: st.lastClaim?.count ?? 1 }, () => ({ should: should })).then(r => {
        if (cancelled || !r) return;
        LlmAI.announce(ai.name, r, r.should ? '质疑' : '过牌', r.should ? '质疑 ' + (lastP ? lastP.name : '') : '选择不质疑');
        aiRef.current = setTimeout(() => {
          if (r.should) {
            sendAction({ type: 'CHALLENGE', cid: ai.id });           } else {
            sendAction({ type: 'CONTINUE' });
          }
        }, 400); // 演出让位
      });
      return () => { cancelled = true; if (aiRef.current) clearTimeout(aiRef.current); };
    }
    return localChallenge();
  }, [st.phase, st.curPlayer, st.players, st.lastClaim, st.round, st.difficulty, paused, mode, isHost, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'peek_phase' || paused || (mode === 'multiplayer' && !isHost)) return;
    const claimer = st.players.find(p => p.id === st.lastClaim?.playerId);
    if (!claimer || claimer.isHuman) return;
    const maxPeek = Math.min(3, st.tableCards.length - 1);
    aiRef.current = setTimeout(() => {
      const honest = isHonest(st.tableCards, st.targetSuit, st.frenzy);
      let ids = [];
      if (honest) {
        const truthCards = st.tableCards.filter(c => (st.targetSuit || 'A').includes(c.suit) || c.suit === 'J');
        ids = truthCards.slice(0, 1 + Math.floor(Math.random() * Math.min(2, maxPeek))).map(c => c.id);
      } else {
        const truthCards = st.tableCards.filter(c => (st.targetSuit || 'A').includes(c.suit) || c.suit === 'J');
        if (truthCards.length > 0 && Math.random() < 0.6) {
          ids = truthCards.slice(0, 1 + Math.floor(Math.random() * Math.min(2, truthCards.length, maxPeek))).map(c => c.id);
        }
      }
      sendAction({ type: 'PEEK_REVEAL', ids });
    }, 600 + Math.random() * 600);
    return () => { if (aiRef.current) clearTimeout(aiRef.current); };
  }, [st.phase, st.lastClaim, st.tableCards, st.targetSuit, paused, mode, isHost, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'reconsider_phase' || paused || (mode === 'multiplayer' && !isHost)) return;
    const challenger = st.players.find(p => p.id === st.challengerId);
    if (!challenger || challenger.isHuman) return;
    aiRef.current = setTimeout(() => {
      const peeked = st.peekedCards;
      const truthPeeked = peeked.filter(c => (st.targetSuit || 'A').includes(c.suit) || c.suit === 'J').length;
      let challengeProb = 0.5;
      if (peeked.length > 0) {
        challengeProb = 1 - (truthPeeked / peeked.length) * 0.7;
      }
      if (challenger.personality === 'aggressive') challengeProb += 0.15;
      if (challenger.personality === 'conservative') challengeProb -= 0.15;
      const decision = Math.random() < challengeProb ? 'challenge' : 'continue';
      sendAction({ type: 'RECONSIDER', decision });
    }, 600 + Math.random() * 600);
    return () => { if (aiRef.current) clearTimeout(aiRef.current); };
  }, [st.phase, st.challengerId, st.peekedCards, st.targetSuit, paused, mode, isHost, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'reveal' || paused) return;
    revRef.current = setTimeout(() => sendAction({ type: 'REVEAL_COMPLETE' }), 2000 + st.tableCards.length * 200);
    return () => { if (revRef.current) clearTimeout(revRef.current); };
  }, [st.phase, st.tableCards.length, paused, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.skipId === null) return;
    if (st.phase !== 'player_turn' && st.phase !== 'ai_turn') return;
    if (st.curPlayer !== st.skipId) return;
    if (paused) return;
    const skipped = st.players.find(p => p.id === st.skipId);
    toast.info((skipped?.name || '玩家') + ' 跳过本回合');
    const t = setTimeout(() => dispatch({ type: 'SKIP_TURN' }), 1200);
    return () => clearTimeout(t);
  }, [st.phase, st.curPlayer, st.skipId, paused, isMpClient]);

  //：观战状态下事件播报自动继续（观战者无需手点"继续"，留 2.2s 读报时间）
  useEffect(() => {
    if (isMpClient) return;
    if (st.spectateId === null) return;
    if (paused) return;
    if (st.phase !== 'event' || !st.event) return;
    // 抉择等待态不自动跳：等 chooser 决策（AI 由上方 effect 代选）
    if (st.event.choices && st.eventChoice && !st.eventResult) return;
    const t = setTimeout(() => sendAction({ type: 'BEGIN_DEALING' }), 2200);
    return () => clearTimeout(t);
  }, [st.phase, st.event, st.eventChoice, st.eventResult, st.spectateId, paused, isMpClient, sendAction]);

  // P2-5：首次轮到玩家出牌时提示快捷键（每局一次；观战不弹）
  const hkToastRef = useRef(false);
  useEffect(() => {
    if (hkToastRef.current) return;
    if (st.spectateId !== null) return;
    if (st.phase !== 'player_turn') return;
    const me = st.players.find(p => p.isHuman && p.isLocal);
    if (!me || st.curPlayer !== me.id) return;
    hkToastRef.current = true;
    toast.info('快捷键：1~9 选牌 · Space 出牌 · Z 清空 · F 跟牌 · D 质疑（顶栏键盘图标可随时查看）');
  }, [st.phase, st.curPlayer, st.players, st.spectateId]);

  useEffect(() => { ftueCheck(st); }, [st]);

  // 观战者：轮到时自动跳过；质疑阶段轮到时自动跟牌（观战者不能质疑）
  const spectateToastRef = useRef(false);
  useEffect(() => {
    if (isMpClient) return;
    if (st.spectateId === null) return;
    if (paused) return;
    const isSpectatorTurn = st.curPlayer === st.spectateId;
    if (!isSpectatorTurn) return;
    if (st.phase === 'challenge_phase') {
      const t = setTimeout(() => sendAction({ type: 'CONTINUE' }), 900);
      return () => clearTimeout(t);
    }
    if (st.phase === 'player_turn' || st.phase === 'ai_turn') {
      const sp = st.players.find(p => p.id === st.spectateId);
      if (sp?.isHuman && !spectateToastRef.current) { spectateToastRef.current = true; toast.info('你正在观战，本回合跳过'); } // 降噪：观战提示仅首次弹
      const t = setTimeout(() => dispatch({ type: 'SKIP_SPECTATE' }), 1100);
      return () => clearTimeout(t);
    }
  }, [st.phase, st.curPlayer, st.spectateId, paused, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'ai_turn' || paused) return;
    const ai = st.players.find(p => p.id === st.curPlayer && !p.isHuman && p.alive);
    if (!ai) return;
    if ((ai.hand || []).length === 0 && (ai.library || []).length === 0) {
      const t = setTimeout(() => sendAction({ type: 'CONTINUE' }), 600);
      return () => clearTimeout(t);
    }
  }, [st.phase, st.curPlayer, st.players, paused, isMpClient]);

  useEffect(() => {
    if (isMpClient) return;
    if (st.phase !== 'challenge_phase' || paused) return;
    const p = st.players.find(p => p.id === st.curPlayer && p.alive);
    if (p && (p.hand || []).length === 0 && (p.library || []).length === 0) {
      const t = setTimeout(() => sendAction({ type: 'CONTINUE' }), 600);
      return () => clearTimeout(t);
    }
  }, [st.phase, st.curPlayer, st.players, paused, isMpClient]);

  useEffect(() => {
    if (st.phase !== 'challenge_phase' || paused) return;
    const hm = st.players.find(p => p.id === st.curPlayer && p.isHuman && p.alive && p.isLocal);
    if (!hm) return;
    const h = e => {
      if (e.key === 'f' || e.key === 'F' || e.key === 'w' || e.key === 'W') { e.preventDefault();
        sendAction({ type: 'CONTINUE' }); } else if (e.key === 'd' || e.key === 'D' || e.key === 'q' || e.key === 'Q') { e.preventDefault();
        sendAction({ type: 'CHALLENGE', cid: hm.id }); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [st.phase, st.curPlayer, st.players, paused]);

  // D4 快捷键：出牌阶段 1~9 选牌 / Space·Enter 出牌 / Z 清选（经 ld-hk 事件转发给 PlayerHand）
  useEffect(() => {
    if (st.phase !== 'player_turn' || paused) return;
    const hm = st.players.find(p => p.id === st.curPlayer && p.isHuman && p.alive && p.isLocal);
    if (!hm) return;
    const hk = e => {
      if (e.key >= '1' && e.key <= '9') { e.preventDefault(); window.dispatchEvent(new CustomEvent('ld-hk', { detail: { k: 'toggle', i: Number(e.key) - 1 } })); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); window.dispatchEvent(new CustomEvent('ld-hk', { detail: { k: 'play' } })); }
      else if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); window.dispatchEvent(new CustomEvent('ld-hk', { detail: { k: 'clear' } })); }
    };
    window.addEventListener('keydown', hk);
    return () => window.removeEventListener('keydown', hk);
  }, [st.phase, st.curPlayer, st.players, paused]);

  // D4 快捷键：Esc 关闭事件横幅（等价点"继续"）
  useEffect(() => {
    if (st.phase !== 'event') return;
    const hk = e => { if (e.key === 'Escape') { e.preventDefault(); sendAction({ type: 'BEGIN_DEALING' }); } };
    window.addEventListener('keydown', hk);
    return () => window.removeEventListener('keydown', hk);
  }, [st.phase, sendAction]);

  // G1 成就：终局判定 + 解锁持久化 + toast（单机 / 联机房主；每局只算一次）
  useEffect(() => {
    if (st.phase !== 'won' && st.phase !== 'lost' && st.phase !== 'draw') return;
    if (mode === 'multiplayer' && !isHost) return;
    const key = st.phase + ':' + ((st.stats || {}).totalGames ?? 0);
    if (achDoneRef.current === key) return;
    achDoneRef.current = key;
    const newly = unlockAchievements(st);
    newly.slice(0, 3).forEach(a => toast.success('解锁成就「' + a.name + '」'));
    if (newly.length > 3) toast.info('另解锁 ' + (newly.length - 3) + ' 个成就，主菜单可查看');
    // D2：对局历史 + ELO（与成就同 key 去重，防 StrictMode/重渲染重复记录）
    try {
      const meIdx = st.players.findIndex(p => p.isHuman && p.isLocal);
      const idx = meIdx >= 0 ? meIdx : 0;
      const ordered = [st.players[idx], ...st.players.filter((_, i) => i !== idx)];
      setEndHistory(recordMatch({
        difficulty: st.difficulty,
        result: st.phase === 'won' ? 'win' : st.phase === 'draw' ? 'draw' : 'loss',
        rounds: st.round || 0,
        winReason: st.winReason || null,
        players: ordered.map(p => ({
          name: p.name, alive: p.alive,
          playCount: (st.playerStats[p.id] || {}).playCount || 0,
          challengeCount: (st.playerStats[p.id] || {}).challengeCount || 0,
          shotCount: (st.playerStats[p.id] || {}).shotCount || 0,
          bluffSuccessCount: p.bluffSuccessCount || 0,
        })),
        myRevived: !!st.revived,
      }));
    } catch (e) { /* 历史记录失败不影响终局 */ }
  }, [st.phase, st.stats, mode, isHost]);

  const onPlay = useCallback(ids => {
    sendAction({ type: 'PLAY', ids });
    // 预取：dispatch 后用 reducer 重放构造新局面，趁玩家操作时间预热首个 AI 决策（同签名请求与正式调用去重合并）
    if (mode !== 'single' || !LlmAI.enabled()) return;
    Replay.replaying = true; // 预取重放不进回放记录
    try {
      const next = wrappedReducer(stRef.current, { type: 'PLAY', ids: ids });
      if (next === stRef.current) return;
      const nxt = next.players.find(p => p.id === next.curPlayer && !p.isHuman && p.alive);
      if (!nxt) return;
      if (next.phase === 'challenge_phase' && next.lastClaim) {
        const claimer = next.players.find(p => p.id === next.lastClaim.playerId);
        if (claimer && nxt.id !== claimer.id) {
          LlmAI.decideChallenge({ st: next, ai: nxt, claimer: claimer, claimCount: next.lastClaim.count }, function () { return { should: false }; }).catch(function (e) {});
        }
      } else if (next.phase === 'player_turn' && !isBlackout(next)) {
        const fz = new Set(activeFrozen(next, nxt.id));
        LlmAI.decidePlay({ st: next, ai: nxt, target: next.targetSuit, frozenSet: fz }, function () {
          const d = aiPlay(nxt.hand, next.targetSuit, nxt.personality, nxt.customConfig, { maxPlay: next.maxPlay ?? 5, persona: nxt.persona || null, round: next.round, aliveCount: next.players.filter(p => p.alive).length, frozen: activeFrozen(next, nxt.id), blind: false });
          return { cards: d.cards };
        }).catch(function (e) {});
      }
    } catch (e) {} finally { Replay.replaying = false; }
  }, [sendAction, st, mode]);
  const onChallenge = useCallback(() => { const hm = st.players.find(p => p.id === st.curPlayer && p.isHuman && p.isLocal); if (hm) sendAction({ type: 'CHALLENGE', cid: hm.id }); }, [st.players, st.curPlayer, sendAction]);
  const onContinue = useCallback(() => sendAction({ type: 'CONTINUE' }), [sendAction]);
  const onPeekReveal = useCallback(ids => sendAction({ type: 'PEEK_REVEAL', ids }), [sendAction]);
  const onReconsider = useCallback(decision => sendAction({ type: 'RECONSIDER', decision }), [sendAction]);
  const onRoulette = useCallback(dead => sendAction({ type: 'ROULETTE', dead }), [sendAction]);
  const onRestart = useCallback(() => {
    if (mode === 'multiplayer') {
      if (isHost) {
        const mp = mpRef.current;
        if (mp) {
          mp.inGame = false;
          if (mp.conns) {
            mp.conns.forEach(c => {
              try { if (c.open) c.send({ type: 'host_returned_lobby' }); } catch (e) {}
            });
          }
          try { mp.destroy?.(); } catch (e) {}
        }
        mpRef.current = null;
        connRef.current = null;
        localPlayerIdRef.current = null;
        setScreen('lobby');
        setMode('multiplayer');
        setIsHost(true);
        dispatch({ type: 'RESTART' });
      }
    } else {
      dispatch({ type: 'RESTART' });
    }
  }, [mode, isHost]);

  const quitGame = useCallback(() => {
    const s = stRef.current;
    if (mode === 'multiplayer' && currentUser) {
      const penalty = calcQuitPenalty(s);
      if (penalty > 0) {
        const newRep = updateReputation(currentUser.name, -penalty);
        setCurrentUser(prev => prev ? { ...prev, reputation: newRep } : prev);
        toast.warning('中途退出，扣除 ' + penalty + ' 信誉分');
      }
    }
    if (mode === 'multiplayer') {
      const mp = mpRef.current;
      if (mp) {
        if (isHost) {
          if (mp.conns) mp.conns.forEach(c => {
            try { if (c.open) c.send({ type: 'host_returned_lobby' }); } catch (e) {}
          });
        } else {
          const conn = connRef.current;
          if (conn && conn.open) {
            try { conn.send({ type: 'client_left' }); } catch (e) {}
          }
        }
        try { mp.destroy?.(); } catch (e) {}
      }
      mpRef.current = null;
      connRef.current = null;
      localPlayerIdRef.current = null;
    }
    dispatch({ type: 'RESTART' });
    setScreen('idle');
    setMode('single');
    setIsHost(false);
    setPaused(false);
  }, [mode, isHost, currentUser]);

  const onBack = useCallback(() => {
    if (mode === 'multiplayer') {
      if (isHost) {
        if (mpRef.current?.conns) {
          mpRef.current.conns.forEach(c => {
            try { if (c.open) c.send({ type: 'host_returned_lobby' }); } catch (e) {}
          });
        }
      } else {
        const conn = connRef.current;
        if (conn && conn.open) {
          try { conn.send({ type: 'client_left' }); } catch (e) {}
        }
      }
    }
    try { mpRef.current?.destroy?.(); } catch (e) {}
    mpRef.current = null;
    connRef.current = null;
    localPlayerIdRef.current = null;
    setScreen('idle');
    setMode('single');
    setIsHost(false);
    setPaused(false);
    dispatch({ type: 'RESTART' });
  }, [mode, isHost]);

  const opponents = st.players.filter(p => !p.isLocal);
  const humanPlayer = st.players.find(p => p.isLocal);
  const totalCardsLeft = humanPlayer ? (humanPlayer.hand || []).length + (humanPlayer.library || []).length : 0;
  const deckRound = Math.floor(st.round / 8) + 1;
  const eventsUntil = st.round === 0 ? 3 : (3 - (st.round % 3)) || 3;
  const isUrgent = timer <= 5 && timer > 0;
  // 主题感知氛围：监听 data-theme 变化，按主题生成不同粒子（尘埃/雪花/光斑）
  const [themeName, setThemeName] = useState(document.body.dataset.theme || 'tavern');
  useEffect(() => {
    const ob = new MutationObserver(() => setThemeName(document.body.dataset.theme || 'tavern'));
    ob.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    return () => ob.disconnect();
  }, []);
  const ambientDusts = useMemo(() => {
    const conf = themeName === 'snow' ? { n: 18, top: () => 0, size: () => 3 + Math.random() * 2.5, dur: () => 7 + Math.random() * 7 }
      : themeName === 'desert' ? { n: 9, top: () => 58 + Math.random() * 40, size: () => 6 + Math.random() * 7, dur: () => 11 + Math.random() * 10 }
      : { n: 14, top: () => 15 + Math.random() * 80, size: () => 2 + Math.random() * 2.5, dur: () => 9 + Math.random() * 9 };
    return Array.from({ length: conf.n }, () => ({
      left: 2 + Math.random() * 96,
      top: conf.top(),
      size: conf.size(),
      dur: conf.dur(),
      delay: -Math.random() * 16,
    }));
  }, [themeName]);
  // v105 超近景大飘絮（×4）：比尘埃大、飘得快——倾斜时晃动最猛，纵深第一载体
  const ambientFloats = useMemo(() => Array.from({ length: 4 }, () => ({
    left: 5 + Math.random() * 90,
    top: 20 + Math.random() * 75,
    size: 5 + Math.random() * 2,
    dur: 5 + Math.random() * 3.5,
    delay: -Math.random() * 9,
  })), []);

  return h('div', { style: { position: 'relative', minHeight: '100vh', overflow: 'hidden', zIndex: 2 } },
    h('div', { className: 'bg-ambient', style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 } },
      // v103 深度分层容器（BgTilt 五档挂点，见 12-bg-tilt.js）：
      // far=远景大光斑(-180) / mid=烟烛暗角(-60) / near=悬浮粒子(+140，晃动最明显)
      h('div', { className: 'bg-far', style: { position: 'absolute', inset: 0 } },
        // v105b 大气透视：远墙整体蒙薄雾（远处朦胧、近景粒子锐利——静态深度线索，零运行时成本）
        h('div', { style: { position: 'absolute', inset: 0, background: 'rgba(32,20,10,0.24)' } }),
        h('div', { style: { position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 900, height: 600, background: 'radial-gradient(ellipse at 50% 0%,var(--c-glow-top) 0%,var(--c-glow-side) 30%,transparent 70%)' } }),
        h('div', { style: { position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 600, height: 350, background: 'radial-gradient(ellipse at 50% 0%,var(--c-glow-top2) 0%,transparent 60%)', animation: 'pulse 4s ease-in-out infinite' } }),
        h('div', { style: { position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 1000, height: 500, background: 'radial-gradient(ellipse at 50% 100%,var(--c-glow-bottom) 0%,transparent 40%,transparent 75%)' } }),
        h('div', { style: { position: 'absolute', left: 0, top: '33%', width: 400, height: 300, background: 'radial-gradient(ellipse at 0% 50%,var(--c-glow-side) 0%,transparent 70%)' } }),
        h('div', { style: { position: 'absolute', right: 0, top: '33%', width: 400, height: 300, background: 'radial-gradient(ellipse at 100% 50%,var(--c-glow-side) 0%,transparent 70%)' } }),
      ),
      h('div', { className: 'bg-mid', style: { position: 'absolute', inset: 0 } },
        h('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center,transparent 40%,var(--c-vignette) 100%)' } }),
        h('div', { style: { position: 'absolute', inset: 0, opacity: 0.03, background: 'radial-gradient(ellipse at 30% 60%,var(--c-smoke1) 0%,transparent 50%),radial-gradient(ellipse at 70% 40%,var(--c-smoke2) 0%,transparent 50%)', animation: 'smoke-drift 12s ease-in-out infinite' } }),
        // 氛围层：烛光摇曳（左右两团，错相）
        h('div', { className: 'ambient-candle', style: { left: '-6%', bottom: '-12%', width: '46vw', height: '46vw', background: 'radial-gradient(circle, var(--c-candle1), transparent 65%)' } }),
        h('div', { className: 'ambient-candle', style: { right: '-8%', top: '-14%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, var(--c-candle2), transparent 65%)', animationDelay: '-3.4s', animationDuration: '9.5s' } }),
      ),
      h('div', { className: 'bg-near', style: { position: 'absolute', inset: 0 } },
        ...(themeName === 'snow'
          ? ambientDusts.map((d, i) => h('div', { key: 'snow' + i, className: 'ambient-snow', style: { left: d.left + '%', top: d.top + '%', width: d.size, height: d.size, animationDuration: d.dur + 's', animationDelay: d.delay + 's' } }))
          : themeName === 'desert'
            ? ambientDusts.map((d, i) => h('div', { key: 'ember' + i, className: 'ambient-ember', style: { left: d.left + '%', top: d.top + '%', width: d.size, height: d.size, animationDuration: d.dur + 's', animationDelay: d.delay + 's' } }))
            : ambientDusts.map((d, i) => h('div', { key: 'dust' + i, className: 'ambient-dust', style: { left: d.left + '%', top: d.top + '%', width: d.size, height: d.size, animationDuration: d.dur + 's', animationDelay: d.delay + 's' } }))),
      ),
      // v105 超近景飘絮层（z=+330，六层深度档最近端）：倾斜时晃动最猛
      h('div', { className: 'bg-float', style: { position: 'absolute', inset: 0 } },
        ...ambientFloats.map((d, i) => h('div', { key: 'float' + i, className: 'ambient-float', style: { left: d.left + '%', top: d.top + '%', width: d.size, height: d.size, animationDuration: d.dur + 's', animationDelay: d.delay + 's' } })),
      ),
    ),
    screen === 'idle' && h(MainMenu, {
      onStart: startSingle,
      onMultiplayer: () => {
        if (currentUser) setScreen('lobby');
        else setAuthMode(true);
      },
      user: currentUser,
      onLogout: () => { clearSession();
        setCurrentUser(null); },
      skipAnim: menuAnimatedRef.current
    }),
    authR && h(AuthModal, { onCloseWrap: authClosing,  onAuth: (u) => { setCurrentUser(u);
        setAuthMode(false);
        setScreen('lobby'); }, onClose: () => setAuthMode(false) }),
    screen === 'lobby' && h(Lobby, { onStart: startSingle, onMultiStart: startMulti, onBack, user: currentUser, onLogout: () => { clearSession();
        setCurrentUser(null); } }),
    screen === 'playing' && active && h('div', { key: 'screen-playing', style: { animation: 'fade-in 0.35s ease' } }, //：对局屏切入淡入（Fragment→div 包裹；纯 opacity 不影响 fixed 子元素与布局）
      st.frenzy && h('div', { className: 'frenzy-overlay' }),
      detailPid != null && h(PlayerDetailPanel, { st, pid: detailPid, onClose: () => setDetailPid(null) }),
      st.stains.length > 0 && h('div', { style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' } },
        st.stains.map((s, i) => h('div', {
          key: i,
          style: {
            position: 'absolute',
            left: s.x + '%',
            top: s.y + '%',
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            transform: `translate(-50%,-50%) rotate(${s.rotation}deg) scale(${s.scale})`,
            background: s.type === 'wine' ?
              'radial-gradient(ellipse at 30% 30%, rgba(80,30,15,0.6) 0%, rgba(60,20,10,0.4) 40%, rgba(40,15,5,0.1) 70%, transparent 100%)' :
              'radial-gradient(ellipse at 40% 35%, rgba(180,20,20,0.7) 0%, rgba(140,15,15,0.5) 35%, rgba(100,10,10,0.2) 65%, transparent 100%)',
            opacity: s.opacity,
            filter: `blur(${s.blur}px)`,
            boxShadow: s.type === 'blood' ? '0 0 8px rgba(180,20,20,0.3)' : 'none',
          }
        }))
      ),
      h('div', {
        className: 'panel',
        style: { padding: '6px 12px', margin: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4, background: st.frenzy ? 'rgba(40,8,8,0.92)' : undefined }
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          // P3-8：顶栏小按钮热区扩容（padding 撑触控面 + 负 margin 保持视觉密度）
          h('button', { className: 'btn btn-ghost', style: { padding: '8px 10px', margin: '-7px -2px', fontSize: 11, color: 'hsl(0 60% 60%)', flexShrink: 0 }, onClick: () => setQuitConfirm(true) }, '退出'),
          isHost && h('button', { className: 'btn btn-ghost', style: { padding: '8px 10px', margin: '-7px -2px', fontSize: 11, color: paused ? 'var(--c-success)' : 'var(--c-accent)', flexShrink: 0 }, onClick: togglePause }, paused ? '继续' : '暂停'),
          h('button', { className: 'btn btn-ghost', title: '快捷键说明', style: { padding: '8px 10px', margin: '-7px -2px', display: 'inline-flex', alignItems: 'center', color: 'hsl(200 60% 65%)', flexShrink: 0 }, onClick: () => setHkHint(v => !v) }, h(Icon.Keyboard, { size: 13 })),
          hkHint && h('div', { style: { position: 'fixed', top: 44, right: 10, zIndex: 80, background: 'var(--c-border-soft)', border: '1px solid hsl(0 15% 25%)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', fontSize: 11, color: 'hsl(0 10% 65%)', lineHeight: 2, pointerEvents: 'none' } },
            h('div', { style: { fontWeight: 600, color: 'hsl(42 80% 60%)', marginBottom: 2 } }, '快捷键'),
            h('div', null, h('b', { style: { color: 'var(--c-ice)' } }, '1~9'), ' 选牌 / 取消选牌'),
            h('div', null, h('b', { style: { color: 'var(--c-ice)' } }, 'Space'), ' 确认出牌　', h('b', { style: { color: 'var(--c-ice)' } }, 'Z'), ' 清空选择'),
            h('div', null, h('b', { style: { color: 'var(--c-ice)' } }, 'F / W'), ' 跟牌　', h('b', { style: { color: 'var(--c-ice)' } }, 'D / Q'), ' 质疑'),
            h('div', null, h('b', { style: { color: 'var(--c-ice)' } }, 'Esc'), ' 关闭事件横幅'),
          ),
          h('span', { style: { fontSize: 11, color: 'hsl(35 30% 80%)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 } }, h(Icon.Swords, { size: 11 }), '第' + st.round + '轮'),
          h('span', { style: { fontSize: 10, color: 'var(--c-accent)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 } }, h(Icon.Sparkles, { size: 10 }), '事件' + eventsUntil + '回合后'),
          st.spectateId !== null && h('span', { style: { fontSize: 10, color: 'hsl(200 70% 65%)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 } },
            h(Icon.Eye, { size: 10 }), ((st.players.find(function (q) { return q.id === st.spectateId; }) || {}).name || '玩家') + ' 观战'),
          isBlackout(st) && h('span', { style: { fontSize: 10, color: 'hsl(250 60% 70%)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 } }, '长夜·手牌不可见'),
          (st.rouletteShift || 0) > 0 && h('span', { style: { fontSize: 10, color: 'hsl(0 75% 60%)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 } }, '天崩·中弹+' + st.rouletteShift + '/6'),
          st.fatigueActive && h('span', { style: { fontSize: 9, color: 'hsl(280 60% 65%)', background: 'rgba(147,51,234,0.1)', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(147,51,234,0.2)', flexShrink: 0 } }, '疲劳'),
          st.frenzy && h('span', { className: 'frenzy-badge', style: { flexShrink: 0 } }, h(Icon.Flame, { size: 11 }), '狂热化'),
          h('span', { style: { fontSize: 9, color: 'hsl(190 70% 55%)', background: 'rgba(34,211,238,0.08)', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(34,211,238,0.15)', flexShrink: 0 } }, h('span', { style: { color: 'hsl(190 70% 60%)', display: 'inline-flex' } }, h(Icon.Angel, { size: 9 })), h('span', { style: { color: 'hsl(25 95% 60%)', display: 'inline-flex' } }, h(Icon.Demon, { size: 9 })), '×' + Math.max(1, 4 - Math.floor((st.round - 1) / 2))),
          st.reversed && h('span', { style: { fontSize: 9, color: 'hsl(38 92% 50%)', background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 } }, '逆时针'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 } },
            st.players.map(p => h('div', { key: p.id, style: { display: 'flex', alignItems: 'center', gap: 3 } },
              h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: p.alive ? (p.id === st.curPlayer ? 'var(--c-danger)' : 'hsl(142 70% 45%)') : 'hsl(0 8% 30%)', flexShrink: 0 } }),
              h('span', { onClick: () => setDetailPid(p.id), title: '查看状态', style: { cursor: 'pointer', fontSize: 10, color: p.alive ? (p.isLocal ? 'hsl(0 70% 60%)' : 'hsl(0 8% 55%)') : 'hsl(0 8% 30%)', textDecoration: p.alive ? 'none' : 'line-through', maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.name),
              st.roles && st.roles[p.id] && (function () {
                const rd = ROLES.find(r => r.id === st.roles[p.id]);
                if (!rd) return null;
                const rn = (I18N[getLang()].roles || {})[rd.id] || {};
                return h('span', { key: 'role' + p.id, title: rn.name || rd.id, style: { color: 'hsl(280 60% 72%)', display: 'inline-flex', flexShrink: 0 } }, h(Icon[rd.icon], { size: 10 }));
              })(),
              // 撒谎率画像 chip（样本≥2 才显示；联机客户端无数据自动隐藏）
              (function () {
                const ks2 = (st.knownStats || {})[p.id];
                if (!ks2) return null;
                const n2 = ks2.bluffs + ks2.honest;
                if (n2 < 2) return null;
                const rate2 = ks2.bluffs / n2;
                const bucket2 = rate2 > 0.6 ? 2 : rate2 >= 0.3 ? 1 : 0;
                const labels2 = I18N[getLang()].ui.liarBuckets;
                const colors2 = ['hsl(142 60% 50%)', 'var(--c-accent)', 'hsl(0 72% 58%)'];
                return h('span', {
                  key: 'liar' + p.id,
                  title: labels2[bucket2] + ' · ' + Math.round(rate2 * 100) + '%',
                  style: { color: colors2[bucket2], display: 'inline-flex', flexShrink: 0 },
                }, h(Icon.Masks, { size: 10 }));
              })(),
            )),
          ),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('span', { style: { fontSize: 11, color: 'hsl(0 8% 55%)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 } }, h(Icon.Timer, { size: 11 }), '当前回合：'),
          h('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--c-text-bright)', flexShrink: 0 } }, (st.players.find(p => p.id === st.curPlayer)?.name || '?') + ' ' + (st.phase === 'player_turn' ? '决策中' : st.phase === 'ai_turn' ? '思考中' : st.phase === 'challenge_phase' ? '质疑中' : st.phase === 'peek_phase' ? '展示中' : st.phase === 'reconsider_phase' ? '考虑中' : st.phase === 'reveal' ? '揭晓中' : st.phase === 'roulette' ? '轮盘中' : st.phase === 'dealing' ? '发牌中' : st.phase === 'event' ? '事件中' : '')),
          dur > 0 && h(Fragment, null,
            h('div', { style: { flex: 1, height: 5, borderRadius: 3, background: 'var(--c-border-soft)', overflow: 'hidden', minWidth: 40 } },
              h('div', { style: { height: '100%', borderRadius: 3, background: isUrgent ? 'hsl(0 72% 51%)' : 'var(--c-danger)', width: `${dur > 0 ? (timer / dur) * 100 : 0}%`, transition: 'width 0.3s linear' } }),
            ),
            h('span', { style: { fontSize: 11, fontFamily: 'monospace', color: isUrgent ? 'hsl(0 72% 51%)' : 'var(--c-text-dim)', fontWeight: isUrgent ? 'bold' : 'normal', minWidth: 24, textAlign: 'right' } }, '' + timer + 's'),
          ),
        ),
      ),
      h('div', { style: { display: 'flex', justifyContent: 'center', gap: 'clamp(12px,3vw,32px)', padding: '8px', flexWrap: 'wrap' } },
        opponents.map(opp => {
          const isCur = opp.id === st.curPlayer,
            dead = !opp.alive,
            isClaimer = st.lastClaim?.playerId === opp.id;
          const handLen = opp.hand?.length || opp.handCount || 0,
            libLen = opp.library?.length || opp.libraryCount || 0;
          return h('div', { key: opp.id, onClick: () => setDetailPid(opp.id), title: '查看' + opp.name + '的状态', style: { cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: dead ? 0.4 : 1, transition: 'opacity 0.3s', border: `1px solid ${isCur && !dead ? 'hsl(0 45% 32%)' : 'var(--c-border-soft)'}`, borderRadius: 10, padding: '8px 12px', background: isCur && !dead ? 'rgba(180,30,30,0.08)' : 'transparent' } },
            h('div', {
              style: {
                width: isCur ? 64 : 52,
                height: isCur ? 64 : 52,
                borderRadius: '50%',
                border: `2px solid ${dead ? 'var(--c-border-soft)' : isCur ? 'var(--c-danger)' : 'var(--c-border)'}`,
                background: isCur ? 'rgba(180,30,30,0.15)' : 'var(--c-input-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: isCur && !dead ? 'pulse-glow 1.5s ease-in-out infinite' : 'none',
                transition: 'all 0.3s',
                position: 'relative'
              }
            },
              dead ? h('div', { style: { color: 'var(--c-text-faint)' } }, h(Icon.Skull, { size: isCur ? 22 : 18 })) : h('div', { style: { color: 'var(--c-accent)' } }, aiCrest(opp, isCur ? 24 : 20) || h(Icon.User, { size: isCur ? 22 : 18 })),
              isCur && !dead && h('div', { style: { position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--c-danger)', border: '2px solid hsl(0 30% 3%)' } }),
            ),
            h('span', { style: { fontSize: 13, fontWeight: 500, color: dead ? 'var(--c-text-faint)' : 'var(--c-text)', textDecoration: dead ? 'line-through' : 'none' } }, opp.name),
            !dead && h('div', { key: 'hand' + handLen, className: 'num-pop', style: { display: 'flex', gap: 2, alignItems: 'center' } },
              handLen > 0 ?
                h(Fragment, null,
                  Array.from({ length: Math.min(handLen, 5) }).map((_, j) => h('div', { key: j, style: { width: 16, height: 22, borderRadius: 2, marginLeft: j > 0 ? -6 : 0, background: 'linear-gradient(135deg,rgba(180,30,30,0.5),rgba(180,30,30,0.8))', border: '1px solid rgba(180,30,30,0.4)' } })),
                  handLen > 5 && h('span', { style: { fontSize: 10, color: 'var(--c-text-dim)', marginLeft: 2 } }, `+${handLen - 5}`),
                ) :
                h('span', { style: { fontSize: 11, color: 'var(--c-text-faint)', fontStyle: 'italic' } }, '无手牌'),
            ),
            !dead && h('div', { style: { fontSize: 10, color: libLen === 0 ? 'hsl(0 72% 51%)' : 'hsl(0 8% 40%)', marginTop: 2 } },
              `牌库: ${libLen}`,
            ),
            st.phase === 'challenge_phase' && isClaimer && h('div', { style: { fontSize: 11, color: 'var(--c-accent)', background: 'rgba(200,160,50,0.15)', border: '1px solid rgba(180,30,30,0.3)', padding: '2px 8px', borderRadius: 12 } }, `出了 ${st.lastClaim?.count ?? 0} 张`),
          );
        }),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0', gap: 12, minHeight: 160 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--c-border)', borderRadius: 999, padding: '6px 18px', background: 'var(--c-input-bg)' } },
          h('span', { style: { fontSize: 12, color: 'var(--c-text-dim)' } }, '目标牌面'),
          h('span', { style: { fontSize: 24, fontWeight: 'bold', display: 'flex', gap: 2 } },
            (st.targetSuit || 'A').split('').map((ch, i) => h('span', { key: i, style: { color: SUIT_COLOR[ch] || '#fff' } }, i > 0 ? '·' + ch : ch)), // A3：双色 'AK' → 'A·K'
          ),
        ),
        st.tableCards.length > 0 && h('div', {
          key: 'tbl-' + st.phase + '-' + st.tableCards.length, // phase/张数变化时重挂载重播入场动画
          className: st.phase === 'challenge_phase' && st.lastClaim && !st.challengeResult ? 'animate-shake' : '', // 质疑窗口桌牌抖动一次
          style: { display: 'flex', justifyContent: 'center', position: 'relative', height: 90 }
        },
          st.tableCards.map((c, i) => {
            const n = st.tableCards.length;
            const mid = (n - 1) / 2;
            const offset = i - mid;
            const maxAngle = Math.min(n * 3, 20);
            const angle = n > 1 ? offset * (maxAngle * 2 / (n - 1)) : 0;
            const xOff = n > 1 ? offset * (Math.min(28, 200 / n)) : 0;
            const yOff = Math.abs(offset) * 3;
            return h('div', {
              key: c.id,
              //：轮盘阶段整叠扫向弃牌堆（左下），reveal 阶段保持亮牌
              className: st.phase === 'roulette' ? 'animate-card-sweep' : 'animate-card-deal',
              style: {
                animationDelay: `${st.phase === 'roulette' ? i * 0.07 : i * 0.1}s`,
                position: 'absolute',
                left: `calc(50% + ${xOff}px)`,
                top: yOff,
                transform: `translateX(-50%) rotate(${angle}deg)`,
                transformOrigin: 'bottom center',
                zIndex: i,
              }
            },
              h('div', null,
                h(Card, {
                  frenzy: st.frenzy,
                  card: (function () {
                    if (st.phase === 'reveal' || st.challengeResult) return c;
                    if (st.phase === 'peek_phase' && st.lastClaim?.playerId === humanPlayer?.id) return c;
                    if (st.phase === 'reconsider_phase' && st.challengerId === humanPlayer?.id && st.peekedCards.some(pc => pc.id === c.id)) return c;
                    return null;
                  })(),
                  faceDown: (function () {
                    if (st.phase === 'reveal' || st.challengeResult) return false;
                    if (st.phase === 'peek_phase' && st.lastClaim?.playerId === humanPlayer?.id) return false;
                    if (st.phase === 'reconsider_phase' && st.challengerId === humanPlayer?.id) return !st.peekedCards.some(pc => pc.id === c.id);
                    return true;
                  })(),
                  small: true
                }),
              ),
            );
          }),
        ),
        st.lastClaim && st.phase !== 'reveal' && !st.challengeResult && h('div', { style: { fontSize: 13, color: 'var(--c-text-dim)' } },
          st.lastClaim.playerId === humanPlayer?.id
            ? `你出了 ${st.lastClaim.count} 张，声称全部是 ${fmtTarget(st.lastClaim.suit)}`
            : `对手声称全部是 ${fmtTarget(st.lastClaim.suit)}`),
        st.challengeResult && h('div', { className: 'animate-slide-up', style: { padding: '8px 20px', borderRadius: 8, background: st.challengeResult === 'honest' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${st.challengeResult === 'honest' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` } },
          h('span', { style: { fontWeight: 'bold', fontSize: 16, color: st.challengeResult === 'honest' ? '#10b981' : '#ef4444' } },
            st.challengeResult === 'honest' ? '诚实！' : '撒谎！'),
          st.challengerId != null && h('p', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginTop: 4 } }, `${st.players.find(p => p.id === st.challengerId)?.name} 发起了质疑`),
        ),
      ),
      st.phase === 'challenge_phase' && st.lastClaim && canAct && h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0' } },
        h('p', { style: { fontSize: 14, color: 'var(--c-text-dim)', textAlign: 'center' } }, `对手声称出了 ${st.lastClaim?.count ?? '?'} 张 ${fmtTarget(st.targetSuit)}`),
        h('div', { style: { display: 'flex', gap: 12 } },
          h('button', { className: 'btn btn-outline', onClick: onContinue }, h(Icon.ArrowLeft, { size: 14 }), '跟牌继续'),
          h('button', { className: 'btn btn-danger', onClick: onChallenge }, h(Icon.Crosshairs, { size: 14 }), '质疑开牌'),
        ),
        h('p', { style: { fontSize: 11, color: 'var(--c-text-faint)' } }, '快捷键: F 跟牌 · D 质疑'),
      ),
      st.phase === 'peek_phase' && st.lastClaim && (function () {
        const claimer = st.players.find(p => p.id === st.lastClaim.playerId);
        const isClaimer = claimer?.isLocal && claimer?.isHuman;
        const maxPeek = Math.min(3, st.tableCards.length - 1);
        if (!isClaimer) return h('div', { style: { textAlign: 'center', padding: '16px 0' } },
          h('p', { style: { fontSize: 14, color: 'var(--c-text-dim)' } }, '等待对方展示牌...'));
        const togglePeek = id => {
          setPeekSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length < maxPeek ? [...prev, id] : prev));
        };
        return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0' } },
          h('p', { style: { fontSize: 14, color: 'var(--c-accent)', textAlign: 'center' } }, '你被质疑了！选择1-' + maxPeek + '张牌展示给质疑方'),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' } },
            st.tableCards.map(c => {
              const sel = peekSel.includes(c.id);
              return h('div', {
                key: c.id,
                onClick: () => togglePeek(c.id),
                style: {
                  width: 50,
                  height: 70,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: sel ? 'rgba(16,185,129,0.2)' : 'hsl(0 15% 10%)',
                  border: sel ? '2px solid hsl(142 72% 45%)' : '2px solid hsl(0 12% 20%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: SUIT_COLOR[c.suit] || '#fff',
                  transition: 'all 0.2s',
                  transform: sel ? 'translateY(-4px)' : 'none',
                }
              }, c.suit, c.mod === 'angel' && h('span', { style: { color: 'hsl(190 70% 60%)' } }, h(Icon.Angel, { size: 11 })), c.mod === 'demon' && h('span', { style: { color: 'hsl(25 95% 60%)' } }, h(Icon.Demon, { size: 11 })));
            }),
          ),
          h('div', { style: { display: 'flex', gap: 12 } },
            h('button', { className: 'btn btn-outline', onClick: () => { onPeekReveal([]); } }, '不展示'),
            h('button', { className: 'btn btn-primary', disabled: peekSel.length < 1, onClick: () => onPeekReveal(peekSel) },
              '展示' + (peekSel.length > 0 ? '(' + peekSel.length + ')' : '')),
          ),
        );
      })(),
      st.phase === 'reconsider_phase' && st.lastClaim && (function () {
        const challenger = st.players.find(p => p.id === st.challengerId);
        const isChallenger = challenger?.isLocal && challenger?.isHuman;
        if (!isChallenger) return h('div', { style: { textAlign: 'center', padding: '16px 0' } },
          h('p', { style: { fontSize: 14, color: 'var(--c-text-dim)' } }, '等待质疑方决定...'));
        return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0' } },
          h('p', { style: { fontSize: 14, color: 'var(--c-accent)', textAlign: 'center' } }, '对方展示了' + st.peekedCards.length + '张牌，是否继续质疑？'),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' } },
            st.tableCards.map(c => {
              const peeked = st.peekedCards.some(pc => pc.id === c.id);
              return h('div', {
                key: c.id,
                style: {
                  width: 50,
                  height: 70,
                  borderRadius: 6,
                  background: peeked ? 'hsl(0 15% 10%)' : 'hsl(0 20% 15%)',
                  border: peeked ? '2px solid var(--c-accent)' : '2px solid hsl(0 12% 20%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: peeked ? (SUIT_COLOR[c.suit] || '#fff') : 'hsl(0 8% 30%)',
                  position: 'relative',
                }
              }, peeked ? h('span', null, c.suit, c.mod === 'angel' && h('span', { style: { color: 'hsl(190 70% 60%)' } }, h(Icon.Angel, { size: 11 })), c.mod === 'demon' && h('span', { style: { color: 'hsl(25 95% 60%)' } }, h(Icon.Demon, { size: 11 }))) : '?');
            }),
          ),
          h('div', { style: { display: 'flex', gap: 12 } },
            h('button', { className: 'btn btn-outline', onClick: () => onReconsider('continue') }, h(Icon.ArrowLeft, { size: 14 }), '跟牌继续'),
            h('button', { className: 'btn btn-danger', onClick: () => onReconsider('challenge') }, h(Icon.Crosshairs, { size: 14 }), '继续质疑'),
          ),
        );
      })(),
    ),
    skillFx && h('div', { key: skillFxKeyRef.current, className: 'skill-banner', style: { position: 'fixed', top: 64, left: '50%', zIndex: 76, background: 'linear-gradient(135deg, rgba(20,14,10,0.92), rgba(30,20,14,0.88))', border: '1px solid var(--c-accent-dim, hsl(40 60% 40%))', borderRadius: 10, padding: '9px 20px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 6px 26px rgba(0,0,0,0.55), 0 0 14px rgba(200,160,50,0.12)', pointerEvents: 'none', animation: 'skill-banner 2.6s ease forwards' } },
      h('span', { style: { color: 'var(--c-accent)', display: 'inline-flex', filter: 'drop-shadow(0 0 5px rgba(200,160,50,0.5))' } },
        skillFx.crest || h(Icon[skillFx.rIcon] || Icon.Sparkles, { size: 18 })),
      h('span', { style: { fontSize: 13, fontWeight: 600, color: 'var(--c-text)', letterSpacing: '0.02em' } }, skillFx.text),
    ),
        peekBanner && (function () {
      // 只有读心者本机能看到牌面（联机在广播层过滤）
      const me = st.players.find(p => p.isHuman && p.isLocal);
      if (!me || peekBanner.readerId !== me.id) return null;
      const tn = (st.players.find(p => p.id === peekBanner.targetId) || {}).name || '?';
      const c = peekBanner.card || {};
      return h('div', { style: { position: 'fixed', top: 120, left: '50%', transform: 'translateX(-50%)', zIndex: 76, background: 'var(--c-border-soft)', border: '1px solid hsl(200 60% 35%)', borderRadius: 10, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' } },
        h(Icon.Eye, { size: 15 }),
        h('span', { style: { fontSize: 12, color: 'hsl(200 60% 70%)' } }, '读心者偷看到 ' + tn + ' 的一张牌：'),
        h('span', { style: { fontSize: 14, fontWeight: 700, color: SUIT_COLOR[c.suit] || '#fff' } },
          c.suit, c.mod === 'angel' ? ' 天使' : c.mod === 'demon' ? ' 恶魔' : ''),
      );
    })(),
    st.phase === 'player_turn' && h('div', { style: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '24px 16px 12px', background: 'linear-gradient(to top,hsla(0,30%,3%,0.95) 0%,hsla(0,30%,3%,0.8) 70%,transparent 100%)' } },
      // 角色技能按钮（自己回合可发动）
      (function () {
        const me = st.players.find(p => p.isHuman && p.isLocal && p.alive);
        if (!me || me.id !== st.curPlayer) return null;
        const rid = roleOf(st, me.id);
        if (!rid) return null;
        const def = ROLES.find(r => r.id === rid);
        if (!def || def.trigger === 'passive') return null;
        const rI18n = (I18N[getLang()].roles || {})[rid] || {};
        const chk = skillAvailable(st, me.id);
        const reasonText = { used: '已用完', cd: '冷却中', turn: '非你回合', noJunk: '没有杂牌', noAngel: '没有天使牌', noTarget: '无目标', needBluff: '需先成功吹牌', armed: '已布防', passive: '被动技能' }[chk.reason] || '';
        return h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: 8 } },
          h('button', {
            className: 'btn ' + (chk.ok ? 'btn-primary' : 'btn-outline'),
            style: { padding: '7px 16px', fontSize: 12, opacity: chk.ok ? 1 : 0.55, display: 'inline-flex', alignItems: 'center', gap: 5 },
            disabled: !chk.ok,
            title: rI18n.desc || '',
            onClick: function () { chk.ok && sendAction({ type: 'SKILL_USE', pid: me.id, skillId: rid }); }
          },
            h(Icon[def.icon], { size: 13 }),
            h('span', null, (rI18n.name || def.id) + '·' + (chk.ok ? (rI18n.action || '发动') : reasonText)),
          ),
        );
      })(),
      h(PlayerHand, {
        hand: curP?.hand ?? [],
        targetSuit: st.targetSuit,
        onPlay,
        disabled: canAct,
        autoSort: st.autoSortHand,
        maxPlay: st.maxPlay ?? 5,
        libraryCount: curP?.library?.length ?? 0,
        frenzy: st.frenzy,
        frozenIds: new Set(activeFrozen(st, curP?.id)),
        blackout: isBlackout(st),
      }),
    ),
    active && st.phase === 'library_dealt' && h('div', { className: 'overlay', style: { zIndex: 38 } },
      h('div', { className: 'panel animate-slide-up', style: { textAlign: 'center', padding: '28px 36px', maxWidth: 340 } },
        h('span', { style: { display: 'inline-flex', marginBottom: 10 } }, h(Icon.Joker, { size: 40 })),
        h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: 'var(--c-accent)' } }, '牌库已空'),
        h('p', { style: { fontSize: 13, color: 'var(--c-text-dim)', lineHeight: 1.6 } }, '所有玩家的牌已用尽，酒保正把弃牌区的牌收拢洗匀，即将重新发牌...'),
        h('div', { style: { marginTop: 16, width: 40, height: 3, background: 'var(--c-danger)', borderRadius: 2, margin: '16px auto 0', animation: 'pulse 1s ease-in-out infinite' } }),
      ),
    ),
    active && st.phase === 'dealing' && h(DealingAnimation, { players: st.players, onComplete: isMpClient ? () => {} : handleDealingDone }),
    active && st.phase === 'event' && st.event && h('div', { className: 'overlay' },
      h('div', { className: 'panel animate-slide-up', style: { textAlign: 'center', padding: 32, maxWidth: 360 } },
        h('span', { style: { display: 'inline-flex', marginBottom: 12 } }, h(Icon[st.event.icon] || Icon.Sparkles, { size: 46 })),
        h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 22, fontWeight: 'bold', marginBottom: 8 } }, (I18N[getLang()].events[st.event.type] && I18N[getLang()].events[st.event.type].name) || st.event.name),
        h('p', { style: { fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.6 } }, (I18N[getLang()].events[st.event.type] && I18N[getLang()].events[st.event.type].desc) || st.event.desc),
        st.eventResult && st.eventResult.lines && st.eventResult.lines.length > 0 && h('div', {
          style: { marginTop: 10, padding: '10px 12px', background: 'var(--c-border-soft)', border: '1px solid var(--c-border)', borderRadius: 8, textAlign: 'left' },
        },
          st.eventResult.lines.map(function (l, i) {
            return h('p', { key: i, style: { fontSize: 12, color: 'hsl(42 25% 68%)', lineHeight: 1.7, margin: 0 } }, '· ' + l);
          }),
        ),
        // ── C2：抉择事件选择 UI（未选时渲染；本机为 chooser 时可点）──
        st.event.choices && st.eventChoice && !st.eventResult && (function () {
          const evT = I18N[getLang()].events[st.event.type] || {};
          const chooser = st.players.find(function (p) { return p.id === st.eventChoice.chooserId; });
          const isMyPick = chooser && chooser.isHuman && chooser.isLocal && !isMpClient || (isMpClient && chooser && chooser.isLocal && chooser.isHuman);
          const dictChoices = evT.choices || [];
          return h('div', { style: { marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 } },
            h('p', { style: { fontSize: 13, color: 'hsl(42 85% 60%)', fontWeight: 600 } },
              isMyPick ? '轮到你抉择' : (chooser ? chooser.name + ' 正在抉择……' : '')),
            st.event.choices.map(function (c, ci) {
              const t = dictChoices[ci] || c;
              return h('button', {
                key: c.id,
                disabled: !isMyPick,
                className: 'btn ' + (c.risk >= 0.5 ? 'btn-outline' : 'btn-primary'),
                // P3-9：高风险项警示描边（暗红边+左侧警示条），配合已有 ⚠ 前缀，颜色语义与风险一致
                style: { width: '100%', textAlign: 'left', padding: '10px 14px', opacity: isMyPick ? 1 : 0.5, cursor: isMyPick ? 'pointer' : 'not-allowed', ...(c.risk >= 0.5 ? { borderColor: 'hsl(0 45% 38%)', boxShadow: 'inset 3px 0 0 hsl(0 55% 45%)' } : {}) },
                onClick: function () { if (isMyPick) sendAction({ type: 'EVENT_CHOICE', choiceId: c.id }); },
              },
                h('div', { style: { fontSize: 14, fontWeight: 700, color: 'hsl(30 15% 90%)' } }, (c.risk >= 0.5 ? '⚠ ' : '') + t.label),
                h('div', { style: { fontSize: 11, color: 'hsl(0 8% 55%)', marginTop: 3 } }, t.desc),
              );
            }),
          );
        })(),
        !(st.event.choices && st.eventChoice && !st.eventResult) && h('button', { className: 'btn btn-primary', style: { marginTop: 20 }, onClick: onEventContinue }, '继续'),
      ),
    ),
    active && st.phase === 'roulette' && curP && h(RussianRoulette, {
      playerName: curP.name,
      isHit: st.rouletteResult === 'dead',
      shotNumber: st.rouletteShots,
      difficulty: st.difficulty,
      shift: st.rouletteShift || 0,
      onComplete: isMpClient ? () => {} : () => onRoulette(st.rouletteResult === 'dead'),
      skipPenalty: skipPenaltyRef.current,
    }),
    screen === 'playing' && (st.phase === 'won' || st.phase === 'lost' || st.phase === 'draw') && h('div', { className: 'overlay' + (st.phase === 'won' ? ' finale-victory-bg' : st.phase === 'lost' ? ' finale-lose-bg' : '') },
      st.phase !== 'draw' && h('div', { className: 'finale-burst' }),
      st.phase !== 'draw' && h('div', { className: 'finale-confetti' }, FINALE_CONFETTI.map((sp, i) => h('i', { key: i, style: sp }))),
      h('div', { className: 'panel animate-slide-up', style: { textAlign: 'center', padding: 32, maxWidth: 400, width: '90%' } },
        finaleTitle(st.phase),
        h('p', { style: { fontSize: 14, color: 'var(--c-text-dim)', marginTop: 8 } },
          st.phase === 'draw' ? '5次目标牌变化后无人出局，本局平局' :
          st.winReason === 'survive3' ? (st.phase === 'won' ? '你在轮盘中3次存活，赢得胜利！' : `${st.winner?.name || ''} 在轮盘中3次存活，赢得胜利`) :
          st.winReason === WIN_REASON_BLUFF ? (st.phase === 'won' ? '你累计撒谎成功次数达标，赢得胜利！' : `${st.winner?.name || ''} 累计撒谎成功次数达标，赢得胜利`) :
          st.phase === 'won' ? '你是最后的幸存者！' : (st.winner ? `${st.winner.name} 成为了最后的赢家` : '游戏结束')),
        // 胜者定格卡（纹章+轮盘存活+诈牌战绩）
        st.winner && h('div', { className: 'finale-card', style: { flexDirection: 'column', gap: 3 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            aiCrest(st.winner, 22) && h('span', { style: { color: 'var(--c-accent)', display: 'inline-flex' } }, aiCrest(st.winner, 22)),
            h('span', { style: { fontSize: 15, fontWeight: 700, color: st.phase === 'won' ? 'var(--c-accent)' : 'var(--c-danger-deep)' } }, st.winner.name),
          ),
          h('span', { style: { fontSize: 11, color: 'var(--c-text-dim)' } }, (st.winner.survivedCount || 0) + ' 次轮盘存活 · ' + (st.winner.bluffSuccessCount || 0) + ' 次诈牌得手'),
        ),
        // D2：终局面板三 tab（单局数据 / 累计战绩 / 历史趋势）
        h('div', { style: { display: 'flex', gap: 6, marginTop: 20 } },
          ['单局数据', '累计战绩', '历史趋势'].map((label, i) =>
            h('button', { key: i, className: 'btn ' + (resultTab === i ? 'btn-primary' : 'btn-outline'), style: { flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 8 }, onClick: () => setResultTab(i) }, label),
          ),
        ),
        resultTab === 1 && h('div', { className: 'panel', style: { margin: '12px 0', padding: 16, textAlign: 'left' } },
          // D2：ELO 徽章
          endHistory && h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
              h('span', { style: { fontSize: 20, fontWeight: 'bold', color: 'var(--c-accent)' } }, endHistory.elo),
              h('span', { style: { fontSize: 11, color: 'var(--c-text-dim)' } }, 'ELO'),
            ),
            endHistory.matches[0] && endHistory.matches[0].eloAfter !== endHistory.matches[0].eloBefore && (() => {
              const d = endHistory.matches[0].eloAfter - endHistory.matches[0].eloBefore;
              return h('span', { style: { fontSize: 11, fontWeight: 600, color: d > 0 ? 'hsl(142 72% 50%)' : 'hsl(0 72% 55%)' } }, (d > 0 ? '+' : '') + d + ' 本局');
            })(),
          ),
          h('h3', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, '战绩统计'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 } },
            h('span', { style: { color: 'var(--c-text-dim)' } }, '总局数'), h('span', { style: { textAlign: 'right' } }, st.stats.totalGames),
            h('span', { style: { color: 'var(--c-text-dim)' } }, '胜场'), h('span', { style: { textAlign: 'right', color: 'hsl(142 72% 45%)' } }, st.stats.wins),
            h('span', { style: { color: 'var(--c-text-dim)' } }, '败场'), h('span', { style: { textAlign: 'right', color: 'hsl(0 72% 51%)' } }, st.stats.losses),
            h('span', { style: { color: 'var(--c-text-dim)' } }, '最长连胜'), h('span', { style: { textAlign: 'right' } }, st.stats.maxWinStreak),
            st.stats.totalGames > 0 && h(Fragment, null, h('span', { style: { color: 'var(--c-text-dim)' } }, '胜率'), h('span', { style: { textAlign: 'right' } }, `${Math.round(st.stats.wins / st.stats.totalGames * 100)}%`)),
          ),
          // D2：最近 20 局 ELO 折线
          endHistory && h('div', { style: { marginTop: 14 } },
            h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--c-accent)' } }, 'ELO 走势（最近 20 局）'),
            h(LineChart, { matches: endHistory.matches }),
          ),
        ),
        resultTab === 0 && h('div', { className: 'panel', style: { margin: '12px 0', padding: 16, textAlign: 'left' } },
          h('h3', { style: { fontSize: 13, fontWeight: 600, marginBottom: 12 } }, '本局数据'),
          (() => {
            const maxVal = Math.max(1, ...st.players.map(p => {
              const s = st.playerStats[p.id] || { playCount: 0, challengeCount: 0, shotCount: 0 };
              return Math.max(s.playCount, s.challengeCount, s.shotCount);
            }));
            const barH = 100;
            return h('div', { style: { display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: barH + 30, marginBottom: 8 } },
              st.players.map((p, pi) => {
                const s = st.playerStats[p.id] || { playCount: 0, challengeCount: 0, shotCount: 0 };
                return h('div', { key: p.id, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 } },
                  h('div', { style: { display: 'flex', gap: 3, alignItems: 'flex-end', height: barH } },
                    h('div', { className: 'stat-bar-grow', style: { '--d': (0.55 + pi * 0.09).toFixed(2) + 's', width: 12, height: `${(s.playCount / maxVal) * barH}px`, background: 'hsl(0 72% 51%)', borderRadius: '3px 3px 0 0', minHeight: s.playCount > 0 ? 3 : 0, position: 'relative' } },
                      s.playCount > 0 && h('span', { style: { position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: 'hsl(0 8% 68%)', whiteSpace: 'nowrap' } }, s.playCount)),
                    h('div', { className: 'stat-bar-grow', style: { '--d': (0.55 + pi * 0.09 + 0.06).toFixed(2) + 's', width: 12, height: `${(s.challengeCount / maxVal) * barH}px`, background: 'var(--c-accent)', borderRadius: '3px 3px 0 0', minHeight: s.challengeCount > 0 ? 3 : 0, position: 'relative' } },
                      s.challengeCount > 0 && h('span', { style: { position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: 'hsl(0 8% 68%)', whiteSpace: 'nowrap' } }, s.challengeCount)),
                    h('div', { className: 'stat-bar-grow', style: { '--d': (0.55 + pi * 0.09 + 0.12).toFixed(2) + 's', width: 12, height: `${(s.shotCount / maxVal) * barH}px`, background: 'hsl(142 72% 45%)', borderRadius: '3px 3px 0 0', minHeight: s.shotCount > 0 ? 3 : 0, position: 'relative' } },
                      s.shotCount > 0 && h('span', { style: { position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: 'hsl(0 8% 68%)', whiteSpace: 'nowrap' } }, s.shotCount)),
                  ),
                  aiCrest(p, 14) && h('div', { style: { color: 'var(--c-accent)', opacity: p.alive ? 1 : 0.4, display: 'inline-flex' } }, aiCrest(p, 14)),
                                    h('span', { style: { fontSize: 10, color: p.alive ? 'hsl(0 8% 78%)' : 'hsl(0 8% 40%)', textDecoration: p.alive ? 'none' : 'line-through', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, p.name),
                );
              })
            );
          })(),
          h('div', { style: { display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4, fontSize: 11 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
              h('div', { style: { width: 10, height: 10, background: 'hsl(0 72% 51%)', borderRadius: 2 } }),
              h('span', { style: { color: 'hsl(0 8% 68%)' } }, '出牌'),
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
              h('div', { style: { width: 10, height: 10, background: 'var(--c-accent)', borderRadius: 2 } }),
              h('span', { style: { color: 'hsl(0 8% 68%)' } }, '质疑'),
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
              h('div', { style: { width: 10, height: 10, background: 'hsl(142 72% 45%)', borderRadius: 2 } }),
              h('span', { style: { color: 'hsl(0 8% 68%)' } }, '开枪'),
            ),
          ),
          h('div', { style: { display: 'flex', justifyContent: 'space-around', marginTop: 12, fontSize: 11 } },
            st.players.map(p => h('div', { key: p.id, style: { textAlign: 'center', flex: 1 } },
              h('div', { style: { color: 'hsl(190 70% 55%)', display: 'flex', alignItems: 'center', gap: 2 } }, h(Icon.Shield, { size: 10 }), '' + (p.survivedCount || 0)),
              h('div', { style: { color: 'hsl(280 60% 65%)', display: 'flex', alignItems: 'center', gap: 2 } }, h(Icon.Masks, { size: 10 }), '' + (p.bluffSuccessCount || 0)),
            )),
          ),
        ),
        resultTab === 2 && (() => {
          // D2：历史趋势——最近 20 局五维雷达（出牌/质疑/中枪/撒谎/复活）
          const aggRes = endHistory ? aggregateDims(endHistory.matches, 20) : aggregateDims([], 20);
          const hist = endHistory ? endHistory.matches.slice(0, 20) : [];
          const w = hist.filter(m => m.result === 'win').length, l = hist.filter(m => m.result === 'loss').length;
          return h('div', { className: 'panel', style: { margin: '12px 0', padding: 16, textAlign: 'left' } },
            h('h3', { style: { fontSize: 13, fontWeight: 600, marginBottom: 12 } }, `最近 ${hist.length} 局趋势`),
            hist.length === 0 ?
              h('p', { style: { fontSize: 12, color: 'hsl(0 8% 40%)', textAlign: 'center', padding: '24px 0' } }, '暂无对局记录——完成一局后这里会出现你的五维画像') :
              h(Fragment, null,
                h(RadarChart, { agg: aggRes.agg, raw: aggRes.raw }),
                h('div', { style: { display: 'flex', justifyContent: 'center', gap: 14, fontSize: 11, marginTop: 8 } },
                  h('span', { style: { color: 'hsl(142 72% 50%)' } }, `胜 ${w}`),
                  h('span', { style: { color: 'hsl(0 72% 55%)' } }, `负 ${l}`),
                  h('span', { style: { color: 'var(--c-text-dim)' } }, `平 ${hist.length - w - l}`),
                ),
              ),
          );
        })(),
        h('div', { style: { display: 'flex', gap: 12, justifyContent: 'center' } },
          isMpClient ?
            h('p', { style: { fontSize: 13, color: 'var(--c-text-dim)' } }, '等待房主操作...') :
            h(Fragment, null,
              h('button', { className: 'btn btn-primary', onClick: onRestart }, h(Icon.RotateCcw, { size: 14 }), '再来一局'),
              h('button', { className: 'btn btn-outline', onClick: onBack }, h(Icon.ArrowLeft, { size: 14 }), '返回菜单'),
            ),
        ),
        // ── D1：回放入口（联机客户端隐藏——客户端没有完整日志）──
        !isMpClient && h('div', { style: { display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 } },
          h('button', {
            className: 'btn btn-sm btn-outline', disabled: !Replay.actions.length,
            title: Replay.actions.length ? '逐步回放本局' : '本局没有可回放的记录',
            onClick: () => setReplayOpen({ data: null }),
          }, h(Icon.Play, { size: 12 }), '观看回放'),
          h('button', {
            className: 'btn btn-sm btn-outline',
            onClick: () => {
              const code = window.prompt('粘贴回放码：');
              if (!code) return;
              try { setReplayOpen({ data: replayImportCode(code) }); }
              catch (e) { window.alert('回放码无效：' + ((e && e.message) || e)); }
            },
          }, h(Icon.Copy, { size: 12 }), '导入回放码'),
        ),
      ),
    ),
    reconnecting && h('div', { className: 'overlay', style: { zIndex: 100 } },
      h('div', { className: 'panel', style: { textAlign: 'center', padding: 32 } },
        h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: 16 } }, h(Icon.Undo2, { size: 46 })),
        h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 22, fontWeight: 'bold', marginBottom: 8 } }, '连接断开'),
        h('p', { style: { fontSize: 14, color: 'var(--c-text-dim)' } }, '正在尝试重新连接...'),
      ),
    ),
    // ── D1：回放查看器（最高层覆盖）──
    replayOpen && h(ReplayView, { data: replayOpen.data, onClose: () => setReplayOpen(null) }),
    paused && h('div', { className: 'overlay' },
      h('div', { className: 'panel', style: { textAlign: 'center', padding: 32 } },
        h('span', { style: { fontSize: 48, display: 'block', marginBottom: 16 } }, h(Icon.Pause, { size: 48 })),
        h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 22, fontWeight: 'bold', marginBottom: 8 } }, '游戏已暂停'),
        isHost && h('button', { className: 'btn btn-primary', onClick: () => setPaused(false), style: { marginTop: 16 } }, h(Icon.Play, { size: 16 }), '继续游戏'),
      ),
    ),
    // ── P1-1：退出二次确认（防误触毁局；联机局明示信誉分代价）──
    quitConfirm && h('div', { className: 'overlay', onClick: e => { if (e.target === e.currentTarget) setQuitConfirm(false); } },
      h('div', { className: 'panel animate-slide-up', style: { textAlign: 'center', padding: 28, width: '90%', maxWidth: 340 } },
        h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 20, fontWeight: 'bold', marginBottom: 10 } }, '退出游戏'),
        h('p', { style: { fontSize: 14, color: 'var(--c-text-dim)', lineHeight: 1.6 } },
          st.spectateId != null ? '确定退出观战？'
            : mode === 'multiplayer'
              ? (currentUser && calcQuitPenalty(st) > 0 ? `中途退出将扣除 ${calcQuitPenalty(st)} 信誉分，确定退出？` : '确定退出当前联机房间？')
              : '本局进度将丢失，确定退出？'),
        h('div', { style: { display: 'flex', gap: 10, marginTop: 18, justifyContent: 'center' } },
          h('button', { className: 'btn btn-primary', onClick: () => setQuitConfirm(false) }, h(Icon.Play, { size: 14 }), '继续游戏'),
          h('button', { className: 'btn btn-outline', style: { color: 'hsl(0 60% 60%)', borderColor: 'hsl(0 40% 30%)' }, onClick: () => { setQuitConfirm(false); quitGame(); } }, '确定退出'),
        ),
      ),
    ),
    mode === 'multiplayer' && h('div', { style: { position: 'fixed', right: 16, bottom: 16, zIndex: 60 } },
      chatOpen && h('div', { className: 'panel', style: { width: 280, maxHeight: 320, display: 'flex', flexDirection: 'column', marginBottom: 8, padding: 0, overflow: 'hidden' } },
        h('div', { style: { padding: '10px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          '聊天',
          h('button', { className: 'btn btn-sm btn-ghost', onClick: () => setChatOpen(false), style: { padding: '12px 14px', margin: '-10px -12px', height: 'auto' } }, '✕'), // P3-8：热区扩至约40px，负margin保持视觉占位
        ),
        h('div', { style: { flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200 } },
          chatMsgs.length === 0 && h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', textAlign: 'center', padding: 16 } }, '暂无消息'),
          chatMsgs.map((m, i) => h('div', { key: i, style: { fontSize: 12, border: '1px solid var(--c-border)', borderRadius: 8, padding: '5px 9px', background: 'var(--c-border-soft)' } },
            h('span', { style: { color: 'var(--c-accent)', fontWeight: 600 } }, m.name + ': '),
            h('span', { style: { color: 'hsl(0 8% 78%)' } }, m.text)
          ))
        ),
        h('div', { style: { display: 'flex', gap: 4, padding: 8, borderTop: '1px solid var(--c-border)' } },
          h('input', {
            type: 'text',
            value: chatInput,
            onChange: e => setChatInput(e.target.value),
            onKeyDown: e => { if (e.key === 'Enter') sendChat(); },
            placeholder: '输入消息...',
            maxLength: 100,
            style: { flex: 1, background: 'var(--c-border-soft)', border: '1px solid hsl(0 12% 20%)', borderRadius: 6, padding: '6px 10px', color: 'hsl(0 8% 88%)', fontSize: 12, outline: 'none' }
          }),
          h('button', { className: 'btn btn-sm btn-primary', onClick: sendChat, style: { padding: '4px 10px' } }, '发送'),
        )
      ),
      h('button', {
        className: 'btn btn-primary',
        onClick: () => setChatOpen(o => !o),
        style: { width: 48, height: 48, borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }
      }, h(Icon.MessageCircle, { size: 16 })),
    ),
    h(ToastBox),
  );
}

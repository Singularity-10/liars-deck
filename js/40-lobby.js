// @ts-nocheck
// ═══ 联机大厅 ═══════════════════════════════════════════════════
// 依赖：依赖 40-icons（Icon）+ 40-audio（Sfx）
// ── 联机大厅 ──────────────────────────────────────────────────────────
function Lobby({ onStart, onMultiStart, onBack, user, onLogout }) {
  const [view, setView] = useState('menu');
  const [roomId, setRoomId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState(() => user?.name || (localStorage.getItem('__ld_name') || '').trim() || '玩家');
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [err, setErr] = useState('');
  const [netTest, setNetTest] = useState({ running: false, result: null, error: null });
  const [myPlayerId, setMyPlayerId] = useState(null);
  const myPlayerIdRef = useRef(null);
  const [mpDifficulty, setMpDifficulty] = useState('normal');
  const [joining, setJoining] = useState(false);
  const playersRef = useRef([]);
  useEffect(() => { playersRef.current = players; }, [players]);
  // 公开房间发现（08-lobby-beacon）：房主可见性 + 槽位信息亭 + 房间列表
  const [roomVis, setRoomVis] = useState('private');
  const [rooms, setRooms] = useState(null); // null=探测中
  const [browsing, setBrowsing] = useState(false);
  const mpDifficultyRef = useRef('normal');
  useEffect(() => { mpDifficultyRef.current = mpDifficulty; }, [mpDifficulty]);
  const roomIdRef = useRef(''); // 修复： 起 beacon info 引用未定义的 roomIdRef 致应答抛错（公开房间列表恒空）
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  const mpRef = useRef(null);
  useEffect(() => { localStorage.setItem('__ld_name', name); }, [name]);
  const cleanup = useCallback(() => { try { mpRef.current?.slotPeer?.destroy?.(); } catch (e) {} try { mpRef.current?.destroy?.(); } catch (e) {} mpRef.current = null; }, []);

  const runNetTest = useCallback(() => {
    if (netTest.running) return;
    setNetTest({ running: true, result: null, error: null });

    const stunUrls = [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ];

    let pc = null;
    let hasSrflx = false;
    let hasHost = false;
    let hasRelay = false;
    let candidateCount = 0;
    let timer = null;

    const finish = (success, errorMsg) => {
      if (timer) clearTimeout(timer);
      try { pc?.close(); } catch (e) {}
      pc = null;

      let verdict = 'unknown';
      let details = [];

      if (success) {
        if (hasSrflx) {
          verdict = 'good';
          details.push(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } }, h(Icon.CheckCircle2, { size: 14 }), '公网打洞成功，可以跨网P2P联机'));
        } else if (hasHost) {
          verdict = 'lan_only';
          details.push(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } }, h(Icon.TriangleAlert, { size: 14 }), '只能局域网联机，公网打洞失败'));
          details.push('可能原因：对称NAT、防火墙拦截、运营商限制');
        } else {
          verdict = 'fail';
          details.push(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } }, h(Icon.XCircle, { size: 14 }), '无法获取任何候选地址'));
        }
      } else {
        verdict = 'error';
        details.push(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } }, h(Icon.XCircle, { size: 14 }), '检测失败: ' + (errorMsg || '未知错误')));
      }

      details.unshift(`候选地址总数: ${candidateCount}`);
      if (hasHost) details.push('本地地址 (host): 有');
      if (hasSrflx) details.push('公网反射地址 (srflx): 有');
      if (hasRelay) details.push('中继地址 (relay): 有');

      setNetTest({ running: false, result: { verdict, details }, error: null });
    };

    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: stunUrls }]
      });

      pc.createDataChannel('nettest');

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          finish(true);
          return;
        }
        candidateCount++;
        const cand = e.candidate.candidate;
        if (cand.includes('typ host')) hasHost = true;
        if (cand.includes('typ srflx')) hasSrflx = true;
        if (cand.includes('typ relay')) hasRelay = true;
      };

      pc.onicecandidateerror = () => {};

      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(e => finish(false, e.message));

      timer = setTimeout(() => finish(true), 10000);

    } catch (e) {
      finish(false, e.message);
    }
  }, [netTest.running]);

  useEffect(() => {
    if (!isHost) return;
    if (!mpRef.current?.conns) return;
    mpRef.current.conns.forEach(ec => {
      if (ec.open) try { ec.send({ type: 'player_list', players: players.map(p => ({ ...p, isLocal: false })) }); } catch (e) {}
    });
  }, [players, isHost]);

  const ICE_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  };

  const broadcastPlayerList = useCallback((playerList) => {
    const mp = mpRef.current;
    if (!mp || !mp.conns) return;
    mp.conns.forEach(c => {
      try { if (c.open) c.send({ type: 'player_list', players: playerList }); } catch (e) {}
    });
  }, []);

  const createRoom = useCallback((visibility = 'private') => {
    if (user && user.reputation < 30) {
      setErr('信誉分低于30，无法创建房间');
      toast.error('信誉分不足（需≥30）');
      return;
    }
    setRoomVis(visibility === 'public' ? 'public' : 'private');
    try { cleanup(); } catch (e) {}
    const MAX_RETRIES = 5;
    let retries = 0;
    const genId = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    const hostPlayer = { id: 0, name: name || '房主', isHost: true, isLocal: true, isAI: false, ready: true };
    setPlayers([hostPlayer]);
    setIsHost(true);
    setView('wait');
    const tryCreate = (roomId) => {
      setRoomId(roomId);
      try {
        const peer = new Peer(`ld-${roomId}-h`, { debug: 0, config: ICE_CONFIG });
        mpRef.current = { peer, conns: [], destroy: () => peer.destroy() };
        peer.on('open', () => {
          // 信令断线自动重连：锁屏/切网后房主 peer 失联是"有时无法加入"主因之一
          peer.on('disconnected', () => {
            try { if (!peer.destroyed && peer.disconnected) { peer.reconnect(); toast.info('信令重连中…'); } } catch (e) {}
          });
          toast.success(`房间 ${roomId} 已创建`);
          // 公开房间：认领一个 beacon 槽位作为"信息亭"，应答大厅探测（房间信息每次实时读取）
          if (visibility === 'public') {
            claimLobbySlot(Peer, ICE_CONFIG, () => ({
              code: roomIdRef.current,
              hostName: playersRef.current[0]?.name || '房主',
              playerCount: playersRef.current.length,
              capacity: 4,
              inGame: !!mpRef.current?.inGame,
              difficulty: mpDifficultyRef.current,
            }), { onReclaim: (rc) => { if (mpRef.current) mpRef.current.slotPeer = rc.peer; } }).then(claimed => {
              if (claimed && mpRef.current) {
                mpRef.current.slotPeer = claimed.peer;
                if (typeof window !== 'undefined') window.__beaconDbg = { slot: claimed.slot, peer: claimed.peer };
                toast.info(`已公开（展示位 ${claimed.slot + 1}/${LOBBY_SLOTS}）`);
              } else if (!claimed) {
                toast.info('公开展示位已满，房间仍可通过房号加入');
              }
            });
          }
        });
        peer.on('connection', conn => {
          conn.on('open', () => {
            if (mpRef.current?.inGame && mpRef.current?.onReconnect) {
              mpRef.current.onReconnect(conn);
              return;
            }
          });
          conn.on('data', data => {
            if (data?.type === 'join') {
              const rep = data.reputation ?? 100;
              if (rep < 30) {
                try { conn.send({ type: 'join_rejected', reason: '信誉分低于30' }); } catch (e) {}
                try { conn.close(); } catch (e) {}
                return;
              }
              if (mpRef.current?.inGame) {
                try { conn.send({ type: 'join_rejected', reason: '游戏已开始' }); } catch (e) {}
                try { conn.close(); } catch (e) {}
                return;
              }
              mpRef.current.conns.push(conn);
              const maxId = playersRef.current.reduce((m, p) => Math.max(m, p.id), -1);
              const playerId = maxId + 1;
              conn.playerId = playerId;
              const np = { id: playerId, name: data.name || `玩家${playerId + 1}`, isHost: false, isLocal: false, isAI: false, ready: false, reputation: rep };
              setPlayers(prev => [...prev, np]);
              toast.info(`${np.name} 加入了房间`);
              try { conn.send({ type: 'welcome', playerId }); } catch (e) {}
            } else if (data?.type === 'ready') {
              setPlayers(prev => prev.map(p => p.id === data.playerId ? { ...p, ready: data.ready !== false, name: data.name || p.name } : p));
            } else if (data?.type === 'reconnect') {
              try { conn.send({ type: 'host_returned_lobby' }); } catch (e) {}
              try { conn.close(); } catch (e) {}
            }
          });
          conn.on('error', (e) => toast.error('连接异常: ' + e.message));
          conn.on('close', () => {
            if (mpRef.current?.inGame) return;
            const leftId = conn.playerId;
            if (mpRef.current) mpRef.current.conns = mpRef.current.conns.filter(ec => ec !== conn);
            setPlayers(prev => prev.filter(p => p.id !== leftId));
            toast.info('玩家离开了房间');
          });
        });
        peer.on('error', e => {
          console.error('PeerJS host error:', e.type, e);
          if (e.type === 'unavailable-id') {
            if (retries < MAX_RETRIES) {
              retries++;
              toast.info(`房间号冲突，重试中 (${retries}/${MAX_RETRIES})...`);
              try { peer.destroy(); } catch (_) {}
              tryCreate(genId());
            } else {
              setErr('房间号冲突，多次重试失败，请稍后再试');
              toast.error('创建失败(房间号冲突)');
            }
          } else if (e.type === 'network' || e.type === 'server-error') { setErr('信令服务器连接失败，请检查网络');
            toast.error('创建失败(' + e.type + ')'); } else if (e.type === 'peer-unavailable') { setErr('对方不在线');
            toast.error('创建失败(' + e.type + ')'); } else { setErr('创建失败(' + e.type + '): ' + e.message);
            toast.error('创建失败(' + e.type + ')'); }
        });
      } catch (e) { setErr('无法创建房间: ' + e.message); }
    };
    tryCreate(genId());
  }, [cleanup, name, user]);

  /* ：加入主体（可重试）。joinRoom 负责校验，这里负责握手与超时自动重试 */
  const joinRoomInner = (c, isRetry) => {
    let retryDone = isRetry;
    try {
      cleanup();
      const peer = new Peer({ debug: 0, config: ICE_CONFIG });
      mpRef.current = { peer, conns: [], destroy: () => peer.destroy() };
      peer.on('disconnected', () => {
        try { if (!peer.destroyed && peer.disconnected) peer.reconnect(); } catch (e) {}
      });
      peer.on('open', () => {
        const conn = peer.connect(`ld-${c}-h`, { reliable: true, serialization: 'json' });
        let connected = false;
        conn.on('open', () => {
          connected = true;
          setJoining(false);
          mpRef.current.conns.push(conn);
          conn.send({ type: 'join', name, reputation: user?.reputation ?? 100 });
          setRoomId(c);
          setIsHost(false);
          setView('wait');
          toast.success('已加入');
        });
        conn.on('data', (data) => {
          if (data?.type === 'join_rejected') {
            setErr(data.reason || '被房主拒绝');
            toast.error(data.reason || '加入被拒绝');
            setJoining(false);
            try { conn.close(); } catch (e) {}
            try { peer.destroy(); } catch (e) {}
            mpRef.current = null;
            return;
          }
          if (data?.type === 'welcome') {
            setMyPlayerId(data.playerId);
            myPlayerIdRef.current = data.playerId;
            setPlayers(prev => prev.map(p => ({ ...p, isLocal: p.id === data.playerId })));
          } else if (data?.type === 'player_list') {
            setPlayers(prev => {
              const myOld = prev.find(p => p.isLocal);
              return data.players.map(p => ({ ...p, isLocal: p.id === myPlayerId, ready: p.id === myPlayerId ? (myOld?.ready ?? p.ready) : p.ready }));
            });
          } else if (data?.type === 'difficulty') {
            setMpDifficulty(data.difficulty);
          } else if (data?.type === 'game_start') {
            let myId = myPlayerIdRef.current;
            const srcPlayers = data.players || players;
            if (myId === null) {
              const me = srcPlayers.find(p => !p.isHost && !p.isAI);
              if (me) {
                myId = me.id;
                setMyPlayerId(myId);
                myPlayerIdRef.current = myId;
              }
            }
            const gamePlayers = srcPlayers.map(p => ({
              ...p,
              isLocal: p.id === myId
            }));
            onMultiStart(roomId, gamePlayers, false, mpRef.current, mpDifficulty);
          }
        });
        conn.on('error', (e) => {
          console.error('Conn error:', e);
          setErr('连接房主失败: ' + (e.message || e));
          setJoining(false);
        });
        conn.on('close', () => {
          setJoining(false);
          if (mpRef.current?.inGame) return;
          setErr('与房主的连接已断开');
          setView('menu');
          setPlayers([]);
          setIsHost(false);
        });
        setTimeout(() => {
          if (connected) return;
          //：首次握手超时——销毁泄漏的 peer 后自动静默重试一次，二次失败才报错
          cleanup();
          if (!retryDone) {
            retryDone = true;
            toast.info('连接慢，自动重试中…');
            setTimeout(() => joinRoomInner(c, true), 300);
          } else {
            setErr('连接超时，请确认房主已创建房间后重试');
            setJoining(false);
          }
        }, 15000);
      });
      peer.on('error', e => {
        console.error('PeerJS client error:', e.type, e);
        setJoining(false);
        if (e.type === 'peer-unavailable') setErr('房间不存在或房主已离开，请确认房间号');
        else if (e.type === 'network' || e.type === 'server-error') setErr('信令服务器连接失败，请检查网络');
        else setErr('加入失败(' + e.type + '): ' + e.message);
        toast.error('加入失败(' + e.type + ')');
      });
    } catch (e) { setErr('无法加入: ' + e.message);
      setJoining(false); }
  };
  const joinRoom = useCallback((codeArg) => {
    const c = (typeof codeArg === 'string' ? codeArg : code).trim().toUpperCase();
    if (!c) { setErr('请输入房间号'); return; }
    if (!name.trim()) { setErr('请输入昵称'); setView('join'); return; }
    if (user && user.reputation < 30) {
      setErr('信誉分低于30，无法加入房间');
      toast.error('信誉分不足（需≥30）');
      return;
    }
    setJoining(true);
    setErr('');
    setRoomVis(null); // 客户端不显示可见性徽标（可见性是房主侧状态）
    joinRoomInner(c, false);
  }, [code, cleanup, name, user]);


  // 公开房间探测（beacon 槽位协议）：进入浏览页自动刷新一次
  const browseRooms = useCallback(() => {
    setRooms(null);
    setBrowsing(true);
    try {
      probeLobbyRooms(Peer, ICE_CONFIG, { timeout: 15000 }).then(list => {
        const sorted = [...(list || [])].sort((a, b) => ((a.inGame ? 1 : 0) - (b.inGame ? 1 : 0)) || String(a.code).localeCompare(String(b.code)));
        setRooms(sorted);
        setBrowsing(false);
      });
    } catch (e) { setRooms([]); setBrowsing(false); }
  }, []);
  useEffect(() => { if (view === 'browse') browseRooms(); }, [view, browseRooms]);

  const addAI = () => {
    if (players.length >= 4) return;
    const used = players.filter(p => p.isAI).map(p => p.name);
    const maxId = players.reduce((m, p) => Math.max(m, p.id), -1);
    const newId = maxId + 1;
    setPlayers(prev => [...prev, { id: newId, name: AI_NAMES.find(n => !used.includes(n)) || `AI`, isHost: false, isLocal: false, isAI: true, ready: true }]);
  };

  if (view === 'menu') return h('div', {
    className: 'animate-fade-in',
    style: { position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '3rem 1rem' }
  },
    user && h('div', {
      style: { position: 'absolute', top: 20, right: 20, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-panel-bg)', padding: '4px 12px', borderRadius: 20, border: '1px solid hsl(30 15% 25%)', zIndex: 20 }
    },
      h('span', { style: { fontSize: 12, color: 'hsl(35 30% 80%)' } }, h(Icon.User, { size: 12 }), ' ' + user.name),
      h('span', { style: { fontSize: 11, color: user.reputation >= 80 ? 'var(--c-success)' : user.reputation >= 50 ? 'var(--c-accent)' : 'hsl(0 70% 55%)', fontWeight: 600 } }, '信誉 ' + user.reputation),
      h('button', { className: 'btn btn-ghost', style: { padding: '2px 8px', fontSize: 11, color: 'hsl(0 8% 55%)' }, onClick: onLogout }, '登出'),
    ),
    h('p', { style: { color: 'var(--c-accent)', fontSize: 14, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 } }, '跨网联机'),
    h('h1', { style: { fontFamily: 'var(--font-title)', fontSize: 'clamp(2rem,7vw,3.5rem)', fontWeight: 'bold' } }, '骗子牌'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300, marginTop: 32 } },
      h('button', { className: 'btn btn-primary btn-lg', style: { width: '100%' }, onClick: () => { setErr(''); setView('create'); } }, h(Icon.Wifi, { size: 16 }), '创建房间'),
      h('button', { className: 'btn btn-outline btn-lg', style: { width: '100%' }, onClick: () => setView('join') }, h(Icon.Wifi, { size: 16 }), '加入房间'),
      h('button', {
        className: 'btn btn-ghost btn-lg',
        style: { width: '100%' },
        onClick: runNetTest,
        disabled: netTest.running
      }, netTest.running ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(Icon.Loader2, { size: 15 }), '检测中...') : h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(Icon.Search, { size: 15 }), '检测网络联机能力')),
      netTest.result && h('div', { style: { marginTop: 8, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 8, width: '100%', fontSize: 13, lineHeight: 1.6 } },
        netTest.result.details.map((d, i) => h('div', { key: i, style: { marginBottom: 4 } }, d))
      ),
      h('button', { className: 'btn btn-ghost btn-lg', style: { width: '100%' }, onClick: onBack }, h(Icon.ArrowLeft, { size: 16 }), '返回'),
    ),
  );

  if (view === 'create') return h('div', {
    className: 'animate-fade-in',
    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '3rem 1rem', gap: 16 }
  },
    h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 20, fontWeight: 'bold' } }, '创建房间'),
    h('input', {
      className: 'input',
      style: { maxWidth: 280, textAlign: 'center' },
      value: name,
      onChange: e => setName(e.target.value),
      placeholder: '输入昵称',
      maxLength: 8
    }),
    h('button', {
      className: 'btn btn-primary btn-lg', style: { width: 280, display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px' },
      disabled: !name.trim(),
      onClick: () => { setErr(''); createRoom('public'); }
    },
      h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 17 } }, h(Icon.Globe, { size: 16 }), '公开房间'),
      h('span', { style: { fontSize: 11, opacity: 0.75, fontWeight: 400 } }, '出现在房间列表，任何人都可加入'),
    ),
    h('button', {
      className: 'btn btn-outline btn-lg', style: { width: 280, display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px' },
      disabled: !name.trim(),
      onClick: () => { setErr(''); createRoom('private'); }
    },
      h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 17 } }, h(Icon.Lock, { size: 16 }), '私密房间'),
      h('span', { style: { fontSize: 11, opacity: 0.65, fontWeight: 400 } }, '不出现在列表，仅凭 6 位房号加入'),
    ),
    err && h('p', { style: { fontSize: 13, color: 'var(--c-danger-deep)' } }, err),
    h('button', { className: 'btn btn-ghost', onClick: () => { setView('menu'); setErr(''); } }, h(Icon.ArrowLeft, { size: 16 }), '返回'),
  );

  // 浏览公开房间视图（beacon 槽位探测）
  if (view === 'browse') return h('div', {
    className: 'animate-fade-in',
    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '3rem 1rem', gap: 16 }
  },
    h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 20, fontWeight: 'bold' } }, '公开房间'),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 22 } },
      h('button', { className: 'btn btn-outline btn-sm', onClick: browseRooms, disabled: browsing },
        h(Icon.RefreshCw, { size: 14 }), browsing ? '搜索中...' : '刷新'),
      browsing && h(Icon.Loader2, { size: 15 }),
    ),
    rooms === null
      ? h('p', { style: { fontSize: 14, color: 'hsl(0 0% 60%)' } }, '正在搜索公开房间...')
      : rooms.length === 0
        ? h('p', { style: { fontSize: 14, color: 'hsl(0 0% 60%)' } }, '暂无公开房间——可以让朋友先开一个')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 340 } },
            rooms.map(r => {
              const full = (r.playerCount ?? 0) >= (r.capacity ?? 4);
              const dead = r.inGame || full;
              return h('div', {
                key: r.code,
                className: 'panel',
                style: { padding: '12px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, opacity: dead ? 0.55 : 1, cursor: dead ? 'default' : 'pointer' },
                onClick: () => {
                  if (dead) { toast.warning(r.inGame ? '该房间游戏已开始' : '该房间已满员'); return; }
                  setCode(String(r.code));
                  setView('join');
                  joinRoom(String(r.code));
                }
              },
                h('div', { style: { fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', letterSpacing: '0.15em' } }, r.code),
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('div', { style: { fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (r.hostName || '房主') + ' 的房间'),
                  h('div', { style: { fontSize: 11, color: 'hsl(0 0% 55%)' } }, `${r.playerCount ?? 1}/${r.capacity ?? 4} 人`),
                ),
                h('span', {
                  style: { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, color: r.inGame ? 'hsl(0 0% 60%)' : full ? 'hsl(30 20% 50%)' : 'hsl(142 60% 45%)', border: '1px solid hsl(30 15% 25%)' }
                }, r.inGame ? '游戏中' : full ? '已满' : '等待中'),
              );
            })
          ),
    err && h('p', { style: { fontSize: 13, color: 'var(--c-danger-deep)' } }, err),
    h('button', { className: 'btn btn-ghost', onClick: () => { setView('join'); setErr(''); } }, h(Icon.ArrowLeft, { size: 16 }), '返回'),
  );

  if (view === 'join') return h('div', {
    className: 'animate-fade-in',
    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '3rem 1rem', gap: 16 }
  },
    h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 20, fontWeight: 'bold' } }, '加入房间'),
    h('input', {
      className: 'input',
      style: { maxWidth: 280, textAlign: 'center', fontSize: 18, letterSpacing: '0.3em', fontFamily: 'monospace' },
      value: code,
      // P2-6：手机弹数字键盘 + 自动聚焦 + 清洗非法字符（房号字符集=大写字母+2-9）
      inputMode: 'numeric',
      autoFocus: true,
      onChange: e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '')),
      placeholder: '输入 6 位房间号',
      maxLength: 6
    }),
    h('input', {
      className: 'input',
      style: { maxWidth: 280, textAlign: 'center' },
      value: name,
      onChange: e => setName(e.target.value),
      placeholder: '输入昵称',
      maxLength: 8
    }),
    err && h('p', { style: { fontSize: 13, color: 'var(--c-danger-deep)' } }, err),
    h('button', {
      className: 'btn btn-primary btn-lg',
      disabled: !code.trim() || !name.trim() || joining,
      onClick: joinRoom,
      style: { width: 280 }
    }, joining ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(Icon.Loader2, { size: 15 }), '连接中...') : (!code.trim() ? '请输入房间号' : (!name.trim() ? '请输入昵称' : '加入房间'))),
    h('button', { className: 'btn btn-ghost', onClick: () => { setErr(''); setView('browse'); } }, h(Icon.Search, { size: 15 }), '浏览公开房间'),
    h('button', { className: 'btn btn-ghost', onClick: () => { setView('menu');
        setErr(''); } }, h(Icon.ArrowLeft, { size: 16 }), '返回'),
  );

  return h('div', {
    className: 'animate-fade-in',
    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '3rem 1rem', gap: 16 }
  },
    h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 20, fontWeight: 'bold', marginBottom: 4 } }, '等待大厅'),
    h('div', {
      className: 'panel',
      style: { padding: 16, width: '100%', maxWidth: 340, display: 'flex', alignItems: 'center', gap: 14, borderRadius: 12 }
    },
      h('div', { style: { width: 44, height: 44, borderRadius: 10, background: 'rgba(180,30,30,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
        h(Icon.Users, { size: 22, color: 'hsl(0 70% 55%)' }),
      ),
      h('div', { style: { flex: 1 } },
        h('p', { style: { fontSize: 11, color: 'var(--c-text-dim)', marginBottom: 2 } }, '房间号'),
        h('p', { style: { fontSize: 26, fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '0.15em', color: 'var(--c-text-bright)' } }, roomId),
        roomVis != null && h('p', { style: { fontSize: 10, marginTop: 2, color: roomVis === 'public' ? 'hsl(142 60% 50%)' : 'hsl(0 0% 55%)', display: 'inline-flex', alignItems: 'center', gap: 4 } },
          roomVis === 'public' ? h(Icon.Globe, { size: 10 }) : h(Icon.Lock, { size: 10 }),
          roomVis === 'public' ? '公开 · 可被搜索加入' : '私密 · 仅房号加入'),
      ),
      h('button', {
        className: 'btn btn-ghost',
        style: { width: 36, height: 36, borderRadius: 8, padding: 0, flexShrink: 0 },
        onClick: () => { copyText(roomId).then(function (ok) {
          if (ok) toast.success('房间号已复制');
          else toast.error('复制失败，房间号：' + roomId); // 兜底：文本直接展示供手动记录
        }); }
      }, h(Icon.Copy, { size: 18 })),
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
      h('span', { style: { color: 'var(--c-success)', display: 'inline-flex' } }, h(Icon.Wifi, { size: 14 })),
      h('span', { style: { fontSize: 13, color: 'var(--c-success)', fontWeight: 500 } }, '已连接'),
    ),
    h('div', { style: { width: '100%', maxWidth: 340 } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' } },
        h('span', { style: { fontSize: 14, fontWeight: 600, color: 'hsl(30 15% 80%)' } }, h(Icon.Users, { size: 13 }), ` 玩家 (${players.length}/4)`),
        isHost && players.length < 4 && h('button', { className: 'btn btn-sm btn-outline', onClick: addAI, style: { padding: '4px 10px', fontSize: 12 } }, h(Icon.Bot, { size: 12 }), '添加AI'),
      ),
      players.map((p, i) => h('div', {
        key: i,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          marginBottom: 8,
          background: p.isLocal ? 'rgba(180,30,30,0.08)' : 'var(--c-panel-bg)',
          border: `1px solid ${p.isLocal ? 'rgba(180,30,30,0.4)' : 'var(--c-border)'}`,
          borderRadius: 10,
          position: 'relative'
        }
      },
        h('div', {
          style: {
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: `2px solid ${p.isLocal ? 'hsl(0 70% 55%)' : 'hsl(0 12% 25%)'}`,
            background: p.isLocal ? 'rgba(180,30,30,0.15)' : 'var(--c-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }
        },
          h('span', { style: { display: 'inline-flex', color: p.isAI ? 'var(--c-accent)' : 'inherit' } }, p.isAI ? (aiCrest(p, 19) || h(Icon.Bot, { size: 17 })) : (p.isLocal ? h(Icon.User, { size: 17 }) : h(Icon.Globe, { size: 17 }))),
        ),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: 14, fontWeight: 600, color: 'var(--c-text)' } }, ' ' + p.name),
            p.isHost && h('span', { style: { display: 'inline-flex', color: 'var(--c-accent)' } }, h(Icon.Crown, { size: 13 })),
            p.isLocal && h('span', { style: { fontSize: 11, color: 'hsl(0 70% 55%)', fontWeight: 500 } }, '你'),
            p.ready && !p.isHost && h('span', { style: { fontSize: 10, background: 'rgba(34,197,94,0.15)', color: 'hsl(142 71% 45%)', padding: '1px 6px', borderRadius: 4 } }, '已准备'),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 } },
            !p.isAI && h('span', { style: { fontSize: 11, color: (p.reputation ?? 100) >= 30 ? 'var(--c-success)' : 'hsl(0 70% 55%)' } }, '信誉' + (p.reputation ?? 100)),
            !p.isAI && h('span', { style: { fontSize: 11, color: 'var(--c-success)' } }, h(Icon.Wifi, { size: 11 }), ' 已连接'),
            p.isAI && h('span', { style: { fontSize: 11, color: 'hsl(0 8% 45%)' } }, 'AI 对手'),
          ),
        ),
        !p.isLocal && isHost && h('button', {
          className: 'btn btn-ghost',
          onClick: () => {
            if (mpRef.current?.conns) {
              const targetConn = mpRef.current.conns.find(c => c.playerId === p.id);
              if (targetConn) { try { targetConn.close(); } catch (e) {} }
            }
            setPlayers(prev => prev.filter(pp => pp.id !== p.id));
          },
          style: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', padding: 0, fontSize: 14, color: 'hsl(0 8% 45%)' }
        }, '×'),
      )),
      players.length < 4 && h('div', { style: { textAlign: 'center', padding: '12px 0', color: 'hsl(0 8% 40%)', fontSize: 13 } },
        h(Icon.Users, { size: 13 }), ` 等待更多玩家加入... (${players.length}/4)`
      ),
    ),
    err && h('p', { style: { fontSize: 13, color: 'var(--c-danger-deep)' } }, err),
    isHost ?
      h('div', { style: { width: '100%', maxWidth: 320, marginTop: 8 } },
        h('p', { style: { fontSize: 12, color: 'hsl(0 0% 60%)', marginBottom: 4, textAlign: 'left' } }, '房主昵称：'),
        h('input', {
          className: 'input',
          style: { width: '100%' },
          value: name,
          onChange: e => {
            const newName = e.target.value;
            setName(newName);
            setPlayers(prev => {
              const updated = prev.map((p, i) => i === 0 ? { ...p, name: newName } : p);
              if (mpRef.current?.conns) {
                const forClients = updated.map(p => ({ ...p, isLocal: false }));
                mpRef.current.conns.forEach(c => {
                  try { if (c.open) c.send({ type: 'player_list', players: forClients }); } catch (e) {}
                });
              }
              return updated;
            });
          },
          placeholder: '输入昵称',
          maxLength: 8
        }),
        h('div', { style: { marginTop: 12 } },
          h('p', { style: { fontSize: 12, color: 'hsl(0 0% 60%)', marginBottom: 6, textAlign: 'left' } }, '游戏难度：'),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', {
              className: 'btn btn-sm ' + (mpDifficulty === 'normal' ? 'btn-primary' : 'btn-outline'),
              style: { flex: 1 },
              onClick: () => {
                setMpDifficulty('normal');
                if (mpRef.current?.conns) {
                  mpRef.current.conns.forEach(c => {
                    try { if (c.open) c.send({ type: 'difficulty', difficulty: 'normal' }); } catch (e) {}
                  });
                }
              }
            }, '普通'),
            h('button', {
              className: 'btn btn-sm ' + (mpDifficulty === 'hard' ? 'btn-primary' : 'btn-outline'),
              style: { flex: 1 },
              onClick: () => {
                setMpDifficulty('hard');
                if (mpRef.current?.conns) {
                  mpRef.current.conns.forEach(c => {
                    try { if (c.open) c.send({ type: 'difficulty', difficulty: 'hard' }); } catch (e) {}
                  });
                }
              }
            }, '困难'),
          ),
        ),
        h('button', {
          className: 'btn btn-primary btn-lg',
          disabled: players.length !== 4 || !players.every(p => p.ready) || players.some(p => (p.reputation ?? 100) < 30),
          onClick: () => {
            if (players.some(p => (p.reputation ?? 100) < 30)) { toast.error('有玩家信誉分低于30，无法开始'); return; }
            if (mpRef.current?.conns) {
              mpRef.current.conns.forEach(c => {
                try { if (c.open) c.send({ type: 'game_start', players: players }); } catch (e) {}
              });
            }
            onMultiStart(roomId, players, isHost, mpRef.current, mpDifficulty);
          },
          style: { width: '100%', marginTop: 8 }
        }, players.length !== 4 ? `需要4名玩家（当前${players.length}/4）` : (!players.every(p => p.ready) ? '等待所有玩家准备' : (players.some(p => (p.reputation ?? 100) < 30) ? '有玩家信誉分不足' : '开始游戏'))),
      ) :
      h('button', {
        className: players.find(p => p.isLocal)?.ready ? 'btn btn-outline btn-lg' : 'btn btn-primary btn-lg',
        disabled: !mpRef.current?.conns?.[0]?.open || myPlayerId === null,
        onClick: () => {
          const conn = mpRef.current?.conns?.[0];
          const amReady = players.find(p => p.isLocal)?.ready;
          if (conn && conn.open && myPlayerId !== null) {
            try { conn.send({ type: 'ready', playerId: myPlayerId, name: name, ready: !amReady }); } catch (e) {}
            setPlayers(prev => prev.map(p => p.isLocal ? { ...p, ready: !amReady } : p));
          }
        },
        style: { width: '100%', maxWidth: 320 }
      }, players.find(p => p.isLocal)?.ready ? '取消准备' : '准备'),
    h('button', {
      className: 'btn btn-ghost',
      onClick: () => { cleanup();
        setView('menu');
        setPlayers([]);
        setErr('');
        setIsHost(false);
        setMyPlayerId(null);
        myPlayerIdRef.current = null;
        setMpDifficulty('normal');
        setJoining(false);
        setRoomId('');
        setCode(''); }
    }, h(Icon.ArrowLeft, { size: 16 }), '返回'),
  );
}

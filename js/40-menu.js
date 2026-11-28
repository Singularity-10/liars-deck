// ═══ 主菜单域：存档导入导出 / 登录弹窗 / 主菜单（含 AI 配置、设置、规则页） ═══════════════════════════════════════════════════
// 依赖：依赖 40-icons（Icon）
// ── 存档导出/导入（ 批次三）：打包全部 ld_/‗ld_/liar_ 键（排除登录态） ──
const SAVE_EXCLUDE = ['ld_session'];
/**
 * 全量存档导出：收集 ld_/__ld_/liar_ 前缀键（排除登录态）→ JSON 串
 * @returns {string}
 */
function exportSave() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!/^(ld_|__ld_|liar_)/.test(k) || SAVE_EXCLUDE.indexOf(k) >= 0) continue;
    out[k] = localStorage.getItem(k);
  }
  return JSON.stringify({ app: 'liar-tavern', v: 1, ts: Date.now(), data: out });
}
/**
 * 存档导入：校验信封后按同一前缀白名单写回 localStorage
 * @param {string} text
 * @returns {number} 写入键数（0 抛错）
 */
function importSave(text) {
  const j = JSON.parse(text); // 解析失败直接抛给调用方
  if (!j || typeof j !== 'object' || !j.data) throw new Error('bad save');
  let n = 0;
  Object.keys(j.data).forEach(function (k) {
    if (!/^(ld_|__ld_|liar_)/.test(k) || SAVE_EXCLUDE.indexOf(k) >= 0) return;
    localStorage.setItem(k, String(j.data[k])); n++;
  });
  if (!n) throw new Error('empty save');
  return n;
}
/**
 * 存档文本触发浏览器下载
 * @param {string} text
 */
function downloadSave(text) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'liar-tavern-save.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  } catch (e) {}
}

function useTavernAmbience() {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPlaying(TavernAudio.isPlaying());
    return TavernAudio.addListener(setPlaying);
  }, []);
  return { isPlaying: playing, toggle: TavernAudio.toggle, start: TavernAudio.start };
}

// ── 登录/注册弹窗 ────────────────────────────────────────────────────
//：通用退出动画 hook——visible=false 后保留 dur 毫秒播退出动画再卸载
// 返回 [是否渲染, 是否退出中]；退出中时外层加 overlay-exit、panel 加 panel-exit
function useExitAnim(visible, dur) {
  const [render, setRender] = useState(visible);
  const closing = render && !visible;
  useEffect(function () {
    if (visible) { setRender(true); return; }
    if (render) {
      const t = setTimeout(function () { setRender(false); }, dur);
      return function () { clearTimeout(t); };
    }
  }, [visible, render]);
  return [render, closing];
}

function AuthModal({ onAuth, onClose, onCloseWrap }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr('');
    if (!name.trim() || !pwd) { setErr('请填写用户名和密码'); return; }
    setLoading(true);
    try {
      if (mode === 'register') {
        if (pwd !== pwd2) { setErr('两次密码不一致');
          setLoading(false); return; }
        const r = await registerUser(name, pwd);
        if (!r.ok) { setErr(r.msg);
          setLoading(false); return; }
        onAuth({ name, ...r.user });
      } else {
        const r = await loginUser(name, pwd);
        if (!r.ok) { setErr(r.msg);
          setLoading(false); return; }
        onAuth({ name, ...r.user });
      }
    } catch (e) { setErr('操作失败: ' + e.message); }
    setLoading(false);
  };

  return h('div', {
    className: 'overlay' + (onCloseWrap ? ' overlay-exit' : ''),
    style: { zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: onCloseWrap ? 'fade-out .25s ease forwards' : 'fade-in 0.2s ease' }
  },
    h('div', {
      className: 'panel',
      style: { width: '100%', maxWidth: 360, padding: 28, textAlign: 'center', animation: onCloseWrap ? 'slide-down-out .25s ease forwards' : 'modal-pop 0.25s cubic-bezier(0.16,1,0.3,1)', position: 'relative' }
    },
      h('button', {
        className: 'btn btn-ghost',
        style: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: '50%', padding: 0, fontSize: 18, color: 'var(--c-text-dim)' },
        onClick: onClose
      }, '×'),
      h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 24, fontWeight: 'bold', marginBottom: 4, color: 'var(--c-text-bright)' } }, '骗子牌酒馆'),
      h('p', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginBottom: 20 } }, mode === 'login' ? '登录账号以使用联机功能' : '注册新账号'),
      h('div', { style: { display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--c-text-faint)' } },
        h('button', {
          className: mode === 'login' ? 'btn-primary' : 'btn-ghost',
          style: { flex: 1, borderRadius: 0, padding: '8px 0', fontSize: 12 },
          onClick: () => { setMode('login');
            setErr(''); }
        }, '登录'),
        h('button', {
          className: mode === 'register' ? 'btn-primary' : 'btn-ghost',
          style: { flex: 1, borderRadius: 0, padding: '8px 0', fontSize: 12 },
          onClick: () => { setMode('register');
            setErr(''); }
        }, '注册'),
      ),
      h('input', {
        type: 'text',
        placeholder: '用户名',
        value: name,
        onChange: e => setName(e.target.value),
        maxLength: 12,
        style: { width: '100%', padding: '10px 14px', marginBottom: 10, background: 'var(--c-surface)', border: '1px solid var(--c-text-faint)', borderRadius: 8, color: 'var(--c-text-bright)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
      }),
      h('input', {
        type: 'password',
        placeholder: '密码',
        value: pwd,
        onChange: e => setPwd(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') submit(); },
        style: { width: '100%', padding: '10px 14px', marginBottom: 10, background: 'var(--c-surface)', border: '1px solid var(--c-text-faint)', borderRadius: 8, color: 'var(--c-text-bright)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
      }),
      mode === 'register' && h('input', {
        type: 'password',
        placeholder: '确认密码',
        value: pwd2,
        onChange: e => setPwd2(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') submit(); },
        style: { width: '100%', padding: '10px 14px', marginBottom: 10, background: 'var(--c-surface)', border: '1px solid var(--c-text-faint)', borderRadius: 8, color: 'var(--c-text-bright)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
      }),
      err && h('p', { style: { color: 'var(--c-danger-bright)', fontSize: 12, marginBottom: 10 } }, err),
      h('button', {
        className: 'btn btn-primary',
        style: { width: '100%', padding: '10px 0' },
        disabled: loading,
        onClick: submit
      }, loading ? '请稍候...' : (mode === 'login' ? '登 录' : '注 册')),
      h('p', {
        style: { fontSize: 10, color: 'var(--c-text-dim)', marginTop: 12, lineHeight: 1.5 }
      }, '账号仅保存在本机浏览器（不上传服务器）· 信誉分初始100 · 每日恢复50 · 联机中途退出扣分'),
    )
  );
}

// ── 主菜单 ───────────────────────────────────────────────────────────
function MainMenu({ onStart, onMultiplayer, user, onLogout, skipAnim }) {
  const [rules, setRules] = useState(false);
  const [rulesR, rulesClosing] = useExitAnim(rules, 250);
  const [fast, setFast] = useState(false); //：点击加速入场动画
  const [settings, setSettings] = useState(false);
  const [settingsR, settingsClosing] = useExitAnim(settings, 250);
  const [diff, setDiff] = useState('normal');
  const [playMode, setPlayMode] = useState('cards'); // v111：单机玩法——cards 经典牌局 | dice 大话骰
  const [setupView, setSetupView] = useState(null); // v140：null=酒馆门户 | 'setup'=游戏配置屏（玩法/难度/模式三段）
  const [mpMode, setMpMode] = useState(false); // v140：配置屏模式——false=单机 | true=联机
  const [menuMode, setMenuMode] = useState('single'); //：开始游戏=单机/联机合并入口，下方选择模式
  const [showAch, setShowAch] = useState(false);
  const [achR, achClosing] = useExitAnim(showAch, 250);
  const [achData, setAchData] = useState(null);
  const incRoulette = true; // v86：锁定开启（设置项已移除——概率递增即标准玩法）
  const autoSort = true; // v86：锁定开启（设置项已移除——目标牌自动排列在最前）
  const [themeTick, setThemeTick] = useState(0); // C3：主题切换刷新高亮
  const [themeExt, setThemeExt] = useState(function () { try { return localStorage.getItem('ld_theme_ext') === '1'; } catch (e) { return false; } }); //：额外主题解锁开关（默认关，仅酒馆）
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [showStats, setShowStats] = useState(false); // P1-2：战绩面板
  const [showHistory, setShowHistory] = useState(false); // v106：版本编年史
  const [aiSpeedTick, setAiSpeedTick] = useState(0); // v108：AI 节奏按钮文案刷新
  const [historyR, historyClosing] = useExitAnim(showHistory, 250);
  const [aiCfgR, aiCfgClosing] = useExitAnim(showAIConfig, 250);
  const [selectedAIs, setSelectedAIs] = useState([0, 1, 2]);
  // 牌局音效偏好存 Sfx 'liar_sfx'——总闸关时不改子偏好，只执行静音，开闸按偏好恢复）
  const [soundOn, setSoundOn] = useState(function () { try { return localStorage.getItem('ld_sound_master') !== '0'; } catch (e) { return true; } });
  // v100：跳过惩罚动画偏好（轮盘演出压缩为直接显示结果）
  const [skipPenalty, setSkipPenalty] = useState(function () { try { return localStorage.getItem('ld_skip_penalty') === '1'; } catch (e) { return false; } });
  const setSkipPenaltyPref = function (next) {
    setSkipPenalty(next);
    try { localStorage.setItem('ld_skip_penalty', next ? '1' : '0'); } catch (e) {}
  };
  // v102：背景 3D 倾斜（默认开；iOS 首次开启需允许传感器权限）
  const [bgTilt, setBgTilt] = useState(function () { try { return localStorage.getItem('ld_bg_tilt') !== '0'; } catch (e) { return true; } });
  const setBgTiltPref = function (next) {
    setBgTilt(next);
    try { localStorage.setItem('ld_bg_tilt', next ? '1' : '0'); } catch (e) {}
    if (typeof BgTilt !== 'undefined' && BgTilt) {
      if (next) BgTilt.requestPermission(); // iOS 13+ 手势内请求；拒绝则收不到事件，背景保持静止
      BgTilt.setEnabled(next);
    }
  };
  // G3：语言变化时强制重渲染（词典在模块层，state 树不感知）
  const [, setLangVer] = useState(0);
  useEffect(function () { return subLang(function () { setLangVer(function (v) { return v + 1; }); }); }, []);
  const [musicSel, setMusicSel] = useState(false); // 氛围子开关偏好（不持久化：重进主菜单默认静，与原 musicOn 初始语义一致）
  const [sfxOn, setSfxOn] = useState(Sfx.getEnabled());
  // 刷新恢复：master=off 时同步两路静音（Sfx 全局态默认开，须显式压下）
  useEffect(function () {
    if (soundOn) return;
    TavernAudio.stop();
    Sfx.setEnabled(false);
  }, []);
  const setSoundMaster = function (next) {
    setSoundOn(next);
    try { localStorage.setItem('ld_sound_master', next ? '1' : '0'); } catch (e) {}
    if (next) {
      Sfx.setEnabled(sfxOn); // 按子开关偏好恢复
      if (musicSel) TavernAudio.start();
    } else {
      TavernAudio.stop();
      Sfx.setEnabled(false); // 全静；sfxOn/musicSel 偏好保持，开闸即恢复
    }
  };
  // 批次三：存档导入展开态与粘贴文本
  const [saveIO, setSaveIO] = useState(false);
  const [saveText, setSaveText] = useState('');
  // LLM 大脑：开关（默认关）/折叠态/Key/模型/测试中
  const [llmOn, setLlmOn] = useState(function () { try { return localStorage.getItem('liar_llm_on') === '1'; } catch (e) { return false; } });
  const [llmFold, setLlmFold] = useState(false);
  const [llmKey, setLlmKey] = useState(function () { return LlmAI.getConfig().key; });
  const [llmModel, setLlmModel] = useState(function () { return LlmAI.getConfig().model; });
  const [llmTesting, setLlmTesting] = useState(false);
  const [qLocalOn, setQLocalOn] = useState(function () { try { return localStorage.getItem('liar_q_local') === '1'; } catch (e) { return false; } });
  const [thinkOpen, setThinkOpen] = useState(false);
  const [, setThinkTick] = useState(0);
  // 思考日志打开期间每 2s 轮询刷新（决策发生在其他 effect，需主动同步）
  useEffect(function () {
    if (!thinkOpen) return undefined;
    var id = setInterval(function () { setThinkTick(function (v) { return v + 1; }); }, 2000);
    return function () { clearInterval(id); };
  }, [thinkOpen]);
  //：入场动画全部播完（最晚元素 2.6s delay + 0.8s = 3.4s）后，自动删除"点击任意位置加速"提示
  const [hintGone, setHintGone] = useState(false);
  useEffect(function () {
    if (skipAnim) return undefined;
    var t = setTimeout(function () { setHintGone(true); }, 3400);
    return function () { clearTimeout(t); };
  }, []);

  const toggleAI = (idx) => {
    if (selectedAIs.includes(idx)) {
      if (selectedAIs.length > 1) setSelectedAIs(selectedAIs.filter(i => i !== idx));
    } else if (selectedAIs.length < 3) {
      setSelectedAIs([...selectedAIs, idx]);
    }
  };

  const handleStart = function (pm) {
    var cfgs = selectedAIs.map(function (i) { return AI_PRESETS[i]; }); // v124：预设定值（滑条编辑已删）
    onStart(diff, cfgs, selectedAIs, incRoulette, autoSort, 5, pm || playMode); //：上限锁定 5（设置开关已移除）；v113 玩法由模式选择弹层传入
  };

  return h('div', {
    className: skipAnim ? 'no-enter-anim' : (fast ? 'menu-fast' : ''),
    onClick: function () { setFast(true); }, //：点击加速入场动画（氛围层是兄弟节点不受波及）
    style: { position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100svh', padding: '3rem 1rem' }
  },
    h('div', {
      style: { position: 'absolute', top: 20, right: 20, display: 'flex', alignItems: 'center', gap: 8, opacity: 0, animation: 'enter-settings 0.5s ease 2.2s forwards', zIndex: 20 }
    },
      user && h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-panel-bg)', padding: '4px 12px', borderRadius: 16, border: '1px solid hsl(30 15% 25%)' }
      },
        h('span', { style: { fontSize: 12, color: 'hsl(35 30% 80%)' } }, h(Icon.User, { size: 12 }), ' ' + user.name),
        h('span', { style: { fontSize: 12, color: user.reputation >= 80 ? 'var(--c-success)' : user.reputation >= 50 ? 'var(--c-accent)' : 'var(--c-danger-bright)', fontWeight: 600 } }, t('ui.reputation') + ' ' + user.reputation),
        h('button', { className: 'btn btn-ghost', style: { padding: '2px 8px', fontSize: 12, color: 'var(--c-text-dim)' }, onClick: onLogout }, t('ui.logout')),
      ),
      h('button', { 'aria-label': '打开设置', className: 'btn btn-ghost', style: { width: 40, height: 40, borderRadius: '50%', padding: 0 }, onClick: function () { setSettings(function (v) { return !v; }); } }, h(Icon.Settings, { size: 18 })),
    ),
    h('div', { style: { textAlign: 'center', marginBottom: 40 } },
      h('p', { style: { color: 'var(--c-accent)', fontSize: 14, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600, opacity: 0, animation: 'enter-subtitle 0.8s ease 0.2s forwards' } }, t('ui.subtitle')),
      h('h1', { style: { fontFamily: 'var(--font-title)', fontSize: 'clamp(2.5rem,8vw,5.5rem)', fontWeight: 'bold', letterSpacing: '-0.02em', opacity: 0, animation: 'enter-title 1s cubic-bezier(0.16,1,0.3,1) 0.7s forwards, enter-glow-pulse 2s ease 1.6s 1', /* v124 B 案：亮金渐变高光段拉宽+光晕恢复 */ backgroundImage: 'linear-gradient(170deg, #fdf3d0 0%, #e9c877 35%, #c8a36a 52%, #f0d896 72%, #c8a36a 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 0 16px rgba(233,200,119,0.45)) drop-shadow(0 2px 4px rgba(0,0,0,0.7))' } }, t('ui.title')),
      h('p', { style: { fontSize: 18, color: 'var(--c-text-dim)', marginTop: 8, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0, animation: 'enter-en-title 0.8s ease 1.2s forwards' } },
        t('ui.titleEn') + '  ·  ',
        // v106：版本号即编年史入口——点击查看重大改动历史对照
        h('span', {
          onClick: function () { setShowHistory(true); },
          style: { cursor: 'pointer', borderBottom: '1px dashed var(--c-text-dim)', padding: '0 2px' },
          title: '查看版本编年史',
        }, GAME_VERSION),
      ),
      h('div', {
        className: 'menu-divider',
        style: { marginTop: 16, height: 2, background: 'linear-gradient(90deg, transparent, var(--c-accent) 20%, var(--c-accent-bright) 50%, var(--c-accent) 80%, transparent)', borderRadius: 4, opacity: 0, width: 0, margin: '16px auto 0', animation: 'enter-divider 0.6s ease 1.5s forwards' }
      }),
    ),
    h('div', { style: { width: '100%', maxWidth: 480, marginBottom: 28, opacity: 0, animation: 'enter-rise 0.6s ease 1.6s forwards' } },
      h('button', {
        className: 'btn btn-outline',
        style: { width: '100%', justifyContent: 'space-between' },
        onClick: function () { setRules(function (v) { return !v; }); }
      },
        h('span', { style: { fontWeight: 600 } }, t('ui.rules')),
        h('span', { style: { transform: rules ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.25s' } }, '▼'),
      ),
      rulesR && h('div', { className: 'panel animate-slide-up' + (rulesClosing ? ' panel-exit' : ''), style: { marginTop: 12, padding: 20, background: 'var(--c-panel-strong)' } },
        GAME_RULES.filter(function (r0) { // v115：规则随玩法语境过滤（门户=全部；cards=牌局卡；dice=骰卡）
          if (!setupView) return true;
          return setupView === 'dice' ? r0.icon === 'Dices' : r0.icon !== 'Dices';
        }).map(function (r0, i, arr) { var r = Object.assign({}, r0, (I18N[getLang()].rules[r0.icon] || r0));
          return h('div', {
            key: i,
            style: { display: 'flex', gap: 12, marginBottom: i < arr.length - 1 ? 16 : 0, opacity: 0, animation: 'enter-slide-right 0.4s ease ' + (0.1 + i * 0.12) + 's forwards' }
          },
            h('span', { style: { flexShrink: 0, display: 'inline-flex' } }, h(Icon[r.icon] || Icon.Sparkles, { size: 22 })),
            h('div', null,
              h('h3', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, r.title),
              h('p', { style: { fontSize: 12, color: 'var(--c-text-dim)', lineHeight: 1.6 } }, r.desc),
            )
          );
        })
      ),
    ),
    aiCfgR && h('div', {
      className: 'panel' + (aiCfgClosing ? ' panel-exit' : ''),
      style: { width: '100%', maxWidth: 480, marginBottom: 20, padding: '14px 16px', animation: aiCfgClosing ? 'slide-down-out .25s ease forwards' : 'slide-up 0.4s ease forwards' }
    },
      h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--c-accent)' } }, t('ui.selAITitle')),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 } },
        AI_NAMES.map(function (name, i) {
          var isSelected = selectedAIs.indexOf(i) >= 0;
                    return h('button', {
            key: i,
            type: 'button',
            title: isSelected ? '已选 · 点击移出' : t('ui.pickAITip'),
            onClick: function () {
              // v124：参数编辑已删（八 AI 性格预设定值足够），点击=直接选/取消
              if (isSelected) { toggleAI(i); }
              else if (selectedAIs.length < 3) { toggleAI(i); }
              else { toast.info(t('ui.aiFullToast')); } // P2-4：选满时明确告知（右上角✕可一键腾位）
            },
            style: {
              position: 'relative',
              padding: '12px 10px',
              borderRadius: 8,
              border: '2px solid ' + (isSelected ? 'var(--c-accent)' : 'var(--c-border)'),
              background: isSelected ? 'rgba(176,141,87,0.12)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textAlign: 'center',
              opacity: isSelected ? 1 : 0.62,
            }
          },
          // P2-4：右上角 ✕ 徽标，一键移出（原需 点卡→编辑区→移出 三步）
          isSelected && h('div', {
            onClick: function (e) { e.stopPropagation(); toggleAI(i); },
            title: '移出本局对手',
            style: { position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: 'var(--c-danger)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.4)', zIndex: 2 }
          }, '✕'),
            h('div', { style: { color: 'var(--c-accent)', marginBottom: 4, display: 'inline-flex' } }, h(Icon[AI_CRESTS[i]], { size: 20 })),
                        h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--c-text)' } }, name), //：只展示名称
            // v124：参数只读展示（滑条编辑已删，八 AI 用预设定值）——诚实/质疑/手牌上限
            h('div', { style: { fontSize: 10, color: 'var(--c-accent)', marginTop: 3, fontFamily: 'monospace' } },
              '诚实 ' + AI_PRESETS[i].honestChance + '% · 质疑 ' + AI_PRESETS[i].challengeChance + '% · 上限 ' + AI_PRESETS[i].maxCards + ' 张'),
          );
        }),
      ),
    ),

    // ── v116：配置屏左上角固定返回酒馆 ──
    setupView && h('button', { className: 'btn btn-ghost', style: { position: 'absolute', top: 18, left: 16, zIndex: 20, fontSize: 12, color: 'hsl(35 25% 72%)', display: 'flex', alignItems: 'center', gap: 4 }, onClick: function () { setSetupView(null); } }, '◀ 返回酒馆'),
    // ═══ v140：酒馆门户 / 游戏配置屏 双态渲染（入口合一：开始游戏 → 玩法/难度/模式）═══
    setupView === null ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300, opacity: 0, animation: 'enter-rise 0.5s ease 2s forwards' } },
      h('button', { className: 'btn btn-primary btn-lg', style: { width: '100%', padding: '18px 0', fontSize: 17, letterSpacing: '0.1em', borderRadius: '0.9rem', justifyContent: 'center' }, onClick: function () { setSetupView('setup'); } },
        h(Icon.Play, { size: 20 }), '开始游戏'),
      h('button', { className: 'btn btn-outline btn-lg', style: { width: '100%' }, onClick: function () { setAchData(loadAch()); setShowAch(true); } }, h(Icon.Trophy, { size: 16 }), t('ui.ach')),
      h('button', { className: 'btn btn-outline btn-lg', style: { width: '100%' }, onClick: function () { setShowStats(true); } }, h(Icon.Swords, { size: 16 }), t('ui.stats')), // P1-2
    ) : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300, opacity: 0, animation: 'enter-rise 0.5s ease 1.9s forwards' } },
      // ── ① 玩法 ──
      h('p', { style: { margin: 0, fontSize: 11, color: 'var(--c-text-faint)', letterSpacing: '0.2em' } }, '玩法'),
      [
        { id: 'cards', label: '经典牌局', icon: 'Cylinder', desc: '唬牌 · 转盘 · 角色', accent: true },
        { id: 'dice', label: '大话骰', icon: 'Dices', desc: '叫点 · 开盅 · 转盘', accent: false },
      ].map(function (m) {
        const sel = playMode === m.id;
        return h('button', {
          key: m.id,
          onClick: function () { setPlayMode(m.id); },
          style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: 'transparent', border: '1.5px solid ' + (sel ? 'var(--c-accent-bright)' : 'rgba(176,141,87,0.45)'), boxShadow: sel ? '0 0 16px rgba(220,170,60,0.25)' : 'none', transition: 'all 0.2s' },
        },
          h('span', { style: { display: 'inline-flex', color: m.accent ? 'var(--c-danger)' : 'var(--c-accent)', flexShrink: 0 } }, h(Icon[m.icon], { size: 26 })),
          h('span', { style: { flex: 1 } },
            h('span', { style: { display: 'block', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-title)', color: 'var(--c-accent-bright)' } }, m.label),
            h('span', { style: { display: 'block', fontSize: 11, color: 'hsl(35 15% 68%)', marginTop: 2 } }, m.desc),
          ),
          sel && h('span', { style: { color: 'var(--c-accent-bright)' } }, '✓'),
        );
      }),
      // ── ② 难度 ──
      h('p', { style: { margin: '4px 0 0', fontSize: 11, color: 'var(--c-text-faint)', letterSpacing: '0.2em' } }, '难度'),
      h('div', { style: { display: 'flex', gap: 10 } },
        [['easy', 'diffEasy', Icon.Clover], ['normal', 'diffNormal', Icon.Swords], ['hard', 'diffHard', Icon.Flame]].map(function (d) {
          const D = d[2];
          return h('button', {
            key: d[0],
            className: 'btn ' + (diff === d[0] ? 'btn-primary' : 'btn-outline'),
            style: { flex: 1, padding: '10px 0', fontSize: 14, borderRadius: 8, justifyContent: 'center' },
            onClick: function () { setDiff(d[0]); }
          },
            h('span', { style: { marginRight: 4, display: 'inline-flex' } }, h(D, { size: 14 })), t('ui.' + d[1]));
        }),
      ),
      // v142：徽章常驻槽（minHeight 恒定）——难度切换时上下内容零位移
      h('div', { style: { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', minHeight: 26, alignItems: 'flex-start' } },
        diff === 'easy' ? [
          h('span', { key: 'e0', style: { fontSize: 12, color: 'var(--c-success)', background: 'rgba(34,139,80,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(34,139,80,0.25)' } }, 'AI 20% 失误率'),
          h('span', { key: 'e1', style: { fontSize: 12, color: 'var(--c-success)', background: 'rgba(34,139,80,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(34,139,80,0.25)' } }, '适合熟悉规则'),
        ] : diff === 'hard' ? (playMode === 'dice'
          ? ['AI 叫点更刁钻', '掀桌更果断', 'AI 判断更准']
          : ['AI质疑率+50%', '目标牌更少', '轮盘双子弹']
        ).map(function (txt, bi) {
          return h('span', { key: bi, style: { fontSize: 12, color: 'var(--c-danger-bright)', background: 'rgba(180,30,30,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(180,30,30,0.25)' } }, txt);
        }) : null,
      ),
      // ── ③ 模式 ──
      h('p', { style: { margin: '4px 0 0', fontSize: 11, color: 'var(--c-text-faint)', letterSpacing: '0.2em' } }, '模式'),
      h('div', { style: { display: 'flex', gap: 10 } },
        [[false, '单机 · 与 AI 对饮', Icon.User], [true, '联机 · 与好友同桌', Icon.Wifi]].map(function (m) {
          const M = m[2];
          return h('button', {
            key: String(m[0]),
            className: 'btn ' + (mpMode === m[0] ? 'btn-primary' : 'btn-outline'),
            style: { flex: 1, padding: '10px 0', fontSize: 13, borderRadius: 8, justifyContent: 'center' },
            onClick: function () { setMpMode(m[0]); }
          },
            h('span', { style: { marginRight: 4, display: 'inline-flex' } }, h(M, { size: 14 })), m[1]);
        }),
      ),
      // 酒客配置（仅单机）
      !mpMode && h('button', { className: 'btn btn-outline', style: { width: '100%', justifyContent: 'center' }, onClick: function () { setShowAIConfig(function (v) { return !v; }); } },
        h(Icon.Users, { size: 14 }), '选择酒客对手'),
      // 开始（单机=handleStart；联机=进大厅并携带玩法/难度）
      h('button', { className: 'btn btn-primary', style: { width: '100%', borderRadius: '0.75rem', padding: '13px 0', fontSize: 14, justifyContent: 'center', boxShadow: '0 4px 12px var(--c-danger-shadow)' }, onClick: function () { mpMode ? onMultiplayer(playMode, diff) : handleStart(playMode); } },
        h(Icon.Play, { size: 16 }), mpMode ? (playMode === 'dice' ? '进联机大厅 · 大话骰' : '进联机大厅 · 经典牌局') : (playMode === 'dice' ? '开始骰局' : t('ui.startGame'))),
    ),
    h('p', { style: { marginTop: 32, fontSize: 12, color: 'var(--c-text-dim)', opacity: 0, textAlign: 'center', animation: 'enter-fade 0.8s ease 2.6s forwards' } },
      // v115：随玩法语境切换（门户=双玩法总览；cards/dice=各自口径）
      setupView === 'setup' ? (playMode === 'dice' ? '每人 5 骰 · 全场 20 骰 · 叫「N 个 X」 · 加码或叫开 · 输家上命运转盘'
        : '4 名玩家 · 64 张牌 · 每人 16 张牌库 · A/K/Q 目标 · J 万能 · 天使&恶魔衍生牌')
      : '两大玩法 · 经典牌局与大话骰 · 单机 AI 与好友联机'),
    // v142：fast 时淡出但保留占位（条件卸载会触发门户整体重排位移）
    // v142：提示常驻占位（fast 点击/3.4s 到点均淡出、不卸载；skipAnim 首帧即跳过时才不渲染）
    !skipAnim && h('p', { key: 'fastHint', style: { marginTop: 14, fontSize: 12, color: 'var(--c-text-faint)', letterSpacing: '0.15em', textAlign: 'center', opacity: 0, animation: (fast || hintGone) ? 'fade-out 0.15s ease forwards' : 'enter-fade 0.6s ease 1s forwards, hint-breath 2.2s ease-in-out 1.8s infinite' } }, t('ui.fastHint')),
    achR && h('div', { className: 'overlay' + (achClosing ? ' overlay-exit' : ''), onClick: function (e) { if (e.target === e.currentTarget) setShowAch(false); } },
      h('div', { className: 'panel animate-slide-up' + (achClosing ? ' panel-exit' : ''), style: { width: '90%', maxWidth: 440, maxHeight: '80vh', overflow: 'auto', padding: 24 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
          h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 18, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 } }, h(Icon.Trophy, { size: 20 }), t('ui.ach')),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('span', { style: { fontSize: 12, color: 'hsl(42 60% 60%)' } }, '已解锁 ' + Object.keys((achData || {}).unlocked || {}).length + ' / ' + ACHIEVEMENTS.length),
            h('button', { className: 'btn btn-ghost', style: { padding: '2px 8px', fontSize: 12, color: 'var(--c-danger)' }, onClick: function () { setShowAch(false); } }, '关闭'),
          ),
          h('p', { style: { fontSize: 12, color: 'var(--c-text-faint)', textAlign: 'center', margin: '-6px 0 10px' } }, '成就与战绩仅统计经典牌局；大话骰不参与计分'), // v118：双玩法口径明示
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          ACHIEVEMENTS.map(function (a) {
            const got = !!(achData || {}).unlocked && !!(achData.unlocked[a.id]);
            return h('div', {
              key: a.id,
              style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: got ? 'hsla(42,60%,40%,0.08)' : 'hsl(0 10% 8%)', border: '1px solid ' + (got ? 'hsla(42,70%,50%,0.35)' : 'var(--c-border)'), opacity: got ? 1 : 0.55 },
            },
              h('span', { style: { display: 'inline-flex', color: got ? 'var(--c-accent)' : 'var(--c-text-faint)', flexShrink: 0 } }, h(Icon[a.icon] || Icon.Sparkles, { size: 22 })),
              h('div', { style: { flex: 1 } },
                h('h3', { style: { fontSize: 12, fontWeight: 600, marginBottom: 2, color: got ? 'var(--c-accent)' : 'hsl(0 12% 60%)' } }, a.name),
                h('p', { style: { fontSize: 12, color: 'var(--c-text-dim)', lineHeight: 1.5 } }, a.desc),
              ),
              got && h(Icon.CheckCircle2, { size: 16, style: undefined }),
            );
          })
        ),
      ),
    ),
    // ── P1-2：战绩面板（主菜单常驻入口，复用 D2 战绩系统）──
    showStats && (function () {
      const sh = loadMatchHistory();
      const ms = sh.matches;
      const wins = ms.filter(m => m.result === 'win').length;
      const losses = ms.filter(m => m.result === 'loss').length;
      const draws = ms.filter(m => m.result === 'draw').length;
      const aggRes = ms.length ? aggregateDims(ms, 20) : null;
      const diffName = { easy: '简单', normal: '普通', hard: '困难' };
      const fmtDate = ts => { try { const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); } catch (e) { return ''; } };
      return h('div', { className: 'overlay', onClick: function (e) { if (e.target === e.currentTarget) setShowStats(false); } },
        h('div', { className: 'panel animate-slide-up', style: { width: '90%', maxWidth: 440, maxHeight: '80vh', overflow: 'auto', padding: 24 } },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
            h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 18, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 } }, h(Icon.Swords, { size: 20 }), t('ui.stats')),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              h('span', { style: { fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', fontFamily: 'monospace' } }, 'ELO ' + (sh.elo || 1000)),
              h('button', { className: 'btn btn-ghost', style: { padding: '2px 8px', fontSize: 12, color: 'var(--c-danger)' }, onClick: function () { setShowStats(false); } }, '关闭'),
            ),
          ),
          ms.length === 0 ? h('p', { style: { fontSize: 12, color: 'var(--c-text-dim)', textAlign: 'center', padding: '28px 0' } }, '还没有对局记录——打完一局后这里会展示 ELO 走势与战绩雷达')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 } },
              [['胜', wins, 'var(--c-success)'], ['负', losses, 'var(--c-danger)'], ['平', draws, 'var(--c-text-dim)']].map(function (s) {
                return h('div', { key: s[0], style: { textAlign: 'center', padding: '10px 0', borderRadius: 8, background: 'hsl(0 10% 8%)', border: '1px solid var(--c-border)' } },
                  h('div', { style: { fontSize: 18, fontWeight: 700, color: s[2] } }, s[1]),
                  h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginTop: 2 } }, s[0]),
                );
              })
            ),
            LineChart({ matches: ms }),
            aggRes && h('div', { style: { display: 'flex', justifyContent: 'center' } }, RadarChart({ agg: aggRes.agg, raw: aggRes.raw })),
            h('div', null,
              h('p', { style: { fontSize: 12, fontWeight: 600, color: 'var(--c-text-dim)', marginBottom: 6 } }, '最近对局'),
              ms.slice(0, 5).map(function (m, i) {
                const delta = m.eloAfter - m.eloBefore;
                return h('div', { key: i, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: 'hsl(0 10% 8%)', border: '1px solid var(--c-border)', marginBottom: 6, fontSize: 12 } },
                  h('span', { style: { color: 'var(--c-text-dim)' } }, (diffName[m.difficulty] || m.difficulty) + ' · ' + fmtDate(m.ts)),
                  h('span', { style: { fontWeight: 700, color: m.result === 'win' ? 'var(--c-success)' : m.result === 'draw' ? 'var(--c-text-dim)' : 'var(--c-danger)' } }, m.result === 'win' ? '胜' : m.result === 'draw' ? '平' : '负'),
                  h('span', { style: { fontFamily: 'monospace', color: delta >= 0 ? 'var(--c-success)' : 'var(--c-danger)' } }, (delta >= 0 ? '+' : '') + delta),
                );
              })
            ),
          ),
        ),
      );
    })(),
    // ── v106：版本编年史（主菜单版本号点击进入）——重大改动内置对照 ──
    historyR && h('div', { className: 'overlay' + (historyClosing ? ' overlay-exit' : ''), onClick: function (e) { if (e.target === e.currentTarget) setShowHistory(false); } },
      h('div', { className: 'panel animate-slide-up' + (historyClosing ? ' panel-exit' : ''), style: { width: '90%', maxWidth: 460, maxHeight: '82vh', overflow: 'auto', padding: 24 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 } },
          h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 18, fontWeight: 'bold' } }, '版本编年史'),
          h('button', { className: 'btn btn-ghost', style: { padding: '4px 10px', fontSize: 12 }, onClick: function () { setShowHistory(false); } }, '关闭'),
        ),
        h('p', { style: { fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 14 } }, '重大改动历史对照 · 当前版本 ' + GAME_VERSION),
        VERSION_HISTORY_PHASES.map(function (ph, i) {
          const isCurrent = i === VERSION_HISTORY_PHASES.length - 1;
          return h('div', { key: i, style: { borderLeft: '2px solid ' + (isCurrent ? 'var(--c-accent)' : 'var(--c-border)'), paddingLeft: 14, marginBottom: 18 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
              h('span', { style: { fontFamily: 'var(--font-title)', fontSize: 14, fontWeight: 600 } }, ph.no + ' · ' + ph.title),
              isCurrent && h('span', { style: { fontSize: 10, color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: 8, padding: '0 6px' } }, '当前'),
              h('span', { style: { fontSize: 10, color: 'var(--c-text-faint)' } }, ph.date + ' · ' + ph.span),
            ),
            h('p', { style: { fontSize: 12, color: 'var(--c-text-dim)', lineHeight: 1.6, margin: '6px 0 8px' } }, ph.summary),
            ...ph.items.map(function (it, j) {
              return h('div', { key: j, style: { display: 'flex', gap: 8, marginBottom: 4 } },
                h('span', { style: { fontFamily: 'monospace', fontSize: 12, color: 'var(--c-accent)', flexShrink: 0 } }, it[0]),
                h('span', { style: { fontSize: 12, color: 'var(--c-text)', lineHeight: 1.5 } }, it[1]),
              );
            }),
          );
        }),
        h('p', { style: { fontSize: 10, color: 'var(--c-text-faint)', textAlign: 'center', marginTop: 6 } }, '随时点击主菜单的版本号回到这里'),
      ),
    ),
    // v120：设置屏遮罩半透明（去 blur）——背景 3D 场景可透出
    settingsR && h('div', { className: 'overlay' + (settingsClosing ? ' overlay-exit' : ''), style: { background: 'rgba(0,0,0,0.28)', backdropFilter: 'none' }, onClick: function (e) { if (e.target === e.currentTarget) setSettings(false); } },
      h('div', { className: 'panel animate-slide-up' + (settingsClosing ? ' panel-exit' : ''), style: { width: '90%', maxWidth: 380, maxHeight: '80vh', overflow: 'auto', padding: 24, background: 'rgba(15,8,4,0.62)' } }, // v120：半透明（背景 3D 可透出）
        h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 18, fontWeight: 'bold', marginBottom: 20 } }, t('ui.settingsTitle')),
        [
          t('ui.setSkipPenalty').concat([skipPenalty, setSkipPenaltyPref]),
          t('ui.setBgTilt').concat([bgTilt, setBgTiltPref])
        ].map(function (item, i) {
          var title = item[0],
            desc = item[1],
            val = item[2],
            set = item[3];
          return h('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: i > 0 ? '1px solid var(--c-border)' : 'none' } },
            h('div', null, h('div', { style: { fontSize: 14, fontWeight: 600 } }, title), h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginTop: 2 } }, desc)),
            h('button', {
              type: 'button',
              className: 'switch' + (val ? ' on' : ''),
              style: { minWidth: '2.2rem', minHeight: '1.25rem', position: 'relative' },
              onClick: function (e) { e.preventDefault();
                e.stopPropagation();
                set(!val); }
            }),
          );
        }),
        h('div', { style: { padding: '14px 0', borderTop: '1px solid var(--c-border)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 600 } }, t('ui.setSound')[0]),
              h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginTop: 2 } }, t('ui.setSound')[1]),
            ),
            h('button', {
              type: 'button',
              className: 'switch' + (soundOn ? ' on' : ''),
              onClick: function (e) { e.preventDefault(); e.stopPropagation(); setSoundMaster(!soundOn); }
            }),
          ),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingLeft: 16, opacity: soundOn ? 1 : 0.45, pointerEvents: soundOn ? 'auto' : 'none' } },
            h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)' } }, t('ui.setAudio')),
            h('button', {
              type: 'button',
              className: 'switch' + (musicSel ? ' on' : ''),
              onClick: function (e) {
                e.preventDefault(); e.stopPropagation();
                var next = !musicSel;
                setMusicSel(next);
                if (next) { TavernAudio.start(); } else { TavernAudio.stop(); }
              }
            }),
          ),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingLeft: 16, opacity: soundOn ? 1 : 0.45, pointerEvents: soundOn ? 'auto' : 'none' } },
            h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)' } }, t('ui.setSfx')),
            h('button', {
              type: 'button',
              className: 'switch' + (sfxOn ? ' on' : ''),
              onClick: function (e) {
                e.preventDefault(); e.stopPropagation();
                var next = !sfxOn;
                setSfxOn(next);
                Sfx.setEnabled(next);
                if (next) Sfx.play('safe'); // 开启时给一声轻响反馈
              }
            }),
          ),
        ),
        // ── v108：对局设置（AI 节奏 + 教程重看）──
        h('div', { style: { padding: '14px 0', borderTop: '1px solid var(--c-border)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)' } }, 'AI 节奏'),
            h('button', {
              key: aiSpeedTick, // v108：tick 变化强制重建按钮，文案即时刷新
              className: 'btn btn-outline',
              style: { padding: '4px 12px', fontSize: 12, borderRadius: 8, minWidth: 96 },
              onClick: function () {
                var cur = aiSpeedFactor();
                var next = AI_SPEEDS[(AI_SPEEDS.indexOf(cur) + 1) % AI_SPEEDS.length];
                try { localStorage.setItem('ld_ai_speed', String(next)); } catch (e) {}
                setAiSpeedTick(function (v) { return v + 1; }); // 触发重渲染刷新按钮文案
                Sfx.play('safe');
              }
            }, (function () { var f = aiSpeedFactor(); return (f < 1 ? '0.5x 慢速' : f === 1 ? '1x 标准' : f === 2 ? '2x 快速' : '3x 极速'); })()),
          ),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 } },
            h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)' } }, '新手引导'),
            h('button', {
              className: 'btn btn-outline',
              style: { padding: '4px 12px', fontSize: 12, borderRadius: 8 },
              onClick: function () {
                try { __ftueReset(); } catch (e) {}
                toast.info('已重置引导，下次开局将重新触发新手气泡');
              }
            }, '重看引导'),
          ),
        ),
        //：F3 出牌上限设置已移除（锁定 5 张）
        //：主题选择（移至语言上方）——默认锁定仅酒馆，开启开关后可选另外两个
        h('div', { style: { padding: '14px 0', borderTop: '1px solid var(--c-border)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 600 } }, t('ui.themeLabel')),
              h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginTop: 2 } }, t('ui.themeExt')[1]),
            ),
            h('button', {
              type: 'button',
              className: 'switch' + (themeExt ? ' on' : ''),
              onClick: function (e) {
                e.preventDefault(); e.stopPropagation();
                var next = !themeExt;
                setThemeExt(next);
                try { localStorage.setItem('ld_theme_ext', next ? '1' : '0'); } catch (err) {}
                if (!next && (document.body.dataset.theme || 'tavern') !== 'tavern') {
                  document.body.dataset.theme = 'tavern'; // 关闭即回退酒馆
                  try { localStorage.setItem('ld_theme', 'tavern'); } catch (err) {}
                }
                setThemeTick(function (v) { return v + 1; });
              }
            }),
          ),
          //：全部主题按钮——未开启时隐藏，开启后从开关行下方滑出
          h('div', {
            style: {
              overflow: 'hidden',
              maxHeight: themeExt ? 56 : 0,
              opacity: themeExt ? 1 : 0,
              marginTop: themeExt ? 10 : 0,
              transition: 'max-height .35s cubic-bezier(0.16,1,0.3,1), opacity .28s ease, margin-top .35s cubic-bezier(0.16,1,0.3,1)',
            }
          },
            h('div', { style: { display: 'flex', gap: 6 } },
              [['tavern', '#1a0e06'], ['snow', '#0b1420'], ['desert', '#22160a']].map(function (th, ti) {
                var active = (document.body.dataset.theme || 'tavern') === th[0];
                return h('button', {
                  key: th[0],
                  className: 'btn ' + (active ? 'btn-primary' : 'btn-outline'),
                  style: { flex: 1, padding: '8px 0', fontSize: 12, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
                  onClick: function () {
                    if (!themeExt) return; // 收起态保险
                    document.body.dataset.theme = th[0];
                    try { localStorage.setItem('ld_theme', th[0]); } catch (e) {}
                    setThemeTick(function (v) { return v + 1; });
                  }
                },
                  h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: th[1], border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0 } }),
                  (t('ui.themes') || [])[ti] || th[0]
                );
              }),
            ),
          ),
        ),
        h('div', { style: { padding: '14px 0', borderTop: '1px solid var(--c-border)' } },
          h('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: llmFold ? 10 : 0, cursor: 'pointer' },
            onClick: function () { setLlmFold(function (v) { return !v; }); }
          },
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 600 } }, t('ui.llmBrain')[0]),
              h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginTop: 2 } }, t('ui.llmBrain')[1]),
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { color: 'var(--c-text-dim)', fontSize: 12, transform: llmFold ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .25s' } }, '▼'),
              h('button', {
                type: 'button',
                className: 'switch' + (llmOn ? ' on' : ''),
                onClick: function (e) {
                  e.preventDefault(); e.stopPropagation();
                  var next = !llmOn;
                  setLlmOn(next);
                  try { localStorage.setItem('liar_llm_on', next ? '1' : '0'); } catch (err) {}
                  if (next && !LlmAI.getConfig().key) setLlmFold(true); // 未填 Key：自动展开配置区引导填写
                }
              }),
            ),
          ),
          llmFold && h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            h('input', {
              type: 'password', value: llmKey,
              placeholder: t('ui.llmKeyPh'),
              onChange: function (e) { setLlmKey(e.target.value); },
              style: { width: '100%', background: 'var(--c-panel-strong)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' },
            }),
            h('div', { style: { display: 'flex', gap: 6 } },
              h('select', {
                value: llmModel,
                onChange: function (e) { setLlmModel(e.target.value); },
                style: { flex: 1, background: 'var(--c-panel-strong)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 10px', fontSize: 12 },
              },
                ['glm-4-flash', 'glm-4.5-flash', 'glm-z1-flash', 'glm-4-plus'].map(function (m) {
                  return h('option', { key: m, value: m, style: { background: 'var(--c-panel-strong)' } }, m === 'glm-z1-flash' ? m + '（思考模型）' : m);
                }),
              ),
              h('button', {
                type: 'button', className: 'btn btn-outline', style: { padding: '6px 12px', fontSize: 12, borderRadius: 8, flexShrink: 0 },
                onClick: function () {
                  LlmAI.setConfig({ key: llmKey, model: llmModel });
                  setLlmTesting(true);
                  LlmAI.testConn().then(function (r) {
                    setLlmTesting(false);
                    toast.success(t('ui.llmTestOk') + '（' + r.ms + 'ms）');
                  }).catch(function (err) {
                    setLlmTesting(false);
                    toast.error(t('ui.llmTestFail') + '：' + String(err && err.message || err).slice(0, 60));
                  });
                }
              }, llmTesting ? '…' : t('ui.llmTest')),
            ),
            h('p', { style: { fontSize: 10, color: 'var(--c-text-faint)' } }, t('ui.llmHint')),
            // 质疑走本地 AI 开关（零延迟；出牌仍走云端）
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)' } }, t('ui.qLocal')[0] + ' · ' + t('ui.qLocal')[1]),
              h('button', {
                type: 'button', className: 'switch' + (qLocalOn ? ' on' : ''),
                onClick: function (e) {
                  e.preventDefault(); e.stopPropagation();
                  var next = !qLocalOn;
                  setQLocalOn(next);
                  try { localStorage.setItem('liar_q_local', next ? '1' : '0'); } catch (err) {}
                }
              }),
            ),
            // 思考日志：查看云端模型每次决策的思考过程
            h('button', {
              type: 'button', className: 'btn btn-outline', style: { padding: '6px 12px', fontSize: 12, borderRadius: 8, alignSelf: 'flex-start' },
              onClick: function () { setThinkOpen(true); }
            }, t('ui.thinkLog') + '（' + LlmAI.getLog().length + '）'),
          ),
        ),
        // 思考日志入口移至顶层独立界面（见 settings overlay 之后的 thinkPage）
        // 批次三：存档导出/导入（成就/统计/战绩/偏好打包，排除登录态 ld_session）
        h('div', { style: { padding: '14px 0', borderTop: '1px solid var(--c-border)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', null,
              h('div', { style: { fontSize: 14, fontWeight: 600 } }, t('ui.saveMgmt')[0]),
              h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginTop: 2 } }, t('ui.saveMgmt')[1]),
            ),
            h('div', { style: { display: 'flex', gap: 6 } },
              h('button', {
                type: 'button', className: 'btn btn-outline', style: { padding: '6px 12px', fontSize: 12, borderRadius: 8 },
                onClick: function () {
                  var text = exportSave();
                  //：copyText 降级链（clipboard API → execCommand），全失败才落下载
                  copyText(text).then(function (ok) {
                    if (ok) toast.success(t('ui.saveExported'));
                    else { downloadSave(text); toast.info(t('ui.saveFallback')); }
                  });
                }
              }, t('ui.saveExport')),
              h('button', {
                type: 'button', className: 'btn btn-outline', style: { padding: '6px 12px', fontSize: 12, borderRadius: 8 },
                onClick: function () { setSaveIO(function (v) { return !v; }); setSaveText(''); }
              }, t('ui.saveImport')),
            ),
          ),
          saveIO && h('div', { style: { marginTop: 10 } },
            h('textarea', {
              value: saveText,
              onChange: function (e) { setSaveText(e.target.value); },
              placeholder: t('ui.savePlaceholder'),
              style: { width: '100%', minHeight: 72, background: 'var(--c-panel-strong)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 8, fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box' },
            }),
            h('button', {
              type: 'button', className: 'btn btn-primary', style: { marginTop: 8, width: '100%', padding: '8px 0', fontSize: 12, borderRadius: 8 },
              onClick: function () {
                try {
                  var n = importSave(saveText);
                  toast.success(String(n) + ' 项已恢复，即将刷新');
                  setTimeout(function () { location.reload(); }, 900);
                } catch (err) { toast.error(t('ui.saveInvalid')); }
              }
            }, t('ui.saveRestore')),
          ),
        ),
        // [v82] G3 语言切换已移除：en 词典随 #3 清理删除（无出海计划），t() 机制保留供将来复用
        h('p', { style: { fontSize: 10, color: 'var(--c-text-faint)', textAlign: 'center', marginTop: 16 } }, t('ui.setApplied')),
      )
    ),
    // 思考日志：顶层独立界面，覆盖在设置面板之上（与 settings overlay 平级渲染）
    thinkOpen && h('div', {
      className: 'overlay',
      style: { zIndex: 60 },
      onClick: function (e) { if (e.target === e.currentTarget) setThinkOpen(false); }
    },
      h('div', { className: 'panel animate-slide-up', style: { width: 'min(720px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 22, gap: 12 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 } },
          h('div', null,
            h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 18, color: 'var(--c-accent)', margin: 0 } }, t('ui.thinkLog')),
            h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', marginTop: 4 } }, t('ui.thinkSub') + '（' + LlmAI.getLog().length + ' 条）'),
          ),
          h('div', { style: { display: 'flex', gap: 6 } },
            h('button', { type: 'button', className: 'btn btn-ghost', style: { fontSize: 12 }, onClick: function () { LlmAI.clearLog(); setThinkTick(function (v) { return v + 1; }); } }, t('ui.thinkClear')),
            h('button', { type: 'button', className: 'btn btn-ghost', style: { fontSize: 14 }, onClick: function () { setThinkOpen(false); } }, '✕'),
          ),
        ),
        h('div', { style: { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 } },
          LlmAI.getLog().length === 0 ? h('p', { style: { fontSize: 12, color: 'var(--c-text-dim)', padding: '40px 0', textAlign: 'center' } }, t('ui.thinkEmpty')) :
            LlmAI.getLog().map(function (e, i) {
              return h('div', { key: i, style: { background: 'var(--c-panel-strong)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '12px 14px' } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 4 } },
                  h('div', { style: { fontSize: 12, fontWeight: 600 } },
                    h('span', { style: { color: 'var(--c-accent)' } }, e.name),
                    ' · ' + (e.kind || '') + ' · ',
                    h('span', { style: { color: e.kind === '回落' ? 'var(--c-danger)' : 'var(--c-text)' } }, e.decision)
                  ),
                  h('span', { style: { fontSize: 10, color: 'var(--c-text-faint)', flexShrink: 0 } }, new Date(e.ts).toLocaleTimeString() + ' · ' + (e.model || '')),
                ),
                e.say ? h('div', { style: { fontSize: 12, color: 'var(--c-accent)', marginBottom: 6, fontStyle: 'italic' } }, '：" ' + e.say + ' "') : null,
                e.reasoning ? h('div', { style: { fontSize: 12, color: 'var(--c-text-dim)', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'hsl(260 20% 8%)', borderRadius: 8, padding: '10px 12px' } }, e.reasoning) : null,
              );
            }),
        ),
      ),
    ),
  );
}

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
        style: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: '50%', padding: 0, fontSize: 18, color: 'hsl(0 8% 55%)' },
        onClick: onClose
      }, '×'),
      h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 22, fontWeight: 'bold', marginBottom: 4, color: 'var(--c-text-bright)' } }, '骗子牌酒馆'),
      h('p', { style: { fontSize: 12, color: 'hsl(0 8% 55%)', marginBottom: 20 } }, mode === 'login' ? '登录账号以使用联机功能' : '注册新账号'),
      h('div', { style: { display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid hsl(30 15% 35%)' } },
        h('button', {
          className: mode === 'login' ? 'btn-primary' : 'btn-ghost',
          style: { flex: 1, borderRadius: 0, padding: '8px 0', fontSize: 13 },
          onClick: () => { setMode('login');
            setErr(''); }
        }, '登录'),
        h('button', {
          className: mode === 'register' ? 'btn-primary' : 'btn-ghost',
          style: { flex: 1, borderRadius: 0, padding: '8px 0', fontSize: 13 },
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
        style: { width: '100%', padding: '10px 14px', marginBottom: 10, background: 'var(--c-surface)', border: '1px solid hsl(30 15% 35%)', borderRadius: 8, color: 'var(--c-text-bright)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
      }),
      h('input', {
        type: 'password',
        placeholder: '密码',
        value: pwd,
        onChange: e => setPwd(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') submit(); },
        style: { width: '100%', padding: '10px 14px', marginBottom: 10, background: 'var(--c-surface)', border: '1px solid hsl(30 15% 35%)', borderRadius: 8, color: 'var(--c-text-bright)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
      }),
      mode === 'register' && h('input', {
        type: 'password',
        placeholder: '确认密码',
        value: pwd2,
        onChange: e => setPwd2(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') submit(); },
        style: { width: '100%', padding: '10px 14px', marginBottom: 10, background: 'var(--c-surface)', border: '1px solid hsl(30 15% 35%)', borderRadius: 8, color: 'var(--c-text-bright)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
      }),
      err && h('p', { style: { color: 'hsl(0 70% 60%)', fontSize: 12, marginBottom: 10 } }, err),
      h('button', {
        className: 'btn btn-primary',
        style: { width: '100%', padding: '10px 0' },
        disabled: loading,
        onClick: submit
      }, loading ? '请稍候...' : (mode === 'login' ? '登 录' : '注 册')),
      h('p', {
        style: { fontSize: 10, color: 'hsl(0 8% 45%)', marginTop: 12, lineHeight: 1.5 }
      }, '账号保存在本地浏览器 · 信誉分初始100 · 每日恢复50 · 联机中途退出扣分'),
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
  const [aiCfgR, aiCfgClosing] = useExitAnim(showAIConfig, 250);
  const [aiCfgs, setAiCfgs] = useState(AI_PRESETS.map(p => ({ ...p })));
  const [selectedAIs, setSelectedAIs] = useState([0, 1, 2]);
  const [activeAI, setActiveAI] = useState(-1); //：先只展示 AI 名称，点击后再进入编辑
  // 牌局音效偏好存 Sfx 'liar_sfx'——总闸关时不改子偏好，只执行静音，开闸按偏好恢复）
  const [soundOn, setSoundOn] = useState(function () { try { return localStorage.getItem('ld_sound_master') !== '0'; } catch (e) { return true; } });
  // v100：跳过惩罚动画偏好（轮盘演出压缩为直接显示结果）
  const [skipPenalty, setSkipPenalty] = useState(function () { try { return localStorage.getItem('ld_skip_penalty') === '1'; } catch (e) { return false; } });
  const setSkipPenaltyPref = function (next) {
    setSkipPenalty(next);
    try { localStorage.setItem('ld_skip_penalty', next ? '1' : '0'); } catch (e) {}
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
      if (selectedAIs.length > 1) {
        const newSel = selectedAIs.filter(i => i !== idx);
        setSelectedAIs(newSel);
        if (activeAI === idx) setActiveAI(newSel[0]);
      }
    } else {
      if (selectedAIs.length < 3) {
        const newSel = [...selectedAIs, idx];
        setSelectedAIs(newSel);
        if (!newSel.includes(activeAI)) setActiveAI(newSel[0]);
      }
    }
  };

  const handleStart = () => {
    var cfgs = selectedAIs.map(function (i) { return aiCfgs[i]; });
    onStart(diff, cfgs, selectedAIs, incRoulette, autoSort, 5); //：上限锁定 5，设置开关已移除
  };

  return h('div', {
    className: skipAnim ? 'no-enter-anim' : (fast ? 'menu-fast' : ''),
    onClick: function () { setFast(true); }, //：点击加速入场动画（氛围层是兄弟节点不受波及）
    style: { position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '3rem 1rem' }
  },
    h('div', {
      style: { position: 'absolute', top: 20, right: 20, display: 'flex', alignItems: 'center', gap: 8, opacity: 0, animation: 'enter-settings 0.5s ease 2.2s forwards', zIndex: 20 }
    },
      user && h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-panel-bg)', padding: '4px 12px', borderRadius: 20, border: '1px solid hsl(30 15% 25%)' }
      },
        h('span', { style: { fontSize: 12, color: 'hsl(35 30% 80%)' } }, h(Icon.User, { size: 12 }), ' ' + user.name),
        h('span', { style: { fontSize: 11, color: user.reputation >= 80 ? 'var(--c-success)' : user.reputation >= 50 ? 'var(--c-accent)' : 'hsl(0 70% 55%)', fontWeight: 600 } }, t('ui.reputation') + ' ' + user.reputation),
        h('button', { className: 'btn btn-ghost', style: { padding: '2px 8px', fontSize: 11, color: 'hsl(0 8% 55%)' }, onClick: onLogout }, t('ui.logout')),
      ),
      h('button', { className: 'btn btn-ghost', style: { width: 40, height: 40, borderRadius: '50%', padding: 0 }, onClick: function () { setSettings(function (v) { return !v; }); } }, h(Icon.Settings, { size: 18 })),
    ),
    h('div', { style: { textAlign: 'center', marginBottom: 40 } },
      h('p', { style: { color: 'var(--c-accent)', fontSize: 14, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600, opacity: 0, animation: 'enter-subtitle 0.8s ease 0.2s forwards' } }, t('ui.subtitle')),
      h('h1', { style: { fontFamily: 'var(--font-title)', fontSize: 'clamp(2.5rem,8vw,4.5rem)', fontWeight: 'bold', letterSpacing: '-0.02em', opacity: 0, animation: 'enter-title 1s cubic-bezier(0.16,1,0.3,1) 0.7s forwards, enter-glow-pulse 2s ease 1.6s 1' } }, t('ui.title')),
      h('p', { style: { fontSize: 18, color: 'var(--c-text-dim)', marginTop: 8, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0, animation: 'enter-en-title 0.8s ease 1.2s forwards' } }, t('ui.titleEn') + '  ·  ' + GAME_VERSION),
      h('div', {
        className: 'menu-divider',
        style: { marginTop: 16, height: 2, background: 'var(--c-danger)', borderRadius: 4, opacity: 0, width: 0, margin: '16px auto 0', animation: 'enter-divider 0.6s ease 1.5s forwards' }
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
        GAME_RULES.map(function (r0, i) { var r = Object.assign({}, r0, (I18N[getLang()].rules[r0.icon] || r0));
          return h('div', {
            key: i,
            style: { display: 'flex', gap: 12, marginBottom: i < GAME_RULES.length - 1 ? 16 : 0, opacity: 0, animation: 'enter-slide-right 0.4s ease ' + (0.1 + i * 0.12) + 's forwards' }
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
      h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--c-accent)' } }, t('ui.selAITitle')),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 } },
        AI_NAMES.map(function (name, i) {
          var isSelected = selectedAIs.indexOf(i) >= 0;
          var isActive = activeAI === i;
          return h('button', {
            key: i,
            type: 'button',
            title: isSelected ? '已选 · 点击' + (isActive ? t('ui.collapse') : 'edit') : t('ui.pickAITip'),
            onClick: function () {
              if (isSelected) {
                if (isActive) setActiveAI(-1);        // 激活中再点 → 收起编辑
                else setActiveAI(i);                   // 已选未激活 → 进入编辑
              } else {
                if (selectedAIs.length < 3) {          // 未选满 → 选中并进入编辑
                  toggleAI(i);
                  setActiveAI(i);
                } else { setActiveAI(i); toast.info(t('ui.aiFullToast')); } // P2-4：选满时明确告知（右上角✕可一键腾位）
              }
            },
            style: {
              position: 'relative',
              padding: '12px 10px',
              borderRadius: 8,
              border: '2px solid ' + (isActive ? 'var(--c-accent)' : isSelected ? 'var(--c-danger)' : 'var(--c-border)'),
              background: isActive ? 'rgba(66,135,55,0.15)' : isSelected ? 'rgba(180,30,30,0.1)' : 'transparent',
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
            style: { position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: 'hsl(0 65% 45%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, lineHeight: 1, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.4)', zIndex: 2 }
          }, '✕'),
            h('div', { style: { color: 'var(--c-accent)', marginBottom: 4, display: 'inline-flex' } }, h(Icon[AI_CRESTS[i]], { size: 20 })),
                        h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--c-text)' } }, name), //：只展示名称
          );
        }),
      ),
      activeAI >= 0 && h('div', { style: { padding: '12px', background: 'var(--c-border-soft)', borderRadius: 8 } },
        h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--c-accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          t('ui.aiParams', { name: AI_NAMES[activeAI] }) + (selectedAIs.indexOf(activeAI) >= 0 ? '' : t('ui.unselected')),
          h('div', { style: { display: 'flex', gap: 4 } },
            selectedAIs.indexOf(activeAI) >= 0 ?
              h('button', { className: 'btn btn-outline', style: { padding: '2px 8px', fontSize: 10, color: 'hsl(0 70% 60%)', borderColor: 'hsl(0 40% 30%)' }, title: '将该 AI 移出本局对手', onClick: function () { toggleAI(activeAI); } }, t('ui.deselect')) :
              h('button', { className: 'btn btn-outline', style: { padding: '2px 8px', fontSize: 10, color: 'hsl(142 60% 55%)', borderColor: 'hsl(142 40% 30%)' }, title: '将该 AI 加入本局对手', onClick: function () { if (selectedAIs.length < 3) toggleAI(activeAI); else toast.info(t('ui.aiFullToast')); } }, t('ui.pickAI')),
            h('button', { className: 'btn btn-ghost', style: { padding: '2px 8px', fontSize: 10 }, onClick: function () { setActiveAI(-1); } }, t('ui.collapse')),
          ),
        ),
        [
          [t('ui.slHonest')[0], 'honestChance', 10, 90, 5, t('ui.slHonest')[1]],
          [t('ui.slChallenge')[0], 'challengeChance', 5, 80, 5, t('ui.slChallenge')[1]],
          [t('ui.slMaxCards')[0], 'maxCards', 1, 6, 1, t('ui.slMaxCards')[1]]
        ].map(function (item) {
          var label = item[0],
            key = item[1],
            min = item[2],
            max = item[3],
            step = item[4],
            desc = item[5];
          var val = aiCfgs[activeAI][key];
          var pct = ((val - min) / (max - min)) * 100;
          var unit = key === 'maxCards' ? '张' : '%';
          return h('div', { key: key, style: { marginBottom: 4 } },
            h('div', { style: { position: 'relative', height: 22, display: 'flex', alignItems: 'center', padding: '0 2px' } },
              h('div', { style: { position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 10, borderRadius: 5, background: 'hsl(0 12% 15%)', overflow: 'hidden', pointerEvents: 'none' } },
                h('div', { style: { height: '100%', width: pct + '%', background: 'linear-gradient(90deg,var(--c-danger),hsl(0 65% 52%))', transition: 'width 0.15s ease-out' } }),
              ),
              h('input', {
                type: 'range',
                min: min,
                max: max,
                step: step,
                value: val,
                onChange: function (e) { var v = +e.target.value;
                  setAiCfgs(function (prev) { return prev.map(function (c, j) { return j === activeAI ? Object.assign({}, c, { [key]: v }) : c; }); }); },
                style: { width: '100%', margin: 0, position: 'relative', zIndex: 1, background: 'transparent' }
              }),
              h('div', { style: { position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'baseline', gap: 4 } },
                h('span', { style: { fontSize: 10, fontWeight: 500, color: 'var(--c-text)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' } }, label),
                h('span', { style: { fontSize: 9, color: 'hsl(0 8% 50%)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' } }, desc),
              ),
              h('div', { style: { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' } },
                h('span', { style: { fontSize: 12, fontWeight: 700, color: 'hsl(0 0% 98%)', fontFamily: 'monospace', textShadow: '0 1px 3px rgba(0,0,0,0.9)' } }, val + unit),
              ),
            )
          );
        })
      ),
    ),
    h('div', { style: { width: '100%', maxWidth: 300, marginBottom: 16, opacity: 0, animation: 'enter-rise 0.5s ease 2s forwards' } },
      h('div', { style: { display: 'flex', gap: 10, marginBottom: (diff === 'hard' || diff === 'easy') ? 12 : 0 } },
        h('button', {
          className: 'btn ' + (diff === 'easy' ? 'btn-primary' : 'btn-outline'),
          style: { flex: 1, padding: '10px 0', fontSize: 14, borderRadius: 10 },
          onClick: function () { setDiff('easy'); }
        },
          h('span', { style: { marginRight: 4, display: 'inline-flex' } }, h(Icon.Clover, { size: 14 })), t('ui.diffEasy')),
        h('button', {
          className: 'btn ' + (diff === 'normal' ? 'btn-primary' : 'btn-outline'),
          style: { flex: 1, padding: '10px 0', fontSize: 14, borderRadius: 10 },
          onClick: function () { setDiff('normal'); }
        }, t('ui.diffNormal')),
        h('button', {
          className: 'btn ' + (diff === 'hard' ? 'btn-primary' : 'btn-outline'),
          style: { flex: 1, padding: '10px 0', fontSize: 14, borderRadius: 10 },
          onClick: function () { setDiff('hard'); }
        },
          h('span', { style: { marginRight: 4, display: 'inline-flex' } }, h(Icon.Flame, { size: 14 })), t('ui.diffHard')),
      ),
      diff === 'easy' && h('div', { style: { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 } },
        h('span', { style: { fontSize: 11, color: 'hsl(142 60% 55%)', background: 'rgba(34,139,80,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(34,139,80,0.25)' } }, 'AI 20% 失误率'),
        h('span', { style: { fontSize: 11, color: 'hsl(142 60% 55%)', background: 'rgba(34,139,80,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(34,139,80,0.25)' } }, '适合熟悉规则'),
      ),
      diff === 'hard' && h('div', { style: { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 11, color: 'hsl(0 70% 65%)', background: 'rgba(180,30,30,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(180,30,30,0.25)' } }, 'AI质疑率+50%'),
        h('span', { style: { fontSize: 11, color: 'hsl(0 70% 65%)', background: 'rgba(180,30,30,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(180,30,30,0.25)' } }, '目标牌更少'),
        h('span', { style: { fontSize: 11, color: 'hsl(0 70% 65%)', background: 'rgba(180,30,30,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(180,30,30,0.25)' } }, '轮盘双子弹'),
      ),
    ),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300, opacity: 0, animation: 'enter-rise 0.6s cubic-bezier(0.16,1,0.3,1) 2.2s forwards' } },
      //：开始游戏复合按钮——大块主色入口 + 两个暗色模式小块，一体成型
      h('div', { style: { width: '100%', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 4px 12px var(--c-danger-shadow)' } },
        h('button', { className: 'btn btn-primary', style: { width: '100%', borderRadius: 0, padding: '13px 0', fontSize: 16 }, onClick: function () { if (menuMode === 'single') handleStart(); else onMultiplayer(); } },
          h(Icon.Play, { size: 16 }), t('ui.startGame')),
        h('div', { style: { display: 'flex', background: 'rgba(0,0,0,0.45)' } }, // 暗色小块行
          h('button', {
            style: {
              flex: 1, padding: '9px 0', fontSize: 13, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: menuMode === 'single' ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: menuMode === 'single' ? 'hsl(0 0% 98%)' : 'hsl(0 8% 55%)',
              fontWeight: menuMode === 'single' ? 700 : 500,
            },
            onClick: function () { setMenuMode('single'); }
          },
            h('span', { style: { display: 'inline-flex' } }, h(Icon.Play, { size: 13 })), t('ui.modeSingle')),
          h('button', {
            style: {
              flex: 1, padding: '9px 0', fontSize: 13, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              borderLeft: '1px solid rgba(255,255,255,0.10)',
              background: menuMode === 'multi' ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: menuMode === 'multi' ? 'hsl(0 0% 98%)' : 'hsl(0 8% 55%)',
              fontWeight: menuMode === 'multi' ? 700 : 500,
            },
            onClick: function () { setMenuMode('multi'); }
          },
            h('span', { style: { display: 'inline-flex' } }, h(Icon.Wifi, { size: 13 })), t('ui.modeMulti')),
        ),
      ),
      h('button', { className: 'btn btn-outline btn-lg', style: { width: '100%' }, onClick: function () { setAchData(loadAch()); setShowAch(true); } }, h(Icon.Trophy, { size: 16 }), t('ui.ach')),
      h('button', { className: 'btn btn-outline btn-lg', style: { width: '100%' }, onClick: function () { setShowStats(true); } }, h(Icon.Swords, { size: 16 }), t('ui.stats')), // P1-2
    ),
    h('p', { style: { marginTop: 32, fontSize: 12, color: 'var(--c-text-dim)', opacity: 0, textAlign: 'center', animation: 'enter-fade 0.8s ease 2.6s forwards' } }, '4 名玩家 · 64 张牌 · 每人 16 张牌库 · A/K/Q 目标 · J 万能 · 天使&恶魔衍生牌'),
    !fast && !hintGone && !skipAnim && h('p', { key: 'fastHint', style: { marginTop: 14, fontSize: 11, color: 'var(--c-text-faint)', letterSpacing: '0.15em', textAlign: 'center', opacity: 0, animation: 'enter-fade 0.6s ease 1s forwards, hint-breath 2.2s ease-in-out 1.8s infinite' } }, t('ui.fastHint')),
    achR && h('div', { className: 'overlay' + (achClosing ? ' overlay-exit' : ''), onClick: function (e) { if (e.target === e.currentTarget) setShowAch(false); } },
      h('div', { className: 'panel animate-slide-up' + (achClosing ? ' panel-exit' : ''), style: { width: '90%', maxWidth: 440, maxHeight: '80vh', overflow: 'auto', padding: 24 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
          h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 18, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 } }, h(Icon.Trophy, { size: 20 }), t('ui.ach')),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('span', { style: { fontSize: 12, color: 'hsl(42 60% 60%)' } }, '已解锁 ' + Object.keys((achData || {}).unlocked || {}).length + ' / ' + ACHIEVEMENTS.length),
            h('button', { className: 'btn btn-ghost', style: { padding: '2px 8px', fontSize: 12, color: 'hsl(0 60% 60%)' }, onClick: function () { setShowAch(false); } }, '关闭'),
          ),
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          ACHIEVEMENTS.map(function (a) {
            const got = !!(achData || {}).unlocked && !!(achData.unlocked[a.id]);
            return h('div', {
              key: a.id,
              style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: got ? 'hsla(42,60%,40%,0.08)' : 'hsl(0 10% 8%)', border: '1px solid ' + (got ? 'hsla(42,70%,50%,0.35)' : 'hsl(0 12% 20%)'), opacity: got ? 1 : 0.55 },
            },
              h('span', { style: { display: 'inline-flex', color: got ? 'hsl(42 85% 60%)' : 'hsl(0 8% 40%)', flexShrink: 0 } }, h(Icon[a.icon] || Icon.Sparkles, { size: 22 })),
              h('div', { style: { flex: 1 } },
                h('h3', { style: { fontSize: 13, fontWeight: 600, marginBottom: 2, color: got ? 'hsl(42 80% 65%)' : 'hsl(0 12% 60%)' } }, a.name),
                h('p', { style: { fontSize: 11, color: 'var(--c-text-dim)', lineHeight: 1.5 } }, a.desc),
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
              h('span', { style: { fontSize: 13, fontWeight: 700, color: 'hsl(42 80% 60%)', fontFamily: 'monospace' } }, 'ELO ' + (sh.elo || 1000)),
              h('button', { className: 'btn btn-ghost', style: { padding: '2px 8px', fontSize: 12, color: 'hsl(0 60% 60%)' }, onClick: function () { setShowStats(false); } }, '关闭'),
            ),
          ),
          ms.length === 0 ? h('p', { style: { fontSize: 13, color: 'var(--c-text-dim)', textAlign: 'center', padding: '28px 0' } }, '还没有对局记录——打完一局后这里会展示 ELO 走势与战绩雷达')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 } },
              [['胜', wins, 'hsl(142 60% 55%)'], ['负', losses, 'hsl(0 60% 55%)'], ['平', draws, 'hsl(0 8% 55%)']].map(function (s) {
                return h('div', { key: s[0], style: { textAlign: 'center', padding: '10px 0', borderRadius: 8, background: 'hsl(0 10% 8%)', border: '1px solid hsl(0 12% 20%)' } },
                  h('div', { style: { fontSize: 20, fontWeight: 700, color: s[2] } }, s[1]),
                  h('div', { style: { fontSize: 11, color: 'var(--c-text-dim)', marginTop: 2 } }, s[0]),
                );
              })
            ),
            LineChart({ matches: ms }),
            aggRes && h('div', { style: { display: 'flex', justifyContent: 'center' } }, RadarChart({ agg: aggRes.agg, raw: aggRes.raw })),
            h('div', null,
              h('p', { style: { fontSize: 12, fontWeight: 600, color: 'var(--c-text-dim)', marginBottom: 6 } }, '最近对局'),
              ms.slice(0, 5).map(function (m, i) {
                const delta = m.eloAfter - m.eloBefore;
                return h('div', { key: i, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: 'hsl(0 10% 8%)', border: '1px solid hsl(0 12% 20%)', marginBottom: 6, fontSize: 12 } },
                  h('span', { style: { color: 'var(--c-text-dim)' } }, (diffName[m.difficulty] || m.difficulty) + ' · ' + fmtDate(m.ts)),
                  h('span', { style: { fontWeight: 700, color: m.result === 'win' ? 'hsl(142 60% 55%)' : m.result === 'draw' ? 'hsl(0 8% 55%)' : 'hsl(0 60% 55%)' } }, m.result === 'win' ? '胜' : m.result === 'draw' ? '平' : '负'),
                  h('span', { style: { fontFamily: 'monospace', color: delta >= 0 ? 'hsl(142 60% 55%)' : 'hsl(0 60% 55%)' } }, (delta >= 0 ? '+' : '') + delta),
                );
              })
            ),
          ),
        ),
      );
    })(),
    settingsR && h('div', { className: 'overlay' + (settingsClosing ? ' overlay-exit' : ''), onClick: function (e) { if (e.target === e.currentTarget) setSettings(false); } },
      h('div', { className: 'panel animate-slide-up' + (settingsClosing ? ' panel-exit' : ''), style: { width: '90%', maxWidth: 380, maxHeight: '80vh', overflow: 'auto', padding: 24 } },
        h('h2', { style: { fontFamily: 'var(--font-title)', fontSize: 18, fontWeight: 'bold', marginBottom: 20 } }, t('ui.settingsTitle')),
        [
          t('ui.setAICfg').concat([showAIConfig, setShowAIConfig]), // v86：前两项（渐进轮盘/自动排序）已锁定开启，从面板移除
          t('ui.setSkipPenalty').concat([skipPenalty, setSkipPenaltyPref])
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
            h('div', { style: { fontSize: 13, color: 'var(--c-text-dim)' } }, t('ui.setAudio')),
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
            h('div', { style: { fontSize: 13, color: 'var(--c-text-dim)' } }, t('ui.setSfx')),
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
                  style: { flex: 1, padding: '8px 0', fontSize: 13, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
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
              style: { width: '100%', minHeight: 72, background: 'var(--c-panel-strong)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 8, fontSize: 11, fontFamily: 'monospace', boxSizing: 'border-box' },
            }),
            h('button', {
              type: 'button', className: 'btn btn-primary', style: { marginTop: 8, width: '100%', padding: '8px 0', fontSize: 13, borderRadius: 8 },
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
            h('div', { style: { fontSize: 11, color: 'var(--c-text-dim)', marginTop: 4 } }, t('ui.thinkSub') + '（' + LlmAI.getLog().length + ' 条）'),
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
                  h('div', { style: { fontSize: 13, fontWeight: 600 } },
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

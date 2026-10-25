// @ts-nocheck
/* ═══════════════════════════════════════════════════════════
 * 对外暴露：I18N, t(key, vars), getLang, setLang(lang), subLang(fn)
 * 词典结构：I18N.zh.ui.*（点路径取词）、.rules[icon]（规则页）、
 * .events[type]（事件卡 name/desc，key 与 00-constants EVENTS.type 对应）
 * 现状：t() 已覆盖 UI 框架 + 规则页 + 事件卡；引擎播报/AI 名/成就/回放
 * 等仍为硬编码中文——出海时一并补齐后再重加 en 词典。
 * ═══════════════════════════════════════════════════════════ */

const I18N = {
  zh: {
    ui: {
      subtitle: '酒馆深处 · 谎言与子弹',
      title: '骗子牌',
      titleEn: "Liar's Deck",
      rules: '游戏规则',
      aiParams: '{name} 的参数',
      liarBuckets: ['老实人', '偶有虚言', '惯于撒谎'],
      single: '单机模式',
      multi: '联机模式',
      startGame: '开始游戏',
      modeSingle: '单机',
      modeMulti: '联机',
      ach: '成就',
      stats: '战绩',
      reputation: '信誉',
      logout: '登出',
      settingsTitle: '游戏设置',
      setAICfg: ['自定义AI设置', '在主界面显示AI对手选择和参数调节'],
      setSkipPenalty: ['跳过惩罚动画', '轮盘演出直接显示结果，省去转轮等待'],
      setSound: ['音效', '关闭后氛围与牌局音效全部静音'],
      setAudio: '酒馆氛围音效',
      setSfx: '牌局音效',
      saveMgmt: ['存档管理', '成就 · 统计 · 战绩 · 偏好，可导出备份'],
      saveExport: '导出', saveImport: '导入',
      saveExported: '存档已复制到剪贴板',
      saveFallback: '剪贴板不可用，已改为下载存档文件',
      llmBrain: ['云端大模型', '开启后单机 AI 走 GLM 云端决策 · 关闭则用本地 AI'],
      llmKeyPh: '粘贴智谱 API Key（仅存本机）…',
      llmTest: '测试', llmTestOk: '连接成功', llmTestFail: '连接失败',
      llmHint: '开关开启且 Key 有效时，单机 AI 才会调用云端（10 秒超时自动回落本地 AI）。点「测试」可验证连通——官方平台调用统计应在测试后出现记录。Key 仅存本机。',
      thinkLog: '思考日志', thinkClear: '清空',
      thinkSub: '云端模型每次决策的思考过程 · 实时记录',
      qLocal: ['质疑用本地 AI', '质疑秒出零延迟 · 出牌仍走云端'],
      thinkEmpty: '暂无记录——开启云端模型后，AI 每次出牌/质疑都会在这里留下思考过程（选 glm-z1-flash 思考模型可获得完整思维链）',
      savePlaceholder: '粘贴此前导出的存档 JSON…',
      saveRestore: '恢复存档', saveInvalid: '存档格式无效',
      setMaxPlay: ['出牌张数上限', '单次最多打出的手牌数量（1~5 张）'],
      maxPlayHint: '少出更稳',
      setApplied: '设置即时生效',
      themeLabel: '主题',
      themeExt: ['更多主题', '开启后可选择其他视觉主题'],
      fastHint: '点击任意处加速入场',
      themes: ['酒馆', '雪夜', '赌场'],
      selAITitle: '选择 3 个 AI 对手',
      unselected: '（未选中）',
      pickAI: '选择该 AI',
      pickAITip: '将该 AI 加入本局对手',
      deselect: '取消选择',
      collapse: '收起',
      slHonest: ['诚实率', '不易撒谎'],
      slChallenge: ['质疑率', '爱质疑'],
      slMaxCards: ['出牌', '最多出几张'],
      aiFullToast: '最多选择 3 个 AI 对手，先取消一个',
      diffEasy: '新手模式',
      diffNormal: '普通模式',
      diffHard: '困难模式',
    },
    rules: {
      Joker: {
        title: '核心规则',
        desc: '轮流出牌，声称全是目标牌面（A/K/Q）。真话谎话随你——J 可冒充任何牌面。'
      },
      Cylinder: {
        title: '质疑与轮盘',
        desc: '下家可质疑：撒谎者上轮盘，冤枉好人自己上轮盘。中弹概率越滚越高，出局即淘汰。'
      },
      Sparkles: {
        title: '特殊牌',
        desc: '天使护谎免罚；恶魔反噬，让冤枉你的质疑者连开两枪。'
      },
      Users: {
        title: '角色与事件',
        desc: '开局随机角色、随机事件搅局——首遇时局内会教你。活到最后即胜。'
      }
    },
    roles: {
      swindler: { name: '老千', action: '变出目标牌', passive: '', desc: '每局 1 次：把手中一张杂牌变成当前目标牌面' },
      bartender: { name: '酒保', action: '请全场喝酒', passive: '', desc: '每 3 轮 1 次：下一轮所有人的出牌上限 +1' },
      bounty: { name: '赏金猎人', action: '', passive: '质疑成功时吹牌计数 +1', desc: '被动：每次质疑成功，额外获得 1 次吹牌计数' },
      gunslinger: { name: '神枪手', action: '提前布防', passive: '', desc: '每局 1 次：布防后下一次上轮盘必活' },
      mindreader: { name: '读心者', action: '偷看手牌', passive: '', desc: '每 3 轮 1 次：偷看一名对手的一张手牌' },
      demonfiend: { name: '恶魔', action: '堕落天使', passive: '', desc: '每局 1 次：把手中一张天使牌变成恶魔牌' },
      guardian: { name: '天使', action: '', passive: '轮盘死亡时自动免死一次', desc: '被动：每局 1 次轮盘免死，自动触发' },
      chameleon: { name: '变色龙', action: '改写目标', passive: '', desc: '每局 1 次（需先成功吹牌）：把目标牌面改写为其他花色' },
    },
    events: {
      flood:          { name: '洪水',   desc: '巨浪席卷全场，每位玩家的一半手牌被冲入弃牌区' },
      doom:           { name: '厄运',   desc: '厄运缠身，连续触发三个互不相同的随机事件' },
      mushroom_cloud: { name: '蘑菇云', desc: '蘑菇云腾起，随机两名玩家立即接受一次轮盘惩罚' },
      hope_q:         { name: '希望？', desc: '一线希望？一名随机玩家进入观战，下次发牌时回归' },
      inspire:        { name: '激发',   desc: '使用过天使或恶魔牌的玩家受到反噬，各失去两张非目标牌' },
      meteor:         { name: '陨石',   desc: '陨石连续坠落十次，每次将一张随机手牌轰入弃牌区' },
      avalanche:      { name: '雪崩',   desc: '雪崩封山，随机冻结八张手牌，直到下一轮才能使用' },
      blacktide:      { name: '黑潮',   desc: '黑潮侵蚀，五张随机牌被永久放逐（全场至多十五张，满后黑潮失效）' },
      hope_bang:      { name: '希望！', desc: '真正的希望！中弹概率重置，离场者全部复活并立即接受一次惩罚' },
      long_night:     { name: '长夜',   desc: '长夜降临，黑潮卷走五张牌，两回合内所有人都看不到自己的手牌' },
      skyfall:        { name: '天崩',   desc: '天崩地裂，其余所有事件同时降临，中弹概率永久提升，此事件本场不再出现' },
      switch_dir:     { name: '转换',   desc: '时空倒转，出牌顺序立即反转' },
      dice_game:      { name: '骰子桌', desc: '角落的骰子声诱惑着你——押一把，还是走开？', choices: [
        { label: '押一把', desc: '一半天下：全场对手各弃 2 张；一半深渊：自己弃 4 张' },
        { label: '收手', desc: '从自己牌库摸 1 张，酒馆重归平静' } ] },
      black_market:   { name: '黑市交易', desc: '帷幕后的商人向你招手——情报有价，看你肯出什么。', choices: [
        { label: '买情报', desc: '弃 2 张手牌，从黑市翻出 2 张来路不明的牌入手' },
        { label: '卖情报', desc: '随机一名对手摸 2 张，自己摸 3 张' } ] },
      sheriff:        { name: '治安官', desc: '治安官敲了敲桌子，问你要个说法。', choices: [
        { label: '举报', desc: '随机一名对手立即接受一次轮盘惩罚' },
        { label: '息事宁人', desc: '全场中弹概率重置回 1/6' } ] },
      tornado:        { name: '龙卷风', desc: '风暴正在逼近，你是护住家当，还是任其掠过？', choices: [
        { label: '护牌', desc: '自己弃 2 张，风暴卷走全场随机 3 张牌（放逐）' },
        { label: '乘风', desc: '自己摸 2 张，但全场中弹概率永久 +1' } ] },
      duel:           { name: '决斗', desc: '一个醉汉把左轮拍在桌上，指名要和你单挑。', choices: [
        { label: '应战', desc: '你和随机一名对手各开一枪' },
        { label: '认怂', desc: '自己弃 3 张手牌，对手获得 1 张' } ] },
      treasure:       { name: '藏宝图', desc: '一张泛黄的地图在桌上流转——挖，还是卖？', choices: [
        { label: '挖宝', desc: '一半是宝：自己摸 4 张；一半是坑：自己 3 张手牌被放逐' },
        { label: '卖图', desc: '所有存活玩家各摸 1 张' } ] }
    }
  }
};

/* ── 语言状态 ──
 * t() 机制与 zh 词典原样保留——将来出海只需重补 I18N.en，setLang('en') 即自动可用。 */
let __lang = 'zh';
const __langSubs = [];

/** 点路径取词：t('ui.rules')、t('events.flood.name')；支持 {x} 插值 t('ui.aiParams', {name:'铁手'}) */
function t(key, vars) {
  var node = I18N[__lang];
  var parts = key.split('.');
  for (var i = 0; i < parts.length; i++) {
    if (node == null) break;
    node = node[parts[i]];
  }
  if (node == null) {
    // 兜底：回退中文
    node = I18N.zh;
    for (var j = 0; j < parts.length; j++) {
      if (node == null) return key;
      node = node[parts[j]];
    }
    if (node == null) return key;
  }
  if (vars && typeof node === 'string') {
    Object.keys(vars).forEach(function (k) {
      node = node.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    });
  }
  return node;
}

function getLang() { return __lang; }

function setLang(lang) {
  if (!I18N[lang] || lang === __lang) return;
  __lang = lang;
  try { localStorage.setItem('ld_lang', lang); } catch (e) { /* 无痕模式下忽略 */ }
  __langSubs.forEach(function (fn) { try { fn(lang); } catch (e) { /* 订阅者异常不阻断 */ } });
}

/** 订阅语言变化（用于 React 组件触发重渲染），返回取消订阅函数 */
function subLang(fn) {
  __langSubs.push(fn);
  return function () { var i = __langSubs.indexOf(fn); if (i >= 0) __langSubs.splice(i, 1); };
}

// @ts-nocheck
/**
 * 00-constants.js
 * 职责：集中管理所有游戏常量与配置
 * 对外暴露：GAME_VERSION, AI_NAMES, AI_PRESETS, ALL_SUITS, TARGET_SUITS, EVENTS,
 * GAME_RULES, SUIT_COLOR, SUIT_BORDER, MOD_GLOW, MOD_STYLE,
 * STATS_KEY, defaultStats, USER_DB_KEY, SESSION_KEY
 */

// 游戏版本号：发版.py 自动注入（与 index.html title 同步替换；唯一事实源 = VERSION.txt）
const GAME_VERSION = 'v100';

// ── AI 配置 ───────────────────────────────────────────────────────────
// AI 元信息绑定：以 AI_META 为单一事实源——名字/人格/纹章在此一次性绑死
const AI_META = [
  { name: '独眼杰克', persona: null,        crest: 'CrestJack'  },
  { name: '瘸腿老汤姆', persona: null,      crest: 'CrestTom'   },
  { name: '红发玛丽', persona: null,        crest: 'CrestMary'  },
  { name: '铁手比尔', persona: null,        crest: 'CrestBill'  },
  { name: '幸运露西', persona: 'lucky',     crest: 'CrestLucy'  },
  { name: '侦探格雷', persona: 'observer',  crest: 'CrestGrey'  },
  { name: '疯刀疤', persona: 'berserker',   crest: 'CrestScar'  },
  { name: '夜鸦', persona: 'stalker',      crest: 'CrestRaven' },
];
const AI_NAMES = AI_META.map(function (m) { return m.name; });

const AI_PRESETS = [
  { honestChance: 60, challengeChance: 25, maxCards: 3, minCards: 1 }, // 老汤姆 conservative（ 调平：出牌提速）
  { honestChance: 35, challengeChance: 60, maxCards: 4, minCards: 1 },
  { honestChance: 50, challengeChance: 40, maxCards: 4, minCards: 2 }, // 红发玛丽 impatient（9-12 调平：maxCards 5→4 消苟局平局）
  { honestChance: 25, challengeChance: 75, maxCards: 3, minCards: 1 },
  // B1 新增 4 人格基线（参数之上还有 30-ai.js 的动态修正层）
  { honestChance: 40, challengeChance: 45, maxCards: 5, minCards: 2 }, // 幸运露西 lucky（9-12 调平：诚实 45→40，配 30-ai lucky 层瘦身）
  { honestChance: 60, challengeChance: 15, maxCards: 3, minCards: 1 }, // 侦探格雷 observer
  { honestChance: 50, challengeChance: 30, maxCards: 6, minCards: 2 },  // 疯刀疤 berserker（ 调平：吹牌率 60→50，minCards 3→2）
  { honestChance: 55, challengeChance: 65, maxCards: 3, minCards: 1 }, // 夜鸦 stalker
];

//：AI_PERSONAS / AI_CRESTS 由顶部 AI_META 派生（人格/纹章与名字绑死，杜绝索引漂移）
const AI_PERSONAS = AI_META.reduce(function (o, m, i) { if (m.persona) o[i] = m.persona; return o; }, {});
const AI_CRESTS = AI_META.map(function (m) { return m.crest; });

// ── 牌面花色 ──────────────────────────────────────────────────────────
/** @type {readonly ('A'|'K'|'Q')[]} */
const TARGET_SUITS = ['A', 'K', 'Q'];
/** @type {readonly ('A'|'K'|'Q'|'J')[]} */
const ALL_SUITS = ['A', 'K', 'Q', 'J'];
// A3：双色目标池（两牌面同时有效）；J 是万能牌，与"目标"语义重叠，故不设 JQ 组合
/** @type {readonly ('AK'|'AQ'|'KQ')[]} */
const TARGET_DUALS = ['AK', 'AQ', 'KQ'];

// 目标牌面显示格式化——'AK' → 'A·K'，单色 'A' → 'A'
function fmtTarget(t) {
  return (t || 'A').split('').join('·');
}

const GAME_RULES = [
  {
    icon: 'Joker',
    title: '核心规则',
    desc: '轮流出牌，声称全是目标牌面（A/K/Q）。真话谎话随你——J 可冒充任何牌面。'
  },
  {
    icon: 'Cylinder',
    title: '质疑与轮盘',
    desc: '下家可质疑：撒谎者上轮盘，冤枉好人自己上轮盘。中弹概率越滚越高，出局即淘汰。'
  },
  {
    icon: 'Sparkles',
    title: '特殊牌',
    desc: '天使护谎免罚；恶魔反噬，让冤枉你的质疑者连开两枪。'
  },
  {
    icon: 'Users',
    title: '角色与事件',
    desc: '开局随机角色、随机事件搅局——首遇时局内会教你。活到最后即胜。'
  },
];
const GAME_RULES_DETAIL = [
  {
    icon: 'Users',
    title: '酒馆角色',
    desc: '开局每人随机获得一个不重复的酒馆角色。老千可将一张杂牌变为目标牌面（每局 1 次）；酒保每 3 轮请全场喝酒，下一轮出牌上限 +1；赏金猎人质疑成功时吹牌计数 +1；神枪手可提前布防，下一次轮盘必活（每局 1 次）；读心者每 3 轮可偷看一名对手的一张手牌；恶魔可将一张天使牌变为恶魔牌（每局 1 次）；天使在轮盘死亡时自动免死一次（庇佑需献祭：弃 1 张手牌入放逐区，空手则失效）；变色龙在成功吹牌后可改写目标牌面（每局 1 次）。被动技能自动生效，主动技能在自己回合点击技能按钮发动，AI 对手也会自动发动。'
  },
  {
    icon: 'Joker',
    title: '出牌与声称',
    desc: '轮到你时，选择 1~多张手牌打出，并声称它们全部是目标牌面（A/K/Q）。J 是万能牌，可当作任意花色。你可以撒谎——只要不被识破。出牌后从个人牌库补牌至 8 张。换轮时有 1/3 概率出现双色目标（如 A·K，两种牌面均算诚实）。'
  },
  {
    icon: 'Search',
    title: '质疑与揭晓',
    desc: '下家可以选择"跟牌"继续，或"质疑"你的声称。若你撒谎且没有天使牌护身，你将接受惩罚；否则质疑者自食其果。'
  },
  {
    icon: 'Cylinder',
    title: '俄罗斯轮盘',
    desc: '惩罚是一局俄罗斯轮盘——中弹概率随开枪次数递增（1/6→2/6→...），中弹者直接出局。最后存活者获胜。'
  },
  {
    icon: 'Sparkles',
    title: '特殊牌：天使 & 恶魔',
    desc: '天使牌：撒谎被质疑时免于惩罚。恶魔牌：诚实被质疑时质疑方连开两枪。'
  },
  {
    icon: 'Dices',
    title: '随机事件',
    desc: '每局开始和每 3 回合触发随机事件，共 18 种（含 6 种可自行抉择的酒馆事件）：洪水、厄运、蘑菇云、希望？、激发、陨石、雪崩、黑潮、希望！、长夜、天崩、转换，以及骰子桌、黑市交易、治安官、龙卷风、决斗、藏宝图。'
  },
  {
    icon: 'Discard',
    title: '弃牌区',
    desc: '打出与弃掉的牌都进入弃牌区，对任何玩家不可见。所有人手牌与牌库耗尽时，从弃牌区洗牌重新发牌；复活的玩家也从弃牌区取牌。牌不会凭空产生或消失。'
  },
  {
    icon: 'Swords',
    title: '两种模式',
    desc: '单机 vs 3个AI对手；联机通过房间码与好友实时对战。'
  },
];;

const EVENTS = [
  { type: 'flood', name: '洪水', desc: '巨浪席卷全场，每位玩家的一半手牌被冲入弃牌区', icon: 'Flood' },
  { type: 'doom', name: '厄运', desc: '厄运缠身，连续触发三个互不相同的随机事件', icon: 'Doom' },
  { type: 'mushroom_cloud', name: '蘑菇云', desc: '蘑菇云腾起，随机两名玩家立即接受一次轮盘惩罚', icon: 'Mushroom' },
  { type: 'hope_q', name: '希望？', desc: '一线希望？一名随机玩家进入观战，下次发牌时回归', icon: 'HopeQ' },
  { type: 'inspire', name: '激发', desc: '使用过天使或恶魔牌的玩家受到反噬，各失去两张非目标牌', icon: 'Inspire' },
  { type: 'meteor', name: '陨石', desc: '陨石连续坠落十次，每次将一张随机手牌轰入弃牌区', icon: 'Meteor' },
  { type: 'avalanche', name: '雪崩', desc: '雪崩封山，随机冻结八张手牌，直到下一轮才能使用', icon: 'Avalanche' },
  { type: 'blacktide', name: '黑潮', desc: '黑潮侵蚀，五张随机牌被永久放逐（全场至多十五张，满后黑潮失效）', icon: 'BlackTide' },
  { type: 'hope_bang', name: '希望！', desc: '真正的希望！中弹概率重置，离场者全部复活并立即接受一次惩罚', icon: 'HopeBang' },
  { type: 'long_night', name: '长夜', desc: '长夜降临，黑潮卷走五张牌，两回合内所有人都看不到自己的手牌', icon: 'LongNight' },
  { type: 'skyfall', name: '天崩', desc: '天崩地裂，其余所有事件同时降临，中弹概率永久提升，此事件本场不再出现', icon: 'Skyfall' },
  { type: 'switch_dir', name: '转换', desc: '时空倒转，出牌顺序立即反转', icon: 'SwitchDir' },
  // ── C1/C2：抉择事件（weight 0.6 稀有于自然事件；不进厄运/天崩连锁）──
  { type: 'dice_game', name: '骰子桌', desc: '角落的骰子声诱惑着你——押一把，还是走开？', icon: 'Dices', weight: 0.6, choices: [
    { id: 'bet', label: '押一把', desc: '一半天下：全场对手各弃 2 张；一半深渊：自己弃 4 张', risk: 1 },
    { id: 'leave', label: '收手', desc: '从自己牌库摸 1 张，酒馆重归平静', risk: 0 },
  ] },
  { type: 'black_market', name: '黑市交易', desc: '帷幕后的商人向你招手——情报有价，看你肯出什么。', icon: 'Masks', weight: 0.6, choices: [
    { id: 'buy', label: '买情报', desc: '弃 2 张手牌，从黑市翻出 2 张来路不明的牌入手', risk: 0 },
    { id: 'sell', label: '卖情报', desc: '随机一名对手摸 2 张，自己摸 3 张', risk: 0.5 },
  ] },
  { type: 'sheriff', name: '治安官', desc: '治安官敲了敲桌子，问你要个说法。', icon: 'Shield', weight: 0.6, choices: [
    { id: 'report', label: '举报', desc: '随机一名对手立即接受一次轮盘惩罚', risk: 1 },
    { id: 'calm', label: '息事宁人', desc: '全场中弹概率重置回 1/6', risk: 0 },
  ] },
  { type: 'tornado', name: '龙卷风', desc: '风暴正在逼近，你是护住家当，还是任其掠过？', icon: 'Zap', weight: 0.6, choices: [
    { id: 'protect', label: '护牌', desc: '自己弃 2 张，风暴卷走全场随机 3 张牌（放逐）', risk: 0.5 },
    { id: 'gamble', label: '乘风', desc: '自己摸 2 张，但全场中弹概率永久 +1', risk: 1 },
  ] },
  { type: 'duel', name: '决斗', desc: '一个醉汉把左轮拍在桌上，指名要和你单挑。', icon: 'Swords', weight: 0.6, choices: [
    { id: 'fight', label: '应战', desc: '你和随机一名对手各开一枪', risk: 1 },
    { id: 'yield', label: '认怂', desc: '自己弃 3 张手牌，对手获得 1 张', risk: 0 },
  ] },
  { type: 'treasure', name: '藏宝图', desc: '一张泛黄的地图在桌上流转——挖，还是卖？', icon: 'Crown', weight: 0.6, choices: [
    { id: 'dig', label: '挖宝', desc: '一半是宝：自己摸 4 张；一半是坑：自己 3 张手牌被放逐', risk: 1 },
    { id: 'sell', label: '卖图', desc: '所有存活玩家各摸 1 张', risk: 0 },
  ] },
];

// ── 牌面颜色与边框 ──────────────────────────────────────────────────
const SUIT_COLOR = { A: '#ef4444', K: '#10b981', Q: '#a855f7', J: '#eab308' };
const SUIT_BORDER = { A: '#dc2626', K: '#059669', Q: '#7c3aed', J: '#ca8a04' };

// ── 特殊牌（天使/恶魔）的光效与标签 ──────────────────────────────
const MOD_GLOW = {
  normal: { glow: 'rgba(255,255,255,0.25)', shadow: '0 0 8px rgba(255,255,255,0.15)', label: '普通' },
  angel: { glow: 'rgba(34,211,238,0.45)', shadow: '0 0 12px rgba(34,211,238,0.3)', label: '天使' },
  demon: { glow: 'rgba(251,146,60,0.5)', shadow: '0 0 12px rgba(251,146,60,0.35)', label: '恶魔' },
};

const MOD_STYLE = {
  normal: { bg: 'linear-gradient(135deg,#1a1210,#1e1614)', border: '#555' },
  angel: { bg: 'linear-gradient(135deg,#0c1a1e,#0e1e22)', border: '#22d3ee' },
  demon: { bg: 'linear-gradient(135deg,#1e0e08,#221208)', border: '#fb923c' },
};

// ── localStorage 键名 ───────────────────────────────────────────────
const STATS_KEY = '__ld_stats';
const USER_DB_KEY = 'ld_users';
const SESSION_KEY = 'ld_session';

// ── 战绩默认值 ──────────────────────────────────────────────────────
const defaultStats = {
  totalGames: 0,
  wins: 0,
  losses: 0,
  maxWinStreak: 0,
  currentWinStreak: 0,
};

// ═══ 类型基座（P0）：ambient 声明，运行时零痕迹 ═══════════════════════
// v92 引入（typescript化改动清单 P0）。
// · .d.ts 不进构建链（build-single 只合并 js/*.js；index.html 不加载）——纯检查期产物
// · 全局类型空间：点亮文件（无 @ts-nocheck 头）直接使用类型名，无需 import
// · 规则：只描述既有形状，不改变任何运行时行为；行尾注释 = 语义/约束
// · 渐进点亮：未点亮文件头有 // @ts-nocheck 豁免，点亮 = 删头 + 修干净报错

/** 扑克牌面：A/K/Q 为目标牌面候选，J 为万能牌（可冒充任意目标） */
type Suit = 'A' | 'K' | 'Q' | 'J';

/** 双色目标（A3）：两种牌面同时算诚实；J 与"目标"语义重叠故不设 JQ 组合 */
type DualSuit = 'AK' | 'AQ' | 'KQ';

/** 单色或双色目标（GameState.targetSuit / Claim.suit 的实际值域） */
type TargetSuit = Suit | DualSuit;

/** 特殊牌修饰：天使护谎 / 恶魔反噬 */
type CardMod = 'normal' | 'angel' | 'demon';

/** 一张牌 */
interface Card {
  /** 全局唯一（发牌序号编码）；'?' = 长夜盲窗的盲卡（仅 id 可信） */
  id: string;
  suit: Suit | '?';
  mod: CardMod;
}

/** 玩家对局统计（Player.stats / GameState.playerStats[pid]）；revived 仅复活时追加（希望重燃成就判定） */
interface PlayerStats {
  playCount: number;
  challengeCount: number;
  shotCount: number;
  revived?: number;
}

/** AI 行为参数（AI_PRESETS 条目 / Player.customConfig） */
interface AIConfig {
  honestChance: number;
  challengeChance: number;
  maxCards: number;
  minCards: number;
}

/** A1 酒馆角色 id（25-roles ROLES[].id） */
type RoleId =
  | 'swindler' | 'bartender' | 'bounty' | 'gunslinger'
  | 'mindreader' | 'demonfiend' | 'guardian' | 'chameleon';

/** B1 动态人格标签（AI_META[].persona，null=无动态层） */
type PersonaTag = 'observer' | 'lucky' | 'berserker' | 'stalker' | null;

/**
 * 玩家（多形态并存：单人/联机/客户端影子——可选字段消费侧已有 || 兜底）
 */
interface Player {
  /** 0=人类位，1..n=AI */
  id: number;
  name: string;
  hand: Card[];
  library: Card[];
  alive: boolean;
  isHuman: boolean;
  /** 本机视角标记 */
  isLocal: boolean;
  /** 联机房主 */
  isHost?: boolean;
  stats: PlayerStats;
  /** 轮盘 3 存活即胜 */
  survivedCount: number;
  /** 吹牌连成计数（达存活人数即胜） */
  bluffSuccessCount: number;
  /** AI 池索引 */
  aiIdx?: number;
  /** 固定 'custom'（参数全在 customConfig） */
  personality?: 'custom';
  customConfig?: AIConfig;
  /** B1 动态人格 */
  persona?: PersonaTag;
  /** 联机影子字段（他人手牌剥离后只留数量） */
  handCount?: number;
  libraryCount?: number;
}

/** 出牌声称（v99 起张数对全部视角可见） */
interface Claim {
  playerId: number;
  count: number;
  suit: TargetSuit;
}

/** 对局阶段全集（含回放/联机侧 'gameover'） */
type GamePhase =
  | 'idle' | 'dealing' | 'player_turn' | 'ai_turn' | 'challenge_phase'
  | 'peek_phase' | 'reconsider_phase' | 'reveal' | 'roulette' | 'event'
  | 'library_dealt' | 'won' | 'lost' | 'draw' | 'gameover';

/** 胜负原因（序列化值不可改——已持久化于回放码/存档，见 20-engine winReason 注释） */
type WinReason = 'bluff5' | 'lastStand' | 'survive3' | 'eventWipe' | 'draw';

/** B2 对手画像（引擎按真实诚实度记录；联机剥离为 {}） */
type KnownStats = Record<number, { bluffs: number; honest: number; challenges: number }>;

/** 技能使用记录（A1，lastSkill / eventTally 消费） */
interface SkillRecord {
  kind: string;
  pid: number;
  round: number;
  [k: string]: any;
}

/** 酒渍（桌面装饰随机点，makeStain 产物） */
interface Stain {
  type: string;
  x: number;
  y: number;
  [k: string]: any;
}

/** 抉择事件选项（EVENTS[].choices[]） */
interface EventChoice {
  id: string;
  label: string;
  desc: string;
  risk: number;
}

/** 全局统计（GameState.stats，localStorage 持久） */
interface StatsBundle {
  totalGames: number;
  wins: number;
  losses: number;
  currentWinStreak: number;
  maxWinStreak: number;
}

/**
 * 权威 GameState（reducer 状态树：INIT 66 字段 + 运行时演进字段）
 */
interface GameState {
  phase: GamePhase;
  players: Player[];
  /** 当前目标牌面（A3 起可为双色） */
  targetSuit: TargetSuit;
  curPlayer: number;
  /** 疲劳（第 5 轮起手牌上限 10） */
  fatigueActive: boolean;
  /** 桌牌（v99 起质疑期也对全部视角可见） */
  tableCards: Card[];
  lastClaim: Claim | null;
  /** 回合数（1 起） */
  round: number;
  /** 质疑判定（v89 起无 'exact'） */
  challengeResult: 'honest' | 'lied' | null;
  challengerId: number | null;
  rouletteResult: 'dead' | 'safe' | null;
  /** 本局累计开枪数 */
  rouletteShots: number;
  winner: Player | null;
  /** 全局统计（localStorage 持久） */
  stats: StatsBundle;
  event: any | null;
  /** 出牌顺序反转 */
  reversed: boolean;
  /** 跳过回合的 pid */
  skipId: number | null;
  /** 天使免疫标记（仅自己可见，联机剥离他人） */
  immuneId: number | null;
  /** 恶魔牌双倍风险 */
  doubleRisk: boolean;
  /** 守卫盾（天使免质疑，视作诚实） */
  challengeShield: boolean;
  /** 读心者偷看展示牌（瞬态） */
  peekCard: Card | null;
  difficulty: 'easy' | 'normal' | 'hard';
  /** 渐进轮盘（v86 锁定恒开） */
  incrementalRoulette: boolean;
  /** 自动排序（v86 锁定恒开） */
  autoSortHand: boolean;
  playerStats: Record<number, PlayerStats>;
  /** 目标牌变化计数（5 次无出局=平局） */
  targetChangeCount: number;
  winReason: WinReason | null;
  /** 被质疑方选择展示的牌 */
  peekedCards: Card[];
  /** 狂化（8 轮起/事件触发，中弹概率翻倍） */
  frenzy: boolean;
  /** 桌面酒渍 */
  stains: Stain[];
  /** 复活已用过（每局 1 次） */
  revived: boolean;
  /** 弃牌区（联机全剥） */
  discardPile: Card[];
  /** 牌序号水位（补牌守恒） */
  cardSeq: number;
  /** 放逐区（上限 15，联机全剥） */
  banishedPile: Card[];
  /** 冻结牌映射 */
  frozen: Record<number, string[]>;
  /** 冻结流水 */
  frozenAdds: { playerId: number; cardId: string; appliedAtRound: number }[];
  /** 本局事件计数 */
  eventTally: Record<string, number>;
  /** 洪水冲走手牌数 */
  floodLoss: Record<number, number>;
  /** 单轮出牌上限（1~5；酒保 buff 时 effMaxPlay 动态 +1） */
  maxPlay: number;
  /** 角色映射（A1） */
  roles: Record<number, RoleId>;
  /** 一次性技能余量 */
  skillCharges: Record<number, Record<string, number>>;
  /** 冷却技能上次发动轮 */
  skillCd: Record<number, Record<string, number>>;
  /** 酒保 buff 截止轮 */
  roundBuffUntil: number;
  /** 读心者偷看快照（瞬态） */
  /** 读心者偷看切片（瞬态；只有 readerId 本人可见，广播剥离） */
  peekReveal: { readerId: number; targetId: number; card: Card } | null;
  /** B2 画像（联机全剥） */
  knownStats: KnownStats;
  /** B1 上次被抓骗子 pid（AI 局势感知） */
  lastCaughtPid: number | null;
  /** 最近技能使用记录（A1 播报用；公开信息，广播保留） */
  lastSkill: SkillRecord | null;
  /** 观战者 pid（希望！/联机） */
  spectateId: number | null;
  spectateEnterRound: number | null;
  /** 长夜盲窗截止轮 */
  blackoutUntil: number | null;
  /** 天崩累计概率平移（/6 加值） */
  rouletteShift: number;
  /** 从抽签池排除的事件 id */
  eventExile: string[];
  /** 用过天使/恶魔牌的 pid（最高危底牌，联机全剥） */
  specialUsers: number[];
  /** 事件结算展示（{ lines: string[], ... }） */
  eventResult: any | null;
  /** C2 待抉择事件（选完清 null） */
  eventChoice: { eventId: string; chooserId: number; chooserName: string } | null;
  /** 牌守恒重发标记 */
  isRedeal?: boolean;
}

/** 随机事件定义（00-constants EVENTS 条目；18 种自然事件 + 6 种抉择事件） */
interface EventDef {
  type: string;
  name: string;
  desc: string;
  icon: string;
  /** 权重省略 = 自然事件同权；0.6 = 抉择事件（稀有，不进厄运/天崩连锁） */
  weight?: number;
  choices?: EventChoiceDef[];
}

/** 抉择事件选项（C2） */
interface EventChoiceDef {
  id: string;
  label: string;
  desc: string;
  /** 0=安全 0.5=中险 1=高危（UI 风险标色） */
  risk?: number;
}

/** applyEvent 返回：事件对玩家的作用结果（调用方经 mergeEventState 合入状态） */
interface EventResult {
  /** 事件可能替换目标牌面（转换/黑潮类） */
  targetSuit?: TargetSuit;
  reverseOrder?: boolean;
  discardPile?: Card[];
  banishedPile?: Card[];
  /** 雪崩冻结流水（过期由 activeFrozen 口径管理） */
  frozen?: { playerId: number; cardId: string; appliedAtRound?: number }[];
  spectateId?: number | null;
  spectateEnterRound?: number | null;
  blackoutUntil?: number | null;
  rouletteShift?: number | null;
  /** 天崩类重置轮盘进度 */
  rouletteShotsReset?: boolean;
  exileSelf?: boolean;
  /** 希望！复活时从既有弃牌区取走的牌 id（调用方剔除防复制） */
  stDiscardTake?: string[];
  cardSeq?: number;
  players: Player[];
  discardAdds?: Card[];
  banishAdds?: Card[];
  frozenAdds?: { playerId: number; cardId: string; appliedAtRound: number }[];
  eventTally?: Record<string, number>;
  floodLoss?: Record<number, number>;
  event?: EventDef;
  /** 事件播报切片（lines 为展示行；v92 前一直存在于实际返回） */
  eventResult?: { lines: string[] } | null;
}

/** Reducer Action 判别联合（20-engine case 全集；字段=各 case 实际消费） */
/** 联机消息协议（PeerJS data 通道；send 侧全集实证，receive 侧见 50-game on('data')） */
type NetMsg =
  | { type: 'state_sync'; state: GameState }
  | { type: 'game_action'; action: Action }
  | { type: 'chat'; name: string; text: string; [k: string]: any }
  | { type: 'meta'; subType: 'PAUSE' | 'RESUME' }
  | { type: 'client_left' }
  | { type: 'reconnect'; name: string }
  | { type: 'host_returned_lobby' }
  | { type: 'query' }
  /** 大厅信标响应（08-lobby-beacon；扩展字段 slot/players 等） */
  | { type: 'room_info'; slot: number; [k: string]: any }
  /** 聊天/文本扩展（历史兼容，字段自由） */
  | { type: 'text'; [k: string]: any };

type Action =
  | { type: 'START'; playerNames: string[]; difficulty: 'easy' | 'normal' | 'hard'; maxPlay: number; aiConfigs?: AIConfig[]; selectedAIs?: number[]; mpPlayers?: any[]; incrementalRoulette?: boolean; autoSortHand?: boolean }
  | { type: 'RESTART' }
  /** 人类位出牌：手牌 id 列表（引擎映射为卡对象，AI_PLAY 才传卡对象——双轨字段勿合并） */
  | { type: 'PLAY'; pid?: number; ids: string[] }
  | { type: 'AI_PLAY'; pid: number; cards: Card[] }
  | { type: 'CONTINUE'; cid?: number }
  | { type: 'CHALLENGE'; cid: number }
  | { type: 'PEEK_REVEAL'; cid: number; ids: string[] }
  | { type: 'REVEAL_COMPLETE' }
  | { type: 'RECONSIDER'; cid: number; decision: 'challenge' | 'continue' }
  | { type: 'ROULETTE'; dead: boolean }
  | { type: 'EVENT_CHOICE'; choiceId: string }
  | { type: 'BEGIN_DEALING' }
  | { type: 'DEAL_COMPLETE' }
  | { type: 'LIBRARY_REDEAL' }
  | { type: 'SKILL_USE'; pid: number; [k: string]: any }
  | { type: 'SKIP_TURN'; pid: number }
  | { type: 'SKIP_SPECTATE'; pid: number }
  | { type: 'SYNC_STATE'; state: GameState };

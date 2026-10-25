// @ts-nocheck
/**
 * 35-ftue.js — 首遇即教（FTUE: First-Time User Experience）
 * 职责：新玩家首次遭遇关键机制时，给一条一次性说明；localStorage 跨局去重，
 *       同一状态切片最多弹 1 条（一次一条不轰炸，下个切片再弹下一条）
 * 依赖：10-utils.js (toast)、25-roles.js (roleOf)
 * 对外暴露：ftueCheck(st)（50-game 渲染层在 st 变化时调用，内部自带去重与节流）、
 *       __ftueReset()（测试钩子：清空内存态与持久化标记）
 * 设计：回放走独立 ReplayView 快照流不经过本检测；观战（spectateId≠null）不弹；
 *       单机/联机通用（基于 st 字段判定）。
 */

const FTUE_KEY = 'liars_ftue_seen_v1';

// 8 角色首遇文案（中文名+一句话触发方式；完整规则仍以主菜单规则卡为准）
const FTUE_ROLE_HINTS = {
  swindler:   '【老千】每局 1 次：出牌阶段点技能按钮，可把一张杂牌变为目标牌面',
  bartender:  '【酒保】被动：每 3 轮自动请全场喝酒，下一轮所有人出牌上限 +1',
  bounty:     '【赏金猎人】被动：质疑成功时吹牌计数额外 +1，更快达成吹牌胜利',
  gunslinger: '【神枪手】每局 1 次：提前布防，下一次轮盘必活',
  mindreader: '【读心者】每 3 轮：可发动技能偷看一名对手的一张手牌',
  demonfiend: '【恶魔】每局 1 次：可把一张天使牌变为恶魔牌',
  guardian:   '【天使】被动：轮盘中弹时自动免死一次（庇佑需献祭：弃 1 张手牌入放逐区）',
  chameleon:  '【变色龙】每局 1 次：成功吹牌后，可把目标牌面换成其他花色',
};

// 触发节点（顺序即优先级）：when 命中且未读过 → 弹 text 并标记
const FTUE_NODES = [
  {
    id: 'role',
    when: (st, me) => me && FTUE_ROLE_HINTS[roleOf(st, me.id)],
    text: (st, me) => FTUE_ROLE_HINTS[roleOf(st, me.id)],
  },
  {
    id: 'jack',
    when: (st, me) => me && (me.hand || []).some(c => c.suit === 'J'),
    text: () => 'J 是万能牌：可当作任意目标牌面（A/K/Q）——它永远算诚实牌',
  },
  {
    id: 'special',
    when: (st, me) => me && (me.hand || []).some(c => c.mod === 'angel' || c.mod === 'demon'),
    text: () => '特殊牌：天使牌=撒谎被质疑时免于轮盘惩罚；恶魔牌=诚实被质疑时，质疑方连开两枪',
  },
  {
    id: 'dual',
    when: (st) => (st.targetSuit || '').includes('·'),
    text: (st) => '双色目标：本轮 ' + st.targetSuit + ' 两种牌面都算诚实，打出其中任意一种都不会被判定撒谎',
  },
  {
    id: 'event',
    when: (st) => !!st.event,
    text: (st) => '随机事件【' + (st.event.name || '???') + '】：' + (st.event.desc || '') + '（每局开始与每 3 回合都会触发，全规则见主菜单规则卡）',
  },
  {
    id: 'roulette',
    when: (st) => st.phase === 'roulette',
    text: () => '俄罗斯轮盘：惩罚枪的中弹概率随开枪次数递增（1/6 → 2/6 → …），中弹即出局',
  },
];

// ── 去重存储（localStorage 跨局持久；不可用时退化为内存态） ──────────
let _seen = null;
function ftueSeenSet() {
  if (_seen) return _seen;
  try { _seen = new Set(JSON.parse(localStorage.getItem(FTUE_KEY) || '[]')); }
  catch (e) { _seen = new Set(); }
  return _seen;
}
function ftueMark(id) {
  ftueSeenSet().add(id);
  try { localStorage.setItem(FTUE_KEY, JSON.stringify([...ftueSeenSet()])); } catch (e) {}
}

// ── 检测入口：同一状态切片只跑一次；观战不参与 ────────────────────
let _lastTick = null;
function ftueCheck(st) {
  if (!st || !st.players || st.spectateId != null) return; // 观战/回放视角不弹
  if (_lastTick === st) return; // 引用锁：同一切片（其他 UI state 变化引起的重渲染）不重复检测
  _lastTick = st;
  const me = st.players.find(p => p.isHuman && p.isLocal);
  for (const node of FTUE_NODES) {
    if (ftueSeenSet().has(node.id)) continue;
    let hit = false;
    try { hit = !!node.when(st, me); } catch (e) { hit = false; }
    if (!hit) continue;
    ftueMark(node.id);
    let msg = '';
    try { msg = node.text(st, me) || ''; } catch (e) { msg = ''; }
    if (msg) toast.info(msg, { duration: 6500 });
    return; // 一次一条：下个状态切片再弹下一条
  }
}

/** 测试钩子：清空内存态+持久化标记，回到"全新玩家" */
function __ftueReset() {
  _seen = null;
  _lastTick = null;
  try { localStorage.removeItem(FTUE_KEY); } catch (e) {}
}

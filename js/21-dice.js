/**
 * 21-dice.js
 * 职责：大话骰（骰子模式）独立规则与状态机（v111）
 *   规则：每人 5 骰偷看；轮番叫「N 个 X」；下家须加码（数量+ 或 同量点数+）或叫开；
 *         开盅全场验点——达成则叫开者输，未达成则叫点者输；输者上命运转盘，死则出局。
 *   范围：仅单机（联机协议扩展留 backlog）；1 点不设万能（标准 Liar's Dice）。
 * 依赖：无前置（rouletteHit 由 20-engine.js 全局提供，UI 层调用）
 * 对外暴露：newDiceState, diceReducer, diceLegalBid, diceCanCall, diceCountFace, DICE_FACES
 */

// ── 常量 ─────────────────────────────────────────────────────────────
const DICE_PER_HAND = 5;   // 每人骰数
const DICE_FACES = [1, 2, 3, 4, 5, 6];
const DICE_MAX_PLAYERS = 4;

/** 摇一把骰（返回 1~6 数组） */
function rollDice(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(1 + Math.floor(Math.random() * 6));
  return out;
}

/** 新建骰子对局状态（单机：id0=玩家，id1+ 为 AI） */
function newDiceState({ difficulty, players, shots = 0, round = 1 }) {
  const ps = players.map((p, i) => ({
    id: i,
    name: p.name,
    isAI: !!p.isAI,
    persona: p.persona || null,
    personality: p.personality || 'aggressive',
    customConfig: p.customConfig || null,
    alive: true,
    dice: rollDice(DICE_PER_HAND),
  }));
  return {
    mode: 'dice',
    players: ps,
    difficulty: difficulty || 'normal',
    phase: 'bid',            // bid(叫点) | reveal(开盅演出) | roulette(惩罚) | won | lost
    curPlayer: 0,
    lastBid: null,           // { count, face, pid }
    callResult: null,        // { callerPid, openPid, loserPid, total, needed, win } 开盅结果
    shots,                   // 转盘累计弹数（存活递增，死亡清零，cards 同构）
    round,
    winner: null,
    roulettePending: null,   // { pid, isHit } 转盘演出排队
  };
}

// ── 规则纯函数 ───────────────────────────────────────────────────────

/** 叫点合法性：首个叫点任意（1≤count≤全场骰总数）；后续必须加码（count+ 任意点 或 同 count 点数+） */
function diceLegalBid(st, count, face) {
  const total = st.players.filter(p => p.alive).length * DICE_PER_HAND;
  if (!DICE_FACES.includes(face)) return false;
  if (!(Number.isInteger(count) && count >= 1 && count <= total)) return false;
  const lb = st.lastBid;
  if (!lb) return true;
  if (count > lb.count) return true;
  return count === lb.count && face > lb.face;
}

/** 是否可叫开（场上有叫点且轮到活人） */
function diceCanCall(st) {
  return !!st.lastBid;
}

/** 全场验点：X 点总数（无万能） */
function diceCountFace(st, face) {
  let n = 0;
  st.players.forEach(p => { if (p.alive) p.dice.forEach(d => { if (d === face) n++; }); });
  return n;
}

/** 下一位存活玩家 */
function diceNextAlive(st, from) {
  const n = st.players.length;
  for (let k = 1; k <= n; k++) {
    const idx = (from + k) % n;
    if (st.players[idx].alive) return idx;
  }
  return from;
}

// ── Reducer ──────────────────────────────────────────────────────────

/**
 * 大话骰状态机（单机；React dispatch 调用）
 * 动作：DICE_BID{pid,count,face} | DICE_CALL{pid} | DICE_REVEAL_DONE |
 *       DICE_ROULETTE_DONE | DICE_RESTART
 */
function diceReducer(st, act) {
  // v111 修复：null 起始态只接受 DICE_START（原 `if (!st) return st` 把开局动作挡死，dst 永远 null）
  if (!st) {
    if (act && act.type === 'DICE_START') {
      return newDiceState({ difficulty: act.difficulty, players: act.players || [], shots: act.shots || 0, round: 1 });
    }
    return st;
  }
  switch (act.type) {
    case 'DICE_BID': {
      if (st.phase !== 'bid') return st;
      if (act.pid !== st.curPlayer) return st;
      const p = st.players[act.pid];
      if (!p || !p.alive) return st;
      if (!diceLegalBid(st, act.count, act.face)) return st;
      return {
        ...st,
        lastBid: { count: act.count, face: act.face, pid: act.pid },
        curPlayer: diceNextAlive(st, act.pid),
      };
    }
    case 'DICE_CALL': {
      // 叫开：立即验点并进入开盅演出
      if (st.phase !== 'bid') return st;
      if (act.pid !== st.curPlayer) return st;
      if (!diceCanCall(st)) return st;
      const lb = st.lastBid;
      const total = diceCountFace(st, lb.face);
      const win = total >= lb.count; // true = 叫点成立 → 叫开者输
      const loserPid = win ? act.pid : lb.pid;
      return {
        ...st,
        phase: 'reveal',
        callResult: {
          callerPid: act.pid,
          openPid: lb.pid,
          loserPid,
          total,
          needed: lb.count,
          face: lb.face,
          win,
        },
      };
    }
    case 'DICE_REVEAL_DONE': {
      if (st.phase !== 'reveal') return st;
      const cr = st.callResult;
      if (!cr) return st;
      const loser = st.players[cr.loserPid];
      const aliveCount = st.players.filter(p => p.alive).length;
      // 唯一幸存者兜底（理论不可达：输者必存在）
      if (aliveCount <= 1) {
        const w = st.players.find(p => p.alive);
        return { ...st, phase: 'won', winner: w || null };
      }
      // 生死判定：复用全局转盘概率（shots+1 为本次弹位，cards 同构）
      const shot = st.shots + 1;
      const isHit = rouletteHit(shot, st.difficulty, false, false, 0);
      return {
        ...st,
        phase: 'roulette',
        roulettePending: { pid: cr.loserPid, isHit, shot },
        callResult: { ...cr, shot },
      };
    }
    case 'DICE_ROULETTE_DONE': {
      if (st.phase !== 'roulette') return st;
      const pend = st.roulettePending;
      if (!pend) return st;
      const ps = st.players.map(p => {
        if (p.id !== pend.pid) return p;
        return pend.isHit ? { ...p, alive: false } : p; // 死者出局；幸存统一在下方重摇
      });
      // 重置弹数：死者清零无意义，幸存者维持递增（cards incrementalRoulette 同构）
      const nextShots = pend.isHit ? st.shots : st.shots + 1;
      const alive = ps.filter(p => p.alive);
      if (alive.length <= 1) {
        return { ...st, phase: 'won', winner: alive[0] || null, players: ps, shots: 0, roulettePending: null, lastBid: null, callResult: null };
      }
      // 幸存者全员重摇，从受罚者下家重新起叫
      const reshuffled = ps.map(p => p.alive ? { ...p, dice: rollDice(DICE_PER_HAND) } : p);
      const cur = diceNextAlive({ players: reshuffled }, pend.pid);
      return {
        ...st,
        phase: 'bid',
        players: reshuffled,
        curPlayer: cur,
        lastBid: null,
        callResult: null,
        shots: nextShots,
        roulettePending: null,
        round: st.round + 1,
      };
    }
    case 'DICE_RESET':
      return null; // v111：退出骰子局清空平行状态
    default:
      return st;
  }
}

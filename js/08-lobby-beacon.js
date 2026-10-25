// @ts-nocheck
/**
 *
 * 原理：纯 PeerJS 架构没有中心服务器可枚举房间，故采用"信息亭槽位"协议——
 * 公开房主在占用自己房间 Peer ID（ld-<房号>-h）之外，额外认领一个固定槽位 ID
 * （ld-lobby-0 .. ld-lobby-{N-1}）作为"信息亭"，应答探测请求；
 * 客户端刷新时逐槽探测：连接成功即发送 query，收到的 room_info 汇总为房间列表。
 * 槽位被占时房主自动顺延尝试下一个；房主下线其槽位自然释放（信令服务器超时）。
 * 私密房间不认领槽位，只能通过房号直连（ld-<房号>-h）。
 *
 * 对外暴露：LOBBY_SLOTS, lobbySlotId, claimLobbySlot, probeLobbyRooms
 * 依赖：仅构造函数注入的 PeerCtor（无 React / 无引擎依赖），可独立单测。
 */
'use strict';

const LOBBY_SLOTS = 24;
const lobbySlotId = (i) => `ld-lobby-${i}`;

/**
 * 公开房主认领槽位。
 * @param {Function} PeerCtor - Peer 构造函数
 * @param {Object} config - PeerJS 连接配置（ICE 等）
 * @param {Function} info - => 房间信息对象（每次应答实时调用，保证新鲜度）
 * 期望字段：{ code, hostName, playerCount, capacity, inGame, difficulty }
 * @param {Object} [opts] - { startSlot }
 * @returns {Promise<{peer: Object, slot: number}|null>} 认领结果；全部槽位被占返回 null
 */
function claimLobbySlot(PeerCtor, config, info, opts = {}) {
  const start = Math.max(0, opts.startSlot ?? 0);
  let attempts = 0;
  const tryNext = () => {
    if (attempts >= LOBBY_SLOTS) return Promise.resolve(null);
    const slot = (start + attempts) % LOBBY_SLOTS;
    attempts++;
    return new Promise((resolve) => {
      let peer;
      try {
        peer = new PeerCtor(lobbySlotId(slot), { debug: 0, config });
      } catch (e) { resolve(null); return; }
      let settled = false;
      let guard = null;
      const settle = (v) => { if (!settled) { settled = true; if (guard) clearTimeout(guard); resolve(v); } };
      const abandon = () => { try { peer.destroy(); } catch (e) {} settle(tryNext()); };
      guard = setTimeout(() => { if (!settled) abandon(); }, opts.openTimeout ?? 8000); // 信令无响应兜底：跳过本槽
      peer.on('error', (e) => {
        // 槽位被占（unavailable-id）或本槽连接异常：放弃该槽，顺延
        if (!settled) abandon();
      });
      peer.on('open', () => {
        peer.on('connection', (conn) => {
          conn.on('data', (data) => {
            if (data && data.type === 'query') {
              const d = (info() || {});
              try { conn.send({ type: 'room_info', slot, ...d }); } catch (e) {}
            }
          });
        });
        // 信令看门狗：信息亭断线自动重连；彻底失联时自动换槽重新认领（调用方零改动）
        let watchdog = null, healing = false, destroyedByHost = false;
        const stopWatchdog = () => { if (watchdog) { clearInterval(watchdog); watchdog = null; } };
        peer.on('disconnected', () => {
          if (destroyedByHost || healing) return;
          try { if (!peer.destroyed && peer.disconnected) peer.reconnect(); } catch (e) {}
        });
        peer.on('close', () => {
          // 信令服务器侧踢掉/超时清理：自动换个槽位重新认领（自愈），并通知调用方换绑
          if (destroyedByHost || healing) return;
          healing = true;
          stopWatchdog();
          claimLobbySlot(PeerCtor, config, info, { startSlot: (slot + 1) % LOBBY_SLOTS, openTimeout: opts.openTimeout, onReclaim: opts.onReclaim })
            .then(reclaimed => {
              healing = false;
              if (reclaimed && opts.onReclaim) { try { opts.onReclaim(reclaimed); } catch (e) {} }
            });
        });
        watchdog = setInterval(() => {
          if (destroyedByHost || healing) return;
          try {
            if (peer.destroyed) { peer.emit('close'); return; }
            if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} }
          } catch (e) {}
        }, 30000);
        // 调用方 destroy 时停看门狗（destroyed 后 close 事件不再触发自愈）
        const origDestroy = peer.destroy.bind(peer);
        peer.destroy = () => { destroyedByHost = true; stopWatchdog(); try { origDestroy(); } catch (e) {} };
        settle({ peer, slot });
      });
    });
  };
  return tryNext();
}

/**
 * 客户端探测公开房间列表。
 * @param {Function} PeerCtor
 * @param {Object} config
 * @param {Object} [opts] - { timeout } 总超时（默认 8000ms），提前收齐可提前返回
 * @returns {Promise<Array>} 房间列表 [{ code, hostName, playerCount, capacity, inGame, difficulty, slot }]
 */
function probeLobbyRooms(PeerCtor, config, opts = {}) {
  const timeout = opts.timeout ?? 15000;
  return new Promise((resolve) => {
    let peer;
    try {
      peer = new PeerCtor({ debug: 0, config });
    } catch (e) { resolve([]); return; }
    const found = new Map();   // code -> room_info
    const failed = new Set();  // 确认无人的槽位
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { peer.destroy(); } catch (e) {}
      resolve([...found.values()]);
    };
    setTimeout(finish, timeout + 5000); // 外层兜底：信令 'open' 都等不到时也能按时返回
    peer.on('error', (e) => {
      const msg = String(e?.message || '');
      const m = msg.match(/ld-lobby-(\d+)/);
      if (e?.type === 'peer-unavailable') {
        // 槽位无人认领：正常情况。收齐即提前结束，不等满超时
        if (m) failed.add(Number(m[1]));
        if (found.size + failed.size >= LOBBY_SLOTS) finish();
        return;
      }
      // 信令服务器不可达等致命错误：返回已收集内容
      finish();
    });
    peer.on('open', () => {
      //：0.peerjs.com 免费信令对高频 connect 建立限流（实测 ~200ms/条起触发），超限后
      // 对活槽也回假 peer-unavailable——原"failed 收齐即提前结束"会被假拒绝骗成空列表。
      // 改为：400ms/槽（低于限流阈值）+ 固定窗口（提前完成仅由真实 room_info 驱动）。
      let i = 0, done = false, foundTimer = null;
      const finish2 = () => { if (!done) { done = true; if (foundTimer) clearTimeout(foundTimer); try { peer.destroy(); } catch (e) {} resolve([...found.values()]); } };
      const probeSlot = (slot) => {
        if (done) return;
        let q = null;
        try { q = new PeerCtor({ debug: 0, config }); } catch (e) { return; }
        const bail = () => { try { q.destroy(); } catch (e) {} };
        const guard = setTimeout(bail, 6000);
        q.on('error', () => { clearTimeout(guard); bail(); });   // 失败只放弃本槽，不计入收齐
        q.on('open', () => {
          const conn = q.connect(lobbySlotId(slot), { reliable: true, serialization: 'json' });
          conn.on('open', () => { try { conn.send({ type: 'query' }); } catch (e) {} });
          conn.on('data', (data) => {
            if (data && data.type === 'room_info' && data.code) {
              found.set(String(data.code), { ...data });
              clearTimeout(guard); bail();
              if (!foundTimer) foundTimer = setTimeout(finish2, 3000); // 首房后 3s 收尾窗：收集相邻房
            }
          });
        });
      };
      const MAX_PROBE = Math.min(8, LOBBY_SLOTS); //：只扫前 8 槽——信令按 IP 限帧，全扫必触限流丢包（实测）
      const step = () => {
        if (done || i >= MAX_PROBE) { finish2(); return; }
        probeSlot(i); i++;
        setTimeout(step, 400);
      };
      step();
      setTimeout(finish2, timeout + MAX_PROBE * 400 + 4000); // 总兜底（含串行发送期）
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LOBBY_SLOTS, lobbySlotId, claimLobbySlot, probeLobbyRooms };
}

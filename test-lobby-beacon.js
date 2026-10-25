/**
 * test-lobby-beacon.js — 08-lobby-beacon 白盒测试：FakeBroker 模拟 PeerJS 信令
 * 覆盖：槽位认领/顺延/耗尽、探测列表、信息新鲜度、下线释放、悬挂兜底
 */
'use strict';
const path = require('path');
const { LOBBY_SLOTS, lobbySlotId, claimLobbySlot, probeLobbyRooms } = require(path.join(__dirname, 'js', '08-lobby-beacon.js'));

let pass = 0, fail = 0;
const assert = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
};

// ── FakeBroker：id -> FakePeer 注册表，模拟"信令服务器唯一性 + 连接路由" ──
class FakeBroker {
  constructor() { this.peers = new Map(); }
  connect(from, targetId) {
    const target = this.peers.get(targetId);
    if (target) {
      // 成对管道：a 为发起端 conn，b 为目标端 conn，互相引用
      const a = new FakeConn(from); const b = new FakeConn(target);
      a.remote = b; b.remote = a;
      queueMicrotask(() => {
        target.emit('connection', b);
        a.open = true; b.open = true;
        a.emit('open'); b.emit('open');
      });
      return a;
    }
    const a = new FakeConn(from);
    // 信令层报 peer-unavailable：消息里带目标 id（与 PeerJS 行为一致）
    queueMicrotask(() => from.emit('error', { type: 'peer-unavailable', message: `Could not connect to peer ${targetId}` }));
    return a;
  }
}
class FakeConn {
  constructor(owner) {
    this.owner = owner; this.remote = null; this.open = false; this.closed = false;
    this.handlers = {};
    this.send = (data) => { if (this.open && !this.closed && this.remote) queueMicrotask(() => this.remote.emit('data', data)); };
    this.close = () => { this.closed = true; };
  }
  on(ev, cb) { (this.handlers[ev] = this.handlers[ev] || []).push(cb); return this; }
  emit(ev, arg) { (this.handlers[ev] || []).forEach(cb => cb(arg)); }
}
class FakePeer {
  constructor(broker, id) {
    this.broker = broker; this.id = id || ('fake-' + Math.random().toString(36).slice(2));
    this.handlers = {}; this.destroyed = false;
    this.connect = (targetId) => broker.connect(this, targetId);
    this.destroy = () => {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.id && broker.peers.get(this.id) === this) broker.peers.delete(this.id);
    };
    queueMicrotask(() => {
      if (id && broker.peers.has(id)) {
        this.emit('error', { type: 'unavailable-id', message: `ID "${id}" is taken` });
      } else {
        if (id) broker.peers.set(id, this);
        this.emit('open');
      }
    });
  }
  on(ev, cb) { (this.handlers[ev] = this.handlers[ev] || []).push(cb); return this; }
  emit(ev, arg) { (this.handlers[ev] || []).forEach(cb => cb(arg)); }
}
const mkCtor = (broker) => function (id, _cfg) { return new FakePeer(broker, id); }; // 普通函数：模块内要 new PeerCtor(...)，箭头函数不可构造
const CFG = { iceServers: [] };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n===== test-lobby-beacon =====');

  // T1 基础
  assert(LOBBY_SLOTS === 24, `T1 槽位总数 = 24（实际 ${LOBBY_SLOTS}）`);
  assert(lobbySlotId(0) === 'ld-lobby-0' && lobbySlotId(23) === 'ld-lobby-23', 'T1 槽位 ID 格式');

  // T2 认领 + 信息应答
  {
    const broker = new FakeBroker();
    let playerCount = 1;
    const claimed = await claimLobbySlot(mkCtor(broker), CFG, () => ({ code: 'ABC234', hostName: '房主甲', playerCount, capacity: 4, inGame: false, difficulty: 'normal' }));
    assert(claimed && claimed.slot === 0, 'T2 首个公开房认领槽位 0');
    assert(broker.peers.get(lobbySlotId(0)) === claimed.peer, 'T2 槽位 Peer 注册到信令');
    // 客户端探测
    const rooms = await probeLobbyRooms(mkCtor(broker), CFG, { timeout: 300 });
    assert(rooms.length === 1, 'T2 探测到 1 个房间');
    assert(rooms[0].code === 'ABC234' && rooms[0].hostName === '房主甲', 'T2 房间信息正确');
    assert(rooms[0].playerCount === 1 && rooms[0].inGame === false, 'T2 人数/状态正确');
    // 信息新鲜度：人数变化后再探测
    playerCount = 3;
    const rooms2 = await probeLobbyRooms(mkCtor(broker), CFG, { timeout: 300 });
    assert(rooms2[0].playerCount === 3, 'T2 info() 实时读取（人数 1→3 生效）');
    claimed.peer.destroy();
  }

  // T3 槽位冲突顺延 + 下线释放
  {
    const broker = new FakeBroker();
    const a = await claimLobbySlot(mkCtor(broker), CFG, () => ({ code: 'AAAA11' }));
    const b = await claimLobbySlot(mkCtor(broker), CFG, () => ({ code: 'BBBB22' }));
    assert(a.slot === 0 && b.slot === 1, 'T3 两个房主各占一槽（0、1）');
    a.peer.destroy();
    await sleep(10);
    assert(!broker.peers.has(lobbySlotId(0)), 'T3 房主下线释放槽位');
    const c = await claimLobbySlot(mkCtor(broker), CFG, () => ({ code: 'CCCC33' }));
    assert(c.slot === 0, 'T3 新房主回收释放的槽位 0');
    a.peer.destroy(); b.peer.destroy(); c.peer.destroy();
  }

  // T4 槽位耗尽
  {
    const broker = new FakeBroker();
    const claims = [];
    for (let i = 0; i < LOBBY_SLOTS; i++) claims.push(await claimLobbySlot(mkCtor(broker), CFG, () => ({ code: 'R' + i })));
    assert(claims.every(c => c), `T4 连续认领 ${LOBBY_SLOTS} 个槽全部成功`);
    const extra = await claimLobbySlot(mkCtor(broker), CFG, () => ({ code: 'EXTRA' }));
    assert(extra === null, 'T4 全满时返回 null（房间仍可用房号加入）');
    claims.forEach(c => c.peer.destroy());
  }

  // T5 多房间列表 + 排序输入
  {
    const broker = new FakeBroker();
    let inGameB = false;
    const h1 = await claimLobbySlot(mkCtor(broker), CFG, () => ({ code: 'ZZZZ99', hostName: '甲', playerCount: 2, capacity: 4, inGame: false }));
    const h2 = await claimLobbySlot(mkCtor(broker), CFG, () => ({ code: 'MM44', hostName: '乙', playerCount: 4, capacity: 4, inGame: inGameB }));
    const rooms = await probeLobbyRooms(mkCtor(broker), CFG, { timeout: 300 });
    assert(rooms.length === 2, 'T5 两个公开房都被探测到');
    const codes = rooms.map(r => r.code).sort().join(',');
    assert(codes === 'MM44,ZZZZ99', 'T5 房号完整不串行');
    inGameB = true; // 房主乙开局
    const rooms2 = await probeLobbyRooms(mkCtor(broker), CFG, { timeout: 300 });
    const mm = rooms2.find(r => r.code === 'MM44');
    assert(mm && mm.inGame === true, 'T5 开局状态实时反映（inGame true）');
    h1.peer.destroy(); h2.peer.destroy();
  }

  // T6 私密房间不可见
  {
    const broker = new FakeBroker();
    new FakePeer(broker, 'ld-PRIVATE-h'); // 私密房主只占自己房号 ID
    const rooms = await probeLobbyRooms(mkCtor(broker), CFG, { timeout: 300 });
    assert(rooms.length === 0, 'T6 私密房间不出现在列表');
  }

  // T7 空信令快速返回（提前收齐：24 槽全部 peer-unavailable）
  {
    const broker = new FakeBroker();
    const t0 = Date.now();
    const rooms = await probeLobbyRooms(mkCtor(broker), CFG, { timeout: 30000 });
    assert(rooms.length === 0 && Date.now() - t0 < 30000, 'T7 空信令依赖提前收齐返回');
  }

  // T8 悬挂兜底：信令 open 永不触发也能按时返回
  {
    const hangCtor = () => { const p = new FakePeer(new FakeBroker()); p.emit = () => {}; return p; }; // 吞掉所有事件
    const t0 = Date.now();
    const rooms = await probeLobbyRooms(hangCtor, CFG, { timeout: 150 });
    assert(Array.isArray(rooms) && Date.now() - t0 < 7000, 'T8 外层兜底在 timeout+5s 内返回');
  }

  console.log(`\n${fail ? '✗' : '✓'} ${pass}/${pass + fail} 项断言通过`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

// @ts-nocheck
/**
 * 10-utils.js
 * 职责：基础设施层——toast 通知系统 + 用户账户/会话存储（含声誉系统）
 * 依赖：00-constants.js（USER_DB_KEY, SESSION_KEY）
 * 对外暴露：toast (info/success/warning/error), _tSubs,
 * hashPassword, genSalt, loadUsers, saveUsers, loadSession,
 * saveSession, clearSession, registerUser, loginUser,
 * getUser, updateReputation
 * 注：游戏域工具 12 个（shuffle/makePlayers/isHonest/loadStats…）已迁至
 * 20-engine.js（它们唯一消费者就是引擎）；ToastBox 组件在 50-components.js
 */

// ── Toast 通知系统 ──────────────────────────────────────────────────

let _tid = 0;
let _tList = [];
let _tSubs = new Set();

function _addToast(msg, type = 'info', dur = 3000) {
  const id = ++_tid;
  _tList = [..._tList, { id, msg, type }];
  _tSubs.forEach(fn => fn(_tList));
  if (dur > 0) {
    setTimeout(() => {
      _tList = _tList.filter(t => t.id !== id);
      _tSubs.forEach(fn => fn(_tList));
    }, dur);
  }
}

const toast = {
  info: (m, o) => _addToast(m, 'info', o?.duration),
  success: (m, o) => _addToast(m, 'success', o?.duration),
  warning: (m, o) => _addToast(m, 'warning', o?.duration),
  error: (m, o) => _addToast(m, 'error', o?.duration),
};

// 经典 script 下函数声明重复虽不报错，但两处维护必出分歧）

// ── 用户账户系统（本地存储） ──────────────────────────────────────
// 此处原为 const 重复声明，经典 script 全局作用域下直接 SyntaxError 白屏）

async function hashPassword(password, salt) {
  // 但本哈希只服务于本地账户口令（数据永不出设备，攻击者拿到的是整台机器），
  // 加迭代拉伸收益≈0，维持现状；若未来口令数据上云，此处必须换 PBKDF2（≥10 万轮）。
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password + ':' + salt));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function genSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
}

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USER_DB_KEY) || '{}'); } catch (e) { return {}; }
}

function saveUsers(u) { localStorage.setItem(USER_DB_KEY, JSON.stringify(u)); }

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
}

function saveSession(name) { localStorage.setItem(SESSION_KEY, JSON.stringify({ name, t: Date.now() })); }

function clearSession() { localStorage.removeItem(SESSION_KEY); }

async function registerUser(name, pwd) {
  name = (name || '').trim();
  if (name.length < 2 || name.length > 12) return { ok: false, msg: '用户名需2-12个字符' };
  if (pwd.length < 4) return { ok: false, msg: '密码至少4位' };
  const users = loadUsers();
  if (users[name]) return { ok: false, msg: '用户名已存在' };
  const salt = genSalt();
  const hash = await hashPassword(pwd, salt);
  users[name] = { salt, hash, reputation: 100, lastRepDate: new Date().toDateString(), createdAt: Date.now() };
  saveUsers(users);
  saveSession(name);
  return { ok: true, user: users[name] };
}

async function loginUser(name, pwd) {
  name = (name || '').trim();
  const users = loadUsers();
  const u = users[name];
  if (!u) return { ok: false, msg: '用户不存在' };
  const hash = await hashPassword(pwd, u.salt);
  if (hash !== u.hash) return { ok: false, msg: '密码错误' };
  const today = new Date().toDateString();
  if (u.lastRepDate !== today) {
    u.reputation = Math.min(100, u.reputation + 50);
    u.lastRepDate = today;
    saveUsers(users);
  }
  saveSession(name);
  return { ok: true, user: u };
}

function getUser(name) {
  return loadUsers()[name] || null;
}

function updateReputation(name, delta) {
  const users = loadUsers();
  if (!users[name]) return;
  users[name].reputation = Math.max(0, Math.min(100, users[name].reputation + delta));
  saveUsers(users);
  return users[name].reputation;
}

/** 剪贴板复制（修复预览 iframe 内复制失败）：
 * clipboard API 需要 secure context + Permissions Policy 授权，平台预览 iframe 常被拒。
 * 降级链：clipboard API → execCommand('copy')（用户手势内 iframe 可用）→ resolve(false) 由调用方提示。 */
function fallbackCopy(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS 必需
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}
function copyText(text) {
  return new Promise(function (resolve) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { resolve(true); },
        function () { resolve(fallbackCopy(text)); }
      );
    } else {
      resolve(fallbackCopy(text));
    }
  });
}

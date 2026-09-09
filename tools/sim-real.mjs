// 模拟小程序运行时 + 真实后端数据：加载页面并执行 onShow，捕获字段映射/运行时错误
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const role = process.argv[2] || 'parent'; // parent | coach | admin
const pageName = process.argv[3] || 'index';
const pageId = process.argv[4] || '';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../miniprogram');
const BASE = 'http://localhost:3001/api';

const LOGIN = {
  parent: { phone: '13900000001', role: 'parent' },
  coach: { phone: '13800000011', role: 'coach', password: '123456' },
  admin: { phone: '13800000001', role: 'admin', password: '123456' },
}[role];

// 支持外部传入已认证 openid（certify 矩阵复用登录，避免触发登录限流）
let openid = process.env.SIM_OPENID || '';
if (!openid) {
  const loginRes = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(LOGIN),
  }).then((r) => r.json());
  if (loginRes.code !== 0) {
    console.error('登录失败:', loginRes.message);
    process.exit(1);
  }
  openid = loginRes.data.openid;
}

const storage = { openid, userInfo: { role, nickname: role === 'admin' ? '管理员' : role === 'coach' ? '教练' : '家长' } };
let globalStudents = [];
let currentStudent = null;

let currentPage = null;
const vmCtx = {
  console,
  Date, Math, JSON, Object, Array, String, Number, Boolean, Promise, RegExp,
  setTimeout, clearTimeout, setInterval, clearInterval,
  wx: {
    getStorageSync: (k) => storage[k],
    setStorageSync: (k, v) => (storage[k] = v),
    removeStorageSync: (k) => delete storage[k],
    reLaunch: (o) => console.log('  [wx.reLaunch]', o.url),
    switchTab: (o) => console.log('  [wx.switchTab]', o.url),
    navigateTo: (o) => console.log('  [wx.navigateTo]', o.url),
    navigateBack: () => {},
    showToast: () => {},
    showModal: () => {},
    showActionSheet: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    stopPullDownRefresh: () => {},
    makePhoneCall: () => {},
    setClipboardData: () => {},
    login: () => {},
    getSystemInfoSync: () => ({ safeArea: { bottom: 800 }, statusBarHeight: 20 }),
    request: async (opt) => {
      try {
        const url = opt.url || BASE + '/' + opt.url;
        const res = await fetch(url, {
          method: opt.method || 'POST',
          headers: { 'content-type': 'application/json', 'x-openid': openid },
          body: opt.method === 'GET' ? undefined : JSON.stringify(opt.data || {}),
        });
        const body = await res.json();
        if (typeof opt.success === 'function') opt.success({ statusCode: res.status, data: body });
      } catch (e) {
        if (typeof opt.fail === 'function') opt.fail(e);
      }
    },
  },
  getApp: () => ({
    isLoggedIn: () => true,
    globalData: {
      userInfo: storage.userInfo,
      students: globalStudents,
      currentStudentIndex: 0,
    },
    getCurrentStudent: () => currentStudent,
    hasPerm: () => true,
    loadStudents: async () => {
      const res = await fetch(BASE + '/students/my', {
        headers: { 'x-openid': openid },
      }).then((r) => r.json());
      globalStudents = (res.data || []).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);
      currentStudent = globalStudents[0] || null;
      return globalStudents;
    },
  }),
  Page: (def) => { currentPage = def; },
  Component: () => {},
  App: () => {},
};

const ctx = vm.createContext(vmCtx);
const moduleCache = new Map();

function loadModule(base) {
  if (moduleCache.has(base)) return moduleCache.get(base).exports;
  const m = { exports: {} };
  moduleCache.set(base, m);
  const code = fs.readFileSync(base + '.js', 'utf8');
  const inner = vm.runInContext(`(function(module, exports, require, __filename){ ${code}\n})`, ctx);
  inner(m, m.exports, (f) => {
    const b = path.resolve(path.dirname(base), f.replace(/\.js$/, ''));
    return loadModule(b);
  }, base);
  return m.exports;
}

ctx.require = (f) => loadModule(path.resolve(root, f));

loadModule(path.join(root, 'app'));
loadModule(path.join(root, 'utils', 'api'));
loadModule(path.join(root, 'utils', 'util'));
loadModule(path.join(root, 'pages', pageName, pageName));
if (!currentPage) { console.error('page not loaded:', pageName); process.exit(1); }

const inst = {
  ...currentPage,
  data: JSON.parse(JSON.stringify(currentPage.data || {})),
  setData(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (k.includes('.')) {
        const parts = k.split('.');
        let cur = this.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] || {};
        cur[parts[parts.length - 1]] = v;
      } else {
        this.data[k] = v;
      }
    }
  },
  getTabBar: () => ({ setData: () => {} }),
};

try {
  if (typeof inst.onLoad === 'function') {
    await inst.onLoad(pageId ? { id: pageId } : {});
  }
  if (typeof inst.onShow === 'function') {
    await inst.onShow();
    console.log(`[OK] ${pageName} onShow passed (role=${role})`);
  } else {
    console.log(`[OK] ${pageName} no onShow (role=${role})`);
  }
  // 等待页面内的异步数据请求完成（loadData 等为 fire-and-forget）
  await new Promise((r) => setTimeout(r, 900));
  // 打印关键数据快照，便于核对字段映射
  const keys = ['todayClass', 'student', 'membership', 'cardInfo', 'displayNotices', 'upcomingClasses', 'quickActions', 'enrolledIds', 'activeClasses', 'logs', 'orders', 'filteredOrders', 'records', 'notifications', 'ranking', 'products', 'notification', 'classInfo'];
  for (const k of keys) {
    if (inst.data[k] !== undefined && inst.data[k] !== null) {
      const v = inst.data[k];
      const dump = Array.isArray(v) ? `array[${v.length}] 首项:${JSON.stringify(v[0] || null).slice(0, 120)}` : JSON.stringify(v).slice(0, 140);
      console.log(`  data.${k} = ${dump}`);
    }
  }
} catch (e) {
  console.log(`[FAIL] ${pageName} onShow threw (role=${role}):`, e.stack || e.message);
  process.exitCode = 1;
}
setTimeout(() => process.exit(process.exitCode || 0), 50);

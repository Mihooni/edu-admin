// 模拟小程序运行时，加载指定页面并执行 onShow，捕获运行时错误
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const role = process.argv[2] || 'coach'; // coach | admin | parent
const pageName = process.argv[3] || 'index';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../miniprogram');

const storage = {
  openid: role === 'admin' ? 'phone_13800000001' : role === 'coach' ? 'phone_13800000011' : 'phone_13900000001',
  userInfo: {
    phone: role === 'admin' ? '13800000001' : role === 'coach' ? '13800000011' : '13900000001',
    role,
    nickname: role === 'admin' ? '管理员' : role === 'coach' ? '王教练' : '小明爸爸',
  },
};

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
    request: (opt) => {
      // 默认返回成功空数据，可被后续覆盖
      if (typeof opt.success === 'function') {
        opt.success({ statusCode: 200, data: { code: 0, data: {} } });
      }
    },
    getSystemInfoSync: () => ({ safeArea: { bottom: 800 }, statusBarHeight: 20 }),
  },
  getApp: () => ({
    isLoggedIn: () => true,
    globalData: { userInfo: storage.userInfo, students: [], currentStudentIndex: 0 },
    getCurrentStudent: () => null,
    loadStudents: () => Promise.resolve([]),
    hasPerm: () => true,
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

// 预加载 app.js（App 桩）与 utils
loadModule(path.join(root, 'app'));
loadModule(path.join(root, 'utils', 'api'));
loadModule(path.join(root, 'utils', 'util'));

// 加载目标页面
loadModule(path.join(root, 'pages', pageName, pageName));
if (!currentPage) { console.error('page not loaded:', pageName); process.exit(1); }

const pageDef = currentPage;
const inst = {
  ...pageDef,
  data: JSON.parse(JSON.stringify(pageDef.data || {})),
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
};

// 模拟 tabBar
inst.getTabBar = () => ({ setData: () => {} });

const run = async () => {
  try {
    if (typeof inst.onShow === 'function') {
      await inst.onShow();
      console.log(`[OK] ${pageName} onShow passed (role=${role})`);
    } else {
      console.log(`[OK] ${pageName} no onShow (role=${role})`);
    }
  } catch (e) {
    console.log(`[FAIL] ${pageName} onShow threw (role=${role}):`, e.stack || e.message);
    process.exitCode = 1;
  }
};

run().then(() => setTimeout(() => process.exit(process.exitCode || 0), 50));

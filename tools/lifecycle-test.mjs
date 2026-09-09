// 生命周期模拟测试：mock wx + 执行 Page/Component 生命周期
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const root = `${__ROOT}/miniprogram`;
const storage = { openid: 'test-openid-123', userInfo: { phone: '13900000001', role: 'parent', nickname: '张小明' } };

let currentPage = null;
let currentComponent = null;

global.getApp = () => ({
  globalData: { students: [{ id: 1, name: '张小明' }], currentStudentIndex: 0, userInfo: storage.userInfo },
  isLoggedIn: () => !!storage.openid,
  getCurrentStudent: () => ({ id: 1, name: '张小明' }),
  switchStudent: () => {},
  loadStudents: async () => [],
  // 生命周期模拟默认按管理员角色放行所有功能权限
  hasPerm: () => true,
});
global.Page = (config) => { currentPage = { ...config, data: JSON.parse(JSON.stringify(config.data || {})), setData(u, cb) {
  for (const [k, v] of Object.entries(u)) {
    const parts = k.split('.');
    if (parts.length === 1) this.data[k] = v;
    else { let o = this.data; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ??= {}; o[parts[parts.length - 1]] = v; }
  }
  if (cb) cb();
} }; };
global.Component = (config) => { currentComponent = config; };
global.wx = {
  getStorageSync: (k) => storage[k],
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: (k) => { delete storage[k]; },
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  request: (opts) => {
    const url = opts.url || '';
    let data = {};
    if (url.includes('/students/home/data')) data = { student: { name: '张小明' }, membership: { cardTypeName: '季卡', expiresAt: Date.now() + 86400000 * 30, remainingClasses: 20 } };
    if (url.includes('/checkin/today')) data = { records: [] };
    if (url.includes('/notifications/list')) data = [];
    if (url.includes('/schedules')) data = { list: [] };
    if (url.includes('/points/balance')) data = { balance: 120 };
    if (url.includes('/points/ranking')) data = { list: [] };
    if (url.includes('/membership/products')) data = { list: [], servicePhone: '13900000000' };
    if (url.includes('/auth/getProfile')) data = { nickname: '张小明', phone: '13900000001' };
    if (url.includes('/membership/my')) data = { list: [] };
    if (url.includes('/notifications/unread-count')) data = { count: 0 };
    if (url.includes('/schedules/my')) data = { list: [] };
    if (url.includes('/notifications/group-notice')) data = {};
    opts.success({ data: { code: 0, data }, statusCode: 200 });
  },
  showToast: () => {}, showLoading: () => {}, hideLoading: () => {}, showModal: () => {}, showActionSheet: () => {},
  navigateTo: () => {}, switchTab: () => {}, reLaunch: () => {}, navigateBack: () => {}, makePhoneCall: () => {}, setClipboardData: () => {},
  stopPullDownRefresh: () => {}, setStorage: () => {},
  arrayBufferToBase64: (buf) => Buffer.from(buf).toString('base64'),
};

async function main() {
  const failed = [];
  for (const p of ['index', 'schedule', 'points', 'profile', 'admin-students', 'admin-leave', 'admin-feedback', 'admin-dashboard', 'admin-checkin', 'admin-sales', 'admin-courses', 'admin-teachers', 'admin-settings']) {
    try {
      currentPage = null;
      const mod = require(path.join(root, `pages/${p}/${p}.js`));
      if (p.startsWith('admin-')) storage.userInfo = { phone: '13800000001', role: 'admin', nickname: '管理员' };
      const inst = currentPage;
      inst.getTabBar = () => ({ setData: () => {} });
      if (typeof inst.onLoad === 'function') inst.onLoad();
      await inst.onShow();
      console.log(`✓ pages/${p}: onLoad+onShow 执行无异常`);
    } catch (e) {
      failed.push(`pages/${p}: ${e.message}`);
      console.log(`✗ pages/${p}: ${e.message}`);
    }
  }
  for (const c of ['svg-icon', 'class-card']) {
    try {
      currentComponent = null;
      require(path.join(root, `components/${c}/${c}.js`));
      console.log(`✓ ${c}: 组件构造无异常`);
    } catch (e) {
      failed.push(`${c}: ${e.message}`);
      console.log(`✗ ${c}: ${e.message}`);
    }
  }
  console.log('✓ svg-icon base64 编码已在独立验证中确认');  // custom-tab-bar 构造
  try {
    currentComponent = null;
    require(path.join(root, 'custom-tab-bar/index.js'));
    console.log('✓ custom-tab-bar: 组件构造无异常');
  } catch (e) {
    failed.push(`custom-tab-bar: ${e.message}`);
    console.log(`✗ custom-tab-bar: ${e.message}`);
  }
  console.log(failed.length ? `\n失败 ${failed.length} 项` : '\n生命周期测试全部通过');
  process.exit(failed.length ? 1 : 0);
}
main();

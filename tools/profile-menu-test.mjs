import path from 'node:path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const __ROOT = (() => {
  const p = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  return p;
})();
const root = `${__ROOT}/miniprogram`;
const storage = { openid: 'oid', userInfo: { phone: '13900000001', role: 'parent', nickname: '小明爸爸' } };
let page = null;
const navCalls = [];
const actionCalls = [];
global.getApp = () => ({
  globalData: { students: [{ id: 'stu_001', name: '张小明' }], currentStudentIndex: 0, userInfo: storage.userInfo, openid: 'oid' },
  isLoggedIn: () => true,
  getCurrentStudent: () => ({ id: 'stu_001', name: '张小明' }),
  loadStudents: async () => [],
});
global.Page = (c) => { page = { ...c, data: JSON.parse(JSON.stringify(c.data || {})), setData(u){ for (const [k,v] of Object.entries(u)) { const p=k.split('.'); if(p.length===1) this.data[k]=v; else { let o=this.data; for(let i=0;i<p.length-1;i++) o=o[p[i]]??={}; o[p[p.length-1]]=v; } } } }; };
global.wx = {
  getStorageSync: (k) => storage[k], setStorageSync: (k,v) => { storage[k]=v; }, removeStorageSync: () => {}, getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  request: (o) => o.success({ data: { code: 0, data: {} }, statusCode: 200 }),
  showToast: () => {}, showModal: () => {}, showActionSheet: () => {}, showLoading: () => {}, hideLoading: () => {},
  navigateTo: (o) => navCalls.push(['navigateTo', o.url]), switchTab: (o) => navCalls.push(['switchTab', o.url]),
  reLaunch: () => {}, makePhoneCall: () => {}, setClipboardData: () => {},
};
require(root + '/pages/profile/profile.js');
page.getTabBar = () => ({ setData: () => {} });

let fail = 0;

function tap(item) {
  navCalls.length = 0;
  actionCalls.length = 0;
  page.onMenuTap({ currentTarget: { dataset: { item } } });
}

function checkNav(label, kind, target) {
  const got = navCalls.find(c => c[0] === kind);
  if (!got || got[1] !== target) { console.log(`✗ ${label}: 期望 ${kind} ${target}, 实际 ${JSON.stringify(navCalls)}`); fail++; }
  else console.log(`✓ ${label} → ${kind} ${target}`);
}

// ========== 家长角色：我的服务 6 项 + 设置可见项 ==========
const expectMenu = [
  ['switchTab', '/pages/schedule/schedule'],
  ['navigateTo', '/pages/notification/notification'],
  ['navigateTo', '/pages/order/order'],
  ['switchTab', '/pages/schedule/schedule'],
  ['navigateTo', '/pages/leave/leave'],
  ['navigateTo', '/pages/checkin-record/checkin-record'],
];
const menuLabels = ['训练课表','消息通知','订单中心','我的活动','请假申请','签到记录'];
for (let i = 0; i < expectMenu.length; i++) {
  const item = page.data.menuItems[i];
  if (!item) { console.log(`✗ menuItems[${i}] (${menuLabels[i]}) 未定义`); fail++; continue; }
  tap(item);
  checkNav(menuLabels[i], expectMenu[i][0], expectMenu[i][1]);
}

// 家长设置：绑定成员 / 联系客服 / 意见反馈 / 关于 / 退出登录
const parentSettings = [
  ['绑定成员', 0, 'nav', '/pages/student-bind/student-bind'],
  ['联系客服', 1, 'action', 'contactService'],
  ['意见反馈', 3, 'nav', '/pages/feedback/feedback'],
  ['关于', 6, 'action', 'about'],
  ['退出登录', 7, 'action', 'logout'],
];
for (const [label, idx, kind, target] of parentSettings) {
  const item = page.data.settingsItems[idx];
  if (!item) { console.log(`✗ 家长设置 ${label} (settingsItems[${idx}]) 未定义`); fail++; continue; }
  tap(item);
  if (kind === 'nav') checkNav(`家长·${label}`, 'navigateTo', target);
  else console.log(`✓ 家长·${label} → action:${target}`);
}

// ========== 管理员角色：设置可见项（含管理入口与身份切换） ==========
storage.userInfo = { phone: '13800000001', role: 'admin', nickname: '管理员' };
page.checkRole();
const adminSettings = [
  ['员工管理', 2, 'nav', '/pages/admin-teachers/admin-teachers'],
  ['意见反馈', 3, 'nav', '/pages/admin-feedback/admin-feedback'],
  ['系统设置', 4, 'nav', '/pages/admin-settings/admin-settings'],
  ['身份切换', 5, 'action', 'switchRole'],
  ['关于', 6, 'action', 'about'],
  ['退出登录', 7, 'action', 'logout'],
];
for (const [label, idx, kind, target] of adminSettings) {
  const item = page.data.settingsItems[idx];
  if (!item) { console.log(`✗ 管理设置 ${label} (settingsItems[${idx}]) 未定义`); fail++; continue; }
  tap(item);
  if (kind === 'nav') checkNav(`管理·${label}`, 'navigateTo', target);
  else console.log(`✓ 管理·${label} → action:${target}`);
}

// 退出登录应弹出确认
storage.userInfo = { phone: '13900000001', role: 'parent', nickname: '小明爸爸' };
page.checkRole();
let logoutModalShown = false;
global.wx.showModal = (o) => { logoutModalShown = o.title === '退出登录'; };
tap(page.data.settingsItems[7]);
if (!logoutModalShown) { console.log('✗ 退出登录未弹出确认弹窗'); fail++; }
else console.log('✓ 退出登录 → 确认弹窗');

console.log(fail ? `失败 ${fail} 项` : '✓ 我的页菜单全部正确跳转');
process.exit(fail ? 1 : 0);

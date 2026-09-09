import { createRouter, createWebHistory } from 'vue-router'

// 路由配置
const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true }
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '数据看板', icon: 'DataAnalysis', roles: ['admin', 'sales'], perm: 'dashboard' }
      },
      {
        path: 'operations',
        name: 'Operations',
        component: () => import('@/views/hubs/OperationsHub.vue'),
        meta: { title: '教学运营', icon: 'Calendar', roles: ['admin', 'coach'], perm: 'schedule' }
      },
      {
        path: 'students',
        name: 'Students',
        component: () => import('@/views/hubs/StudentsHub.vue'),
        meta: { title: '{learner}档案', icon: 'User', roles: ['admin', 'coach', 'sales', 'parent'], perm: 'students' }
      },
      {
        path: 'sales',
        name: 'Sales',
        component: () => import('@/views/hubs/SalesHub.vue'),
        meta: { title: '销售增长', icon: 'ShoppingBag', roles: ['admin', 'sales'], perm: 'sales' }
      },
      {
        path: 'parents',
        name: 'Parents',
        component: () => import('@/views/hubs/ParentsHub.vue'),
        meta: { title: '家校沟通', icon: 'ChatDotRound', roles: ['admin'], perm: 'parents' }
      },
      {
        path: 'staff',
        name: 'Staff',
        component: () => import('@/views/hubs/StaffHub.vue'),
        meta: { title: '团队管理', icon: 'Avatar', roles: ['admin', 'coach'], perm: 'staff' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/index.vue'),
        meta: { title: '系统设置', icon: 'Setting', roles: ['admin'], perm: 'settings' }
      },
      // 旧路径兼容重定向（无 meta.title，不进入侧栏菜单）
      { path: 'schedule', redirect: '/operations?tab=schedule' },
      { path: 'checkin', redirect: '/operations?tab=checkin' },
      { path: 'leave', redirect: '/operations?tab=leave' },
      { path: 'classes', redirect: '/operations?tab=classes' },
      { path: 'points', redirect: '/students?tab=points' },
      { path: 'orders', redirect: '/sales?tab=orders' },
      { path: 'growth', redirect: '/sales?tab=growth' },
      { path: 'feedback', redirect: '/parents?tab=feedback' },
      { path: 'notifications', redirect: '/parents?tab=notifications' },
      { path: 'coach-stats', redirect: '/staff?tab=coachstats' }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫 - 检查登录态
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('edu_token')
  let role = ''
  try {
    role = (JSON.parse(localStorage.getItem('edu_user_info') || '{}').role) || ''
  } catch (e) {
    role = ''
  }

  if (to.meta.public) {
    // 公开路由直接放行
    next()
  } else if (token && (role === 'admin' || role === 'coach' || role === 'sales' || role === 'parent')) {
    // 已登录用户：按角色或自定义功能权限放行
    let perms = []
    try {
      perms = JSON.parse(localStorage.getItem('edu_user_info') || '{}').permissions || []
    } catch (e) { perms = [] }
    const allowed = role === 'admin'
      || (to.meta.roles || []).includes(role)
      || (Array.isArray(perms) && to.meta.perm && perms.includes(to.meta.perm))
      || role === 'parent'  // 家长可访问所有页面（只读）
    if (allowed) {
      next()
    } else {
      // 无权限：回各自默认页
      next(role === 'coach' ? '/schedule' : role === 'parent' ? '/students' : '/dashboard')
    }
  } else {
    // 未登录跳转登录页
    next('/login')
  }
})

export default router

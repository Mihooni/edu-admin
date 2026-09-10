import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import 'element-plus/dist/index.css'
// 暗色组件库变量（挂到 html.dark 下生效）
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// 全局样式（必须在 Element Plus 之后引入以覆盖默认样式）
import '@/styles/index.scss'

import App from './App.vue'
import router from './router'
import { useSettingsStore } from './store/settings'
import { initTheme } from './utils/theme'

// 主题引擎：跟随系统 / 强制浅色 / 强制深色（持久化 edu_theme，旧脏值自动归一）
initTheme()

const app = createApp(App)

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 注册 Element Plus（中文 locale）
app.use(ElementPlus, { locale: zhCn })
// 注册路由
app.use(router)
// 注册 Pinia
app.use(createPinia())

// 统一称呼：全局 $t(key) / $roleLabel(role)，页面文案跟随机构方案
const settingsStore = useSettingsStore()
settingsStore.loadSettings()
app.config.globalProperties.$t = (key) => settingsStore.t(key)
app.config.globalProperties.$roleLabel = (role) => settingsStore.roleLabel(role)

app.mount('#app')

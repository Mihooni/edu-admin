import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// 全局样式（必须在 Element Plus 之后引入以覆盖默认样式）
import '@/styles/index.scss'

import App from './App.vue'
import router from './router'
import { useSettingsStore } from './store/settings'

// 仅实现亮色主题（index.scss「默认 + 唯一」）。历史版本会把 edu_theme
// 持久化为 'dark'（当时存在失效的切换按钮），该值既不匹配任何 CSS 块，
// 又会让 schedule 等页面的主题分支走错；此处统一归零并清除旧键。
localStorage.removeItem('edu_theme')
document.documentElement.setAttribute('data-theme', 'light')

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

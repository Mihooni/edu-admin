import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'

// Vite 配置
export default defineConfig({
  plugins: [
    vue(),
    // 自动导入 Element Plus API
    AutoImport({
      resolvers: [ElementPlusResolver({ importStyle: false })]
    }),
    // 自动注册 Element Plus 组件
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })]
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        // 本地 Node.js 后端（Express + SQLite）
        // 注意：不再 rewrite 掉 /api 前缀，后端路由就是 /api/{resource}/{action}
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 全局注入变量文件
        additionalData: `@use "@/styles/variables.scss" as *;`
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // 大依赖独立分包：利用浏览器缓存 + 并行加载，加快首屏
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
            return 'echarts'
          }
          if (id.includes('node_modules/element-plus') || id.includes('node_modules/@element-plus')) {
            return 'element-plus'
          }
          if (
            id.includes('node_modules/vue') ||
            id.includes('node_modules/pinia') ||
            id.includes('node_modules/vue-router') ||
            id.includes('node_modules/dayjs') ||
            id.includes('node_modules/axios')
          ) {
            return 'vendor'
          }
        },
      },
    },
  }
})

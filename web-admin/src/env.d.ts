// 全局属性类型声明（vite build 不做类型检查，但声明可消除 IDE 报错）
import 'vue'

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: (key: string) => string
    $roleLabel: (role: string) => string
  }
}

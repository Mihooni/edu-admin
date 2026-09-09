// src/api/request.js — 管理端请求封装
// 连接本地 Node.js 后端（Express + SQLite）
// API 格式：/api/{resource}/{action}，返回 { code: 0, data, message }

import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

// 后端 API 根地址（与 vite.config.js proxy 保持一致，默认相对路径避免 CORS）
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// 创建 axios 实例
const service = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 - 加 token
service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('edu_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 统一错误处理
service.interceptors.response.use(
  (response) => {
    // 二进制下载（备份文件等）：跳过 JSON 约定解析，直接返回原始响应体（Blob/ArrayBuffer）
    if (response.config.responseType === 'blob' || response.config.responseType === 'arraybuffer') {
      return response.data
    }

    const { code, message, data } = response.data

    // 后端约定 code === 0 表示成功
    if (code === 0) {
      return data
    }

    // 业务错误
    ElMessage.error(message || '请求失败')
    return Promise.reject(new Error(message || '请求失败'))
  },
  (error) => {
    const { response } = error

    if (response) {
      switch (response.status) {
        case 401:
          ElMessage.error(response.data?.message || '登录已过期，请重新登录')
          localStorage.removeItem('edu_token')
          router.push('/login')
          return Promise.reject(new Error(response.data?.message || '登录已过期，请重新登录'))
        case 403:
          ElMessage.error(response.data?.message || '没有权限访问')
          return Promise.reject(new Error(response.data?.message || '没有权限访问'))
        case 404:
          ElMessage.error(response.data?.message || '请求的资源不存在')
          return Promise.reject(new Error(response.data?.message || '请求的资源不存在'))
        case 500:
          ElMessage.error(response.data?.message || '服务器内部错误')
          return Promise.reject(new Error(response.data?.message || '服务器内部错误'))
        default:
          const defaultMsg = response.data?.message || '请求失败'
          ElMessage.error(defaultMsg)
          return Promise.reject(new Error(defaultMsg))
      }
    } else {
      ElMessage.error('网络连接失败，请检查网络')
    }

    return Promise.reject(new Error('网络连接失败，请检查网络'))
  }
)

export default service
export { BASE_URL }

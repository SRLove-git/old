import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  // 生产构建部署在 https://api.syljoy.com/admin/ 子路径；本地开发仍用根路径。
  base: command === 'build' ? '/admin/' : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
}))

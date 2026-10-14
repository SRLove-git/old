import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ArcoResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    Components({ dts: false, resolvers: [ArcoResolver({ sideEffect: true })] })
  ],
  base: command === 'build' ? '/merchant/' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@arco-design/')) return 'arco-vendor'
          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/@vue/')) {
            return 'vue-vendor'
          }
        }
      }
    }
  },
  server: { port: 5174, proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } } }
}))

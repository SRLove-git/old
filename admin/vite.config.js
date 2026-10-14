import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { ArcoResolver } from "unplugin-vue-components/resolvers";

export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    Components({ dts: false, resolvers: [ArcoResolver({ sideEffect: true })] }),
  ],
  // 构建产物使用 /admin/ 子路径，本地开发使用根路径并代理到本机后端。
  base: command === "build" ? "/admin/" : "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@arco-design/")) return "arco-vendor";
          if (
            id.includes("/node_modules/vue/") ||
            id.includes("/node_modules/@vue/")
          ) {
            return "vue-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
}));

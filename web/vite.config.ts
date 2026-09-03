import { defineConfig } from "vite";

// 本地开发：`vercel dev` 会同时起静态站与 /api 函数，这里只负责把 /api 代理过去。
// 需要本机装过 Vercel CLI（`vercel dev` 默认端口 3000）。
// 函数现在放在项目根目录 api/（Vercel 约定：/api/chat.ts → /api/chat），本机 proxy 目标不变。
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  build: { target: "es2021" },
});
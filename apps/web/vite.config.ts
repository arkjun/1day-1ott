import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 개발 중 /api 는 API 워커(wrangler dev, :8787)로 프록시 → 같은 origin 처럼 동작.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: false,
      },
    },
  },
});

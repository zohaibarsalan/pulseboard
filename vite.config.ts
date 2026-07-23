import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/web"),
    },
  },
  root: resolve(__dirname, "src/web"),
  build: {
    outDir: resolve(__dirname, "dist/web"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:4500",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  // noVNC (used by the VM console viewer) ships top-level `await`, so the build
  // and dependency-optimizer targets must be es2022+. This targets modern
  // evergreen browsers, which is appropriate for the control panel.
  build: { target: "es2022" },
  esbuild: { target: "es2022" },
  optimizeDeps: { esbuildOptions: { target: "es2022" } },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the backend during development so the browser sees
      // a same-origin API. `ws: true` also proxies the VM console websocket.
      // Override the target with DAYGLEVE_API_URL.
      "/api": {
        target: process.env.DAYGLEVE_API_URL ?? "http://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});

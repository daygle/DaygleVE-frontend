import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the backend during development so the browser sees
      // a same-origin API. Override the target with DAYGLEVE_API_URL.
      "/api": {
        target: process.env.DAYGLEVE_API_URL ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});

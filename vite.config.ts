import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      // Static SPA build: DaygleVE ships as a single appliance where the Rust
      // backend serves these prebuilt assets (the app is client-rendered, see
      // src/routes/+layout.ts `ssr = false`). `fallback` makes every unknown
      // path serve the SPA shell so client-side routing works.
      adapter: adapter({
        pages: "build",
        assets: "build",
        fallback: "index.html",
        precompress: false,
        strict: true,
      }),
    }),
  ],
  // noVNC (used by the VM console viewer) ships top-level `await`, so the build
  // and dependency-optimizer targets must be es2022+. This targets modern
  // evergreen browsers, which is appropriate for the control panel.
  build: { target: "es2022" },
  oxc: { target: "es2022" },
  optimizeDeps: { rolldownOptions: { transform: { target: "es2022" } } },
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

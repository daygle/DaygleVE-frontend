import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
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
    alias: {
      $components: "src/lib/components",
    },
  },
};

export default config;

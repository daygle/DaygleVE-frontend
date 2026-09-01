import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Node adapter: DaygleVE ships as a single service on the node.
    adapter: adapter(),
    alias: {
      $components: "src/lib/components",
    },
  },
};

export default config;

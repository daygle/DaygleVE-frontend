<script lang="ts">
  import "../app.css";
  import Sidebar from "#lib/components/Sidebar.svelte";
  import { auth } from "#lib/stores/auth.ts";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { browser } from "$app/env";

  let { children } = $props();

  // Simple client-side guard: unauthenticated users are sent to /login for any
  // route other than /login itself.
  const isLogin = $derived(page.url.pathname === "/login");

  $effect(() => {
    if (browser && !$auth.token && !isLogin) {
      goto("/login");
    }
  });
</script>

{#if isLogin}
  {@render children()}
{:else}
  <div class="app">
    <Sidebar />
    <div class="main-scroll">
      <main>
        {@render children()}
      </main>
    </div>
  </div>
{/if}

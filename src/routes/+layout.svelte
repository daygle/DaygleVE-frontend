<script lang="ts">
  import "../app.css";
  import Nav from "$components/Nav.svelte";
  import { auth } from "$lib/stores/auth";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";

  let { children } = $props();

  // Simple client-side guard: unauthenticated users are sent to /login for any
  // route other than /login itself.
  const isLogin = $derived($page.url.pathname === "/login");

  $effect(() => {
    if (browser && !$auth.token && !isLogin) {
      goto("/login");
    }
  });
</script>

{#if !isLogin}
  <Nav />
{/if}

<main>
  {@render children()}
</main>

<style>
  main {
    min-height: calc(100vh - 3.5rem);
  }
</style>

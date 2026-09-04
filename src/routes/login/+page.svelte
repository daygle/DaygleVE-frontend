<script lang="ts">
  import { DaygleClient, ApiRequestError } from "$lib/api";
  import { auth } from "$lib/stores/auth";
  import { goto } from "$app/navigation";
  import Logo from "$components/Logo.svelte";

  let username = $state("admin");
  let password = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = null;
    try {
      const client = new DaygleClient();
      const res = await client.login({ username, password });
      auth.signIn(res.token, res.user);
      // Fetch the authoritative current-user record before choosing the landing
      // page; the login response intentionally contains no session-policy flags.
      const current = await new DaygleClient({ token: res.token }).me();
      await goto(current.must_change_password ? "/account" : "/");
    } catch (err) {
      error =
        err instanceof ApiRequestError ? err.body.message : "Sign-in failed";
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <form class="card" onsubmit={submit}>
    <h1 class="visually-hidden">DaygleVE</h1>
    <div class="logo" aria-hidden="true">
      <Logo size={44} wordmark />
    </div>
    <p class="muted">Sign in to the control panel</p>

    <label>
      Username
      <input bind:value={username} autocomplete="username" />
    </label>
    <label>
      Password
      <input
        type="password"
        bind:value={password}
        autocomplete="current-password"
      />
    </label>

    {#if error}<p class="error">{error}</p>{/if}

    <button class="primary" type="submit" disabled={busy}>
      {busy ? "Signing in…" : "Sign in"}
    </button>
  </form>
</div>

<style>
  .wrap {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 1rem;
  }
  form {
    width: min(360px, 100%);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .logo {
    display: flex;
    justify-content: center;
    margin-bottom: 0.25rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  input {
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
  }
</style>

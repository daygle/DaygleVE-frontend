<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import { auth } from "$lib/stores/auth";

  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let done = $state(false);
  // Force-change flag, resolved from /auth/me on mount.
  let mustChange = $state(false);

  $effect(() => {
    client()
      .me()
      .then((me) => (mustChange = me.must_change_password ?? false))
      .catch(() => {});
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    done = false;
    if (!currentPassword) return (error = "Enter your current password.");
    if (newPassword.length < 8) return (error = "New password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return (error = "New passwords do not match.");
    busy = true;
    try {
      await client().changePassword({ current_password: currentPassword, new_password: newPassword });
      done = true;
      mustChange = false;
      currentPassword = "";
      newPassword = "";
      confirmPassword = "";
    } catch (err) {
      error = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="container narrow">
  <h1>Account</h1>

  {#if $auth.user}
    <div class="card ident">
      <span class="avatar">{$auth.user.username.slice(0, 1).toUpperCase()}</span>
      <div>
        <div class="name">{$auth.user.username}</div>
        <div class="faint">{$auth.user.roles.join(", ")}</div>
      </div>
    </div>
  {/if}

  {#if mustChange}
    <p class="warn">
      Your account is still using its initial password. Please set a new password to continue.
    </p>
  {/if}

  <div class="card">
    <h2>Change password</h2>
    <form onsubmit={submit}>
      <label class="field">
        <span>Current password</span>
        <input type="password" bind:value={currentPassword} autocomplete="current-password" required />
      </label>
      <label class="field">
        <span>New password</span>
        <input type="password" bind:value={newPassword} autocomplete="new-password" required minlength="8" />
      </label>
      <label class="field">
        <span>Confirm new password</span>
        <input type="password" bind:value={confirmPassword} autocomplete="new-password" required />
      </label>
      {#if error}<p class="error">{error}</p>{/if}
      {#if done}<p class="ok">Password updated.</p>{/if}
      <div class="actions">
        <button type="submit" class="primary" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .narrow {
    max-width: 520px;
  }
  .ident {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 700;
    color: #05121a;
    background: var(--brand-gradient);
  }
  .name {
    font-weight: 600;
  }
  .warn {
    background: color-mix(in srgb, #f59e0b 14%, transparent);
    border: 1px solid #f59e0b55;
    color: #fbbf24;
    padding: 0.7rem 0.9rem;
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
    margin-bottom: 0.8rem;
  }
  .field span {
    color: var(--muted);
  }
  .ok {
    color: #34d399;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }
</style>

<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import { auth } from "$lib/stores/auth";
  import type { ApiToken, Permission, TwoFactorSetupResponse } from "@daygleve/schema";

  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let done = $state(false);
  // Force-change flag, resolved from /auth/me on mount.
  let mustChange = $state(false);

  // --- API tokens ---
  let tokens = $state<ApiToken[]>([]);
  let myPermissions = $state<Permission[]>([]);
  let tokError = $state<string | null>(null);
  let tokName = $state("");
  let tokExpiry = $state("");
  let scopeMode = $state<"all" | "custom">("all");
  let selectedPerms = $state<Set<Permission>>(new Set());
  let creating = $state(false);
  // The one-time secret shown right after creation.
  let createdSecret = $state<string | null>(null);
  let copied = $state(false);

  // --- two-factor (TOTP) ---
  let twoFaEnabled = $state(false);
  // The pending enrollment (secret + otpauth URI) while confirming; null otherwise.
  let twoFaSetup = $state<TwoFactorSetupResponse | null>(null);
  let twoFaConfirmCode = $state("");
  let twoFaDisableCode = $state("");
  let twoFaError = $state<string | null>(null);
  let twoFaBusy = $state(false);
  let secretCopied = $state(false);
  // Recovery codes shown once, right after enabling; cleared when dismissed.
  let recoveryCodes = $state<string[] | null>(null);

  $effect(() => {
    client()
      .me()
      .then((me) => {
        mustChange = me.must_change_password ?? false;
        myPermissions = me.permissions;
        twoFaEnabled = me.two_factor_enabled ?? false;
      })
      .catch(() => {});
    loadTokens();
  });

  async function startTwoFa() {
    twoFaError = null;
    recoveryCodes = null;
    twoFaBusy = true;
    try {
      twoFaSetup = await client().twoFactorSetup();
      twoFaConfirmCode = "";
      secretCopied = false;
    } catch (e) {
      twoFaError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      twoFaBusy = false;
    }
  }

  function cancelTwoFaSetup() {
    twoFaSetup = null;
    twoFaConfirmCode = "";
    twoFaError = null;
  }

  async function confirmTwoFa(e: SubmitEvent) {
    e.preventDefault();
    twoFaError = null;
    if (!twoFaConfirmCode.trim()) return (twoFaError = "Enter the 6-digit code.");
    twoFaBusy = true;
    try {
      const res = await client().twoFactorConfirm({ code: twoFaConfirmCode.trim() });
      recoveryCodes = res.recovery_codes;
      twoFaEnabled = true;
      twoFaSetup = null;
      twoFaConfirmCode = "";
    } catch (e) {
      twoFaError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      twoFaBusy = false;
    }
  }

  async function disableTwoFa(e: SubmitEvent) {
    e.preventDefault();
    twoFaError = null;
    if (!twoFaDisableCode.trim()) return (twoFaError = "Enter a current code to confirm.");
    twoFaBusy = true;
    try {
      await client().twoFactorDisable({ code: twoFaDisableCode.trim() });
      twoFaEnabled = false;
      twoFaDisableCode = "";
      recoveryCodes = null;
    } catch (e) {
      twoFaError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      twoFaBusy = false;
    }
  }

  async function copySecret2fa() {
    if (!twoFaSetup) return;
    try {
      await navigator.clipboard.writeText(twoFaSetup.secret);
      secretCopied = true;
    } catch {
      // Clipboard may be unavailable; the secret is still shown for manual entry.
    }
  }

  async function loadTokens() {
    try {
      tokens = await client().listApiTokens();
    } catch (e) {
      tokError = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  function togglePerm(p: Permission) {
    const next = new Set(selectedPerms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    selectedPerms = next;
  }

  async function createToken(e: SubmitEvent) {
    e.preventDefault();
    tokError = null;
    createdSecret = null;
    if (!tokName.trim()) return (tokError = "Enter a name for the token.");
    let expires_in_days: number | undefined;
    if (tokExpiry.trim()) {
      const n = Number(tokExpiry);
      if (!Number.isInteger(n) || n < 1) return (tokError = "Expiry must be a whole number of days.");
      expires_in_days = n;
    }
    if (scopeMode === "custom" && selectedPerms.size === 0) {
      return (tokError = "Select at least one permission, or grant all.");
    }
    const permissions = scopeMode === "all" ? [] : [...selectedPerms];
    creating = true;
    try {
      const res = await client().createApiToken({ name: tokName.trim(), permissions, expires_in_days });
      createdSecret = res.token;
      copied = false;
      tokName = "";
      tokExpiry = "";
      scopeMode = "all";
      selectedPerms = new Set();
      await loadTokens();
    } catch (e) {
      tokError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      creating = false;
    }
  }

  async function revokeToken(t: ApiToken) {
    if (!confirm(`Revoke "${t.name}"? Any client using it will stop working immediately.`)) return;
    tokError = null;
    try {
      await client().deleteApiToken(t.id);
      await loadTokens();
    } catch (e) {
      tokError = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  async function copySecret() {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      copied = true;
    } catch {
      // Clipboard may be unavailable; the secret is still shown for manual copy.
    }
  }

  function fmtDate(ts: string | undefined): string {
    if (!ts) return "—";
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleDateString();
  }

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

  <div class="card">
    <h2>Two-factor authentication</h2>
    <p class="faint sub">
      Add a time-based one-time code (TOTP) from an authenticator app as a second
      factor on top of your password. You'll be asked for a code each time you sign in.
    </p>

    {#if twoFaError}<p class="error">{twoFaError}</p>{/if}

    {#if recoveryCodes}
      <div class="secret">
        <div class="secret-head">
          <strong>Save your recovery codes now — they won't be shown again.</strong>
        </div>
        <p class="faint sub" style="margin:0 0 0.5rem">
          Each code works once. Use one to sign in if you lose access to your authenticator.
        </p>
        <ul class="codes">
          {#each recoveryCodes as code (code)}
            <li class="mono">{code}</li>
          {/each}
        </ul>
        <div class="actions">
          <button class="small" onclick={() => (recoveryCodes = null)}>Done</button>
        </div>
      </div>
    {/if}

    {#if twoFaEnabled}
      {#if !recoveryCodes}
        <p class="status-on">✓ Two-factor authentication is enabled.</p>
        <form onsubmit={disableTwoFa}>
          <label class="field">
            <span>Enter a current code to disable</span>
            <input
              bind:value={twoFaDisableCode}
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="123456 or a recovery code"
            />
          </label>
          <div class="actions">
            <button type="submit" class="danger" disabled={twoFaBusy}>
              {twoFaBusy ? "Disabling…" : "Disable two-factor"}
            </button>
          </div>
        </form>
      {/if}
    {:else if twoFaSetup}
      <div class="enroll">
        <p class="faint sub" style="margin-top:0">
          In your authenticator app, add an account using this secret (issuer
          <span class="mono">DaygleVE</span>):
        </p>
        <div class="secret">
          <div class="secret-head">
            <strong>Setup key</strong>
            <button class="small" onclick={copySecret2fa}>{secretCopied ? "Copied" : "Copy"}</button>
          </div>
          <code class="secret-value">{twoFaSetup.secret}</code>
        </div>
        <p class="faint sub">
          Or open the provisioning link on the device running your authenticator:
          <a class="mono link" href={twoFaSetup.otpauth_uri}>otpauth://…</a>
        </p>
        <form onsubmit={confirmTwoFa}>
          <label class="field">
            <span>Enter the current code to finish enrolling</span>
            <input
              bind:value={twoFaConfirmCode}
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="123456"
            />
          </label>
          <div class="actions two">
            <button type="button" class="small" onclick={cancelTwoFaSetup}>Cancel</button>
            <button type="submit" class="primary" disabled={twoFaBusy}>
              {twoFaBusy ? "Verifying…" : "Enable two-factor"}
            </button>
          </div>
        </form>
      </div>
    {:else}
      <div class="actions">
        <button class="primary" onclick={startTwoFa} disabled={twoFaBusy}>
          {twoFaBusy ? "Preparing…" : "Enable two-factor"}
        </button>
      </div>
    {/if}
  </div>

  <div class="card">
    <h2>API tokens</h2>
    <p class="faint sub">
      Long-lived tokens for scripts and automation. Send as
      <span class="mono">Authorization: Bearer &lt;token&gt;</span>. A token carries a subset of your
      own permissions and can be revoked at any time.
    </p>

    {#if tokError}<p class="error">{tokError}</p>{/if}

    {#if createdSecret}
      <div class="secret">
        <div class="secret-head">
          <strong>Copy your new token now — it won't be shown again.</strong>
          <button class="small" onclick={copySecret}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <code class="secret-value">{createdSecret}</code>
      </div>
    {/if}

    {#if tokens.length === 0}
      <p class="faint">No API tokens yet.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th>Prefix</th><th>Scope</th><th>Expires</th><th>Last used</th><th></th></tr>
        </thead>
        <tbody>
          {#each tokens as t (t.id)}
            <tr>
              <td>{t.name}</td>
              <td class="mono">{t.prefix}…</td>
              <td>{t.permissions.length} permission{t.permissions.length === 1 ? "" : "s"}</td>
              <td>{fmtDate(t.expires_at)}</td>
              <td>{fmtDate(t.last_used_at)}</td>
              <td class="row-actions"><button onclick={() => revokeToken(t)}>Revoke</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <form onsubmit={createToken} class="create">
      <label class="field">
        <span>Name</span>
        <input bind:value={tokName} autocomplete="off" placeholder="ci-deploy" />
      </label>
      <label class="field">
        <span>Expires in <span class="faint">(days, optional)</span></span>
        <input bind:value={tokExpiry} inputmode="numeric" autocomplete="off" placeholder="Never" />
      </label>
      <fieldset class="scope">
        <legend>Permissions</legend>
        <label class="radio">
          <input type="radio" value="all" bind:group={scopeMode} />
          <span>All of my permissions</span>
        </label>
        <label class="radio">
          <input type="radio" value="custom" bind:group={scopeMode} />
          <span>Specific permissions</span>
        </label>
        {#if scopeMode === "custom"}
          <div class="perms">
            {#each myPermissions as p (p)}
              <label class="perm">
                <input type="checkbox" checked={selectedPerms.has(p)} onchange={() => togglePerm(p)} />
                <span class="mono">{p}</span>
              </label>
            {/each}
          </div>
        {/if}
      </fieldset>
      <div class="actions">
        <button type="submit" class="primary" disabled={creating}>
          {creating ? "Creating…" : "Create token"}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .narrow {
    max-width: 760px;
  }
  .sub {
    font-size: 0.85rem;
    margin: 0 0 0.8rem;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: 600;
  }
  .row-actions {
    text-align: right;
  }
  .row-actions button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .row-actions button:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
  .secret {
    background: color-mix(in srgb, #34d399 12%, transparent);
    border: 1px solid #34d39955;
    border-radius: 8px;
    padding: 0.7rem 0.9rem;
    margin-bottom: 1rem;
  }
  .secret-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }
  .secret-value {
    display: block;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
    word-break: break-all;
    background: var(--bg-2, rgba(0, 0, 0, 0.25));
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
  }
  button.small {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    font-size: 0.78rem;
    white-space: nowrap;
  }
  .create {
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }
  .scope {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.8rem;
  }
  .scope legend {
    padding: 0 0.4rem;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .radio,
  .perm {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    margin: 0.25rem 0;
  }
  .perms {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.1rem 0.8rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--border);
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
  .actions.two {
    justify-content: space-between;
  }
  button.danger {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger);
    padding: 0.45rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  button.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }
  .status-on {
    color: #34d399;
    font-size: 0.9rem;
    margin: 0 0 0.8rem;
  }
  .link {
    color: var(--brand, #38bdf8);
    word-break: break-all;
  }
  .codes {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.3rem 0.8rem;
  }
  .codes li {
    background: var(--bg-2, rgba(0, 0, 0, 0.25));
    padding: 0.3rem 0.5rem;
    border-radius: 5px;
    text-align: center;
    letter-spacing: 0.03em;
  }
</style>

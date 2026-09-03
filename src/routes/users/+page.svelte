<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type { User, Role, CreateUserRequest, UpdateUserRequest } from "@daygleve/schema";

  const ALL_ROLES: Role[] = ["admin", "operator", "viewer"];

  let users = $state<User[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  // create modal
  let showCreate = $state(false);
  let busy = $state(false);
  let formError = $state<string | null>(null);
  let cName = $state("");
  let cPassword = $state("");
  let cRoles = $state<Role[]>(["viewer"]);

  // edit modal
  let editing = $state<User | null>(null);
  let eRoles = $state<Role[]>([]);
  let eNewPassword = $state("");

  async function load() {
    loading = true;
    try {
      users = await client().listUsers();
      error = null;
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      loading = false;
    }
  }

  function toggle(list: Role[], role: Role): Role[] {
    return list.includes(role) ? list.filter((r) => r !== role) : [...list, role];
  }

  function openCreate() {
    cName = "";
    cPassword = "";
    cRoles = ["viewer"];
    formError = null;
    showCreate = true;
  }

  async function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!cName.trim()) return (formError = "Username is required.");
    if (cPassword.length < 8) return (formError = "Password must be at least 8 characters.");
    if (cRoles.length === 0) return (formError = "Select at least one role.");
    const req: CreateUserRequest = { username: cName.trim(), password: cPassword, roles: cRoles };
    busy = true;
    try {
      await client().createUser(req);
      showCreate = false;
      await load();
    } catch (err) {
      formError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      busy = false;
    }
  }

  function openEdit(u: User) {
    editing = u;
    eRoles = [...u.roles];
    eNewPassword = "";
    formError = null;
  }

  async function submitEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!editing) return;
    formError = null;
    if (eRoles.length === 0) return (formError = "Select at least one role.");
    if (eNewPassword && eNewPassword.length < 8)
      return (formError = "Password must be at least 8 characters.");
    const req: UpdateUserRequest = { roles: eRoles };
    if (eNewPassword) req.password = eNewPassword;
    busy = true;
    try {
      await client().updateUser(editing.id, req);
      editing = null;
      await load();
    } catch (err) {
      formError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function remove(u: User) {
    if (!confirm(`Delete user "${u.username}"?`)) return;
    try {
      await client().deleteUser(u.id);
      await load();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="head">
    <h1>Users</h1>
    <button class="primary" onclick={openCreate}>Add user</button>
  </div>
  {#if error}<p class="error">{error}</p>{/if}

  <div class="card">
    {#if loading}
      <p class="muted">Loading…</p>
    {:else if users.length === 0}
      <p class="muted">No users.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Username</th><th>Roles</th><th>Created</th><th>Last login</th><th></th></tr>
        </thead>
        <tbody>
          {#each users as u (u.id)}
            <tr>
              <td>{u.username}</td>
              <td>{u.roles.join(", ")}</td>
              <td class="faint">{u.created_at.slice(0, 10)}</td>
              <td class="faint">{u.last_login_at ? u.last_login_at.slice(0, 16).replace("T", " ") : "—"}</td>
              <td class="row-actions">
                <button onclick={() => openEdit(u)}>Edit</button>
                <button onclick={() => remove(u)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

{#if showCreate}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showCreate = false)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Add user">
      <h2>Add user</h2>
      <form onsubmit={submitCreate}>
        <label class="field"><span>Username</span><input bind:value={cName} autocomplete="off" /></label>
        <label class="field"><span>Password</span><input type="password" bind:value={cPassword} autocomplete="new-password" /></label>
        <fieldset class="roles">
          <legend>Roles</legend>
          {#each ALL_ROLES as role (role)}
            <label class="check">
              <input type="checkbox" checked={cRoles.includes(role)} onchange={() => (cRoles = toggle(cRoles, role))} />
              <span>{role}</span>
            </label>
          {/each}
        </fieldset>
        {#if formError}<p class="error">{formError}</p>{/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (showCreate = false)} disabled={busy}>Cancel</button>
          <button type="submit" class="primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if editing}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (editing = null)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Edit user">
      <h2>Edit {editing.username}</h2>
      <form onsubmit={submitEdit}>
        <fieldset class="roles">
          <legend>Roles</legend>
          {#each ALL_ROLES as role (role)}
            <label class="check">
              <input type="checkbox" checked={eRoles.includes(role)} onchange={() => (eRoles = toggle(eRoles, role))} />
              <span>{role}</span>
            </label>
          {/each}
        </fieldset>
        <label class="field">
          <span>Reset password <span class="opt">(optional)</span></span>
          <input type="password" bind:value={eNewPassword} autocomplete="new-password" placeholder="Leave blank to keep current" />
        </label>
        {#if formError}<p class="error">{formError}</p>{/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (editing = null)} disabled={busy}>Cancel</button>
          <button type="submit" class="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .row-actions {
    display: flex;
    gap: 0.4rem;
  }
  .row-actions button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.25rem 0.55rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .row-actions button:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 20, 0.66);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 6vh 1rem;
    z-index: 50;
  }
  .dialog {
    background: var(--surface, #121a30);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    padding: 1.5rem 1.6rem;
    width: min(460px, 100%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  }
  .dialog h2 {
    margin: 0 0 1rem;
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
  .field .opt {
    opacity: 0.7;
  }
  .roles {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    margin: 0 0 0.8rem;
    display: flex;
    gap: 1rem;
  }
  .roles legend {
    color: var(--muted);
    font-size: 0.78rem;
    padding: 0 0.3rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    text-transform: capitalize;
  }
  .check input {
    width: auto;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1.2rem;
  }
</style>

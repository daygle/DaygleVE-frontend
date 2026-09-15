<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type {
    User,
    Role,
    CreateUserRequest,
    UpdateUserRequest,
    AclEntry,
  } from "@daygleve/schema";

  const ALL_ROLES: Role[] = ["admin", "operator", "viewer"];

  let users = $state<User[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let forbidden = $state(false);

  // access control (ACL)
  let acl = $state<AclEntry[]>([]);
  let aclError = $state<string | null>(null);
  let aPath = $state("/vms/");
  let aSubject = $state("");
  let aRole = $state<Role>("viewer");
  let aPropagate = $state(true);
  let aBusy = $state(false);

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
      const c = client();
      users = await c.listUsers();
      acl = await c.listAcl();
      error = null;
      forbidden = false;
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 403) {
        forbidden = true;
        error = null;
      } else {
        error = e instanceof ApiRequestError ? e.body.message : String(e);
      }
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
    // Empty roles are allowed: a scoped-only user gets access from ACL grants.
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
    // Empty roles are allowed (scoped-only user); access can come from ACL grants.
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

  function userName(id: string): string {
    return users.find((u) => u.id === id)?.username ?? id;
  }

  async function addAcl(e: SubmitEvent) {
    e.preventDefault();
    aclError = null;
    if (!aSubject) return (aclError = "Choose a user to grant to.");
    if (!aPath.trim()) return (aclError = "Enter a path (e.g. /vms/<id>).");
    aBusy = true;
    try {
      await client().createAcl({
        path: aPath.trim(),
        subject: aSubject,
        role: aRole,
        propagate: aPropagate,
      });
      aPath = "/vms/";
      await load();
    } catch (err) {
      aclError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      aBusy = false;
    }
  }

  async function removeAcl(entry: AclEntry) {
    if (!confirm(`Revoke ${entry.role} on ${entry.path} from ${userName(entry.subject)}?`)) return;
    aclError = null;
    try {
      await client().deleteAcl(entry.id);
      await load();
    } catch (e) {
      aclError = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="head">
    <h1>Users</h1>
    {#if !forbidden}
      <button class="primary" onclick={openCreate}>Add user</button>
    {/if}
  </div>
  {#if error}<p class="error">{error}</p>{/if}

  <div class="card">
    {#if forbidden}
      <p class="muted">You don't have permission to manage users. This area requires an administrator account.</p>
    {:else if loading}
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
              <td>{u.roles.length ? u.roles.join(", ") : "— scoped only"}</td>
              <td class="faint">{u.created_at.slice(0, 10)}</td>
              <td class="faint">{u.last_login_at ? u.last_login_at.slice(0, 16).replace("T", " ") : "-"}</td>
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

  {#if !forbidden && !loading}
    <h2 class="acl-head">Access control</h2>
    <p class="muted acl-sub">
      Grant a role on a resource path. A grant at <span class="mono">/</span> is node-wide (the
      user's roles above); a grant at <span class="mono">/vms/&lt;id&gt;</span> or
      <span class="mono">/pools/&lt;id&gt;</span> scopes access to that resource. With
      propagation on, the grant also covers everything beneath the path.
    </p>

    {#if aclError}<p class="error">{aclError}</p>{/if}

    <div class="card">
      {#if acl.length === 0}
        <p class="muted">No path-scoped grants. Users have only their node-wide roles above.</p>
      {:else}
        <table>
          <thead>
            <tr><th>User</th><th>Path</th><th>Role</th><th>Propagates</th><th></th></tr>
          </thead>
          <tbody>
            {#each acl as entry (entry.id)}
              <tr>
                <td>{entry.subject_username ?? userName(entry.subject)}</td>
                <td class="mono">{entry.path}</td>
                <td>{entry.role}</td>
                <td>{entry.propagate ? "yes" : "no"}</td>
                <td class="row-actions">
                  <button onclick={() => removeAcl(entry)}>Revoke</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <form class="acl-form" onsubmit={addAcl}>
        <label class="field">
          <span>User</span>
          <select bind:value={aSubject}>
            <option value="" disabled>Choose a user…</option>
            {#each users as u (u.id)}
              <option value={u.id}>{u.username}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Path</span>
          <input bind:value={aPath} class="mono" placeholder="/vms/&lt;id&gt;" autocomplete="off" />
        </label>
        <label class="field">
          <span>Role</span>
          <select bind:value={aRole}>
            {#each ALL_ROLES as role (role)}
              <option value={role}>{role}</option>
            {/each}
          </select>
        </label>
        <label class="check propagate">
          <input type="checkbox" bind:checked={aPropagate} />
          <span>Propagate to descendants</span>
        </label>
        <button type="submit" class="primary" disabled={aBusy}>
          {aBusy ? "Granting…" : "Grant"}
        </button>
      </form>
    </div>
  {/if}
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
  .acl-head {
    margin-top: 2rem;
  }
  .acl-sub {
    font-size: 0.85rem;
    margin: 0 0 0.8rem;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
  }
  .acl-form {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.8rem;
    border-top: 1px solid var(--border);
    padding-top: 1rem;
    margin-top: 0.5rem;
  }
  .acl-form .field {
    margin-bottom: 0;
    min-width: 150px;
    flex: 1;
  }
  .acl-form select,
  .acl-form input {
    padding: 0.4rem 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-size: 0.85rem;
  }
  .propagate {
    white-space: nowrap;
    padding-bottom: 0.4rem;
  }
</style>

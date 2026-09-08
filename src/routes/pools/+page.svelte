<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type {
    ResourcePoolSummary,
    ResourcePoolDetail,
    CreateResourcePoolRequest,
    UpdateResourcePoolRequest,
  } from "@daygleve/schema";

  let pools = $state<ResourcePoolSummary[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let forbidden = $state(false);

  // create modal
  let showCreate = $state(false);
  let busy = $state(false);
  let formError = $state<string | null>(null);
  let cName = $state("");
  let cComment = $state("");

  // edit modal (comment only; the name is immutable)
  let editing = $state<ResourcePoolSummary | null>(null);
  let eComment = $state("");

  // members modal
  let members = $state<ResourcePoolDetail | null>(null);
  let membersBusy = $state(false);

  async function load() {
    loading = true;
    try {
      pools = await client().listResourcePools();
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

  function openCreate() {
    cName = "";
    cComment = "";
    formError = null;
    showCreate = true;
  }

  async function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!cName.trim()) return (formError = "Pool name is required.");
    const req: CreateResourcePoolRequest = { name: cName.trim() };
    if (cComment.trim()) req.comment = cComment.trim();
    busy = true;
    try {
      await client().createResourcePool(req);
      showCreate = false;
      await load();
    } catch (err) {
      formError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      busy = false;
    }
  }

  function openEdit(p: ResourcePoolSummary) {
    editing = p;
    eComment = p.comment ?? "";
    formError = null;
  }

  async function submitEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!editing) return;
    formError = null;
    // Send the comment as-is; an empty string clears it server-side.
    const req: UpdateResourcePoolRequest = { comment: eComment.trim() };
    busy = true;
    try {
      await client().updateResourcePool(editing.id, req);
      editing = null;
      await load();
    } catch (err) {
      formError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function openMembers(p: ResourcePoolSummary) {
    membersBusy = true;
    members = null;
    try {
      members = await client().getResourcePool(p.id);
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      membersBusy = false;
    }
  }

  async function remove(p: ResourcePoolSummary) {
    if (!confirm(`Delete pool "${p.name}"?`)) return;
    try {
      await client().deleteResourcePool(p.id);
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
    <h1>Resource Pools</h1>
    {#if !forbidden}
      <button class="primary" onclick={openCreate}>Add pool</button>
    {/if}
  </div>
  <p class="lede muted">
    Group VMs and containers for organization. Assign a guest to a pool from its create form or
    settings; a guest belongs to at most one pool.
  </p>
  {#if error}<p class="error">{error}</p>{/if}

  <div class="card">
    {#if forbidden}
      <p class="muted">You don't have permission to view resource pools.</p>
    {:else if loading}
      <p class="muted">Loading…</p>
    {:else if pools.length === 0}
      <p class="muted">No pools yet. Create one to start grouping guests.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th>Comment</th><th>Members</th><th>Created</th><th></th></tr>
        </thead>
        <tbody>
          {#each pools as p (p.id)}
            <tr>
              <td class="name">{p.name}</td>
              <td class="faint">{p.comment ?? "-"}</td>
              <td>
                <button class="link" onclick={() => openMembers(p)}>
                  {p.member_count}
                  {p.member_count === 1 ? "member" : "members"}
                </button>
              </td>
              <td class="faint">{p.created_at.slice(0, 10)}</td>
              <td class="row-actions">
                <button onclick={() => openEdit(p)}>Edit</button>
                <button onclick={() => remove(p)}>Delete</button>
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
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Add pool">
      <h2>Add pool</h2>
      <form onsubmit={submitCreate}>
        <label class="field">
          <span>Name</span>
          <input bind:value={cName} autocomplete="off" placeholder="production" />
        </label>
        <label class="field">
          <span>Comment <span class="opt">(optional)</span></span>
          <input bind:value={cComment} autocomplete="off" placeholder="Customer-facing production guests" />
        </label>
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
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Edit pool">
      <h2>Edit {editing.name}</h2>
      <form onsubmit={submitEdit}>
        <label class="field">
          <span>Name</span>
          <input value={editing.name} disabled />
          <span class="opt">The pool name is immutable.</span>
        </label>
        <label class="field">
          <span>Comment</span>
          <input bind:value={eComment} autocomplete="off" placeholder="Leave blank to clear" />
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

{#if members || membersBusy}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (members = null)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Pool members">
      {#if membersBusy}
        <p class="muted">Loading members…</p>
      {:else if members}
        <h2>{members.pool.name} · members</h2>
        {#if members.members.length === 0}
          <p class="muted">This pool has no members.</p>
        {:else}
          <ul class="members">
            {#each members.members as m (m.kind + m.id)}
              <li>
                <span class="badge">{m.kind === "vm" ? "VM" : "CT"}</span>
                <a href={`${m.kind === "vm" ? "/vms" : "/containers"}/${m.id}`}>{m.name}</a>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (members = null)}>Close</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .lede {
    margin: 0.2rem 0 1rem;
    max-width: 60ch;
    font-size: 0.9rem;
  }
  .name {
    font-weight: 600;
  }
  .link {
    background: transparent;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
  }
  .link:hover {
    text-decoration: underline;
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
    font-size: 0.75rem;
  }
  .members {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .members li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .badge {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.05rem 0.4rem;
    border-radius: 4px;
    background: var(--panel-2, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>

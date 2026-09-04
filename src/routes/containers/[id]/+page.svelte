<script lang="ts">
  import { tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type { Lxc, LxcPowerAction, UpdateLxcRequest, LxcSnapshot } from "@daygleve/schema";

  let ct = $state<Lxc | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let snapshots = $state<LxcSnapshot[]>([]);
  let snapName = $state("");
  let snapBusy = $state(false);
  let snapError = $state<string | null>(null);

  // --- edit modal ---
  let showEdit = $state(false);
  let editBusy = $state(false);
  let editError = $state<string | null>(null);
  let eName = $state("");
  let eVcpus = $state(1);
  let eMemory = $state(512);
  let eDesc = $state("");
  let eNameInput = $state<HTMLInputElement>();

  const id = $derived($page.params.id ?? "");

  async function reload() {
    try {
      ct = await client().getContainer(id);
      snapshots = await client().listContainerSnapshots(id);
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  async function createSnapshot(e: SubmitEvent) {
    e.preventDefault();
    if (!snapName.trim()) return;
    snapBusy = true;
    snapError = null;
    try {
      await client().createContainerSnapshot(id, { name: snapName.trim() });
      snapName = "";
      snapshots = await client().listContainerSnapshots(id);
    } catch (e) {
      snapError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      snapBusy = false;
    }
  }

  async function rollbackSnapshot(name: string) {
    if (!confirm(`Roll back ${ct?.name ?? "this container"} to "${name}"?`)) return;
    snapBusy = true;
    snapError = null;
    try {
      await client().rollbackContainerSnapshot(id, name);
      await reload();
    } catch (e) {
      snapError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      snapBusy = false;
    }
  }

  async function deleteSnapshot(name: string) {
    if (!confirm(`Delete snapshot "${name}"? This cannot be undone.`)) return;
    snapBusy = true;
    snapError = null;
    try {
      await client().deleteContainerSnapshot(id, name);
      snapshots = await client().listContainerSnapshots(id);
    } catch (e) {
      snapError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      snapBusy = false;
    }
  }

  $effect(() => {
    reload();
  });

  // Power actions available for the current state.
  const actions = $derived<LxcPowerAction[]>(
    ct?.state === "running"
      ? ["stop", "restart", "freeze"]
      : ct?.state === "frozen"
        ? ["unfreeze", "stop"]
        : ["start"],
  );

  const actionLabels: Record<LxcPowerAction, string> = {
    start: "Start",
    stop: "Stop",
    restart: "Restart",
    freeze: "Freeze",
    unfreeze: "Unfreeze",
  };

  async function power(action: LxcPowerAction) {
    busy = true;
    error = null;
    try {
      await client().powerContainer(id, { action });
      await reload();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function openEdit() {
    if (!ct) return;
    editError = null;
    eName = ct.name;
    eVcpus = ct.vcpus;
    eMemory = ct.memory_mib;
    eDesc = ct.description ?? "";
    showEdit = true;
    await tick();
    eNameInput?.focus();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && showEdit && !editBusy) showEdit = false;
  }

  async function submitEdit(e: SubmitEvent) {
    e.preventDefault();
    editError = null;
    if (!eName.trim()) {
      editError = "Name is required.";
      return;
    }
    const req: UpdateLxcRequest = {
      name: eName.trim(),
      vcpus: eVcpus,
      memory_mib: eMemory,
      description: eDesc.trim() || undefined,
    };
    editBusy = true;
    try {
      await client().updateContainer(id, req);
      showEdit = false;
      await reload();
    } catch (err) {
      editError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      editBusy = false;
    }
  }

  async function remove() {
    if (!confirm(`Delete container "${ct?.name ?? id}"? This destroys its root filesystem.`)) return;
    busy = true;
    error = null;
    try {
      await client().deleteContainer(id);
      await goto("/containers");
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="container">
  <p><a href="/containers">← Containers</a></p>
  {#if error}<p class="error">{error}</p>{/if}

  {#if ct}
    <div class="head">
      <h1>{ct.name}</h1>
      <StateBadge state={ct.state} />
      <button class="edit-btn" onclick={openEdit}>Edit</button>
      <button class="edit-btn danger" onclick={remove} disabled={busy}>Delete</button>
    </div>

    <div class="powerbar">
      {#each actions as a (a)}
        <button onclick={() => power(a)} disabled={busy}>{actionLabels[a]}</button>
      {/each}
    </div>

    <div class="grid">
      <div class="card">
        <h3>Compute</h3>
        <dl>
          <dt>vCPUs</dt><dd>{ct.vcpus}</dd>
          <dt>Memory</dt><dd>{(ct.memory_mib / 1024).toFixed(1)} GiB</dd>
          <dt>Privilege</dt><dd>{ct.unprivileged ? "Unprivileged" : "Privileged"}</dd>
        </dl>
      </div>
      <div class="card">
        <h3>Root filesystem</h3>
        <dl>
          <dt>Template</dt><dd>{ct.template}</dd>
          <dt>Dataset</dt><dd class="mono">{ct.rootfs_dataset}</dd>
        </dl>
      </div>
      <div class="card">
        <h3>Network</h3>
        {#if ct.networks.length}
          <ul>
            {#each ct.networks as net, i (i)}
              <li>{net.bridge}{net.vlan ? ` · VLAN ${net.vlan}` : ""}{net.ip ? ` · ${net.ip}` : ""}</li>
            {/each}
          </ul>
        {:else}<p class="muted">None</p>{/if}
      </div>
      {#if ct.description}
        <div class="card">
          <h3>Description</h3>
          <p>{ct.description}</p>
        </div>
      {/if}
    </div>

    <div class="card snapshots-card">
      <div class="snap-head"><h3>Snapshots</h3></div>
      <form class="snap-form" onsubmit={createSnapshot}>
        <input bind:value={snapName} placeholder="pre-upgrade" aria-label="Snapshot name" />
        <button type="submit" class="primary" disabled={snapBusy}>Create snapshot</button>
      </form>
      {#if snapError}<p class="error">{snapError}</p>{/if}
      {#if snapshots.length === 0}
        <p class="muted">No snapshots.</p>
      {:else}
        <table class="snap-table">
          <thead><tr><th>Name</th><th>Used</th><th></th></tr></thead>
          <tbody>
            {#each snapshots as snapshot (snapshot.id)}
              <tr>
                <td class="mono">{snapshot.name}</td>
                <td>{(snapshot.used_bytes / 1073741824).toFixed(2)} GiB</td>
                <td class="snap-actions">
                  <button onclick={() => rollbackSnapshot(snapshot.name)} disabled={snapBusy}>Rollback</button>
                  <button class="danger" onclick={() => deleteSnapshot(snapshot.name)} disabled={snapBusy}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</div>

{#if showEdit}
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && !editBusy && (showEdit = false)}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Edit container">
      <h2>Edit container</h2>
      <form onsubmit={submitEdit}>
        <div class="grid-form">
          <label class="field">
            <span>Name</span>
            <input bind:this={eNameInput} bind:value={eName} autocomplete="off" />
          </label>
          <label class="field">
            <span>vCPUs</span>
            <input type="number" min="1" bind:value={eVcpus} />
          </label>
          <label class="field">
            <span>Memory (MiB)</span>
            <input type="number" min="1" step="128" bind:value={eMemory} />
          </label>
        </div>
        <label class="field desc">
          <span>Description</span>
          <input bind:value={eDesc} autocomplete="off" />
        </label>
        {#if editError}<p class="error">{editError}</p>{/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (showEdit = false)} disabled={editBusy}>Cancel</button>
          <button type="submit" class="primary" disabled={editBusy}>{editBusy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .edit-btn {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.35rem 0.7rem;
    border-radius: 8px;
    font-size: 0.85rem;
  }
  .head .edit-btn:first-of-type {
    margin-left: auto;
  }
  .edit-btn:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
  .edit-btn.danger:hover {
    color: #ff6b6b;
    border-color: #ff6b6b;
  }
  .snapshots-card {
    margin-top: 1rem;
  }
  .snap-head h3 {
    margin-top: 0;
  }
  .snap-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.8rem;
  }
  .snap-form input {
    flex: 1;
  }
  .snap-table {
    width: 100%;
    border-collapse: collapse;
  }
  .snap-table th, .snap-table td {
    text-align: left;
    padding: 0.45rem 0.5rem 0.45rem 0;
    border-bottom: 1px solid var(--border);
  }
  .snap-actions {
    text-align: right !important;
  }
  .snap-actions button {
    margin-left: 0.4rem;
  }
  .danger {
    color: var(--danger);
  }
  .powerbar {
    display: flex;
    gap: 0.5rem;
    margin: 1rem 0;
    flex-wrap: wrap;
  }
  .powerbar button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.35rem 0.8rem;
    border-radius: 8px;
    font-size: 0.85rem;
  }
  .powerbar button:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 1rem;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
  }
  .mono {
    font-family: var(--mono, monospace);
    font-size: 0.85rem;
  }
  ul {
    margin: 0;
    padding-left: 1.1rem;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 20, 0.66);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 5vh 1rem;
    overflow-y: auto;
    z-index: 50;
  }
  .dialog {
    background: var(--surface, #121a30);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    padding: 1.5rem 1.6rem;
    width: min(560px, 100%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  }
  .dialog h2 {
    margin: 0 0 1rem;
  }
  .grid-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.8rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  .field.desc {
    margin-top: 0.8rem;
  }
  .field span {
    color: var(--muted);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1.5rem;
  }
</style>

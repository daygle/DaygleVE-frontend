<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type { LxcSummary, LxcPowerAction, Bridge, CreateLxcRequest } from "@daygleve/schema";

  let containers = $state<LxcSummary[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  // --- create form state ---
  let showCreate = $state(false);
  let bridges = $state<Bridge[]>([]);
  let creating = $state(false);
  let formError = $state<string | null>(null);

  // Common LXC download-template presets (<dist>-<release>); the field is still
  // free-form so any image the host can fetch works.
  const templates = [
    "debian-bookworm",
    "debian-trixie",
    "ubuntu-noble",
    "ubuntu-jammy",
    "alpine-3.20",
    "rockylinux-9",
  ];

  // form fields
  let name = $state("");
  let template = $state(templates[0]);
  let vcpus = $state(1);
  let memoryMib = $state(512);
  let rootfsGib = $state(8);
  let bridge = $state("");
  let unprivileged = $state(true);
  let description = $state("");
  let startAfter = $state(true);

  async function load() {
    loading = true;
    try {
      containers = await client().listContainers();
      error = null;
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function power(id: string, action: LxcPowerAction) {
    try {
      await client().powerContainer(id, { action });
      await load();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  async function openCreate() {
    showCreate = true;
    formError = null;
    // Bridges populate the network picker; failure just leaves it empty.
    try {
      bridges = await client().listBridges();
    } catch {
      bridges = [];
    }
  }

  function closeCreate() {
    showCreate = false;
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && showCreate && !creating) closeCreate();
  }

  async function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!name.trim()) {
      formError = "Name is required.";
      return;
    }
    if (!template.trim()) {
      formError = "A template is required (e.g. debian-bookworm).";
      return;
    }
    const req: CreateLxcRequest = {
      name: name.trim(),
      template: template.trim(),
      vcpus,
      memory_mib: memoryMib,
      rootfs_size_gib: rootfsGib,
      networks: bridge ? [{ bridge }] : [],
      unprivileged,
      description: description.trim() || undefined,
      start: startAfter,
    };
    creating = true;
    try {
      await client().createContainer(req);
      showCreate = false;
      resetForm();
      await load();
    } catch (err) {
      formError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      creating = false;
    }
  }

  function resetForm() {
    name = "";
    template = templates[0];
    vcpus = 1;
    memoryMib = 512;
    rootfsGib = 8;
    bridge = "";
    unprivileged = true;
    description = "";
    startAfter = true;
  }

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="head">
    <h1>Containers</h1>
    <button class="primary" onclick={openCreate}>New container</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="card">
    {#if loading}
      <p class="muted">Loading…</p>
    {:else if containers.length === 0}
      <p class="muted">No containers yet.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>State</th>
            <th>vCPUs</th>
            <th>Memory</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each containers as ct (ct.id)}
            <tr>
              <td><a href={`/containers/${ct.id}`}>{ct.name}</a></td>
              <td><StateBadge state={ct.state} /></td>
              <td>{ct.vcpus}</td>
              <td>{(ct.memory_mib / 1024).toFixed(1)} GiB</td>
              <td class="actions">
                {#if ct.state === "running"}
                  <button onclick={() => power(ct.id, "stop")}>Stop</button>
                {:else}
                  <button onclick={() => power(ct.id, "start")}>Start</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<svelte:window onkeydown={onWindowKeydown} />

{#if showCreate}
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && !creating && closeCreate()}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Create container">
      <h2>New Container</h2>
      <form onsubmit={submitCreate}>
        <div class="grid">
          <label class="field">
            <span>Name</span>
            <input bind:value={name} placeholder="web01" autocomplete="off" />
          </label>
          <label class="field">
            <span>Template</span>
            <input bind:value={template} list="lxc-templates" autocomplete="off" />
            <datalist id="lxc-templates">
              {#each templates as t (t)}<option value={t}></option>{/each}
            </datalist>
          </label>
          <label class="field">
            <span>vCPUs</span>
            <input type="number" min="1" bind:value={vcpus} />
          </label>
          <label class="field">
            <span>Memory (MiB)</span>
            <input type="number" min="1" step="128" bind:value={memoryMib} />
          </label>
          <label class="field">
            <span>Root FS (GiB)</span>
            <input type="number" min="1" bind:value={rootfsGib} />
          </label>
          <label class="field">
            <span>Bridge</span>
            <select bind:value={bridge}>
              <option value="">None</option>
              {#each bridges as b (b.id)}
                <option value={b.name}>{b.name}</option>
              {/each}
            </select>
          </label>
        </div>

        <label class="field desc">
          <span>Description (optional)</span>
          <input bind:value={description} autocomplete="off" />
        </label>

        <label class="check">
          <input type="checkbox" bind:checked={unprivileged} />
          <span>Unprivileged (recommended)</span>
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={startAfter} />
          <span>Start immediately after creation</span>
        </label>

        <p class="hint">
          The template is a download image named <code>&lt;dist&gt;-&lt;release&gt;</code>
          (e.g. <code>debian-bookworm</code>). The root filesystem is a ZFS dataset on the
          node's default pool.
        </p>

        {#if formError}<p class="error">{formError}</p>{/if}

        <div class="dialog-actions">
          <button type="button" onclick={closeCreate} disabled={creating}>Cancel</button>
          <button type="submit" class="primary" disabled={creating}>
            {creating ? "Creating…" : "Create container"}
          </button>
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
  .actions button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.25rem 0.55rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .actions button:hover {
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
    padding: 4vh 1rem;
    overflow-y: auto;
    z-index: 50;
  }
  .dialog {
    background: var(--surface, #121a30);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    padding: 1.5rem 1.6rem 1.6rem;
    width: min(640px, 100%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  }
  .dialog h2 {
    margin: 0 0 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.9rem;
    font-size: 0.9rem;
  }
  .check input {
    width: auto;
  }
  .hint {
    margin: 0.9rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
    line-height: 1.45;
  }
  .hint code {
    background: rgba(255, 255, 255, 0.06);
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1.5rem;
  }
</style>

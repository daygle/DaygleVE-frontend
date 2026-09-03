<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type { Pool, Dataset, NetworkShare, ShareType, CreateShareRequest } from "@daygleve/schema";

  let pools = $state<Pool[]>([]);
  let datasets = $state<Dataset[]>([]);
  let shares = $state<NetworkShare[]>([]);
  let error = $state<string | null>(null);

  // --- add-share form ---
  let showAdd = $state(false);
  let adding = $state(false);
  let formError = $state<string | null>(null);
  let shareType = $state<ShareType>("nfs");
  let name = $state("");
  let server = $state("");
  let exportPath = $state("");
  let options = $state("");
  let username = $state("");
  let password = $state("");
  let domain = $state("");

  function pct(p: Pool): number {
    return p.size_bytes ? Math.round((p.allocated_bytes / p.size_bytes) * 100) : 0;
  }
  function gib(bytes: number): string {
    return (bytes / 1024 ** 3).toFixed(1);
  }

  async function loadShares() {
    try {
      shares = await client().listShares();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  $effect(() => {
    const c = client();
    Promise.all([c.listPools(), c.listDatasets()])
      .then(([p, d]) => {
        pools = p;
        datasets = d;
      })
      .catch((e) => (error = e instanceof ApiRequestError ? e.body.message : String(e)));
    loadShares();
  });

  function resetForm() {
    name = "";
    server = "";
    exportPath = "";
    options = "";
    username = "";
    password = "";
    domain = "";
    formError = null;
  }

  async function addShare(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!name.trim() || !server.trim() || !exportPath.trim()) {
      formError = "Name, server and export/share are required.";
      return;
    }
    const req: CreateShareRequest = {
      name: name.trim(),
      share_type: shareType,
      server: server.trim(),
      export_path: exportPath.trim(),
      options: options.trim() || undefined,
      username: shareType === "cifs" && username ? username : undefined,
      password: shareType === "cifs" && password ? password : undefined,
      domain: shareType === "cifs" && domain ? domain : undefined,
    };
    adding = true;
    try {
      await client().createShare(req);
      showAdd = false;
      resetForm();
      await loadShares();
    } catch (err) {
      formError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      adding = false;
    }
  }

  async function removeShare(share: NetworkShare) {
    if (!confirm(`Remove share "${share.name}"? This unmounts it.`)) return;
    try {
      await client().deleteShare(share.id);
      await loadShares();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  function addr(s: NetworkShare): string {
    return s.share_type === "nfs" ? `${s.server}:${s.export_path}` : `//${s.server}/${s.export_path}`;
  }
</script>

<div class="container">
  <h1>Storage</h1>
  {#if error}<p class="error">{error}</p>{/if}

  <h2>Pools</h2>
  <div class="grid">
    {#each pools as pool (pool.name)}
      <div class="card">
        <h3>{pool.name}</h3>
        <p class="muted">{pool.health}</p>
        <div class="bar"><span style="width: {pct(pool)}%"></span></div>
        <p class="muted">{gib(pool.allocated_bytes)} / {gib(pool.size_bytes)} GiB</p>
      </div>
    {:else}
      <p class="muted">No pools found.</p>
    {/each}
  </div>

  <h2>Datasets</h2>
  <div class="card">
    {#if datasets.length === 0}
      <p class="muted">No datasets.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th>Kind</th><th>Used</th><th>Compression</th></tr>
        </thead>
        <tbody>
          {#each datasets as ds (ds.id)}
            <tr>
              <td>{ds.name}</td>
              <td>{ds.kind}</td>
              <td>{gib(ds.used_bytes)} GiB</td>
              <td>{ds.compression}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <div class="section-head">
    <h2>Network shares</h2>
    <button class="primary" onclick={() => (showAdd = !showAdd)}>
      {showAdd ? "Cancel" : "Add share"}
    </button>
  </div>
  <p class="muted lede">
    Mount an NFS or CIFS share to use its ISOs as VM install media. Mounted shares appear in the
    install-media picker when you create or edit a VM.
  </p>

  {#if showAdd}
    <div class="card">
      <form onsubmit={addShare}>
        <div class="grid-form">
          <label class="field">
            <span>Type</span>
            <select bind:value={shareType}>
              <option value="nfs">NFS</option>
              <option value="cifs">CIFS / SMB</option>
            </select>
          </label>
          <label class="field">
            <span>Name</span>
            <input bind:value={name} placeholder="nas-isos" autocomplete="off" />
          </label>
          <label class="field">
            <span>Server</span>
            <input bind:value={server} placeholder="192.168.1.10" autocomplete="off" />
          </label>
          <label class="field">
            <span>{shareType === "nfs" ? "Export path" : "Share name"}</span>
            <input
              bind:value={exportPath}
              placeholder={shareType === "nfs" ? "/export/isos" : "isos"}
              autocomplete="off"
            />
          </label>
          <label class="field">
            <span>Options <span class="opt">(optional)</span></span>
            <input bind:value={options} placeholder={shareType === "nfs" ? "vers=4.1" : "vers=3.0"} autocomplete="off" />
          </label>
          {#if shareType === "cifs"}
            <label class="field">
              <span>Username</span>
              <input bind:value={username} autocomplete="off" />
            </label>
            <label class="field">
              <span>Password</span>
              <input type="password" bind:value={password} autocomplete="new-password" />
            </label>
            <label class="field">
              <span>Domain <span class="opt">(optional)</span></span>
              <input bind:value={domain} autocomplete="off" />
            </label>
          {/if}
        </div>
        {#if formError}<p class="error">{formError}</p>{/if}
        <div class="form-actions">
          <button type="submit" class="primary" disabled={adding}>
            {adding ? "Mounting…" : "Mount share"}
          </button>
        </div>
      </form>
    </div>
  {/if}

  <div class="card">
    {#if shares.length === 0}
      <p class="muted">No network shares configured.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th>Type</th><th>Location</th><th>State</th><th></th></tr>
        </thead>
        <tbody>
          {#each shares as share (share.id)}
            <tr>
              <td>{share.name}</td>
              <td>{share.share_type.toUpperCase()}</td>
              <td class="mono">{addr(share)}</td>
              <td><span class="state state-{share.state}">{share.state}</span></td>
              <td class="row-actions">
                <button onclick={() => removeShare(share)}>Remove</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .bar {
    height: 8px;
    border-radius: 999px;
    background: var(--panel-2);
    overflow: hidden;
    margin: 0.4rem 0;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 1.5rem;
  }
  .lede {
    margin: 0.2rem 0 0.8rem;
    max-width: 60ch;
  }
  .grid-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.8rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  .field span {
    color: var(--muted);
  }
  .field .opt {
    opacity: 0.7;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
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
  .state {
    font-size: 0.78rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    text-transform: capitalize;
  }
  .state-connected {
    color: #34d399;
    border-color: #34d39955;
  }
  .state-disconnected {
    color: var(--muted);
  }
  .state-error {
    color: #f87171;
    border-color: #f8717155;
  }
</style>

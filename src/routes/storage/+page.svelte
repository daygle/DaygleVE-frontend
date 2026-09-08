<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError, operationFailureMessage } from "$lib/api";
  import type {
    Pool,
    Dataset,
    NetworkShare,
    ShareType,
    CreateShareRequest,
    StorageFile,
  } from "@daygleve/schema";

  let pools = $state<Pool[]>([]);
  let datasets = $state<Dataset[]>([]);
  let shares = $state<NetworkShare[]>([]);
  let error = $state<string | null>(null);

  // --- media library (uploaded ISOs + CT templates + disk images) ---
  let libIsos = $state<StorageFile[]>([]);
  let ctTemplates = $state<StorageFile[]>([]);
  let diskImages = $state<StorageFile[]>([]);
  let uploadingIso = $state(false);
  let uploadingTemplate = $state(false);
  let uploadingDiskImage = $state(false);
  let libraryError = $state<string | null>(null);

  // --- import a disk image into a zvol ---
  let importImage = $state<StorageFile | null>(null);
  let importDataset = $state("");
  let importSize = $state("");
  let importing = $state(false);
  let importError = $state<string | null>(null);
  let importResult = $state<string | null>(null);

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

  async function loadLibrary() {
    try {
      const c = client();
      [libIsos, ctTemplates, diskImages] = await Promise.all([
        c.listLibraryIsos(),
        c.listCtTemplates(),
        c.listDiskImages(),
      ]);
    } catch (e) {
      libraryError = e instanceof ApiRequestError ? e.body.message : String(e);
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
    loadLibrary();
  });

  // Upload the picked file under its own name, then refresh the list. The input
  // is reset so re-picking the same file fires `change` again.
  async function uploadFile(kind: "iso" | "template" | "diskimage", input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    libraryError = null;
    if (kind === "iso") uploadingIso = true;
    else if (kind === "template") uploadingTemplate = true;
    else uploadingDiskImage = true;
    try {
      if (kind === "iso") await client().uploadIso(file.name, file);
      else if (kind === "template") await client().uploadCtTemplate(file.name, file);
      else await client().uploadDiskImage(file.name, file);
      await loadLibrary();
    } catch (e) {
      libraryError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      uploadingIso = false;
      uploadingTemplate = false;
      uploadingDiskImage = false;
      input.value = "";
    }
  }

  async function removeLibraryFile(kind: "iso" | "template" | "diskimage", file: StorageFile) {
    if (!confirm(`Delete "${file.name}"? This removes the file from the node.`)) return;
    libraryError = null;
    try {
      if (kind === "iso") await client().deleteIso(file.name);
      else if (kind === "template") await client().deleteCtTemplate(file.name);
      else await client().deleteDiskImage(file.name);
      await loadLibrary();
    } catch (e) {
      libraryError = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  function openImport(file: StorageFile) {
    importImage = file;
    importDataset = "";
    importSize = "";
    importError = null;
    importResult = null;
  }

  // Import the selected disk image into a new zvol. An empty size auto-detects
  // the image's virtual size; a given size must be a whole number of GiB.
  async function runImport(e: SubmitEvent) {
    e.preventDefault();
    if (!importImage) return;
    const dataset = importDataset.trim();
    if (!dataset) {
      importError = "Enter a target dataset for the new zvol.";
      return;
    }
    let size_gib: number | undefined;
    const rawSize = importSize.trim();
    if (rawSize) {
      const n = Number(rawSize);
      if (!Number.isInteger(n) || n < 1) {
        importError = "Size must be a whole number of GiB, or blank to auto-detect.";
        return;
      }
      size_gib = n;
    }
    importing = true;
    importError = null;
    const imageName = importImage.name;
    try {
      const res = await client().importDiskImage({ image_name: imageName, dataset, size_gib });
      importResult = `Imported ${imageName} into ${res.dataset} (${res.size_gib} GiB). Use this dataset as a VM disk.`;
      importImage = null;
    } catch (e) {
      importError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      importing = false;
    }
  }

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

  // Toggling the form closed clears it, so a typed password (and any prior
  // error) is never left in memory or re-shown when the form reopens.
  function toggleAdd() {
    if (showAdd) {
      showAdd = false;
      resetForm();
    } else {
      showAdd = true;
    }
  }

  async function addShare(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!name.trim() || !server.trim() || !exportPath.trim()) {
      formError = "Name, server and export/share are required.";
      return;
    }
    const isCifs = shareType === "cifs";
    const uname = username.trim();
    const dom = domain.trim();
    const req: CreateShareRequest = {
      name: name.trim(),
      share_type: shareType,
      server: server.trim(),
      export_path: exportPath.trim(),
      options: options.trim() || undefined,
      username: isCifs && uname ? uname : undefined,
      // Send the password as typed (it may contain meaningful spaces), but treat
      // a whitespace-only value as "no password".
      password: isCifs && password.trim() ? password : undefined,
      domain: isCifs && dom ? dom : undefined,
    };
    adding = true;
    try {
      const op = await client().createShare(req);
      showAdd = false;
      resetForm();
      const result = await client().pollOperation(op, { attempts: 30 });
      await loadShares();
      // The dialog is already closed, so surface an async failure on the
      // page-level banner rather than letting it vanish silently.
      const failure = operationFailureMessage(result);
      if (failure) error = `Add share failed: ${failure}`;
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

  <h2>Media library</h2>
  <p class="muted lede">
    Upload installer ISOs (offered as VM install media), LXC container-template tarballs
    (selectable when you create a container), and VM disk images (importable into a zvol you can
    attach as a VM disk). Files are stored on the node's local storage.
  </p>
  {#if importResult}<p class="ok">{importResult}</p>{/if}
  {#if libraryError}<p class="error">{libraryError}</p>{/if}
  <div class="grid">
    <div class="card">
      <div class="section-head compact">
        <h3>Install ISOs</h3>
        <label class="upload-btn">
          {uploadingIso ? "Uploading…" : "Upload ISO"}
          <input
            type="file"
            accept=".iso"
            disabled={uploadingIso}
            onchange={(e) => uploadFile("iso", e.currentTarget)}
          />
        </label>
      </div>
      {#if libIsos.length === 0}
        <p class="muted">No uploaded ISOs.</p>
      {:else}
        <table>
          <thead><tr><th>Name</th><th>Size</th><th></th></tr></thead>
          <tbody>
            {#each libIsos as iso (iso.name)}
              <tr>
                <td class="mono">{iso.name}</td>
                <td>{gib(iso.size_bytes)} GiB</td>
                <td class="row-actions">
                  <button onclick={() => removeLibraryFile("iso", iso)}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <div class="card">
      <div class="section-head compact">
        <h3>CT templates</h3>
        <label class="upload-btn">
          {uploadingTemplate ? "Uploading…" : "Upload template"}
          <input
            type="file"
            accept=".tar,.tar.gz,.tgz,.tar.xz,.txz,.tar.zst,.tar.bz2"
            disabled={uploadingTemplate}
            onchange={(e) => uploadFile("template", e.currentTarget)}
          />
        </label>
      </div>
      {#if ctTemplates.length === 0}
        <p class="muted">No uploaded container templates.</p>
      {:else}
        <table>
          <thead><tr><th>Name</th><th>Size</th><th></th></tr></thead>
          <tbody>
            {#each ctTemplates as tmpl (tmpl.name)}
              <tr>
                <td class="mono">{tmpl.name}</td>
                <td>{gib(tmpl.size_bytes)} GiB</td>
                <td class="row-actions">
                  <button onclick={() => removeLibraryFile("template", tmpl)}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <div class="card">
      <div class="section-head compact">
        <h3>Disk images</h3>
        <label class="upload-btn">
          {uploadingDiskImage ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept=".qcow2,.vmdk,.raw,.img,.vdi,.vhd,.vhdx"
            disabled={uploadingDiskImage}
            onchange={(e) => uploadFile("diskimage", e.currentTarget)}
          />
        </label>
      </div>
      {#if diskImages.length === 0}
        <p class="muted">No uploaded disk images.</p>
      {:else}
        <table>
          <thead><tr><th>Name</th><th>Size</th><th></th></tr></thead>
          <tbody>
            {#each diskImages as img (img.name)}
              <tr>
                <td class="mono">{img.name}</td>
                <td>{gib(img.size_bytes)} GiB</td>
                <td class="row-actions">
                  <button class="primary" onclick={() => openImport(img)}>Import</button>
                  <button onclick={() => removeLibraryFile("diskimage", img)}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>

  <div class="section-head">
    <h2>Network shares</h2>
    <button class="primary" onclick={toggleAdd}>
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

{#if importImage}
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && !importing && (importImage = null)}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Import disk image">
      <h2>Import disk image</h2>
      <p class="muted">
        Convert <span class="mono">{importImage.name}</span> into a new ZFS zvol you can attach as a
        VM disk. The target dataset must not already exist.
      </p>
      <form onsubmit={runImport}>
        <label class="field">
          <span>Target dataset</span>
          <input bind:value={importDataset} autocomplete="off" placeholder="tank/vm-imported-disk0" />
        </label>
        <label class="field">
          <span>Size <span class="opt">(GiB, optional — blank auto-detects the image's virtual size)</span></span>
          <input bind:value={importSize} inputmode="numeric" autocomplete="off" placeholder="Auto" />
        </label>
        {#if importError}<p class="error">{importError}</p>{/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (importImage = null)} disabled={importing}>Cancel</button>
          <button type="submit" class="primary" disabled={importing}>
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

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
  .section-head.compact {
    margin-top: 0;
  }
  .upload-btn {
    cursor: pointer;
    background: var(--accent);
    color: #fff;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .upload-btn input {
    display: none;
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
  .ok {
    color: #34d399;
    font-size: 0.85rem;
    margin: 0.2rem 0 0.8rem;
  }
  .row-actions .primary {
    color: var(--fg);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
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
    border: 1px solid var(--border-strong, var(--border));
    border-radius: 14px;
    padding: 1.5rem 1.6rem;
    width: min(460px, 100%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  }
  .dialog h2 {
    margin: 0 0 0.6rem;
  }
  .dialog .field {
    margin-bottom: 0.8rem;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>

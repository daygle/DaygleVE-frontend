<script lang="ts">
  import { tick, onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type {
    Vm,
    IsoImage,
    VmDisk,
    VmNic,
    Firmware,
    Pool,
    Bridge,
    UpdateVmRequest,
    VmSnapshot,
  } from "@daygleve/schema";

  let vm = $state<Vm | null>(null);
  let error = $state<string | null>(null);

  // --- edit settings modal ---
  let showEdit = $state(false);
  let editBusy = $state(false);
  let editError = $state<string | null>(null);
  let pools = $state<Pool[]>([]);
  let bridges = $state<Bridge[]>([]);
  let eName = $state("");
  let eVcpus = $state(1);
  let eMemory = $state(1024);
  let eFirmware = $state<Firmware>("uefi");
  let eDisks = $state<VmDisk[]>([]);
  let eNics = $state<VmNic[]>([]);

  // Install-media (CD-ROM) state.
  let isos = $state<IsoImage[]>([]);
  let selectedIso = $state("");
  let mediaBusy = $state(false);

  // --- clone modal ---
  let showClone = $state(false);
  let cloneName = $state("");
  let cloneFull = $state(false);
  let cloneDesc = $state("");
  let cloneBusy = $state(false);
  let cloneError = $state<string | null>(null);

  // Snapshot state.
  let snapshots = $state<VmSnapshot[]>([]);
  // Monotonic token so only the most recent loadSnapshots() applies its result
  // (guards against concurrent loads — initial effect plus post-mutation reloads
  // — resolving out of order). Not reactive; used only inside loadSnapshots.
  let snapLoadSeq = 0;
  let snapName = $state("");
  let snapDesc = $state("");
  let snapBusy = $state(false);
  let snapError = $state<string | null>(null);

  // noVNC console state.
  let consoleEl = $state<HTMLDivElement>();
  let showConsole = $state(false);
  let consoleStatus = $state("");
  // The RFB client is browser-only and untyped; keep it out of reactive state.
  let rfb: { disconnect: () => void } | null = null;

  const id = $derived($page.params.id ?? "");

  async function reload() {
    try {
      vm = await client().getVm(id);
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  $effect(() => {
    reload();
    // The ISO library is small and node-wide; failure just leaves the picker empty.
    client()
      .listIsos()
      .then((list) => (isos = list))
      .catch(() => {});
    loadSnapshots();
  });

  async function loadSnapshots() {
    // Capture the id and a sequence token this request is for. Navigating to
    // another VM changes `id`, and any newer load bumps the token, so a response
    // that resolves out of order (stale VM, or stale same-VM load) is ignored.
    const reqId = id;
    const seq = ++snapLoadSeq;
    const stale = () => seq !== snapLoadSeq || reqId !== id;
    try {
      const list = await client().listVmSnapshots(reqId);
      if (stale()) return;
      snapshots = list;
      // A clean load clears any stale load error (an empty list is a valid
      // result: a fresh VM, or a host without ZFS, simply has no snapshots).
      if (snapError) snapError = null;
    } catch (e) {
      if (stale()) return;
      // The backend returns an empty list for the "nothing to show" cases, so a
      // thrown error here is a real failure (auth/network/server) worth surfacing
      // rather than silently rendering an empty table.
      snapshots = [];
      snapError = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  async function createSnapshot(e: SubmitEvent) {
    e.preventDefault();
    snapError = null;
    if (!snapName.trim()) {
      snapError = "Snapshot name is required.";
      return;
    }
    snapBusy = true;
    try {
      await client().createVmSnapshot(id, {
        name: snapName.trim(),
        description: snapDesc.trim() || undefined,
      });
      snapName = "";
      snapDesc = "";
      await loadSnapshots();
    } catch (err) {
      snapError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      snapBusy = false;
    }
  }

  async function rollbackSnapshot(name: string) {
    if (!confirm(`Roll ${vm?.name ?? "this VM"} back to snapshot "${name}"? Newer snapshots are discarded, and the VM must be stopped.`)) return;
    snapError = null;
    snapBusy = true;
    try {
      await client().rollbackVmSnapshot(id, name);
      // Rollback with `-r` discards newer snapshots, so refresh the list too.
      await Promise.all([reload(), loadSnapshots()]);
    } catch (err) {
      snapError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      snapBusy = false;
    }
  }

  async function deleteSnapshot(name: string) {
    if (!confirm(`Delete snapshot "${name}"? This cannot be undone.`)) return;
    snapError = null;
    snapBusy = true;
    try {
      await client().deleteVmSnapshot(id, name);
      await loadSnapshots();
    } catch (err) {
      snapError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      snapBusy = false;
    }
  }

  async function attachIso() {
    if (!selectedIso) return;
    mediaBusy = true;
    error = null;
    try {
      await client().updateVm(id, { cdrom: selectedIso, eject_cdrom: false });
      selectedIso = "";
      await reload();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      mediaBusy = false;
    }
  }

  async function ejectIso() {
    mediaBusy = true;
    error = null;
    try {
      await client().updateVm(id, { eject_cdrom: true });
      await reload();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      mediaBusy = false;
    }
  }

  function isoName(path: string): string {
    return isos.find((i) => i.path === path)?.name ?? path;
  }

  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(1)} ${units[i]}`;
  }

  function fmtDate(ts: string): string {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  }

  async function openEdit() {
    if (!vm) return;
    editError = null;
    eName = vm.name;
    eVcpus = vm.vcpus;
    eMemory = vm.memory_mib;
    eFirmware = vm.firmware;
    // Clone so edits don't mutate the displayed VM until saved.
    eDisks = vm.disks.map((d) => ({ ...d }));
    eNics = vm.nics.map((n) => ({ ...n }));
    showEdit = true;
    // Clear first so a failed fetch degrades to empty rather than keeping stale
    // pools/bridges from a previous open (which addDisk/addNic would misuse).
    pools = [];
    bridges = [];
    const c = client();
    const [p, b] = await Promise.allSettled([c.listPools(), c.listBridges()]);
    if (p.status === "fulfilled") pools = p.value;
    if (b.status === "fulfilled") bridges = b.value;
  }

  function addDisk() {
    const pool = pools[0]?.name;
    if (!pool) {
      editError = "No storage pool is available to back a new disk.";
      return;
    }
    const name = eName.trim() || "vm";
    // Pick the lowest index whose dataset name is still free so that deleting an
    // earlier disk and adding another doesn't collide with a name already in use.
    const taken = new Set(eDisks.map((d) => d.dataset));
    let n = 0;
    while (taken.has(`${pool}/${name}-disk${n}`)) n++;
    eDisks = [...eDisks, { dataset: `${pool}/${name}-disk${n}`, size_gib: 20, bus: "virtio" }];
  }
  function removeDisk(i: number) {
    eDisks = eDisks.filter((_, idx) => idx !== i);
  }
  function addNic() {
    const bridge = bridges[0]?.name;
    if (!bridge) {
      editError = "No bridge is available to attach a new NIC.";
      return;
    }
    eNics = [...eNics, { bridge, model: "virtio" }];
  }
  function removeNic(i: number) {
    eNics = eNics.filter((_, idx) => idx !== i);
  }

  async function submitEdit(e: SubmitEvent) {
    e.preventDefault();
    editError = null;
    if (!eName.trim()) return (editError = "Name is required.");
    const req: UpdateVmRequest = {
      name: eName.trim(),
      vcpus: eVcpus,
      memory_mib: eMemory,
      firmware: eFirmware,
      disks: eDisks,
      nics: eNics,
      eject_cdrom: false,
    };
    editBusy = true;
    try {
      await client().updateVm(id, req);
      showEdit = false;
      await reload();
    } catch (err) {
      editError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      editBusy = false;
    }
  }

  // Close a modal on Escape from anywhere (but never mid-save).
  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (showEdit && !editBusy) showEdit = false;
    if (showClone && !cloneBusy) showClone = false;
  }

  function openClone() {
    if (!vm) return;
    cloneError = null;
    cloneName = `${vm.name}-clone`;
    cloneFull = false;
    cloneDesc = "";
    showClone = true;
  }

  async function submitClone(e: SubmitEvent) {
    e.preventDefault();
    cloneError = null;
    if (!cloneName.trim()) {
      cloneError = "Name is required.";
      return;
    }
    cloneBusy = true;
    try {
      const created = await client().cloneVm(id, {
        name: cloneName.trim(),
        full: cloneFull,
        description: cloneDesc.trim() || undefined,
      });
      showClone = false;
      // Jump to the freshly-created clone's detail page.
      await goto(`/vms/${created.id}`);
    } catch (err) {
      cloneError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      cloneBusy = false;
    }
  }

  async function openConsole() {
    error = null;
    try {
      const ticket = await client().vmConsole(id);
      const url = client().consoleWebsocketUrl(ticket.websocket_path);
      showConsole = true;
      consoleStatus = "connecting";
      // Wait for the canvas container to be in the DOM, then mount noVNC. RFB
      // is imported dynamically so it never runs during SSR.
      await tick();
      // Abort if the user closed the console (or navigated away) while the
      // ticket request / dynamic import was still in flight.
      if (!showConsole || !consoleEl) return;
      const { default: RFB } = await import("@novnc/novnc");
      if (!showConsole || !consoleEl) return;
      const client_ = new RFB(consoleEl, url);
      client_.scaleViewport = true;
      client_.addEventListener("connect", () => (consoleStatus = "connected"));
      client_.addEventListener("disconnect", (e: CustomEvent) => {
        consoleStatus = e.detail?.clean ? "disconnected" : "connection lost";
      });
      rfb = client_;
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
      showConsole = false;
    }
  }

  function closeConsole() {
    try {
      rfb?.disconnect();
    } catch {
      // already gone
    }
    rfb = null;
    showConsole = false;
    consoleStatus = "";
  }

  // Ensure the VNC connection is torn down if the user navigates away with the
  // console still open. Reuse closeConsole so an in-flight open (still awaiting
  // tick()/import) also aborts via the showConsole guard, not just an existing
  // connection.
  onDestroy(closeConsole);
</script>

<div class="container">
  <p><a href="/vms">← Virtual Machines</a></p>
  {#if error}<p class="error">{error}</p>{/if}

  {#if vm}
    <div class="head">
      <h1>{vm.name}</h1>
      <StateBadge state={vm.state} />
      <button class="edit-btn" onclick={openEdit}>Edit settings</button>
      <button class="edit-btn" onclick={openClone}>Clone</button>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Compute</h3>
        <dl>
          <dt>vCPUs</dt><dd>{vm.vcpus}</dd>
          <dt>Memory</dt><dd>{(vm.memory_mib / 1024).toFixed(1)} GiB</dd>
          <dt>Firmware</dt><dd>{vm.firmware.toUpperCase()}</dd>
        </dl>
      </div>
      <div class="card">
        <h3>Disks</h3>
        {#if vm.disks.length}
          <ul>
            {#each vm.disks as disk, i (i)}
              <li>{disk.dataset} · {disk.size_gib} GiB · {disk.bus}</li>
            {/each}
          </ul>
        {:else}<p class="muted">None</p>{/if}
      </div>
      <div class="card">
        <h3>Network</h3>
        {#if vm.nics.length}
          <ul>
            {#each vm.nics as nic, i (i)}
              <li>{nic.bridge}{nic.vlan ? ` · VLAN ${nic.vlan}` : ""} · {nic.model}</li>
            {/each}
          </ul>
        {:else}<p class="muted">None</p>{/if}
      </div>
      <div class="card">
        <h3>Install media</h3>
        {#if vm.cdrom}
          <p class="media-current">
            <span class="disc">●</span>
            {isoName(vm.cdrom)}
          </p>
          <button onclick={ejectIso} disabled={mediaBusy}>
            {mediaBusy ? "Working…" : "Eject"}
          </button>
          <p class="muted small">The VM boots from this ISO first. Eject once the OS is installed.</p>
        {:else}
          <p class="muted">No install media attached.</p>
          <div class="media-attach">
            <select bind:value={selectedIso} disabled={mediaBusy || isos.length === 0}>
              <option value="">{isos.length ? "Choose an ISO…" : "No ISOs in library"}</option>
              {#each isos as iso (iso.path)}
                <option value={iso.path}>{iso.name} · {iso.storage}</option>
              {/each}
            </select>
            <button onclick={attachIso} disabled={mediaBusy || !selectedIso}>
              {mediaBusy ? "Working…" : "Attach"}
            </button>
          </div>
          <p class="muted small">
            Attaching an ISO and starting the VM lets you install a guest OS onto the disk.
          </p>
        {/if}
      </div>
      <div class="card console-card">
        <div class="console-head">
          <h3>Console</h3>
          {#if showConsole}
            <span class="muted">{consoleStatus}</span>
            <button onclick={closeConsole}>Close</button>
          {:else}
            <button class="primary" onclick={openConsole}>Open console</button>
          {/if}
        </div>
        {#if showConsole}
          <div class="console-view" bind:this={consoleEl}></div>
          <p class="muted">Live VNC · noVNC over a one-time ticket</p>
        {:else}
          <p class="muted">Opens a live noVNC session to the VM's display.</p>
        {/if}
      </div>
    </div>

    <div class="card snapshots-card">
      <h3>Snapshots</h3>
      {#if snapError}<p class="error">{snapError}</p>{/if}
      <form class="snap-form" onsubmit={createSnapshot}>
        <input
          bind:value={snapName}
          placeholder="Snapshot name"
          aria-label="Snapshot name"
          autocomplete="off"
        />
        <input
          class="grow"
          bind:value={snapDesc}
          placeholder="Description (optional)"
          aria-label="Snapshot description (optional)"
          autocomplete="off"
        />
        <button type="submit" class="primary" disabled={snapBusy}>
          {snapBusy ? "Working…" : "Take snapshot"}
        </button>
      </form>
      {#if snapshots.length}
        <table class="snap-table">
          <thead>
            <tr><th>Name</th><th>Size</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {#each snapshots as snap (snap.name)}
              <tr>
                <td>
                  <span class="snap-name">{snap.name}</span>
                  {#if snap.description}<span class="muted snap-desc">{snap.description}</span>{/if}
                </td>
                <td>{fmtBytes(snap.used_bytes)}</td>
                <td class="muted">{fmtDate(snap.created_at)}</td>
                <td class="snap-actions">
                  <button type="button" onclick={() => rollbackSnapshot(snap.name)} disabled={snapBusy}>
                    Rollback
                  </button>
                  <button
                    type="button"
                    class="del"
                    onclick={() => deleteSnapshot(snap.name)}
                    disabled={snapBusy}
                    aria-label="Delete snapshot">×</button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if !snapError}
        <p class="muted">No snapshots yet.</p>
      {/if}
      <p class="muted small">
        A snapshot captures all of the VM's disks at once. Rollback discards newer snapshots and
        requires the VM to be stopped.
      </p>
    </div>
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</div>

<svelte:window onkeydown={onWindowKeydown} />

{#if showEdit}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && !editBusy && (showEdit = false)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Edit VM settings">
      <h2>Edit settings</h2>
      <p class="muted small">Firmware, disk and NIC changes require the VM to be stopped.</p>
      <form onsubmit={submitEdit}>
        <div class="form-grid">
          <label class="field"><span>Name</span><input bind:value={eName} autocomplete="off" /></label>
          <label class="field"><span>Firmware</span>
            <select bind:value={eFirmware}>
              <option value="uefi">UEFI</option>
              <option value="bios">BIOS</option>
            </select>
          </label>
          <label class="field"><span>vCPUs</span><input type="number" min="1" bind:value={eVcpus} /></label>
          <label class="field"><span>Memory (MiB)</span><input type="number" min="1" step="128" bind:value={eMemory} /></label>
        </div>

        <div class="sub-head"><h3>Disks</h3><button type="button" class="add" onclick={addDisk}>+ Add</button></div>
        {#each eDisks as disk, i (disk)}
          <div class="row">
            <input class="grow" bind:value={disk.dataset} placeholder="pool/dataset" />
            <input type="number" min="1" bind:value={disk.size_gib} title="Size (GiB)" />
            <select bind:value={disk.bus}>
              <option value="virtio">VirtIO</option>
              <option value="scsi">SCSI</option>
              <option value="sata">SATA</option>
            </select>
            <button type="button" class="del" onclick={() => removeDisk(i)} aria-label="Remove disk">×</button>
          </div>
        {:else}<p class="muted small">No disks.</p>{/each}

        <div class="sub-head"><h3>Network</h3><button type="button" class="add" onclick={addNic}>+ Add</button></div>
        {#each eNics as nic, i (nic)}
          <div class="row">
            <select class="grow" bind:value={nic.bridge}>
              {#each bridges as b (b.id)}<option value={b.name}>{b.name}</option>{/each}
              {#if bridges.length === 0}<option value={nic.bridge}>{nic.bridge}</option>{/if}
            </select>
            <select bind:value={nic.model}>
              <option value="virtio">VirtIO</option>
              <option value="e1000">e1000</option>
              <option value="rtl8139">RTL8139</option>
            </select>
            <button type="button" class="del" onclick={() => removeNic(i)} aria-label="Remove NIC">×</button>
          </div>
        {:else}<p class="muted small">No NICs.</p>{/each}

        {#if editError}<p class="error">{editError}</p>{/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (showEdit = false)} disabled={editBusy}>Cancel</button>
          <button type="submit" class="primary" disabled={editBusy}>{editBusy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showClone}
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && !cloneBusy && (showClone = false)}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Clone VM">
      <h2>Clone VM</h2>
      <p class="muted small">
        Creates a new stopped VM whose disks are ZFS clones of this one, with fresh network MAC
        addresses. GPU passthrough and install media are not carried over.
      </p>
      <form onsubmit={submitClone}>
        <label class="field">
          <span>New VM name</span>
          <input bind:value={cloneName} autocomplete="off" aria-label="New VM name" />
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={cloneFull} />
          <span>Full clone (independent copy — promotes the cloned disks)</span>
        </label>
        <label class="field">
          <span>Description (optional)</span>
          <input bind:value={cloneDesc} autocomplete="off" aria-label="Description (optional)" />
        </label>
        {#if cloneError}<p class="error">{cloneError}</p>{/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (showClone = false)} disabled={cloneBusy}>Cancel</button>
          <button type="submit" class="primary" disabled={cloneBusy}>
            {cloneBusy ? "Cloning…" : "Clone"}
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
  /* Push the button group to the right; only the first needs the auto margin. */
  .head .edit-btn:first-of-type {
    margin-left: auto;
  }
  .edit-btn:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
  .dialog .small {
    font-size: 0.8rem;
    margin: 0.2rem 0 0.8rem;
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
    margin: 0 0 0.2rem;
  }
  .form-grid {
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
  .field span {
    color: var(--muted);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.8rem 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .check input {
    width: auto;
  }
  .sub-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 1.2rem 0 0.5rem;
  }
  .sub-head h3 {
    margin: 0;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .add {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }
  .row .grow {
    flex: 1;
    min-width: 0;
  }
  .row input[type="number"] {
    width: 80px;
  }
  .del {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 6px;
    width: 32px;
    flex: none;
  }
  .del:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1.3rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 1rem;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  ul {
    margin: 0;
    padding-left: 1rem;
    font-size: 0.9rem;
  }
  .console-card {
    grid-column: 1 / -1;
  }
  .console-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .console-head h3 {
    margin: 0;
    flex: 1;
  }
  .console-view {
    margin-top: 0.75rem;
    width: 100%;
    height: 480px;
    background: #000;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .media-current {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.9rem;
    margin: 0 0 0.6rem;
  }
  .media-current .disc {
    color: var(--accent);
    font-size: 0.7rem;
  }
  .media-attach {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .media-attach select {
    flex: 1;
  }
  .small {
    font-size: 0.8rem;
    margin: 0.6rem 0 0;
  }
  .snapshots-card {
    margin-top: 1rem;
  }
  .snap-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.8rem;
    flex-wrap: wrap;
  }
  .snap-form .grow {
    flex: 1;
    min-width: 12rem;
  }
  .snap-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  .snap-table th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.3rem 0.6rem 0.3rem 0;
    border-bottom: 1px solid var(--border);
  }
  .snap-table td {
    padding: 0.4rem 0.6rem 0.4rem 0;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .snap-name {
    font-family: var(--mono, monospace);
  }
  .snap-desc {
    display: block;
    font-size: 0.8rem;
  }
  .snap-actions {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
  }
</style>

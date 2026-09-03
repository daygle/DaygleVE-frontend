<script lang="ts">
  import { tick, onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type {
    Vm,
    IsoImage,
    VmDisk,
    VmNic,
    DiskBus,
    NicModel,
    Firmware,
    Pool,
    Bridge,
    UpdateVmRequest,
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
  });

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
    const c = client();
    const [p, b] = await Promise.allSettled([c.listPools(), c.listBridges()]);
    if (p.status === "fulfilled") pools = p.value;
    if (b.status === "fulfilled") bridges = b.value;
  }

  function addDisk() {
    const pool = pools[0]?.name ?? "tank";
    eDisks = [...eDisks, { dataset: `${pool}/${eName}-disk${eDisks.length}`, size_gib: 20, bus: "virtio" }];
  }
  function removeDisk(i: number) {
    eDisks = eDisks.filter((_, idx) => idx !== i);
  }
  function addNic() {
    const bridge = bridges[0]?.name ?? "";
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
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</div>

{#if showEdit}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showEdit = false)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Edit VM settings">
      <h2>Edit settings</h2>
      <p class="muted small">Firmware, disk and NIC changes require the VM to be stopped.</p>
      <form onsubmit={submitEdit}>
        <div class="grid">
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
        {#each eDisks as disk, i (i)}
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
        {#each eNics as nic, i (i)}
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

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .edit-btn {
    margin-left: auto;
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.35rem 0.7rem;
    border-radius: 8px;
    font-size: 0.85rem;
  }
  .edit-btn:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
  .small {
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
  .grid {
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
</style>

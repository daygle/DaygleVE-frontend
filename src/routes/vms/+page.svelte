<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type {
    VmSummary,
    VmPowerAction,
    Pool,
    Bridge,
    IsoImage,
    DiskBus,
    NicModel,
    Firmware,
    CreateVmRequest,
  } from "@daygleve/schema";

  let vms = $state<VmSummary[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  // --- create form state ---
  let showCreate = $state(false);
  let pools = $state<Pool[]>([]);
  let bridges = $state<Bridge[]>([]);
  let isos = $state<IsoImage[]>([]);
  let creating = $state(false);
  let formError = $state<string | null>(null);

  // form fields
  let name = $state("");
  let vcpus = $state(2);
  let memoryMib = $state(2048);
  let firmware = $state<Firmware>("uefi");
  let pool = $state("");
  let diskSizeGib = $state(20);
  let diskBus = $state<DiskBus>("virtio");
  let bridge = $state("");
  let nicModel = $state<NicModel>("virtio");
  let cdrom = $state(""); // "" = no install media
  let startAfter = $state(true);

  async function load() {
    loading = true;
    try {
      vms = await client().listVms();
      error = null;
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function power(id: string, action: VmPowerAction) {
    try {
      await client().powerVm(id, { action });
      await load();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  async function openCreate() {
    showCreate = true;
    formError = null;
    const c = client();
    // Populate dropdowns; failures are non-fatal (the fields degrade to empty).
    const [p, b, i] = await Promise.allSettled([c.listPools(), c.listBridges(), c.listIsos()]);
    if (p.status === "fulfilled") {
      pools = p.value;
      if (!pool && pools.length) pool = pools[0].name;
    }
    if (b.status === "fulfilled") bridges = b.value;
    if (i.status === "fulfilled") isos = i.value;
  }

  function closeCreate() {
    showCreate = false;
  }

  async function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    formError = null;

    if (!name.trim()) {
      formError = "Name is required.";
      return;
    }
    if (!pool) {
      formError = "Choose a storage pool for the boot disk.";
      return;
    }

    const req: CreateVmRequest = {
      name: name.trim(),
      vcpus,
      memory_mib: memoryMib,
      firmware,
      disks: [
        {
          dataset: `${pool}/${name.trim()}-disk0`,
          size_gib: diskSizeGib,
          bus: diskBus,
        },
      ],
      nics: bridge ? [{ bridge, model: nicModel }] : [],
      cdrom: cdrom || undefined,
      start: startAfter,
    };

    creating = true;
    try {
      await client().createVm(req);
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
    vcpus = 2;
    memoryMib = 2048;
    firmware = "uefi";
    diskSizeGib = 20;
    diskBus = "virtio";
    nicModel = "virtio";
    cdrom = "";
    startAfter = true;
  }

  function fmtSize(bytes: number): string {
    const gib = bytes / 1024 ** 3;
    if (gib >= 1) return `${gib.toFixed(1)} GiB`;
    return `${(bytes / 1024 ** 2).toFixed(0)} MiB`;
  }

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="head">
    <h1>Virtual Machines</h1>
    <button class="primary" onclick={openCreate}>New VM</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="card">
    {#if loading}
      <p class="muted">Loading…</p>
    {:else if vms.length === 0}
      <p class="muted">No virtual machines yet.</p>
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
          {#each vms as vm (vm.id)}
            <tr>
              <td><a href={`/vms/${vm.id}`}>{vm.name}</a></td>
              <td><StateBadge state={vm.state} /></td>
              <td>{vm.vcpus}</td>
              <td>{(vm.memory_mib / 1024).toFixed(1)} GiB</td>
              <td class="actions">
                {#if vm.state === "running"}
                  <button onclick={() => power(vm.id, "shutdown")}>Shutdown</button>
                {:else}
                  <button onclick={() => power(vm.id, "start")}>Start</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

{#if showCreate}
  <div
    class="overlay"
    role="button"
    tabindex="-1"
    onclick={closeCreate}
    onkeydown={(e) => e.key === "Escape" && closeCreate()}
  >
    <!-- Stop propagation so clicks inside the dialog don't dismiss it. -->
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Create virtual machine"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2>New Virtual Machine</h2>
      <form onsubmit={submitCreate}>
        <div class="grid">
          <label class="field">
            <span>Name</span>
            <input bind:value={name} placeholder="web01" autocomplete="off" />
          </label>

          <label class="field">
            <span>Firmware</span>
            <select bind:value={firmware}>
              <option value="uefi">UEFI (OVMF)</option>
              <option value="bios">BIOS (SeaBIOS)</option>
            </select>
          </label>

          <label class="field">
            <span>vCPUs</span>
            <input type="number" min="1" bind:value={vcpus} />
          </label>

          <label class="field">
            <span>Memory (MiB)</span>
            <input type="number" min="1" step="128" bind:value={memoryMib} />
          </label>
        </div>

        <h3>Boot disk</h3>
        <div class="grid">
          <label class="field">
            <span>Pool</span>
            <select bind:value={pool}>
              {#if pools.length === 0}
                <option value="" disabled>No pools available</option>
              {/if}
              {#each pools as p (p.name)}
                <option value={p.name}>{p.name}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Size (GiB)</span>
            <input type="number" min="1" bind:value={diskSizeGib} />
          </label>
          <label class="field">
            <span>Bus</span>
            <select bind:value={diskBus}>
              <option value="virtio">VirtIO</option>
              <option value="scsi">SCSI</option>
              <option value="sata">SATA</option>
            </select>
          </label>
        </div>

        <h3>Network</h3>
        <div class="grid">
          <label class="field">
            <span>Bridge</span>
            <select bind:value={bridge}>
              <option value="">None</option>
              {#each bridges as b (b.id)}
                <option value={b.name}>{b.name}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Model</span>
            <select bind:value={nicModel} disabled={!bridge}>
              <option value="virtio">VirtIO</option>
              <option value="e1000">e1000</option>
              <option value="rtl8139">RTL8139</option>
            </select>
          </label>
        </div>

        <h3>Install media</h3>
        <label class="field">
          <span>Install ISO</span>
          <select bind:value={cdrom}>
            <option value="">None (boot from disk)</option>
            {#each isos as iso (iso.path)}
              <option value={iso.path}>{iso.name} · {fmtSize(iso.size_bytes)}</option>
            {/each}
          </select>
        </label>
        {#if isos.length === 0}
          <p class="hint">
            No ISOs found in the node's library. Drop images into the ISO directory
            (<code>DAYGLEVE_ISO_DIR</code>, default <code>/var/lib/daygleve/isos</code>) to
            install a guest OS. You can still create the VM and attach media later.
          </p>
        {:else}
          <p class="hint">
            With an ISO attached the VM boots from it first so you can install a guest OS,
            then falls back to the disk. Eject it from the VM's page once installed.
          </p>
        {/if}

        <label class="check">
          <input type="checkbox" bind:checked={startAfter} />
          <span>Start immediately after creation</span>
        </label>

        {#if formError}<p class="error">{formError}</p>{/if}

        <div class="dialog-actions">
          <button type="button" onclick={closeCreate} disabled={creating}>Cancel</button>
          <button type="submit" class="primary" disabled={creating}>
            {creating ? "Creating…" : "Create VM"}
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
  .dialog h3 {
    margin: 1.3rem 0 0.6rem;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
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
  .field span {
    color: var(--muted);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.1rem;
    font-size: 0.9rem;
  }
  .check input {
    width: auto;
  }
  .hint {
    margin: 0.6rem 0 0;
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

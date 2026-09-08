<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError, operationFailureMessage } from "$lib/api";
  import { parseTags } from "$lib/tags";
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
    DisplayProtocol,
    CreateVmRequest,
    UsbDevice,
    PciDevice,
    ResourcePoolSummary,
  } from "@daygleve/schema";

  let vms = $state<VmSummary[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  // --- create form state ---
  let showCreate = $state(false);
  let pools = $state<Pool[]>([]);
  let resourcePools = $state<ResourcePoolSummary[]>([]);
  let bridges = $state<Bridge[]>([]);
  let isos = $state<IsoImage[]>([]);
  let usbDevices = $state<UsbDevice[]>([]);
  // Selected USB devices, keyed "vendor:product".
  let selectedUsb = $state<string[]>([]);
  let pciDevices = $state<PciDevice[]>([]);
  // Selected PCI devices, keyed by pci_address.
  let selectedPci = $state<string[]>([]);
  let bindingPci = $state<string | null>(null);
  let creating = $state(false);
  let formError = $state<string | null>(null);

  // form fields
  let name = $state("");
  let vcpus = $state(2);
  let memoryMib = $state(2048);
  let firmware = $state<Firmware>("uefi");
  let display = $state<DisplayProtocol>("vnc");
  let tagsInput = $state("");
  let pool = $state("");
  let resourcePool = $state(""); // organizational pool ("" = none)
  let diskSizeGib = $state(20);
  let diskBus = $state<DiskBus>("virtio");
  let bridge = $state("");
  let nicModel = $state<NicModel>("virtio");
  let cdrom = $state(""); // "" = no install media
  let startAfter = $state(true);
  let asTemplate = $state(false); // create as a clone-only template
  let autostart = $state(false); // start on host boot
  let startupOrder = $state<number | null>(null); // lower starts first

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
    const [p, b, i, u, pci, rp] = await Promise.allSettled([
      c.listPools(),
      c.listBridges(),
      c.listIsos(),
      c.listUsbDevices(),
      c.listPciDevices(),
      c.listResourcePools(),
    ]);
    if (p.status === "fulfilled") {
      pools = p.value;
      if (!pool && pools.length) pool = pools[0].name;
    }
    if (b.status === "fulfilled") bridges = b.value;
    if (i.status === "fulfilled") isos = i.value;
    if (u.status === "fulfilled") usbDevices = u.value;
    if (pci.status === "fulfilled") pciDevices = pci.value;
    if (rp.status === "fulfilled") resourcePools = rp.value;
  }

  // Bind a PCI device to vfio-pci so it becomes available for passthrough,
  // then refresh the inventory to reflect its new availability.
  async function bindPci(pciAddress: string) {
    bindingPci = pciAddress;
    formError = null;
    try {
      await client().bindPciDevice(pciAddress, { force: false });
      pciDevices = await client().listPciDevices();
    } catch (e) {
      formError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      bindingPci = null;
    }
  }

  function closeCreate() {
    showCreate = false;
  }

  // Close on Escape from anywhere while the modal is open (works regardless of
  // which element inside the dialog has focus).
  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && showCreate) closeCreate();
  }

  // Dismiss only when the backdrop itself is clicked, not the dialog contents -
  // so the dialog needs no click/key handler of its own to stop propagation.
  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closeCreate();
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
      display,
      disks: [
        {
          dataset: `${pool}/${name.trim()}-disk0`,
          size_gib: diskSizeGib,
          bus: diskBus,
        },
      ],
      nics: bridge ? [{ bridge, model: nicModel }] : [],
      usb_devices: selectedUsb.map((key) => {
        const [vendor_id, product_id] = key.split(":");
        return { vendor_id, product_id };
      }),
      pci_devices: selectedPci.map((pci_address) => ({ pci_address })),
      cdrom: cdrom || undefined,
      // A template is never powered on, so it can't also be started or autostarted.
      start: asTemplate ? false : startAfter,
      template: asTemplate,
      autostart: asTemplate ? false : autostart,
      startup_order: !asTemplate && autostart && startupOrder != null ? startupOrder : undefined,
      tags: parseTags(tagsInput),
      pool: resourcePool || undefined,
    };

    creating = true;
    try {
      const op = await client().createVm(req);
      showCreate = false;
      resetForm();
      const result = await client().pollOperation(op);
      await load();
      // The dialog is already closed, so surface an async failure on the
      // page-level banner rather than letting it vanish silently.
      const failure = operationFailureMessage(result);
      if (failure) error = `Create VM failed: ${failure}`;
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
    display = "vnc";
    tagsInput = "";
    resourcePool = "";
    diskSizeGib = 20;
    diskBus = "virtio";
    nicModel = "virtio";
    cdrom = "";
    startAfter = true;
    asTemplate = false;
    autostart = false;
    startupOrder = null;
    selectedUsb = [];
    selectedPci = [];
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
              <td>
                <a href={`/vms/${vm.id}`}>{vm.name}</a>
                {#if vm.template}<span class="tag" title="Clone-only template">Template</span>{/if}
                {#if vm.autostart && !vm.template}<span class="tag muted-tag" title="Starts on host boot">Autostart</span>{/if}
                {#if vm.tags}{#each vm.tags as t (t)}<span class="tag org-tag">{t}</span>{/each}{/if}
              </td>
              <td><StateBadge state={vm.state} /></td>
              <td>{vm.vcpus}</td>
              <td>{(vm.memory_mib / 1024).toFixed(1)} GiB</td>
              <td class="actions">
                {#if vm.template}
                  <span class="muted">-</span>
                {:else if vm.state === "running"}
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

<svelte:window onkeydown={onWindowKeydown} />

{#if showCreate}
  <!-- Backdrop: a click on it (but not on the dialog) dismisses the modal;
       Escape is handled on the window above so the dialog needs no key handler. -->
  <div class="overlay" role="presentation" onclick={onOverlayClick}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Create virtual machine">
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
            <span>Display</span>
            <select bind:value={display}>
              <option value="vnc">VNC (in-browser console)</option>
              <option value="spice">SPICE (remote-viewer)</option>
            </select>
          </label>

          <label class="field">
            <span>Tags <span class="opt">(comma-separated)</span></span>
            <input bind:value={tagsInput} placeholder="prod, web, env:staging" autocomplete="off" />
          </label>

          <label class="field">
            <span>Resource pool <span class="opt">(optional)</span></span>
            <select bind:value={resourcePool}>
              <option value="">None</option>
              {#each resourcePools as rp (rp.id)}
                <option value={rp.name}>{rp.name}</option>
              {/each}
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
              <option value={iso.path}>{iso.name} · {iso.storage} · {fmtSize(iso.size_bytes)}</option>
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

        <h3>USB passthrough</h3>
        {#if usbDevices.length === 0}
          <p class="hint">No host USB devices detected (or none on this dev host).</p>
        {:else}
          <div class="usb-list">
            {#each usbDevices as dev (dev.vendor_id + ":" + dev.product_id)}
              {@const key = dev.vendor_id + ":" + dev.product_id}
              <label class="check">
                <input type="checkbox" value={key} bind:group={selectedUsb} />
                <span>{dev.description} <span class="muted">({key})</span></span>
              </label>
            {/each}
          </div>
          <p class="hint">
            Passed-through devices are matched by USB vendor:product, so a device stays
            attached across replug. The guest gets exclusive access while running.
          </p>
        {/if}

        <h3>PCI passthrough</h3>
        {#if pciDevices.length === 0}
          <p class="hint">No attachable PCI devices detected (or none on this dev host).</p>
        {:else}
          <div class="usb-list">
            {#each pciDevices as dev (dev.pci_address)}
              <div class="pci-row">
                <label class="check">
                  <input
                    type="checkbox"
                    value={dev.pci_address}
                    bind:group={selectedPci}
                    disabled={!dev.available}
                  />
                  <span>
                    <strong>{dev.class}</strong> · {dev.vendor} · {dev.pci_id}
                    <span class="muted">({dev.pci_address}, IOMMU {dev.iommu_group})</span>
                  </span>
                </label>
                {#if dev.available}
                  <span class="tag muted-tag">vfio-bound</span>
                {:else}
                  <button
                    type="button"
                    class="add"
                    onclick={() => bindPci(dev.pci_address)}
                    disabled={bindingPci === dev.pci_address}
                  >
                    {bindingPci === dev.pci_address ? "Binding…" : "Bind for passthrough"}
                  </button>
                {/if}
              </div>
            {/each}
          </div>
          <p class="hint">
            A device must be bound to <code>vfio-pci</code> before it can be attached.
            All functions in an IOMMU group are passed through together. Display
            adapters are managed on the GPU passthrough flow, not here.
          </p>
        {/if}

        <h3>Boot &amp; provisioning</h3>
        <label class="check">
          <input type="checkbox" bind:checked={asTemplate} />
          <span>Create as a template (clone-only golden image; cannot be powered on)</span>
        </label>
        {#if !asTemplate}
          <label class="check">
            <input type="checkbox" bind:checked={startAfter} />
            <span>Start immediately after creation</span>
          </label>
          <label class="check">
            <input type="checkbox" bind:checked={autostart} />
            <span>Start automatically on host boot</span>
          </label>
          {#if autostart}
            <label class="field">
              <span>Startup order <span class="muted">(optional; lower starts first)</span></span>
              <input type="number" min="0" bind:value={startupOrder} placeholder="e.g. 10" />
            </label>
          {/if}
        {:else}
          <p class="hint">
            A template is never started. Create it, then use <em>New VM → clone</em> from
            this template to spin up runnable copies.
          </p>
        {/if}

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
  .field .opt {
    opacity: 0.7;
    font-size: 0.75rem;
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
  .usb-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.4rem;
  }
  .pci-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .pci-row .check {
    flex: 1;
    min-width: 0;
  }
  .tag {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.05rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-radius: 4px;
    background: var(--brand-cyan, #2b6cb0);
    color: #fff;
    vertical-align: middle;
  }
  .tag.muted-tag {
    background: rgba(255, 255, 255, 0.12);
    color: var(--muted);
  }
  .tag.org-tag {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
    background: var(--panel-2, rgba(255, 255, 255, 0.06));
    color: var(--muted);
    border: 1px solid var(--border);
  }
</style>

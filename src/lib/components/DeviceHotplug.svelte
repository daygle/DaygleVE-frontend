<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type {
    PciAssignment,
    PciDevice,
    UsbAssignment,
    UsbDevice,
    Vm,
  } from "@daygleve/schema";

  let { vm, onChanged }: { vm: Vm; onChanged?: (vm: Vm) => void } = $props();

  let usbInventory = $state<UsbDevice[]>([]);
  let pciInventory = $state<PciDevice[]>([]);
  let usbChoice = $state("");
  let pciChoice = $state("");
  let loading = $state(true);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let warning = $state<string | null>(null);

  const assignedUsb = $derived(vm.usb_devices ?? []);
  const assignedPci = $derived(vm.pci_devices ?? []);

  function message(e: unknown): string {
    return e instanceof ApiRequestError ? e.body.message : String(e);
  }

  async function loadInventory() {
    loading = true;
    error = null;
    try {
      const [usb, pci] = await Promise.all([
        client().listUsbDevices(),
        client().listPciDevices(),
      ]);
      usbInventory = usb;
      pciInventory = pci;
      if (usbChoice && !usb.some((device) => usbKey(device) === usbChoice)) usbChoice = "";
      if (pciChoice && !pci.some((device) => device.pci_address === pciChoice)) pciChoice = "";
    } catch (e) {
      error = message(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    vm.id;
    loadInventory();
  });

  function usbKey(device: UsbDevice | UsbAssignment): string {
    return `${device.vendor_id}:${device.product_id}`;
  }

  function usbDescription(key: string): string {
    return usbInventory.find((device) => usbKey(device) === key)?.description ?? key;
  }

  function isUsbAssigned(key: string): boolean {
    return assignedUsb.some((device) => usbKey(device) === key);
  }

  function isPciAssigned(address: string): boolean {
    return assignedPci.some((device) => device.pci_address.toLowerCase() === address.toLowerCase());
  }

  async function attachUsb(e: SubmitEvent) {
    e.preventDefault();
    if (!usbChoice) return;
    busy = true;
    error = null;
    warning = null;
    try {
      const [vendor_id, product_id] = usbChoice.split(":");
      const updated = await client().attachVmUsbDevice(vm.id, { vendor_id, product_id });
      onChanged?.(updated);
      usbChoice = "";
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }

  async function detachUsb(device: UsbAssignment) {
    if (!confirm(`Detach USB device ${usbKey(device)} from ${vm.name}?`)) return;
    busy = true;
    error = null;
    warning = null;
    try {
      const updated = await client().detachVmUsbDevice(vm.id, device.vendor_id, device.product_id);
      onChanged?.(updated);
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }

  async function attachPci(e: SubmitEvent) {
    e.preventDefault();
    if (!pciChoice) return;
    busy = true;
    error = null;
    warning = null;
    try {
      const result = await client().attachVmPciDeviceWithWarning(vm.id, {
        pci_address: pciChoice,
      });
      onChanged?.(result.vm);
      warning = result.warning ?? null;
      pciChoice = "";
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }

  async function detachPci(device: PciAssignment) {
    if (!confirm(`Detach PCI device ${device.pci_address} from ${vm.name}?`)) return;
    busy = true;
    error = null;
    warning = null;
    try {
      const updated = await client().detachVmPciDevice(vm.id, device.pci_address);
      onChanged?.(updated);
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }

  function pciLabel(device: PciDevice): string {
    return `${device.class} · ${device.vendor} · ${device.pci_id}`;
  }
</script>

<div class="card hotplug-card">
  <div class="card-head">
    <div>
      <h3>Passthrough devices</h3>
      <p class="muted small">Attach or detach host devices without editing the VM definition.</p>
    </div>
    <button type="button" onclick={loadInventory} disabled={loading || busy}>
      {loading ? "Loading…" : "Refresh"}
    </button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}
  {#if warning}
    <p class="warning" role="alert">
      <strong>IOMMU group warning:</strong> {warning}
    </p>
  {/if}

  <section class="device-section" aria-labelledby="usb-heading">
    <div class="section-head">
      <h4 id="usb-heading">USB</h4>
      <span class="muted">{assignedUsb.length} attached</span>
    </div>
    {#if assignedUsb.length}
      <ul class="device-list">
        {#each assignedUsb as device (usbKey(device))}
          <li>
            <span>{usbDescription(usbKey(device))} <code>{usbKey(device)}</code></span>
            <button type="button" class="danger" onclick={() => detachUsb(device)} disabled={busy}>
              Detach
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted small">No USB devices attached.</p>
    {/if}

    <form class="attach-form" onsubmit={attachUsb}>
      <select bind:value={usbChoice} disabled={loading || busy} aria-label="USB device to attach">
        <option value="">Choose a host USB device…</option>
        {#each usbInventory as device (usbKey(device))}
          {@const key = usbKey(device)}
          <option value={key} disabled={isUsbAssigned(key)}>
            {device.description} · {key}{isUsbAssigned(key) ? " (attached)" : ""}
          </option>
        {/each}
      </select>
      <button type="submit" class="primary" disabled={!usbChoice || loading || busy}>
        Attach USB
      </button>
    </form>
    {#if !loading && usbInventory.length === 0}
      <p class="muted small">No host USB devices were detected.</p>
    {/if}
  </section>

  <section class="device-section" aria-labelledby="pci-heading">
    <div class="section-head">
      <h4 id="pci-heading">PCI</h4>
      <span class="muted">{assignedPci.length} attached</span>
    </div>
    {#if assignedPci.length}
      <ul class="device-list">
        {#each assignedPci as device (device.pci_address)}
          <li>
            <span><code>{device.pci_address}</code></span>
            <button type="button" class="danger" onclick={() => detachPci(device)} disabled={busy}>
              Detach
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted small">No PCI devices attached.</p>
    {/if}

    <form class="attach-form" onsubmit={attachPci}>
      <select bind:value={pciChoice} disabled={loading || busy} aria-label="PCI device to attach">
        <option value="">Choose a host PCI device…</option>
        {#each pciInventory as device (device.pci_address)}
          <option value={device.pci_address} disabled={!device.available || isPciAssigned(device.pci_address)}>
            {pciLabel(device)} · {device.pci_address} · IOMMU {device.iommu_group}
            {#if isPciAssigned(device.pci_address)} (attached){:else if !device.available} (bind vfio-pci first){/if}
          </option>
        {/each}
      </select>
      <button type="submit" class="primary" disabled={!pciChoice || loading || busy}>
        Attach PCI
      </button>
    </form>
    {#if !loading && pciInventory.length === 0}
      <p class="muted small">No attachable PCI devices were detected.</p>
    {:else}
      <p class="muted small">
        PCI devices must be bound to <code>vfio-pci</code>. All functions in an IOMMU group should
        be assigned together; the backend warns if another VM already owns a function in the group.
      </p>
    {/if}
  </section>
</div>

<style>
  .hotplug-card {
    margin-top: 1rem;
  }
  .card-head,
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .card-head h3,
  .section-head h4 {
    margin: 0;
  }
  .section-head {
    margin-bottom: 0.5rem;
  }
  .device-section + .device-section {
    margin-top: 1.3rem;
    padding-top: 1.1rem;
    border-top: 1px solid var(--border);
  }
  .device-list {
    list-style: none;
    padding: 0;
    margin: 0 0 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .device-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 7px;
  }
  .device-list li > span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .attach-form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .attach-form select {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 0.8rem;
  }
  .warning {
    margin: 0.75rem 0;
    padding: 0.65rem 0.8rem;
    border: 1px solid #b7791f;
    border-radius: 7px;
    color: #f6c453;
    background: rgba(183, 121, 31, 0.12);
    line-height: 1.4;
  }
  .danger {
    color: var(--danger, #e26d6d);
  }
  code {
    font-family: var(--mono, monospace);
    font-size: 0.85em;
  }
  @media (max-width: 640px) {
    .attach-form {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>

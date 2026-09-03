<script lang="ts">
  import { tick, onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type { Vm, IsoImage } from "@daygleve/schema";

  let vm = $state<Vm | null>(null);
  let error = $state<string | null>(null);

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

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
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

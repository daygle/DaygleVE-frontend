<script lang="ts">
  import { tick, onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type { Vm } from "@daygleve/schema";

  let vm = $state<Vm | null>(null);
  let error = $state<string | null>(null);

  // noVNC console state.
  let consoleEl = $state<HTMLDivElement>();
  let showConsole = $state(false);
  let consoleStatus = $state("");
  // The RFB client is browser-only and untyped; keep it out of reactive state.
  let rfb: { disconnect: () => void } | null = null;

  const id = $derived($page.params.id ?? "");

  $effect(() => {
    client()
      .getVm(id)
      .then((v) => (vm = v))
      .catch((e) => (error = e instanceof ApiRequestError ? e.body.message : String(e)));
  });

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
      if (!consoleEl) throw new Error("console container is not ready");
      const { default: RFB } = await import("@novnc/novnc");
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
  // console still open, rather than leaking the websocket + RFB client.
  onDestroy(() => {
    try {
      rfb?.disconnect();
    } catch {
      // already gone
    }
  });
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
</style>

<script lang="ts">
  import { page } from "$app/stores";
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type { Vm, ConsoleTicket } from "@daygleve/schema";

  let vm = $state<Vm | null>(null);
  let error = $state<string | null>(null);
  let ticket = $state<ConsoleTicket | null>(null);

  const id = $derived($page.params.id ?? "");

  $effect(() => {
    client()
      .getVm(id)
      .then((v) => (vm = v))
      .catch((e) => (error = e instanceof ApiRequestError ? e.body.message : String(e)));
  });

  async function openConsole() {
    try {
      ticket = await client().vmConsole(id);
      // TODO(console): mount noVNC against ticket.websocket_path + ticket.ticket.
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }
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
        <h3>Console</h3>
        <button class="primary" onclick={openConsole}>Open console</button>
        {#if ticket}
          <p class="muted">Ticket issued for {ticket.websocket_path}</p>
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
</style>

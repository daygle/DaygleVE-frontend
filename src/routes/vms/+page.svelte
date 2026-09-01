<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type { VmSummary, VmPowerAction } from "@daygleve/schema";

  let vms = $state<VmSummary[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

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

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="head">
    <h1>Virtual Machines</h1>
    <button class="primary">New VM</button>
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
</style>

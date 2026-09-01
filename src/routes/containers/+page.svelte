<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import StateBadge from "$components/StateBadge.svelte";
  import type { LxcSummary, LxcPowerAction } from "@daygleve/schema";

  let containers = $state<LxcSummary[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load() {
    loading = true;
    try {
      containers = await client().listContainers();
      error = null;
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function power(id: string, action: LxcPowerAction) {
    try {
      await client().powerContainer(id, { action });
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
    <h1>Containers</h1>
    <button class="primary">New container</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="card">
    {#if loading}
      <p class="muted">Loading…</p>
    {:else if containers.length === 0}
      <p class="muted">No containers yet.</p>
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
          {#each containers as ct (ct.id)}
            <tr>
              <td>{ct.name}</td>
              <td><StateBadge state={ct.state} /></td>
              <td>{ct.vcpus}</td>
              <td>{(ct.memory_mib / 1024).toFixed(1)} GiB</td>
              <td class="actions">
                {#if ct.state === "running"}
                  <button onclick={() => power(ct.id, "stop")}>Stop</button>
                {:else}
                  <button onclick={() => power(ct.id, "start")}>Start</button>
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

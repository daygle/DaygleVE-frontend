<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type { Pool, Dataset } from "@daygleve/schema";

  let pools = $state<Pool[]>([]);
  let datasets = $state<Dataset[]>([]);
  let error = $state<string | null>(null);

  function pct(p: Pool): number {
    return p.size_bytes ? Math.round((p.allocated_bytes / p.size_bytes) * 100) : 0;
  }
  function gib(bytes: number): string {
    return (bytes / 1024 ** 3).toFixed(1);
  }

  $effect(() => {
    const c = client();
    Promise.all([c.listPools(), c.listDatasets()])
      .then(([p, d]) => {
        pools = p;
        datasets = d;
      })
      .catch((e) => (error = e instanceof ApiRequestError ? e.body.message : String(e)));
  });
</script>

<div class="container">
  <h1>Storage</h1>
  {#if error}<p class="error">{error}</p>{/if}

  <h2>Pools</h2>
  <div class="grid">
    {#each pools as pool (pool.name)}
      <div class="card">
        <h3>{pool.name}</h3>
        <p class="muted">{pool.health}</p>
        <div class="bar"><span style="width: {pct(pool)}%"></span></div>
        <p class="muted">{gib(pool.allocated_bytes)} / {gib(pool.size_bytes)} GiB</p>
      </div>
    {:else}
      <p class="muted">No pools found.</p>
    {/each}
  </div>

  <h2>Datasets</h2>
  <div class="card">
    {#if datasets.length === 0}
      <p class="muted">No datasets.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th>Kind</th><th>Used</th><th>Compression</th></tr>
        </thead>
        <tbody>
          {#each datasets as ds (ds.id)}
            <tr>
              <td>{ds.name}</td>
              <td>{ds.kind}</td>
              <td>{gib(ds.used_bytes)} GiB</td>
              <td>{ds.compression}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .bar {
    height: 8px;
    border-radius: 999px;
    background: var(--panel-2);
    overflow: hidden;
    margin: 0.4rem 0;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
</style>

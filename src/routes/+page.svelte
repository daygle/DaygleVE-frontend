<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type { VmSummary, LxcSummary, Pool, NodeMetrics } from "@daygleve/schema";

  let vms = $state<VmSummary[]>([]);
  let containers = $state<LxcSummary[]>([]);
  let pools = $state<Pool[]>([]);
  let node = $state<NodeMetrics | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const c = client();
    Promise.all([c.listVms(), c.listContainers(), c.listPools(), c.nodeMetrics()])
      .then(([v, ct, p, n]) => {
        vms = v;
        containers = ct;
        pools = p;
        node = n;
      })
      .catch((e) => {
        error = e instanceof ApiRequestError ? e.body.message : String(e);
      });
  });

  const running = (arr: { state: string }[]) =>
    arr.filter((x) => x.state === "running").length;
</script>

<div class="container">
  <h1>Dashboard</h1>
  {#if error}<p class="error">{error}</p>{/if}

  <div class="grid">
    <div class="card">
      <h3>Virtual Machines</h3>
      <p class="stat">{running(vms)}<span class="muted"> / {vms.length} running</span></p>
      <a href="/vms">Manage →</a>
    </div>
    <div class="card">
      <h3>Containers</h3>
      <p class="stat">
        {running(containers)}<span class="muted"> / {containers.length} running</span>
      </p>
      <a href="/containers">Manage →</a>
    </div>
    <div class="card">
      <h3>Storage Pools</h3>
      <p class="stat">{pools.length}</p>
      <a href="/storage">Manage →</a>
    </div>
    <div class="card">
      <h3>Node CPU</h3>
      <p class="stat">
        {node ? node.cpu_pct.toFixed(0) : "—"}<span class="muted">%</span>
      </p>
      <a href="/metrics">Metrics →</a>
    </div>
  </div>
</div>

<style>
  .stat {
    font-size: 1.8rem;
    font-weight: 700;
    margin: 0.3rem 0 0.6rem;
  }
  .stat .muted {
    font-size: 0.9rem;
    font-weight: 400;
  }
</style>

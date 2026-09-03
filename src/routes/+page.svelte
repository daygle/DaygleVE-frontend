<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import Icon from "$components/Icon.svelte";
  import Gauge from "$components/Gauge.svelte";
  import type {
    VmSummary,
    LxcSummary,
    Pool,
    Bridge,
    NodeMetrics,
  } from "@daygleve/schema";

  let vms = $state<VmSummary[]>([]);
  let containers = $state<LxcSummary[]>([]);
  let pools = $state<Pool[]>([]);
  let bridges = $state<Bridge[]>([]);
  let node = $state<NodeMetrics | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const c = client();
    Promise.all([
      c.listVms(),
      c.listContainers(),
      c.listPools(),
      c.listBridges(),
      c.nodeMetrics(),
    ])
      .then(([v, ct, p, b, n]) => {
        vms = v;
        containers = ct;
        pools = p;
        bridges = b;
        node = n;
      })
      .catch((e) => {
        error = e instanceof ApiRequestError ? e.body.message : String(e);
      });
  });

  const running = (arr: { state: string }[]) =>
    arr.filter((x) => x.state === "running").length;

  const memPct = $derived(
    node && node.memory_total_bytes
      ? (node.memory_used_bytes / node.memory_total_bytes) * 100
      : 0,
  );
  const gib = (b: number) => (b / 1024 ** 3).toFixed(1);

  function uptime(secs: number): string {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const cards = $derived([
    { icon: "vm", label: "Virtual Machines", value: running(vms), sub: `of ${vms.length}`, href: "/vms" },
    { icon: "container", label: "Containers", value: running(containers), sub: `of ${containers.length}`, href: "/containers" },
    { icon: "storage", label: "Storage Pools", value: pools.length, sub: "online", href: "/storage" },
    { icon: "network", label: "Bridges", value: bridges.length, sub: "configured", href: "/network" },
  ]);
</script>

<div class="container">
  <div class="section-head">
    <h1>Dashboard</h1>
    {#if node}
      <span class="pill ok">● node online · up {uptime(node.uptime_seconds)}</span>
    {/if}
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="stat-grid">
    {#each cards as c (c.label)}
      <a class="card interactive stat-card" href={c.href}>
        <span class="chip"><Icon name={c.icon} /></span>
        <div class="body">
          <span class="label">{c.label}</span>
          <span class="value">{c.value}<span class="sub"> {c.sub}</span></span>
        </div>
        <span class="go"><Icon name="metrics" size={16} /></span>
      </a>
    {/each}
  </div>

  <div class="node-card card">
    <div class="node-head">
      <h2>Node</h2>
      <a href="/metrics" class="muted small">Live metrics →</a>
    </div>
    <div class="node-body">
      <Gauge value={node?.cpu_pct ?? 0} label="CPU" sub={node ? `${node.cpu_count} vCPU` : ""} />
      <Gauge value={memPct} label="Memory" sub={node ? `${gib(node.memory_used_bytes)}/${gib(node.memory_total_bytes)} GiB` : ""} />
      <div class="facts">
        <div class="fact">
          <span class="k">Load average</span>
          <span class="v">{node ? node.load_average.map((l) => l.toFixed(2)).join("  ") : "—"}</span>
        </div>
        <div class="fact">
          <span class="k">Swap</span>
          <span class="v">
            {#if !node}—
            {:else if node.swap_total_bytes}{gib(node.swap_used_bytes)} / {gib(node.swap_total_bytes)} GiB
            {:else}none{/if}
          </span>
        </div>
        <div class="fact">
          <span class="k">Network</span>
          <span class="v">↓ {node ? gib(node.net_rx_bps) : "—"} · ↑ {node ? gib(node.net_tx_bps) : "—"} GiB/s</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .stat-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    margin-bottom: 1.25rem;
  }
  .stat-card {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
  .chip {
    width: 42px;
    height: 42px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    color: var(--brand-cyan);
    background: color-mix(in srgb, var(--brand-cyan) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--brand-cyan) 25%, transparent);
    flex: none;
  }
  .body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .label {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 500;
  }
  .value {
    font-size: 1.7rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .value .sub {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--muted);
  }
  .go {
    color: var(--faint);
  }
  .node-card {
    padding: 1.4rem 1.5rem;
  }
  .node-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .node-body {
    display: flex;
    align-items: center;
    gap: 2.5rem;
    flex-wrap: wrap;
  }
  .facts {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    flex: 1;
    min-width: 220px;
  }
  .fact {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .fact .k {
    font-size: 0.72rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .fact .v {
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
  }
</style>

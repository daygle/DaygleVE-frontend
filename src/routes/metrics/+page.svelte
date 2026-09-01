<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type { NodeMetrics } from "@daygleve/schema";

  let node = $state<NodeMetrics | null>(null);
  let error = $state<string | null>(null);

  function gib(bytes: number): string {
    return (bytes / 1024 ** 3).toFixed(1);
  }

  // The backend also exposes a Server-Sent Events stream at
  // `client().metricsStreamUrl()` emitting `MetricsEvent` frames. EventSource
  // cannot set an Authorization header, so live streaming needs a token-in-
  // query or cookie scheme on the backend (TODO). Until then we poll the
  // point-in-time endpoint, which uses the bearer header like every other call.
  $effect(() => {
    const c = client();
    let cancelled = false;

    async function tick() {
      try {
        const n = await c.nodeMetrics();
        if (!cancelled) {
          node = n;
          error = null;
        }
      } catch (e) {
        if (!cancelled)
          error = e instanceof ApiRequestError ? e.body.message : String(e);
      }
    }

    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  });

  const memPct = $derived(
    node && node.memory_total_bytes
      ? Math.round((node.memory_used_bytes / node.memory_total_bytes) * 100)
      : 0,
  );
</script>

<div class="container">
  <h1>Metrics</h1>
  {#if error}<p class="error">{error}</p>{/if}

  {#if node}
    <div class="grid">
      <div class="card">
        <h3>CPU</h3>
        <p class="stat">{node.cpu_pct.toFixed(0)}<span class="muted">%</span></p>
        <p class="muted">{node.cpu_count} logical CPUs</p>
        <p class="muted">load {node.load_average.map((l) => l.toFixed(2)).join(" / ")}</p>
      </div>
      <div class="card">
        <h3>Memory</h3>
        <p class="stat">{memPct}<span class="muted">%</span></p>
        <p class="muted">{gib(node.memory_used_bytes)} / {gib(node.memory_total_bytes)} GiB</p>
      </div>
      <div class="card">
        <h3>Disk I/O</h3>
        <p class="muted">read {gib(node.disk_read_bps)} GiB/s</p>
        <p class="muted">write {gib(node.disk_write_bps)} GiB/s</p>
      </div>
      <div class="card">
        <h3>Network</h3>
        <p class="muted">rx {gib(node.net_rx_bps)} GiB/s</p>
        <p class="muted">tx {gib(node.net_tx_bps)} GiB/s</p>
      </div>
    </div>
    <p class="muted">Sampled {node.timestamp} · refreshing every 2s</p>
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</div>

<style>
  .stat {
    font-size: 2rem;
    font-weight: 700;
    margin: 0.2rem 0;
  }
  .stat .muted {
    font-size: 1rem;
    font-weight: 400;
  }
</style>

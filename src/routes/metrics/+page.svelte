<script lang="ts">
  import { browser } from "$app/environment";
  import { client } from "$lib/api/session";
  import type { MetricsEvent, NodeMetrics } from "@daygleve/schema";

  let node = $state<NodeMetrics | null>(null);
  let error = $state<string | null>(null);
  let live = $state(false);

  function gib(bytes: number): string {
    return (bytes / 1024 ** 3).toFixed(1);
  }

  // Live node metrics via the backend's Server-Sent Events stream. The bearer
  // token rides in the URL (EventSource can't set headers); the backend
  // authenticates it there. EventSource reconnects on its own, so a transient
  // drop just clears the "live" badge until the next frame arrives.
  $effect(() => {
    if (!browser) return;
    const source = new EventSource(client().metricsStreamUrl());

    source.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data) as MetricsEvent;
        if (frame.scope === "node" && frame.node) {
          node = frame.node;
          error = null;
          live = true;
        }
      } catch {
        // Ignore an unparseable frame; the next one will refresh the view.
      }
    };
    source.onerror = () => {
      // Browser will retry automatically; surface a soft, non-fatal notice.
      live = false;
      if (!node) error = "Connecting to the metrics stream…";
    };

    return () => source.close();
  });

  const memPct = $derived(
    node && node.memory_total_bytes
      ? Math.round((node.memory_used_bytes / node.memory_total_bytes) * 100)
      : 0,
  );
</script>

<div class="container">
  <div class="head">
    <h1>Metrics</h1>
    <span class="pill" class:on={live}>{live ? "● live" : "○ connecting"}</span>
  </div>
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
    <p class="muted">Sampled {node.timestamp} · live via SSE</p>
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
  .pill {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .pill.on {
    color: var(--ok);
    border-color: var(--ok);
  }
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

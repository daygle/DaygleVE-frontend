<script lang="ts">
  import { browser } from "$app/environment";
  import { client } from "$lib/api/session";
  import Gauge from "$components/Gauge.svelte";
  import Sparkline from "$components/Sparkline.svelte";
  import type { MetricsEvent, NodeMetrics } from "@daygleve/schema";

  let node = $state<NodeMetrics | null>(null);
  let error = $state<string | null>(null);
  let live = $state(false);

  // Rolling history for the sparklines (most recent last).
  const CAP = 48;
  let cpuHist = $state<number[]>([]);
  let memHist = $state<number[]>([]);
  let netHist = $state<number[]>([]);
  let diskHist = $state<number[]>([]);

  const push = (arr: number[], v: number) =>
    [...arr, v].slice(-CAP);

  function gib(bytes: number): string {
    return (bytes / 1024 ** 3).toFixed(2);
  }
  const memPct = $derived(
    node && node.memory_total_bytes
      ? (node.memory_used_bytes / node.memory_total_bytes) * 100
      : 0,
  );

  $effect(() => {
    if (!browser) return;
    const source = new EventSource(client().metricsStreamUrl());

    source.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data) as MetricsEvent;
        if (frame.scope === "node" && frame.node) {
          const n = frame.node;
          node = n;
          error = null;
          live = true;
          cpuHist = push(cpuHist, n.cpu_pct);
          memHist = push(
            memHist,
            n.memory_total_bytes ? (n.memory_used_bytes / n.memory_total_bytes) * 100 : 0,
          );
          netHist = push(netHist, n.net_rx_bps + n.net_tx_bps);
          diskHist = push(diskHist, n.disk_read_bps + n.disk_write_bps);
        }
      } catch {
        // Ignore an unparseable frame; the next one refreshes the view.
      }
    };
    source.onerror = () => {
      live = false;
      if (!node) error = "Connecting to the metrics stream…";
    };

    return () => source.close();
  });
</script>

<div class="container">
  <div class="section-head">
    <h1>Metrics</h1>
    <span class="pill" class:ok={live}>{live ? "● live" : "○ connecting"}</span>
  </div>

  {#if error && !node}<p class="error">{error}</p>{/if}

  <div class="grid-2">
    <div class="card gauge-card">
      <h3>Processor</h3>
      <Gauge value={node?.cpu_pct ?? 0} sub={node ? `${node.cpu_count} vCPU` : ""} size={150} />
      <div class="under">
        <Sparkline data={cpuHist} color="var(--brand-cyan)" />
        <span class="muted small">load {node ? node.load_average.map((l) => l.toFixed(2)).join(" / ") : "—"}</span>
      </div>
    </div>

    <div class="card gauge-card">
      <h3>Memory</h3>
      <Gauge value={memPct} size={150} />
      <div class="under">
        <Sparkline data={memHist} color="var(--brand-violet)" />
        <span class="muted small">
          {node ? `${gib(node.memory_used_bytes)} / ${gib(node.memory_total_bytes)} GiB` : "—"}
          {#if node && node.swap_total_bytes}· swap {gib(node.swap_used_bytes)} GiB{/if}
        </span>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card io-card">
      <h3>Network I/O</h3>
      <div class="io-vals">
        <span class="io"><em class="dot rx"></em>↓ {node ? gib(node.net_rx_bps) : "—"} <span class="muted">GiB/s</span></span>
        <span class="io"><em class="dot tx"></em>↑ {node ? gib(node.net_tx_bps) : "—"} <span class="muted">GiB/s</span></span>
      </div>
      <Sparkline data={netHist} color="var(--brand-indigo)" height={56} />
    </div>

    <div class="card io-card">
      <h3>Disk I/O</h3>
      <div class="io-vals">
        <span class="io"><em class="dot rx"></em>read {node ? gib(node.disk_read_bps) : "—"} <span class="muted">GiB/s</span></span>
        <span class="io"><em class="dot tx"></em>write {node ? gib(node.disk_write_bps) : "—"} <span class="muted">GiB/s</span></span>
      </div>
      <Sparkline data={diskHist} color="var(--ok)" height={56} />
    </div>
  </div>

  {#if node}
    <p class="muted small ts">Sampled {new Date(node.timestamp).toLocaleTimeString()} · streaming live over SSE</p>
  {/if}
</div>

<style>
  .grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .gauge-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.4rem;
  }
  .gauge-card h3 {
    align-self: flex-start;
  }
  .under {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    align-items: center;
  }
  .small {
    font-size: 0.82rem;
  }
  .io-card {
    padding: 1.4rem;
  }
  .io-vals {
    display: flex;
    gap: 1.5rem;
    margin: 0.3rem 0 0.9rem;
    font-size: 1.05rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .io {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .io .muted {
    font-size: 0.8rem;
    font-weight: 400;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .dot.rx {
    background: var(--brand-indigo);
  }
  .dot.tx {
    background: var(--brand-cyan);
  }
  .ts {
    margin-top: 0.5rem;
  }
</style>

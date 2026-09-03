<script module lang="ts">
  // Deterministic per-instance gradient ids (creation order), so no random
  // value differs between renders.
  let counter = 0;
</script>

<script lang="ts">
  // Compact history line with a soft gradient fill. Scales to the data's own
  // min/max so small variations stay visible. Purely decorative → aria-hidden.
  let {
    data,
    color = "var(--brand-cyan)",
    height = 40,
  }: { data: number[]; color?: string; height?: number } = $props();

  const W = 100;
  const H = 36;

  const pts = $derived.by(() => {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const step = W / (data.length - 1);
    return data
      .map((d, i) => {
        const x = i * step;
        const y = H - 3 - ((d - min) / span) * (H - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });

  const area = $derived(pts ? `0,${H} ${pts} ${W},${H}` : "");
  const uid = `sl${(counter += 1)}`;
</script>

<svg
  class="spark"
  viewBox="0 0 {W} {H}"
  preserveAspectRatio="none"
  style="height: {height}px"
  aria-hidden="true"
>
  {#if pts}
    <defs>
      <linearGradient id="fill-{uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color={color} stop-opacity="0.28" />
        <stop offset="1" stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    <polygon points={area} fill="url(#fill-{uid})" />
    <polyline
      points={pts}
      fill="none"
      stroke={color}
      stroke-width="1.6"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  {/if}
</svg>

<style>
  .spark {
    display: block;
    width: 100%;
  }
</style>

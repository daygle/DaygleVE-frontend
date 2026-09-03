<script lang="ts">
  // Radial donut gauge for a 0–100 percentage. Colour shifts from brand cyan to
  // amber to red as the value climbs, so a glance conveys headroom. Accessible:
  // exposes the value via role/aria on the wrapper.
  let {
    value,
    label = "",
    sub = "",
    size = 132,
    showLabel = true,
  }: {
    value: number;
    label?: string;
    sub?: string;
    size?: number;
    // When false, `label` still names the gauge for screen readers but the
    // visible caption is hidden (e.g. under a card heading that already names it).
    showLabel?: boolean;
  } = $props();

  const v = $derived(Math.max(0, Math.min(100, value)));
  const R = 42;
  const C = 2 * Math.PI * R;
  const offset = $derived(C * (1 - v / 100));
  const color = $derived(v >= 90 ? "var(--danger)" : v >= 75 ? "var(--warn)" : "var(--brand-cyan)");
</script>

<div
  class="gauge"
  role="img"
  aria-label={`${label ? label + ": " : ""}${Math.round(v)} percent`}
>
  <svg viewBox="0 0 100 100" width={size} height={size}>
    <circle cx="50" cy="50" r={R} fill="none" stroke="var(--border)" stroke-width="9" />
    <circle
      cx="50"
      cy="50"
      r={R}
      fill="none"
      stroke={color}
      stroke-width="9"
      stroke-linecap="round"
      stroke-dasharray={C}
      stroke-dashoffset={offset}
      transform="rotate(-90 50 50)"
      style="transition: stroke-dashoffset .5s var(--ease), stroke .3s var(--ease)"
    />
    <text x="50" y="49" text-anchor="middle" class="val" style="fill: {color}">
      {Math.round(v)}<tspan class="pct">%</tspan>
    </text>
    {#if sub}
      <text x="50" y="64" text-anchor="middle" class="sub">{sub}</text>
    {/if}
  </svg>
  {#if label && showLabel}<span class="cap">{label}</span>{/if}
</div>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .val {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }
  .pct {
    font-size: 0.75rem;
    font-weight: 600;
  }
  .sub {
    font-size: 0.42rem;
    fill: var(--muted);
    letter-spacing: 0.02em;
  }
  .cap {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
</style>

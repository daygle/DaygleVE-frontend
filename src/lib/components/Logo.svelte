<script lang="ts">
  // DaygleVE logomark: an isometric cube "partitioned into isolated instances"
  // with a trailing spawn-node motif. Rendered inline (no extra network
  // request). The mark keeps its fixed brand colors; the optional wordmark
  // uses the theme's text token. When the wordmark is shown the mark is hidden
  // from assistive tech so "DaygleVE" is not announced twice.
  let {
    size = 28,
    wordmark = false,
    nodes = true,
  }: { size?: number; wordmark?: boolean; nodes?: boolean } = $props();
</script>

<span class="logo" style="--sz: {size}px">
  <svg
    class="mark"
    viewBox="0 0 64 64"
    width={size}
    height={size}
    role={wordmark ? undefined : "img"}
    aria-label={wordmark ? undefined : "DaygleVE"}
    aria-hidden={wordmark ? "true" : undefined}
  >
    {#if nodes}
      <polygon points="41.80,22.00 46.00,19.90 50.20,22.00 46.00,24.10" fill="#22D3EE" opacity="0.95" />
      <polygon points="49.26,17.00 52.20,15.53 55.14,17.00 52.20,18.47" fill="#67E8F9" opacity="0.72" />
      <polygon points="56.51,12.00 58.40,11.05 60.29,12.00 58.40,12.95" fill="#A5F3FC" opacity="0.5" />
    {/if}
    <polygon points="25.00,19.19 37.66,26.50 25.00,33.81 12.34,26.50" fill="#22D3EE" />
    <polygon points="11.31,28.29 23.97,35.59 23.97,50.22 11.31,42.91" fill="#6366F1" />
    <polygon points="26.03,35.59 38.69,28.29 38.69,42.91 26.03,50.22" fill="#7C3AED" />
  </svg>
  {#if wordmark}
    <span class="word">Daygle<span class="ve">VE</span></span>
  {/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    line-height: 1;
  }
  .mark {
    display: block;
    flex: none;
  }
  .word {
    font-weight: 800;
    letter-spacing: -0.01em;
    font-size: calc(var(--sz) * 0.72);
    color: var(--fg);
  }
  .ve {
    color: var(--brand-cyan, #22d3ee);
  }
</style>

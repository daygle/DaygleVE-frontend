<script lang="ts">
  import type { VmState, LxcState } from "@daygleve/schema";

  // A small coloured pill for a guest lifecycle state. Accepts either a VM or
  // LXC state (their string unions overlap on the values that matter here).
  let { state }: { state: VmState | LxcState } = $props();

  const color = $derived(
    state === "running"
      ? "var(--ok)"
      : state === "error"
        ? "var(--danger)"
        : state === "paused" || state === "frozen"
          ? "var(--warn)"
          : "var(--muted)",
  );
</script>

<span class="badge" style="--c: {color}">{state}</span>

<style>
  .badge {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
  }
</style>

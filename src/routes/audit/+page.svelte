<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type { AuditEvent } from "@daygleve/schema";

  let events = $state<AuditEvent[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let filter = $state("");

  async function load() {
    loading = true;
    error = null;
    try {
      events = await client().listAudit(500);
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  // Case-insensitive substring match across the human-visible columns.
  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.actor, e.action, e.resource_type, e.resource_id, e.message, e.source_ip]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(q)),
    );
  });

  function fmt(ts: string): string {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  }
</script>

<div class="head">
  <h1>Audit log</h1>
  <div class="tools">
    <input bind:value={filter} placeholder="Filter…" aria-label="Filter audit events" />
    <button onclick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
  </div>
</div>
<p class="muted lede">
  Security-relevant control-plane actions — sign-ins, account and role changes, API-token and TLS
  operations — most recent first.
</p>

{#if error}<p class="error">{error}</p>{/if}

{#if !loading && events.length === 0}
  <p class="muted">No audit events recorded yet.</p>
{:else}
  <div class="scroll">
    <table>
      <thead>
        <tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Result</th><th>Detail</th><th>Source</th></tr>
      </thead>
      <tbody>
        {#each shown as e (e.id)}
          <tr>
            <td class="nowrap">{fmt(e.at)}</td>
            <td>{e.actor}</td>
            <td class="mono">{e.action}</td>
            <td class="mono faint">
              {e.resource_type ? `${e.resource_type}${e.resource_id ? ` ${e.resource_id}` : ""}` : "—"}
            </td>
            <td>
              <span class="pill pill-{e.outcome}">{e.outcome}</span>
            </td>
            <td class="detail">{e.message ?? "—"}</td>
            <td class="mono faint">{e.source_ip ?? "—"}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if filter.trim() && shown.length === 0}
    <p class="muted">No events match “{filter}”.</p>
  {/if}
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .tools {
    display: flex;
    gap: 0.5rem;
  }
  .tools input {
    font: inherit;
    padding: 0.35rem 0.55rem;
    background: var(--bg-2, rgba(0, 0, 0, 0.2));
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
  }
  .tools button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .lede {
    margin: 0.2rem 0 1rem;
    max-width: 70ch;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.83rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  th {
    color: var(--muted);
    font-weight: 600;
    white-space: nowrap;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
  }
  .nowrap {
    white-space: nowrap;
  }
  .detail {
    max-width: 32ch;
  }
  .pill {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    text-transform: capitalize;
  }
  .pill-success {
    color: #34d399;
    border-color: #34d39955;
  }
  .pill-failure {
    color: #f87171;
    border-color: #f8717155;
  }
</style>

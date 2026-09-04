<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type { OperationRecord, OperationStatus } from "@daygleve/schema";

  let operations = $state<OperationRecord[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  const statusLabel: Record<OperationStatus, string> = {
    queued: "Queued",
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    needs_review: "Needs review",
    cancelled: "Cancelled",
  };

  function messageFor(operation: OperationRecord): string {
    return operation.error ?? operation.message ?? "—";
  }

  async function load() {
    loading = true;
    try {
      operations = await client().listOperations();
      error = null;
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="section-head">
    <div>
      <h1>Operations</h1>
      <p class="muted lede">
        Durable records for host changes. An operation marked <strong>Needs review</strong>
        was interrupted before the backend could record its outcome.
      </p>
    </div>
    <button onclick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="card">
    {#if loading && operations.length === 0}
      <p class="muted">Loading operation history…</p>
    {:else if operations.length === 0}
      <p class="muted">No host operations have been recorded.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Resource</th>
              <th>Status</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {#each operations as operation (operation.id)}
              <tr class:review={operation.status === "needs_review"}>
                <td>
                  <strong>{operation.kind}</strong>
                  <span class="mono faint">{operation.id}</span>
                </td>
                <td>
                  {operation.resource_type ?? "—"}
                  {#if operation.resource_id}<span class="mono faint">{operation.resource_id}</span>{/if}
                </td>
                <td><span class="status status-{operation.status}">{statusLabel[operation.status]}</span></td>
                <td class="faint">{operation.started_at?.slice(0, 19).replace("T", " ") ?? "—"}</td>
                <td class="faint">{operation.finished_at?.slice(0, 19).replace("T", " ") ?? "—"}</td>
                <td class:error-detail={operation.status === "failed"}>{messageFor(operation)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .section-head {
    align-items: flex-start;
    justify-content: space-between;
  }
  .section-head > div {
    min-width: 0;
  }
  .section-head h1 {
    margin-bottom: 0.35rem;
  }
  .lede {
    margin: 0;
    max-width: 70ch;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    min-width: 780px;
  }
  td:first-child,
  td:nth-child(2) {
    display: table-cell;
  }
  td:first-child strong,
  td:first-child .mono,
  td:nth-child(2) .mono {
    display: block;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    overflow-wrap: anywhere;
  }
  .status {
    display: inline-block;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    padding: 0.16rem 0.55rem;
    font-size: 0.76rem;
    white-space: nowrap;
  }
  .status-succeeded {
    color: var(--ok);
    border-color: color-mix(in srgb, var(--ok) 45%, transparent);
  }
  .status-running,
  .status-queued {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .status-failed,
  .status-needs_review {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 55%, transparent);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }
  .status-cancelled {
    color: var(--muted);
  }
  tr.review {
    background: color-mix(in srgb, var(--danger) 7%, transparent);
  }
  .error-detail {
    color: var(--danger);
  }
</style>

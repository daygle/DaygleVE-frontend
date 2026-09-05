<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type {
    BackupArtifact,
    BackupPlan,
    BackupSourceType,
    CreateBackupPlanRequest,
    OperationRecord,
  } from "@daygleve/schema";

  let plans = $state<BackupPlan[]>([]);
  let artifacts = $state<BackupArtifact[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let showCreate = $state(false);
  let saving = $state(false);

  let name = $state("");
  let sourceType = $state<BackupSourceType>("dataset");
  let sourceId = $state("");
  let destination = $state("default");
  let intervalMinutes = $state(0);
  let retention = $state(7);
  let verify = $state(true);
  let enabled = $state(true);

  function message(e: unknown): string {
    return e instanceof ApiRequestError ? e.body.message : String(e);
  }

  async function load() {
    loading = true;
    try {
      const c = client();
      [plans, artifacts] = await Promise.all([c.listBackupPlans(), c.listBackupArtifacts()]);
      error = null;
    } catch (e) {
      error = message(e);
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    name = "";
    sourceType = "dataset";
    sourceId = "";
    destination = "default";
    intervalMinutes = 0;
    retention = 7;
    verify = true;
    enabled = true;
    formError = null;
  }

  async function createPlan(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!name.trim() || !sourceId.trim()) {
      formError = "Name and source are required.";
      return;
    }
    if (intervalMinutes !== 0 && intervalMinutes < 1) {
      formError = "Scheduled backups must run at least every minute.";
      return;
    }
    const req: CreateBackupPlanRequest = {
      name: name.trim(),
      source_type: sourceType,
      source_id: sourceId.trim(),
      destination: destination.trim() || "default",
      interval_secs: intervalMinutes > 0 ? intervalMinutes * 60 : undefined,
      retention_count: retention,
      verify,
      enabled,
    };
    saving = true;
    try {
      await client().createBackupPlan(req);
      showCreate = false;
      resetForm();
      await load();
    } catch (e) {
      formError = message(e);
    } finally {
      saving = false;
    }
  }

  async function run(plan: BackupPlan) {
    try {
      const op = await client().runBackupPlan(plan.id);
      await poll(op);
      await load();
    } catch (e) {
      error = message(e);
    }
  }

  async function poll(op: OperationRecord) {
    const c = client();
    for (let i = 0; i < 120; i++) {
      const record = await c.getOperation(op.id);
      if (["succeeded", "failed", "needs_review"].includes(record.status)) return record;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return op;
  }

  async function toggle(plan: BackupPlan) {
    try {
      await client().updateBackupPlan(plan.id, { enabled: !plan.enabled });
      await load();
    } catch (e) {
      error = message(e);
    }
  }

  async function remove(plan: BackupPlan) {
    if (!confirm(`Delete backup plan "${plan.name}"? Existing artifacts will be retained.`)) return;
    try {
      await client().deleteBackupPlan(plan.id);
      await load();
    } catch (e) {
      error = message(e);
    }
  }

  async function restore(artifact: BackupArtifact) {
    const target = prompt(
      `Restore ${artifact.source_id} to which dataset? Leave blank to use the original source.`,
      artifact.source_id,
    );
    if (target === null) return;
    const force = confirm("Replace the target dataset if it already exists? This is destructive.");
    try {
      const op = await client().restoreBackup(artifact.id, {
        target_id: target.trim() || undefined,
        force,
      });
      await poll(op);
      await load();
    } catch (e) {
      error = message(e);
    }
  }

  function size(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
    return `${(bytes / 1024 ** 2).toFixed(0)} MiB`;
  }

  function interval(plan: BackupPlan): string {
    if (!plan.interval_secs) return "Manual";
    if (plan.interval_secs % 3600 === 0) return `Every ${plan.interval_secs / 3600}h`;
    return `Every ${Math.round(plan.interval_secs / 60)}m`;
  }

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="head">
    <div>
      <h1>Backups</h1>
      <p class="muted lede">
        Local ZFS send-stream backups below <code>DAYGLEVE_BACKUP_DIR</code>. Every artifact is
        checksum-verified before it can be restored.
      </p>
    </div>
    <button class="primary" onclick={() => (showCreate = true)}>New backup plan</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <h2>Plans</h2>
  <div class="card">
    {#if loading && plans.length === 0}
      <p class="muted">Loading backup plans…</p>
    {:else if plans.length === 0}
      <p class="muted">No backup plans configured.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Source</th><th>Schedule</th><th>Retention</th><th>State</th><th></th></tr></thead>
          <tbody>
            {#each plans as plan (plan.id)}
              <tr>
                <td><strong>{plan.name}</strong><span class="mono faint">{plan.destination}</span></td>
                <td><span class="pill">{plan.source_type}</span><span class="mono faint">{plan.source_id}</span></td>
                <td>{interval(plan)}<span class="mono faint">{plan.next_run_at?.slice(0, 16).replace("T", " ") ?? ""}</span></td>
                <td>{plan.retention_count} artifacts{plan.verify ? " · verified" : " · not verified"}</td>
                <td><span class:disabled={!plan.enabled} class="state">{plan.enabled ? "Enabled" : "Disabled"}</span></td>
                <td class="actions">
                  <button onclick={() => run(plan)} disabled={!plan.enabled}>Run now</button>
                  <button onclick={() => toggle(plan)}>{plan.enabled ? "Disable" : "Enable"}</button>
                  <button onclick={() => remove(plan)}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <h2>Artifacts</h2>
  <div class="card">
    {#if artifacts.length === 0}
      <p class="muted">No completed backup artifacts.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Created</th><th>Source</th><th>Files</th><th>Size</th><th>Integrity</th><th></th></tr></thead>
          <tbody>
            {#each artifacts as artifact (artifact.id)}
              <tr>
                <td class="faint">{artifact.created_at.slice(0, 19).replace("T", " ")}</td>
                <td><span class="pill">{artifact.source_type}</span><span class="mono faint">{artifact.source_id}</span></td>
                <td>{artifact.files.length}</td>
                <td>{size(artifact.total_size_bytes)}</td>
                <td><span class="state" class:verified={artifact.verified}>{artifact.verified ? "Verified" : "Unverified"}</span></td>
                <td><button onclick={() => restore(artifact)} disabled={!artifact.verified}>Restore</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

{#if showCreate}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && !saving && (showCreate = false)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="New backup plan">
      <h2>New backup plan</h2>
      <form onsubmit={createPlan}>
        <div class="grid">
          <label class="field"><span>Name</span><input bind:value={name} placeholder="nightly-vms" autocomplete="off" /></label>
          <label class="field"><span>Source type</span><select bind:value={sourceType}><option value="dataset">Dataset</option><option value="vm">VM</option><option value="container">Container</option></select></label>
          <label class="field"><span>{sourceType === "dataset" ? "ZFS dataset" : `${sourceType} resource ID`}</span><input bind:value={sourceId} placeholder={sourceType === "dataset" ? "tank/vms" : "resource UUID"} autocomplete="off" /></label>
          <label class="field"><span>Destination subdirectory</span><input bind:value={destination} placeholder="default" autocomplete="off" /></label>
          <label class="field"><span>Interval (minutes; 0 = manual)</span><input type="number" min="0" bind:value={intervalMinutes} /></label>
          <label class="field"><span>Keep artifacts</span><input type="number" min="1" max="3650" bind:value={retention} /></label>
        </div>
        <label class="check"><input type="checkbox" bind:checked={verify} /><span>Verify SHA-256 checksums</span></label>
        <label class="check"><input type="checkbox" bind:checked={enabled} /><span>Enable schedule</span></label>
        <p class="hint">VM and container plans snapshot all backing datasets before sending them. Restore currently supports one-dataset artifacts and never replaces a target without explicit confirmation.</p>
        {#if formError}<p class="error">{formError}</p>{/if}
        <div class="dialog-actions"><button type="button" onclick={() => (showCreate = false)} disabled={saving}>Cancel</button><button type="submit" class="primary" disabled={saving}>{saving ? "Saving…" : "Create plan"}</button></div>
      </form>
    </div>
  </div>
{/if}

<style>
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .lede { margin: 0; max-width: 70ch; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .table-wrap { overflow-x: auto; }
  table { min-width: 820px; }
  td strong, td .mono { display: block; }
  .pill { display: inline-block; margin-right: 0.35rem; font-size: 0.75rem; color: var(--muted); }
  .state { display: inline-block; border: 1px solid var(--border-strong); border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.76rem; white-space: nowrap; }
  .state.disabled { color: var(--muted); }
  .state.verified { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
  .actions { white-space: nowrap; }
  .actions button { margin-left: 0.35rem; }
  .overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-start; justify-content: center; padding: 5vh 1rem; overflow-y: auto; background: rgba(4, 8, 20, 0.66); backdrop-filter: blur(3px); }
  .dialog { width: min(700px, 100%); padding: 1.5rem 1.6rem; background: var(--panel); border: 1px solid var(--border-strong); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); }
  .dialog h2 { margin-top: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.8rem; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
  .field span { color: var(--muted); }
  .check { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.9rem; }
  .check input { width: auto; }
  .hint { color: var(--muted); font-size: 0.82rem; line-height: 1.45; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.4rem; }
</style>

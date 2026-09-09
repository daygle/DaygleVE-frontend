<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type {
    AlertMetric,
    AlertRule,
    AlertScope,
    LxcSummary,
    VmSummary,
  } from "@daygleve/schema";

  const METRICS: { value: AlertMetric; label: string; unit: string; scopes: AlertScope[] }[] = [
    { value: "cpu_pct", label: "CPU", unit: "%", scopes: ["vm", "lxc"] },
    { value: "memory_pct", label: "Memory", unit: "%", scopes: ["vm", "lxc"] },
    { value: "disk_read_mib_s", label: "Disk read", unit: "MiB/s", scopes: ["vm", "lxc"] },
    { value: "disk_write_mib_s", label: "Disk write", unit: "MiB/s", scopes: ["vm", "lxc"] },
    { value: "net_rx_mib_s", label: "Network rx", unit: "MiB/s", scopes: ["vm", "lxc"] },
    { value: "net_tx_mib_s", label: "Network tx", unit: "MiB/s", scopes: ["vm", "lxc"] },
    { value: "pool_used_pct", label: "Pool capacity", unit: "%", scopes: ["node"] },
  ];

  let rules = $state<AlertRule[]>([]);
  let vms = $state<VmSummary[]>([]);
  let containers = $state<LxcSummary[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let forbidden = $state(false);

  // create/edit modal
  let showForm = $state(false);
  let editingId = $state<string | null>(null);
  let busy = $state(false);
  let formError = $state<string | null>(null);

  let fName = $state("");
  let fEnabled = $state(true);
  let fScope = $state<AlertScope>("vm");
  let fMetric = $state<AlertMetric>("cpu_pct");
  let fThreshold = $state(90);
  let fSustain = $state(4);
  let fCooldown = $state(300);
  let fGuestId = $state("");

  async function load() {
    loading = true;
    try {
      [rules, vms, containers] = await Promise.all([
        client().listAlertRules(),
        client().listVms(),
        client().listContainers(),
      ]);
      error = null;
      forbidden = false;
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 403) {
        forbidden = true;
        error = null;
      } else {
        error = e instanceof ApiRequestError ? e.body.message : String(e);
      }
    } finally {
      loading = false;
    }
  }

  function metricsFor(scope: AlertScope) {
    return METRICS.filter((m) => m.scopes.includes(scope));
  }

  function metricInfo(metric: AlertMetric) {
    return METRICS.find((m) => m.value === metric);
  }

  function openCreate() {
    editingId = null;
    fName = "";
    fEnabled = true;
    fScope = "vm";
    fMetric = "cpu_pct";
    fThreshold = 90;
    fSustain = 4;
    fCooldown = 300;
    fGuestId = "";
    formError = null;
    showForm = true;
  }

  function openEdit(r: AlertRule) {
    editingId = r.id;
    fName = r.name;
    fEnabled = r.enabled;
    fScope = r.scope;
    fMetric = r.metric;
    fThreshold = r.threshold;
    fSustain = r.sustain_ticks;
    fCooldown = r.cooldown_secs;
    fGuestId = r.guest_id ?? "";
    formError = null;
    showForm = true;
  }

  function changeScope() {
    const allowed = metricsFor(fScope);
    if (!allowed.some((m) => m.value === fMetric)) {
      fMetric = allowed[0]?.value ?? "cpu_pct";
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!fName.trim()) return (formError = "Name is required.");
    if (fThreshold < 0) return (formError = "Threshold must be >= 0.");
    const guest_id = fGuestId.trim() || undefined;
    busy = true;
    try {
      if (editingId) {
        await client().updateAlertRule(editingId, {
          name: fName.trim(),
          enabled: fEnabled,
          guest_id: fGuestId.trim() ? fGuestId.trim() : null,
          metric: fMetric,
          threshold: fThreshold,
          sustain_ticks: fSustain,
          cooldown_secs: fCooldown,
        });
      } else {
        await client().createAlertRule({
          name: fName.trim(),
          enabled: fEnabled,
          scope: fScope,
          guest_id,
          metric: fMetric,
          threshold: fThreshold,
          sustain_ticks: fSustain,
          cooldown_secs: fCooldown,
        });
      }
      showForm = false;
      await load();
    } catch (err) {
      formError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function toggle(r: AlertRule) {
    try {
      await client().updateAlertRule(r.id, { enabled: !r.enabled });
      await load();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  async function remove(r: AlertRule) {
    if (!confirm(`Delete alert rule "${r.name}"?`)) return;
    try {
      await client().deleteAlertRule(r.id);
      await load();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  function scopeLabel(scope: AlertScope): string {
    return scope === "node" ? "Node / pools" : scope === "vm" ? "VMs" : "Containers";
  }

  function targetLabel(r: AlertRule): string {
    if (!r.guest_id) return `all ${scopeLabel(r.scope).toLowerCase()}`;
    if (r.scope === "vm") return vms.find((v) => v.id === r.guest_id)?.name ?? r.guest_id;
    if (r.scope === "lxc")
      return containers.find((c) => c.id === r.guest_id)?.name ?? r.guest_id;
    return r.guest_id;
  }

  function ruleSummary(r: AlertRule): string {
    const info = metricInfo(r.metric);
    return `${info?.label ?? r.metric} >= ${r.threshold}${info?.unit === "%" ? "%" : ` ${info?.unit ?? ""}`}`;
  }

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="head">
    <h1>Alert rules</h1>
    {#if !forbidden}
      <button class="primary" onclick={openCreate}>Add rule</button>
    {/if}
  </div>
  <p class="lede muted">
    Fire a notification when a metric crosses a threshold and stays there. Rules are evaluated on
    every metrics tick (15 seconds); a fired rule re-notifies only after its cooldown.
  </p>
  {#if error}<p class="error">{error}</p>{/if}

  <div class="card">
    {#if forbidden}
      <p class="muted">You don't have permission to view alert rules.</p>
    {:else if loading}
      <p class="muted">Loading…</p>
    {:else if rules.length === 0}
      <p class="muted">No rules yet. Add one to start alerting on metric thresholds.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th>Scope</th><th>Target</th><th>Condition</th><th>Sustain</th><th>Cooldown</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {#each rules as r (r.id)}
            <tr>
              <td class="name">{r.name}</td>
              <td>{scopeLabel(r.scope)}</td>
              <td>{targetLabel(r)}</td>
              <td class="mono">{ruleSummary(r)}</td>
              <td>{r.sustain_ticks <= 1 ? "immediate" : `${r.sustain_ticks} ticks`}</td>
              <td>{r.cooldown_secs}s</td>
              <td>{r.enabled ? "Enabled" : "Disabled"}</td>
              <td class="row-actions">
                <button onclick={() => toggle(r)}>{r.enabled ? "Disable" : "Enable"}</button>
                <button onclick={() => openEdit(r)}>Edit</button>
                <button onclick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

{#if showForm}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showForm = false)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Alert rule">
      <h2>{editingId ? "Edit rule" : "Add rule"}</h2>
      <form onsubmit={submit}>
        <label class="field"><span>Name</span><input bind:value={fName} autocomplete="off" placeholder="web01 cpu hot" /></label>

        {#if !editingId}
          <label class="field">
            <span>Scope</span>
            <select bind:value={fScope} onchange={changeScope}>
              <option value="vm">VMs</option>
              <option value="lxc">Containers</option>
              <option value="node">Node / pools</option>
            </select>
          </label>
        {/if}

        <label class="field">
          <span>Target</span>
          {#if fScope === "node"}
            <input bind:value={fGuestId} autocomplete="off" placeholder="all pools (pool name, e.g. tank)" />
          {:else if fScope === "vm"}
            <select bind:value={fGuestId}>
              <option value="">All VMs</option>
              {#each vms as vm (vm.id)}<option value={vm.id}>{vm.name}</option>{/each}
            </select>
          {:else}
            <select bind:value={fGuestId}>
              <option value="">All containers</option>
              {#each containers as ct (ct.id)}<option value={ct.id}>{ct.name}</option>{/each}
            </select>
          {/if}
        </label>

        <div class="grid2">
          <label class="field">
            <span>Metric</span>
            <select bind:value={fMetric}>
              {#each metricsFor(fScope) as m (m.value)}
                <option value={m.value}>{m.label}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Threshold</span>
            <input type="number" min="0" step="any" bind:value={fThreshold} />
          </label>
        </div>

        <div class="grid2">
          <label class="field">
            <span>Sustain (ticks)</span>
            <input type="number" min="1" bind:value={fSustain} />
          </label>
          <label class="field">
            <span>Cooldown (s)</span>
            <input type="number" min="0" bind:value={fCooldown} />
          </label>
        </div>

        <label class="check"><input type="checkbox" bind:checked={fEnabled} /><span>Enabled</span></label>

        {#if formError}<p class="error">{formError}</p>{/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (showForm = false)} disabled={busy}>Cancel</button>
          <button type="submit" class="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .name {
    font-weight: 600;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
  }
  .row-actions {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>

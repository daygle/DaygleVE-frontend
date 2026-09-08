<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import { WEEKDAYS, buildCron, describeCron } from "$lib/cron";
  import type {
    PowerSchedule,
    ScheduleTarget,
    PowerScheduleAction,
    CreatePowerScheduleRequest,
  } from "@daygleve/schema";

  let { targetKind, targetId }: { targetKind: ScheduleTarget; targetId: string } = $props();

  let schedules = $state<PowerSchedule[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  // add form
  let showAdd = $state(false);
  let busy = $state(false);
  let addError = $state<string | null>(null);
  let action = $state<PowerScheduleAction>("start");
  let mode = $state<"builder" | "advanced">("builder");
  let days = $state<number[]>([1, 2, 3, 4, 5]);
  let time = $state("22:00");
  let cronRaw = $state("0 22 * * 1-5");
  let description = $state("");

  const actionLabels: Record<PowerScheduleAction, string> = {
    start: "Start",
    shutdown: "Shutdown",
    reboot: "Reboot",
  };

  async function load() {
    loading = true;
    try {
      schedules = await client().listSchedules(targetKind, targetId);
      error = null;
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      loading = false;
    }
  }

  function toggleDay(d: number) {
    days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
  }

  function currentCron(): string {
    if (mode === "advanced") return cronRaw.trim();
    const [h, m] = time.split(":").map(Number);
    return buildCron(days, h || 0, m || 0);
  }

  function openAdd() {
    action = "start";
    mode = "builder";
    days = [1, 2, 3, 4, 5];
    time = "22:00";
    cronRaw = "0 22 * * 1-5";
    description = "";
    addError = null;
    showAdd = true;
  }

  async function submitAdd(e: SubmitEvent) {
    e.preventDefault();
    addError = null;
    const cron = currentCron();
    if (!cron) return (addError = "A schedule time is required.");
    if (mode === "builder" && days.length === 0)
      return (addError = "Pick at least one day.");
    const req: CreatePowerScheduleRequest = {
      target_kind: targetKind,
      target_id: targetId,
      action,
      cron,
      enabled: true,
    };
    if (description.trim()) req.description = description.trim();
    busy = true;
    try {
      await client().createSchedule(req);
      showAdd = false;
      await load();
    } catch (err) {
      addError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function toggleEnabled(s: PowerSchedule) {
    try {
      await client().updateSchedule(s.id, { enabled: !s.enabled });
      await load();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  async function remove(s: PowerSchedule) {
    if (!confirm(`Delete this ${actionLabels[s.action].toLowerCase()} schedule?`)) return;
    try {
      await client().deleteSchedule(s.id);
      await load();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  function fmtWhen(ts: string | undefined): string {
    if (!ts) return "-";
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
  }

  $effect(() => {
    // Re-load when the target changes.
    targetId;
    load();
  });
</script>

<div class="sched">
  <div class="sched-head">
    <h3>Power schedules</h3>
    <button class="add" onclick={openAdd}>+ Add schedule</button>
  </div>
  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if schedules.length === 0}
    <p class="muted">
      No schedules. Add one to automatically start, shut down, or reboot this guest on a timetable.
    </p>
  {:else}
    <ul class="list">
      {#each schedules as s (s.id)}
        <li class:disabled={!s.enabled}>
          <div class="main">
            <span class="act act-{s.action}">{actionLabels[s.action]}</span>
            <span class="when">{describeCron(s.cron)}</span>
            {#if s.description}<span class="desc">· {s.description}</span>{/if}
          </div>
          <div class="meta">
            <span title="Next run">Next: {s.enabled ? fmtWhen(s.next_run_at) : "paused"}</span>
            {#if s.last_run_at}
              <span title="Last run" class:bad={s.last_result && s.last_result !== "ok"}>
                Last: {fmtWhen(s.last_run_at)} ({s.last_result})
              </span>
            {/if}
          </div>
          <div class="actions">
            <button onclick={() => toggleEnabled(s)}>{s.enabled ? "Pause" : "Enable"}</button>
            <button onclick={() => remove(s)}>Delete</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if showAdd}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showAdd = false)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Add power schedule">
      <h2>Add power schedule</h2>
      <form onsubmit={submitAdd}>
        <label class="field">
          <span>Action</span>
          <select bind:value={action}>
            <option value="start">Start</option>
            <option value="shutdown">Shutdown (graceful)</option>
            <option value="reboot">Reboot</option>
          </select>
        </label>

        <div class="mode">
          <button type="button" class:on={mode === "builder"} onclick={() => (mode = "builder")}>Simple</button>
          <button type="button" class:on={mode === "advanced"} onclick={() => (mode = "advanced")}>Advanced (cron)</button>
        </div>

        {#if mode === "builder"}
          <div class="field">
            <span>Days</span>
            <div class="days">
              {#each WEEKDAYS as d (d.value)}
                <button type="button" class="day" class:on={days.includes(d.value)} onclick={() => toggleDay(d.value)} title={d.long}>
                  {d.short}
                </button>
              {/each}
            </div>
          </div>
          <label class="field">
            <span>Time <span class="opt">(UTC)</span></span>
            <input type="time" bind:value={time} />
          </label>
          <p class="preview">{describeCron(currentCron())} · <code>{currentCron()}</code></p>
        {:else}
          <label class="field">
            <span>Cron expression <span class="opt">(5-field, UTC)</span></span>
            <input bind:value={cronRaw} placeholder="0 22 * * 1-5" autocomplete="off" />
          </label>
          <p class="preview">{describeCron(cronRaw.trim())}</p>
        {/if}

        <label class="field">
          <span>Description <span class="opt">(optional)</span></span>
          <input bind:value={description} autocomplete="off" placeholder="Nightly shutdown" />
        </label>

        {#if addError}<p class="error">{addError}</p>{/if}
        <div class="dialog-actions">
          <button type="button" onclick={() => (showAdd = false)} disabled={busy}>Cancel</button>
          <button type="submit" class="primary" disabled={busy}>{busy ? "Adding…" : "Add schedule"}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .sched-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }
  .sched-head h3 {
    margin: 0;
  }
  .add {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .add:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .list li.disabled {
    opacity: 0.55;
  }
  .main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 12rem;
  }
  .act {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.05rem 0.45rem;
    border-radius: 4px;
    color: #fff;
  }
  .act-start {
    background: #2f855a;
  }
  .act-shutdown {
    background: #9b6a1a;
  }
  .act-reboot {
    background: #2b6cb0;
  }
  .when {
    font-size: 0.9rem;
  }
  .desc {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .meta .bad {
    color: #e26d6d;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
  }
  .actions button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .actions button:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 20, 0.66);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 6vh 1rem;
    z-index: 50;
  }
  .dialog {
    background: var(--surface, #121a30);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    padding: 1.5rem 1.6rem;
    width: min(460px, 100%);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  }
  .dialog h2 {
    margin: 0 0 1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
    margin-bottom: 0.8rem;
  }
  .field > span {
    color: var(--muted);
  }
  .field .opt {
    opacity: 0.7;
    font-size: 0.75rem;
  }
  .mode {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.8rem;
  }
  .mode button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.3rem 0.7rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .mode button.on {
    color: var(--fg);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .days {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .day {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    font-size: 0.78rem;
    min-width: 2.6rem;
  }
  .day.on {
    color: #fff;
    border-color: var(--accent);
    background: var(--accent);
  }
  .preview {
    font-size: 0.8rem;
    color: var(--muted);
    margin: 0 0 0.8rem;
  }
  .preview code {
    color: var(--fg);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>

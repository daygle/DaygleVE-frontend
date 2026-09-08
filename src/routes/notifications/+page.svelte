<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type {
    NotificationChannel,
    NotificationChannelKind,
    NotificationEvent,
    CreateNotificationChannelRequest,
    UpdateNotificationChannelRequest,
  } from "@daygleve/schema";

  const EVENTS: { value: NotificationEvent; label: string }[] = [
    { value: "backup_succeeded", label: "Backup succeeded" },
    { value: "backup_failed", label: "Backup failed" },
    { value: "snapshot_failed", label: "Snapshot failed" },
    { value: "power_action_failed", label: "Power action failed" },
  ];

  let channels = $state<NotificationChannel[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let forbidden = $state(false);
  let notice = $state<string | null>(null);

  // create/edit modal
  let showForm = $state(false);
  let editingId = $state<string | null>(null);
  let busy = $state(false);
  let formError = $state<string | null>(null);

  let fName = $state("");
  let fKind = $state<NotificationChannelKind>("email");
  let fEnabled = $state(true);
  let fEvents = $state<NotificationEvent[]>(["backup_failed"]);
  // email
  let fHost = $state("");
  let fPort = $state(587);
  let fUsername = $state("");
  let fFrom = $state("");
  let fTo = $state("");
  let fStarttls = $state(true);
  // webhook
  let fUrl = $state("");
  // secret (both)
  let fSecret = $state("");
  let fHasSecret = $state(false); // editing: a secret is already stored

  async function load() {
    loading = true;
    try {
      channels = await client().listNotificationChannels();
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

  function toggleEvent(ev: NotificationEvent) {
    fEvents = fEvents.includes(ev) ? fEvents.filter((e) => e !== ev) : [...fEvents, ev];
  }

  function openCreate() {
    editingId = null;
    fName = "";
    fKind = "email";
    fEnabled = true;
    fEvents = ["backup_failed"];
    fHost = "";
    fPort = 587;
    fUsername = "";
    fFrom = "";
    fTo = "";
    fStarttls = true;
    fUrl = "";
    fSecret = "";
    fHasSecret = false;
    formError = null;
    showForm = true;
  }

  function openEdit(c: NotificationChannel) {
    editingId = c.id;
    fName = c.name;
    fKind = c.kind;
    fEnabled = c.enabled;
    fEvents = [...c.events].filter((e) => e !== "test");
    fHost = c.email?.smtp_host ?? "";
    fPort = c.email?.smtp_port ?? 587;
    fUsername = c.email?.smtp_username ?? "";
    fFrom = c.email?.from_address ?? "";
    fTo = (c.email?.to_addresses ?? []).join(", ");
    fStarttls = c.email?.starttls ?? true;
    fUrl = c.webhook?.url ?? "";
    fSecret = "";
    fHasSecret = c.has_secret;
    formError = null;
    showForm = true;
  }

  function buildEmail() {
    return {
      smtp_host: fHost.trim(),
      smtp_port: fPort,
      smtp_username: fUsername.trim() || undefined,
      from_address: fFrom.trim(),
      to_addresses: fTo
        .split(/[\s,]+/)
        .map((a) => a.trim())
        .filter(Boolean),
      starttls: fStarttls,
    };
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!fName.trim()) return (formError = "Name is required.");
    if (fEvents.length === 0) return (formError = "Subscribe to at least one event.");

    const email = fKind === "email" ? buildEmail() : undefined;
    const webhook = fKind === "webhook" ? { url: fUrl.trim() } : undefined;
    busy = true;
    try {
      if (editingId) {
        const req: UpdateNotificationChannelRequest = {
          name: fName.trim(),
          enabled: fEnabled,
          events: fEvents,
          email,
          webhook,
        };
        // Only send secret when the user typed a new one (blank = leave as-is).
        if (fSecret) req.secret = fSecret;
        await client().updateNotificationChannel(editingId, req);
      } else {
        const req: CreateNotificationChannelRequest = {
          name: fName.trim(),
          kind: fKind,
          enabled: fEnabled,
          events: fEvents,
          email,
          webhook,
        };
        if (fSecret) req.secret = fSecret;
        await client().createNotificationChannel(req);
      }
      showForm = false;
      await load();
    } catch (err) {
      formError = err instanceof ApiRequestError ? err.body.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function remove(c: NotificationChannel) {
    if (!confirm(`Delete notification channel "${c.name}"?`)) return;
    try {
      await client().deleteNotificationChannel(c.id);
      await load();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  async function sendTest(c: NotificationChannel) {
    notice = null;
    error = null;
    try {
      await client().testNotificationChannel(c.id);
      notice = `Test notification sent via "${c.name}".`;
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  function eventLabel(ev: NotificationEvent): string {
    return EVENTS.find((e) => e.value === ev)?.label ?? ev;
  }

  $effect(() => {
    load();
  });
</script>

<div class="container">
  <div class="head">
    <h1>Notifications</h1>
    {#if !forbidden}
      <button class="primary" onclick={openCreate}>Add channel</button>
    {/if}
  </div>
  <p class="lede muted">
    Deliver alerts about backups and scheduled tasks over email (SMTP) or an outbound webhook.
  </p>
  {#if error}<p class="error">{error}</p>{/if}
  {#if notice}<p class="notice">{notice}</p>{/if}

  <div class="card">
    {#if forbidden}
      <p class="muted">You don't have permission to view notification channels.</p>
    {:else if loading}
      <p class="muted">Loading…</p>
    {:else if channels.length === 0}
      <p class="muted">No channels yet. Add one to start receiving alerts.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th>Type</th><th>Events</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {#each channels as c (c.id)}
            <tr>
              <td class="name">{c.name}</td>
              <td>{c.kind === "email" ? "Email" : "Webhook"}</td>
              <td class="events">
                {#each c.events.filter((e) => e !== "test") as ev (ev)}
                  <span class="ev">{eventLabel(ev)}</span>
                {/each}
              </td>
              <td>{c.enabled ? "Enabled" : "Disabled"}</td>
              <td class="row-actions">
                <button onclick={() => sendTest(c)}>Test</button>
                <button onclick={() => openEdit(c)}>Edit</button>
                <button onclick={() => remove(c)}>Delete</button>
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
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Notification channel">
      <h2>{editingId ? "Edit channel" : "Add channel"}</h2>
      <form onsubmit={submit}>
        <label class="field"><span>Name</span><input bind:value={fName} autocomplete="off" /></label>

        {#if !editingId}
          <label class="field">
            <span>Type</span>
            <select bind:value={fKind}>
              <option value="email">Email (SMTP)</option>
              <option value="webhook">Webhook</option>
            </select>
          </label>
        {/if}

        <fieldset class="events-set">
          <legend>Events</legend>
          {#each EVENTS as ev (ev.value)}
            <label class="check">
              <input type="checkbox" checked={fEvents.includes(ev.value)} onchange={() => toggleEvent(ev.value)} />
              <span>{ev.label}</span>
            </label>
          {/each}
        </fieldset>

        {#if fKind === "email"}
          <div class="grid2">
            <label class="field"><span>SMTP host</span><input bind:value={fHost} autocomplete="off" placeholder="smtp.example.com" /></label>
            <label class="field"><span>Port</span><input type="number" min="1" bind:value={fPort} /></label>
          </div>
          <label class="field"><span>From address</span><input bind:value={fFrom} autocomplete="off" placeholder="daygleve@example.com" /></label>
          <label class="field"><span>Recipients <span class="opt">(comma-separated)</span></span><input bind:value={fTo} autocomplete="off" placeholder="ops@example.com" /></label>
          <label class="field"><span>SMTP username <span class="opt">(optional)</span></span><input bind:value={fUsername} autocomplete="off" /></label>
          <label class="field"><span>SMTP password {#if fHasSecret}<span class="opt">(stored; blank keeps it)</span>{/if}</span><input type="password" bind:value={fSecret} autocomplete="new-password" /></label>
          <label class="check"><input type="checkbox" bind:checked={fStarttls} /><span>Use STARTTLS</span></label>
        {:else}
          <label class="field"><span>Webhook URL</span><input bind:value={fUrl} autocomplete="off" placeholder="https://hooks.example.com/daygleve" /></label>
          <label class="field"><span>Signing secret <span class="opt">{fHasSecret ? "(stored; blank keeps it)" : "(optional; HMAC-SHA256)"}</span></span><input type="password" bind:value={fSecret} autocomplete="new-password" /></label>
        {/if}

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
  }
  .lede {
    margin: 0.2rem 0 1rem;
    max-width: 60ch;
    font-size: 0.9rem;
  }
  .notice {
    color: var(--accent);
    font-size: 0.9rem;
  }
  .name {
    font-weight: 600;
  }
  .events {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .ev {
    font-size: 0.7rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--panel-2, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .row-actions {
    display: flex;
    gap: 0.4rem;
  }
  .row-actions button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.25rem 0.55rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .row-actions button:hover {
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
    overflow-y: auto;
  }
  .dialog {
    background: var(--surface, #121a30);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    padding: 1.5rem 1.6rem;
    width: min(480px, 100%);
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
    margin-bottom: 0.7rem;
  }
  .field > span {
    color: var(--muted);
  }
  .field .opt {
    opacity: 0.7;
    font-size: 0.75rem;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 6rem;
    gap: 0.7rem;
  }
  .events-set {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    margin: 0 0 0.8rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  .events-set legend {
    color: var(--muted);
    font-size: 0.78rem;
    padding: 0 0.3rem;
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

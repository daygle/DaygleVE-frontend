<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import {
    LETS_ENCRYPT_PRODUCTION,
    LETS_ENCRYPT_STAGING,
    type AcmeStatus,
    type AcmeState,
    type UpdateAcmeConfigRequest,
  } from "@daygleve/schema";

  let status = $state<AcmeStatus | null>(null);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let saving = $state(false);
  let issuing = $state(false);

  // --- form model ---
  let enabled = $state(false);
  let directoryPreset = $state<"production" | "staging" | "custom">("production");
  let directoryUrl = $state(LETS_ENCRYPT_PRODUCTION);
  let contactEmail = $state("");
  let domainsText = $state("");
  let termsAgreed = $state(false);
  let renewalDays = $state("30");

  const effectiveDirectory = $derived(
    directoryPreset === "production"
      ? LETS_ENCRYPT_PRODUCTION
      : directoryPreset === "staging"
        ? LETS_ENCRYPT_STAGING
        : directoryUrl,
  );

  function presetFor(url: string): "production" | "staging" | "custom" {
    if (url === LETS_ENCRYPT_PRODUCTION) return "production";
    if (url === LETS_ENCRYPT_STAGING) return "staging";
    return "custom";
  }

  function applyStatus(s: AcmeStatus) {
    status = s;
    enabled = s.config.enabled;
    directoryPreset = presetFor(s.config.directory_url);
    directoryUrl = s.config.directory_url;
    contactEmail = s.config.contact_email;
    domainsText = s.config.domains.join("\n");
    termsAgreed = s.config.terms_agreed;
    renewalDays = String(s.config.renewal_days);
  }

  async function load() {
    try {
      applyStatus(await client().acmeStatus());
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    }
  }

  $effect(() => {
    load();
  });

  function parsedDomains(): string[] {
    return domainsText
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);
  }

  async function save() {
    error = null;
    notice = null;
    const days = Number(renewalDays);
    if (enabled && !Number.isInteger(days)) {
      error = "Renewal window must be a whole number of days.";
      return;
    }
    const req: UpdateAcmeConfigRequest = {
      enabled,
      directory_url: effectiveDirectory,
      contact_email: contactEmail.trim(),
      domains: parsedDomains(),
      terms_agreed: termsAgreed,
      renewal_days: renewalDays.trim() ? days : undefined,
    };
    saving = true;
    try {
      applyStatus(await client().updateAcmeConfig(req));
      notice = "Configuration saved.";
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      saving = false;
    }
  }

  // Trigger issuance and poll the status a few times so the page reflects the
  // pending → active transition without a manual refresh.
  async function issueNow() {
    error = null;
    notice = null;
    issuing = true;
    try {
      applyStatus(await client().issueAcme());
      notice = "Issuance started. This can take up to a minute.";
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const s = await client().acmeStatus();
        status = s;
        if (s.state === "active" || s.state === "error") {
          notice =
            s.state === "active"
              ? "Certificate issued and installed."
              : "Issuance failed — see the error below.";
          break;
        }
      }
    } catch (e) {
      error = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      issuing = false;
    }
  }

  function fmtDate(ts: string | undefined): string {
    if (!ts) return "—";
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  }

  const stateLabel: Record<AcmeState, string> = {
    disabled: "Disabled",
    pending: "Pending",
    active: "Active",
    error: "Error",
  };
</script>

<h1>Security</h1>
<p class="muted lede">
  Automatic TLS certificates for this node's HTTPS interface, issued and renewed from an ACME
  certificate authority (Let's Encrypt by default) using the HTTP-01 challenge.
</p>

{#if error}<p class="error">{error}</p>{/if}
{#if notice}<p class="ok">{notice}</p>{/if}

<div class="grid">
  <div class="card">
    <div class="section-head compact">
      <h2>Certificate</h2>
      {#if status}
        <span class="badge badge-{status.state}">{stateLabel[status.state]}</span>
      {/if}
    </div>
    {#if status}
      <dl class="facts">
        <dt>Certificate domains</dt>
        <dd class="mono">
          {status.certificate_domains && status.certificate_domains.length
            ? status.certificate_domains.join(", ")
            : "—"}
        </dd>
        <dt>Issued</dt>
        <dd>{fmtDate(status.issued_at)}</dd>
        <dt>Expires</dt>
        <dd>{fmtDate(status.expires_at)}</dd>
        <dt>Last renewal</dt>
        <dd>{fmtDate(status.last_renewal_at)}</dd>
        <dt>ACME account</dt>
        <dd>{status.account_registered ? "Registered" : "Not registered"}</dd>
      </dl>
      {#if status.last_error}
        <p class="error small">Last error: {status.last_error}</p>
      {/if}
      <button class="primary" onclick={issueNow} disabled={issuing || !status.config.enabled}>
        {issuing ? "Issuing…" : "Issue / renew now"}
      </button>
      {#if !status.config.enabled}
        <p class="muted small">Enable and save the configuration below before issuing.</p>
      {/if}
    {:else}
      <p class="muted">Loading…</p>
    {/if}
  </div>

  <div class="card">
    <h2>Configuration</h2>
    <form onsubmit={(e) => (e.preventDefault(), save())}>
      <label class="check">
        <input type="checkbox" bind:checked={enabled} />
        <span>Enable automatic TLS (ACME)</span>
      </label>

      <label class="field">
        <span>Certificate authority</span>
        <select bind:value={directoryPreset}>
          <option value="production">Let's Encrypt (production)</option>
          <option value="staging">Let's Encrypt (staging — for testing)</option>
          <option value="custom">Custom ACME directory URL</option>
        </select>
      </label>
      {#if directoryPreset === "custom"}
        <label class="field">
          <span>Directory URL</span>
          <input bind:value={directoryUrl} autocomplete="off" placeholder="https://acme.example/directory" />
        </label>
      {/if}

      <label class="field">
        <span>Contact email <span class="opt">(expiry notices from the CA)</span></span>
        <input bind:value={contactEmail} autocomplete="off" placeholder="admin@example.com" />
      </label>

      <label class="field">
        <span>Domains <span class="opt">(one per line; first is the primary)</span></span>
        <textarea bind:value={domainsText} rows="3" placeholder="node.example.com"></textarea>
      </label>

      <label class="field">
        <span>Renew when fewer than N days remain</span>
        <input bind:value={renewalDays} inputmode="numeric" autocomplete="off" placeholder="30" />
      </label>

      <label class="check">
        <input type="checkbox" bind:checked={termsAgreed} />
        <span>I agree to the certificate authority's terms of service</span>
      </label>

      <div class="form-actions">
        <button type="submit" class="primary" disabled={saving}>
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </form>
    <p class="muted small">
      The HTTP-01 challenge is served at <span class="mono">/.well-known/acme-challenge/</span>. Make
      sure port 80 for each domain reaches this node so the CA can validate it. The first issuance
      may need a restart to switch the listener to HTTPS; later renewals apply with no downtime.
    </p>
  </div>
</div>

<style>
  .lede {
    margin: 0.2rem 0 0.8rem;
    max-width: 70ch;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
    align-items: start;
  }
  .card {
    background: var(--panel, var(--panel-2));
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.1rem 1.2rem;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-head.compact {
    margin-bottom: 0.6rem;
  }
  h2 {
    margin: 0 0 0.8rem;
    font-size: 1rem;
  }
  .section-head.compact h2 {
    margin: 0;
  }
  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 1rem;
    margin: 0 0 0.8rem;
    font-size: 0.85rem;
  }
  .facts dt {
    color: var(--muted);
  }
  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
    margin-bottom: 0.8rem;
  }
  .field span {
    color: var(--muted);
  }
  .field .opt {
    opacity: 0.7;
    font-size: 0.75rem;
  }
  input,
  select,
  textarea {
    font: inherit;
    padding: 0.4rem 0.55rem;
    background: var(--bg-2, rgba(0, 0, 0, 0.2));
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    width: 100%;
    box-sizing: border-box;
  }
  textarea {
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    margin-bottom: 0.8rem;
  }
  .check input {
    width: auto;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.4rem;
  }
  button.primary {
    cursor: pointer;
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 0.45rem 0.9rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  button.primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
  }
  .small {
    font-size: 0.78rem;
  }
  .ok {
    color: #34d399;
    font-size: 0.85rem;
  }
  .badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    text-transform: capitalize;
  }
  .badge-active {
    color: #34d399;
    border-color: #34d39955;
  }
  .badge-pending {
    color: #fbbf24;
    border-color: #fbbf2455;
  }
  .badge-error {
    color: #f87171;
    border-color: #f8717155;
  }
  .badge-disabled {
    color: var(--muted);
  }
</style>

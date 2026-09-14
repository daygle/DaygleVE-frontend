<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type {
    Bridge,
    Vlan,
    HostFirewall,
    HostFirewallRule,
    FirewallProtocol,
  } from "@daygleve/schema";

  let bridges = $state<Bridge[]>([]);
  let vlans = $state<Vlan[]>([]);
  let error = $state<string | null>(null);

  // --- host firewall ---
  let fw = $state<HostFirewall | null>(null);
  let fwError = $state<string | null>(null);
  let fwSaving = $state(false);
  let fwSaved = $state(false);

  $effect(() => {
    const c = client();
    Promise.all([c.listBridges(), c.listVlans()])
      .then(([b, v]) => {
        bridges = b;
        vlans = v;
      })
      .catch((e) => (error = e instanceof ApiRequestError ? e.body.message : String(e)));
    c.getFirewall()
      .then((f) => (fw = normalizeFw(f)))
      .catch((e) => (fwError = e instanceof ApiRequestError ? e.body.message : String(e)));
  });

  /** Fill in defaults so the editor always has concrete fields to bind. */
  function normalizeFw(f: HostFirewall): HostFirewall {
    return {
      enabled: f.enabled,
      default_input_policy: f.default_input_policy ?? "accept",
      rules: (f.rules ?? []).map((r) => ({
        ...r,
        source_cidr: r.source_cidr ?? "",
        description: r.description ?? "",
      })),
    };
  }

  /** True when a rule's protocol supports a destination port. */
  function portable(proto: FirewallProtocol): boolean {
    return proto === "tcp" || proto === "udp";
  }

  function addRule() {
    if (!fw) return;
    const rule: HostFirewallRule = {
      action: "accept",
      protocol: "tcp",
      source_cidr: "",
      description: "",
    };
    fw.rules = [...(fw.rules ?? []), rule];
    fwSaved = false;
  }

  function removeRule(i: number) {
    if (!fw) return;
    fw.rules = (fw.rules ?? []).filter((_, idx) => idx !== i);
    fwSaved = false;
  }

  async function saveFirewall() {
    if (!fw) return;
    fwError = null;
    fwSaved = false;
    // Normalize before sending: drop blank strings, and clear the port for
    // protocols that don't carry one (the backend rejects it otherwise).
    const rules = (fw.rules ?? []).map((r) => ({
      action: r.action,
      protocol: r.protocol,
      source_cidr: r.source_cidr?.trim() ? r.source_cidr.trim() : undefined,
      dest_port: portable(r.protocol) && r.dest_port != null ? Number(r.dest_port) : undefined,
      description: r.description?.trim() ? r.description.trim() : undefined,
    }));
    fwSaving = true;
    try {
      const saved = await client().updateFirewall({
        enabled: fw.enabled,
        default_input_policy: fw.default_input_policy,
        rules,
      });
      fw = normalizeFw(saved);
      fwSaved = true;
    } catch (e) {
      fwError = e instanceof ApiRequestError ? e.body.message : String(e);
    } finally {
      fwSaving = false;
    }
  }
</script>

<div class="container">
  <h1>Network</h1>
  {#if error}<p class="error">{error}</p>{/if}

  <h2>Bridges</h2>
  <div class="card">
    {#if bridges.length === 0}
      <p class="muted">No bridges configured.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th>State</th><th>Ports</th><th>VLAN-aware</th><th>MTU</th></tr>
        </thead>
        <tbody>
          {#each bridges as br (br.id)}
            <tr>
              <td>{br.name}</td>
              <td>{br.state}</td>
              <td>{br.ports.join(", ") || "-"}</td>
              <td>{br.vlan_aware ? "yes" : "no"}</td>
              <td>{br.mtu}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <h2>VLANs</h2>
  <div class="card">
    {#if vlans.length === 0}
      <p class="muted">No VLANs configured.</p>
    {:else}
      <table>
        <thead><tr><th>Tag</th><th>Bridge</th><th>Name</th></tr></thead>
        <tbody>
          {#each vlans as vlan (vlan.id)}
            <tr>
              <td>{vlan.tag}</td>
              <td>{vlan.bridge}</td>
              <td>{vlan.name ?? "-"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <h2>Host firewall</h2>
  <div class="card">
    <p class="muted sub">
      Filters traffic to the node itself (management API, SSH, host services). This is
      separate from per-VM guest firewalls. Loopback and established connections are always
      allowed, so they never need a rule.
    </p>

    {#if fwError}<p class="error">{fwError}</p>{/if}

    {#if !fw}
      <p class="muted">Loading…</p>
    {:else}
      <div class="fw-controls">
        <label class="check">
          <input type="checkbox" bind:checked={fw.enabled} onchange={() => (fwSaved = false)} />
          <span>Enable host firewall</span>
        </label>
        <label class="policy">
          <span>Default for unmatched traffic</span>
          <select bind:value={fw.default_input_policy} onchange={() => (fwSaved = false)}>
            <option value="accept">Accept</option>
            <option value="drop">Drop</option>
          </select>
        </label>
      </div>

      {#if fw.enabled && fw.default_input_policy === "drop"}
        <p class="warn">
          Default-drop is active. Make sure a rule below admits your management port
          (e.g. TCP 8080) and SSH before saving, or you may lock yourself out of the node.
        </p>
      {/if}

      <table class="rules">
        <thead>
          <tr>
            <th>Action</th><th>Protocol</th><th>Source CIDR</th><th>Port</th><th>Description</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#if (fw.rules ?? []).length === 0}
            <tr><td colspan="6" class="muted">No rules. Unmatched traffic uses the default policy.</td></tr>
          {/if}
          {#each fw.rules ?? [] as rule, i (i)}
            <tr>
              <td>
                <select bind:value={rule.action} onchange={() => (fwSaved = false)}>
                  <option value="accept">Accept</option>
                  <option value="drop">Drop</option>
                  <option value="reject">Reject</option>
                </select>
              </td>
              <td>
                <select bind:value={rule.protocol} onchange={() => (fwSaved = false)}>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="icmp">ICMP</option>
                  <option value="any">Any</option>
                </select>
              </td>
              <td>
                <input
                  bind:value={rule.source_cidr}
                  placeholder="any"
                  oninput={() => (fwSaved = false)}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  bind:value={rule.dest_port}
                  placeholder={portable(rule.protocol) ? "any" : "—"}
                  disabled={!portable(rule.protocol)}
                  oninput={() => (fwSaved = false)}
                />
              </td>
              <td>
                <input
                  bind:value={rule.description}
                  placeholder="optional"
                  oninput={() => (fwSaved = false)}
                />
              </td>
              <td class="row-actions">
                <button type="button" onclick={() => removeRule(i)}>Remove</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="fw-buttons">
        <button type="button" class="small" onclick={addRule}>Add rule</button>
        <div class="spacer"></div>
        {#if fwSaved}<span class="ok">Applied.</span>{/if}
        <button type="button" class="primary" disabled={fwSaving} onclick={saveFirewall}>
          {fwSaving ? "Applying…" : "Save & apply"}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .sub {
    font-size: 0.85rem;
    margin: 0 0 0.9rem;
  }
  .fw-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.2rem;
    margin-bottom: 0.8rem;
  }
  .check,
  .policy {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  .policy select,
  .rules select,
  .rules input {
    padding: 0.35rem 0.45rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-size: 0.82rem;
  }
  .rules input {
    width: 100%;
    box-sizing: border-box;
  }
  .rules input:disabled {
    opacity: 0.5;
  }
  .rules td {
    vertical-align: middle;
  }
  .row-actions {
    text-align: right;
  }
  .row-actions button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .row-actions button:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
  .fw-buttons {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }
  .fw-buttons .spacer {
    flex: 1;
  }
  button.small {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    font-size: 0.82rem;
  }
  .ok {
    color: #34d399;
    font-size: 0.85rem;
  }
  .warn {
    background: color-mix(in srgb, #f59e0b 14%, transparent);
    border: 1px solid #f59e0b55;
    color: #fbbf24;
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    font-size: 0.85rem;
    margin-bottom: 0.8rem;
  }
</style>

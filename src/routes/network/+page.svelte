<script lang="ts">
  import { client } from "$lib/api/session";
  import { ApiRequestError } from "$lib/api";
  import type { Bridge, Vlan } from "@daygleve/schema";

  let bridges = $state<Bridge[]>([]);
  let vlans = $state<Vlan[]>([]);
  let error = $state<string | null>(null);

  $effect(() => {
    const c = client();
    Promise.all([c.listBridges(), c.listVlans()])
      .then(([b, v]) => {
        bridges = b;
        vlans = v;
      })
      .catch((e) => (error = e instanceof ApiRequestError ? e.body.message : String(e)));
  });
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
              <td>{br.ports.join(", ") || "—"}</td>
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
              <td>{vlan.name ?? "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

# DaygleVE-frontend

The **web control panel** for [DaygleVE](https://github.com/daygle) — a modern,
single-node virtualization platform. Built with
[SvelteKit](https://svelte.dev/docs/kit) + TypeScript.

## Responsibilities

- Dashboard
- VM list + controls
- LXC container list + controls
- Storage pools + ZFS snapshots
- Network topology + VLAN management
- Real-time metrics (SSE)
- noVNC integration for VM consoles
- Authentication UI

## Repo boundary

- Imports **all** API types from
  [`DaygleVE-schema`](https://github.com/daygle/DaygleVE-schema) via the
  `@daygleve/schema` package; never redefines wire shapes locally.
- Contains **no** backend logic or Rust code.

## Architecture

```
src/
  app.html app.css app.d.ts
  lib/
    api/
      client.ts     # typed DaygleClient wrapping the REST API
      session.ts    # builds a client with the current bearer token
      index.ts      # re-exports client + @daygleve/schema types
    stores/auth.ts  # token + user, persisted to localStorage
    components/      # Nav, StateBadge
  routes/
    +layout.svelte  # nav shell + client-side auth guard
    +layout.ts      # ssr = false (client-rendered control panel)
    +page.svelte              # dashboard
    login/+page.svelte
    vms/+page.svelte
    vms/[id]/+page.svelte
    containers/+page.svelte
    storage/+page.svelte
    network/+page.svelte
    metrics/+page.svelte
```

All API access goes through `DaygleClient` (`src/lib/api/client.ts`), whose
every method is typed against `@daygleve/schema`. No component talks to `fetch`
directly.

## Development

```sh
npm install
npm run dev            # http://localhost:5173
```

The dev server proxies `/api` to the backend (default `http://localhost:8080`;
override with `DAYGLEVE_API_URL`). Sign in via the seeded dev admin.

```sh
npm run check          # svelte-check + tsc type checking
npm run build          # production build (adapter-node)
```

## Notes

- **noVNC**: `vms/[id]` requests a console ticket
  (`POST /api/v1/vms/{id}/console`); mounting the noVNC client against the
  returned websocket path is marked `TODO(console)`.
- **Live metrics**: the backend exposes an SSE stream at
  `/api/v1/metrics/stream`. Because `EventSource` cannot send an
  `Authorization` header, the metrics page currently polls the point-in-time
  endpoint; wiring SSE needs a token-in-query/cookie scheme on the backend.

## License

Apache-2.0.

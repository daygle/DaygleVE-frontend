/**
 * Typed REST client for the DaygleVE backend.
 *
 * Every request/response type is imported from `@daygleve/schema` — the shared
 * contract published by DaygleVE-schema. This file contains no business logic
 * beyond HTTP plumbing and never redefines a wire shape locally.
 */
import type {
  ApiError,
  BindGpuRequest,
  Bridge,
  CloneSnapshotRequest,
  ConsoleTicket,
  CreateBridgeRequest,
  CreateDatasetRequest,
  CreateLxcRequest,
  CreateSnapshotRequest,
  CreateShareRequest,
  ChangePasswordRequest,
  CloneVmRequest,
  CreateUserRequest,
  CreateVlanRequest,
  CreateVmRequest,
  CreateVmSnapshotRequest,
  CurrentUser,
  Dataset,
  NetworkShare,
  OperationRecord,
  UpdateUserRequest,
  User,
  GpuDevice,
  HealthStatus,
  IsoImage,
  LoginRequest,
  LoginResponse,
  Lxc,
  LxcPowerRequest,
  LxcSummary,
  NodeMetrics,
  Pool,
  Snapshot,
  UpdateLxcRequest,
  UpdateVmRequest,
  Vlan,
  Vm,
  VmPowerRequest,
  VmSnapshot,
  VmSummary,
} from "@daygleve/schema";

/** Base path for the versioned API. Matches the backend router. */
const API_BASE = "/api/v1";

/** Error thrown for any non-2xx response, carrying the schema `ApiError`. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.message);
    this.name = "ApiRequestError";
  }
}

/** Options for constructing a client. */
export interface ClientOptions {
  /** Bearer token; when set, sent as `Authorization: Bearer <token>`. */
  token?: string;
  /** Override the base URL (defaults to same-origin `/api/v1`). */
  baseUrl?: string;
  /** Injectable fetch (SvelteKit passes its `fetch` during load). */
  fetch?: typeof globalThis.fetch;
  /** Called when the backend rejects the session, so the UI can return to login. */
  onUnauthorized?: () => void;
}

/**
 * A thin, fully-typed wrapper over the DaygleVE REST API. Construct one per
 * request scope (e.g. in a SvelteKit `load`) so the right `fetch`/token is used.
 */
export class DaygleClient {
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof globalThis.fetch;
  private readonly onUnauthorized?: () => void;

  constructor(opts: ClientOptions = {}) {
    this.token = opts.token;
    this.baseUrl = opts.baseUrl ?? API_BASE;
    this.doFetch = opts.fetch ?? globalThis.fetch;
    this.onUnauthorized = opts.onUnauthorized;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;

    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    if (!res.ok) {
      const err = (await res.json().catch(() => ({
        code: "internal",
        message: res.statusText,
      }))) as ApiError;
      if (res.status === 401) this.onUnauthorized?.();
      const requestId = res.headers.get("x-request-id");
      if (requestId && !err.request_id) err.request_id = requestId;
      throw new ApiRequestError(res.status, err);
    }

    return (await res.json()) as T;
  }

  // --- system ---------------------------------------------------------------
  health(): Promise<HealthStatus> {
    return this.request("GET", "/health");
  }

  // --- operations -----------------------------------------------------------
  listOperations(): Promise<OperationRecord[]> {
    return this.request("GET", "/operations");
  }

  // --- auth -----------------------------------------------------------------
  login(req: LoginRequest): Promise<LoginResponse> {
    return this.request("POST", "/auth/login", req);
  }
  me(): Promise<CurrentUser> {
    return this.request("GET", "/auth/me");
  }
  logout(): Promise<void> {
    return this.request("POST", "/auth/logout");
  }
  changePassword(req: ChangePasswordRequest): Promise<void> {
    return this.request("POST", "/auth/change-password", req);
  }

  // --- users ----------------------------------------------------------------
  listUsers(): Promise<User[]> {
    return this.request("GET", "/users");
  }
  createUser(req: CreateUserRequest): Promise<User> {
    return this.request("POST", "/users", req);
  }
  updateUser(id: string, req: UpdateUserRequest): Promise<User> {
    return this.request("PATCH", `/users/${id}`, req);
  }
  deleteUser(id: string): Promise<void> {
    return this.request("DELETE", `/users/${id}`);
  }

  // --- vms ------------------------------------------------------------------
  listVms(): Promise<VmSummary[]> {
    return this.request("GET", "/vms");
  }
  /** Installer/live ISOs available to attach as VM install media. */
  listIsos(): Promise<IsoImage[]> {
    return this.request("GET", "/vms/iso-images");
  }
  getVm(id: string): Promise<Vm> {
    return this.request("GET", `/vms/${id}`);
  }
  createVm(req: CreateVmRequest): Promise<Vm> {
    return this.request("POST", "/vms", req);
  }
  updateVm(id: string, req: UpdateVmRequest): Promise<Vm> {
    return this.request("PATCH", `/vms/${id}`, req);
  }
  deleteVm(id: string): Promise<void> {
    return this.request("DELETE", `/vms/${id}`);
  }
  powerVm(id: string, req: VmPowerRequest): Promise<Vm> {
    return this.request("POST", `/vms/${id}/power`, req);
  }
  cloneVm(id: string, req: CloneVmRequest): Promise<Vm> {
    return this.request("POST", `/vms/${id}/clone`, req);
  }
  vmConsole(id: string): Promise<ConsoleTicket> {
    return this.request("POST", `/vms/${id}/console`);
  }
  listVmSnapshots(id: string): Promise<VmSnapshot[]> {
    return this.request("GET", `/vms/${id}/snapshots`);
  }
  createVmSnapshot(id: string, req: CreateVmSnapshotRequest): Promise<VmSnapshot> {
    return this.request("POST", `/vms/${id}/snapshots`, req);
  }
  rollbackVmSnapshot(id: string, name: string): Promise<void> {
    return this.request("POST", `/vms/${id}/snapshots/${encodeURIComponent(name)}/rollback`);
  }
  deleteVmSnapshot(id: string, name: string): Promise<void> {
    return this.request("DELETE", `/vms/${id}/snapshots/${encodeURIComponent(name)}`);
  }

  // --- containers -----------------------------------------------------------
  listContainers(): Promise<LxcSummary[]> {
    return this.request("GET", "/containers");
  }
  getContainer(id: string): Promise<Lxc> {
    return this.request("GET", `/containers/${id}`);
  }
  createContainer(req: CreateLxcRequest): Promise<Lxc> {
    return this.request("POST", "/containers", req);
  }
  updateContainer(id: string, req: UpdateLxcRequest): Promise<Lxc> {
    return this.request("PATCH", `/containers/${id}`, req);
  }
  deleteContainer(id: string): Promise<void> {
    return this.request("DELETE", `/containers/${id}`);
  }
  powerContainer(id: string, req: LxcPowerRequest): Promise<Lxc> {
    return this.request("POST", `/containers/${id}/power`, req);
  }

  // --- storage --------------------------------------------------------------
  listPools(): Promise<Pool[]> {
    return this.request("GET", "/storage/pools");
  }
  listDatasets(): Promise<Dataset[]> {
    return this.request("GET", "/storage/datasets");
  }
  createDataset(req: CreateDatasetRequest): Promise<Dataset> {
    return this.request("POST", "/storage/datasets", req);
  }
  listSnapshots(datasetId: string): Promise<Snapshot[]> {
    return this.request("GET", `/storage/datasets/${datasetId}/snapshots`);
  }
  createSnapshot(datasetId: string, req: CreateSnapshotRequest): Promise<Snapshot> {
    return this.request("POST", `/storage/datasets/${datasetId}/snapshots`, req);
  }
  cloneSnapshot(snapshotId: string, req: CloneSnapshotRequest): Promise<Dataset> {
    return this.request("POST", `/storage/snapshots/${snapshotId}/clone`, req);
  }
  /** Network shares (NFS/CIFS) used as ISO content sources. */
  listShares(): Promise<NetworkShare[]> {
    return this.request("GET", "/storage/shares");
  }
  createShare(req: CreateShareRequest): Promise<NetworkShare> {
    return this.request("POST", "/storage/shares", req);
  }
  deleteShare(id: string): Promise<void> {
    return this.request("DELETE", `/storage/shares/${id}`);
  }

  // --- network --------------------------------------------------------------
  listBridges(): Promise<Bridge[]> {
    return this.request("GET", "/network/bridges");
  }
  createBridge(req: CreateBridgeRequest): Promise<Bridge> {
    return this.request("POST", "/network/bridges", req);
  }
  listVlans(): Promise<Vlan[]> {
    return this.request("GET", "/network/vlans");
  }
  createVlan(req: CreateVlanRequest): Promise<Vlan> {
    return this.request("POST", "/network/vlans", req);
  }

  // --- gpus -----------------------------------------------------------------
  listGpus(): Promise<GpuDevice[]> {
    return this.request("GET", "/gpus");
  }
  bindGpu(pciAddress: string, req: BindGpuRequest): Promise<GpuDevice> {
    return this.request("POST", `/gpus/${encodeURIComponent(pciAddress)}/bind`, req);
  }

  // --- metrics --------------------------------------------------------------
  nodeMetrics(): Promise<NodeMetrics> {
    return this.request("GET", "/metrics/node");
  }
  /**
   * URL of the SSE metrics stream; open with `new EventSource(url)`. The
   * bearer token is carried as a `?token=` query param because `EventSource`
   * cannot set an `Authorization` header.
   */
  metricsStreamUrl(): string {
    const q = this.token ? `?token=${encodeURIComponent(this.token)}` : "";
    return `${this.baseUrl}/metrics/stream${q}`;
  }

  /**
   * ws:// / wss:// URL for a VM console ticket, ready for a noVNC `RFB` client.
   * `websocket_path` from the ticket already carries the one-time ticket query
   * param. When an origin can be resolved (in the browser, or from an absolute
   * `baseUrl`) the result is absolute and targets the API host, not the page
   * host. Otherwise — SSR with a relative `baseUrl`, or a parse failure — the
   * input path is returned unchanged; an already-absolute ws(s) URL is passed
   * through as-is.
   */
  consoleWebsocketUrl(ticketPath: string): string {
    if (/^wss?:\/\//i.test(ticketPath)) return ticketPath;
    const pageHref =
      typeof window !== "undefined" ? window.location.href : undefined;
    try {
      const apiOrigin = new URL(this.baseUrl, pageHref).origin;
      const url = new URL(ticketPath, apiOrigin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.toString();
    } catch {
      return ticketPath;
    }
  }
}

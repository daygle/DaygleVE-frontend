/**
 * Typed REST client for the DaygleVE backend.
 *
 * Every request/response type is imported from `@daygleve/schema` — the shared
 * contract published by DaygleVE-schema. This file contains no business logic
 * beyond HTTP plumbing and never redefines a wire shape locally.
 */
import type {
  ApiError,
  BackupArtifact,
  BackupPlan,
  BindGpuRequest,
  Bridge,
  BrokerSplitInventory,
  ChangePasswordRequest,
  CloneSnapshotRequest,
  CloneVmRequest,
  ConsoleTicket,
  CreateBridgeRequest,
  CreateBackupPlanRequest,
  CreateDatasetRequest,
  CreateLxcRequest,
  CreateLxcSnapshotRequest,
  CreateShareRequest,
  CreateSnapshotRequest,
  CreateUserRequest,
  CreateVlanRequest,
  CreateVmRequest,
  CreateVmSnapshotRequest,
  CurrentUser,
  Dataset,
  GpuDevice,
  HealthStatus,
  IsoImage,
  Lxc,
  LxcPowerRequest,
  LxcSnapshot,
  LxcSummary,
  LoginRequest,
  LoginResponse,
  NetworkShare,
  NodeMetrics,
  OperationRecord,
  OperationStatus,
  Pool,
  QuarantineDecisionRequest,
  ReconciliationQuarantineRecord,
  RestoreBackupRequest,
  Snapshot,
  UpdateBackupPlanRequest,
  UpdateLxcRequest,
  UpdateUserRequest,
  UpdateVmRequest,
  User,
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

  // --- backups --------------------------------------------------------------
  listBackupPlans(): Promise<BackupPlan[]> {
    return this.request("GET", "/backups/plans");
  }
  createBackupPlan(req: CreateBackupPlanRequest): Promise<BackupPlan> {
    return this.request("POST", "/backups/plans", req);
  }
  updateBackupPlan(id: string, req: UpdateBackupPlanRequest): Promise<BackupPlan> {
    return this.request("PATCH", `/backups/plans/${encodeURIComponent(id)}`, req);
  }
  deleteBackupPlan(id: string): Promise<void> {
    return this.request("DELETE", `/backups/plans/${encodeURIComponent(id)}`);
  }
  runBackupPlan(id: string): Promise<OperationRecord> {
    return this.request("POST", `/backups/plans/${encodeURIComponent(id)}/run`);
  }
  listBackupArtifacts(planId?: string): Promise<BackupArtifact[]> {
    const query = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";
    return this.request("GET", `/backups/artifacts${query}`);
  }
  restoreBackup(id: string, req: RestoreBackupRequest): Promise<OperationRecord> {
    return this.request("POST", `/backups/artifacts/${encodeURIComponent(id)}/restore`, req);
  }

  // --- system ---------------------------------------------------------------
  health(): Promise<HealthStatus> {
    return this.request("GET", "/health");
  }
  /** Read-only view of the current broker split posture (security inventory). */
  brokerSplitInventory(): Promise<BrokerSplitInventory> {
    return this.request("GET", "/system/broker-split");
  }

  // --- operations -----------------------------------------------------------
  listOperations(): Promise<OperationRecord[]> {
    return this.request("GET", "/operations");
  }
  getOperation(id: string): Promise<OperationRecord> {
    return this.request("GET", `/operations/${encodeURIComponent(id)}`);
  }
  /**
   * Poll an operation until it reaches a terminal state (succeeded, failed,
   * needs_review, or cancelled) or the attempt budget runs out, returning the
   * latest record either way. Callers should inspect the result with
   * {@link operationFailureMessage} and surface any failure — a terminal state
   * other than `succeeded` is not thrown.
   */
  async pollOperation(
    op: OperationRecord,
    opts?: { attempts?: number; intervalMs?: number },
  ): Promise<OperationRecord> {
    const attempts = opts?.attempts ?? 60;
    const intervalMs = opts?.intervalMs ?? 1000;
    let record = op;
    for (let i = 0; i < attempts; i++) {
      record = await this.getOperation(op.id);
      if (isTerminalOperation(record.status)) return record;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return record;
  }
  reconcileOperations(opts?: { mode?: "dry_run" | "repair"; approval_id?: string; quarantine_unmanaged?: boolean }): Promise<OperationRecord> {
    return this.request("POST", "/operations/reconcile", opts);
  }

  // --- reconciliation findings ---------------------------------------------
  listQuarantine(): Promise<ReconciliationQuarantineRecord[]> {
    return this.request("GET", "/operations/quarantine");
  }

  decideQuarantine(id: string, req: QuarantineDecisionRequest): Promise<ReconciliationQuarantineRecord> {
    return this.request("PATCH", `/operations/quarantine/${encodeURIComponent(id)}`, req);
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
  createVm(req: CreateVmRequest): Promise<OperationRecord> {
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
  cloneVm(id: string, req: CloneVmRequest): Promise<OperationRecord> {
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
  createContainer(req: CreateLxcRequest): Promise<OperationRecord> {
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
  listContainerSnapshots(id: string): Promise<LxcSnapshot[]> {
    return this.request("GET", `/containers/${id}/snapshots`);
  }
  createContainerSnapshot(id: string, req: CreateLxcSnapshotRequest): Promise<LxcSnapshot> {
    return this.request("POST", `/containers/${id}/snapshots`, req);
  }
  rollbackContainerSnapshot(id: string, name: string): Promise<void> {
    return this.request("POST", `/containers/${id}/snapshots/${encodeURIComponent(name)}/rollback`);
  }
  deleteContainerSnapshot(id: string, name: string): Promise<void> {
    return this.request("DELETE", `/containers/${id}/snapshots/${encodeURIComponent(name)}`);
  }

  // --- storage --------------------------------------------------------------
  listPools(): Promise<Pool[]> {
    return this.request("GET", "/storage/pools");
  }
  listDatasets(): Promise<Dataset[]> {
    return this.request("GET", "/storage/datasets");
  }
  createDataset(req: CreateDatasetRequest): Promise<OperationRecord> {
    return this.request("POST", "/storage/datasets", req);
  }
  listSnapshots(datasetId: string): Promise<Snapshot[]> {
    return this.request("GET", `/storage/datasets/${datasetId}/snapshots`);
  }
  createSnapshot(datasetId: string, req: CreateSnapshotRequest): Promise<OperationRecord> {
    return this.request("POST", `/storage/datasets/${datasetId}/snapshots`, req);
  }
  cloneSnapshot(snapshotId: string, req: CloneSnapshotRequest): Promise<OperationRecord> {
    return this.request("POST", `/storage/snapshots/${snapshotId}/clone`, req);
  }
  /** Network shares (NFS/CIFS) used as ISO content sources. */
  listShares(): Promise<NetworkShare[]> {
    return this.request("GET", "/storage/shares");
  }
  createShare(req: CreateShareRequest): Promise<OperationRecord> {
    return this.request("POST", "/storage/shares", req);
  }
  deleteShare(id: string): Promise<void> {
    return this.request("DELETE", `/storage/shares/${id}`);
  }

  // --- network --------------------------------------------------------------
  listBridges(): Promise<Bridge[]> {
    return this.request("GET", "/network/bridges");
  }
  createBridge(req: CreateBridgeRequest): Promise<OperationRecord> {
    return this.request("POST", "/network/bridges", req);
  }
  listVlans(): Promise<Vlan[]> {
    return this.request("GET", "/network/vlans");
  }
  createVlan(req: CreateVlanRequest): Promise<OperationRecord> {
    return this.request("POST", "/network/vlans", req);
  }

  // --- gpus -----------------------------------------------------------------
  listGpus(): Promise<GpuDevice[]> {
    return this.request("GET", "/gpus");
  }
  bindGpu(pciAddress: string, req: BindGpuRequest): Promise<OperationRecord> {
    return this.request("POST", `/gpus/${encodeURIComponent(pciAddress)}/bind`, req);
  }

  // --- metrics --------------------------------------------------------------
  nodeMetrics(): Promise<NodeMetrics> {
    return this.request("GET", "/metrics/node");
  }
  /**
   * Mint a short-lived, one-time ticket for the SSE metrics stream. The bearer
   * token travels here in the `Authorization` header (via {@link request}), so
   * it never lands in a URL. Exchange it for a stream URL with
   * {@link metricsStreamUrl}; mint a fresh ticket for every (re)connection.
   */
  metricsStreamTicket(): Promise<MetricsStreamTicket> {
    return this.request("POST", "/metrics/stream/ticket");
  }
  /**
   * URL of the SSE metrics stream for a ticket from {@link metricsStreamTicket};
   * open with `new EventSource(url)`. The one-time ticket — not the long-lived
   * bearer token — is what rides in the query string.
   */
  metricsStreamUrl(ticket: string): string {
    return `${this.baseUrl}/metrics/stream?ticket=${encodeURIComponent(ticket)}`;
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

/**
 * A short-lived, one-time authorization to open the SSE metrics stream. This is
 * an internal transport handshake (not a resource in the shared schema): the
 * browser exchanges its bearer token for a ticket so the token never rides in a
 * stream URL.
 */
export interface MetricsStreamTicket {
  ticket: string;
  expires_at: string;
}

/** Operation states from which no further transition occurs. */
const TERMINAL_OPERATION_STATES: readonly OperationStatus[] = [
  "succeeded",
  "failed",
  "needs_review",
  "cancelled",
];

/** Whether an operation has reached a terminal state. */
export function isTerminalOperation(status: OperationStatus): boolean {
  return TERMINAL_OPERATION_STATES.includes(status);
}

/**
 * A user-facing failure message for a polled operation, or `null` when it
 * succeeded. Covers the non-success terminal states plus the timed-out case
 * (a record still `queued`/`running` after polling gave up), preferring the
 * operation's own `error`/`message` when present.
 */
export function operationFailureMessage(record: OperationRecord): string | null {
  if (record.status === "succeeded") return null;
  const detail = record.error ?? record.message ?? null;
  switch (record.status) {
    case "failed":
      return detail ?? "the operation failed";
    case "cancelled":
      return detail ?? "the operation was cancelled";
    case "needs_review":
      return detail ?? "the operation needs review; check host state";
    default:
      // Still queued/running when polling gave up: report it as unfinished
      // rather than as a success.
      return detail ?? "the operation is still running; check Operations for its outcome";
  }
}

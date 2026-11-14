import { isRequestKey } from "./request-key";
import type { PendingRequestRecord, PendingRequestStatus, PendingRequestStore } from "./requests";
import type { SubmitMessageRequest } from "./types";

/**
 * IndexedDB-backed `PendingRequestStore` — prepared for the future HTTP mode, NOT enabled in the public fixture
 * preview (see `selectPendingRequestStore`).
 *
 * Guarantees:
 * - Scoped to an authenticated principal (`userId` + `orgId`). Records of other principals are invisible and are
 *   removed by `purgeOtherPrincipals` (account switch) / `clearPrincipal` (logout).
 * - Reads are served from an in-memory cache (the coordinator's API is synchronous); writes go to IndexedDB in
 *   order. `flush()` resolves when every earlier write is committed and REJECTS when one failed — the coordinator
 *   then does not POST (fail closed). After a failed write the store stays "poisoned": every later `flush()`
 *   rejects until `refresh()` succeeds, so no request is sent on top of an unknown persisted state.
 * - `refresh()` reloads the principal's records (another tab may have written them). A `BroadcastChannel` (when
 *   available) prompts other tabs to refresh after each commit; the server's `409 thread_busy` stays authoritative.
 * - Versioned: the database version (`DB_VERSION`) owns the object-store layout; each row carries
 *   `schemaVersion` (`RECORD_SCHEMA_VERSION`). A row that cannot be decoded (unknown schema version, damaged
 *   payload) ALWAYS fences its thread as `unresolved` whatever status it claims — that status cannot be trusted
 *   either — and its payload is never resent (`payloadUnavailable`). It is never silently dropped.
 * - Retention: `rejected` and `superseded` records are deleted after `retentionDays` (default 30). Fencing records
 *   (`sending`, `accepted`, `unresolved`) are kept until a recovery read resolves them or the user supersedes them.
 *
 * Not a server history: rows hold the user's own unsent/unknown request payloads only, so they can be recovered by
 * key. Payloads are stored in plaintext inside the browser profile's origin storage; encryption at rest is a
 * deferred decision (docs/workspace-v2.md).
 */

export const PENDING_DB_NAME = "brenvio-pending-requests";
/** Bump together with a migration in `upgrade()` whenever the object-store layout or row shape changes. */
export const DB_VERSION = 1;
export const RECORD_SCHEMA_VERSION = 1;
const STORE = "records";
const BY_SCOPE = "by_scope";
const CHANNEL = "brenvio-pending-requests";
const DAY = 24 * 60 * 60 * 1000;

/** The authenticated principal the records belong to. Never derived from fixture data or client input. */
export interface PendingStorePrincipal {
  userId: string;
  orgId: string;
}

export function scopeOf(principal: PendingStorePrincipal): string {
  return `u:${principal.userId}|o:${principal.orgId}`;
}

/** Row layout (schema version 1). `scope`, `requestKey` and `threadId` stay top-level in every version. */
interface StoredRow {
  scope: string;
  userId: string;
  requestKey: string;
  threadId: string;
  revision: number;
  schemaVersion: number;
  status: PendingRequestStatus;
  payload: SubmitMessageRequest;
  supersededBy?: string;
  projectId?: string;
  /** Written by this store for a record whose payload was already unavailable; the placeholder is never resent. */
  payloadUnavailable?: true;
  createdAt: string;
  updatedAt: string;
}

const STATUSES: ReadonlySet<string> = new Set(["sending", "unresolved", "accepted", "rejected", "superseded"]);

/**
 * Decodes a row into a record.
 * - Valid current-schema row: its status is used as written (an invalid status becomes `unresolved`).
 * - Valid current-schema row marked `payloadUnavailable` (this store rewrote a record whose payload was already
 *   unreadable, e.g. after the user superseded it): status as written, payload never resendable.
 * - Anything else that still identifies a thread and key (unknown schema version, damaged payload): fail closed —
 *   `unresolved` regardless of the claimed status (even `rejected` / `superseded`), `payloadUnavailable`.
 */
export function decodeRow(row: unknown): PendingRequestRecord | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<StoredRow>;
  if (typeof r.threadId !== "string" || typeof r.requestKey !== "string" || !isRequestKey(r.requestKey)) return null;
  const revision = Number.isInteger(r.revision) && (r.revision as number) >= 1 ? (r.revision as number) : 1;
  const payloadOk =
    r.schemaVersion === RECORD_SCHEMA_VERSION &&
    !!r.payload &&
    typeof r.payload === "object" &&
    typeof r.payload.message === "string" &&
    r.payload.request_key === r.requestKey &&
    r.payload.revision === revision;
  const status: PendingRequestStatus = typeof r.status === "string" && STATUSES.has(r.status) ? r.status : "unresolved";
  const base = {
    threadId: r.threadId,
    requestKey: r.requestKey,
    revision,
    ...(typeof r.projectId === "string" ? { projectId: r.projectId } : {}),
    ...(typeof r.createdAt === "string" ? { createdAt: r.createdAt } : {}),
    ...(typeof r.supersededBy === "string" && isRequestKey(r.supersededBy) ? { supersededBy: r.supersededBy } : {}),
  };
  const placeholder = { message: "", request_key: r.requestKey, revision };
  if (payloadOk && r.payloadUnavailable === true) {
    return deepFreeze({ ...base, status, payload: placeholder, payloadUnavailable: true as const });
  }
  if (payloadOk) return deepFreeze({ ...base, status, payload: r.payload as SubmitMessageRequest });
  // Unknown schema / damaged: no field of it can be trusted, the claimed status included. Fence the thread and
  // never resend; only a recovery read or an acknowledged new request in that thread resolves it.
  const { supersededBy: _untrusted, ...identity } = base as typeof base & { supersededBy?: string };
  return deepFreeze({ ...identity, status: "unresolved" as const, payload: placeholder, payloadUnavailable: true as const });
}

function encodeRow(principal: PendingStorePrincipal, record: PendingRequestRecord, now: Date): StoredRow {
  return {
    scope: scopeOf(principal),
    userId: principal.userId,
    requestKey: record.requestKey,
    threadId: record.threadId,
    revision: record.revision,
    schemaVersion: RECORD_SCHEMA_VERSION,
    status: record.status,
    payload: structuredClone(record.payload) as SubmitMessageRequest,
    ...(record.supersededBy ? { supersededBy: record.supersededBy } : {}),
    ...(record.projectId ? { projectId: record.projectId } : {}),
    ...(record.payloadUnavailable ? { payloadUnavailable: true as const } : {}),
    createdAt: record.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Migrations by database version. v1: one store keyed by [scope, requestKey] with a scope index. */
function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    const store = db.createObjectStore(STORE, { keyPath: ["scope", "requestKey"] });
    store.createIndex(BY_SCOPE, "scope", { unique: false });
  }
}

export function openPendingDb(factory: IDBFactory, name = PENDING_DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = (event) => upgrade(request.result, (event as IDBVersionChangeEvent).oldVersion);
    request.onsuccess = () => {
      const db = request.result;
      // A newer tab upgrading the schema: close so it is not blocked; this tab's flushes then fail closed.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
  });
}

export interface IndexedDbStoreOptions {
  indexedDB: IDBFactory;
  principal: PendingStorePrincipal;
  dbName?: string;
  now?: () => Date;
  retentionDays?: number;
  /** Injected for tests; defaults to `BroadcastChannel` when the runtime has it. */
  channel?: { postMessage(message: unknown): void; addEventListener(type: "message", fn: () => void): void; close(): void } | null;
}

export class IndexedDbPendingRequestStore implements PendingRequestStore {
  private readonly cache = new Map<string, PendingRequestRecord>();
  private queue: Promise<void> = Promise.resolve();
  private failure: unknown = null;
  private closed = false;
  /** Write counter and the counter value of the last local write per key (protects writes racing a refresh). */
  private generation = 0;
  private readonly localWrites = new Map<string, number>();

  private constructor(
    private readonly db: IDBDatabase,
    readonly principal: PendingStorePrincipal,
    private readonly now: () => Date,
    private readonly retentionMs: number,
    private readonly channel: IndexedDbStoreOptions["channel"],
  ) {
    channel?.addEventListener("message", () => {
      void this.refresh().catch(() => undefined);
    });
  }

  /** Opens the database, applies retention and loads this principal's records. Rejects if IndexedDB is unusable. */
  static async open(options: IndexedDbStoreOptions): Promise<IndexedDbPendingRequestStore> {
    if (!options.principal?.userId || !options.principal?.orgId) throw new Error("A verified principal is required");
    const db = await openPendingDb(options.indexedDB, options.dbName);
    const channel =
      options.channel !== undefined
        ? options.channel
        : typeof BroadcastChannel !== "undefined"
          ? new BroadcastChannel(`${CHANNEL}:${scopeOf(options.principal)}`)
          : null;
    const store = new IndexedDbPendingRequestStore(db, options.principal, options.now ?? (() => new Date()), (options.retentionDays ?? 30) * DAY, channel);
    await store.applyRetention();
    await store.refresh();
    return store;
  }

  get(requestKey: string) {
    return this.cache.get(requestKey);
  }

  list() {
    return [...this.cache.values()];
  }

  put(record: PendingRequestRecord) {
    this.localWrites.set(record.requestKey, ++this.generation);
    this.cache.set(record.requestKey, record);
    const row = encodeRow(this.principal, record, this.now());
    this.enqueue((store) => store.put(row));
  }

  delete(requestKey: string) {
    this.localWrites.set(requestKey, ++this.generation);
    this.cache.delete(requestKey);
    const scope = scopeOf(this.principal);
    this.enqueue((store) => store.delete([scope, requestKey]));
  }

  /** Clears this principal's records (cache and database). */
  clear() {
    this.cache.clear();
    const scope = scopeOf(this.principal);
    this.enqueue((store) => store.delete(IDBKeyRange.bound([scope, ""], [scope, "￿"])));
  }

  async flush(): Promise<void> {
    await this.queue;
    if (this.failure) throw this.failure;
  }

  /** Reloads this principal's records from the database. Clears a previous write failure only on success. */
  async refresh(): Promise<void> {
    const startedAt = this.generation;
    await this.queue.catch(() => undefined);
    const tx = this.db.transaction(STORE, "readonly");
    const rows = await req(tx.objectStore(STORE).index(BY_SCOPE).getAll(scopeOf(this.principal)));
    const next = new Map<string, PendingRequestRecord>();
    for (const row of rows) {
      const record = decodeRow(row);
      if (record) next.set(record.requestKey, record);
    }
    // Local writes issued while this refresh was reading win over what the database returned.
    for (const [key, gen] of this.localWrites) {
      if (gen <= startedAt) continue;
      const local = this.cache.get(key);
      if (local) next.set(key, local);
      else next.delete(key);
    }
    for (const [key, gen] of this.localWrites) if (gen <= startedAt) this.localWrites.delete(key);
    this.cache.clear();
    for (const [k, v] of next) this.cache.set(k, v);
    if (this.generation === startedAt) this.failure = null;
  }

  /** Account switch: deletes every record that does not belong to this principal. */
  async purgeOtherPrincipals(): Promise<number> {
    const scope = scopeOf(this.principal);
    const tx = this.db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const rows = (await req(store.getAll())) as Partial<StoredRow>[];
    let removed = 0;
    for (const row of rows) {
      if (row.scope !== scope) {
        store.delete([row.scope as string, row.requestKey as string]);
        removed += 1;
      }
    }
    await done(tx);
    return removed;
  }

  close() {
    this.closed = true;
    this.channel?.close();
    this.db.close();
  }

  private enqueue(op: (store: IDBObjectStore) => void) {
    this.queue = this.queue.then(async () => {
      try {
        if (this.closed) throw new Error("Pending request store is closed");
        const tx = this.db.transaction(STORE, "readwrite");
        op(tx.objectStore(STORE));
        await done(tx);
        this.channel?.postMessage({ type: "changed" });
      } catch (error) {
        this.failure = error;
      }
    });
  }

  private async applyRetention() {
    const cutoff = this.now().getTime() - this.retentionMs;
    const tx = this.db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const rows = (await req(store.index(BY_SCOPE).getAll(scopeOf(this.principal)))) as Partial<StoredRow>[];
    for (const row of rows) {
      const resolved = row.status === "rejected" || row.status === "superseded";
      const at = Date.parse(row.updatedAt ?? "");
      if (resolved && Number.isFinite(at) && at < cutoff) store.delete([row.scope as string, row.requestKey as string]);
    }
    await done(tx);
  }
}

/**
 * Logout: removes every record of a user (all organizations) without needing an open store instance.
 * Call it from the logout flow BEFORE the session cookie is dropped by the server response.
 */
export async function clearPrincipalRecords(factory: IDBFactory, userId: string, dbName = PENDING_DB_NAME): Promise<number> {
  const db = await openPendingDb(factory, dbName);
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const rows = (await req(store.getAll())) as Partial<StoredRow>[];
    let removed = 0;
    for (const row of rows) {
      if (row.userId === userId) {
        store.delete([row.scope as string, row.requestKey as string]);
        removed += 1;
      }
    }
    await done(tx);
    return removed;
  } finally {
    db.close();
  }
}

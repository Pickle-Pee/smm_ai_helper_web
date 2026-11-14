import { IndexedDbPendingRequestStore, type PendingStorePrincipal } from "./pending-store-idb";
import { LocalSubmitGuardError, MemoryPendingRequestStore, PendingStoreError, type PendingRequestStore, type ThreadLock } from "./requests";

/**
 * Chooses where pending requests are kept.
 *
 * - `transient`: in-memory, per tab. Used whenever there is NO verified principal — which is always the case in
 *   the public fixture preview (F2 has no real sessions; the fixture `getMe` user is test data, not a principal).
 *   Nothing survives a reload, and the UI says so. Fixture server state also resets on reload, so nothing claims
 *   persistence it does not have.
 * - `durable`: IndexedDB scoped to the verified principal (future HTTP mode).
 * - `unavailable`: a principal exists but IndexedDB cannot be opened. Submissions FAIL CLOSED: the store refuses
 *   to accept new records, so no request is sent without a durable record. Recovery reads still work.
 */
export type PendingStoreSelection =
  | { kind: "transient"; store: PendingRequestStore; reason: "no_verified_principal" }
  | { kind: "durable"; store: IndexedDbPendingRequestStore }
  | { kind: "unavailable"; store: PendingRequestStore; error: unknown };

export async function selectPendingRequestStore(options: {
  principal: PendingStorePrincipal | null;
  indexedDB?: IDBFactory | null;
}): Promise<PendingStoreSelection> {
  if (!options.principal) return { kind: "transient", store: new MemoryPendingRequestStore(), reason: "no_verified_principal" };
  const factory = options.indexedDB === undefined ? (typeof indexedDB !== "undefined" ? indexedDB : null) : options.indexedDB;
  if (!factory) return { kind: "unavailable", store: new FailClosedPendingRequestStore(), error: new Error("IndexedDB is not available") };
  try {
    return { kind: "durable", store: await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: options.principal }) };
  } catch (error) {
    return { kind: "unavailable", store: new FailClosedPendingRequestStore(), error };
  }
}

/** Accepts no durable writes: `flush()` always rejects, so the coordinator never POSTs. Reads stay possible. */
export class FailClosedPendingRequestStore extends MemoryPendingRequestStore {
  async flush(): Promise<void> {
    throw new PendingStoreError("Durable request storage is unavailable in this browser");
  }
}

/**
 * Cross-tab exclusivity per thread with the Web Locks API, when present. If another tab holds the thread's lock,
 * the submission is refused locally (`submission_in_progress`). UX only — the server's `409 thread_busy` is
 * authoritative. Returns `undefined` when the runtime has no Web Locks.
 */
export function webLocksThreadLock(scope: string, locks: LockManager | undefined = globalThis.navigator?.locks): ThreadLock | undefined {
  if (!locks) return undefined;
  return <T>(threadId: string, fn: () => Promise<T>) =>
    locks.request(`brenvio:submit:${scope}:${threadId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new LocalSubmitGuardError("submission_in_progress");
      return fn();
    }) as Promise<T>;
}

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { FIXTURE_IDS, fixtures } from "./fixtures";
import { FixtureWebApiV2Client, type FixtureClientOptions } from "./fixture-client";
import {
  clearPrincipalRecords,
  decodeRow,
  IndexedDbPendingRequestStore,
  openPendingDb,
  RECORD_SCHEMA_VERSION,
  scopeOf,
  type PendingStorePrincipal,
} from "./pending-store-idb";
import { FailClosedPendingRequestStore, selectPendingRequestStore } from "./pending-store";
import { createRequestKey } from "./request-key";
import { LocalSubmitGuardError, PendingStoreError, RequestCoordinator, type PendingRequestRecord, type Sleep, type ThreadLock } from "./requests";
import type { SubmittedInput } from "./types";

const noSleep: Sleep = async (_ms, signal) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
};
const MARIA: PendingStorePrincipal = { userId: "42", orgId: FIXTURE_IDS.orgId };
const OTHER: PendingStorePrincipal = { userId: "77", orgId: FIXTURE_IDS.orgId };
const calc: SubmittedInput = { message: fixtures.requests.calculation().message };
const NOW = new Date("2026-11-23T09:05:00Z");

/** Two "tabs" share one IndexedDB (one factory) and one simulated server; each has its own coordinator. */
async function tab(factory: IDBFactory, api: FixtureWebApiV2Client, principal = MARIA, extra: { threadLock?: ThreadLock; channel?: null } = {}) {
  const store = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal, now: () => NOW, channel: extra.channel ?? null });
  const coordinator = new RequestCoordinator(api, { store, sleep: noSleep, threadLock: extra.threadLock });
  return { store, coordinator };
}

function server(options: FixtureClientOptions = {}) {
  const api = new FixtureWebApiV2Client(options);
  return { api, submit: vi.spyOn(api, "submitMessage") };
}

function record(overrides: Partial<PendingRequestRecord> = {}): PendingRequestRecord {
  const key = overrides.requestKey ?? createRequestKey();
  return { threadId: "t-1", requestKey: key, revision: 1, payload: { message: "x", request_key: key, revision: 1 }, status: "unresolved", ...overrides };
}

describe("IndexedDbPendingRequestStore", () => {
  it("persists the record before the POST: a fresh instance (reload) reads it back", async () => {
    const factory = new IDBFactory();
    const { api, submit } = server({ scenario: "direct_result" });
    const a = await tab(factory, api);
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    let seenOnDisk: PendingRequestRecord | undefined;
    submit.mockImplementationOnce(async (threadId, body) => {
      const reloaded = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: null });
      seenOnDisk = reloaded.get(body.request_key);
      reloaded.close();
      return FixtureWebApiV2Client.prototype.submitMessage.call(api, threadId, body);
    });
    await a.coordinator.submitNew(thread.id, calc, { projectId: FIXTURE_IDS.projectId });
    expect(seenOnDisk).toMatchObject({ status: "sending", revision: 1, projectId: FIXTURE_IDS.projectId, payload: { message: calc.message } });
    await a.store.flush();
    const after = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: null });
    expect(after.list()).toEqual([]); // durable state reached → removed
  });

  it("503 + 404 recovery survives a reload as an unresolved fence; reconciliation only reads", async () => {
    const factory = new IDBFactory();
    const { api, submit } = server({ scenario: "unavailable_before_admission" });
    const a = await tab(factory, api);
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    const outcome = await a.coordinator.submitNew(thread.id, calc);
    expect(outcome).toMatchObject({ kind: "unknown", reason: "no_visible_record" });
    await a.store.flush();
    a.store.close();

    // Reload: new store + coordinator, same IndexedDB.
    const b = await tab(factory, api);
    expect(b.coordinator.unresolvedRequests(thread.id)).toHaveLength(1);
    await expect(b.coordinator.submitNew(thread.id, calc)).rejects.toMatchObject({ reason: "unresolved_request" });
    const report = await b.coordinator.reconcileThread(await api.getThread(thread.id));
    expect(report.recovered[0]).toMatchObject({ kind: "unknown", reason: "no_visible_record" });
    expect(report.fenced).toHaveLength(1);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(api.stats.simulatedCoreAdmissions).toBe(0);
  });

  it("reload while running: reconciles with Thread.in_flight and polls instead of submitting again", async () => {
    const factory = new IDBFactory();
    const { api, submit } = server({ scenario: "workflow", pollsUntilDone: 2 });
    const a = await tab(factory, api);
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    const started = await a.coordinator.submitNew(thread.id, calc);
    expect(started).toMatchObject({ kind: "state", result: { state: "running" } });
    await a.store.flush();
    a.store.close();

    const b = await tab(factory, api);
    expect(b.store.list()).toMatchObject([{ status: "accepted" }]);
    const report = await b.coordinator.reconcileThread(await api.getThread(thread.id));
    expect(report.latest?.state).toBe("running");
    const done = await b.coordinator.poll(report.latest!.user_message.id);
    expect(done.state).toBe("completed");
    await b.store.flush();
    expect(b.store.list()).toEqual([]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("two tabs: the second tab sees the first tab's record and does not mint a key", async () => {
    const factory = new IDBFactory();
    const { api, submit } = server({ scenario: "workflow" });
    const a = await tab(factory, api);
    const b = await tab(factory, api);
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    await a.coordinator.submitNew(thread.id, calc);
    await a.store.flush();
    await expect(b.coordinator.submitNew(thread.id, calc)).rejects.toMatchObject({ reason: "unresolved_request" });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("two tabs racing: a shared per-thread lock refuses the second, and the server stays authoritative", async () => {
    const factory = new IDBFactory();
    const { api, submit } = server({ scenario: "direct_result" });
    const held = new Set<string>();
    const lock: ThreadLock = async (threadId, fn) => {
      if (held.has(threadId)) throw new LocalSubmitGuardError("submission_in_progress");
      held.add(threadId);
      try {
        return await fn();
      } finally {
        held.delete(threadId);
      }
    };
    const a = await tab(factory, api, MARIA, { threadLock: lock });
    const b = await tab(factory, api, MARIA, { threadLock: lock });
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    const results = await Promise.allSettled([a.coordinator.submitNew(thread.id, calc), b.coordinator.submitNew(thread.id, calc)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(submit).toHaveBeenCalledTimes(1);

    // Without any client lock, the server's one-in-flight rule rejects the second request of a running thread.
    const { api: api2 } = server({ scenario: "workflow" });
    const c = await tab(new IDBFactory(), api2);
    const d = await tab(new IDBFactory(), api2);
    const t2 = await api2.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    await c.coordinator.submitNew(t2.id, calc);
    const second = await d.coordinator.submitNew(t2.id, calc);
    expect(second).toMatchObject({ kind: "rejected", error: { code: "thread_busy", status: 409 } });
    expect(api2.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("records are isolated per principal; account switch and logout delete them", async () => {
    const factory = new IDBFactory();
    const maria = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: null });
    maria.put(record({ threadId: "t-maria" }));
    await maria.flush();
    const other = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: OTHER, channel: null });
    expect(other.list()).toEqual([]);
    other.put(record({ threadId: "t-other" }));
    await other.flush();

    // Account switch to OTHER: Maria's rows are removed.
    expect(await other.purgeOtherPrincipals()).toBe(1);
    await maria.refresh();
    expect(maria.list()).toEqual([]);
    // Logout of OTHER.
    expect(await clearPrincipalRecords(factory, OTHER.userId)).toBe(1);
    await other.refresh();
    expect(other.list()).toEqual([]);
  });

  it("fails closed: if the record cannot be written, nothing is POSTed", async () => {
    const factory = new IDBFactory();
    const { api, submit } = server({ scenario: "direct_result" });
    const a = await tab(factory, api);
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    a.store.close(); // every later write fails
    await expect(a.coordinator.submitNew(thread.id, calc)).rejects.toBeInstanceOf(PendingStoreError);
    expect(submit).not.toHaveBeenCalled();
    expect(a.coordinator.unresolvedRequests(thread.id)).toEqual([]);

    const fc = new RequestCoordinator(api, { store: new FailClosedPendingRequestStore(), sleep: noSleep });
    await expect(fc.submitNew(thread.id, calc)).rejects.toBeInstanceOf(PendingStoreError);
    expect(submit).not.toHaveBeenCalled();
  });

  it("a failed new-request write keeps earlier keys fencing (no silent un-fence)", async () => {
    const factory = new IDBFactory();
    const { api } = server({ scenario: "unavailable_before_admission" });
    const a = await tab(factory, api);
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    await a.coordinator.submitNew(thread.id, calc);
    await a.store.flush();
    a.store.close();
    await expect(a.coordinator.startNewRequest(thread.id, calc, { acknowledgeMayRegenerate: true })).rejects.toBeInstanceOf(PendingStoreError);
    expect(a.coordinator.unresolvedRequests(thread.id)).toMatchObject([{ status: "unresolved" }]);
  });

  it("selection: no verified principal → transient memory store; no IndexedDB → fail closed", async () => {
    const preview = await selectPendingRequestStore({ principal: null });
    expect(preview).toMatchObject({ kind: "transient", reason: "no_verified_principal" });
    const none = await selectPendingRequestStore({ principal: MARIA, indexedDB: null });
    expect(none.kind).toBe("unavailable");
    await expect(none.store.flush!()).rejects.toBeInstanceOf(PendingStoreError);
    const durable = await selectPendingRequestStore({ principal: MARIA, indexedDB: new IDBFactory() });
    expect(durable.kind).toBe("durable");
  });

  it("versioned rows: damaged or unknown-schema rows keep fencing and never expose a payload to resend", async () => {
    const key = createRequestKey();
    expect(decodeRow({ threadId: "t", requestKey: key, revision: 1, schemaVersion: 99, status: "accepted", payload: { message: "x" } })).toMatchObject({
      status: "unresolved",
      payloadUnavailable: true,
    });
    expect(decodeRow({ threadId: "t", requestKey: "not-a-key" })).toBeNull();
    const ok = decodeRow({
      threadId: "t",
      requestKey: key,
      revision: 1,
      schemaVersion: RECORD_SCHEMA_VERSION,
      status: "sending",
      payload: { message: "x", request_key: key, revision: 1 },
    });
    expect(ok).toMatchObject({ status: "sending" });
    expect(ok?.payloadUnavailable).toBeUndefined();
    expect(Object.isFrozen(ok?.payload)).toBe(true);

    // A damaged row on disk fences its thread after reload.
    const factory = new IDBFactory();
    const db = await openPendingDb(factory);
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put({ scope: scopeOf(MARIA), userId: "42", requestKey: key, threadId: "t-damaged", schemaVersion: 0, status: "garbage" });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
    const store = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: null });
    const coordinator = new RequestCoordinator(new FixtureWebApiV2Client(), { store, sleep: noSleep });
    await expect(coordinator.submitNew("t-damaged", calc)).rejects.toMatchObject({ reason: "unresolved_request" });
  });

  it("retention removes old rejected/superseded rows but keeps fencing rows", async () => {
    const factory = new IDBFactory();
    const old = new Date("2026-09-01T00:00:00Z");
    const s1 = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, now: () => old, channel: null });
    s1.put(record({ status: "superseded" }));
    s1.put(record({ status: "rejected" }));
    s1.put(record({ status: "unresolved" }));
    await s1.flush();
    s1.close();
    const s2 = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, now: () => NOW, channel: null });
    expect(s2.list().map((r) => r.status)).toEqual(["unresolved"]);
  });

  it("broadcasts commits so other tabs refresh", async () => {
    const factory = new IDBFactory();
    const listeners: (() => void)[] = [];
    const bus = { postMessage: () => listeners.forEach((l) => l()), addEventListener: (_: "message", fn: () => void) => listeners.push(fn), close() {} };
    const a = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: { ...bus, postMessage: () => undefined } });
    const b = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: bus });
    a.put(record({ threadId: "t-x" }));
    await a.flush();
    bus.postMessage();
    await vi.waitFor(() => expect(b.list()).toHaveLength(1));
  });
});

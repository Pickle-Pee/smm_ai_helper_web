import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { FIXTURE_IDS, fixtures } from "./fixtures";
import { FixtureWebApiV2Client } from "./fixture-client";
import { decodeRow, IndexedDbPendingRequestStore, openPendingDb, RECORD_SCHEMA_VERSION, scopeOf } from "./pending-store-idb";
import { createRequestKey } from "./request-key";
import { MemoryPendingRequestStore, PendingStoreError, RequestCoordinator, type Sleep } from "./requests";
import type { MessageResult, SubmittedInput } from "./types";

/**
 * Review follow-up (PR #13): a failed preflight re-read of the pending store must FAIL CLOSED on every path that can
 * admit AI work — no key minted, no POST — while read-only paths report the store as unavailable.
 */

const noSleep: Sleep = async (_ms, signal) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
};
const calc: SubmittedInput = { message: fixtures.requests.calculation().message };
const MARIA = { userId: "42", orgId: FIXTURE_IDS.orgId };

/** A store whose re-read can be switched off, while put()/flush() keep succeeding. */
class FlakyRefreshStore extends MemoryPendingRequestStore {
  failRefresh = true;
  refreshCalls = 0;
  async refresh() {
    this.refreshCalls += 1;
    if (this.failRefresh) throw new Error("IndexedDB read failed");
  }
  async flush() {}
}

function failing(api: FixtureWebApiV2Client) {
  const store = new FlakyRefreshStore();
  const randomBytes = vi.fn((bytes: Uint8Array) => crypto.getRandomValues(bytes));
  const coordinator = new RequestCoordinator(api, { store, sleep: noSleep, keySource: { randomBytes } });
  return { store, coordinator, randomBytes };
}

async function needsInputResult(api: FixtureWebApiV2Client): Promise<MessageResult> {
  api.setScenario("needs_input");
  const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
  const working = new RequestCoordinator(api, { sleep: noSleep });
  const { request_key: _k, revision: _r, ...input } = fixtures.requests.positioningRev1();
  const outcome = await working.submitNew(thread.id, input as SubmittedInput);
  if (outcome.kind !== "state") throw new Error("expected needs_input");
  return outcome.result;
}

describe("preflight re-read failure fails closed", () => {
  it.each(["submitNew", "answerClarification", "resubmitSameKey", "startNewRequest"] as const)(
    "%s: PendingStoreError(read_failed), no key minted, no POST",
    async (path) => {
      const api = new FixtureWebApiV2Client({ scenario: "direct_result" });
      const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
      const prepared =
        path === "answerClarification" ? await needsInputResult(api) : path === "resubmitSameKey" ? await api.getMessage(fixtures.responses.messagePendingResubmit().user_message.id) : null;
      const submit = vi.spyOn(api, "submitMessage");
      const { coordinator, randomBytes, store } = failing(api);
      const call = () => {
        switch (path) {
          case "submitNew":
            return coordinator.submitNew(thread.id, calc);
          case "answerClarification":
            return coordinator.answerClarification(prepared!, { context: { customer_job_or_need: "Быстрый кофе" } });
          case "resubmitSameKey":
            expect(prepared!.next_action).toBe("resubmit_same_key");
            return coordinator.resubmitSameKey(prepared!);
          case "startNewRequest":
            return coordinator.startNewRequest(thread.id, calc, { acknowledgeMayRegenerate: true });
        }
      };
      await expect(call()).rejects.toMatchObject({ name: "PendingStoreError", reason: "read_failed" });
      expect(submit).not.toHaveBeenCalled();
      expect(randomBytes).not.toHaveBeenCalled();
      expect(store.list()).toEqual([]);
      expect(coordinator.isStoreTrusted()).toBe(false);

      // A successful re-read restores normal behaviour.
      store.failRefresh = false;
      if (path === "submitNew" || path === "startNewRequest") {
        const ok = await call();
        expect(ok.kind).toBe("state");
        expect(submit).toHaveBeenCalledTimes(1);
        expect(coordinator.isStoreTrusted()).toBe(true);
      }
    },
  );

  it("two tabs: B cannot re-read while A holds an unresolved request → B sends nothing; after a good re-read B sees A's fence", async () => {
    const factory = new IDBFactory();
    const api = new FixtureWebApiV2Client({ scenario: "unavailable_before_admission" });
    const submit = vi.spyOn(api, "submitMessage");
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    // Tab B opens first: its cache is empty.
    const storeB = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: null });
    const storeA = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: null });
    const tabA = new RequestCoordinator(api, { store: storeA, sleep: noSleep });
    const tabB = new RequestCoordinator(api, { store: storeB, sleep: noSleep });
    expect(await tabA.submitNew(thread.id, calc)).toMatchObject({ kind: "unknown", reason: "no_visible_record" });
    await storeA.flush();
    expect(storeB.list()).toEqual([]); // stale, empty cache in tab B

    const refresh = vi.spyOn(storeB, "refresh").mockRejectedValue(new Error("read failed"));
    await expect(tabB.submitNew(thread.id, calc)).rejects.toMatchObject({ reason: "read_failed" });
    await expect(tabB.startNewRequest(thread.id, calc, { acknowledgeMayRegenerate: true })).rejects.toMatchObject({ reason: "read_failed" });
    expect(submit).toHaveBeenCalledTimes(1); // only tab A's original POST

    refresh.mockRestore();
    await expect(tabB.submitNew(thread.id, calc)).rejects.toMatchObject({ reason: "unresolved_request" });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("read-only reconciliation with a failed re-read reports the store unavailable and sends nothing", async () => {
    const api = new FixtureWebApiV2Client();
    const submit = vi.spyOn(api, "submitMessage");
    const { coordinator, store } = failing(api);
    const report = await coordinator.reconcileThread(await api.getThread(FIXTURE_IDS.strategyThreadId));
    expect(report.storeUnavailable).toBe(true);
    expect(coordinator.isStoreTrusted()).toBe(false);
    expect(await coordinator.verifyStore()).toBe(false);
    store.failRefresh = false;
    expect(await coordinator.verifyStore()).toBe(true);
    expect((await coordinator.reconcileThread(await api.getThread(FIXTURE_IDS.strategyThreadId))).storeUnavailable).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("damaged IndexedDB rows always fence", () => {
  it.each(["rejected", "superseded", "accepted", "sending"] as const)("claimed status %s on a damaged row → unresolved", (claimed) => {
    const key = createRequestKey();
    for (const row of [
      { threadId: "t", requestKey: key, revision: 1, schemaVersion: 99, status: claimed, payload: { message: "x", request_key: key, revision: 1 } },
      { threadId: "t", requestKey: key, revision: 1, schemaVersion: RECORD_SCHEMA_VERSION, status: claimed, payload: { message: 42 } },
      { threadId: "t", requestKey: key, revision: 1, schemaVersion: RECORD_SCHEMA_VERSION, status: claimed, supersededBy: createRequestKey() },
    ]) {
      const record = decodeRow(row);
      expect(record).toMatchObject({ status: "unresolved", payloadUnavailable: true, payload: { message: "" } });
      expect(record?.supersededBy).toBeUndefined();
    }
  });

  it("a damaged row fences after reload; superseding it keeps its payload unavailable across a rewrite", async () => {
    const factory = new IDBFactory();
    const damagedKey = createRequestKey();
    const db = await openPendingDb(factory);
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put({ scope: scopeOf(MARIA), userId: "42", requestKey: damagedKey, threadId: "t-damaged", schemaVersion: 7, status: "superseded" });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();

    const api = new FixtureWebApiV2Client({ scenario: "direct_result" });
    const thread = await api.createThread(FIXTURE_IDS.projectId, { kind: "copilot" });
    // Re-key the damaged row onto a real thread so the restart can be exercised end to end.
    const db2 = await openPendingDb(factory);
    const tx2 = db2.transaction("records", "readwrite");
    tx2.objectStore("records").put({ scope: scopeOf(MARIA), userId: "42", requestKey: damagedKey, threadId: thread.id, schemaVersion: 7, status: "rejected" });
    await new Promise((r) => (tx2.oncomplete = r));
    db2.close();

    const store = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: null });
    const coordinator = new RequestCoordinator(api, { store, sleep: noSleep });
    await expect(coordinator.submitNew(thread.id, calc)).rejects.toMatchObject({ reason: "unresolved_request" });
    await coordinator.startNewRequest(thread.id, calc, { acknowledgeMayRegenerate: true });
    await store.flush();

    const reloaded = await IndexedDbPendingRequestStore.open({ indexedDB: factory, principal: MARIA, channel: null });
    expect(reloaded.get(damagedKey)).toMatchObject({ status: "superseded", payloadUnavailable: true, payload: { message: "" } });
  });
});

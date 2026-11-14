import { describe, expect, it, vi } from "vitest";
import { FIXTURE_IDS, fixtures } from "./fixtures";
import { FIXTURE_SERVER_NOW, FixtureWebApiV2Client, type FixtureClientOptions } from "./fixture-client";
import { isRequestKey } from "./request-key";
import { LocalSubmitGuardError, RecoveryNotPermittedError, RequestCoordinator, type Sleep } from "./requests";
import type { MessageResult, SubmittedInput } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const noSleep: Sleep = async (_ms, signal) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
};

function setup(options: FixtureClientOptions = {}, sleep: Sleep = noSleep) {
  const api = new FixtureWebApiV2Client(options);
  const submit = vi.spyOn(api, "submitMessage");
  const recover = vi.spyOn(api, "getRequestByKey");
  const coordinator = new RequestCoordinator(api, { sleep });
  return { api, coordinator, submit, recover };
}

async function newThread(api: FixtureWebApiV2Client) {
  return api.createThread(FIXTURE_IDS.projectId, { kind: "copilot", title: "Тест" });
}

const calc: SubmittedInput = { message: fixtures.requests.calculation().message };
const positioning = (() => {
  const { request_key: _k, revision: _r, ...rest } = fixtures.requests.positioningRev1();
  return rest as SubmittedInput;
})();

function stateOf(outcome: Awaited<ReturnType<RequestCoordinator["submitNew"]>>): MessageResult {
  if (outcome.kind !== "state") throw new Error(`expected a state, got ${outcome.kind}`);
  return outcome.result;
}

describe("submission and idempotency", () => {
  it("mints a contract-shaped key, stores the frozen payload BEFORE the POST and clears it at a durable state", async () => {
    const { api, coordinator, submit } = setup({ scenario: "direct_result" });
    const thread = await newThread(api);
    let storedAtPost: unknown;
    submit.mockImplementationOnce(async (threadId, body) => {
      storedAtPost = coordinator.store.get(body.request_key);
      return FixtureWebApiV2Client.prototype.submitMessage.call(api, threadId, body);
    });
    const result = stateOf(await coordinator.submitNew(thread.id, calc));
    const body = submit.mock.calls[0][1];
    expect(isRequestKey(body.request_key)).toBe(true);
    expect(body.revision).toBe(1);
    expect(storedAtPost).toMatchObject({ requestKey: body.request_key, revision: 1, payload: body });
    expect(Object.isFrozen((storedAtPost as { payload: object }).payload)).toBe(true);
    expect(result.state).toBe("completed");
    expect(coordinator.store.get(body.request_key)).toBeUndefined();
  });

  it("every new request gets a new key", async () => {
    const { api, coordinator, submit } = setup({ scenario: "direct_result" });
    const a = await newThread(api);
    const b = await newThread(api);
    await coordinator.submitNew(a.id, calc);
    await coordinator.submitNew(b.id, calc);
    expect(submit.mock.calls[0][1].request_key).not.toBe(submit.mock.calls[1][1].request_key);
  });

  it("refuses a double submit in the same thread while the first is in progress (double click)", async () => {
    const { api, coordinator, submit } = setup({ scenario: "direct_result" });
    const thread = await newThread(api);
    const first = coordinator.submitNew(thread.id, calc);
    await expect(coordinator.submitNew(thread.id, calc)).rejects.toBeInstanceOf(LocalSubmitGuardError);
    await first;
    expect(submit).toHaveBeenCalledTimes(1);
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("allows only one active execution per thread: no new request while the server reports running", async () => {
    const { api, coordinator } = setup({ scenario: "workflow" });
    const thread = await newThread(api);
    expect(stateOf(await coordinator.submitNew(thread.id, calc)).state).toBe("running");
    await expect(coordinator.submitNew(thread.id, calc)).rejects.toMatchObject({ reason: "request_in_flight" });
    // A second tab without local state is stopped by the server instead.
    const otherTab = new RequestCoordinator(api, { sleep: noSleep });
    const outcome = await otherTab.submitNew(thread.id, calc);
    expect(outcome).toMatchObject({ kind: "rejected", error: { code: "thread_busy", status: 409 } });
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("the simulated server replays an identical request and rejects a changed payload under the same key", async () => {
    const { api, submit, coordinator } = setup({ scenario: "direct_result" });
    const thread = await newThread(api);
    await coordinator.submitNew(thread.id, calc);
    const body = submit.mock.calls[0][1];
    const replay = await api.submitMessage(thread.id, body);
    expect(replay.result.state).toBe("completed");
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
    await expect(api.submitMessage(thread.id, { ...body, message: "Другой текст" })).rejects.toMatchObject({ code: "request_conflict", status: 409 });
    const other = await newThread(api);
    await expect(api.submitMessage(other.id, body)).rejects.toMatchObject({ code: "request_conflict" });
  });
});

describe("NEEDS_INPUT and revisions", () => {
  it("answers with the SAME key, revision + 1, the SAME message and the extended accepted input", async () => {
    const { api, coordinator, submit } = setup({ scenario: "needs_input" });
    const thread = await newThread(api);
    const first = stateOf(await coordinator.submitNew(thread.id, positioning));
    expect(first).toMatchObject({ state: "needs_input", next_action: "answer_clarification" });
    const rev2 = fixtures.requests.positioningRev2();
    const second = stateOf(await coordinator.answerClarification(first, { context: rev2.context, confirmation: rev2.confirmation }));

    const [, body1] = submit.mock.calls[0];
    const [, body2] = submit.mock.calls[1];
    expect(body2.request_key).toBe(body1.request_key);
    expect(body2.revision).toBe(2);
    expect(body2.message).toBe(body1.message);
    expect(body2.owned_site_url).toBe(body1.owned_site_url);
    expect(body2.context).toEqual(rev2.context);
    expect(body2.confirmation).toEqual(rev2.confirmation);
    expect(second).toMatchObject({ state: "completed", user_message: { revision: 2, is_latest_revision: true } });

    // History keeps both revisions as separate message pairs; only the newest is "latest".
    const page = await api.listThreadMessages(thread.id);
    const users = page.items.filter((m) => m.role === "user");
    expect(users.map((m) => [m.revision, m.role === "user" && m.is_latest_revision])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it("refuses a clarification for anything that is not the latest needs_input revision", async () => {
    const { coordinator } = setup();
    const completed = fixtures.responses.messageDirect();
    await expect(coordinator.answerClarification(completed, { context: {} })).rejects.toBeInstanceOf(RecoveryNotPermittedError);
    const stale = fixtures.responses.messageNeedsInput();
    stale.user_message.is_latest_revision = false;
    await expect(coordinator.answerClarification(stale, { context: {} })).rejects.toBeInstanceOf(RecoveryNotPermittedError);
  });

  it("the simulated server enforces revision rules (skip, changed message)", async () => {
    const { api, coordinator, submit } = setup({ scenario: "needs_input" });
    const thread = await newThread(api);
    await coordinator.submitNew(thread.id, positioning);
    const body = submit.mock.calls[0][1];
    await expect(api.submitMessage(thread.id, { ...body, revision: 3 })).rejects.toMatchObject({ code: "revision_conflict" });
    await expect(api.submitMessage(thread.id, { ...body, revision: 2, message: "Иной текст" })).rejects.toMatchObject({ code: "revision_conflict" });
  });
});

describe("unknown outcomes never trigger a second AI call", () => {
  it("503 after admission → read-only recovery by key returns the durable state; POST sent once", async () => {
    const { api, coordinator, submit, recover } = setup({ scenario: "unavailable_after_admission" });
    const thread = await newThread(api);
    const outcome = await coordinator.submitNew(thread.id, calc);
    expect(stateOf(outcome).state).toBe("completed");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover.mock.calls[0][1]).toBe(submit.mock.calls[0][1].request_key);
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("503 before admission → recovery 404 is 'no visible record', NOT a licence to resend", async () => {
    const { api, coordinator, submit } = setup({ scenario: "unavailable_before_admission" });
    const thread = await newThread(api);
    const outcome = await coordinator.submitNew(thread.id, calc);
    expect(outcome).toMatchObject({ kind: "unknown", reason: "no_visible_record", error: { status: 404, code: "not_found" } });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(api.stats.simulatedCoreAdmissions).toBe(0);
    // The local record stays for diagnostics but grants nothing: there is no server permission to resend.
    expect(coordinator.store.list()).toHaveLength(1);
  });

  it("503 on the status read too → 'status_unavailable'; the client keeps the key and does not POST", async () => {
    const { api, coordinator, submit } = setup({ scenario: "unavailable_after_admission", readOutages: 1 });
    const thread = await newThread(api);
    const outcome = await coordinator.submitNew(thread.id, calc);
    expect(outcome).toMatchObject({ kind: "unknown", reason: "status_unavailable", error: { code: "temporarily_unavailable", retryAfterSeconds: 10 } });
    expect(submit).toHaveBeenCalledTimes(1);
    // A later explicit re-read (not a resend) recovers the result.
    if (outcome.kind !== "unknown") throw new Error();
    expect(stateOf(await coordinator.recover(outcome.record)).state).toBe("completed");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("network failure on submit → recovery read, no resend", async () => {
    const { api, coordinator, submit } = setup({ scenario: "direct_result" });
    const thread = await newThread(api);
    submit.mockImplementationOnce(async (threadId, body) => {
      await FixtureWebApiV2Client.prototype.submitMessage.call(api, threadId, body); // reached the server…
      const { WebApiError } = await import("./errors");
      throw new WebApiError({ kind: "network", operation: "submitMessage", status: null, code: null }); // …response lost
    });
    expect(stateOf(await coordinator.submitNew(thread.id, calc)).state).toBe("completed");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("ambiguous comes only from the server and offers no automatic action", async () => {
    const { api, coordinator, submit } = setup({ scenario: "ambiguous" });
    const thread = await newThread(api);
    const result = stateOf(await coordinator.submitNew(thread.id, calc));
    expect(result).toMatchObject({ state: "ambiguous", next_action: "start_new_request" });
    expect(submit).toHaveBeenCalledTimes(1);
    await expect(coordinator.resubmitSameKey(result)).rejects.toBeInstanceOf(RecoveryNotPermittedError);
  });

  it("quota_exceeded and rate_limited are rejected and never retried automatically", async () => {
    for (const scenario of ["quota_exceeded", "rate_limited"] as const) {
      const { api, coordinator, submit } = setup({ scenario });
      const thread = await newThread(api);
      const outcome = await coordinator.submitNew(thread.id, calc);
      expect(outcome).toMatchObject({ kind: "rejected", error: { code: scenario, status: 429 } });
      expect(submit).toHaveBeenCalledTimes(1);
      expect(api.stats.simulatedCoreAdmissions).toBe(0);
    }
  });

  it("a new key exists only behind an explicit, acknowledged 'start a new request'", async () => {
    const { api, coordinator, submit } = setup({ scenario: "ambiguous" });
    const thread = await newThread(api);
    await coordinator.submitNew(thread.id, calc);
    // @ts-expect-error the acknowledgement is mandatory
    await expect(coordinator.startNewRequest(thread.id, calc, {})).rejects.toBeInstanceOf(RecoveryNotPermittedError);
    api.setScenario("direct_result");
    const fresh = stateOf(await coordinator.startNewRequest(thread.id, calc, { acknowledgeMayRegenerate: true }));
    expect(fresh.state).toBe("completed");
    expect(submit.mock.calls[1][1].request_key).not.toBe(submit.mock.calls[0][1].request_key);
  });
});

describe("pending recovery and the seven-day window (C0 fix)", () => {
  const pending = fixtures.responses.messagePendingResubmit();
  const record = {
    threadId: pending.thread_id,
    requestKey: pending.user_message.request_key,
    revision: 1,
    payload: { ...pending.user_message.input!, request_key: pending.user_message.request_key, revision: 1 },
  };

  it("fresh pending + server says resubmit_same_key → explicit resend with the identical payload and SAME key", async () => {
    const { api, coordinator, submit } = setup();
    const status = stateOf(await coordinator.recover(record));
    expect(status).toMatchObject({ state: "pending", next_action: "resubmit_same_key" });
    expect(submit).not.toHaveBeenCalled(); // recovery itself never POSTs
    const resent = stateOf(await coordinator.resubmitSameKey(status));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][1]).toEqual(record.payload);
    expect(resent.state).toBe("completed");
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("old pending after receipt deletion (31 days) → expired, no resend possible, zero admissions", async () => {
    const created = new Date(Date.parse(FIXTURE_SERVER_NOW) - 31 * DAY).toISOString();
    const { api, coordinator, submit } = setup({ pendingCreatedAt: created });
    const status = stateOf(await coordinator.recover(record));
    expect(status).toMatchObject({ state: "expired", next_action: "start_new_request", user_message: { state_reason: "recovery_window_elapsed" } });
    await expect(coordinator.resubmitSameKey(status)).rejects.toBeInstanceOf(RecoveryNotPermittedError);
    // Even a hand-crafted replay of the old stored payload is fenced by the (simulated) server.
    const replay = await api.submitMessage(record.threadId, record.payload);
    expect(replay.result.state).toBe("expired");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(api.stats.simulatedCoreAdmissions).toBe(0);
  });

  it("matches every case of golden/pending-receipt-purged.json", async () => {
    const golden = fixtures.golden.pendingReceiptPurged();
    expect(golden.safe_pending_retry_days).toBe(7);
    for (const c of golden.cases) {
      const { api, coordinator } = setup({ pendingCreatedAt: c.created_at, serverNow: () => new Date(c.read_at) });
      const status = stateOf(await coordinator.recover(record));
      expect({ name: c.name, state: status.state, next_action: status.next_action, reason: status.user_message.state_reason }).toEqual({
        name: c.name,
        state: c.expected.state,
        next_action: c.expected.next_action,
        reason: c.expected.state_reason,
      });
      expect(api.stats.simulatedCoreAdmissions).toBe(c.expected.core_calls_during_read);
    }
  });

  it("the client never decides by itself: resubmitSameKey refuses any state the server did not mark", async () => {
    const { coordinator } = setup();
    for (const r of [fixtures.responses.messageExpired(), fixtures.responses.messageRunningOverdue(), fixtures.responses.messageAmbiguous()]) {
      await expect(coordinator.resubmitSameKey(r)).rejects.toBeInstanceOf(RecoveryNotPermittedError);
    }
  });
});

describe("polling", () => {
  it("follows poll_after_ms until the workflow completes", async () => {
    const delays: number[] = [];
    const { api, coordinator } = setup({ scenario: "workflow", pollsUntilDone: 3 }, async (ms) => {
      delays.push(ms);
    });
    const thread = await newThread(api);
    const started = stateOf(await coordinator.submitNew(thread.id, calc));
    expect(started).toMatchObject({ state: "running", next_action: "poll", poll_after_ms: 2000 });
    const updates: string[] = [];
    const done = await coordinator.poll(started.user_message.id, { onUpdate: (r) => updates.push(r.state) });
    expect(updates).toEqual(["running", "running", "completed"]);
    expect(delays).toEqual([5000, 5000]);
    expect(done.assistant_message?.result?.result_kind).toBe("RUN");
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("re-reads after 503 honouring Retry-After (read only)", async () => {
    const delays: number[] = [];
    const { api, coordinator, submit } = setup({ scenario: "workflow", pollsUntilDone: 1 }, async (ms) => {
      delays.push(ms);
    });
    const thread = await newThread(api);
    const started = stateOf(await coordinator.submitNew(thread.id, calc));
    const outageApi = api as unknown as { readOutages: number };
    outageApi.readOutages = 2;
    const done = await coordinator.poll(started.user_message.id);
    expect(done.state).toBe("completed");
    expect(delays).toEqual([10_000, 10_000]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("running_overdue keeps polling as running and is never turned into ambiguous; cancellable", async () => {
    const controller = new AbortController();
    const { api, coordinator } = setup({ scenario: "running_overdue" });
    const thread = await newThread(api);
    const started = stateOf(await coordinator.submitNew(thread.id, calc));
    const seen: MessageResult[] = [];
    await expect(
      coordinator.poll(started.user_message.id, {
        signal: controller.signal,
        onUpdate: (r) => {
          seen.push(r);
          if (seen.length === 5) controller.abort();
        },
      }),
    ).rejects.toBeDefined();
    expect(seen.every((r) => r.state === "running" && r.running_overdue && r.next_action === "poll")).toBe(true);
    expect(api.stats.simulatedCoreAdmissions).toBe(1);
  });

  it("after a reload the client follows Thread.in_flight instead of submitting again", async () => {
    const { api, coordinator, submit } = setup({ scenario: "workflow" });
    const thread = await newThread(api);
    await coordinator.submitNew(thread.id, calc);
    const reloaded = new RequestCoordinator(api, { sleep: noSleep });
    const fresh = await api.getThread(thread.id);
    expect(fresh.in_flight?.state).toBe("running");
    const current = await reloaded.followInFlight(fresh);
    expect(current?.state).toBe("running");
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

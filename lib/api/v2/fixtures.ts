/**
 * Typed access to the contract fixtures in `docs/api/fixtures/` (the same files the OpenAPI document links as
 * `examples.externalValue` and that `docs/api/tools/check_contract.py` validates against the schemas in CI).
 *
 * All values are invented. Copilot payloads have the shape of the real backend DTOs, but their text is
 * illustrative test data, never an AI answer. Every accessor returns a deep copy.
 */
import authCsrf from "@/docs/api/fixtures/responses/auth-csrf.200.json";
import authExchange from "@/docs/api/fixtures/responses/auth-exchange.200.json";
import me from "@/docs/api/fixtures/responses/me.200.json";
import orgs from "@/docs/api/fixtures/responses/orgs.200.json";
import projectsList from "@/docs/api/fixtures/responses/projects-list.200.json";
import project from "@/docs/api/fixtures/responses/project.200.json";
import projectBrand from "@/docs/api/fixtures/responses/project-brand.200.json";
import threadsList from "@/docs/api/fixtures/responses/threads-list.200.json";
import threadCreated from "@/docs/api/fixtures/responses/thread-created.201.json";
import messageDirect from "@/docs/api/fixtures/responses/message-direct-result.200.json";
import messageModule from "@/docs/api/fixtures/responses/message-module-result.200.json";
import messageNeedsInput from "@/docs/api/fixtures/responses/message-needs-input.200.json";
import messageClarificationCompleted from "@/docs/api/fixtures/responses/message-clarification-completed.200.json";
import messageWorkflowStarted from "@/docs/api/fixtures/responses/message-workflow-started.202.json";
import messageWorkflowRunning from "@/docs/api/fixtures/responses/message-workflow-running.200.json";
import messageStrategyCompleted from "@/docs/api/fixtures/responses/message-strategy-completed.200.json";
import messageRunFailed from "@/docs/api/fixtures/responses/message-run-failed.200.json";
import messageRunBlocked from "@/docs/api/fixtures/responses/message-run-blocked.200.json";
import messageAmbiguous from "@/docs/api/fixtures/responses/message-ambiguous.200.json";
import messageRunningOverdue from "@/docs/api/fixtures/responses/message-running-overdue.200.json";
import messageExpired from "@/docs/api/fixtures/responses/message-expired.200.json";
import messagePendingResubmit from "@/docs/api/fixtures/responses/message-pending-resubmit.200.json";
import messageUnsupported from "@/docs/api/fixtures/responses/message-unsupported.200.json";
import resultSnapshotRun from "@/docs/api/fixtures/responses/result-snapshot-run.200.json";
import resultSnapshotRunOtherMember from "@/docs/api/fixtures/responses/result-snapshot-run.other-member.200.json";
import threadMessagesReopen from "@/docs/api/fixtures/responses/thread-messages-reopen.200.json";
import threadMessagesClarification from "@/docs/api/fixtures/responses/thread-messages-clarification.200.json";
import threadMessagesFormatUnsupported from "@/docs/api/fixtures/responses/thread-messages-format-unsupported.200.json";
import requestAuthExchange from "@/docs/api/fixtures/requests/auth-exchange.json";
import requestStrategy from "@/docs/api/fixtures/requests/submit-strategy.rev1.json";
import requestCalculation from "@/docs/api/fixtures/requests/submit-calculation.rev1.json";
import requestPositioningRev1 from "@/docs/api/fixtures/requests/submit-positioning.rev1.json";
import requestPositioningRev2 from "@/docs/api/fixtures/requests/submit-positioning.rev2.json";
import errUnauthenticated from "@/docs/api/fixtures/errors/unauthenticated.401.json";
import errLoginTokenInvalid from "@/docs/api/fixtures/errors/login-token-invalid.401.json";
import errCsrfFailed from "@/docs/api/fixtures/errors/csrf-failed.403.json";
import errForbidden from "@/docs/api/fixtures/errors/forbidden.403.json";
import errFeatureDisabled from "@/docs/api/fixtures/errors/feature-disabled.403.json";
import errNotFoundProject from "@/docs/api/fixtures/errors/not-found-foreign-project.404.json";
import errNotFoundThread from "@/docs/api/fixtures/errors/not-found-foreign-thread.404.json";
import errNotFoundRun from "@/docs/api/fixtures/errors/not-found-foreign-run.404.json";
import errRequestConflict from "@/docs/api/fixtures/errors/request-conflict.409.json";
import errRevisionConflict from "@/docs/api/fixtures/errors/revision-conflict.409.json";
import errThreadBusy from "@/docs/api/fixtures/errors/thread-busy.409.json";
import errInvalidRequest from "@/docs/api/fixtures/errors/invalid-request.422.json";
import errRateLimited from "@/docs/api/fixtures/errors/rate-limited.429.json";
import errQuotaExceeded from "@/docs/api/fixtures/errors/quota-exceeded.429.json";
import errUnavailable from "@/docs/api/fixtures/errors/temporarily-unavailable.503.json";
import errResultCorrupted from "@/docs/api/fixtures/errors/result-corrupted.503.json";
import errResultFormatUnsupported from "@/docs/api/fixtures/errors/result-format-unsupported.409.json";
import errResultGone from "@/docs/api/fixtures/errors/result-gone.410.json";
import goldenPendingReceiptPurged from "@/docs/api/fixtures/golden/pending-receipt-purged.json";
import goldenTwoViewers from "@/docs/api/fixtures/golden/snapshot-two-viewers.json";
import type {
  AuthSession,
  CsrfToken,
  ErrorResponse,
  Me,
  MessageResult,
  OrganizationList,
  Project,
  ProjectBrand,
  ProjectList,
  ResultSnapshot,
  SubmitMessageRequest,
  TelegramExchangeRequest,
  Thread,
  ThreadList,
  ThreadMessagesPage,
} from "./types";

/**
 * JSON imports are typed structurally by TypeScript (string literals widen to `string`), so each fixture is
 * cast once here to its contract type. Conformance of the files to the schemas is enforced by
 * `check_contract.py` in CI and by `lib/api/v2/fixtures.test.ts`.
 */
function typed<T>(value: unknown): () => T {
  return () => structuredClone(value) as T;
}

export const fixtures = {
  responses: {
    authCsrf: typed<CsrfToken>(authCsrf),
    authExchange: typed<AuthSession>(authExchange),
    me: typed<Me>(me),
    orgs: typed<OrganizationList>(orgs),
    projectsList: typed<ProjectList>(projectsList),
    project: typed<Project>(project),
    projectBrand: typed<ProjectBrand>(projectBrand),
    threadsList: typed<ThreadList>(threadsList),
    threadCreated: typed<Thread>(threadCreated),
    messageDirect: typed<MessageResult>(messageDirect),
    messageModule: typed<MessageResult>(messageModule),
    messageNeedsInput: typed<MessageResult>(messageNeedsInput),
    messageClarificationCompleted: typed<MessageResult>(messageClarificationCompleted),
    messageWorkflowStarted: typed<MessageResult>(messageWorkflowStarted),
    messageWorkflowRunning: typed<MessageResult>(messageWorkflowRunning),
    messageStrategyCompleted: typed<MessageResult>(messageStrategyCompleted),
    messageRunFailed: typed<MessageResult>(messageRunFailed),
    messageRunBlocked: typed<MessageResult>(messageRunBlocked),
    messageAmbiguous: typed<MessageResult>(messageAmbiguous),
    messageRunningOverdue: typed<MessageResult>(messageRunningOverdue),
    messageExpired: typed<MessageResult>(messageExpired),
    messagePendingResubmit: typed<MessageResult>(messagePendingResubmit),
    messageUnsupported: typed<MessageResult>(messageUnsupported),
    resultSnapshotRun: typed<ResultSnapshot>(resultSnapshotRun),
    resultSnapshotRunOtherMember: typed<ResultSnapshot>(resultSnapshotRunOtherMember),
    threadMessagesReopen: typed<ThreadMessagesPage>(threadMessagesReopen),
    threadMessagesClarification: typed<ThreadMessagesPage>(threadMessagesClarification),
    threadMessagesFormatUnsupported: typed<ThreadMessagesPage>(threadMessagesFormatUnsupported),
  },
  requests: {
    authExchange: typed<TelegramExchangeRequest>(requestAuthExchange),
    strategy: typed<SubmitMessageRequest>(requestStrategy),
    calculation: typed<SubmitMessageRequest>(requestCalculation),
    positioningRev1: typed<SubmitMessageRequest>(requestPositioningRev1),
    positioningRev2: typed<SubmitMessageRequest>(requestPositioningRev2),
  },
  errors: {
    unauthenticated: typed<ErrorResponse>(errUnauthenticated),
    loginTokenInvalid: typed<ErrorResponse>(errLoginTokenInvalid),
    csrfFailed: typed<ErrorResponse>(errCsrfFailed),
    forbidden: typed<ErrorResponse>(errForbidden),
    featureDisabled: typed<ErrorResponse>(errFeatureDisabled),
    notFoundProject: typed<ErrorResponse>(errNotFoundProject),
    notFoundThread: typed<ErrorResponse>(errNotFoundThread),
    notFoundRun: typed<ErrorResponse>(errNotFoundRun),
    requestConflict: typed<ErrorResponse>(errRequestConflict),
    revisionConflict: typed<ErrorResponse>(errRevisionConflict),
    threadBusy: typed<ErrorResponse>(errThreadBusy),
    invalidRequest: typed<ErrorResponse>(errInvalidRequest),
    rateLimited: typed<ErrorResponse>(errRateLimited),
    quotaExceeded: typed<ErrorResponse>(errQuotaExceeded),
    temporarilyUnavailable: typed<ErrorResponse>(errUnavailable),
    resultCorrupted: typed<ErrorResponse>(errResultCorrupted),
    resultFormatUnsupported: typed<ErrorResponse>(errResultFormatUnsupported),
    resultGone: typed<ErrorResponse>(errResultGone),
  },
  golden: {
    pendingReceiptPurged: typed<GoldenPendingReceiptPurged>(goldenPendingReceiptPurged),
    twoViewers: typed<unknown>(goldenTwoViewers),
  },
} as const;

/** Shape of `golden/pending-receipt-purged.json` (a test-case file, not an API response). */
export interface GoldenPendingReceiptPurged {
  receipt_retention_days: number;
  safe_pending_retry_days: number;
  cases: {
    name: string;
    created_at: string;
    read_at: string;
    web_state: "pending";
    peek_status: null;
    expected: {
      state: "expired" | "pending";
      state_reason: "recovery_window_elapsed" | null;
      next_action: "start_new_request" | "resubmit_same_key";
      same_key_resubmit_permitted: boolean;
      core_calls_during_read: number;
    };
  }[];
}

/** Stable ids that appear in the fixtures. */
export const FIXTURE_IDS = {
  authorUserId: 42,
  orgId: "4330aee2-f521-5eb1-8c02-44eba4a7a708",
  projectId: "a1f59d0c-9838-523f-a412-b7eeb76d5954",
  /** Thread whose strategy result is reopened after the core receipt expired. */
  strategyThreadId: "55a62753-5145-5087-b4b9-a620d5442cd0",
  clarificationThreadId: "1d8f3c19-e153-5169-92a9-3b9968bfc847",
  directThreadId: "29136bc6-3e3b-5b4f-af04-53630c15afaf",
  formatUnsupportedThreadId: "9d6dfc01-12f6-5f00-8934-f2b1515d4eb0",
  strategyAssistantMessageId: "42d54690-a436-5b64-9dca-51d0aa9d0307",
  /** A project of another organization: always `404 not_found`, exactly like an unknown id. */
  foreignProjectId: "0f0e0d0c-0b0a-4908-8706-050403020100",
  /** Mock-only message ids whose snapshot read fails with `503 result_corrupted` / `503 result_unreadable`. */
  corruptedResultMessageId: "c0ffee00-0000-4000-8000-00000000c0de",
  unreadableResultMessageId: "c0ffee00-0000-4000-8000-00000000dead",
} as const;

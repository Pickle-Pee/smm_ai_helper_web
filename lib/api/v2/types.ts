/**
 * Named aliases over the GENERATED Web API v2 types. Nothing here is a hand-written DTO: every type points
 * into `lib/api/generated/web-api-v2.ts`, which `npm run generate:api` produces from
 * `docs/api/web-api-v2.openapi.yaml`. If the contract changes, regenerate; these aliases follow.
 *
 * UI code must not import these types directly. Features consume UI models produced by
 * `lib/api/v2/presenters.ts`, so the wire contract never spreads through components.
 */
import type { components, operations } from "@/lib/api/generated/web-api-v2";

export type Schemas = components["schemas"];

/* Envelope & errors */
export type ErrorCode = Schemas["ErrorCode"];
export type ErrorResponse = Schemas["ErrorResponse"];
export type QuotaInfo = Schemas["QuotaInfo"];
export type UserRef = Schemas["UserRef"];

/* Identity */
export type TelegramExchangeRequest = Schemas["TelegramExchangeRequest"];
export type AuthSession = Schemas["AuthSession"];
export type CsrfToken = Schemas["CsrfToken"];
export type Me = Schemas["Me"];
export type Features = Schemas["Features"];

/* Organizations, projects, brands */
export type OrganizationList = Schemas["OrganizationList"];
export type Project = Schemas["Project"];
export type ProjectList = Schemas["ProjectList"];
export type ProjectBrand = Schemas["ProjectBrand"];

/* Workspace */
export type Thread = Schemas["Thread"];
export type ThreadCreate = Schemas["ThreadCreate"];
export type ThreadList = Schemas["ThreadList"];
export type ThreadMessage = Schemas["ThreadMessage"];
export type ThreadMessagesPage = Schemas["ThreadMessagesPage"];
export type UserMessage = Schemas["UserMessage"];
export type AssistantMessage = Schemas["AssistantMessage"];
export type SubmitMessageRequest = Schemas["SubmitMessageRequest"];
export type SubmittedInput = Schemas["SubmittedInput"];
export type MessageResult = Schemas["MessageResult"];
export type ExecutionState = Schemas["ExecutionState"];
export type NextAction = Schemas["NextAction"];
export type StateReason = Schemas["StateReason"];
export type RequestKey = Schemas["RequestKey"];
export type BusinessContext = Schemas["BusinessContext"];

/* Durable results */
export type ResultSnapshot = Schemas["ResultSnapshot"];
export type ResultKind = ResultSnapshot["result_kind"];
export type ResultStatus = Schemas["ResultStatus"];
export type SnapshotProvenance = Schemas["SnapshotProvenance"];
export type StoredResult = Schemas["StoredResult"];
export type RunResponse = Schemas["RunResponse"];
export type NeedsInputResponse = Schemas["NeedsInputResponse"];

/** Query parameters of an operation, straight from the generated `operations` table. */
export type QueryOf<Op extends keyof operations> = operations[Op]["parameters"] extends { query?: infer Q } ? NonNullable<Q> : never;

/** Per-call options shared by every operation. */
export interface CallOptions {
  /** Caller cancellation (navigation, unmount, "stop waiting"). */
  signal?: AbortSignal;
}

/** `submitMessage` answers 200 (durable state) or 202 (running); both carry a `MessageResult`. */
export interface SubmitResponse {
  httpStatus: 200 | 202;
  result: MessageResult;
}

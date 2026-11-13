import { z } from "zod";

import {
  describeOpenSearchError,
  type OpenSearchFailure,
  readEngineErrorType,
} from "../client/error-normalization";
import {
  SearchConfigurationError,
  SearchError,
  SearchQueryInvalid,
  SearchStopping,
  SearchTimeout,
} from "../errors";
import { type DeliveryError } from "../postgres/delivery-store";
import {
  type BulkItemRef,
  type BulkRequest,
  type IdentifiedDocument,
  splitBulkRequest,
} from "./bulk";
import { type CooldownKey } from "./cooldown";

type AnyBulkRequest = BulkRequest<IdentifiedDocument, BulkItemRef<IdentifiedDocument>>;

// Routes follow what failed, not where the status appeared. Infrastructure (cluster, network, credentials, the whole
// target): release without retry budget and enter a cooldown. Document (this revision of this document): retry
// against the budget, or poison. Anything uninterpretable fails closed: never success, never charged to a document,
// released as an unknown outcome (a later 409 is verified as a duplicate).

const ENGINE_TYPE_PATTERN = /^[A-Za-z0-9_.-]{1,120}$/;
export const UNKNOWN_ENGINE_TYPE = "unknown";

export function normalizeEngineType(type: string | undefined): string {
  return type !== undefined && ENGINE_TYPE_PATTERN.test(type) ? type : UNKNOWN_ENGINE_TYPE;
}

const httpStatusSchema = z.number().int().min(100).max(599);

export const bulkItemResultSchema = z.looseObject({
  _id: z.string(),
  status: httpStatusSchema,
  _version: z.number().int().optional(),
  error: z.looseObject({ type: z.string().min(1) }).optional(),
});
export const bulkItemSchema = z.strictObject({ index: bulkItemResultSchema });
export const bulkResponseSchema = z.looseObject({
  errors: z.boolean(),
  items: z.array(bulkItemSchema),
});
export type BulkResponseBody = z.infer<typeof bulkResponseSchema>;

// Infrastructure even on an item, whatever the status. OpenSearch 3.5.0 reports cluster_block_exception as item 403
// for a write block and item 429 for read_only_allow_delete.
export const INFRASTRUCTURE_ERROR_TYPES: ReadonlySet<string> = new Set([
  "unavailable_shards_exception",
  "circuit_breaking_exception",
  "process_cluster_event_timeout_exception",
  "es_rejected_execution_exception",
  "rejected_execution_exception",
  "cluster_block_exception",
]);

export const DOCUMENT_REJECTION_TYPES: ReadonlySet<string> = new Set([
  "mapper_parsing_exception",
  "strict_dynamic_mapping_exception",
  "document_parsing_exception",
  "illegal_argument_exception",
]);

export const VERSION_CONFLICT_TYPE = "version_conflict_engine_exception";
export const INDEX_NOT_FOUND_TYPE = "index_not_found_exception";

export type CooldownScope = "client" | "target";
export type ReleaseDelay = "none" | "backoff" | "maximum";

export type BulkItemOutcome =
  | { readonly kind: "success" }
  | { readonly kind: "conflict" }
  | { readonly kind: "retry"; readonly error: DeliveryError }
  | {
      readonly kind: "release";
      readonly error: DeliveryError;
      readonly cooldown: CooldownScope | null;
      readonly delay: ReleaseDelay;
    }
  | { readonly kind: "poison"; readonly error: DeliveryError }
  | { readonly kind: "pause"; readonly error: DeliveryError }
  | { readonly kind: "abandoned" };

export type ItemClassification =
  | { readonly kind: "success" }
  | { readonly kind: "conflict" }
  | { readonly kind: "retry"; readonly errorClass: "transient_item" }
  | {
      readonly kind: "release";
      readonly errorClass: "infrastructure" | "credentials";
      readonly cooldown: CooldownScope;
      readonly delay: ReleaseDelay;
    }
  | { readonly kind: "poison"; readonly errorClass: "rejected" | "rejected_unknown" }
  | { readonly kind: "pause"; readonly errorClass: "write_alias_missing" }
  | { readonly kind: "malformed" };

export function classifyBulkItem(status: number, type: string | undefined): ItemClassification {
  if (!Number.isInteger(status)) return { kind: "malformed" };
  if (status === 200 || status === 201) {
    return type === undefined ? { kind: "success" } : { kind: "malformed" };
  }
  if (status < 400 || status > 599 || type === undefined) return { kind: "malformed" };
  if (INFRASTRUCTURE_ERROR_TYPES.has(type) || status === 429 || status === 503) {
    return { kind: "release", errorClass: "infrastructure", cooldown: "target", delay: "backoff" };
  }
  if (status === 401) {
    return { kind: "release", errorClass: "credentials", cooldown: "client", delay: "maximum" };
  }
  if (status === 403) {
    return { kind: "release", errorClass: "credentials", cooldown: "target", delay: "maximum" };
  }
  if (status === 409 && type === VERSION_CONFLICT_TYPE) return { kind: "conflict" };
  if (status === 404 && type === INDEX_NOT_FOUND_TYPE) {
    return { kind: "pause", errorClass: "write_alias_missing" };
  }
  // An unknown item 5xx spends retry budget so a deterministically failing document cannot loop forever.
  if (status >= 500) return { kind: "retry", errorClass: "transient_item" };
  if (status === 413 || (status === 400 && DOCUMENT_REJECTION_TYPES.has(type))) {
    return { kind: "poison", errorClass: "rejected" };
  }
  return { kind: "poison", errorClass: "rejected_unknown" };
}

export type RequestClassification =
  | { readonly kind: "items" }
  | {
      readonly kind: "release";
      readonly errorClass: "infrastructure" | "credentials" | "configuration" | "stopping";
      readonly cooldown: CooldownScope | null;
      readonly delay: ReleaseDelay;
    }
  | { readonly kind: "split"; readonly poisonClass: "request_rejected" | "oversized" }
  | { readonly kind: "pause" };

const CLIENT_BACKOFF = {
  kind: "release",
  errorClass: "infrastructure",
  cooldown: "client",
  delay: "backoff",
} as const;

export function classifyRequestStatus(status: number, type: string): RequestClassification {
  if (status === 200) return { kind: "items" };
  if (status === 400) return { kind: "split", poisonClass: "request_rejected" };
  if (status === 413) return { kind: "split", poisonClass: "oversized" };
  if (status === 401) {
    return { kind: "release", errorClass: "credentials", cooldown: "client", delay: "maximum" };
  }
  if (status === 403) {
    return { kind: "release", errorClass: "credentials", cooldown: "target", delay: "maximum" };
  }
  // A 404 that is not the engine's index_not_found (from a proxy, say) does not pause the target.
  if (status === 404 && type === INDEX_NOT_FOUND_TYPE) return { kind: "pause" };
  return CLIENT_BACKOFF;
}

export interface ThrownClassification {
  readonly classification: RequestClassification;
  readonly error: DeliveryError;
}

export function classifyThrown<Thrown>(error: Thrown): ThrownClassification {
  if (error instanceof SearchError) return classifySearchError(error);
  return classifyFailure(describeOpenSearchError(error));
}

const detailsReasonSchema = z.looseObject({ reason: z.string() });
const detailsStatusSchema = z.looseObject({
  status: httpStatusSchema,
  type: z.string().optional(),
});

function classifySearchError(error: SearchError): ThrownClassification {
  const response = detailsStatusSchema.safeParse(error.details);
  if (response.success) {
    const type = normalizeEngineType(response.data.type);
    return {
      classification: classifyRequestStatus(response.data.status, type),
      error: { class: "http", status: response.data.status, type },
    };
  }
  const detailsReason = detailsReasonSchema.safeParse(error.details);
  const reason = detailsReason.success ? detailsReason.data.reason : error.code;
  if (error instanceof SearchStopping) {
    return {
      classification: { kind: "release", errorClass: "stopping", cooldown: null, delay: "none" },
      error: { class: "stopping", reason },
    };
  }
  if (error instanceof SearchConfigurationError) {
    return {
      classification: {
        kind: "release",
        errorClass: "configuration",
        cooldown: "client",
        delay: "maximum",
      },
      error: { class: "configuration", reason },
    };
  }
  // A serialization failure may come from one document, so it is bisected like a 400.
  if (error instanceof SearchQueryInvalid && reason === "serialization") {
    return {
      classification: { kind: "split", poisonClass: "request_rejected" },
      error: { class: "serialization" },
    };
  }
  const cause = error instanceof SearchTimeout ? "timeout" : reason;
  return { classification: CLIENT_BACKOFF, error: { class: "infrastructure", cause } };
}

function classifyFailure(failure: OpenSearchFailure): ThrownClassification {
  switch (failure.kind) {
    case "response": {
      const type = normalizeEngineType(failure.type);
      return {
        classification: classifyRequestStatus(failure.status, type),
        error: { class: "http", status: failure.status, type },
      };
    }
    case "serialization":
      return {
        classification: { kind: "split", poisonClass: "request_rejected" },
        error: { class: "serialization" },
      };
    case "configuration":
      return {
        classification: {
          kind: "release",
          errorClass: "configuration",
          cooldown: "client",
          delay: "maximum",
        },
        error: { class: "configuration", reason: "client-configuration" },
      };
    case "timeout":
    case "connection":
    case "aborted":
    case "deserialization":
    case "unknown":
      return {
        classification: CLIENT_BACKOFF,
        error: { class: "infrastructure", cause: failure.kind },
      };
  }
}

export type CooldownEvent =
  | { readonly action: "enter"; readonly scope: CooldownScope; readonly atMaximum: boolean }
  | { readonly action: "clear"; readonly scope: CooldownScope };

export type InterpretedBulkResult =
  | {
      readonly kind: "items";
      readonly outcomes: readonly BulkItemOutcome[];
      readonly cooldown: readonly CooldownEvent[];
    }
  | {
      readonly kind: "release";
      readonly outcome: Extract<BulkItemOutcome, { kind: "release" }>;
      readonly cooldown: readonly CooldownEvent[];
    }
  | {
      readonly kind: "split";
      readonly poisonClass: "request_rejected" | "oversized";
      readonly error: DeliveryError;
    }
  | { readonly kind: "pause"; readonly error: DeliveryError };

export type BulkSendResult =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly body: unknown;
      readonly leadingItems?: number;
    }
  | { readonly kind: "thrown"; readonly error: unknown }
  | { readonly kind: "skipped"; readonly reason?: "target-fence-lost" | "fence-unverified" }
  | { readonly kind: "deadline" };

function releaseOutcome(
  classification: Extract<RequestClassification, { kind: "release" }>,
  error: DeliveryError,
): InterpretedBulkResult {
  const cooldown: CooldownEvent[] =
    classification.cooldown === null
      ? []
      : [
          {
            action: "enter",
            scope: classification.cooldown,
            atMaximum: classification.delay === "maximum",
          },
        ];
  return {
    kind: "release",
    outcome: {
      kind: "release",
      error,
      cooldown: classification.cooldown,
      delay: classification.delay,
    },
    cooldown,
  };
}

function fromRequestClassification(
  classification: RequestClassification,
  error: DeliveryError,
): InterpretedBulkResult | undefined {
  switch (classification.kind) {
    case "items":
      return undefined;
    case "release":
      return releaseOutcome(classification, error);
    case "split":
      return { kind: "split", poisonClass: classification.poisonClass, error };
    case "pause":
      return { kind: "pause", error: { ...error, class: "write_alias_missing" } };
  }
}

function unknownOutcome(reason: string): InterpretedBulkResult {
  return releaseOutcome(CLIENT_BACKOFF, { class: "unknown_outcome", reason });
}

function itemOutcome(
  classification: ItemClassification,
  status: number,
  type: string,
): BulkItemOutcome {
  switch (classification.kind) {
    case "success":
      return { kind: "success" };
    case "conflict":
      return { kind: "conflict" };
    case "retry":
      return { kind: "retry", error: { class: classification.errorClass, status, type } };
    case "release":
      return {
        kind: "release",
        error: { class: classification.errorClass, status, type },
        cooldown: classification.cooldown,
        delay: classification.delay,
      };
    case "poison":
      return { kind: "poison", error: { class: classification.errorClass, status, type } };
    case "pause":
      return { kind: "pause", error: { class: classification.errorClass, status, type } };
    case "malformed":
      return { kind: "abandoned" };
  }
}

export function interpretBulkResponse<Body>(
  request: AnyBulkRequest,
  status: number,
  body: Body,
  leadingItems = 0,
): InterpretedBulkResult {
  // A 200 is trusted only if item count, every _id, every success's external version and the errors flag all match the
  // request; any mismatch makes the whole response an unknown outcome.
  if (!Number.isInteger(status) || status < 100 || status > 599)
    return unknownOutcome("invalid-status");
  if (status !== 200) {
    const type = normalizeEngineType(readEngineErrorType(body));
    const interpreted = fromRequestClassification(classifyRequestStatus(status, type), {
      class: "http",
      status,
      type,
    });
    if (interpreted !== undefined) return interpreted;
  }
  const parsed = bulkResponseSchema.safeParse(body);
  if (!parsed.success) return unknownOutcome("invalid-bulk-response");
  const { items, errors } = parsed.data;
  if (items.length !== request.items.length + leadingItems) {
    return unknownOutcome("item-count-mismatch");
  }

  const outcomes: BulkItemOutcome[] = [];
  let anyFailed = false;
  for (const leading of items.slice(0, leadingItems)) {
    if (leading.index.status !== 200 && leading.index.status !== 201) anyFailed = true;
  }
  let targetCooldown: { atMaximum: boolean } | undefined;
  let clientCooldown = false;
  for (const [index, sent] of request.items.entries()) {
    const result = items[index + leadingItems]?.index;
    if (result === undefined) return unknownOutcome("item-missing");
    if (result._id !== sent.document.documentId) return unknownOutcome("item-id-mismatch");
    const rawType = result.error?.type;
    const classification = classifyBulkItem(result.status, rawType);
    if (classification.kind === "malformed") return unknownOutcome("item-malformed");
    if (classification.kind === "success") {
      if (result._version !== sent.version) return unknownOutcome("item-version-mismatch");
    } else {
      anyFailed = true;
    }
    if (classification.kind === "release") {
      if (classification.cooldown === "client") clientCooldown = true;
      else {
        targetCooldown = {
          atMaximum: (targetCooldown?.atMaximum ?? false) || classification.delay === "maximum",
        };
      }
    }
    outcomes.push(itemOutcome(classification, result.status, normalizeEngineType(rawType)));
  }
  if (errors !== anyFailed) return unknownOutcome("errors-flag-mismatch");

  // An interpretable bulk response proves the client healthy; the target recovers only without infrastructure items.
  const cooldown: CooldownEvent[] = [{ action: "clear", scope: "client" }];
  if (clientCooldown) cooldown.push({ action: "enter", scope: "client", atMaximum: true });
  cooldown.push(
    targetCooldown === undefined
      ? { action: "clear", scope: "target" }
      : { action: "enter", scope: "target", atMaximum: targetCooldown.atMaximum },
  );
  return { kind: "items", outcomes, cooldown };
}

export function interpretBulkSendResult(
  request: AnyBulkRequest,
  result: Exclude<BulkSendResult, { kind: "skipped" } | { kind: "deadline" }>,
): InterpretedBulkResult {
  if (result.kind === "response") {
    return interpretBulkResponse(request, result.status, result.body, result.leadingItems ?? 0);
  }
  const { classification, error } = classifyThrown(result.error);
  return fromRequestClassification(classification, error) ?? unknownOutcome("unexpected-success");
}

export interface IsolationBudget {
  remaining: number;
}

export function isolationSendsToIsolateOne(documents: number): number {
  return documents <= 1 ? 0 : 2 * Math.ceil(Math.log2(documents));
}

export interface DeliveredBulkItem<TItem> {
  readonly item: TItem;
  readonly outcome: BulkItemOutcome;
}

export interface DeliverBulkResult<TItem> {
  readonly items: readonly DeliveredBulkItem<TItem>[];
  readonly requestsSent: number;
  readonly cooldown: readonly CooldownEvent[];
}

export interface DeliverBulkOptions {
  readonly budget: IsolationBudget;
  readonly signal?: AbortSignal;
}

function releaseAll<TItem>(
  request: { readonly items: readonly TItem[] },
  outcome: BulkItemOutcome,
  outcomes: Map<TItem, BulkItemOutcome>,
): void {
  for (const item of request.items) outcomes.set(item, outcome);
}

const NOT_SENT: BulkItemOutcome = {
  kind: "release",
  error: { class: "not_sent", reason: "target-ineligible" },
  cooldown: null,
  delay: "none",
};
const CANCELLED: BulkItemOutcome = {
  kind: "release",
  error: { class: "not_sent", reason: "cancelled" },
  cooldown: null,
  delay: "none",
};
const BUDGET_EXHAUSTED: BulkItemOutcome = {
  kind: "release",
  error: { class: "isolation_unresolved", reason: "isolation-budget-exhausted" },
  cooldown: null,
  delay: "none",
};
const ISOLATION_STOPPED: BulkItemOutcome = {
  kind: "release",
  error: { class: "isolation_unresolved", reason: "isolation-stopped" },
  cooldown: null,
  delay: "backoff",
};
export const DEADLINE_RELEASE: Extract<BulkItemOutcome, { kind: "release" }> = {
  kind: "release",
  error: { class: "not_sent", reason: "drain-deadline" },
  cooldown: null,
  delay: "none",
};
const ABANDONED: BulkItemOutcome = { kind: "abandoned" };

// Read through a function so TypeScript does not narrow a value that changes across awaits.
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export async function deliverBulkRequest<
  TDocument extends IdentifiedDocument,
  TItem extends BulkItemRef<TDocument>,
>(
  request: BulkRequest<TDocument, TItem>,
  send: (request: BulkRequest<TDocument, TItem>) => Promise<BulkSendResult>,
  options: DeliverBulkOptions,
): Promise<DeliverBulkResult<TItem>> {
  const { budget, signal } = options;
  const outcomes = new Map<TItem, BulkItemOutcome>();
  const cooldown: CooldownEvent[] = [];
  const stack: { request: BulkRequest<TDocument, TItem>; isolation: boolean }[] = [
    { request, isolation: false },
  ];
  let stopped: BulkItemOutcome | undefined;
  let requestsSent = 0;

  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined) break;
    const current = next.request;
    if (stopped !== undefined) {
      releaseAll(current, stopped, outcomes);
      continue;
    }
    if (isAborted(signal)) {
      releaseAll(current, CANCELLED, outcomes);
      continue;
    }
    if (next.isolation) {
      if (budget.remaining <= 0) {
        releaseAll(current, BUDGET_EXHAUSTED, outcomes);
        continue;
      }
      budget.remaining -= 1;
    }
    let result: BulkSendResult;
    try {
      result = await send(current);
    } catch (error) {
      result = { kind: "thrown", error };
    }
    if (result.kind === "skipped") {
      const outcome: BulkItemOutcome =
        result.reason === undefined
          ? NOT_SENT
          : {
              kind: "release",
              error: { class: "not_sent", reason: result.reason },
              cooldown: null,
              delay: "none",
            };
      releaseAll(current, outcome, outcomes);
      stopped = outcome;
      continue;
    }
    if (result.kind === "deadline") {
      releaseAll(current, DEADLINE_RELEASE, outcomes);
      stopped = DEADLINE_RELEASE;
      continue;
    }
    requestsSent += 1;
    // Cancelled after sending: nothing is settled, whatever the response says.
    if (isAborted(signal)) {
      releaseAll(current, ABANDONED, outcomes);
      continue;
    }
    const interpreted = interpretBulkSendResult(current, result);
    switch (interpreted.kind) {
      case "items":
        for (const [index, item] of current.items.entries()) {
          outcomes.set(item, interpreted.outcomes[index] ?? ABANDONED);
        }
        cooldown.push(...interpreted.cooldown);
        break;
      case "release":
        releaseAll(current, interpreted.outcome, outcomes);
        cooldown.push(...interpreted.cooldown);
        stopped = ISOLATION_STOPPED;
        break;
      case "pause":
        releaseAll(current, { kind: "pause", error: interpreted.error }, outcomes);
        stopped = ISOLATION_STOPPED;
        break;
      case "split": {
        const halves = splitBulkRequest(current);
        if (halves === undefined) {
          releaseAll(
            current,
            { kind: "poison", error: { ...interpreted.error, class: interpreted.poisonClass } },
            outcomes,
          );
          break;
        }
        stack.push(
          { request: halves[1], isolation: true },
          { request: halves[0], isolation: true },
        );
        break;
      }
    }
  }

  return {
    items: request.items.map((item) => ({ item, outcome: outcomes.get(item) ?? ABANDONED })),
    requestsSent,
    cooldown,
  };
}

export function applyCooldownEvents(
  registry: {
    enter(key: CooldownKey, options?: { atMaximum?: boolean }): number;
    clear(key: CooldownKey): void;
  },
  targetId: string,
  events: readonly CooldownEvent[],
): void {
  for (const event of events) {
    const key: CooldownKey =
      event.scope === "client" ? { scope: "client" } : { scope: "target", targetId };
    if (event.action === "clear") registry.clear(key);
    else registry.enter(key, { atMaximum: event.atMaximum });
  }
}

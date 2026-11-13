import { z } from "zod";

import { SearchConfigurationError } from "../errors";
import { isolationSendsToIsolateOne } from "./classify";

export interface WorkerLimits {
  readonly maxDocumentsPerClaim: number;
  readonly maxBulkBytes: number;
  readonly maxConcurrentBulkRequests: number;
  /** Per materialize call; also the snapshot's statement, lock and idle-in-transaction limit. */
  readonly projectionTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly leaseDurationMs: number;
  readonly heartbeatIntervalMs: number;
  /** Document-level failures of one revision before it is quarantined. */
  readonly maxRetryAttempts: number;
  /** Retry budget: claim processing time plus scheduled backoff. */
  readonly maxRetryAgeMs: number;
  /** Materialize calls (the first included) and bulk bisection sends per target group. */
  readonly maxIsolationCallsPerBatch: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  /** Serialized bytes held at once, packing plus sending; also sets the snapshot chunk size. */
  readonly maxInFlightBytes: number;
  readonly statementTimeoutMs: number;
  /** Fence advance interval per target; two copies of one database can share an epoch for about 1.25 times this. */
  readonly fenceRenewIntervalMs: number;
}

export const MAX_DURATION_MS = 2_147_483_647;
export const MAX_DOCUMENTS_PER_CLAIM = 10_000;
export const MAX_BULK_BYTES = 104_857_600;
export const MIN_BULK_BYTES = 1_024;
export const MAX_CONCURRENT_BULK_REQUESTS = 64;
export const MAX_ISOLATION_CALLS_PER_BATCH = 100_000;
export const MAX_IN_FLIGHT_BYTES = 4_294_967_296;
export const DRAIN_STATEMENT_ALLOWANCE = 16;
export const MIN_FENCE_RENEW_INTERVAL_MS = 1_000;

const durationMsSchema = z.number().int().min(1).max(MAX_DURATION_MS);

export const workerLimitsSchema = z.strictObject({
  maxDocumentsPerClaim: z.number().int().min(1).max(MAX_DOCUMENTS_PER_CLAIM),
  maxBulkBytes: z.number().int().min(MIN_BULK_BYTES).max(MAX_BULK_BYTES),
  maxConcurrentBulkRequests: z.number().int().min(1).max(MAX_CONCURRENT_BULK_REQUESTS),
  projectionTimeoutMs: durationMsSchema,
  requestTimeoutMs: durationMsSchema,
  leaseDurationMs: durationMsSchema,
  heartbeatIntervalMs: durationMsSchema,
  maxRetryAttempts: z.number().int().min(1).max(MAX_DURATION_MS),
  maxRetryAgeMs: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  maxIsolationCallsPerBatch: z.number().int().min(1).max(MAX_ISOLATION_CALLS_PER_BATCH),
  retryBaseDelayMs: durationMsSchema,
  retryMaxDelayMs: durationMsSchema,
  maxInFlightBytes: z.number().int().min(MIN_BULK_BYTES).max(MAX_IN_FLIGHT_BYTES),
  statementTimeoutMs: durationMsSchema,
  fenceRenewIntervalMs: z.number().int().min(MIN_FENCE_RENEW_INTERVAL_MS).max(MAX_DURATION_MS),
});

type DeadlineLimits = Pick<
  WorkerLimits,
  "projectionTimeoutMs" | "requestTimeoutMs" | "statementTimeoutMs" | "leaseDurationMs"
>;

export function materializeCallBoundMs(limits: DeadlineLimits): number {
  return limits.projectionTimeoutMs + limits.statementTimeoutMs;
}

export function sendBoundMs(limits: DeadlineLimits): number {
  return limits.statementTimeoutMs + limits.requestTimeoutMs;
}

export function requiredLeaseMs(
  limits: Pick<WorkerLimits, "requestTimeoutMs" | "heartbeatIntervalMs">,
): number {
  return limits.requestTimeoutMs + limits.heartbeatIntervalMs + 1;
}

export function maxDrainDurationMs(limits: DeadlineLimits): number {
  const lastStarted = Math.max(
    materializeCallBoundMs(limits),
    limits.requestTimeoutMs + 3 * limits.statementTimeoutMs,
  );
  return (
    limits.leaseDurationMs + lastStarted + DRAIN_STATEMENT_ALLOWANCE * limits.statementTimeoutMs
  );
}

export function requiredIsolationCalls(documents: number): number {
  return 1 + isolationSendsToIsolateOne(documents);
}

export function bulkIsolationBudget(
  limits: Pick<WorkerLimits, "maxIsolationCallsPerBatch">,
): number {
  return Math.max(0, limits.maxIsolationCallsPerBatch - 1);
}

function relationError(
  key:
    | "limits.heartbeatTooLong"
    | "limits.timeoutExceedsLease"
    | "limits.retryDelayInverted"
    | "limits.retryAgeTooSmall"
    | "limits.isolationBudgetTooSmall"
    | "limits.inFlightBelowBulk"
    | "limits.leaseTooShortForDrain"
    | "limits.fenceIntervalBelowRequest",
  limits: WorkerLimits,
  field?: "projectionTimeoutMs" | "requestTimeoutMs",
): SearchConfigurationError {
  switch (key) {
    case "limits.fenceIntervalBelowRequest":
      return new SearchConfigurationError(
        {
          key,
          params: {
            fenceRenewIntervalMs: limits.fenceRenewIntervalMs,
            requestTimeoutMs: limits.requestTimeoutMs,
          },
        },
        { details: { reason: "fence-interval-below-request-timeout" } },
      );
    case "limits.inFlightBelowBulk":
      return new SearchConfigurationError(
        {
          key,
          params: { maxInFlightBytes: limits.maxInFlightBytes, maxBulkBytes: limits.maxBulkBytes },
        },
        { details: { reason: "in-flight-below-bulk" } },
      );
    case "limits.leaseTooShortForDrain":
      return new SearchConfigurationError(
        {
          key,
          params: { leaseDurationMs: limits.leaseDurationMs, required: requiredLeaseMs(limits) },
        },
        { details: { reason: "lease-too-short-for-drain" } },
      );
    case "limits.heartbeatTooLong":
      return new SearchConfigurationError(
        {
          key,
          params: {
            heartbeatIntervalMs: limits.heartbeatIntervalMs,
            leaseDurationMs: limits.leaseDurationMs,
          },
        },
        { details: { reason: "heartbeat-exceeds-half-lease" } },
      );
    case "limits.timeoutExceedsLease": {
      const name = field ?? "projectionTimeoutMs";
      return new SearchConfigurationError(
        {
          key,
          params: { field: name, timeoutMs: limits[name], leaseDurationMs: limits.leaseDurationMs },
        },
        { details: { reason: "timeout-exceeds-lease", field: name } },
      );
    }
    case "limits.retryDelayInverted":
      return new SearchConfigurationError(
        {
          key,
          params: {
            retryBaseDelayMs: limits.retryBaseDelayMs,
            retryMaxDelayMs: limits.retryMaxDelayMs,
          },
        },
        { details: { reason: "retry-delay-inverted" } },
      );
    case "limits.retryAgeTooSmall":
      return new SearchConfigurationError(
        {
          key,
          params: {
            maxRetryAgeMs: limits.maxRetryAgeMs,
            retryBaseDelayMs: limits.retryBaseDelayMs,
          },
        },
        { details: { reason: "retry-age-below-base-delay" } },
      );
    case "limits.isolationBudgetTooSmall":
      return new SearchConfigurationError(
        {
          key,
          params: {
            maxIsolationCallsPerBatch: limits.maxIsolationCallsPerBatch,
            required: requiredIsolationCalls(limits.maxDocumentsPerClaim),
            maxDocumentsPerClaim: limits.maxDocumentsPerClaim,
          },
        },
        { details: { reason: "isolation-budget-too-small" } },
      );
  }
}

/**
 * Validates and freezes worker limits. Each relation is required for soundness: heartbeat <= lease / 2 (a lease
 * survives one missed beat); projection and request timeouts < lease (a step fits one lease); lease > request +
 * heartbeat (a send fits between beats); maxRetryAgeMs > retryBaseDelayMs (the first retry cannot exhaust it);
 * maxIsolationCallsPerBatch >= 1 + 2 * ceil(log2 maxDocumentsPerClaim) (one bad document is always found);
 * maxInFlightBytes >= maxBulkBytes; fenceRenewIntervalMs >= requestTimeoutMs.
 */
export function parseWorkerLimits(limits: WorkerLimits): Readonly<WorkerLimits> {
  const parsed = workerLimitsSchema.safeParse(limits);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "unrecognized_keys") {
      const field = (issue.keys[0] ?? "").slice(0, 64);
      throw new SearchConfigurationError(
        { key: "limits.unknownField", params: { field } },
        { details: { reason: "unknown-worker-limit", field } },
      );
    }
    const field = String(issue?.path[0] ?? "limits").slice(0, 64);
    throw new SearchConfigurationError(
      { key: "limits.invalidValue", params: { field } },
      { details: { reason: "invalid-worker-limits", field, issue: issue?.code ?? "unknown" } },
    );
  }
  const checked = parsed.data;
  if (checked.heartbeatIntervalMs * 2 > checked.leaseDurationMs) {
    throw relationError("limits.heartbeatTooLong", checked);
  }
  if (checked.projectionTimeoutMs >= checked.leaseDurationMs) {
    throw relationError("limits.timeoutExceedsLease", checked, "projectionTimeoutMs");
  }
  if (checked.requestTimeoutMs >= checked.leaseDurationMs) {
    throw relationError("limits.timeoutExceedsLease", checked, "requestTimeoutMs");
  }
  if (checked.retryBaseDelayMs > checked.retryMaxDelayMs) {
    throw relationError("limits.retryDelayInverted", checked);
  }
  if (checked.maxRetryAgeMs <= checked.retryBaseDelayMs) {
    throw relationError("limits.retryAgeTooSmall", checked);
  }
  if (checked.maxIsolationCallsPerBatch < requiredIsolationCalls(checked.maxDocumentsPerClaim)) {
    throw relationError("limits.isolationBudgetTooSmall", checked);
  }
  if (checked.maxInFlightBytes < checked.maxBulkBytes) {
    throw relationError("limits.inFlightBelowBulk", checked);
  }
  if (checked.leaseDurationMs < requiredLeaseMs(checked)) {
    throw relationError("limits.leaseTooShortForDrain", checked);
  }
  if (checked.fenceRenewIntervalMs < checked.requestTimeoutMs) {
    throw relationError("limits.fenceIntervalBelowRequest", checked);
  }
  return Object.freeze({ ...checked });
}

import { type SearchAdminOptions } from "./admin/search-admin";
import { type ReadLifetimeLimits } from "./query/catalog";
import { type WorkerLimits } from "./worker/limits";

export const RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS = 30_000;

export const RECOMMENDED_WORKER_LIMITS: Readonly<WorkerLimits> = Object.freeze({
  maxDocumentsPerClaim: 500,
  maxBulkBytes: 5 * 1024 * 1024,
  maxConcurrentBulkRequests: 2,
  projectionTimeoutMs: 30_000,
  requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  leaseDurationMs: 120_000, // > requestTimeoutMs + heartbeatIntervalMs
  heartbeatIntervalMs: 20_000,
  maxRetryAttempts: 10,
  maxRetryAgeMs: 3_600_000,
  maxIsolationCallsPerBatch: 32, // >= 1 + 2 * ceil(log2 maxDocumentsPerClaim)
  retryBaseDelayMs: 1_000,
  retryMaxDelayMs: 300_000,
  maxInFlightBytes: 16 * 1024 * 1024, // >= (maxConcurrentBulkRequests + 1) * maxBulkBytes
  statementTimeoutMs: 5_000,
  fenceRenewIntervalMs: 30_000, // >= requestTimeoutMs
});

export const RECOMMENDED_WORKER_POLL_INTERVAL_MS = 1_000;

export const RECOMMENDED_WORKER_STOP_DEADLINE_MS = RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS;

export type WorkerBounds = SearchAdminOptions["workerBounds"];

/** Must be built from the worker's actual limits: retirement waits leaseDurationMs + requestTimeoutMs for in-flight bulks. */
export function workerBoundsFrom(
  limits: Pick<WorkerLimits, "leaseDurationMs" | "requestTimeoutMs">,
): WorkerBounds {
  return { leaseDurationMs: limits.leaseDurationMs, requestTimeoutMs: limits.requestTimeoutMs };
}

export const RECOMMENDED_WORKER_BOUNDS: Readonly<WorkerBounds> = Object.freeze(
  workerBoundsFrom(RECOMMENDED_WORKER_LIMITS),
);

/** Use the same values for the admin and query handles; maximums recorded in read_heads never decrease. */
export const RECOMMENDED_READ_LIFETIMES: Readonly<ReadLifetimeLimits> = Object.freeze({
  maxSearchLifetimeMs: 30_000,
  maxCursorLifetimeMs: 600_000,
  maxPitKeepAliveMs: 120_000,
});

export const RECOMMENDED_RETIREMENT_SAFETY_MARGIN_MS = 300_000;

export const RECOMMENDED_ADMIN_LIFETIMES: Readonly<SearchAdminOptions["lifetimes"]> = Object.freeze(
  {
    ...RECOMMENDED_READ_LIFETIMES,
    retirementSafetyMarginMs: RECOMMENDED_RETIREMENT_SAFETY_MARGIN_MS,
  },
);

export const RECOMMENDED_ADMIN_TIMEOUTS: Readonly<SearchAdminOptions["timeouts"]> = Object.freeze({
  lockTimeoutMs: 5_000,
  statementTimeoutMs: 30_000,
  idleInTransactionTimeoutMs: 60_000,
  adminLeaseMs: 300_000, // >= 4 * statementTimeoutMs + 3 * client requestTimeoutMs
});

export const RECOMMENDED_CUTOVER: Readonly<SearchAdminOptions["cutover"]> = Object.freeze({
  maxPendingDocuments: 1_000,
  sampleSize: 200,
});

export const RECOMMENDED_QUERY_LIMITS: Readonly<
  { maxPageSize: number; timeoutMs: number } & ReadLifetimeLimits
> = Object.freeze({
  maxPageSize: 100,
  timeoutMs: 10_000, // < maxSearchLifetimeMs
  ...RECOMMENDED_READ_LIFETIMES,
});

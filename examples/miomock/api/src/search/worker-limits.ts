import { RECOMMENDED_WORKER_LIMITS } from "@sonamu-kit/opensearch";
import { type WorkerLimits } from "@sonamu-kit/opensearch/postgres";

// Every worker, the admin handle's workerBounds and the tests read their limits here, so they cannot drift apart.

/** Overrides both projectionTimeoutMs and requestTimeoutMs; must stay below the lease duration. */
export const SEARCH_WORKER_STAGE_TIMEOUT_ENV = "MIOMOCK_SEARCH_WORKER_STAGE_TIMEOUT_MS";

export function searchWorkerLimits(): WorkerLimits {
  const raw = process.env[SEARCH_WORKER_STAGE_TIMEOUT_ENV];
  if (raw === undefined || raw === "") {
    return RECOMMENDED_WORKER_LIMITS;
  }
  const timeoutMs = Number(raw);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs >= RECOMMENDED_WORKER_LIMITS.leaseDurationMs
  ) {
    throw new Error(
      `${SEARCH_WORKER_STAGE_TIMEOUT_ENV}는 ${RECOMMENDED_WORKER_LIMITS.leaseDurationMs}보다 작은 양의 정수(ms)여야 합니다`,
    );
  }
  return {
    ...RECOMMENDED_WORKER_LIMITS,
    projectionTimeoutMs: timeoutMs,
    requestTimeoutMs: timeoutMs,
  };
}

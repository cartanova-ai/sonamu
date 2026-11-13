import { setTimeout as sleep } from "node:timers/promises";

import { SearchError } from "@sonamu-kit/opensearch";
import { z } from "zod";

/** run must open the transaction itself; a dropped connection is never retried because its commit is unknown. */
export const MAX_TRANSACTION_ATTEMPTS = 3;

const CONFLICT_REASONS = new Set(["serialization-failure", "deadlock"]);
const driverConflictSchema = z.looseObject({ code: z.enum(["40001", "40P01"]) });

export function isTransactionConflict<Thrown>(error: Thrown): boolean {
  if (error instanceof SearchError) {
    return (
      error.code === "SEARCH_UNAVAILABLE" &&
      error.retryable &&
      CONFLICT_REASONS.has(String(error.details?.reason))
    );
  }
  return driverConflictSchema.safeParse(error).success;
}

export async function withTransactionRetry<T>(
  run: () => Promise<T>,
  maxAttempts: number = MAX_TRANSACTION_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransactionConflict(error)) throw error;
      await sleep(Math.random() * 50 * attempt);
    }
  }
}

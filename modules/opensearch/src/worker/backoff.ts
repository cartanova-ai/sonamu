import { SearchConfigurationError } from "../errors";

// delay = min(maxDelayMs, baseDelayMs * 2^attempts) * (0.5 + 0.5 * random()), an integer in [floor(cap / 2), cap].

export type RandomSource = () => number;

export interface BackoffPolicy {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export function assertBackoffPolicy(policy: BackoffPolicy): BackoffPolicy {
  const { baseDelayMs, maxDelayMs } = policy;
  if (!Number.isSafeInteger(baseDelayMs) || baseDelayMs < 0) throw invalidPolicy("baseDelayMs");
  if (!Number.isSafeInteger(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw invalidPolicy("maxDelayMs");
  }
  return policy;
}

function invalidPolicy(name: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "bulk.invalidLimit", params: { name } },
    { details: { reason: "invalid-backoff-policy", name } },
  );
}

export function backoffCapMs(policy: BackoffPolicy, attempts: number): number {
  const { baseDelayMs, maxDelayMs } = assertBackoffPolicy(policy);
  const exponent = Number.isSafeInteger(attempts) && attempts > 0 ? attempts : 0;
  // 2^1024 is Infinity, which min clamps; base 0 would give 0 * Infinity = NaN.
  if (baseDelayMs === 0) return 0;
  return Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
}

export function backoffDelayMs(
  policy: BackoffPolicy,
  attempts: number,
  random: RandomSource = Math.random,
): number {
  const cap = backoffCapMs(policy, attempts);
  const sample = random();
  const unit = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1) : 0;
  return Math.min(cap, Math.floor(cap * (0.5 + 0.5 * unit)));
}

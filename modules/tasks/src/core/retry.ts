import { type SerializedError } from "./error";

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
}

export type RetryDecisionFn = (error: SerializedError, attempt: number) => RetryDecision;

export interface StaticRetryPolicy {
  maxAttempts?: number;
  initialIntervalMs?: number;
  backoffCoefficient?: number;
  maximumIntervalMs?: number;
}

export interface DynamicRetryPolicy {
  maxAttempts?: number;
  shouldRetry: RetryDecisionFn;
}

export type RetryPolicy = StaticRetryPolicy | DynamicRetryPolicy;

export interface SerializableRetryPolicy extends StaticRetryPolicy {
  hasDynamicPolicy?: boolean;
}

export type MergedStaticRetryPolicy = Required<StaticRetryPolicy>;

export interface MergedDynamicRetryPolicy {
  maxAttempts: number;
  shouldRetry: RetryDecisionFn;
}

export type MergedRetryPolicy = MergedStaticRetryPolicy | MergedDynamicRetryPolicy;

export const DEFAULT_RETRY_POLICY: Required<StaticRetryPolicy> = {
  maxAttempts: 5,
  initialIntervalMs: 1000,
  backoffCoefficient: 2,
  maximumIntervalMs: 60_000,
};

export function isDynamicRetryPolicy(policy: RetryPolicy): policy is DynamicRetryPolicy {
  return (
    "shouldRetry" in policy &&
    Object.prototype.toString.call(policy.shouldRetry).endsWith("Function]")
  );
}

export function isStaticRetryPolicy(policy: RetryPolicy): policy is StaticRetryPolicy {
  return !isDynamicRetryPolicy(policy);
}

export function calculateRetryDelayMs(attemptNumber: number): number {
  const { initialIntervalMs, backoffCoefficient, maximumIntervalMs } = DEFAULT_RETRY_POLICY;
  const backoffMs = initialIntervalMs * backoffCoefficient ** (attemptNumber - 1);
  return Math.min(backoffMs, maximumIntervalMs);
}

export function shouldRetry(retryPolicy: StaticRetryPolicy, attemptNumber: number): boolean {
  const maxAttempts = retryPolicy.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts;
  return attemptNumber < maxAttempts;
}

export function shouldRetryByPolicy(policy: StaticRetryPolicy, attemptNumber: number): boolean {
  const maxAttempts = policy.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts;
  return attemptNumber < maxAttempts;
}

export function mergeRetryPolicy(policy: StaticRetryPolicy | undefined): MergedStaticRetryPolicy;
export function mergeRetryPolicy(policy: DynamicRetryPolicy): MergedDynamicRetryPolicy;
export function mergeRetryPolicy(policy?: RetryPolicy): MergedRetryPolicy;
export function mergeRetryPolicy(policy?: RetryPolicy): MergedRetryPolicy {
  if (policy && isDynamicRetryPolicy(policy)) {
    return {
      maxAttempts: policy.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
      shouldRetry: policy.shouldRetry,
    };
  }
  return {
    maxAttempts: policy?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
    initialIntervalMs: policy?.initialIntervalMs ?? DEFAULT_RETRY_POLICY.initialIntervalMs,
    backoffCoefficient: policy?.backoffCoefficient ?? DEFAULT_RETRY_POLICY.backoffCoefficient,
    maximumIntervalMs: policy?.maximumIntervalMs ?? DEFAULT_RETRY_POLICY.maximumIntervalMs,
  };
}

export function serializeRetryPolicy(policy?: RetryPolicy): SerializableRetryPolicy {
  if (!policy) {
    return { hasDynamicPolicy: false };
  }

  if (isDynamicRetryPolicy(policy)) {
    return {
      maxAttempts: policy.maxAttempts,
      hasDynamicPolicy: true,
    };
  }

  return {
    maxAttempts: policy.maxAttempts,
    initialIntervalMs: policy.initialIntervalMs,
    backoffCoefficient: policy.backoffCoefficient,
    maximumIntervalMs: policy.maximumIntervalMs,
    hasDynamicPolicy: false,
  };
}

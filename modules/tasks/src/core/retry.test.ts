import { describe, expect, test } from "vitest";

import { type SerializedError } from "./error";
import { type DynamicRetryPolicy, type StaticRetryPolicy } from "./retry";
import {
  calculateRetryDelayMs,
  DEFAULT_RETRY_POLICY,
  isDynamicRetryPolicy,
  isStaticRetryPolicy,
  mergeRetryPolicy,
  serializeRetryPolicy,
  shouldRetry,
  shouldRetryByPolicy,
} from "./retry";

const rejectRetry = (_error: SerializedError, _attempt: number) => ({
  shouldRetry: false,
  delayMs: 5000,
});
const acceptRetry = () => ({ shouldRetry: true, delayMs: 1000 });

describe("calculateRetryDelayMs", () => {
  test("calculates exponential backoff correctly", () => {
    expect(calculateRetryDelayMs(1)).toBe(1000);
    expect(calculateRetryDelayMs(2)).toBe(2000);
    expect(calculateRetryDelayMs(3)).toBe(4000);
    expect(calculateRetryDelayMs(4)).toBe(8000);
    expect(calculateRetryDelayMs(5)).toBe(16_000);
    expect(calculateRetryDelayMs(6)).toBe(32_000);
    // attempt 7: 1s * 2^6 = 64s = 64000ms, capped at 60000ms (max)
    expect(calculateRetryDelayMs(7)).toBe(60_000);
  });

  test("caps delay at maximum interval", () => {
    const { maximumIntervalMs } = DEFAULT_RETRY_POLICY;

    // attempt 7: 1s * 2^6 = 64s = 64000ms, capped at 60000ms (max)
    expect(calculateRetryDelayMs(7)).toBe(maximumIntervalMs);

    // attempts 10 & 100: should still be capped
    expect(calculateRetryDelayMs(10)).toBe(maximumIntervalMs);
    expect(calculateRetryDelayMs(100)).toBe(maximumIntervalMs);
  });

  test("handles edge cases", () => {
    // attempt 0: 1s * 2^-1 = 0.5s = 500ms
    expect(calculateRetryDelayMs(0)).toBe(500);
    expect(calculateRetryDelayMs(Infinity)).toBe(60_000);
  });
});

describe("shouldRetry", () => {
  test("returns false when attempt reaches maxAttempts", () => {
    // 기본 정책: maxAttempts = 5
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 1)).toBe(true);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 4)).toBe(true);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 5)).toBe(false);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 10)).toBe(false);
  });
});

describe("shouldRetryByPolicy", () => {
  test("respects maxAttempts from policy", () => {
    expect(shouldRetryByPolicy({ maxAttempts: 3 }, 1)).toBe(true);
    expect(shouldRetryByPolicy({ maxAttempts: 3 }, 2)).toBe(true);
    expect(shouldRetryByPolicy({ maxAttempts: 3 }, 3)).toBe(false);
    expect(shouldRetryByPolicy({ maxAttempts: 3 }, 4)).toBe(false);
  });

  test("uses default maxAttempts when not specified", () => {
    expect(shouldRetryByPolicy({}, 1)).toBe(true);
    expect(shouldRetryByPolicy({}, 4)).toBe(true);
    expect(shouldRetryByPolicy({}, 5)).toBe(false);
  });
});

describe("isDynamicRetryPolicy", () => {
  test("returns true for policy with shouldRetry function", () => {
    const dynamicPolicy: DynamicRetryPolicy = {
      maxAttempts: 3,
      shouldRetry: () => ({ shouldRetry: true, delayMs: 1000 }),
    };
    expect(isDynamicRetryPolicy(dynamicPolicy)).toBe(true);
  });

  test("returns false for static policy without shouldRetry", () => {
    const staticPolicy: StaticRetryPolicy = {
      maxAttempts: 5,
      initialIntervalMs: 1000,
    };
    expect(isDynamicRetryPolicy(staticPolicy)).toBe(false);
  });

  test("returns false for empty policy", () => {
    expect(isDynamicRetryPolicy({})).toBe(false);
  });
});

describe("isStaticRetryPolicy", () => {
  test("returns true for static policy without shouldRetry", () => {
    const staticPolicy: StaticRetryPolicy = {
      maxAttempts: 5,
      initialIntervalMs: 1000,
    };
    expect(isStaticRetryPolicy(staticPolicy)).toBe(true);
  });

  test("returns true for empty policy", () => {
    expect(isStaticRetryPolicy({})).toBe(true);
  });

  test("returns false for dynamic policy", () => {
    const dynamicPolicy: DynamicRetryPolicy = {
      maxAttempts: 3,
      shouldRetry: () => ({ shouldRetry: true, delayMs: 1000 }),
    };
    expect(isStaticRetryPolicy(dynamicPolicy)).toBe(false);
  });
});

describe("mergeRetryPolicy", () => {
  test("returns default values when policy is undefined", () => {
    const merged = mergeRetryPolicy(undefined);
    expect(merged.maxAttempts).toBe(5);
    expect(merged.initialIntervalMs).toBe(1000);
    expect(merged.backoffCoefficient).toBe(2);
    expect(merged.maximumIntervalMs).toBe(60_000);
  });

  test("uses provided values and fills missing with defaults for static policy", () => {
    const merged = mergeRetryPolicy({ maxAttempts: 10, initialIntervalMs: 500 });
    expect(merged.maxAttempts).toBe(10);
    expect(merged.initialIntervalMs).toBe(500);
    expect(merged.backoffCoefficient).toBe(2);
    expect(merged.maximumIntervalMs).toBe(60_000);
  });

  test("returns only maxAttempts and shouldRetry for dynamic policy", () => {
    const dynamicPolicy: DynamicRetryPolicy = {
      maxAttempts: 3,
      shouldRetry: rejectRetry,
    };
    const merged = mergeRetryPolicy(dynamicPolicy);

    expect(merged.maxAttempts).toBe(3);
    expect(merged.shouldRetry).toBe(rejectRetry);
    // 동적 정책에서는 backoff 필드들이 없어야 합니다.
    expect("initialIntervalMs" in merged).toBe(false);
    expect("backoffCoefficient" in merged).toBe(false);
    expect("maximumIntervalMs" in merged).toBe(false);
  });

  test("uses default maxAttempts for dynamic policy when not specified", () => {
    const dynamicPolicy: DynamicRetryPolicy = {
      shouldRetry: acceptRetry,
    };
    const merged = mergeRetryPolicy(dynamicPolicy);

    expect(merged.maxAttempts).toBe(5); // 기본값
    expect(merged.shouldRetry).toBe(acceptRetry);
  });
});

describe("serializeRetryPolicy", () => {
  test("returns empty object with hasDynamicPolicy=false for undefined", () => {
    const serialized = serializeRetryPolicy(undefined);
    expect(serialized.hasDynamicPolicy).toBe(false);
    expect(serialized.maxAttempts).toBeUndefined();
  });

  test("serializes static fields for static policy", () => {
    const serialized = serializeRetryPolicy({
      maxAttempts: 10,
      initialIntervalMs: 2000,
    });
    expect(serialized.maxAttempts).toBe(10);
    expect(serialized.initialIntervalMs).toBe(2000);
    expect(serialized.hasDynamicPolicy).toBe(false);
    expect("shouldRetry" in serialized).toBe(false);
  });

  test("excludes backoff fields for dynamic policy", () => {
    const dynamicPolicy: DynamicRetryPolicy = {
      maxAttempts: 3,
      shouldRetry: () => ({ shouldRetry: true, delayMs: 1000 }),
    };
    const serialized = serializeRetryPolicy(dynamicPolicy);

    expect(serialized.maxAttempts).toBe(3);
    expect(serialized.hasDynamicPolicy).toBe(true);
    // 동적 정책에서는 backoff 필드들이 없어야 합니다.
    expect(serialized.initialIntervalMs).toBeUndefined();
    expect(serialized.backoffCoefficient).toBeUndefined();
    expect(serialized.maximumIntervalMs).toBeUndefined();
  });

  test("includes backoff fields for static policy", () => {
    const staticPolicy: StaticRetryPolicy = {
      maxAttempts: 5,
      initialIntervalMs: 2000,
      backoffCoefficient: 3,
      maximumIntervalMs: 30000,
    };
    const serialized = serializeRetryPolicy(staticPolicy);

    expect(serialized.maxAttempts).toBe(5);
    expect(serialized.initialIntervalMs).toBe(2000);
    expect(serialized.backoffCoefficient).toBe(3);
    expect(serialized.maximumIntervalMs).toBe(30000);
    expect(serialized.hasDynamicPolicy).toBe(false);
  });
});

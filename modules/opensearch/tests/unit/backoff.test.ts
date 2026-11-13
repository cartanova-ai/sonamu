import { describe, expect, it } from "vitest";

import { SearchConfigurationError } from "../../src/errors";
import { assertBackoffPolicy, backoffCapMs, backoffDelayMs } from "../../src/worker/backoff";

// Set PROPERTY_SEED to replay a failing run.
const SEED = Number(process.env.PROPERTY_SEED ?? Date.now() % 2 ** 31);

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const POLICY = { baseDelayMs: 100, maxDelayMs: 10_000 };

describe("재시도 backoff", () => {
  it("min(max, base * 2^attempts) * (0.5 + 0.5 * random)을 정수 ms로 계산한다", () => {
    expect(backoffDelayMs(POLICY, 0, () => 0)).toBe(50);
    expect(backoffDelayMs(POLICY, 3, () => 0)).toBe(400);
    expect(backoffDelayMs(POLICY, 3, () => 0.5)).toBe(600);
    expect(backoffDelayMs(POLICY, 3, () => 0.999_999)).toBe(799);
    expect(backoffDelayMs(POLICY, 7, () => 0)).toBe(5_000);
    expect(backoffDelayMs(POLICY, 7, () => 0.999_999_999)).toBe(9_999);
  });

  it("상한은 시도 횟수에 대해 단조 증가하고 maxDelayMs에서 멈춘다", () => {
    let previous = 0;
    for (let attempts = 0; attempts <= 2_000; attempts += 1) {
      const cap = backoffCapMs(POLICY, attempts);
      expect(cap).toBeGreaterThanOrEqual(previous);
      expect(cap).toBeLessThanOrEqual(POLICY.maxDelayMs);
      previous = cap;
    }
    expect(backoffCapMs(POLICY, 1_024)).toBe(POLICY.maxDelayMs);
    expect(backoffCapMs(POLICY, Number.MAX_SAFE_INTEGER)).toBe(POLICY.maxDelayMs);
  });

  it(`지터는 [floor(cap / 2), cap] 안이고 같은 난수에서는 시도 횟수에 대해 단조 증가한다 (seed ${SEED})`, () => {
    const random = prng(SEED);
    for (let round = 0; round < 2_000; round += 1) {
      const baseDelayMs = Math.floor(random() * 5_000);
      const maxDelayMs = baseDelayMs + Math.floor(random() * 600_000);
      const policy = { baseDelayMs, maxDelayMs };
      const sample = random();
      let previous = -1;
      for (let attempts = 0; attempts < 64; attempts += 1) {
        const cap = backoffCapMs(policy, attempts);
        const delay = backoffDelayMs(policy, attempts, () => sample);
        const message = `seed ${SEED}, round ${round}, attempts ${attempts}`;
        expect(Number.isSafeInteger(delay), message).toBe(true);
        expect(delay, message).toBeGreaterThanOrEqual(Math.floor(cap / 2));
        expect(delay, message).toBeLessThanOrEqual(cap);
        expect(delay, message).toBeGreaterThanOrEqual(previous);
        previous = delay;
      }
    }
  });

  it("잘못된 시도 횟수는 0으로, 범위를 벗어난 난수는 경계로 다룬다", () => {
    for (const attempts of [-1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(backoffCapMs(POLICY, attempts)).toBe(100);
    }
    expect(backoffDelayMs(POLICY, 0, () => Number.NaN)).toBe(50);
    expect(backoffDelayMs(POLICY, 0, () => -3)).toBe(50);
    expect(backoffDelayMs(POLICY, 0, () => 7)).toBe(100);
  });

  it("base 0이면 지연도 0이다", () => {
    expect(backoffDelayMs({ baseDelayMs: 0, maxDelayMs: 0 }, 100, () => 0.7)).toBe(0);
  });

  it("잘못된 정책은 SearchConfigurationError", () => {
    for (const policy of [
      { baseDelayMs: -1, maxDelayMs: 10 },
      { baseDelayMs: Number.NaN, maxDelayMs: 10 },
      { baseDelayMs: 100, maxDelayMs: 50 },
      { baseDelayMs: 1, maxDelayMs: Number.POSITIVE_INFINITY },
    ]) {
      let caught: unknown;
      try {
        assertBackoffPolicy(policy);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SearchConfigurationError);
      expect(caught instanceof SearchConfigurationError ? caught.details?.reason : undefined).toBe(
        "invalid-backoff-policy",
      );
    }
  });
});

import { describe, expect, it } from "vitest";

import { createCooldownRegistry } from "../../src/worker/cooldown";

const POLICY = { baseDelayMs: 100, maxDelayMs: 10_000 };
const TARGET_A = "11111111-1111-4111-8111-111111111111";
const TARGET_B = "22222222-2222-4222-8222-222222222222";

function clock() {
  let now = 1_000;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("프로세스 cooldown", () => {
  it("인프라 실패로 들어가고, 시계가 지나면 풀린다", () => {
    const time = clock();
    const registry = createCooldownRegistry(POLICY, { now: time.now, random: () => 0 });
    expect(registry.drainGate()).toEqual({ blocked: false, remainingMs: 0 });
    expect(registry.enter({ scope: "client" })).toBe(50);
    expect(registry.drainGate()).toEqual({ blocked: true, remainingMs: 50 });
    time.advance(49);
    expect(registry.drainGate()).toEqual({ blocked: true, remainingMs: 1 });
    time.advance(1);
    expect(registry.drainGate()).toEqual({ blocked: false, remainingMs: 0 });
    expect(registry.isActive({ scope: "client" })).toBe(false);
  });

  it("연속 실패마다 길어지고(상한까지), 성공이 failures를 지운다", () => {
    const time = clock();
    const registry = createCooldownRegistry(POLICY, { now: time.now, random: () => 0.999_999 });
    const lengths: number[] = [];
    for (let failure = 0; failure < 10; failure += 1) {
      lengths.push(registry.enter({ scope: "target", targetId: TARGET_A }));
      time.advance(20_000);
    }
    expect(lengths).toEqual([99, 199, 399, 799, 1_599, 3_199, 6_399, 9_999, 9_999, 9_999]);
    expect(registry.entry({ scope: "target", targetId: TARGET_A })?.failures).toBe(10);
    registry.clear({ scope: "target", targetId: TARGET_A });
    expect(registry.entry({ scope: "target", targetId: TARGET_A })).toBeUndefined();
    expect(registry.enter({ scope: "target", targetId: TARGET_A })).toBe(99);
  });

  it("대상 cooldown은 대상별이고 drain 전체를 막지 않는다", () => {
    const time = clock();
    const registry = createCooldownRegistry(POLICY, { now: time.now, random: () => 0 });
    registry.enter({ scope: "target", targetId: TARGET_B });
    registry.enter({ scope: "target", targetId: TARGET_A });
    expect(registry.coolingTargets()).toEqual([TARGET_A, TARGET_B]);
    expect(registry.drainGate().blocked).toBe(false);
    expect(registry.isActive({ scope: "client" })).toBe(false);
    registry.clear({ scope: "target", targetId: TARGET_A });
    expect(registry.coolingTargets()).toEqual([TARGET_B]);
    time.advance(50);
    expect(registry.coolingTargets()).toEqual([]);
  });

  it("데이터베이스 cooldown도 drain 전체를 막고, 남은 시간은 둘 중 늦은 쪽이다", () => {
    const time = clock();
    const registry = createCooldownRegistry(POLICY, { now: time.now, random: () => 0 });
    registry.enter({ scope: "client" });
    registry.enter({ scope: "database" });
    registry.enter({ scope: "database" });
    expect(registry.drainGate()).toEqual({ blocked: true, remainingMs: 100 });
    expect(registry.earliestExpiryMs()).toBe(50);
  });

  it("401/403은 최대 지연이고, 이미 더 긴 cooldown을 짧은 실패가 앞당기지 않는다", () => {
    const time = clock();
    const registry = createCooldownRegistry(POLICY, { now: time.now, random: () => 0 });
    expect(registry.enter({ scope: "client" }, { atMaximum: true })).toBe(10_000);
    expect(registry.enter({ scope: "client" })).toBe(10_000);
    time.advance(9_000);
    expect(registry.remainingMs({ scope: "client" })).toBe(1_000);
  });
});

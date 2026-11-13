import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createSearchAdmin } from "../../src/admin";
import { leasedRemoteRequestTimeoutMs } from "../../src/admin/remote-create";
import { adminLifetimesSchema, adminTimeoutsSchema } from "../../src/admin/rows";
import {
  createSearchClient,
  createSearchQueries,
  RECOMMENDED_ADMIN_LIFETIMES,
  RECOMMENDED_ADMIN_TIMEOUTS,
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  RECOMMENDED_CUTOVER,
  RECOMMENDED_QUERY_LIMITS,
  RECOMMENDED_READ_LIFETIMES,
  RECOMMENDED_RETIREMENT_SAFETY_MARGIN_MS,
  RECOMMENDED_WORKER_BOUNDS,
  RECOMMENDED_WORKER_LIMITS,
  RECOMMENDED_WORKER_POLL_INTERVAL_MS,
  RECOMMENDED_WORKER_STOP_DEADLINE_MS,
  workerBoundsFrom,
} from "../../src/index";
import {
  createIndexer,
  createPostgresSynchronization,
  parseWorkerLimits,
} from "../../src/postgres";
import { createFakeCatalog, createFakeOpenSearch, createTestDefinition } from "../../src/testing";

const definition = createTestDefinition({
  key: "chat-messages",
  schema: z.object({ body: z.string() }),
});

function inertDependencies() {
  const getPrimaryDatabase = vi.fn(() => {
    throw new Error("팩토리가 primary를 조회하면 안 됩니다.");
  });
  const fake = createFakeOpenSearch();
  const client = createSearchClient({
    createClient: () => fake.client,
    ownsClient: true,
    requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  });
  const synchronization = createPostgresSynchronization({ getPrimaryDatabase, namespace: "app" });
  return { client, synchronization, getPrimaryDatabase };
}

describe("권장 설정값", () => {
  it("워커 한도는 parseWorkerLimits의 범위와 관계 규칙을 모두 통과하고 createIndexer가 받는다", () => {
    expect(parseWorkerLimits(RECOMMENDED_WORKER_LIMITS)).toEqual(RECOMMENDED_WORKER_LIMITS);
    const { client, synchronization, getPrimaryDatabase } = inertDependencies();
    expect(() =>
      createIndexer({
        client,
        synchronization,
        definitions: [definition],
        limits: { ...RECOMMENDED_WORKER_LIMITS },
      }),
    ).not.toThrow();
    expect(getPrimaryDatabase).not.toHaveBeenCalled();
  });

  it("관리 옵션 스키마와 createSearchAdmin이 권장 수명, 시간 제한, cutover, workerBounds를 받는다", () => {
    expect(adminLifetimesSchema.parse(RECOMMENDED_ADMIN_LIFETIMES)).toEqual(
      RECOMMENDED_ADMIN_LIFETIMES,
    );
    expect(adminTimeoutsSchema.parse(RECOMMENDED_ADMIN_TIMEOUTS)).toEqual(
      RECOMMENDED_ADMIN_TIMEOUTS,
    );
    const { client, synchronization } = inertDependencies();
    expect(() =>
      createSearchAdmin({
        client,
        synchronization,
        definitions: [definition],
        lifetimes: RECOMMENDED_ADMIN_LIFETIMES,
        timeouts: RECOMMENDED_ADMIN_TIMEOUTS,
        cutover: RECOMMENDED_CUTOVER,
        workerBounds: RECOMMENDED_WORKER_BOUNDS,
      }),
    ).not.toThrow();
  });

  it("관리 임대 안의 원격 생성 요청 예산이 권장 클라이언트 제한 시간 이상이다", () => {
    const perRequest = leasedRemoteRequestTimeoutMs(RECOMMENDED_ADMIN_TIMEOUTS);
    expect(perRequest).toBeGreaterThanOrEqual(RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS);
  });

  it("workerBounds는 그것을 만든 워커 한도의 임대와 요청 제한 시간과 같다", () => {
    expect(RECOMMENDED_WORKER_BOUNDS).toEqual({
      leaseDurationMs: RECOMMENDED_WORKER_LIMITS.leaseDurationMs,
      requestTimeoutMs: RECOMMENDED_WORKER_LIMITS.requestTimeoutMs,
    });
    const overridden = {
      ...RECOMMENDED_WORKER_LIMITS,
      leaseDurationMs: 300_000,
      requestTimeoutMs: 60_000,
      fenceRenewIntervalMs: 60_000,
    };
    expect(parseWorkerLimits(overridden)).toEqual(overridden);
    expect(workerBoundsFrom(overridden)).toEqual({
      leaseDurationMs: 300_000,
      requestTimeoutMs: 60_000,
    });
    // workerBounds bounds real request time only if the client timeout is not longer.
    expect(RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(
      RECOMMENDED_WORKER_BOUNDS.requestTimeoutMs,
    );
  });

  it("은퇴 유예는 가장 긴 커서 수명과 검색 수명을 합친 것보다 길고, PIT은 커서 수명 안에 있다", () => {
    const graceMs =
      RECOMMENDED_ADMIN_LIFETIMES.maxCursorLifetimeMs +
      RECOMMENDED_ADMIN_LIFETIMES.maxSearchLifetimeMs +
      RECOMMENDED_ADMIN_LIFETIMES.retirementSafetyMarginMs;
    expect(RECOMMENDED_RETIREMENT_SAFETY_MARGIN_MS).toBeGreaterThan(0);
    expect(graceMs).toBeGreaterThan(
      RECOMMENDED_READ_LIFETIMES.maxCursorLifetimeMs +
        RECOMMENDED_READ_LIFETIMES.maxSearchLifetimeMs,
    );
    expect(graceMs).toBeGreaterThanOrEqual(
      Math.max(
        RECOMMENDED_QUERY_LIMITS.maxCursorLifetimeMs,
        RECOMMENDED_QUERY_LIMITS.maxSearchLifetimeMs,
        RECOMMENDED_QUERY_LIMITS.maxPitKeepAliveMs,
      ),
    );
    expect(RECOMMENDED_READ_LIFETIMES.maxPitKeepAliveMs).toBeLessThanOrEqual(
      RECOMMENDED_READ_LIFETIMES.maxCursorLifetimeMs,
    );
    // A query lifetime above the recorded maximum fails closed.
    expect(RECOMMENDED_QUERY_LIMITS).toMatchObject(RECOMMENDED_READ_LIFETIMES);
    expect(RECOMMENDED_ADMIN_LIFETIMES).toMatchObject(RECOMMENDED_READ_LIFETIMES);
  });

  it("쿼리 한도는 createSearchQueries의 검증(검색 제한 시간 <= 검색 수명)을 통과한다", () => {
    const { client } = inertDependencies();
    expect(RECOMMENDED_QUERY_LIMITS.timeoutMs).toBeLessThanOrEqual(
      RECOMMENDED_QUERY_LIMITS.maxSearchLifetimeMs,
    );
    expect(() =>
      createSearchQueries({
        client,
        catalog: createFakeCatalog(),
        logicalKey: "chat-messages",
        supportedFingerprints: [definition.fingerprint],
        limits: RECOMMENDED_QUERY_LIMITS,
      }),
    ).not.toThrow();
  });

  it("수명 주기 값은 양수이고 stop 기한은 진행 중인 요청 하나가 끝날 시간이다", () => {
    expect(RECOMMENDED_WORKER_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(RECOMMENDED_WORKER_STOP_DEADLINE_MS).toBeGreaterThanOrEqual(
      RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
    );
  });

  it("권장값 객체는 동결되어 있어 펼쳐 쓰고 덮어써야 한다", () => {
    for (const value of [
      RECOMMENDED_WORKER_LIMITS,
      RECOMMENDED_WORKER_BOUNDS,
      RECOMMENDED_READ_LIFETIMES,
      RECOMMENDED_ADMIN_LIFETIMES,
      RECOMMENDED_ADMIN_TIMEOUTS,
      RECOMMENDED_CUTOVER,
      RECOMMENDED_QUERY_LIMITS,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});

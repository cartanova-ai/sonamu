import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  SearchCursorExpired,
  SearchError,
  SearchQueryInvalid,
  SearchRebuildRequired,
} from "../../src/errors";
import { decodeCursor, encodeCursor, MAX_CURSOR_LENGTH } from "../../src/query/cursor";
import { type CursorPayload } from "../../src/query/schemas";
import { createTestReadHead, createTestReadTarget, FAKE_CATALOG_START_MS } from "../../src/testing";
import {
  createQueryHarness,
  FINGERPRINT,
  LOGICAL_KEY,
  messages,
  NAMESPACE,
  NEXT_TARGET_ID,
  QUERY_LIMITS,
  ROTATED_KEY,
  searchErrorOf,
  seedIndex,
  SIGNING_KEY,
  sortedBody,
  TARGET_ID,
  thrownSearchError,
} from "./query-fixtures";

const MAX_LIFETIME = QUERY_LIMITS.maxCursorLifetimeMs;

function payload(overrides: Partial<CursorPayload> = {}): CursorPayload {
  return {
    v: 1,
    tid: TARGET_ID,
    fp: FINGERPRINT,
    qh: "c".repeat(64),
    iat: 1_000,
    exp: 1_000 + MAX_LIFETIME,
    sa: [3, "m0003"],
    n: 3,
    g: 1,
    ...overrides,
  };
}

// Signs arbitrary text with the real key: a valid signature over an invalid payload.
function signRaw(text: string): string {
  const encoded = Buffer.from(text, "utf8").toString("base64url");
  const signed = `${encoded}.${SIGNING_KEY.id}`;
  return `${signed}.${createHmac("sha256", SIGNING_KEY.secret).update(signed).digest("base64url")}`;
}

function decode(cursor: string): CursorPayload {
  return decodeCursor(cursor, [SIGNING_KEY], MAX_LIFETIME);
}

describe("커서 서명과 해석", () => {
  it("서명한 내용을 그대로 돌려주고, 키 교체 중에는 이전 키의 커서도 검증한다", () => {
    const original = payload({ pit: "pit-1" });
    const cursor = encodeCursor(original, SIGNING_KEY);
    expect(decode(cursor)).toEqual(original);
    expect(decodeCursor(cursor, [ROTATED_KEY, SIGNING_KEY], MAX_LIFETIME)).toEqual(original);
    expect(cursor.split(".")[1]).toBe("k1");
  });

  it("모르는 키, 바뀐 내용, 바뀐 키 ID, 다른 표기의 서명은 서명 불일치로 만료 처리한다", () => {
    const cursor = encodeCursor(payload(), SIGNING_KEY);
    const [body = "", , signature = ""] = cursor.split(".");
    const cases = [
      [() => decodeCursor(cursor, [ROTATED_KEY], MAX_LIFETIME), "unknown-key"],
      [() => decode(`${body.slice(0, -2)}AA.k1.${signature}`), "bad-signature"],
      [() => decode(`${body}.k2.${signature}`), "unknown-key"],
      [
        () =>
          decodeCursor(
            `${body}.k2.${signature}`,
            [SIGNING_KEY, { id: "k2", secret: ROTATED_KEY.secret }],
            MAX_LIFETIME,
          ),
        "bad-signature",
      ],
      // Changing only the padding bits of the last character decodes to the same bytes but is refused.
      [
        () => decode(`${body}.k1.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`),
        "bad-signature",
      ],
    ] as const;
    for (const [run, reason] of cases) {
      const error = thrownSearchError(run);
      expect(error).toBeInstanceOf(SearchCursorExpired);
      expect(error.details).toEqual({ reason });
    }
  });

  it("잘리거나 형식이 깨진 커서는 malformed, 너무 긴 커서는 cursor-too-large로 만료 처리한다", () => {
    const cursor = encodeCursor(payload(), SIGNING_KEY);
    for (const broken of [
      cursor.slice(0, -1),
      cursor.slice(0, 20),
      "",
      "a.b",
      `${cursor}.x`,
      cursor.replace(".", "!"),
    ]) {
      expect(thrownSearchError(() => decode(broken)).details).toEqual({ reason: "malformed" });
    }
    const oversize = thrownSearchError(() => decode("a".repeat(MAX_CURSOR_LENGTH + 1)));
    expect(oversize).toBeInstanceOf(SearchCursorExpired);
    expect(oversize.details).toEqual({ reason: "cursor-too-large", maxLength: MAX_CURSOR_LENGTH });
  });

  it("서명은 맞아도 내용이 스키마와 다르면 invalid-payload로 만료 처리한다", () => {
    const invalid = [
      "not json",
      "null",
      "[]",
      JSON.stringify({ ...payload(), v: 2 }),
      JSON.stringify({ ...payload(), extra: 1 }),
      JSON.stringify({ ...payload(), tid: "../../etc" }),
      JSON.stringify({ ...payload(), sa: [] }),
      JSON.stringify({ ...payload(), sa: [{ nested: 1 }] }),
      JSON.stringify({ ...payload(), exp: 1_000 }),
      JSON.stringify({ ...payload(), n: -1 }),
      JSON.stringify({ __proto__: null, ...payload() }).replace(
        "{",
        '{"__proto__":{"polluted":true},',
      ),
      // Longer than the configured cursor lifetime.
      JSON.stringify(payload({ exp: 1_000 + MAX_LIFETIME + 1 })),
    ];
    for (const text of invalid) {
      const error = thrownSearchError(() => decode(signRaw(text)));
      expect(error).toBeInstanceOf(SearchCursorExpired);
      expect(error.details).toEqual({ reason: "invalid-payload" });
    }
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("임의의 입력에 대해 SearchCursorExpired 외의 예외를 던지지 않는다", () => {
    const valid = encodeCursor(payload(), SIGNING_KEY);
    const alphabet = 'ABCabc019_-.=+/!{}"\\\u0000가';
    let seed = 7;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    for (let round = 0; round < 500; round += 1) {
      const chars = [...valid];
      for (let edit = 0; edit < 1 + (next() % 4); edit += 1) {
        chars[next() % chars.length] = alphabet[next() % alphabet.length] ?? "A";
      }
      const mutated =
        round % 5 === 0 ? chars.slice(0, next() % chars.length).join("") : chars.join("");
      if (mutated === valid) continue;
      let thrown: Error | undefined;
      try {
        decode(mutated);
      } catch (error) {
        if (error instanceof Error) thrown = error;
      }
      expect(thrown).toBeInstanceOf(SearchCursorExpired);
    }
  });

  it("발급할 커서가 상한을 넘으면 SearchQueryInvalid다", () => {
    const error = thrownSearchError(() =>
      encodeCursor(payload({ pit: "p".repeat(8_192), sa: ["s".repeat(4_000)] }), SIGNING_KEY),
    );
    expect(error).toBeInstanceOf(SearchQueryInvalid);
    expect(error.details).toEqual({ reason: "cursor-too-large", maxLength: MAX_CURSOR_LENGTH });
  });
});

describe("검색 핸들의 커서 수명과 대상 고정", () => {
  it("커서 발급 시각(iat)은 카탈로그의 cursorIssueMs이고, 만료 시각은 연속 조회로 연장되지 않는다", async () => {
    const { catalog, queries } = await createQueryHarness();
    catalog.advance(5_000);
    const first = await queries.search({ body: sortedBody(5), paginate: {} });
    const firstPayload = decode(first.nextCursor ?? "");
    expect(firstPayload.iat).toBe(FAKE_CATALOG_START_MS + 5_000);
    expect(firstPayload.exp).toBe(firstPayload.iat + MAX_LIFETIME);

    catalog.advance(60_000);
    const second = await queries.search({ body: sortedBody(5), cursor: first.nextCursor });
    const secondPayload = decode(second.nextCursor ?? "");
    expect(secondPayload.iat).toBe(firstPayload.iat);
    expect(secondPayload.exp).toBe(firstPayload.exp);
    expect(secondPayload.n).toBe(10);
  });

  it("문장 시작 시각(cursorIssueMs)이 DB 현재 시각보다 이르면 그 이른 시각으로 만료를 계산한다", async () => {
    const { queries } = await createQueryHarness({
      catalog: (fake) => ({
        resolveReadHeads: async (keys, options) => {
          const result = await fake.resolveReadHeads(keys, options);
          return { ...result, cursorIssueMs: result.databaseNowMs - 1_000 };
        },
        resolveTarget: (targetId, options) => fake.resolveTarget(targetId, options),
      }),
    });
    const page = await queries.search({ body: sortedBody(5), paginate: {} });
    const issued = decode(page.nextCursor ?? "");
    expect(issued.iat).toBe(FAKE_CATALOG_START_MS - 1_000);
    expect(issued.exp).toBe(FAKE_CATALOG_START_MS - 1_000 + MAX_LIFETIME);
  });

  it("검색이 끝날 때 이미 커서 수명이 지났으면 커서를 발급하지 않는다", async () => {
    const { fake, queries } = await createQueryHarness({
      catalog: (fakeCatalog) => ({
        resolveReadHeads: async (keys, options) => {
          const result = await fakeCatalog.resolveReadHeads(keys, options);
          return { ...result, cursorIssueMs: result.databaseNowMs - MAX_LIFETIME };
        },
        resolveTarget: (targetId, options) => fakeCatalog.resolveTarget(targetId, options),
      }),
    });
    const page = await queries.search({ body: sortedBody(5), paginate: { pit: true } });
    expect(page.hits).toHaveLength(5);
    expect(page.nextCursor).toBeUndefined();
    // No cursor, so no PIT is opened either.
    expect(fake.requests().some((request) => request.path.includes("point_in_time"))).toBe(false);
  });

  it("DB 시각으로 만료 시각이 지나면 연속 조회는 SearchCursorExpired다", async () => {
    const { catalog, queries } = await createQueryHarness();
    const first = await queries.search({ body: sortedBody(5), paginate: {} });
    catalog.advance(MAX_LIFETIME - 10_000);
    const second = await queries.search({ body: sortedBody(5), cursor: first.nextCursor });
    expect(second.hits).toHaveLength(5);
    expect(second.nextCursor).toBeDefined();
    catalog.advance(10_000);
    const error = await searchErrorOf(
      queries.search({ body: sortedBody(5), cursor: second.nextCursor }),
    );
    expect(error).toBeInstanceOf(SearchCursorExpired);
    expect(error.details).toEqual({ reason: "expired" });
  });

  it("커서 대상의 epoch이 인덱스의 현재 epoch과 다르면 SearchCursorExpired다", async () => {
    const { catalog, fake, queries, target } = await createQueryHarness();
    const first = await queries.search({ body: sortedBody(5), paginate: {} });
    // A resume build cut over to a new target in epoch 2.
    const resumed = createTestReadTarget({
      namespace: NAMESPACE,
      logicalKey: LOGICAL_KEY,
      targetId: NEXT_TARGET_ID,
      fingerprint: FINGERPRINT,
      captureEpoch: 2,
    });
    await seedIndex(fake, resumed.physicalIndex, messages(3));
    catalog.set(
      createTestReadHead({ logicalKey: LOGICAL_KEY, target: resumed, readGeneration: 2 }),
    );
    catalog.putTarget(target);
    const error = await searchErrorOf(
      queries.search({ body: sortedBody(5), cursor: first.nextCursor }),
    );
    expect(error).toBeInstanceOf(SearchCursorExpired);
    expect(error.details).toEqual({ reason: "capture-epoch-invalidated" });
    expect((await queries.search({ body: sortedBody(5) })).target.targetId).toBe(NEXT_TARGET_ID);
  });

  it("rebuild가 필요한 동안의 연속 조회는 SearchRebuildRequired다", async () => {
    const { catalog, queries, target } = await createQueryHarness();
    const first = await queries.search({ body: sortedBody(5), paginate: {} });
    catalog.set(createTestReadHead({ logicalKey: LOGICAL_KEY, target, rebuildRequired: true }));
    const error = await searchErrorOf(
      queries.search({ body: sortedBody(5), cursor: first.nextCursor }),
    );
    expect(error).toBeInstanceOf(SearchRebuildRequired);
    expect(error.details).toEqual({ reason: "rebuild-required" });
  });

  it("은퇴 중이거나 은퇴한 대상의 커서는 SearchCursorExpired다", async () => {
    for (const state of ["retiring", "retired", "failed"] as const) {
      const { catalog, queries, target } = await createQueryHarness();
      const first = await queries.search({ body: sortedBody(5), paginate: {} });
      catalog.putTarget({ ...target, state });
      const error = await searchErrorOf(
        queries.search({ body: sortedBody(5), cursor: first.nextCursor }),
      );
      expect(error).toBeInstanceOf(SearchCursorExpired);
      expect(error.details).toEqual({ reason: "target-not-readable", state });
    }
  });

  it("같은 epoch에서 cutover된 뒤에도 연속 조회는 원래 대상에 남고 다른 인덱스로 옮겨가지 않는다", async () => {
    const { catalog, fake, queries, target } = await createQueryHarness();
    const first = await queries.search({ body: sortedBody(5), paginate: {} });
    const next = createTestReadTarget({
      namespace: NAMESPACE,
      logicalKey: LOGICAL_KEY,
      targetId: NEXT_TARGET_ID,
      fingerprint: FINGERPRINT,
    });
    await seedIndex(fake, next.physicalIndex, messages(25, 100));
    catalog.set(createTestReadHead({ logicalKey: LOGICAL_KEY, target: next, readGeneration: 2 }));
    catalog.putTarget(target);
    const before = fake.requests().length;
    const second = await queries.search({ body: sortedBody(5), cursor: first.nextCursor });
    expect(second.target).toEqual({
      targetId: TARGET_ID,
      fingerprint: FINGERPRINT,
      readGeneration: 1,
    });
    expect(second.hits.map((hit) => hit.id)).toEqual(["m0006", "m0007", "m0008", "m0009", "m0010"]);
    expect(
      fake
        .requests()
        .slice(before)
        .map((request) => request.path),
    ).toEqual([`/${target.physicalIndex}/_search`]);
  });

  it("다른 검색 본문으로 이어 쓰면 query-mismatch로 만료 처리하고 카탈로그를 읽지 않는다", async () => {
    const { catalog, queries } = await createQueryHarness();
    const first = await queries.search({ body: sortedBody(5), paginate: {} });
    const calls = catalog.calls().length;
    const error = await searchErrorOf(
      queries.search({
        body: { ...sortedBody(5), query: { term: { "doc.roomId": "odd" } } },
        cursor: first.nextCursor,
      }),
    );
    expect(error.details).toEqual({ reason: "query-mismatch" });
    expect(catalog.calls()).toHaveLength(calls);
  });

  it("위조한 커서는 카탈로그와 엔진에 닿기 전에 SearchCursorExpired다", async () => {
    const { catalog, fake, queries } = await createQueryHarness();
    const first = await queries.search({ body: sortedBody(5), paginate: {} });
    const calls = catalog.calls().length;
    const requests = fake.requests().length;
    const cursor = first.nextCursor ?? "";
    for (const forged of [
      `x${cursor}`,
      cursor.slice(0, -3),
      "a".repeat(MAX_CURSOR_LENGTH + 1),
      signRaw("{}"),
    ]) {
      const error = await searchErrorOf(queries.search({ body: sortedBody(5), cursor: forged }));
      expect(error).toBeInstanceOf(SearchCursorExpired);
      expect(error).toBeInstanceOf(SearchError);
    }
    expect(catalog.calls()).toHaveLength(calls);
    expect(fake.requests()).toHaveLength(requests);
  });
});

import { describe, expect, it } from "vitest";

import { normalizeOpenSearchError } from "../../src/client/error-normalization";
import { buildSearchEnvelope } from "../../src/definition/envelope";
import {
  SearchConfigurationError,
  SearchQueryInvalid,
  SearchStopping,
  SearchTimeout,
  SearchUnavailable,
} from "../../src/errors";
import { type BulkDocument, type BulkRequest, packBulkRequests } from "../../src/worker/bulk";
import {
  applyCooldownEvents,
  type BulkItemOutcome,
  type BulkSendResult,
  classifyBulkItem,
  classifyRequestStatus,
  classifyThrown,
  deliverBulkRequest,
  interpretBulkResponse,
  isolationSendsToIsolateOne,
  type ItemClassification,
} from "../../src/worker/classify";
import { createCooldownRegistry } from "../../src/worker/cooldown";
import {
  bulkIsolationBudget,
  parseWorkerLimits,
  requiredIsolationCalls,
  type WorkerLimits,
} from "../../src/worker/limits";

// Response bodies captured from opensearch 3.5.0 with the worker's filter_path and require_alias=true.
const ENGINE = {
  // a@5 present, b@1 tombstone
  created: {
    errors: false,
    items: [
      { index: { _id: "a", _version: 5, status: 201 } },
      { index: { _id: "b", _version: 1, status: 201 } },
    ],
  },
  // a@6, a@6, a@4, b@2 tombstone, bad@1 (field missing from the strict mapping)
  mixed: {
    errors: true,
    items: [
      { index: { _id: "a", _version: 6, status: 200 } },
      { index: { _id: "a", status: 409, error: { type: "version_conflict_engine_exception" } } },
      { index: { _id: "a", status: 409, error: { type: "version_conflict_engine_exception" } } },
      { index: { _id: "b", _version: 2, status: 200 } },
      { index: { _id: "bad", status: 400, error: { type: "strict_dynamic_mapping_exception" } } },
    ],
  },
  // require_alias=true without the alias
  missingAlias: {
    errors: true,
    items: [
      { index: { _id: "x", status: 404, error: { type: "index_not_found_exception" } } },
      { index: { _id: "y", status: 404, error: { type: "index_not_found_exception" } } },
    ],
  },
  /** index.blocks.write=true */
  writeBlock: {
    errors: true,
    items: [{ index: { _id: "c", status: 403, error: { type: "cluster_block_exception" } } }],
  },
  /** index.blocks.read_only_allow_delete=true */
  readOnlyAllowDelete: {
    errors: true,
    items: [{ index: { _id: "d", status: 429, error: { type: "cluster_block_exception" } } }],
  },
  // 513-byte _id: the whole request fails with 400 (reason shortened)
  longIdRejected: {
    error: {
      root_cause: [
        {
          type: "action_request_validation_exception",
          reason:
            "Validation Failed: 1: id [...] is too long, must be no longer than 512 bytes but was: 513;",
        },
      ],
      type: "action_request_validation_exception",
      reason:
        "Validation Failed: 1: id [...] is too long, must be no longer than 512 bytes but was: 513;",
    },
    status: 400,
  },
} as const;

function present(id: string, revision: number, body = "본문"): BulkDocument {
  return {
    documentId: id,
    envelope: buildSearchEnvelope({ state: "present", document: { body } }, revision),
  };
}
function tombstone(id: string, revision: number): BulkDocument {
  return { documentId: id, envelope: buildSearchEnvelope({ state: "deleted" }, revision) };
}
function requestOf(docs: readonly BulkDocument[]): BulkRequest {
  const { requests, rejected } = packBulkRequests(docs, {
    maxBulkBytes: 10_000_000,
    maxDocuments: 10_000,
  });
  if (requests.length !== 1 || rejected.length > 0)
    throw new Error("요청 하나로 묶이지 않았습니다");
  const [request] = requests;
  if (request === undefined) throw new Error("요청이 없습니다");
  return request;
}
function kinds(outcomes: readonly BulkItemOutcome[]): string[] {
  return outcomes.map((outcome) => outcome.kind);
}

describe("항목 분류 표", () => {
  const table: readonly [number, string | undefined, ItemClassification][] = [
    [200, undefined, { kind: "success" }],
    [201, undefined, { kind: "success" }],
    [409, "version_conflict_engine_exception", { kind: "conflict" }],
    // Infrastructure: any 429 or 503, and known types at any status (a write block is 403 or 429).
    [
      429,
      "anything_else",
      { kind: "release", errorClass: "infrastructure", cooldown: "target", delay: "backoff" },
    ],
    [
      403,
      "cluster_block_exception",
      { kind: "release", errorClass: "infrastructure", cooldown: "target", delay: "backoff" },
    ],
    [
      503,
      "anything_else",
      { kind: "release", errorClass: "infrastructure", cooldown: "target", delay: "backoff" },
    ],
    [
      500,
      "unavailable_shards_exception",
      { kind: "release", errorClass: "infrastructure", cooldown: "target", delay: "backoff" },
    ],
    [
      400,
      "circuit_breaking_exception",
      { kind: "release", errorClass: "infrastructure", cooldown: "target", delay: "backoff" },
    ],
    // Unknown 5xx: a retry that spends budget.
    [500, "some_unknown_exception", { kind: "retry", errorClass: "transient_item" }],
    [400, "strict_dynamic_mapping_exception", { kind: "poison", errorClass: "rejected" }],
    [413, "anything", { kind: "poison", errorClass: "rejected" }],
    [404, "index_not_found_exception", { kind: "pause", errorClass: "write_alias_missing" }],
    [
      401,
      "security_exception",
      { kind: "release", errorClass: "credentials", cooldown: "client", delay: "maximum" },
    ],
    [
      403,
      "security_exception",
      { kind: "release", errorClass: "credentials", cooldown: "target", delay: "maximum" },
    ],
    [400, "unknown_exception", { kind: "poison", errorClass: "rejected_unknown" }],
    [404, "not_found", { kind: "poison", errorClass: "rejected_unknown" }],
    [409, "other_conflict", { kind: "poison", errorClass: "rejected_unknown" }],
    // Combinations the engine cannot produce.
    [200, "version_conflict_engine_exception", { kind: "malformed" }],
    [202, undefined, { kind: "malformed" }],
    [500, undefined, { kind: "malformed" }],
  ];
  for (const [status, type, expected] of table) {
    it(`${status} ${type ?? "(error 없음)"} → ${expected.kind}`, () => {
      expect(classifyBulkItem(status, type)).toEqual(expected);
    });
  }

  it("모든 상태와 종류 조합이 정확히 하나의 결과로 가고, 200/201 + error 없음만 성공이다", () => {
    const types = [
      undefined,
      "version_conflict_engine_exception",
      "index_not_found_exception",
      "security_exception",
      "strict_dynamic_mapping_exception",
      "cluster_block_exception",
      "unavailable_shards_exception",
      "whatever",
    ];
    const allowed = new Set([
      "success",
      "conflict",
      "retry",
      "release",
      "poison",
      "pause",
      "malformed",
    ]);
    for (let status = 100; status <= 599; status += 1) {
      for (const type of types) {
        const result = classifyBulkItem(status, type);
        expect(allowed.has(result.kind)).toBe(true);
        if (result.kind === "success") {
          expect([200, 201]).toContain(status);
          expect(type).toBeUndefined();
        }
      }
    }
    expect(classifyBulkItem(Number.NaN, undefined).kind).toBe("malformed");
    expect(classifyBulkItem(200.5, undefined).kind).toBe("malformed");
  });
});

describe("요청 분류 표", () => {
  const table: readonly [number, string, ReturnType<typeof classifyRequestStatus>][] = [
    [200, "unknown", { kind: "items" }],
    [
      400,
      "action_request_validation_exception",
      { kind: "split", poisonClass: "request_rejected" },
    ],
    [413, "unknown", { kind: "split", poisonClass: "oversized" }],
    [
      401,
      "security_exception",
      { kind: "release", errorClass: "credentials", cooldown: "client", delay: "maximum" },
    ],
    [
      403,
      "security_exception",
      { kind: "release", errorClass: "credentials", cooldown: "target", delay: "maximum" },
    ],
    [404, "index_not_found_exception", { kind: "pause" }],
    // A 404 that is not the engine's index_not_found (a proxy, say) does not pause the target.
    [
      404,
      "unknown",
      { kind: "release", errorClass: "infrastructure", cooldown: "client", delay: "backoff" },
    ],
  ];
  for (const status of [429, 503]) {
    it(`${status} → 인프라 반납 + client cooldown`, () => {
      expect(classifyRequestStatus(status, "unknown")).toEqual({
        kind: "release",
        errorClass: "infrastructure",
        cooldown: "client",
        delay: "backoff",
      });
    });
  }
  for (const [status, type, expected] of table) {
    it(`${status} ${type} → ${expected.kind}`, () => {
      expect(classifyRequestStatus(status, type)).toEqual(expected);
    });
  }
});

// SDK error shape (name, meta.statusCode, meta.body); the message must never reach the stored error.
function sdkError<Extra>(name: string, extra?: Extra) {
  return Object.assign(new Error("sdk 메시지"), { name }, extra);
}

function okItem(id: string, version: number) {
  return { index: { _id: id, _version: version, status: 201 } };
}

describe("전송 함수가 던진 값", () => {
  const cases: readonly [string, unknown, string, string | null][] = [
    [
      "SearchTimeout",
      new SearchTimeout(
        { key: "client.requestTimeout" },
        { details: { reason: "request-timeout" } },
      ),
      "release",
      "client",
    ],
    [
      "SearchUnavailable 연결",
      new SearchUnavailable(
        { key: "client.connectionFailed" },
        { details: { reason: "connection" } },
      ),
      "release",
      "client",
    ],
    ["SDK TimeoutError", sdkError("TimeoutError"), "release", "client"],
    ["SDK ConnectionError", sdkError("ConnectionError"), "release", "client"],
    [
      "SDK ResponseError 503",
      sdkError("ResponseError", { meta: { statusCode: 503, body: { error: { type: "x" } } } }),
      "release",
      "client",
    ],
    [
      "SDK ResponseError 401",
      sdkError("ResponseError", {
        meta: { statusCode: 401, body: { error: { type: "security_exception" } } },
      }),
      "release",
      "client",
    ],
    [
      "SDK ResponseError 403",
      sdkError("ResponseError", {
        meta: { statusCode: 403, body: { error: { type: "security_exception" } } },
      }),
      "release",
      "target",
    ],
    [
      "SDK ResponseError 400 (실제 513바이트 _id 본문)",
      sdkError("ResponseError", { meta: { statusCode: 400, body: ENGINE.longIdRejected } }),
      "split",
      null,
    ],
    [
      "SDK ResponseError 404 index_not_found",
      sdkError("ResponseError", {
        meta: { statusCode: 404, body: { error: { type: "index_not_found_exception" } } },
      }),
      "pause",
      null,
    ],
    ["SDK SerializationError", sdkError("SerializationError"), "split", null],
    ["SDK ConfigurationError", sdkError("ConfigurationError"), "release", "client"],
    ["알 수 없는 Error", new Error("x"), "release", "client"],
    [
      "SearchConfigurationError",
      new SearchConfigurationError(
        { key: "client.foreignClient" },
        { details: { reason: "foreign-search-client" } },
      ),
      "release",
      "client",
    ],
    [
      "SearchQueryInvalid serialization",
      new SearchQueryInvalid(
        { key: "client.requestFailed" },
        { details: { reason: "serialization" } },
      ),
      "split",
      null,
    ],
    [
      "SearchStopping",
      new SearchStopping({ key: "error.stopping" }, { details: { reason: "client-closed" } }),
      "release",
      null,
    ],
  ];
  for (const [name, error, kind, cooldown] of cases) {
    it(`${name} → ${kind}`, () => {
      const { classification, error: recorded } = classifyThrown(error);
      expect(classification.kind).toBe(kind);
      if (classification.kind === "release") expect(classification.cooldown).toBe(cooldown);
      expect(JSON.stringify(recorded)).not.toContain("sdk 메시지");
    });
  }

  it("error-normalization을 거친 응답 오류도 같은 표로 분류한다", () => {
    const normalized = normalizeOpenSearchError(
      Object.assign(new Error("m"), { name: "ResponseError", meta: { statusCode: 503, body: {} } }),
    );
    expect(classifyThrown(normalized).classification).toEqual({
      kind: "release",
      errorClass: "infrastructure",
      cooldown: "client",
      delay: "backoff",
    });
    const auth = normalizeOpenSearchError(
      Object.assign(new Error("m"), { name: "ResponseError", meta: { statusCode: 401, body: {} } }),
    );
    expect(classifyThrown(auth).classification).toMatchObject({
      errorClass: "credentials",
      delay: "maximum",
    });
  });
});

describe("실제 엔진 응답 해석", () => {
  it("성공 응답(errors: false)은 모두 성공이고 client와 대상 cooldown을 지운다", () => {
    const request = requestOf([present("a", 5), tombstone("b", 1)]);
    const result = interpretBulkResponse(request, 200, ENGINE.created);
    expect(result.kind).toBe("items");
    if (result.kind !== "items") return;
    expect(kinds(result.outcomes)).toEqual(["success", "success"]);
    expect(result.cooldown).toEqual([
      { action: "clear", scope: "client" },
      { action: "clear", scope: "target" },
    ]);
  });

  it("한 bulk 안의 성공, 같거나 낮은 버전 409, strict 매핑 거부를 항목별로 나눈다", () => {
    const request = requestOf([
      present("a", 6),
      present("a", 6),
      present("a", 4),
      tombstone("b", 2),
      present("bad", 1),
    ]);
    const result = interpretBulkResponse(request, 200, ENGINE.mixed);
    expect(result.kind).toBe("items");
    if (result.kind !== "items") return;
    expect(result.outcomes).toEqual([
      { kind: "success" },
      { kind: "conflict" },
      { kind: "conflict" },
      { kind: "success" },
      {
        kind: "poison",
        error: { class: "rejected", status: 400, type: "strict_dynamic_mapping_exception" },
      },
    ]);
  });

  it("require_alias로 거부된 항목 404는 대상 pause 후보이고 아무것도 성공이 아니다", () => {
    const result = interpretBulkResponse(
      requestOf([present("x", 1), present("y", 2)]),
      200,
      ENGINE.missingAlias,
    );
    expect(result.kind === "items" ? kinds(result.outcomes) : result.kind).toEqual([
      "pause",
      "pause",
    ]);
  });

  it("쓰기 차단(항목 403/429 cluster_block_exception)은 자격 증명이 아니라 인프라 반납이다", () => {
    for (const [doc, body] of [
      [present("c", 1), ENGINE.writeBlock],
      [present("d", 1), ENGINE.readOnlyAllowDelete],
    ] as const) {
      const result = interpretBulkResponse(requestOf([doc]), 200, body);
      expect(result.kind).toBe("items");
      if (result.kind !== "items") return;
      expect(result.outcomes[0]).toMatchObject({
        kind: "release",
        cooldown: "target",
        delay: "backoff",
        error: { class: "infrastructure", type: "cluster_block_exception" },
      });
      expect(result.cooldown).toContainEqual({
        action: "enter",
        scope: "target",
        atMaximum: false,
      });
    }
  });

  describe("해석할 수 없는 응답은 실패 닫힘(결과 미상, 예산 없는 반납)이다", () => {
    const request = requestOf([present("a", 5), tombstone("b", 1)]);
    const cases: readonly [string, unknown][] = [
      ["항목이 적다", { errors: false, items: [okItem("a", 5)] }],
      ["_id가 다르다", { errors: false, items: [okItem("a", 5), okItem("z", 1)] }],
      [
        "errors: false인데 실패 항목이 있다",
        {
          errors: false,
          items: [
            okItem("a", 5),
            { index: { _id: "b", status: 400, error: { type: "mapper_parsing_exception" } } },
          ],
        },
      ],
      [
        "성공 항목의 _version이 보낸 버전과 다르다",
        { errors: false, items: [okItem("a", 4), okItem("b", 1)] },
      ],
      [
        "성공 상태에 error가 있다",
        {
          errors: true,
          items: [
            { index: { _id: "a", _version: 5, status: 201, error: { type: "x" } } },
            okItem("b", 1),
          ],
        },
      ],
      [
        "index가 아닌 액션 키",
        {
          errors: false,
          items: [okItem("a", 5), { create: { _id: "b", _version: 1, status: 201 } }],
        },
      ],
      ["items가 없다", { errors: false }],
      ["본문이 문자열", "<html>gateway</html>"],
    ];
    for (const [name, body] of cases) {
      it(name, () => {
        const result = interpretBulkResponse(request, 200, body);
        expect(result.kind).toBe("release");
        if (result.kind !== "release") return;
        expect(result.outcome).toMatchObject({
          kind: "release",
          cooldown: "client",
          error: { class: "unknown_outcome" },
        });
        expect(result.cooldown).toEqual([{ action: "enter", scope: "client", atMaximum: false }]);
      });
    }
    it("범위를 벗어난 HTTP 상태", () => {
      expect(interpretBulkResponse(request, 0, ENGINE.created).kind).toBe("release");
      expect(interpretBulkResponse(request, 700, ENGINE.created).kind).toBe("release");
    });
  });
});

// Engine-like send: 400 for the whole request if it holds any bad document, otherwise 201 for each item.
function engineLike(
  bad: ReadonlySet<string>,
  overrides: (request: BulkRequest, call: number) => BulkSendResult | undefined = () => undefined,
) {
  const sent: string[][] = [];
  const send = async (request: BulkRequest): Promise<BulkSendResult> => {
    sent.push(request.items.map((item) => item.document.documentId));
    for (const item of request.items) {
      expect(Buffer.byteLength(item.document.documentId, "utf8")).toBeLessThanOrEqual(512);
    }
    const override = overrides(request, sent.length);
    if (override !== undefined) return override;
    if (request.items.some((item) => bad.has(item.document.documentId))) {
      return { kind: "response", status: 400, body: ENGINE.longIdRejected };
    }
    return {
      kind: "response",
      status: 200,
      body: {
        errors: false,
        items: request.items.map((item) => ({
          index: { _id: item.document.documentId, _version: item.version, status: 201 },
        })),
      },
    };
  };
  return { send, sent };
}

function numberedDocs(count: number): BulkDocument[] {
  return Array.from({ length: count }, (_, index) => present(`문서-${index}`, index + 1));
}

describe("요청 400의 이분 격리", () => {
  it("한도 검사(isolationBudgetTooSmall)가 요구하는 값과 워커가 그룹에 주는 bulk 예산이 이분 격리의 실제 필요와 같다", async () => {
    const base: WorkerLimits = {
      maxDocumentsPerClaim: 1,
      maxBulkBytes: 1_000_000,
      maxConcurrentBulkRequests: 1,
      projectionTimeoutMs: 1_000,
      requestTimeoutMs: 1_000,
      leaseDurationMs: 10_000,
      heartbeatIntervalMs: 1_000,
      maxRetryAttempts: 3,
      maxRetryAgeMs: 60_000,
      maxIsolationCallsPerBatch: 1,
      retryBaseDelayMs: 10,
      retryMaxDelayMs: 100,
      maxInFlightBytes: 2_000_000,
      statementTimeoutMs: 1_000,
      fenceRenewIntervalMs: 30_000,
    };
    for (const count of [1, 2, 3, 8, 13, 16, 100]) {
      expect(requiredIsolationCalls(count)).toBe(1 + isolationSendsToIsolateOne(count));
      const minimum = requiredIsolationCalls(count);
      const limits = parseWorkerLimits({
        ...base,
        maxDocumentsPerClaim: count,
        maxIsolationCallsPerBatch: minimum,
      });
      if (minimum > 1) {
        expect(() =>
          parseWorkerLimits({
            ...base,
            maxDocumentsPerClaim: count,
            maxIsolationCallsPerBatch: minimum - 1,
          }),
        ).toThrow(SearchConfigurationError);
      }
      // The minimum budget isolates the last document of a full claim.
      const input = numberedDocs(count);
      const badId = input[count - 1]?.documentId ?? "";
      const { send } = engineLike(new Set([badId]));
      const result = await deliverBulkRequest(requestOf(input), send, {
        budget: { remaining: bulkIsolationBudget(limits) },
      });
      for (const entry of result.items) {
        expect(entry.outcome.kind).toBe(
          entry.item.document.documentId === badId ? "poison" : "success",
        );
      }
    }
  });

  for (const [count, badIndex] of [
    [8, 0],
    [13, 6],
    [100, 57],
  ] as const) {
    it(`${count}건 중 하나가 요청을 거부시키면 그 문서만 poison이고 나머지는 성공하며 전송은 1 + 2*ceil(log2 n)회 이하다`, async () => {
      const input = numberedDocs(count);
      const badId = input[badIndex]?.documentId ?? "";
      const { send, sent } = engineLike(new Set([badId]));
      const budget = { remaining: 1_000 };
      const result = await deliverBulkRequest(requestOf(input), send, { budget });
      expect(result.items.map((entry) => entry.item.document.documentId)).toEqual(
        input.map((doc) => doc.documentId),
      );
      for (const entry of result.items) {
        if (entry.item.document.documentId === badId) {
          expect(entry.outcome).toEqual({
            kind: "poison",
            error: {
              class: "request_rejected",
              status: 400,
              type: "action_request_validation_exception",
            },
          });
        } else {
          expect(entry.outcome).toEqual({ kind: "success" });
        }
      }
      // No healthy document spends retry budget.
      expect(result.items.filter((entry) => entry.outcome.kind === "retry")).toEqual([]);
      const bound = 1 + isolationSendsToIsolateOne(count);
      expect(result.requestsSent).toBe(sent.length);
      expect(result.requestsSent).toBeLessThanOrEqual(bound);
      expect(1_000 - budget.remaining).toBe(result.requestsSent - 1);
    });
  }

  it("나쁜 문서가 여럿이어도 모두 격리되고 전송은 1 + 2(n-1)회를 넘지 않는다", async () => {
    const input = numberedDocs(16);
    const bad = new Set([1, 2, 9, 15].map((index) => input[index]?.documentId ?? ""));
    const { send } = engineLike(bad);
    const result = await deliverBulkRequest(requestOf(input), send, {
      budget: { remaining: 1_000 },
    });
    for (const entry of result.items) {
      expect(entry.outcome.kind).toBe(
        bad.has(entry.item.document.documentId) ? "poison" : "success",
      );
    }
    expect(result.requestsSent).toBeLessThanOrEqual(1 + 2 * (16 - 1));
  });

  it("모든 문서가 나쁘면(최악) 정확히 2n-1회 보내고 모두 poison이다", async () => {
    const input = numberedDocs(8);
    const { send } = engineLike(new Set(input.map((doc) => doc.documentId)));
    const result = await deliverBulkRequest(requestOf(input), send, {
      budget: { remaining: 1_000 },
    });
    expect(result.requestsSent).toBe(2 * 8 - 1);
    expect(new Set(kinds(result.items.map((entry) => entry.outcome)))).toEqual(new Set(["poison"]));
  });

  it("격리 예산이 떨어지면 남은 문서는 예산 없이 반납되고 poison도 retry도 되지 않는다", async () => {
    const input = numberedDocs(16);
    const { send } = engineLike(new Set([input[3]?.documentId ?? ""]));
    const budget = { remaining: 2 };
    const result = await deliverBulkRequest(requestOf(input), send, { budget });
    expect(budget.remaining).toBe(0);
    expect(result.requestsSent).toBe(3);
    const byKind = new Map<string, number>();
    for (const entry of result.items)
      byKind.set(entry.outcome.kind, (byKind.get(entry.outcome.kind) ?? 0) + 1);
    expect(byKind.get("poison")).toBeUndefined();
    expect(byKind.get("retry")).toBeUndefined();
    // Depth first: budget 2 reaches the 4-document half; unsent sibling halves are released too.
    for (const entry of result.items) {
      expect(entry.outcome).toEqual({
        kind: "release",
        error: { class: "isolation_unresolved", reason: "isolation-budget-exhausted" },
        cooldown: null,
        delay: "none",
      });
    }
    expect(isolationSendsToIsolateOne(16)).toBe(8);
  });

  it("예산은 한 그룹의 요청들이 함께 쓴다", async () => {
    const first = numberedDocs(4);
    const second = numberedDocs(4).map((doc, index) =>
      present(`둘째-${index}`, doc.envelope.sonamu_meta.revision),
    );
    const bad = new Set([first[0]?.documentId ?? "", second[0]?.documentId ?? ""]);
    const budget = { remaining: 4 };
    const { send } = engineLike(bad);
    const a = await deliverBulkRequest(requestOf(first), send, { budget });
    expect(a.requestsSent).toBe(1 + 4);
    expect(budget.remaining).toBe(0);
    const b = await deliverBulkRequest(requestOf(second), send, { budget });
    expect(b.requestsSent).toBe(1);
    expect(kinds(b.items.map((entry) => entry.outcome))).toEqual([
      "release",
      "release",
      "release",
      "release",
    ]);
  });

  it("격리 중 인프라 실패가 나면 그 절반은 인프라 반납, 남은 절반은 보내지 않고 반납하며 client cooldown에 들어간다", async () => {
    const input = numberedDocs(8);
    const { send, sent } = engineLike(new Set([input[0]?.documentId ?? ""]), (_request, call) =>
      call === 2
        ? {
            kind: "response",
            status: 503,
            body: { error: { type: "unavailable_shards_exception" }, status: 503 },
          }
        : undefined,
    );
    const result = await deliverBulkRequest(requestOf(input), send, { budget: { remaining: 100 } });
    expect(sent).toHaveLength(2);
    const outcomes = result.items.map((entry) => entry.outcome);
    expect(
      outcomes
        .slice(0, 4)
        .every((outcome) => outcome.kind === "release" && outcome.error.class === "http"),
    ).toBe(true);
    expect(
      outcomes
        .slice(4)
        .every(
          (outcome) => outcome.kind === "release" && outcome.error.class === "isolation_unresolved",
        ),
    ).toBe(true);
    expect(result.cooldown).toEqual([{ action: "enter", scope: "client", atMaximum: false }]);
  });

  it("한 건짜리 요청의 413은 oversized poison이고, 여러 건이면 나눠 보낸다", async () => {
    const single = await deliverBulkRequest(
      requestOf([present("big", 1)]),
      async () => ({ kind: "response", status: 413, body: undefined }),
      { budget: { remaining: 10 } },
    );
    expect(single.items[0]?.outcome).toEqual({
      kind: "poison",
      error: { class: "oversized", status: 413, type: "unknown" },
    });

    const input = numberedDocs(4);
    const { send } = engineLike(new Set(), (request) =>
      request.items.length > 2 ? { kind: "response", status: 413, body: undefined } : undefined,
    );
    const split = await deliverBulkRequest(requestOf(input), send, { budget: { remaining: 10 } });
    expect(kinds(split.items.map((entry) => entry.outcome))).toEqual([
      "success",
      "success",
      "success",
      "success",
    ]);
    expect(split.requestsSent).toBe(3);
  });

  it("전송 직전 부적격(skipped)이면 보내지 않고 모두 반납한다", async () => {
    const result = await deliverBulkRequest(
      requestOf(numberedDocs(3)),
      async () => ({ kind: "skipped" }),
      {
        budget: { remaining: 10 },
      },
    );
    expect(result.requestsSent).toBe(0);
    expect(
      result.items.every(
        (entry) => entry.outcome.kind === "release" && entry.outcome.error.class === "not_sent",
      ),
    ).toBe(true);
  });

  it("보내는 중에 취소되면 그 요청은 결과 미상(abandoned), 보내지 않은 절반은 반납이다", async () => {
    const input = numberedDocs(4);
    const controller = new AbortController();
    const { send } = engineLike(new Set([input[0]?.documentId ?? ""]), (_request, call) => {
      if (call === 2) controller.abort();
      return undefined;
    });
    const result = await deliverBulkRequest(requestOf(input), send, {
      budget: { remaining: 10 },
      signal: controller.signal,
    });
    expect(kinds(result.items.map((entry) => entry.outcome))).toEqual([
      "abandoned",
      "abandoned",
      "release",
      "release",
    ]);
    expect(result.items[2]?.outcome).toMatchObject({
      error: { class: "not_sent", reason: "cancelled" },
    });
  });

  it("send가 던지면 그 값을 분류한다 (연결 실패는 인프라 반납)", async () => {
    const result = await deliverBulkRequest(
      requestOf(numberedDocs(2)),
      async () => {
        throw Object.assign(new Error("연결"), { name: "ConnectionError" });
      },
      { budget: { remaining: 10 } },
    );
    expect(kinds(result.items.map((entry) => entry.outcome))).toEqual(["release", "release"]);
    expect(result.cooldown).toEqual([{ action: "enter", scope: "client", atMaximum: false }]);
  });

  it("요청 수준 404 index_not_found는 모든 문서를 pause 후보로 만든다", async () => {
    const result = await deliverBulkRequest(
      requestOf(numberedDocs(2)),
      async () => ({
        kind: "response",
        status: 404,
        body: { error: { type: "index_not_found_exception" }, status: 404 },
      }),
      { budget: { remaining: 10 } },
    );
    expect(result.items.map((entry) => entry.outcome)).toEqual([
      {
        kind: "pause",
        error: { class: "write_alias_missing", status: 404, type: "index_not_found_exception" },
      },
      {
        kind: "pause",
        error: { class: "write_alias_missing", status: 404, type: "index_not_found_exception" },
      },
    ]);
  });
});

describe("cooldown 사건 적용", () => {
  it("항목 인프라 실패는 대상 cooldown, 다음 정상 응답은 그것을 지운다", () => {
    let now = 0;
    const registry = createCooldownRegistry(
      { baseDelayMs: 100, maxDelayMs: 10_000 },
      { now: () => now, random: () => 0 },
    );
    const target = "11111111-1111-4111-8111-111111111111";
    const blocked = interpretBulkResponse(requestOf([present("c", 1)]), 200, ENGINE.writeBlock);
    if (blocked.kind !== "items") throw new Error("items여야 합니다");
    applyCooldownEvents(registry, target, blocked.cooldown);
    expect(registry.coolingTargets()).toEqual([target]);
    expect(registry.drainGate().blocked).toBe(false);
    now += 10;
    const healthy = interpretBulkResponse(
      requestOf([present("a", 5), tombstone("b", 1)]),
      200,
      ENGINE.created,
    );
    if (healthy.kind !== "items") throw new Error("items여야 합니다");
    applyCooldownEvents(registry, target, healthy.cooldown);
    expect(registry.coolingTargets()).toEqual([]);
  });

  it("항목 401은 client cooldown을 최대 지연으로 건다", () => {
    const registry = createCooldownRegistry(
      { baseDelayMs: 100, maxDelayMs: 60_000 },
      { now: () => 0 },
    );
    const result = interpretBulkResponse(requestOf([present("a", 1)]), 200, {
      errors: true,
      items: [{ index: { _id: "a", status: 401, error: { type: "security_exception" } } }],
    });
    if (result.kind !== "items") throw new Error("items여야 합니다");
    applyCooldownEvents(registry, "t", result.cooldown);
    expect(registry.drainGate()).toEqual({ blocked: true, remainingMs: 60_000 });
  });
});

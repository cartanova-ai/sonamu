import { describe, expect, it } from "vitest";

import { RECOMMENDED_WORKER_LIMITS } from "../../src/defaults";
import { assertDocumentId } from "../../src/definition/names";
import { SearchError, SearchInvalidDocumentId } from "../../src/errors";
import { createSchemaStatementCache } from "../../src/postgres/statement-cache";
import { createBulkPacker, isSendableDocumentId } from "../../src/worker/bulk";
import { interpretBulkResponse } from "../../src/worker/classify";
import {
  compareFence,
  FENCE_ACTION_MAX_BYTES,
  FENCE_DOCUMENT_ID,
  fenceActionLines,
  fenceMgetBody,
  MAX_FENCE_EPOCH,
  readFenceMget,
} from "../../src/worker/fence";
import { parseWorkerLimits } from "../../src/worker/limits";

const NONCE_A = "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const NONCE_B = "1c0a9d2f-2d3e-4f60-9b0c-1d2e3f4a5b6c";
const NONCE_P = "2d1b0e3a-3e4f-4a71-8c1d-2e3f4a5b6c7d";
const bytes = (text: string) => Buffer.byteLength(text, "utf8");

describe("fence 비교와 상실 분류", () => {
  const committed = { epoch: 3, nonce: NONCE_A, pending: null };
  it.each([
    ["확정된 쌍과 같음", { epoch: 3, nonce: NONCE_A }, committed, { kind: "current" }],
    [
      "대기 쌍과 같음",
      { epoch: 4, nonce: NONCE_P },
      { ...committed, pending: { epoch: 4, nonce: NONCE_P } },
      { kind: "pending-landed" },
    ],
    [
      "양쪽 모두 fence 없음",
      { epoch: 0, nonce: null },
      { epoch: 0, nonce: null, pending: null },
      { kind: "unfenced" },
    ],
    [
      "인수가 기록만 됨 (확정 nonce 없음, 원격 epoch 그대로)",
      { epoch: 3, nonce: NONCE_B },
      { epoch: 3, nonce: null, pending: { epoch: 4, nonce: NONCE_P } },
      { kind: "takeover-pending" },
    ],
    [
      "원격이 앞섬",
      { epoch: 5, nonce: NONCE_B },
      committed,
      { kind: "lost", class: "behind", localEpoch: 3, remoteEpoch: 5 },
    ],
    [
      "원격 fence 문서가 없음 (인덱스를 다시 만듦)",
      { epoch: 0, nonce: null },
      committed,
      { kind: "lost", class: "regressed", localEpoch: 3, remoteEpoch: 0 },
    ],
    [
      "같은 epoch, 다른 nonce",
      { epoch: 3, nonce: NONCE_B },
      committed,
      { kind: "lost", class: "foreign", localEpoch: 3, remoteEpoch: 3 },
    ],
    [
      "fence가 없던 이 데이터베이스보다 원격이 먼저 bootstrap함",
      { epoch: 1, nonce: NONCE_B },
      { epoch: 0, nonce: null, pending: null },
      { kind: "lost", class: "behind", localEpoch: 0, remoteEpoch: 1 },
    ],
    [
      "대기 중인데 원격이 다른 쌍으로 앞섬",
      { epoch: 4, nonce: NONCE_B },
      { ...committed, pending: { epoch: 4, nonce: NONCE_P } },
      { kind: "lost", class: "behind", localEpoch: 3, remoteEpoch: 4 },
    ],
  ] as const)("%s", (_title, remote, local, expected) => {
    expect(compareFence(remote, local)).toEqual(expected);
  });
});

describe("fence 항목과 바이트 예약", () => {
  it("external_gte 버전의 tombstone 모양 항목이고, 가장 큰 epoch에서도 예약 바이트를 넘지 않는다", () => {
    const lines = fenceActionLines(7, NONCE_A, "external_gte").split("\n");
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      index: { _id: FENCE_DOCUMENT_ID, version: 7, version_type: "external_gte" },
    });
    expect(JSON.parse(lines[1] ?? "")).toEqual({
      sonamu_meta: {
        deleted: true,
        revision: 7,
        hash_version: "sonamu-fence-v1",
        projection_hash: NONCE_A,
      },
    });
    expect(lines[2]).toBe("");
    for (const type of ["external", "external_gte"] as const) {
      expect(bytes(fenceActionLines(MAX_FENCE_EPOCH, NONCE_B, type))).toBeLessThanOrEqual(
        FENCE_ACTION_MAX_BYTES,
      );
      expect(bytes(fenceActionLines(1, NONCE_B, type))).toBeLessThanOrEqual(FENCE_ACTION_MAX_BYTES);
    }
  });

  it("packer를 maxBulkBytes - 예약으로 만들면 fence를 붙인 요청도 maxBulkBytes를 넘지 않는다", () => {
    const maxBulkBytes = 4_096;
    const packer = createBulkPacker<{ documentId: string }>({
      maxBulkBytes: maxBulkBytes - FENCE_ACTION_MAX_BYTES,
      maxDocuments: 100,
    });
    const requests = [];
    for (let index = 0; index < 50; index += 1) {
      const text = `${JSON.stringify({ index: { _id: String(index) } })}\n${"x".repeat(200)}\n`;
      const closed = packer.add({
        document: { documentId: String(index) },
        version: 1,
        text,
        bytes: bytes(text),
        chars: text.length,
      });
      if (closed !== undefined) requests.push(closed);
    }
    const tail = packer.flush();
    if (tail !== undefined) requests.push(tail);
    expect(requests.length).toBeGreaterThan(1);
    for (const request of requests) {
      const sent = fenceActionLines(MAX_FENCE_EPOCH, NONCE_A, "external_gte") + request.body;
      expect(bytes(sent)).toBeLessThanOrEqual(maxBulkBytes);
    }
  });
});

describe("fence 문서 읽기 응답 해석", () => {
  const indexes = ["snm-a", "snm-b", "snm-c", "snm-d", "snm-e"];
  it("문서 있음, 없음, 인덱스 없음, 다른 모양, 문서 단위 다른 오류를 가른다", () => {
    const docs = [
      {
        _index: "snm-a",
        _id: FENCE_DOCUMENT_ID,
        found: true,
        _version: 4,
        _source: {
          sonamu_meta: {
            deleted: true,
            revision: 4,
            hash_version: "sonamu-fence-v1",
            projection_hash: NONCE_A,
          },
        },
      },
      { _index: "snm-b", _id: FENCE_DOCUMENT_ID, found: false },
      {
        _index: "snm-c",
        _id: FENCE_DOCUMENT_ID,
        error: { type: "index_not_found_exception" },
      },
      {
        _index: "snm-d",
        _id: FENCE_DOCUMENT_ID,
        found: true,
        _version: 9,
        _source: {
          sonamu_meta: { deleted: true, revision: 9, hash_version: "x", projection_hash: "y" },
        },
      },
      { _index: "snm-e", _id: FENCE_DOCUMENT_ID, error: { type: "security_exception" } },
    ];
    expect(readFenceMget(indexes, 200, { docs })).toEqual([
      { kind: "fence", pair: { epoch: 4, nonce: NONCE_A } },
      { kind: "fence", pair: { epoch: 0, nonce: null } },
      { kind: "index-missing" },
      // A foreign shape yields a pair without nonce, which matches no local record.
      { kind: "fence", pair: { epoch: 9, nonce: null } },
      { kind: "unknown" },
    ]);
  });

  it("상태가 200이 아니거나 문서 수나 인덱스가 다르면 모두 unknown이다", () => {
    const unknown = indexes.map(() => ({ kind: "unknown" }));
    expect(readFenceMget(indexes, 403, {})).toEqual(unknown);
    expect(readFenceMget(indexes, 200, { docs: [] })).toEqual(unknown);
    expect(
      readFenceMget(["snm-a"], 200, {
        docs: [{ _index: "snm-z", _id: FENCE_DOCUMENT_ID, found: false }],
      }),
    ).toEqual([{ kind: "unknown" }]);
    expect(fenceMgetBody(["snm-a"])).toEqual({
      docs: [{ _index: "snm-a", _id: FENCE_DOCUMENT_ID }],
    });
  });
});

describe("fence 항목이 앞에 붙은 bulk 응답", () => {
  const request = {
    items: [{ document: { documentId: "d1" }, version: 3, bytes: 10, chars: 10 }],
    body: "",
    bytes: 10,
  };
  it("fence 항목이 409여도 문서 항목은 그대로 성공으로 분류된다 (문이 아님)", () => {
    const result = interpretBulkResponse(
      request,
      200,
      {
        errors: true,
        items: [
          {
            index: {
              _id: FENCE_DOCUMENT_ID,
              status: 409,
              error: { type: "version_conflict_engine_exception" },
            },
          },
          { index: { _id: "d1", status: 201, _version: 3 } },
        ],
      },
      1,
    );
    expect(result).toMatchObject({ kind: "items", outcomes: [{ kind: "success" }] });
  });

  it("앞 항목 수가 맞지 않거나 errors 플래그가 어긋나면 결과 미상이다", () => {
    const body = {
      errors: false,
      items: [
        { index: { _id: FENCE_DOCUMENT_ID, status: 409, error: { type: "x" } } },
        { index: { _id: "d1", status: 201, _version: 3 } },
      ],
    };
    expect(interpretBulkResponse(request, 200, body, 1)).toMatchObject({ kind: "release" });
    expect(interpretBulkResponse(request, 200, body, 0)).toMatchObject({ kind: "release" });
  });
});

describe("예약된 fence 문서 ID", () => {
  it("markChanged의 ID 검사와 전송 전 검사가 모두 거부한다", () => {
    let caught: SearchError | undefined;
    try {
      assertDocumentId(FENCE_DOCUMENT_ID);
    } catch (error) {
      if (error instanceof SearchError) caught = error;
    }
    expect(caught).toBeInstanceOf(SearchInvalidDocumentId);
    expect(caught?.details?.reason).toBe("reserved-document-id");
    expect(isSendableDocumentId(FENCE_DOCUMENT_ID)).toBe(false);
    expect(assertDocumentId("__sonamu_fence__x")).toBe("__sonamu_fence__x");
  });
});

describe("fence 갱신 간격 한도", () => {
  it("1,000 미만이나 requestTimeoutMs 미만은 거부한다", () => {
    const reasonOf = (value: number) => {
      try {
        parseWorkerLimits({ ...RECOMMENDED_WORKER_LIMITS, fenceRenewIntervalMs: value });
      } catch (error) {
        if (error instanceof SearchError) return error.details?.reason;
      }
      return undefined;
    };
    expect(reasonOf(999)).toBe("invalid-worker-limits");
    expect(reasonOf(29_999)).toBe("fence-interval-below-request-timeout");
    expect(reasonOf(30_000)).toBeUndefined();
  });
});

describe("관리 문장 캐시", () => {
  it("스키마 수가 상한을 넘으면 가장 오래 쓰지 않은 것을 버리고 다시 렌더링한다", () => {
    let renders = 0;
    const cache = createSchemaStatementCache((schema) => {
      renders += 1;
      return { schema };
    }, 3);
    for (let index = 0; index < 1_000; index += 1) cache.get(`s${index}`);
    expect(cache.size()).toBe(3);
    expect(renders).toBe(1_000);
    const kept = cache.get("s999");
    expect(renders).toBe(1_000);
    cache.get("s997");
    cache.get("s1000");
    // s998 was the least recently used entry, so it was evicted.
    expect(cache.get("s999")).toBe(kept);
    expect(renders).toBe(1_001);
    cache.get("s998");
    expect(renders).toBe(1_002);
  });
});

import { describe, expect, it } from "vitest";

import { buildSearchEnvelope, type SearchEnvelope } from "../../src/definition/envelope";
import { SearchConfigurationError } from "../../src/errors";
import {
  assertBulkPackLimits,
  type BulkDocument,
  isSendableDocumentId,
  packBulkRequests,
  serializeBulkItem,
  splitBulkRequest,
} from "../../src/worker/bulk";

// Set PROPERTY_SEED to replay a failing run.
const SEED = Number(process.env.PROPERTY_SEED ?? Date.now() % 2 ** 31);

// mulberry32
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function present(id: string, revision: number, body: string): BulkDocument {
  return {
    documentId: id,
    envelope: buildSearchEnvelope({ state: "present", document: { body } }, revision),
  };
}

function deleted(id: string, revision: number): BulkDocument {
  return { documentId: id, envelope: buildSearchEnvelope({ state: "deleted" }, revision) };
}

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function itemOf(document: BulkDocument) {
  const item = serializeBulkItem(document);
  if ("reason" in item) throw new Error(`직렬화가 거부됐습니다: ${item.reason}`);
  return item;
}

describe("bulk NDJSON 직렬화", () => {
  it("항목은 external 버전 index 액션 줄과 envelope 줄 두 줄이고, 삭제도 tombstone index다", () => {
    const item = itemOf(present("가-1", 3, "안녕"));
    const [action, source, rest] = item.text.split("\n");
    expect(JSON.parse(action ?? "")).toEqual({
      index: { _id: "가-1", version: 3, version_type: "external" },
    });
    expect(JSON.parse(source ?? "")).toEqual(present("가-1", 3, "안녕").envelope);
    expect(rest).toBe("");
    expect(item.version).toBe(3);

    const tombstone = itemOf(deleted("x", 9));
    const lines = tombstone.text.split("\n");
    expect(Object.keys(JSON.parse(lines[0] ?? ""))).toEqual(["index"]);
    const envelope: SearchEnvelope = JSON.parse(lines[1] ?? "");
    expect(envelope.sonamu_meta.deleted).toBe(true);
    expect("doc" in envelope).toBe(false);
    expect(tombstone.text).not.toContain('"delete"');
  });
});

describe("_id 바이트 검사 (전송 전)", () => {
  it("512바이트까지 받고 513바이트부터 invalid_id로 격리한다 (문자 수가 아니라 바이트)", () => {
    expect(isSendableDocumentId("a".repeat(512))).toBe(true);
    expect(isSendableDocumentId("가".repeat(170))).toBe(true);
    expect(isSendableDocumentId("a".repeat(513))).toBe(false);
    expect(isSendableDocumentId("가".repeat(171))).toBe(false);
    expect(isSendableDocumentId("😀".repeat(128))).toBe(true);
    expect(isSendableDocumentId("😀".repeat(129))).toBe(false);
    expect(isSendableDocumentId("")).toBe(false);
    expect(isSendableDocumentId("a\u0000b")).toBe(false);
    expect(isSendableDocumentId("a\ud800b")).toBe(false);
  });

  it("보낼 수 없는 _id는 요청에 들어가지 않고 이웃은 그대로 묶인다", () => {
    const docs = [
      present("ok-1", 1, "x"),
      deleted("가".repeat(171), 1),
      deleted("a".repeat(513), 1),
      present("ok-2", 1, "y"),
    ];
    const { requests, rejected } = packBulkRequests(docs, {
      maxBulkBytes: 1_000_000,
      maxDocuments: 10,
    });
    expect(rejected.map((entry) => [entry.reason, entry.bytes])).toEqual([
      ["invalid_id", 513],
      ["invalid_id", 513],
    ]);
    expect(
      requests.flatMap((request) => request.items.map((item) => item.document.documentId)),
    ).toEqual(["ok-1", "ok-2"]);
    for (const request of requests) {
      for (const line of request.body.trimEnd().split("\n")) {
        const parsed: { index?: { _id: string } } = JSON.parse(line);
        if (parsed.index !== undefined) expect(bytes(parsed.index._id)).toBeLessThanOrEqual(512);
      }
    }
  });
});

describe("요청 묶기", () => {
  it("합이 정확히 maxBulkBytes면 한 요청, 1바이트 모자라면 두 요청이다", () => {
    const docs = [present("a", 1, "한글"), present("b", 1, "日本")];
    const total = docs.map((doc) => itemOf(doc).bytes).reduce((sum, value) => sum + value, 0);
    expect(packBulkRequests(docs, { maxBulkBytes: total, maxDocuments: 10 }).requests).toHaveLength(
      1,
    );
    const split = packBulkRequests(docs, { maxBulkBytes: total - 1, maxDocuments: 10 });
    expect(split.requests.map((request) => request.items.length)).toEqual([1, 1]);
    expect(split.rejected).toEqual([]);
  });

  it("혼자 한도를 넘는 문서는 요청이 아니라 문서 단위 oversized이고, 잘리지 않는다", () => {
    const big = present("big", 1, "가".repeat(400));
    const bigBytes = itemOf(big).bytes;
    const docs = [present("a", 1, "x"), big, present("c", 1, "y")];
    const exact = packBulkRequests([big], { maxBulkBytes: bigBytes, maxDocuments: 10 });
    expect(exact.rejected).toEqual([]);
    expect(exact.requests[0]?.bytes).toBe(bigBytes);

    const { requests, rejected } = packBulkRequests(docs, {
      maxBulkBytes: bigBytes - 1,
      maxDocuments: 10,
    });
    expect(rejected).toEqual([{ document: big, reason: "oversized", bytes: bigBytes }]);
    expect(
      requests.flatMap((request) => request.items.map((item) => item.document.documentId)),
    ).toEqual(["a", "c"]);
  });

  it("잘못된 한도는 실패 닫힘으로 거부한다", () => {
    for (const limits of [
      { maxBulkBytes: 0, maxDocuments: 1 },
      { maxBulkBytes: Number.NaN, maxDocuments: 1 },
      { maxBulkBytes: 1.5, maxDocuments: 1 },
      { maxBulkBytes: 10, maxDocuments: 0 },
      { maxBulkBytes: 10, maxDocuments: Number.POSITIVE_INFINITY },
    ]) {
      let caught: unknown;
      try {
        assertBulkPackLimits(limits);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SearchConfigurationError);
      expect(caught instanceof SearchConfigurationError ? caught.details?.reason : undefined).toBe(
        "invalid-bulk-limit",
      );
    }
  });

  it("이분 분할은 순서를 지키고 바이트를 다시 정확히 센다", () => {
    const docs = Array.from({ length: 5 }, (_, index) =>
      present(`문서${index}`, index + 1, "本文"),
    );
    const [request] = packBulkRequests(docs, {
      maxBulkBytes: 1_000_000,
      maxDocuments: 10,
    }).requests;
    if (request === undefined) throw new Error("요청이 없습니다");
    const halves = splitBulkRequest(request);
    expect(halves?.map((half) => half.items.length)).toEqual([3, 2]);
    expect(halves?.flatMap((half) => half.items)).toEqual(request.items);
    for (const half of halves ?? []) expect(half.bytes).toBe(bytes(half.body));
    expect((halves?.[0]?.bytes ?? 0) + (halves?.[1]?.bytes ?? 0)).toBe(request.bytes);
    const single = splitBulkRequest({ ...request, items: request.items.slice(0, 1) });
    expect(single).toBeUndefined();
  });
});

const ALPHABETS = [
  "abcxyz019-_",
  "가나다라마바사한글",
  "あいうえおカタカナ漢字",
  "😀👍🏽🎉",
  'é ü ß " \\ \n \t',
];

function randomText(random: () => number, maxLength: number): string {
  const length = Math.floor(random() * maxLength);
  let text = "";
  for (let index = 0; index < length; index += 1) {
    const alphabet = Array.from(ALPHABETS[Math.floor(random() * ALPHABETS.length)] ?? "a");
    text += alphabet[Math.floor(random() * alphabet.length)] ?? "a";
  }
  return text;
}

describe("묶기 속성 테스트", () => {
  it(`임의의 문서에서 한도, 순서, 누락 없음, 중복 없음, 정확한 바이트, 탐욕적 채우기가 성립한다 (seed ${SEED})`, () => {
    const random = prng(SEED);
    for (let round = 0; round < 300; round += 1) {
      const count = Math.floor(random() * 40);
      const docs: BulkDocument[] = [];
      for (let index = 0; index < count; index += 1) {
        // Occasionally an _id over 512 bytes.
        const id =
          random() < 0.05
            ? "가".repeat(171 + Math.floor(random() * 10))
            : `${index}-${randomText(random, 12)}`;
        const revision = 1 + Math.floor(random() * Number.MAX_SAFE_INTEGER);
        docs.push(
          random() < 0.2 ? deleted(id, revision) : present(id, revision, randomText(random, 300)),
        );
      }
      const limits = {
        maxBulkBytes: 150 + Math.floor(random() * 3_000),
        maxDocuments: 1 + Math.floor(random() * 8),
      };
      const message = `seed ${SEED}, round ${round}`;
      const { requests, rejected } = packBulkRequests(docs, limits);

      const placed = new Map<BulkDocument, string>();
      for (const [requestIndex, request] of requests.entries()) {
        expect(request.items.length, message).toBeGreaterThan(0);
        expect(request.items.length, message).toBeLessThanOrEqual(limits.maxDocuments);
        expect(request.bytes, message).toBeLessThanOrEqual(limits.maxBulkBytes);
        expect(Buffer.byteLength(request.body, "utf8"), message).toBe(request.bytes);
        expect(request.body.split("\n").length, message).toBe(request.items.length * 2 + 1);
        for (const item of request.items) {
          expect(placed.has(item.document), message).toBe(false);
          placed.set(item.document, `request-${requestIndex}`);
          expect(isSendableDocumentId(item.document.documentId), message).toBe(true);
        }
        // Greedy: the next request's first item must not have fit into this one.
        const following = requests[requestIndex + 1]?.items[0];
        if (following !== undefined) {
          const fits =
            request.items.length < limits.maxDocuments &&
            request.bytes + following.bytes <= limits.maxBulkBytes;
          expect(fits, message).toBe(false);
        }
      }
      for (const entry of rejected) {
        expect(placed.has(entry.document), message).toBe(false);
        placed.set(entry.document, entry.reason);
        if (entry.reason === "oversized")
          expect(entry.bytes, message).toBeGreaterThan(limits.maxBulkBytes);
        else expect(isSendableDocumentId(entry.document.documentId), message).toBe(false);
      }
      expect(placed.size, message).toBe(docs.length);
      // Sent and rejected documents are each a subsequence of the input order.
      const sentOrder = requests.flatMap((request) => request.items.map((item) => item.document));
      expect(sentOrder, message).toEqual(
        docs.filter((doc) => !rejected.some((entry) => entry.document === doc)),
      );
      expect(
        rejected.map((entry) => entry.document),
        message,
      ).toEqual(docs.filter((doc) => rejected.some((entry) => entry.document === doc)));
    }
  });
});

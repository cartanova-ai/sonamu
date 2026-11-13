import { describe, expect, it } from "vitest";

import { buildSearchEnvelope, type SonamuMeta } from "../../src/definition/envelope";
import {
  type ConflictCandidate,
  verifyConflicts,
  type VerifyConflictsInput,
} from "../../src/worker/conflict";

const PHYSICAL = "snm-t-641c316f-chat-f7145cca8f364d4eaad1db4bd97b3153";

function presentMeta(revision: number, body = "본문"): SonamuMeta {
  return buildSearchEnvelope({ state: "present", document: { body } }, revision).sonamu_meta;
}
function tombstoneMeta(revision: number): SonamuMeta {
  return buildSearchEnvelope({ state: "deleted" }, revision).sonamu_meta;
}

// Indexed sonamu_meta; another package version may have written a different hash_version.
type IndexedMeta = Omit<SonamuMeta, "hash_version"> & { hash_version: string };

// mget response document; sonamu_meta allows an extra field for the identity-mismatch cases.
interface MgetDocFixture {
  _index?: string;
  _id: string;
  _version?: number;
  _seq_no?: number;
  _primary_term?: number;
  found?: boolean;
  _source?: { sonamu_meta?: IndexedMeta & { extra?: number } };
  error?: { type: string; reason: string; root_cause: { type: string; reason: string }[] };
}

// Shape of a real engine (3.5.0) mget document with _source_includes=sonamu_meta.
function found(
  id: string,
  meta: IndexedMeta,
  overrides: Partial<MgetDocFixture> = {},
): MgetDocFixture {
  return {
    _index: PHYSICAL,
    _id: id,
    _version: meta.revision,
    _seq_no: 2,
    _primary_term: 1,
    found: true,
    _source: { sonamu_meta: meta },
    ...overrides,
  };
}
function absent(id: string): MgetDocFixture {
  return { _index: PHYSICAL, _id: id, found: false };
}
// For a missing index the engine answers 200 with a per-document error.
function missingIndex(id: string): MgetDocFixture {
  return {
    _index: "snm-t-641c316f-gone",
    _id: id,
    error: {
      root_cause: [
        { type: "index_not_found_exception", reason: "no such index [snm-t-641c316f-gone]" },
      ],
      type: "index_not_found_exception",
      reason: "no such index [snm-t-641c316f-gone]",
    },
  };
}

function verifyOne(attempted: SonamuMeta, doc: MgetDocFixture, ledger: number | undefined) {
  const input: VerifyConflictsInput = {
    physicalIndex: PHYSICAL,
    conflicts: [{ documentId: "a", attempted }],
    mget: { kind: "response", status: 200, body: { docs: [doc] } },
    ledger: new Map(ledger === undefined ? [] : [["a", ledger]]),
  };
  const [verdict] = verifyConflicts(input);
  return verdict;
}

describe("409 검증", () => {
  it("같은 리비전, 같은 hash_version과 해시: 검증된 중복", () => {
    const meta = presentMeta(6);
    expect(verifyOne(meta, found("a", meta), 6)).toEqual({ kind: "duplicate" });
  });

  it("같은 리비전, 다른 해시: 그 문서만 hash_mismatch poison", () => {
    expect(verifyOne(presentMeta(6, "새 본문"), found("a", presentMeta(6, "옛 본문")), 6)).toEqual({
      kind: "poison",
      error: { class: "hash_mismatch", revision: 6 },
    });
  });

  it("같은 리비전, 다른 hash_version: 예산 없는 반납 (격리도 덮어쓰기도 아님)", () => {
    const indexed = { ...presentMeta(6), hash_version: "sonamu-c14n-v2" };
    expect(verifyOne(presentMeta(6), found("a", indexed), 6)).toEqual({
      kind: "release",
      error: { class: "hash_version_mismatch", revision: 6 },
    });
  });

  it("더 높은 색인 리비전(M < V <= L): superseded", () => {
    expect(verifyOne(presentMeta(4), found("a", presentMeta(6)), 6)).toEqual({
      kind: "superseded",
    });
    expect(verifyOne(presentMeta(4), found("a", presentMeta(6)), 9)).toEqual({
      kind: "superseded",
    });
  });

  it("색인이 원장보다 앞섬(V > L): revision_divergence pause, 확인하지 않음", () => {
    expect(verifyOne(presentMeta(4), found("a", presentMeta(7)), 6)).toEqual({
      kind: "pause",
      document: { id: "a", indexed: 7, ledger: 6 },
    });
  });

  it("더 낮은 색인 리비전(V < M)으로 409가 났으면 색인이 어긋난 것이므로 pause", () => {
    expect(verifyOne(presentMeta(6), found("a", presentMeta(5)), 6)).toEqual({
      kind: "pause",
      document: { id: "a", indexed: 5, ledger: 6 },
    });
  });

  it("문서가 없으면 인프라 반납 (성공으로 보지 않음)", () => {
    expect(verifyOne(presentMeta(6), absent("a"), 6)).toEqual({
      kind: "release",
      error: { class: "conflict_unverified", reason: "document-missing" },
    });
    expect(verifyOne(presentMeta(6), missingIndex("a"), 6)).toEqual({
      kind: "release",
      error: {
        class: "conflict_unverified",
        reason: "mget-document-error",
        type: "index_not_found_exception",
      },
    });
  });

  describe("tombstone", () => {
    it("해시가 같아도 deleted가 다르면 중복이 아니다", () => {
      const attempted = presentMeta(6);
      const indexed = { ...tombstoneMeta(6), projection_hash: attempted.projection_hash };
      expect(verifyOne(attempted, found("a", indexed), 6).kind).toBe("poison");
    });
  });

  describe("식별 불일치는 pause", () => {
    it("다른 물리 인덱스의 문서", () => {
      const meta = presentMeta(6);
      expect(verifyOne(meta, found("a", meta, { _index: "snm-other" }), 6).kind).toBe("pause");
    });
    it("sonamu_meta가 없거나 형식이 다르다", () => {
      const meta = presentMeta(6);
      expect(verifyOne(meta, found("a", meta, { _source: {} }), 6).kind).toBe("pause");
      expect(verifyOne(meta, found("a", meta, { _source: undefined }), 6).kind).toBe("pause");
      expect(
        verifyOne(meta, found("a", meta, { _source: { sonamu_meta: { ...meta, extra: 1 } } }), 6)
          .kind,
      ).toBe("pause");
    });
    it("_version과 sonamu_meta.revision이 다르다", () => {
      const meta = presentMeta(6);
      expect(verifyOne(meta, found("a", meta, { _version: 7 }), 7).kind).toBe("pause");
      expect(verifyOne(meta, found("a", meta, { _version: undefined }), 6).kind).toBe("pause");
    });
    it("원장 행이 없으면 L = 0으로 보고 pause", () => {
      const meta = presentMeta(6);
      expect(verifyOne(meta, found("a", meta), undefined)).toEqual({
        kind: "pause",
        document: { id: "a", indexed: 6, ledger: 0 },
      });
    });
  });

  describe("읽기 실패와 해석할 수 없는 응답은 모두 반납", () => {
    const conflicts: ConflictCandidate[] = [
      { documentId: "a", attempted: presentMeta(6) },
      { documentId: "b", attempted: tombstoneMeta(2) },
    ];
    const ledger = new Map([
      ["a", 6],
      ["b", 2],
    ]);
    const good = { docs: [found("a", presentMeta(6)), found("b", tombstoneMeta(2))] };
    const cases: readonly [string, VerifyConflictsInput][] = [
      ["mget 실패", { physicalIndex: PHYSICAL, conflicts, ledger, mget: { kind: "failed" } }],
      [
        "원장 읽기 실패",
        {
          physicalIndex: PHYSICAL,
          conflicts,
          ledger: undefined,
          mget: { kind: "response", status: 200, body: good },
        },
      ],
      [
        "mget 5xx",
        {
          physicalIndex: PHYSICAL,
          conflicts,
          ledger,
          mget: { kind: "response", status: 503, body: { error: { type: "x" } } },
        },
      ],
      [
        "본문이 형식과 다르다",
        {
          physicalIndex: PHYSICAL,
          conflicts,
          ledger,
          mget: { kind: "response", status: 200, body: { documents: [] } },
        },
      ],
      [
        "문서 수가 다르다",
        {
          physicalIndex: PHYSICAL,
          conflicts,
          ledger,
          mget: { kind: "response", status: 200, body: { docs: [good.docs[0]] } },
        },
      ],
      [
        "순서가 다르다",
        {
          physicalIndex: PHYSICAL,
          conflicts,
          ledger,
          mget: { kind: "response", status: 200, body: { docs: [good.docs[1], good.docs[0]] } },
        },
      ],
    ];
    for (const [name, input] of cases) {
      it(name, () => {
        const verdicts = verifyConflicts(input);
        expect(verdicts).toHaveLength(2);
        expect(verdicts.every((verdict) => verdict.kind === "release")).toBe(true);
      });
    }
    it("정상 응답이면 문서마다 자기 판정을 입력 순서대로 받는다", () => {
      expect(
        verifyConflicts({
          physicalIndex: PHYSICAL,
          conflicts,
          ledger,
          mget: { kind: "response", status: 200, body: good },
        }),
      ).toEqual([{ kind: "duplicate" }, { kind: "duplicate" }]);
    });
  });
});

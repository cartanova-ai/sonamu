import { describe, expect, it } from "vitest";
import {
  addToField,
  getField,
  getFieldMeta,
  listFieldNames,
  removeFromField,
  setField,
} from "./spec-field-ops.js";
import type { SpecDocument } from "./types.js";

function makeDoc(overrides: Partial<SpecDocument> = {}): SpecDocument {
  return {
    schemaVersion: 1,
    summary: "테스트",
    description: ["설명"],
    acceptanceCriteria: [
      { id: "ac-test-1", condition: "조건 A", testRef: { target: "src/a.ts", pattern: "조건 A" } },
    ],
    lastModified: "2026-01-01",
    status: "draft",
    sources: ["src/a.ts", "src/b.ts"],
    contracts: ["./main.contract.json"],
    modules: { ModA: "모듈A", ModB: "모듈B" },
    interfaces: { "ModA.run()": "실행" },
    dataFlow: ["1. 입력", "2. 출력"],
    errorHandling: { ErrA: "에러A" },
    constraints: ["제약1"],
    ...overrides,
  };
}

describe("getFieldMeta", () => {
  it("존재하는 필드의 메타를 반환한다", () => {
    expect(getFieldMeta("modules")).toEqual({ type: "record", required: true });
    expect(getFieldMeta("sources")).toEqual({ type: "string[]", required: true });
    expect(getFieldMeta("summary")).toEqual({ type: "string", required: true });
  });

  it("존재하지 않는 필드는 undefined를 반환한다", () => {
    expect(getFieldMeta("nonexistent")).toBeUndefined();
  });
});

describe("listFieldNames", () => {
  it("모든 필드명을 반환한다", () => {
    const names = listFieldNames();
    expect(names).toContain("schemaVersion");
    expect(names).toContain("modules");
    expect(names).toContain("dependsOnSpecs");
    expect(names.length).toBeGreaterThanOrEqual(14);
  });
});

describe("getField", () => {
  it("최상위 필드를 읽는다", () => {
    const doc = makeDoc();
    expect(getField(doc, "summary")).toBe("테스트");
    expect(getField(doc, "sources")).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("record 서브키를 읽는다", () => {
    const doc = makeDoc();
    expect(getField(doc, "modules.ModA")).toBe("모듈A");
  });

  it("존재하지 않는 서브키는 undefined를 반환한다", () => {
    const doc = makeDoc();
    expect(getField(doc, "modules.NonExistent")).toBeUndefined();
  });
});

describe("setField", () => {
  it("scalar 필드를 변경한다", () => {
    const doc = makeDoc();
    setField(doc, "summary", "새 요약");
    expect(doc.summary).toBe("새 요약");
  });

  it("record 서브키를 변경한다", () => {
    const doc = makeDoc();
    setField(doc, "modules.ModA", "변경된 모듈");
    expect(doc.modules.ModA).toBe("변경된 모듈");
  });

  it("lastModified를 자동 갱신한다", () => {
    const doc = makeDoc();
    setField(doc, "summary", "변경");
    expect(doc.lastModified).not.toBe("2026-01-01");
  });
});

describe("addToField", () => {
  it("배열에 항목을 추가한다", () => {
    const doc = makeDoc();
    addToField(doc, "sources", "src/c.ts");
    expect(doc.sources).toContain("src/c.ts");
  });

  it("record에 키-값을 추가한다", () => {
    const doc = makeDoc();
    addToField(doc, "modules", "새 모듈", "ModC");
    expect(doc.modules.ModC).toBe("새 모듈");
  });

  it("record에 key 없이 추가하면 에러를 던진다", () => {
    const doc = makeDoc();
    expect(() => addToField(doc, "modules", "값")).toThrow("--key가 필요합니다");
  });

  it("scalar 필드에 추가하면 에러를 던진다", () => {
    const doc = makeDoc();
    expect(() => addToField(doc, "summary", "값")).toThrow("지원하지 않습니다");
  });
});

describe("removeFromField", () => {
  it("배열에서 인덱스로 제거한다", () => {
    const doc = makeDoc();
    const removed = removeFromField(doc, "sources", { index: 0 });
    expect(removed).toBe(true);
    expect(doc.sources).toEqual(["src/b.ts"]);
  });

  it("배열에서 값으로 제거한다", () => {
    const doc = makeDoc();
    const removed = removeFromField(doc, "sources", { value: "src/b.ts" });
    expect(removed).toBe(true);
    expect(doc.sources).toEqual(["src/a.ts"]);
  });

  it("record에서 키로 제거한다", () => {
    const doc = makeDoc();
    const removed = removeFromField(doc, "modules", { key: "ModA" });
    expect(removed).toBe(true);
    expect(doc.modules.ModA).toBeUndefined();
    expect(doc.modules.ModB).toBe("모듈B");
  });

  it("존재하지 않는 항목 제거 시 false를 반환한다", () => {
    const doc = makeDoc();
    expect(removeFromField(doc, "sources", { value: "nonexistent" })).toBe(false);
    expect(removeFromField(doc, "modules", { key: "nonexistent" })).toBe(false);
    expect(removeFromField(doc, "sources", { index: 999 })).toBe(false);
  });
});

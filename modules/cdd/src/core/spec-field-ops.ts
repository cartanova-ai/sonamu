import { todayString } from "./date.js";
import type { AcceptanceCriterion, SpecDocument } from "./types.js";

type FieldType = "string" | "number" | "string[]" | "record" | "ac[]";

interface FieldInfo {
  type: FieldType;
  required: boolean;
}

/** Spec 필드 메타데이터 */
const FIELD_META: Record<string, FieldInfo> = {
  schemaVersion: { type: "number", required: true },
  summary: { type: "string", required: true },
  description: { type: "string[]", required: true },
  acceptanceCriteria: { type: "ac[]", required: true },
  lastModified: { type: "string", required: true },
  status: { type: "string", required: true },
  sources: { type: "string[]", required: true },
  contracts: { type: "string[]", required: true },
  dependsOnSpecs: { type: "string[]", required: false },
  modules: { type: "record", required: true },
  interfaces: { type: "record", required: true },
  dataFlow: { type: "string[]", required: true },
  errorHandling: { type: "record", required: true },
  constraints: { type: "string[]", required: true },
};

/** done 상태에서 변경 시 implementing으로 회귀시키는 필드 */
const REGRESSION_TRIGGER_FIELDS = ["sources", "contracts", "acceptanceCriteria"];

export function getFieldMeta(field: string): FieldInfo | undefined {
  return FIELD_META[field];
}

export function listFieldNames(): string[] {
  return Object.keys(FIELD_META);
}

/** 필드 값 읽기. record 필드의 서브키 접근: "modules.Session", AC id 접근: "acceptanceCriteria.ac-login-jwt" */
export function getField(doc: SpecDocument, fieldPath: string): unknown {
  const { field, subKey } = parseFieldPath(fieldPath);
  const raw = doc as unknown as Record<string, unknown>;
  const value = raw[field];

  if (subKey !== undefined) {
    if (field === "acceptanceCriteria") {
      const arr = value as AcceptanceCriterion[];
      return arr.find((ac) => ac.id === subKey);
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }
    return (value as Record<string, unknown>)[subKey];
  }

  return value;
}

/** scalar 필드 쓰기 (lastModified 자동 갱신, 회귀 자동 적용) */
export function setField(doc: SpecDocument, fieldPath: string, value: unknown): void {
  const { field, subKey } = parseFieldPath(fieldPath);
  const raw = doc as unknown as Record<string, unknown>;

  if (subKey !== undefined) {
    if (field === "acceptanceCriteria") {
      const arr = raw[field] as AcceptanceCriterion[];
      const idx = arr.findIndex((ac) => ac.id === subKey);
      if (idx === -1) throw new Error(`AC id "${subKey}"를 찾을 수 없습니다`);
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      validateAcceptanceCriterion(parsed);
      arr[idx] = parsed;
    } else {
      const record = raw[field] as Record<string, unknown>;
      record[subKey] = value;
    }
  } else {
    raw[field] = value;
  }

  applyRegression(doc, field);

  if (field !== "lastModified") {
    doc.lastModified = todayString();
  }
}

/** 배열에 항목 추가 또는 맵에 키-값 추가 */
export function addToField(doc: SpecDocument, field: string, value: string, key?: string): void {
  const raw = doc as unknown as Record<string, unknown>;
  const meta = FIELD_META[field];
  if (!meta) throw new Error(`알 수 없는 필드: "${field}"`);

  if (meta.type === "ac[]") {
    const parsed: unknown = JSON.parse(value);
    validateAcceptanceCriterion(parsed);
    const arr = raw[field] as AcceptanceCriterion[];
    const ac = parsed as AcceptanceCriterion;
    if (arr.some((existing) => existing.id === ac.id)) {
      throw new Error(`중복된 AC id: "${ac.id}"`);
    }
    arr.push(ac);
  } else if (meta.type === "string[]") {
    const arr = raw[field] as string[];
    arr.push(value);
  } else if (meta.type === "record") {
    if (!key) throw new Error(`record 필드 "${field}"에 추가하려면 --key가 필요합니다`);
    const record = raw[field] as Record<string, string>;
    record[key] = value;
  } else {
    throw new Error(`"${field}" 필드는 추가 연산을 지원하지 않습니다`);
  }

  applyRegression(doc, field);
  doc.lastModified = todayString();
}

/** 배열 인덱스/값/id 또는 맵 키로 항목 제거 */
export function removeFromField(
  doc: SpecDocument,
  field: string,
  selector: { index?: number; value?: string; key?: string; id?: string },
): boolean {
  const raw = doc as unknown as Record<string, unknown>;
  const meta = FIELD_META[field];
  if (!meta) throw new Error(`알 수 없는 필드: "${field}"`);

  let removed = false;

  if (meta.type === "ac[]") {
    const arr = raw[field] as AcceptanceCriterion[];
    if (selector.id !== undefined) {
      const idx = arr.findIndex((ac) => ac.id === selector.id);
      if (idx !== -1) {
        arr.splice(idx, 1);
        removed = true;
      }
    } else if (selector.index !== undefined) {
      if (selector.index >= 0 && selector.index < arr.length) {
        arr.splice(selector.index, 1);
        removed = true;
      }
    }
  } else if (meta.type === "string[]") {
    const arr = raw[field] as string[];
    if (selector.index !== undefined) {
      if (selector.index >= 0 && selector.index < arr.length) {
        arr.splice(selector.index, 1);
        removed = true;
      }
    } else if (selector.value !== undefined) {
      const idx = arr.indexOf(selector.value);
      if (idx !== -1) {
        arr.splice(idx, 1);
        removed = true;
      }
    }
  } else if (meta.type === "record") {
    if (!selector.key) throw new Error(`record 필드 "${field}"에서 제거하려면 --key가 필요합니다`);
    const record = raw[field] as Record<string, string>;
    if (selector.key in record) {
      delete record[selector.key];
      removed = true;
    }
  } else {
    throw new Error(`"${field}" 필드는 제거 연산을 지원하지 않습니다`);
  }

  if (removed) {
    applyRegression(doc, field);
    doc.lastModified = todayString();
  }

  return removed;
}

/** AcceptanceCriterion 구조 검증 */
function validateAcceptanceCriterion(value: unknown): asserts value is AcceptanceCriterion {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("AcceptanceCriterion은 객체여야 합니다");
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.length === 0) {
    throw new Error("AcceptanceCriterion.id는 비어있지 않은 문자열이어야 합니다");
  }
  if (typeof obj.condition !== "string" || obj.condition.length === 0) {
    throw new Error("AcceptanceCriterion.condition은 비어있지 않은 문자열이어야 합니다");
  }
  if (typeof obj.testRef !== "object" || obj.testRef === null || Array.isArray(obj.testRef)) {
    throw new Error("AcceptanceCriterion.testRef는 객체여야 합니다");
  }
  const testRef = obj.testRef as Record<string, unknown>;
  if (typeof testRef.target !== "string") {
    throw new Error("AcceptanceCriterion.testRef.target은 문자열이어야 합니다");
  }
  if (typeof testRef.pattern !== "string") {
    throw new Error("AcceptanceCriterion.testRef.pattern은 문자열이어야 합니다");
  }
}

/** done 상태에서 회귀 트리거 필드 변경 시 implementing으로 되돌림 */
function applyRegression(doc: SpecDocument, field: string): void {
  if (doc.status === "done" && REGRESSION_TRIGGER_FIELDS.includes(field)) {
    doc.status = "implementing";
  }
}

function parseFieldPath(fieldPath: string): { field: string; subKey?: string } {
  const dotIndex = fieldPath.indexOf(".");
  if (dotIndex === -1) {
    return { field: fieldPath };
  }
  return {
    field: fieldPath.slice(0, dotIndex),
    subKey: fieldPath.slice(dotIndex + 1),
  };
}

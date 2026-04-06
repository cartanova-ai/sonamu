import { type UpsertBuilder } from "sonamu";
import { expect } from "vitest";

/**
 * UpsertBuilder 상태 검증을 위한 헬퍼 타입
 *
 * - `tables`: 전체 테이블 목록 (string[])
 * - `hasTable`: 테이블 존재 여부 (boolean)
 * - `rowCount`: row 개수 (number)
 * - `rows`: 전체 rows, uuid 제외 (unknown[])
 * - `row`: 특정 인덱스 row, uuid 제외 (unknown)
 * - `refs`: 참조 목록 (string[])
 * - `uniquesMap`: unique 키 → uuid 맵 (Record)
 * - `uniqueIndexes`: unique 인덱스 정의 (unknown[])
 */
export type UBPart =
  | "tables"
  | "hasTable"
  | "rowCount"
  | "rows"
  | "row"
  | "refs"
  | "uniquesMap"
  | "uniqueIndexes";

/**
 * UBPart별 expect 값의 타입 매핑
 * `UBExpectValue<P>`로 특정 part의 타입 추출 가능
 */
type UBExpectMap = {
  tables: string[];
  hasTable: boolean;
  rows: unknown[];
  rowCount: number;
  row: unknown | undefined;
  refs: unknown[];
  uniquesMap: Record<string, unknown>;
  uniqueIndexes: unknown[];
};

export type UBExpectValue<P extends UBPart> = UBExpectMap[P];

/**
 * row 객체에서 uuid 필드를 제외하는 헬퍼 함수
 *
 * 테스트에서 row를 검증할 때 uuid는 매번 달라져서 스냅샷 비교가 불가능
 * uuid를 제외한 나머지 필드만 비교하기 위해 사용
 */
const omitUuid = <T extends { uuid?: unknown }>({ uuid: _ignored, ...rest }: T) => rest;

/**
 * UpsertBuilder 상태를 추출하여 expect()로 반환
 *
 * expect 체이닝으로 다양한 matcher 사용 가능:
 * - `.toBe()`, `.toEqual()`, `.toMatchObject()` 등
 * - `.toMatchInlineSnapshot()` 으로 필요시 스냅샷 비교
 *
 * @param ub - UpsertBuilder 인스턴스
 * @param part - 추출할 상태 종류
 * @param tableName - 테이블명 (tables 외 필수)
 * @param index - row 인덱스 (part가 "row"일 때만 사용)
 *
 * @example
 * expectUB(ub, "tables").toEqual(["users", "employees"]);
 * expectUB(ub, "rowCount", "users").toBe(3);
 * expectUB(ub, "row", "users", 0).toMatchInlineSnapshot(`
 *   { "email": "test@test.com" }
 * `);
 */
export function expectUB<P extends UBPart>(
  ub: UpsertBuilder,
  part: P,
  tableName?: string,
  index?: number,
): ReturnType<typeof expect<UBExpectValue<P>>> {
  switch (part) {
    case "tables": {
      const value = Array.from(ub.tables.keys());
      return expect(value) as ReturnType<typeof expect<UBExpectValue<P>>>;
    }

    case "hasTable": {
      const value = ub.hasTable(tableName as string);
      return expect(value) as ReturnType<typeof expect<UBExpectValue<P>>>;
    }

    case "rows": {
      const table = ub.tables.get(tableName as string);
      const rowsWithoutUuid = (table?.rows ?? []).map(omitUuid);
      return expect(rowsWithoutUuid) as ReturnType<typeof expect<UBExpectValue<P>>>;
    }

    case "rowCount": {
      const table = ub.tables.get(tableName as string);
      const value = table?.rows.length ?? 0;
      return expect(value) as ReturnType<typeof expect<UBExpectValue<P>>>;
    }

    case "row": {
      const table = ub.tables.get(tableName as string);
      const row = table?.rows[index ?? 0];
      const value = row ? omitUuid(row) : undefined;
      return expect(value) as ReturnType<typeof expect<UBExpectValue<P>>>;
    }

    case "refs": {
      const table = ub.tables.get(tableName as string);
      const value = Array.from(table?.references ?? []);
      return expect(value) as ReturnType<typeof expect<UBExpectValue<P>>>;
    }

    case "uniquesMap": {
      const table = ub.tables.get(tableName as string);
      const value = Object.fromEntries(table?.uniquesMap ?? new Map());
      return expect(value) as ReturnType<typeof expect<UBExpectValue<P>>>;
    }

    case "uniqueIndexes": {
      const table = ub.tables.get(tableName as string);
      const value = table?.uniqueIndexes ?? [];
      return expect(value) as ReturnType<typeof expect<UBExpectValue<P>>>;
    }

    default: {
      const _exhaustiveCheck: never = part;
      throw new Error(`처리되지 않은 UBPart: ${_exhaustiveCheck}`);
    }
  }
}

import { describe, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);

describe("Upsert Builder", () => {
  describe("A. 기본 등록 (register)", () => {
    test.todo("register() 호출 시 UBRef 반환 (of, uuid)");
    test.todo("등록된 row가 table.rows에 저장");
    test.todo("여러 번 register() 시 rows 누적");
    test.todo("JSON 객체 자동 직렬화");
  });

  describe("B. Table 관리", () => {
    test.todo("getTable() - 테이블 생성 및 조회");
    test.todo("hasTable() - 테이블 존재 여부");
  });

  describe("C. Unique Index & UUID 재사용", () => {
    test.todo("같은 unique 값 등록 시 동일한 uuid 반환");
    test.todo("다른 unique 값 등록 시 다른 uuid 반환");
    test.todo("Composite unique index (복합 유니크 키) 처리");
  });

  describe("D. UBRef 참조 처리", () => {
    test.todo("UBRef를 필드 값으로 등록");
    test.todo("isRefField() 함수 검증");
    test.todo("UBRef의 use 필드 기본값 'id' 확인");
    test.todo("references Set에 참조 정보 저장");
  });

  describe("E. Upsert 실행", () => {
    test.todo("upsert() - 새 row 삽입 후 ID 배열 반환");
    test.todo("upsert() - 기존 row 업데이트 (ON DUPLICATE KEY)");
    test.todo("insertOnly() - 삽입만 수행");
    test.todo("참조 해결 (UBRef → 실제 ID로 치환)");
    test.todo("참조 해결 순서 (부모 테이블 먼저 upsert)");
    test.todo("upsert 후 참조하는 테이블의 UBRef 치환");
  });

  describe("F. UpdateBatch", () => {
    test.todo("updateBatch() - 기존 row들 일괄 업데이트");
    test.todo("where 조건 설정 (기본값 'id')");
    test.todo("updateBatch 후 데이터 초기화 확인");
  });

  describe("G. 에러 처리", () => {
    test.todo("존재하지 않는 테이블에 upsert 시도");
    test.todo("rows가 비어있는 테이블에 upsert 시도");
    test.todo("해결되지 않은 참조가 있을 때 에러");
  });

  describe("H. 복합 시나리오", () => {
    test.todo("다중 테이블 동시 등록 및 upsert");
    test.todo("복잡한 참조 관계 (A → B → C)");
    test.todo("unique index + 참조 조합");
  });
});

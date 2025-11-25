import { describe, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);
describe("Puri Wrapper", () => {
  describe("A. PuriWrapper 기본 기능", () => {
    test.todo("from() - 테이블로 시작");
    test.todo("from() - 테이블+Alias로 시작");
    test.todo("from() - 서브쿼리로 시작");
    test.todo("table() - from()과 동일 동작 확인");
    test.todo("raw() - Raw SQL 실행");
  });

  describe("B. 트랜잭션", () => {
    test.todo("transaction() - 기본 트랜잭션");
    test.todo("트랜잭션 commit 확인");
    test.todo("트랜잭션 rollback 확인");
    test.todo("중첩 트랜잭션 (SAVEPOINT)");
    test.todo("Isolation Level 설정");
    test.todo("readOnly 옵션 설정");
    test.todo("dbPreset 옵션 설정");
    test.todo("에러 발생 시 자동 rollback");
    test.todo("AsyncLocalStorage 컨텍스트 재사용");
  });

  describe("C. UpsertBuilder 통합", () => {
    test.todo("ubRegister() - 행 등록 후 ref 반환");
    test.todo("ubUpsert() - Upsert 실행 및 ID 반환");
    test.todo("ubInsertOnly() - Insert만 수행");
    test.todo("ubUpsertOrInsert() - mode 파라미터로 분기");
    test.todo("ubUpdateBatch() - 일괄 업데이트");
    test.todo("트랜잭션 내에서 UpsertBuilder 사용");
  });

  describe("D. PuriTransactionWrapper", () => {
    test.todo("PuriWrapper 상속 확인");
    test.todo("rollback() 메서드");
    test.todo("commit() 메서드");
  });
});

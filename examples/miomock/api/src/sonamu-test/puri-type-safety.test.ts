import { describe, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);
describe("Puri Type Safety", () => {
  describe("A. 존재하지 않는 컬럼/테이블", () => {
    test.todo("select - 존재하지 않는 컬럼 (SQL 에러 또는 undefined)");
    test.todo("where - 존재하지 않는 컬럼 (매칭 안됨)");
    test.todo("from - 존재하지 않는 테이블 (SQL 에러)");
  });

  describe("B. 타입 불일치", () => {
    test.todo("number 컬럼에 string 값 where (매칭 안됨)");
    test.todo("string 컬럼에 number 값 where (자동 형변환)");
    test.todo("enum에 잘못된 값 (매칭 안됨)");
  });

  describe("C. JOIN 후 컬럼 경로 오류", () => {
    test.todo("join 전 컬럼을 join 후 사용 (undefined - prefix 필요)");
    test.todo("alias 없이 중복 컬럼명 (나중 값으로 덮어씀)");
    test.todo("join 안한 테이블 컬럼 참조 (SQL 에러)");
  });

  describe("D. NULL 처리 불일치", () => {
    test.todo("nullable 컬럼에 NOT NULL 가정 (런타임 에러)");
    test.todo("where(col, null) vs whereNull (동일 결과)");
  });

  describe("E. 타입 추론 검증", () => {
    test.todo("select 후 TResult 타입 정확도");
    test.todo("SQL 함수 반환 타입 (count → number)");
    test.todo("join 후 TTables 타입 확장");
    test.todo("alias 컬럼 타입 추론");
    test.todo("appendSelect로 타입 확장");
    test.todo("pluck 반환 타입 (배열)");
    test.todo("first 반환 타입 (단일 객체 | undefined)");
  });

  describe("F. ETC", () => {
    test.todo("as any로 타입 체크 우회 시 런타임 에러");
    test.todo("LEFT JOIN 후 오른쪽 테이블 컬럼 nullable");
    test.todo("DB 스키마 변경 후 타입 미반영 (런타임 불일치)");
  });
});

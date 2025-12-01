import { Naite, UpsertBuilder } from "sonamu";
import { describe, expect, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";
import { expectUB } from "../testing/expect-ub";

bootstrap(vi);

describe("Upsert Builder", () => {
  describe("A. 기본 등록 (register)", () => {
    test("register() 호출 시 UBRef 반환 및 내부 저장 확인", async () => {
      const ub = new UpsertBuilder();

      const ref = ub.register("users", {
        email: "test@test.com",
        username: "테스트",
        password: "pw",
        role: "normal",
      });

      // [expect] 반환값 UBRef 구조
      expect(ref).toHaveProperty("of", "users");
      expect(ref).toHaveProperty("uuid");
      expect(ref.uuid).toHaveLength(36); // 표준 UUID 길이 = 36자

      // [expectUB] 내부 테이블(tables.rows)에 저장
      expectUB(ub, "hasTable", "users").toBe(true);
      expectUB(ub, "rowCount", "users").toBe(1);
      expectUB(ub, "row", "users", 0).toMatchObject({
        email: "test@test.com",
        username: "테스트",
        password: "pw",
        role: "normal",
      });

      // [Naite] 등록 정보 및 UUID 재사용 여부
      const trace = Naite.get("puri:ub-register").first();
      expect(trace).toMatchObject({
        tableName: "users",
        uuid: ref.uuid,
        isUuidReused: false, // 새로 생성된 UUID
      });
    });

    test("여러 번 register() 시 rows 누적", async () => {
      const ub = new UpsertBuilder();

      // 첫 번째 등록
      const ref1 = ub.register("users", {
        email: "user1@test.com",
        username: "유저1",
        password: "pw1",
        role: "normal",
      });

      // 두 번째 등록
      const ref2 = ub.register("users", {
        email: "user2@test.com",
        username: "유저2",
        password: "pw2",
        role: "admin",
      });

      // [expect] 각각 다른 UUID 반환
      expect(ref1.uuid).not.toBe(ref2.uuid);

      // [expectUB] rows가 2개로 누적됨
      expectUB(ub, "rowCount", "users").toBe(2);
      expectUB(ub, "rows", "users").toMatchObject([
        { email: "user1@test.com", username: "유저1" },
        { email: "user2@test.com", username: "유저2" },
      ]);

      // [Naite] 2번의 register 추적
      const traces = Naite.get("puri:ub-register").result();
      expect(traces).toHaveLength(2);
      expect(traces[0].uuid).toBe(ref1.uuid);
      expect(traces[1].uuid).toBe(ref2.uuid);
    });

    test("register() 시 객체/배열 필드 JSON 문자열 변환 / null은 유지", async () => {
      const ub = new UpsertBuilder();

      const imageUrls = ["https://example.com/1.png", "https://example.com/2.png"];

      // 배열 → JSON 문자열
      ub.register("projects", {
        name: "테스트 프로젝트",
        status: "planning",
        image_urls: imageUrls,
      });

      // [expectUB] 배열이 JSON 문자열로 변환됨
      expectUB(ub, "row", "projects", 0).toMatchObject({
        name: "테스트 프로젝트",
        image_urls: JSON.stringify(imageUrls),
      });

      // null 값 등록
      ub.register("projects", {
        name: "널 테스트",
        status: "planning",
        image_urls: null,
      });

      // [expectUB] null은 변환 없이 그대로 저장
      expectUB(ub, "row", "projects", 1).toMatchObject({
        image_urls: null,
      });
    });
  });

  describe("B. 테이블 관리 (getTable/hasTable)", () => {
    test.todo("getTable() - 테이블 생성 및 조회");
    test.todo("getTable() - EntityManager에서 uniqueIndexes 로드");
    test.todo("hasTable() - 테이블 존재 여부");
  });

  describe("C. UUID 재사용 (uniqueIndex)", () => {
    test.todo("같은 unique 값 등록 시 동일한 uuid 반환 (isUuidReused: true)");
    test.todo("다른 unique 값 등록 시 다른 uuid 반환 (isUuidReused: false)");
    test.todo("Composite unique index (복합 유니크 키) 처리");
    test.todo("unique 인덱스 없는 테이블은 매번 새 uuid 생성");
  });

  describe("D. 참조 처리 (UBRef)", () => {
    test.todo("UBRef를 필드 값으로 등록");
    test.todo("isRefField() 함수 검증");
    test.todo("UBRef의 use 필드 기본값 'id' 확인");
    test.todo("UBRef의 use 필드 커스텀 값 (예: 'uuid')");
    test.todo("references Set에 참조 정보 저장");
  });

  describe("E. Upsert 실행 (upsert/insertOnly)", () => {
    test.todo("upsert() - 새 row 삽입 후 ID 배열 반환");
    test.todo("upsert() - 기존 row 업데이트 (ON DUPLICATE KEY)");
    test.todo("insertOnly() - 삽입만 수행");
    test.todo("참조 해결 (UBRef → 실제 ID로 치환)");
    test.todo("참조 해결 순서 (부모 테이블 먼저 upsert)");
    test.todo("upsert 후 참조하는 테이블의 UBRef 치환 확인");
    test.todo("자기 참조 (self-reference) 처리");
    test.todo("청크 단위 처리 (chunkSize 옵션)");
  });

  describe("F. 일괄 업데이트 (updateBatch)", () => {
    test.todo("updateBatch() - 기존 row들 일괄 업데이트");
    test.todo("where 조건 설정 (기본값 'id')");
    test.todo("복합 키로 매칭 (where: ['user_id', 'employee_number'])");
    test.todo("부분 업데이트 (일부 필드만 변경)");
    test.todo("updateBatch 후 데이터 초기화 확인");
  });

  describe("G. 에러 처리", () => {
    test.todo("존재하지 않는 테이블에 upsert → 빈 배열 반환");
    test.todo("rows가 비어있는 테이블에 upsert → 에러");
    test.todo("해결되지 않은 참조가 있을 때 → 에러");
    test.todo("존재하지 않는 uuid 참조 시 → 에러");
  });

  describe("H. 복합 시나리오", () => {
    test.todo("다중 테이블 참조 관계 (Company → Department → User → Employee)");
    test.todo("ManyToMany 관계 (Project ↔ Employee via 조인 테이블)");
    test.todo("대량 데이터 일괄 등록 (Bulk Insert with UBRef)");
    test.todo("upsert + updateBatch 조합 사용");
  });
});

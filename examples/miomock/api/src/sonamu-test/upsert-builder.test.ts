import { DB, isRefField, Naite, Sonamu, UpsertBuilder } from "sonamu";
import { type SonamuFile, type UBRef } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

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

    test("register() 시 객체는 JSON 문자열 변환, 배열은 원본 유지/null은 유지", async () => {
      const ub = new UpsertBuilder();

      const imageFiles: SonamuFile[] = [
        {
          name: "image1.png",
          url: "https://example.com/1.png",
          mime_type: "image/png",
          size: 1024,
        },
        {
          name: "image2.png",
          url: "https://example.com/2.png",
          mime_type: "image/png",
          size: 2048,
        },
      ];

      // 배열 → 원본 유지
      ub.register("projects", {
        name: "테스트 프로젝트",
        status: "planning",
        image_urls: imageFiles,
      });

      // [expectUB] JSON 컬럼이므로 문자열로 변환되어 저장됨
      expectUB(ub, "row", "projects", 0).toMatchObject({
        name: "테스트 프로젝트",
        status: "planning",
        image_urls: JSON.stringify(imageFiles),
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
    test("getTable()/hasTable() - 기본 동작", async () => {
      const ub = new UpsertBuilder();

      // 초기 상태 - 테이블이 없음
      expectUB(ub, "hasTable", "users").toBe(false);
      expectUB(ub, "hasTable", "projects").toBe(false);
      expectUB(ub, "tables").toEqual([]);

      // getTable 호출하여 테이블 생성
      const table1 = ub.getTable("users");

      // [expect] 테이블 데이터 구조 검증
      expect(table1).toHaveProperty("references");
      expect(table1).toHaveProperty("rows");
      expect(table1).toHaveProperty("uniqueIndexes");
      expect(table1).toHaveProperty("uniquesMap");

      expect(table1.references).toBeInstanceOf(Set);
      expect(table1.rows).toEqual([]);
      expect(table1.uniquesMap).toBeInstanceOf(Map);

      // [expectUB] 테이블이 생성되어 저장됨
      expectUB(ub, "hasTable", "users").toBe(true);
      expectUB(ub, "hasTable", "projects").toBe(false);
      expectUB(ub, "tables").toEqual(["users"]);

      // 재조회 시 동일한 테이블 객체 반환
      const table2 = ub.getTable("users");
      expect(table2).toBe(table1); // 같은 참조

      // EntityManager 없는 경우 배열로 초기화됨
      expectUB(ub, "uniqueIndexes", "users").toBeInstanceOf(Array);
    });

    test("getTable() - EntityManager에서 uniqueIndexes 로드", async () => {
      // EntityManager 직접 로드
      Sonamu.isInitialized = false;
      await Sonamu.init(true, false, undefined, false);

      const ub = new UpsertBuilder();
      ub.getTable("users");

      // [expect] users 테이블의 email 유니크 인덱스 확인
      expectUB(ub, "uniqueIndexes", "users").toMatchObject([
        {
          columns: [{ name: "email" }],
          type: "unique",
        },
      ]);
    });
  });

  describe("C. UUID 재사용 (uniqueIndex)", () => {
    // EntityManager 직접 로드
    beforeAll(async () => {
      Sonamu.isInitialized = false;
      await Sonamu.init(true, false, undefined, false);
    });

    test("같은 unique 값 등록 시 동일한 uuid 반환", async () => {
      const ub = new UpsertBuilder();

      // 첫 번째 등록
      const ref1 = ub.register("users", {
        email: "test@test.com",
        username: "유저1",
        password: "pw1",
        role: "normal",
      });

      // 두 번째 등록 - 같은 email, 다른 username
      const ref2 = ub.register("users", {
        email: "test@test.com",
        username: "유저2",
        password: "pw2",
        role: "admin",
      });

      // [expect] 동일한 uuid 반환
      expect(ref1.uuid).toBe(ref2.uuid);

      // [expect] rows도 모두 동일한 uuid
      const rows = ub.getTable("users").rows;
      expect(rows[0]?.uuid).toBe(rows[1]?.uuid);
      expect(rows[0]?.uuid).toBe(ref1.uuid);

      // [expectUB] rows는 2개 등록됨
      expectUB(ub, "rowCount", "users").toBe(2);

      // [Naite] 첫 번째는 새 UUID, 두 번째는 재사용
      const traces = Naite.get("puri:ub-register").result();
      expect(traces).toHaveLength(2);

      expect(traces[0]).toMatchObject({
        tableName: "users",
        uuid: ref1.uuid,
        isUuidReused: false, // 새로 생성
      });

      expect(traces[1]).toMatchObject({
        tableName: "users",
        uuid: ref2.uuid,
        isUuidReused: true, // 재사용
      });

      // uniquesMap - 1개의 unique 키 매핑
      const uniquesMap = ub.getTable("users").uniquesMap;
      expect(uniquesMap.size).toBe(1);
      expect(uniquesMap.get("test@test.com")).toBe(ref1.uuid);
    });

    test("다른 unique 값 등록 시 다른 uuid 반환", async () => {
      const ub = new UpsertBuilder();

      // 첫 번째 등록
      const ref1 = ub.register("users", {
        email: "user1@test.com",
        username: "유저1",
        password: "pw1",
        role: "normal",
      });

      // 두 번째 등록 - 다른 email
      const ref2 = ub.register("users", {
        email: "user2@test.com",
        username: "유저2",
        password: "pw2",
        role: "admin",
      });

      // [expect] 다른 uuid 반환
      expect(ref1.uuid).not.toBe(ref2.uuid);

      // [expectUB] rows는 2개, 각각 다른 uuid
      expectUB(ub, "rowCount", "users").toBe(2);
      const rows = ub.getTable("users").rows;
      expect(rows[0]?.uuid).not.toBe(rows[1]?.uuid);

      // [Naite] 둘 다 새로 생성
      const traces = Naite.get("puri:ub-register").result();
      expect(traces).toHaveLength(2);

      expect(traces[0]).toMatchObject({
        tableName: "users",
        uuid: ref1.uuid,
        isUuidReused: false, // 새로 생성
      });

      expect(traces[1]).toMatchObject({
        tableName: "users",
        uuid: ref2.uuid,
        isUuidReused: false, // 새로 생성
      });

      // uniquesMap - 2개의 unique 키 매핑
      const uniquesMap = ub.getTable("users").uniquesMap;
      expect(uniquesMap.size).toBe(2);
      expect(uniquesMap.get("user1@test.com")).toBe(ref1.uuid);
      expect(uniquesMap.get("user2@test.com")).toBe(ref2.uuid);
    });

    test("복합 유니크 키 처리", async () => {
      const ub = new UpsertBuilder();

      // 첫 번째 등록 - user_id: 1, employee_number: "EMP001"
      const ref1 = ub.register("employees", {
        user_id: 1,
        employee_number: "EMP001",
        salary: 50000,
      });

      // 두 번째 등록 - 첫 번째와 같은 조합
      const ref2 = ub.register("employees", {
        user_id: 1,
        employee_number: "EMP001",
        salary: 60000,
      });

      // 세 번째 등록 - user_id만 같음
      const ref3 = ub.register("employees", {
        user_id: 1,
        employee_number: "EMP002",
        salary: 55000,
      });

      // 네 번째 등록 - employee_number만 같음
      const ref4 = ub.register("employees", {
        user_id: 2,
        employee_number: "EMP001",
        salary: 52000,
      });

      // [expect] ref의 uuid 검증
      expect(ref1.uuid).toBe(ref2.uuid);
      expect(ref1.uuid).not.toBe(ref3.uuid);
      expect(ref1.uuid).not.toBe(ref4.uuid);
      expect(ref3.uuid).not.toBe(ref4.uuid);

      // uniquesMap - 3개의 복합 키 매핑 확인
      const uniquesMap = ub.getTable("employees").uniquesMap;
      expect(uniquesMap.size).toBe(3);

      // 복합 키 "---delimiter--"로 조인됨
      expect(uniquesMap.get("1---delimiter--EMP001")).toBe(ref1.uuid);
      expect(uniquesMap.get("1---delimiter--EMP002")).toBe(ref3.uuid);
      expect(uniquesMap.get("2---delimiter--EMP001")).toBe(ref4.uuid);
    });

    test("unique 인덱스 없는 테이블 매번 새 uuid 생성", async () => {
      const ub = new UpsertBuilder();

      // 같은 name으로 3번 등록 - tags 테이블은 uuid 외에 unique 인덱스가 없음
      const [ref1, ref2, ref3] = Array.from({ length: 3 }, () =>
        ub.register("tags", { name: "백엔드" }),
      );

      // [expect] 모두 다른 uuid 생성
      expect(ref1?.uuid).not.toBe(ref2?.uuid);
      expect(ref1?.uuid).not.toBe(ref3?.uuid);
      expect(ref2?.uuid).not.toBe(ref3?.uuid);

      // [Naite] 모두 새로 생성 (isUuidReused: false)
      const traces = Naite.get("puri:ub-register").result();
      expect(traces).toHaveLength(3);
      expect(traces.every((t) => t.isUuidReused === false)).toBe(true);

      // uniquesMap - unique 인덱스가 없으므로 비어있음
      const uniquesMap = ub.getTable("tags").uniquesMap;
      expect(uniquesMap.size).toBe(0);
    });
  });

  describe("D. 참조 처리 (UBRef)", () => {
    test("UBRef를 필드 값으로 등록 (use 필드 기본값 'id')", async () => {
      const ub = new UpsertBuilder();

      // 부모 테이블(users) 등록 → UBRef 반환
      const userRef = ub.register("users", {
        email: "test@test.com",
        username: "테스트유저",
        password: "pw",
        role: "normal",
      });

      // [expect] UBRef 구조 확인
      expect(userRef).toHaveProperty("of", "users");
      expect(userRef).toHaveProperty("uuid");
      expect(userRef.uuid).toHaveLength(36);
      expect(userRef).not.toHaveProperty("use");

      // 자식 테이블(employees) 등록 → UBRef를 필드 값으로 사용
      ub.register("employees", { user_id: userRef, employee_number: "EMP001" });

      // [expect] employees.rows에 UBRef가 그대로 저장되고, use: "id" 자동 설정됨
      const empTable = ub.getTable("employees");
      expect(empTable.rows).toHaveLength(1);

      const empRow = empTable.rows[0];
      expect(empRow).toBeDefined();
      expect(isRefField(empRow!.user_id)).toBe(true);
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      expect((empRow!.user_id as UBRef).of).toBe("users");
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      expect((empRow!.user_id as UBRef).uuid).toBe(userRef.uuid);
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      expect((empRow!.user_id as UBRef).use).toBe("id");

      // [expect] references에 참조 정보 저장됨
      expect(empTable.references).toEqual(new Set(["users.id"]));

      // [Naite] UBRef 등록 추적
      const traces = Naite.get("puri:ub-register").result();
      expect(traces).toHaveLength(2);
      expect(traces[1].row.user_id).toMatchObject({
        of: "users",
        uuid: userRef.uuid,
        use: "id", //← 기본값
      });
    });

    test("UBRef의 use 필드 커스텀 값", async () => {
      const ub = new UpsertBuilder();

      // users 테이블 등록
      const userRef = ub.register("users", {
        email: "test@test.com",
        username: "테스트",
        password: "pw",
        role: "normal",
      });

      // [expect] userRef에는 use 필드 없음
      expect(userRef).not.toHaveProperty("use");

      // use: "custom-value"로 지정
      ub.register("employees", {
        user_id: { ...userRef, use: "custome-value" }, // ← 커스텀 use 값
        employee_number: "EMP001",
      });

      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      // [expect] rows에 use: "custome-value" 유지됨
      const empRow = ub.getTable("employees").rows[0];
      expect(empRow).toBeDefined();
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      expect((empRow!.user_id as UBRef).use).toBe("custome-value");

      // [expect] references에 "users.custome-value"로 저장됨
      const empTable = ub.getTable("employees");
      expect(empTable.references).toEqual(new Set(["users.custome-value"]));

      // [Naite] 추적 기록에서도 use: "custome-value" 확인
      const traces = Naite.get("puri:ub-register").result();
      expect(traces[1].row.user_id).toMatchObject({
        of: "users",
        uuid: userRef.uuid,
        use: "custome-value", // ← 커스텀 use 값
      });
    });

    test("isRefField() 함수 검증", async () => {
      const ub = new UpsertBuilder();

      const userRef = ub.register("users", {
        email: "test@test.com",
        username: "테스트",
        password: "pw",
        role: "normal",
      });

      // [expect] UBRef 객체는 true 반환
      expect(isRefField(userRef)).toBe(true);
      expect(isRefField({ of: "users", uuid: "test-uuid" })).toBe(true);

      // [expect] 일반 값들은 false 반환
      expect(isRefField(null)).toBe(false);
      expect(isRefField(undefined)).toBe(false);
      expect(isRefField(123)).toBe(false);
      expect(isRefField("string")).toBe(false);
      expect(isRefField(true)).toBe(false);
      expect(isRefField([])).toBe(false);

      // [expect] of나 uuid가 없는 객체는 false 반환
      expect(isRefField({})).toBe(false);
      expect(isRefField({ of: "users" })).toBe(false);
      expect(isRefField({ uuid: "test-uuid" })).toBe(false);
      expect(isRefField({ name: "test", value: 123 })).toBe(false);

      // [expect] use 필드는 선택사항 (없어도 UBRef)
      expect(isRefField({ of: "users", uuid: "test", use: "id" })).toBe(true);
      expect(isRefField({ of: "users", uuid: "test" })).toBe(true);
    });
  });

  describe("E. Upsert 실행 (upsert/insertOnly)", () => {
    // PostgreSQL은 ON CONFLICT (columns)에 명시적인 컬럼 지정이 필요 - EntityManager 직접 로드
    beforeAll(async () => {
      Sonamu.isInitialized = false;
      await Sonamu.init(true, false, undefined, false);
    });
    test("upsert() - 새 row 삽입 후 ID 배열 반환", async () => {
      const ub = new UpsertBuilder();

      const userData = [
        { email: "user1@test.com", username: "유저1", password: "pw1", role: "normal" },
        { email: "user2@test.com", username: "유저2", password: "pw2", role: "admin" },
        { email: "user3@test.com", username: "유저3", password: "pw3", role: "normal" },
      ];

      // 3개의 user register
      for (const data of userData) {
        ub.register("users", data);
      }

      // [expectUB] upsert 전 상태 확인
      expectUB(ub, "rowCount", "users").toBe(3);

      // DB에 upsert
      const wdb = DB.getDB("w");
      const ids = await ub.upsert(wdb, "users");

      // [expect] ID 배열 반환
      expect(ids).toBeInstanceOf(Array);
      expect(ids).toHaveLength(3);
      expect(ids).toEqual(ids.map(() => expect.any(String)));

      // [expect] DB 검증: 실제로 DB에 삽입되었는지 확인
      const insertedUsers = await wdb("users")
        .select("id", "email", "username")
        .whereIn("id", ids)
        .orderBy("email");

      expect(insertedUsers).toHaveLength(3);
      expect(insertedUsers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: "user1@test.com", username: "유저1" }),
          expect.objectContaining({ email: "user2@test.com", username: "유저2" }),
          expect.objectContaining({ email: "user3@test.com", username: "유저3" }),
        ]),
      );

      // [expectUB] upsert 후 rows 초기화, 테이블 구조는 유지
      expectUB(ub, "rowCount", "users").toBe(0);
      expectUB(ub, "hasTable", "users").toBe(true);

      // [Naite] upsert 추적
      const trace = Naite.get("puri:ub-upserted").first();
      expect(trace).toMatchObject({
        tableName: "users",
        mode: "upsert",
        rowCount: 3,
        returnedIds: ids,
      });
    });

    test("upsert() - 기존 row 업데이트", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 첫 번째 upsert - 새로운 user 삽입
      ub.register("users", {
        email: "test@test.com",
        username: "원본이름",
        password: "pw1",
        role: "normal",
      });

      const [firstId] = await ub.upsert(wdb, "users");

      // [expect] DB 검증: 원본 데이터 확인
      const originalUser = await wdb("users").select("*").where({ id: firstId }).first();
      expect(originalUser).toMatchObject({
        email: "test@test.com",
        username: "원본이름",
        role: "normal",
      });

      // 두 번째 upsert - 같은 email(unique), 다른 데이터
      ub.register("users", {
        email: "test@test.com",
        username: "업데이트된이름",
        password: "pw2",
        role: "admin",
      });

      const [secondId] = await ub.upsert(wdb, "users");

      // [expect] 같은 ID 반환
      expect(secondId).toBe(firstId);

      // [expect] DB 검증: 데이터가 업데이트되었는지 확인
      const updatedUser = await wdb("users").select("*").where({ id: firstId }).first();
      expect(updatedUser).toMatchObject({
        id: firstId,
        email: "test@test.com",
        username: "업데이트된이름",
        role: "admin",
      });

      // [expect] DB 검증: users 테이블에 1개만 존재 (중복 없음)
      const users = await wdb("users").where({ email: "test@test.com" });
      expect(users).toHaveLength(1);

      // [Naite] 두 번째 upsert 추적
      const traces = Naite.get("puri:ub-upserted").result();
      expect(traces).toHaveLength(2);
      expect(traces[1]).toMatchObject({
        tableName: "users",
        mode: "upsert",
        rowCount: 1,
      });
    });

    test("insertOnly() - 삽입만 수행", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      // 3개의 user 등록
      [
        {
          email: `insert1-${timestamp}@test.com`,
          username: "유저1",
          password: "pw1",
          role: "normal",
        },
        {
          email: `insert2-${timestamp}@test.com`,
          username: "유저2",
          password: "pw2",
          role: "admin",
        },
        {
          email: `insert3-${timestamp}@test.com`,
          username: "유저3",
          password: "pw3",
          role: "normal",
        },
      ].forEach((data) => {
        ub.register("users", data);
      });

      // [expectUB] insertOnly 전 상태
      expectUB(ub, "rowCount", "users").toBe(3);

      // insertOnly - 새로운 데이터는 정상 삽입
      const ids = await ub.insertOnly(wdb, "users");

      // [expect] ID 배열 반환
      expect(ids).toHaveLength(3);
      expect(ids).toEqual(ids.map(() => expect.any(String)));

      // [expect] DB 검증: 실제로 삽입되었는지 확인
      const insertedUsers = await wdb("users").select("id", "email").whereIn("id", ids);
      expect(insertedUsers).toHaveLength(3);

      // [expectUB] insertOnly 후 rows 초기화, 테이블 구조는 유지
      expectUB(ub, "rowCount", "users").toBe(0);
      expectUB(ub, "hasTable", "users").toBe(true);

      // [Naite] insertOnly 확인
      const trace = Naite.get("puri:ub-upserted").first();
      expect(trace).toMatchObject({
        tableName: "users",
        mode: "insert",
        rowCount: 3,
      });

      // 에러 케이스: 같은 email로 다시 등록 시도
      ub.register("users", {
        email: `insert1-${timestamp}@test.com`,
        username: "중복시도",
        password: "pw",
        role: "normal",
      });

      // [expect] insertOnly는 중복 시 DB 에러 발생
      await expect(ub.insertOnly(wdb, "users")).rejects.toThrow(/duplicate/i);
    });

    test("참조 해결 (UBRef → 실제 ID로 치환)", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 부모(companies) 테이블 등록
      const companyRef = ub.register("companies", {
        name: `테스트회사-${Date.now()}`,
      });

      // 자식(departments) 테이블 등록 - company_id FK 참조
      ub.register("departments", { company_id: companyRef, name: `테스트부서-${Date.now()}` });

      // [expectUB] 치환 전: UBRef 그대로 저장
      const deptRowBefore = ub.getTable("departments").rows[0];
      expect(isRefField(deptRowBefore?.company_id)).toBe(true);
      expect(deptRowBefore?.company_id).toMatchObject({ of: "companies", uuid: companyRef.uuid });

      // 부모 → 자식 순서로 upsert
      const [companyId] = await ub.upsert(wdb, "companies");

      // [expectUB] 부모 upsert 후: departments.rows의 UBRef가 실제 ID로 치환됨
      const deptRowAfter = ub.getTable("departments").rows[0];
      expect(isRefField(deptRowAfter?.company_id)).toBe(false);
      expect(deptRowAfter?.company_id).toBe(companyId);

      const [deptId] = await ub.upsert(wdb, "departments");

      // [expect] DB 검증: 치환 후 DB에 실제 ID 저장됨
      const insertedDept = await wdb("departments")
        .select("company_id")
        .where({ id: deptId })
        .first();

      expect(insertedDept?.company_id).toBe(companyId);

      // [Naite] 참조 치환 추적
      const refResolvedTrace = Naite.get("puri:ub-ref-resolved").first();
      expect(refResolvedTrace).toMatchObject({
        tableName: "companies",
        from: { of: "companies", uuid: companyRef.uuid },
        to: companyId,
      });
    });

    test("참조 해결 순서 (부모 테이블 먼저 upsert)", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 부모(companies)와 자식(departments) 모두 register
      const deptName = `부서-ORD-${Date.now()}`;

      const companyRef = ub.register("companies", {
        name: `순서테스트회사-${Date.now()}`,
      });

      ub.register("departments", {
        company_id: companyRef,
        name: deptName,
      });

      // 잘못된 순서: 자식 테이블을 먼저 upsert 시도 → 에러
      await expect(ub.upsert(wdb, "departments")).rejects.toThrow(/해결되지 않은 참조가 있습니다/);

      // [expectUB] upsert 실패 - register한 데이터가 초기화되지 않고 유지됨
      expectUB(ub, "rowCount", "departments").toBe(1);
      expect(isRefField(ub.getTable("departments").rows[0]?.company_id)).toBe(true);

      // 올바른 순서: 부모 테이블 먼저 upsert
      const [companyId] = await ub.upsert(wdb, "companies");
      expect(companyId).toBeGreaterThan(0);

      // [expectUB] companies.rows는 초기화됨
      expectUB(ub, "rowCount", "companies").toBe(0);

      // 이제 자식 테이블 upsert 가능 (참조가 치환되었으므로)
      const [deptId] = await ub.upsert(wdb, "departments");
      expect(deptId).toBeGreaterThan(0);

      // [expect] DB 검증: 정상적으로 참조 관계가 설정되었는지 확인
      const dept = await wdb("departments").select("*").where({ id: deptId }).first();

      expect(dept).toMatchObject({
        id: deptId,
        company_id: companyId, // ← 올바른 참조
        name: deptName,
      });
    });

    test("자기 참조 - 1단계", async () => {
      // console.log를 차단하기 위해 spyOn
      vi.spyOn(console, "log").mockImplementation(() => {});

      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      // company 먼저 생성
      const [result] = await wdb("companies")
        .insert({ name: `테스트회사-${timestamp}`, created_at: new Date(timestamp) })
        .returning("id");

      const companyId = result.id;

      // 1단계 자기 참조: 본사 → 자식 부서들
      const hqRef = ub.register("departments", {
        company_id: companyId,
        name: "본사",
      });

      ub.register("departments", {
        company_id: companyId,
        name: "개발팀",
        parent_id: hqRef, // ← UBRef (자기 참조)
      });

      ub.register("departments", {
        company_id: companyId,
        name: "영업팀",
        parent_id: hqRef, // ← UBRef (자기 참조)
      });

      // [expectUB] 3개 등록됨
      expectUB(ub, "rowCount", "departments").toBe(3);

      // 한 번의 upsert로 자동 재귀 처리
      const ids = await ub.upsert(wdb, "departments");

      // [expect] 3개 모두 반환
      expect(ids).toHaveLength(3);

      // [expect] DB 검증
      const departments = await wdb("departments")
        .select("id", "name", "parent_id")
        .whereIn("id", ids)
        .orderBy("id");

      const hq = departments.find((d) => d.name === "본사");
      expect(hq?.parent_id).toBeNull();

      const dev = departments.find((d) => d.name === "개발팀");
      expect(dev?.parent_id).toBe(hq?.id);

      const sales = departments.find((d) => d.name === "영업팀");
      expect(sales?.parent_id).toBe(hq?.id);

      // [Naite] 단일 upsert 호출 확인
      const traces = Naite.get("puri:ub-upserted").result();
      const deptTraces = traces.filter((t) => t.tableName === "departments");
      expect(deptTraces.length).toBe(1); // 단일 upsert 호출
    });

    test("자기 참조 - 2단계 이상 (한 번의 upsert로 처리)", async () => {
      // console.log를 차단하기 위해 spyOn
      vi.spyOn(console, "log").mockImplementation(() => {});

      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      const [result] = await wdb("companies")
        .insert({ name: `테스트회사-${timestamp}`, created_at: new Date(timestamp) })
        .returning("id");

      const companyId = result.id;

      const hqRef = ub.register("departments", {
        company_id: companyId,
        name: "본사",
      });

      const devRef = ub.register("departments", {
        company_id: companyId,
        name: "개발팀",
        parent_id: hqRef, // Level 1: 본사 참조
      });

      ub.register("departments", {
        company_id: companyId,
        name: "프론트엔드팀",
        parent_id: devRef, // Level 2: 개발팀 참조
      });

      // [expectUB] 3개 등록됨
      expectUB(ub, "rowCount", "departments").toBe(3);

      // 한 번의 upsert 호출로 3단계 모두 처리
      const ids = await ub.upsert(wdb, "departments");

      // [expect] 모든 ID 반환
      expect(ids).toHaveLength(3);
      const [hqId, devId, frontendId] = ids;

      // [expect] 3단계 계층 구조 확인
      const hq = await wdb("departments").where({ id: hqId }).first();
      const dev = await wdb("departments").where({ id: devId }).first();
      const frontend = await wdb("departments").where({ id: frontendId }).first();

      expect(hq?.parent_id).toBeNull();
      expect(dev?.parent_id).toBe(hqId);
      expect(frontend?.parent_id).toBe(devId);

      // [expect] JOIN으로 전체 계층 검증
      const hierarchy = await wdb("departments as d1")
        .leftJoin("departments as d2", "d1.parent_id", "d2.id")
        .leftJoin("departments as d3", "d2.parent_id", "d3.id")
        .select("d1.name as child", "d2.name as parent", "d3.name as grandparent")
        .where({ "d1.id": frontendId })
        .first();

      expect(hierarchy).toMatchObject({
        child: "프론트엔드팀",
        parent: "개발팀",
        grandparent: "본사",
      });

      // [Naite] 단일 upsert 호출 확인
      const traces = Naite.get("puri:ub-upserted").result();
      const deptTraces = traces.filter((t) => t.tableName === "departments");
      expect(deptTraces).toHaveLength(1); // 한 번의 upsert 호출
      expect(deptTraces[0]).toMatchObject({
        tableName: "departments",
        mode: "upsert",
        rowCount: 3,
      });
    });

    // 트리 구조:
    //        본사 (L0)
    //       /       \
    //   개발팀(L1)  영업팀(L1)
    //    /    \
    // FE(L2)  BE(L2)
    test("자기 참조 - 트리 구조", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      const [result] = await wdb("companies")
        .insert({ name: `테스트회사-${timestamp}`, created_at: new Date(timestamp) })
        .returning("id");

      const companyId = result.id;

      const 본사Ref = ub.register("departments", {
        company_id: companyId,
        name: "본사",
      });

      const 개발팀Ref = ub.register("departments", {
        company_id: companyId,
        name: "개발팀",
        parent_id: 본사Ref,
      });

      ub.register("departments", { company_id: companyId, name: "영업팀", parent_id: 본사Ref });
      ub.register("departments", { company_id: companyId, name: "FE팀", parent_id: 개발팀Ref });
      ub.register("departments", { company_id: companyId, name: "BE팀", parent_id: 개발팀Ref });

      const ids = await ub.upsert(wdb, "departments");
      expect(ids).toHaveLength(5);

      // 계층 구조 검증 - 반환된 id로 조회
      const departments = await wdb("departments")
        .select("id", "name", "parent_id")
        .whereIn("id", ids);

      const 본사 = departments.find((d) => d.name === "본사");
      const 개발팀 = departments.find((d) => d.name === "개발팀");
      const 영업팀 = departments.find((d) => d.name === "영업팀");
      const FE팀 = departments.find((d) => d.name === "FE팀");
      const BE팀 = departments.find((d) => d.name === "BE팀");

      expect(본사.parent_id).toBeNull();
      expect(개발팀.parent_id).toBe(본사.id);
      expect(영업팀.parent_id).toBe(본사.id);
      expect(FE팀.parent_id).toBe(개발팀.id);
      expect(BE팀.parent_id).toBe(개발팀.id);
    });

    test("청크 단위 처리", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 10개의 user 등록
      const userCount = 10;
      for (let i = 1; i <= userCount; i++) {
        ub.register("users", {
          email: `chunk${String(i).padStart(2, "0")}@test.com`,
          username: `청크유저${i}`,
          password: `pw${i}`,
          role: "normal",
        });
      }

      // [expectUB] upsert 전 상태
      expectUB(ub, "rowCount", "users").toBe(userCount);

      // chunkSize: 3으로 설정하여 upsert (10개를 3개씩 나눠서 처리: 3, 3, 3, 1)
      const ids = await ub.upsert(wdb, "users", { chunkSize: 3 });

      // [expect] 모든 ID 반환
      expect(ids).toHaveLength(userCount);
      expect(ids).toEqual(ids.map(() => expect.any(String)));

      // [expect] DB 검증: 10개 모두 삽입되었는지 확인
      const insertedUsers = await wdb("users")
        .select("id", "email", "username")
        .whereIn("id", ids)
        .orderBy("email");

      expect(insertedUsers).toHaveLength(userCount);
      expect(insertedUsers[0]).toMatchObject({
        email: "chunk01@test.com",
        username: "청크유저1",
      });
      expect(insertedUsers[9]).toMatchObject({
        email: "chunk10@test.com",
        username: "청크유저10",
      });

      // [expectUB] upsert 후 rows 초기화
      expectUB(ub, "rowCount", "users").toBe(0);

      // [Naite] 한 번의 upsert 호출
      const trace = Naite.get("puri:ub-upserted").first();
      expect(trace).toMatchObject({
        tableName: "users",
        mode: "upsert",
        rowCount: userCount,
        returnedIds: ids,
      });
    });
  });

  describe("F. 일괄 업데이트 (updateBatch)", () => {
    test("updateBatch() - 기존 row들 일괄 업데이트 (기본 where: 'id')", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 1단계: 먼저 users 3개 생성
      const initialUsers = [
        {
          email: "update1@test.com",
          username: "원본1 안에 ?? 물음표가 들어있음",
          password: "pw1",
          role: "normal",
        },
        { email: "update2@test.com", username: "원본2", password: "pw2", role: "normal" },
        { email: "update3@test.com", username: "원본3", password: "pw3", role: "normal" },
      ];

      for (const user of initialUsers) {
        ub.register("users", user);
      }

      const ids = await ub.upsert(wdb, "users");
      const sortedIds = [...ids].toSorted((a, b) => a.localeCompare(b));

      // [expect] 3개 ID 생성됨
      expect(ids).toHaveLength(3);

      // [expect] DB에 원본 데이터 저장됨
      const originalUsers = await wdb("users")
        .select("id", "username", "role")
        .whereIn("id", ids)
        .orderBy("id");

      expect(originalUsers).toMatchObject([
        { username: "원본1 안에 ?? 물음표가 들어있음", role: "normal" },
        { username: "원본2", role: "normal" },
        { username: "원본3", role: "normal" },
      ]);

      // 2단계: 동일한 ID로 수정할 데이터 register
      sortedIds.forEach((id, index) => {
        ub.register("users", {
          id,
          username: `수정됨${index + 1}`,
          role: "admin",
        });
      });

      // [expectUB] updateBatch 전 상태
      expectUB(ub, "rowCount", "users").toBe(3);

      // 3단계: updateBatch 실행
      await ub.updateBatch(wdb, "users");

      // [expectUB] updateBatch 후 데이터 초기화
      expectUB(ub, "rowCount", "users").toBe(0);
      expectUB(ub, "hasTable", "users").toBe(true);
      expect(ub.getTable("users").references.size).toBe(0);
      expect(ub.getTable("users").uniquesMap.size).toBe(0);

      // [expect] DB 검증: 실제로 업데이트되었는지 확인
      const updatedUsers = await wdb("users")
        .select("id", "username", "role")
        .whereIn("id", sortedIds)
        .orderBy("id");

      expect(updatedUsers).toMatchObject([
        { id: sortedIds[0], username: "수정됨1", role: "admin" },
        { id: sortedIds[1], username: "수정됨2", role: "admin" },
        { id: sortedIds[2], username: "수정됨3", role: "admin" },
      ]);

      // [Naite] updateBatch 추적
      const trace = Naite.get("puri:ub-batch-updated").first();
      expect(trace).toMatchObject({
        tableName: "users",
        rowCount: 3,
        whereColumns: ["id"], // where 옵션 미지정 시 기본값 id
      });
    });

    test("updateBatch() - 복합 키로 매칭", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      // fixture에 존재하는 user_id 사용
      const userId = 1;

      // 1단계: employees 3개 생성
      const initialEmployees = [
        { user_id: userId, employee_number: `EMP-BATCH1-${timestamp}`, salary: 50000 },
        { user_id: userId, employee_number: `EMP-BATCH2-${timestamp}`, salary: 60000 },
        { user_id: userId, employee_number: `EMP-BATCH3-${timestamp}`, salary: 70000 },
      ];

      for (const emp of initialEmployees) {
        ub.register("employees", emp);
      }

      // [expect] 3개 생성됨
      const empIds = await ub.upsert(wdb, "employees");
      expect(empIds).toHaveLength(3);

      // [expect] DB에 원본 데이터 저장됨
      const originalEmployees = await wdb("employees")
        .select("user_id", "employee_number", "salary")
        .whereIn("id", empIds)
        .orderBy("employee_number");

      expect(originalEmployees).toHaveLength(3);
      expect(Number(originalEmployees[0]?.salary)).toBe(50000);
      expect(Number(originalEmployees[1]?.salary)).toBe(60000);
      expect(Number(originalEmployees[2]?.salary)).toBe(70000);

      // 3단계: 복합 키(user_id, employee_number)로 수정할 데이터 register
      const employeesToUpdate = [
        { user_id: userId, employee_number: `EMP-BATCH1-${timestamp}`, salary: 55000 },
        { user_id: userId, employee_number: `EMP-BATCH2-${timestamp}`, salary: 65000 },
        { user_id: userId, employee_number: `EMP-BATCH3-${timestamp}`, salary: 75000 },
      ];

      for (const emp of employeesToUpdate) {
        ub.register("employees", emp);
      }

      // [expectUB] updateBatch 전 상태
      expectUB(ub, "rowCount", "employees").toBe(3);

      // 4단계: updateBatch 실행 (복합 키로 매칭)
      await ub.updateBatch(wdb, "employees", {
        where: ["user_id", "employee_number"], // ← 복합 키
      });

      // [expectUB] updateBatch 후 데이터 초기화
      expectUB(ub, "rowCount", "employees").toBe(0);

      // [expect] DB 검증: salary가 업데이트되었는지 확인
      const updatedEmployees = await wdb("employees")
        .select("user_id", "employee_number", "salary")
        .whereIn("id", empIds)
        .orderBy("employee_number");

      expect(updatedEmployees).toHaveLength(3);
      expect(Number(updatedEmployees[0]?.salary)).toBe(55000);
      expect(Number(updatedEmployees[1]?.salary)).toBe(65000);
      expect(Number(updatedEmployees[2]?.salary)).toBe(75000);

      // [Naite] updateBatch 추적
      const trace = Naite.get("puri:ub-batch-updated").first();
      expect(trace).toMatchObject({
        tableName: "employees",
        rowCount: 3,
        whereColumns: ["user_id", "employee_number"], // ← 복합 키
      });
    });

    test("부분 업데이트", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 1단계: 전체 필드로 user 생성
      ub.register("users", {
        email: "partial@test.com",
        username: "원본이름",
        password: "password123",
        role: "normal",
        bio: "원본 자기소개",
      });

      const [userId] = await ub.upsert(wdb, "users");

      // [expect] DB에 전체 데이터 저장됨
      const originalUser = await wdb("users")
        .select("id", "username", "role", "bio")
        .where({ id: userId })
        .first();

      expect(originalUser).toMatchObject({
        username: "원본이름",
        role: "normal",
        bio: "원본 자기소개",
      });

      // 2단계: 일부 필드만 register (username, bio만 변경)
      ub.register("users", {
        id: userId,
        username: "변경된이름",
        bio: "변경된 자기소개",
        // role은 포함 안 함 ← 변경하지 않음!
      });

      // [expectUB] updateBatch 전 상태
      expectUB(ub, "rowCount", "users").toBe(1);

      // 3단계: updateBatch 실행
      await ub.updateBatch(wdb, "users");

      // [expect] DB 검증: 일부 필드만 업데이트됨
      const updatedUser = await wdb("users")
        .select("id", "username", "role", "bio")
        .where({ id: userId })
        .first();

      expect(updatedUser).toMatchObject({
        id: userId,
        username: "변경된이름",
        role: "normal",
        bio: "변경된 자기소개",
      });

      // [expectUB] updateBatch 후 데이터 초기화
      expectUB(ub, "rowCount", "users").toBe(0);

      // [Naite] updateBatch 추적
      const trace = Naite.get("puri:ub-batch-updated").first();
      expect(trace).toMatchObject({
        tableName: "users",
        rowCount: 1,
        whereColumns: ["id"],
      });
    });
  });

  describe("G. cleanOrphans 옵션", () => {
    beforeAll(async () => {
      Sonamu.isInitialized = false;
      await Sonamu.init(true, false, undefined, false);
    });

    test("cleanOrphans 적용 X - 레코드 유지", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 1단계: user 생성
      ub.register("users", {
        email: `no-clean-${Date.now()}@test.com`,
        username: "NoClean User",
        password: "pw",
        role: "normal",
      });
      const [userId] = await ub.upsert(wdb, "users");

      // 2단계: employees 3개 생성
      const timestamp = Date.now();
      for (let i = 1; i <= 3; i++) {
        ub.register("employees", {
          user_id: userId,
          employee_number: `EMP-NOCLEAN-${timestamp}-${i}`,
          salary: 50000,
        });
      }
      await ub.upsert(wdb, "employees");

      // [expect] 3개 생성됨
      const initialCount = await wdb("employees")
        .where("employee_number", "like", `EMP-NOCLEAN-${timestamp}%`)
        .count("* as count")
        .first();
      expect(Number(initialCount?.count)).toBe(3);

      // [Naite] cleanOrphans 실행 전
      const tracesBeforeCount = Naite.get("puri:ub-clean-orphans").result().length;

      // 3단계: employees 2개만 재등록 (cleanOrphans 없음)
      for (let i = 1; i <= 2; i++) {
        ub.register("employees", {
          user_id: userId,
          employee_number: `EMP-NOCLEAN-${timestamp}-${i}`,
          salary: 60000,
        });
      }
      await ub.upsert(wdb, "employees");

      // [expect] 3개 모두 유지됨
      const finalCount = await wdb("employees")
        .where("employee_number", "like", `EMP-NOCLEAN-${timestamp}%`)
        .count("* as count")
        .first();
      expect(Number(finalCount?.count)).toBe(3);

      // [expect] 3번 employee는 업데이트 안 됨
      const employee3 = await wdb("employees")
        .where({ employee_number: `EMP-NOCLEAN-${timestamp}-3` })
        .first();
      expect(employee3).toBeTruthy();
      expect(Number(employee3?.salary)).toBe(50000);

      // [expect] 1, 2번은 업데이트됨
      const employees12 = await wdb("employees")
        .where("employee_number", "like", `EMP-NOCLEAN-${timestamp}%`)
        .whereIn("employee_number", [`EMP-NOCLEAN-${timestamp}-1`, `EMP-NOCLEAN-${timestamp}-2`])
        .orderBy("employee_number");

      expect(employees12).toHaveLength(2);
      expect(Number(employees12[0]?.salary)).toBe(60000);
      expect(Number(employees12[1]?.salary)).toBe(60000);

      // [Naite] cleanOrphans 실행 전후 비교
      const tracesAfterCount = Naite.get("puri:ub-clean-orphans").result().length;
      expect(tracesAfterCount).toBe(tracesBeforeCount);
    });

    test("cleanOrphans 적용 O - orphans 레코드 삭제", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // user 생성
      ub.register("users", {
        email: `clean-orphan-${Date.now()}@test.com`,
        username: "CleanOrphan User",
        password: "pw",
        role: "normal",
      });
      const [userId] = await ub.upsert(wdb, "users");

      // employees 3개 생성
      const timestamp = Date.now();
      for (let i = 1; i <= 3; i++) {
        ub.register("employees", {
          user_id: userId,
          employee_number: `EMP-ORPHAN-${timestamp}-${i}`,
          salary: 50000,
        });
      }
      const initialIds = await ub.upsert(wdb, "employees");

      // [expect] 3개 생성됨
      expect(initialIds).toHaveLength(3);

      const initialCount = await wdb("employees")
        .where("employee_number", "like", `EMP-ORPHAN-${timestamp}%`)
        .count("* as count")
        .first();
      expect(Number(initialCount?.count)).toBe(3);

      // [Naite] cleanOrphans 실행 전
      const tracesBeforeCount = Naite.get("puri:ub-clean-orphans").result().length;

      // 3단계: employees 2개만 재등록 + cleanOrphans
      for (let i = 1; i <= 2; i++) {
        ub.register("employees", {
          user_id: userId,
          employee_number: `EMP-ORPHAN-${timestamp}-${i}`,
          salary: 60000,
        });
      }
      const finalIds = await ub.upsert(wdb, "employees", { cleanOrphans: "user_id" });

      // [expect] 2개 반환됨
      expect(finalIds).toHaveLength(2);

      // [expect] DB에 2개만 남음 (3번 삭제됨)
      const finalCount = await wdb("employees")
        .where("employee_number", "like", `EMP-ORPHAN-${timestamp}%`)
        .count("* as count")
        .first();
      expect(Number(finalCount?.count)).toBe(2);

      // [expect] 남은 레코드 검증
      const remaining = await wdb("employees")
        .where("employee_number", "like", `EMP-ORPHAN-${timestamp}%`)
        .orderBy("employee_number");

      expect(remaining).toHaveLength(2);
      expect(remaining[0]?.employee_number).toBe(`EMP-ORPHAN-${timestamp}-1`);
      expect(remaining[1]?.employee_number).toBe(`EMP-ORPHAN-${timestamp}-2`);

      // [Naite] cleanOrphans 실행 전후 비교
      const traceAfter = Naite.get("puri:ub-clean-orphans").first();
      const traceAfterCount = Naite.get("puri:ub-clean-orphans").result().length;

      expect(traceAfterCount).not.toBe(tracesBeforeCount);
      expect(traceAfter).toMatchObject({
        tableName: "employees",
        cleanOrphans: ["user_id"],
        deletedCount: 1,
      });
    });

    test("cleanOrphans 적용 O - 단일 FK 컬럼 + FK 여러 개", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 1단계: 2개의 company 생성
      const timestamp = Date.now();

      const [companyA, companyB] = await wdb("companies")
        .insert([
          { name: `CleanOrphan-Multi-A-${timestamp}`, created_at: new Date() },
          { name: `CleanOrphan-Multi-B-${timestamp}`, created_at: new Date() },
        ])
        .returning("id");

      const companyIdA = companyA.id;
      const companyIdB = companyB.id;

      // 2단계: Company A에 3개, Company B에 2개 departments 생성
      for (let i = 1; i <= 3; i++) {
        ub.register("departments", {
          company_id: companyIdA,
          name: `A-Dept ${i}`,
        });
      }
      for (let i = 1; i <= 2; i++) {
        ub.register("departments", {
          company_id: companyIdB,
          name: `B-Dept ${i}`,
        });
      }
      await ub.upsert(wdb, "departments");

      // [expect] Company A: 3개, Company B: 2개 생성됨
      const initialCountA = await wdb("departments")
        .where("departments.company_id", companyIdA)
        .count("* as count")
        .first();
      expect(Number(initialCountA?.count)).toBe(3);

      const initialCountB = await wdb("departments")
        .where("departments.company_id", companyIdB)
        .count("* as count")
        .first();
      expect(Number(initialCountB?.count)).toBe(2);

      // 3단계: Company A는 2개만, Company B는 1개만 재등록 + cleanOrphans
      for (let i = 1; i <= 2; i++) {
        ub.register("departments", {
          company_id: companyIdA,
          name: `A-Dept ${i} Updated`,
        });
      }
      ub.register("departments", {
        company_id: companyIdB,
        name: "B-Dept 1 Updated",
      });

      await ub.upsert(wdb, "departments", {
        cleanOrphans: "company_id",
      });

      // [expect] Company A는 2개만 남음
      const finalCountA = await wdb("departments")
        .where("departments.company_id", companyIdA)
        .count("* as count")
        .first();
      expect(Number(finalCountA?.count)).toBe(2);

      // [expect] Company B는 1개만 남음
      const finalCountB = await wdb("departments")
        .where("departments.company_id", companyIdB)
        .count("* as count")
        .first();
      expect(Number(finalCountB?.count)).toBe(1);

      // [Naite] cleanOrphans 이벤트 발생 확인
      const trace = Naite.get("puri:ub-clean-orphans").first();
      expect(trace?.tableName).toBe("departments");
      expect(trace?.cleanOrphans).toEqual(["company_id"]);
      expect(trace?.deletedCount).toBeGreaterThanOrEqual(2);
    });

    test("cleanOrphans 적용 O - 복수 FK 컬럼 + 각 컬럼마다 값이 여러 개", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      // 1단계: 2개의 user 생성
      const [userA, userB] = await wdb("users")
        .insert([
          {
            email: `multi-fk-userA-${timestamp}@test.com`,
            username: "Multi FK User A",
            password: "pw",
            role: "normal",
            created_at: new Date(),
          },
          {
            email: `multi-fk-userB-${timestamp}@test.com`,
            username: "Multi FK User B",
            password: "pw",
            role: "normal",
            created_at: new Date(),
          },
        ])
        .returning("id");

      const userIdA = userA.id;
      const userIdB = userB.id;

      // 2단계: company 1개 생성 → 2개의 department 생성
      const [company] = await wdb("companies")
        .insert({ name: `Multi-FK-Company-${timestamp}`, created_at: new Date() })
        .returning("id");

      const companyId = company.id;

      const [dept1, dept2] = await wdb("departments")
        .insert([
          { company_id: companyId, name: `Dept 1`, created_at: new Date() },
          { company_id: companyId, name: `Dept 2`, created_at: new Date() },
        ])
        .returning("id");

      const deptId1 = dept1.id;
      const deptId2 = dept2.id;

      // 3단계: 모든 조합으로 employees register
      // userA-dept1, userA-dept2, userB-dept1, userB-dept2
      ub.register("employees", {
        user_id: userIdA,
        department_id: deptId1,
        employee_number: `MULTI-FK-${timestamp}-A1`,
        salary: 50000,
      });
      ub.register("employees", {
        user_id: userIdA,
        department_id: deptId2,
        employee_number: `MULTI-FK-${timestamp}-A2`,
        salary: 51000,
      });
      ub.register("employees", {
        user_id: userIdB,
        department_id: deptId1,
        employee_number: `MULTI-FK-${timestamp}-B1`,
        salary: 52000,
      });
      ub.register("employees", {
        user_id: userIdB,
        department_id: deptId2,
        employee_number: `MULTI-FK-${timestamp}-B2`,
        salary: 53000,
      });

      await ub.upsert(wdb, "employees");

      // [expect] 4개 생성됨
      const initialCount = await wdb("employees")
        .where("employee_number", "like", `MULTI-FK-${timestamp}%`)
        .count("* as count")
        .first();
      expect(Number(initialCount?.count)).toBe(4);

      // [Naite] cleanOrphans 실행 전
      const tracesBeforeCount = Naite.get("puri:ub-clean-orphans").result().length;

      // 4단계: 2개만 재등록 (userA-dept1, userB-dept2) + cleanOrphans
      ub.register("employees", {
        user_id: userIdA,
        department_id: deptId1,
        employee_number: `MULTI-FK-${timestamp}-A1`,
        salary: 60000,
      });
      ub.register("employees", {
        user_id: userIdB,
        department_id: deptId2,
        employee_number: `MULTI-FK-${timestamp}-B2`,
        salary: 63000,
      });

      await ub.upsert(wdb, "employees", {
        cleanOrphans: ["user_id", "department_id"],
      });

      // [expect] 2개만 남음 (userA-dept2, userB-dept1 삭제됨)
      const finalCount = await wdb("employees")
        .where("employee_number", "like", `MULTI-FK-${timestamp}%`)
        .count("* as count")
        .first();
      expect(Number(finalCount?.count)).toBe(2);

      // [expect] 남은 레코드 검증
      const remaining = await wdb("employees")
        .where("employee_number", "like", `MULTI-FK-${timestamp}%`)
        .orderBy("employee_number");

      expect(remaining).toHaveLength(2);
      expect(remaining[0]?.employee_number).toBe(`MULTI-FK-${timestamp}-A1`);
      expect(remaining[0]?.user_id).toBe(userIdA);
      expect(Number(remaining[0]?.department_id)).toBe(deptId1);
      expect(Number(remaining[0]?.salary)).toBe(60000);

      expect(remaining[1]?.employee_number).toBe(`MULTI-FK-${timestamp}-B2`);
      expect(remaining[1]?.user_id).toBe(userIdB);
      expect(Number(remaining[1]?.department_id)).toBe(deptId2);
      expect(Number(remaining[1]?.salary)).toBe(63000);

      // [Naite] cleanOrphans 이벤트 발생 확인
      const traceAfter = Naite.get("puri:ub-clean-orphans").first();
      const traceAfterCount = Naite.get("puri:ub-clean-orphans").result().length;

      expect(traceAfterCount).not.toBe(tracesBeforeCount);
      expect(traceAfter).toMatchObject({
        tableName: "employees",
        cleanOrphans: ["user_id", "department_id"],
        deletedCount: 2,
      });
    });
  });

  describe("G. inherit 옵션", () => {
    test("inherit 사용 - UPDATE 시 기존값 유지", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      // 1단계: user + employee 생성 (초기 salary: 50000)
      ub.register("users", {
        email: `inherit-keep-${timestamp}@test.com`,
        username: "Inherit Keep User",
        password: "pw",
        role: "normal",
      });
      const [userId] = await ub.upsert(wdb, "users");

      ub.register("employees", {
        user_id: userId,
        employee_number: `EMP-KEEP-${timestamp}`,
        salary: 50000,
      });
      await ub.upsert(wdb, "employees");

      // 2단계: salary 변경 시도 (inherit: ["salary"] 사용)
      ub.register("employees", {
        user_id: userId,
        employee_number: `EMP-KEEP-${timestamp}`,
        salary: 99999, // inherit 옵션으로 인해 무시됨
      });
      await ub.upsert(wdb, "employees", { inherit: ["salary"] });

      // [expect] inherit 적용으로 salary가 50000으로 유지됨
      const employee = await wdb("employees")
        .where({ employee_number: `EMP-KEEP-${timestamp}` })
        .first();
      expect(Number(employee?.salary)).toBe(50000);

      // [Naite] inherit 실행 확인
      const trace = Naite.get("puri:ub-inherit").first();
      expect(trace).toMatchObject({
        tableName: "employees",
        inheritColumns: ["salary"],
        excludedFromUpdate: ["salary"],
      });
    });

    test("inherit 미사용 - UPDATE 시 신규값 사용", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      // 1단계: user + employee 생성 (초기 salary: 50000)
      ub.register("users", {
        email: `inherit-update-${timestamp}@test.com`,
        username: "Inherit Update User",
        password: "pw",
        role: "normal",
      });
      const [userId] = await ub.upsert(wdb, "users");

      ub.register("employees", {
        user_id: userId,
        employee_number: `EMP-UPDATE-${timestamp}`,
        salary: 50000,
      });
      await ub.upsert(wdb, "employees");

      // 2단계: salary 변경 (inherit 옵션 없음)
      ub.register("employees", {
        user_id: userId,
        employee_number: `EMP-UPDATE-${timestamp}`,
        salary: 70000, // inherit 옵션이 없으므로 정상 업데이트됨
      });
      await ub.upsert(wdb, "employees");

      // [expect] inherit 미사용으로 salary가 70000으로 업데이트됨
      const employee = await wdb("employees")
        .where({ employee_number: `EMP-UPDATE-${timestamp}` })
        .first();
      expect(Number(employee?.salary)).toBe(70000);
    });
  });

  describe("H. 에러 처리", () => {
    test("존재하지 않는 테이블에 upsert → 빈 배열 반환", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // [expectUB] register 없이 upsert 시도 전 상태
      expectUB(ub, "hasTable", "users").toBe(false);
      expectUB(ub, "tables").toEqual([]);

      // register 없이 바로 upsert 호출
      const ids = await ub.upsert(wdb, "users");

      // [expect] 빈 배열 반환 (에러 발생 안 함)
      expect(ids).toEqual([]);
      expect(ids).toHaveLength(0);

      // [expectUB] 테이블이 생성되지 않음
      expectUB(ub, "hasTable", "users").toBe(false);
      expectUB(ub, "tables").toEqual([]);

      // [Naite] upsert 이벤트 기록 안 됨
      const traces = Naite.get("puri:ub-upserted").result();
      const userTraces = traces.filter((t) => t.tableName === "users");
      expect(userTraces).toHaveLength(0);
    });

    test("rows가 비어있는 테이블에 upsert → 에러", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // getTable() 호출하여 테이블 구조만 생성 (register는 안 함)
      ub.getTable("users");

      // [expectUB] 테이블은 존재하지만 rows는 비어있음
      expectUB(ub, "hasTable", "users").toBe(true);
      expectUB(ub, "rowCount", "users").toBe(0);

      // rows가 없는 상태에서 upsert 시도 → 에러
      await expect(ub.upsert(wdb, "users")).rejects.toThrow(/upsert 할 데이터가 없습니다/);

      // [expectUB] 에러 발생 후에도 테이블 구조는 유지
      expectUB(ub, "hasTable", "users").toBe(true);
      expectUB(ub, "rowCount", "users").toBe(0);

      // [Naite] upsert 이벤트 기록 안 됨
      const traces = Naite.get("puri:ub-upserted").result();
      const userTraces = traces.filter((t) => t.tableName === "users");
      expect(userTraces).toHaveLength(0);
    });

    test("존재하지 않는 uuid 참조 시 → 에러", async () => {
      // console.log를 차단하기 위해 spyOn
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});

      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");
      const timestamp = Date.now();

      // company 생성
      const [companyId] = await wdb("companies")
        .insert({ name: `테스트회사-${timestamp}`, created_at: new Date(timestamp) })
        .returning("id");

      // 정상적인 department 등록
      ub.register("departments", {
        company_id: companyId,
        name: "본부",
      });

      // 존재하지 않는 uuid를 가진 UBRef 직접 생성
      const invalidRef = {
        of: "departments",
        uuid: "non-existent-uuid-12345", // ← 존재하지 않는 uuid
        use: "id",
      };

      // 자기 참조로 잘못된 UBRef 사용
      ub.register("departments", {
        company_id: companyId,
        name: "하위부서",
        parent_id: invalidRef,
      });

      // departments upsert 시도 → 에러!
      await expect(ub.upsert(wdb, "departments")).rejects.toThrow(/존재하지 않는 uuid/);

      // [expectUB] 에러 발생 후에도 departments 데이터는 유지
      expectUB(ub, "rowCount", "departments").toBe(2);

      // [Naite] departments upsert 이벤트 기록 안 됨
      const traces = Naite.get("puri:ub-upserted").result();
      const deptTraces = traces.filter((t) => t.tableName === "departments");
      expect(deptTraces).toHaveLength(0);
    });
  });

  describe("I. 복합 시나리오", () => {
    test("upsert + updateBatch 조합", async () => {
      const ub = new UpsertBuilder();
      const wdb = DB.getDB("w");

      // 1단계: Users 3명 초기 생성 (upsert)
      const initialUsers = [
        { email: "combo1@test.com", username: "초기유저1", password: "pw", role: "normal" },
        { email: "combo2@test.com", username: "초기유저2", password: "pw", role: "normal" },
        { email: "combo3@test.com", username: "초기유저3", password: "pw", role: "normal" },
      ];

      for (const user of initialUsers) {
        ub.register("users", user);
      }

      const ids = await ub.upsert(wdb, "users");
      const sortedIds = [...ids].toSorted((a, b) => a.localeCompare(b));

      // [expect] 3명 생성됨
      expect(ids).toHaveLength(3);

      // 2단계: updateBatch로 일괄 수정
      for (let i = 0; i < sortedIds.length; i++) {
        ub.register("users", {
          id: sortedIds[i],
          username: `수정유저${i + 1}`,
          role: "admin",
        });
      }

      await ub.updateBatch(wdb, "users");

      // 3단계: 다시 upsert로 새 유저 추가
      ub.register("users", {
        email: "combo4@test.com",
        username: "추가유저",
        password: "pw",
        role: "normal",
      });

      const [newId] = await ub.upsert(wdb, "users");
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.

      // [expect] DB 검증: 기존 유저는 수정됨, 새 유저는 추가됨
      const updatedUsers = await wdb("users")
        .select("username", "role")
        .whereIn("id", [...sortedIds, newId] as string[])
        .orderBy("id");

      expect(updatedUsers).toMatchObject([
        { username: "수정유저1", role: "admin" },
        { username: "수정유저2", role: "admin" },
        { username: "수정유저3", role: "admin" },
        { username: "추가유저", role: "normal" },
      ]);

      // [Naite] upsert 2번, updateBatch 1번 확인
      const upsertTraces = Naite.get("puri:ub-upserted").result();
      const updateTraces = Naite.get("puri:ub-batch-updated").result();

      expect(upsertTraces.filter((t) => t.tableName === "users")).toHaveLength(2);
      expect(updateTraces.filter((t) => t.tableName === "users")).toHaveLength(1);
    });
  });
});

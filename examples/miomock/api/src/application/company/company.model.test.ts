import { BadRequestException, NotFoundException, Sonamu } from "sonamu";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { CompanyModel } from "./company.model";

describe("CompanyModel", () => {
  const createdIds: number[] = [];

  beforeAll(async () => {
    await Sonamu.init(true);
  });

  afterAll(async () => {
    // 테스트에서 생성한 데이터 정리
    if (createdIds.length > 0) {
      await CompanyModel.del(createdIds);
    }
  });

  beforeEach(() => {
    // 각 테스트 전 초기화 필요 시
  });

  // ============================================
  // save 테스트
  // ============================================
  describe("save", () => {
    test("단일 Company 생성", async () => {
      const result = await CompanyModel.save([{ name: "테스트 회사 1" }]);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(typeof result[0]).toBe("number");

      createdIds.push(...result);
    });

    test("여러 Company 동시 생성", async () => {
      const result = await CompanyModel.save([
        { name: "테스트 회사 2" },
        { name: "테스트 회사 3" },
        { name: "테스트 회사 4" },
      ]);

      expect(result).toBeDefined();
      expect(result.length).toBe(3);

      createdIds.push(...result);
    });

    test("기존 Company 수정 (upsert)", async () => {
      // 먼저 생성
      const [id] = await CompanyModel.save([{ name: "수정 전 회사" }]);
      createdIds.push(...(id ? [id] : []));

      // 수정
      const result = await CompanyModel.save([{ id, name: "수정 후 회사" }]);

      expect(result).toEqual([id]);

      // 수정 확인
      const updated = await CompanyModel.findById("A", id ?? 0);
      expect(updated.name).toBe("수정 후 회사");
    });
  });

  // ============================================
  // findById 테스트
  // ============================================
  describe("findById", () => {
    let testCompanyId: number;

    beforeAll(async () => {
      const [id] = await CompanyModel.save([{ name: "findById 테스트 회사" }]);
      testCompanyId = id ?? 0;
      createdIds.push(...(id ? [id] : []));
    });

    test("존재하는 Company 조회", async () => {
      const company = await CompanyModel.findById("A", testCompanyId);

      expect(company).toBeDefined();
      expect(company.id).toBe(testCompanyId);
      expect(company.name).toBe("findById 테스트 회사");
      expect(company.created_at).toBeDefined();
    });

    test("존재하지 않는 Company 조회 → NotFoundException", async () => {
      const nonExistentId = 999999;

      await expect(CompanyModel.findById("A", nonExistentId)).rejects.toThrow(NotFoundException);

      await expect(CompanyModel.findById("A", nonExistentId)).rejects.toThrow(
        `존재하지 않는 Company ID ${nonExistentId}`,
      );
    });
  });

  // ============================================
  // findOne 테스트
  // ============================================
  describe("findOne", () => {
    let testCompanyId: number;

    beforeAll(async () => {
      const [id] = await CompanyModel.save([{ name: "findOne 테스트 회사" }]);
      testCompanyId = id ?? 0;
      createdIds.push(...(id ? [id] : []));
    });

    test("존재하는 Company 조회 → 결과 반환", async () => {
      const company = await CompanyModel.findOne("A", { id: testCompanyId });

      expect(company).not.toBeNull();
      expect(company?.id).toBe(testCompanyId);
      expect(company?.name).toBe("findOne 테스트 회사");
    });

    test("존재하지 않는 Company 조회 → null 반환", async () => {
      const company = await CompanyModel.findOne("A", { id: 999999 });

      expect(company).toBeNull();
    });
  });

  // ============================================
  // findMany 테스트
  // ============================================
  describe("findMany", () => {
    let testCompanyIds: number[] = [];

    beforeAll(async () => {
      // 테스트용 데이터 생성
      const ids = await CompanyModel.save([
        { name: "findMany 회사 A" },
        { name: "findMany 회사 B" },
        { name: "findMany 회사 C" },
      ]);
      testCompanyIds = ids;
      createdIds.push(...ids);
    });

    test("기본 파라미터로 조회", async () => {
      const result = await CompanyModel.findMany("A");

      expect(result).toBeDefined();
      expect(result.rows).toBeDefined();
      expect(result.total).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
      expect(typeof result.total).toBe("number");
    });

    test("num, page 파라미터", async () => {
      const result = await CompanyModel.findMany("A", {
        num: 2,
        page: 1,
      });

      expect(result.rows.length).toBeLessThanOrEqual(2);
    });

    test("id 필터 - 단일 ID", async () => {
      const result = await CompanyModel.findMany("A", {
        id: testCompanyIds[0],
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.id).toBe(testCompanyIds[0]);
    });

    test("id 필터 - 여러 ID (배열)", async () => {
      const result = await CompanyModel.findMany("A", {
        id: [testCompanyIds[0] ?? 0, testCompanyIds[1] ?? 0],
      });

      expect(result.rows.length).toBe(2);
      const ids = result.rows.map((r) => r.id);
      expect(ids).toContain(testCompanyIds[0]);
      expect(ids).toContain(testCompanyIds[1]);
    });

    test("search-keyword - id 검색", async () => {
      const result = await CompanyModel.findMany("A", {
        search: "id",
        keyword: String(testCompanyIds[0]),
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.id).toBe(testCompanyIds[0]);
    });

    test("search-keyword - 구현되지 않은 검색 필드 → BadRequestException", async () => {
      await expect(
        CompanyModel.findMany("A", {
          search: "unknown-field" as any,
          keyword: "test",
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        CompanyModel.findMany("A", {
          search: "unknown-field" as any,
          keyword: "test",
        }),
      ).rejects.toThrow("구현되지 않은 검색 필드 unknown-field");
    });

    test("search 있고 keyword 없으면 검색 안 함", async () => {
      // keyword가 없으면 search-keyword 블록이 실행되지 않음
      const result = await CompanyModel.findMany("A", {
        search: "id",
        // keyword 없음
      });

      expect(result.rows.length).toBeGreaterThan(0);
    });

    test("search 있고 keyword 빈 문자열이면 검색 안 함", async () => {
      const result = await CompanyModel.findMany("A", {
        search: "id",
        keyword: "",
      });

      expect(result.rows.length).toBeGreaterThan(0);
    });

    test("orderBy - id-desc (기본값)", async () => {
      const result = await CompanyModel.findMany("A", {
        orderBy: "id-desc",
        id: testCompanyIds,
      });

      expect(result.rows.length).toBe(3);
      // id 내림차순 확인
      for (let i = 0; i < result.rows.length - 1; i++) {
        expect(result.rows[i]?.id).toBeGreaterThan(result.rows[i + 1]?.id ?? 0);
      }
    });

    test("orderBy 없으면 기본값 적용", async () => {
      const result = await CompanyModel.findMany("A", {
        id: testCompanyIds,
        orderBy: undefined,
      });

      // 기본값 id-desc가 적용되어 내림차순
      expect(result.rows.length).toBe(3);
    });
  });

  // ============================================
  // del 테스트
  // ============================================
  describe("del", () => {
    test("단일 Company 삭제", async () => {
      // 삭제용 데이터 생성
      const [id] = await CompanyModel.save([{ name: "삭제 테스트 회사" }]);

      const result = await CompanyModel.del([id ?? 0]);

      expect(result).toBe(1);

      // 삭제 확인
      await expect(CompanyModel.findById("A", id ?? 0)).rejects.toThrow(NotFoundException);
    });

    test("여러 Company 삭제", async () => {
      // 삭제용 데이터 생성
      const ids = await CompanyModel.save([{ name: "삭제 테스트 1" }, { name: "삭제 테스트 2" }]);

      const result = await CompanyModel.del(ids);

      expect(result).toBe(2);

      // 삭제 확인
      for (const id of ids) {
        await expect(CompanyModel.findById("A", id)).rejects.toThrow(NotFoundException);
      }
    });

    test("빈 배열 삭제 → 0 반환", async () => {
      const result = await CompanyModel.del([]);

      expect(result).toBe(0);
    });
  });

  // ============================================
  // subset 테스트
  // ============================================
  describe("subset", () => {
    let testCompanyId: number;

    beforeAll(async () => {
      const [id] = await CompanyModel.save([{ name: "subset 테스트 회사" }]);
      testCompanyId = id ?? 0;
      createdIds.push(...(id ? [id] : []));
    });

    test("subset A - id, created_at, name 포함", async () => {
      const company = await CompanyModel.findById("A", testCompanyId);

      expect(company).toHaveProperty("id");
      expect(company).toHaveProperty("created_at");
      expect(company).toHaveProperty("name");
    });
  });
});

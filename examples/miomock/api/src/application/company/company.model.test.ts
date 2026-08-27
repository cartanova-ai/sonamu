import assert from "assert";

import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { CompanyModel } from "./company.model";

bootstrap(vi);

describe("CompanyModel", () => {
  // ============================================================
  // CDD 검증: company.spec.json → 회사 관리
  // ============================================================

  describe("회사 생성/수정", () => {
    test("save로 회사 생성", async () => {
      const [companyId] = await CompanyModel.save([{ name: "테스트회사" }]);
      assert(companyId);

      // ID는 정수 타입 (Spec: Technical Constraints)
      expect(Number.isInteger(companyId)).toBe(true);

      const company = await CompanyModel.findById("A", companyId);
      expect(company.name).toBe("테스트회사");
    });

    test("save로 회사 이름 수정", async () => {
      const [companyId] = await CompanyModel.save([{ name: "수정전회사" }]);
      assert(companyId);

      const created = await CompanyModel.findById("A", companyId);
      await CompanyModel.save([{ ...created, name: "수정후회사" }]);

      const updated = await CompanyModel.findById("A", companyId);
      expect(updated.name).toBe("수정후회사");
    });

    test("중복 회사 이름 저장 시 유니크 제약 위반 에러", async () => {
      await CompanyModel.save([{ name: "유니크회사" }]);

      await expect(CompanyModel.save([{ name: "유니크회사" }])).rejects.toThrow();
    });
  });

  describe("회사 조회", () => {
    test("findById로 단건 조회", async () => {
      const [companyId] = await CompanyModel.save([{ name: "조회테스트회사" }]);
      assert(companyId);

      const company = await CompanyModel.findById("A", companyId);
      expect(company).toBeDefined();
      expect(company.id).toBe(companyId);
      expect(company.name).toBe("조회테스트회사");
    });

    test("존재하지 않는 회사 조회 시 NotFoundException", async () => {
      await expect(CompanyModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany 페이지네이션", async () => {
      const result = await CompanyModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    test("findMany 이름 LIKE 검색", async () => {
      await CompanyModel.save([{ name: "검색대상회사ABC" }]);

      const result = await CompanyModel.findMany("A", {
        search: "name",
        keyword: "검색대상",
        num: 10,
        page: 1,
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows[0]?.name).toContain("검색대상");
    });
  });

  describe("회사 삭제", () => {
    test("del은 hard delete", async () => {
      const wdb = DB.getDB("w");

      const [companyId] = await CompanyModel.save([{ name: "삭제대상회사" }]);
      assert(companyId);

      await CompanyModel.del([companyId]);

      // hard delete이므로 DB에서 레코드가 없어야 함
      const row = await wdb("companies").where("id", companyId).first();
      expect(row).toBeUndefined();
    });
  });

  // ============================================================
  // CDD 검증: Contract → 회사 삭제 시 부서 CASCADE
  // ============================================================
  describe("회사 삭제 시 Department CASCADE", () => {
    test("회사 삭제하면 소속 부서도 삭제", async () => {
      const wdb = DB.getDB("w");

      const [companyId] = await CompanyModel.save([{ name: "CASCADE테스트회사" }]);
      assert(companyId);

      // 부서 생성
      const [deptResult] = await wdb("departments")
        .insert({
          name: "CASCADE테스트부서",
          company_id: companyId,
        })
        .returning("id");

      // 회사 삭제
      await CompanyModel.del([companyId]);

      // 부서도 삭제되었는지 확인
      const dept = await wdb("departments").where("id", deptResult.id).first();
      expect(dept).toBeUndefined();
    });
  });
});

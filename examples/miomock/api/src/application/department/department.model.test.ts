import assert from "assert";

import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { z } from "zod";

import { DepartmentModel } from "./department.model";

bootstrap(vi);

// 테스트용 회사를 직접 구성해 부서 시나리오 간 준비 절차를 통일한다.
const createCompany = async (name: string) => {
  const wdb = DB.getDB("w");
  const [result] = await wdb("companies").insert({ name, created_at: new Date() }).returning("id");
  return z.number().parse(result?.id);
};

describe("DepartmentModel", () => {
  // ============================================================
  // CDD 검증: department.spec.json → 부서 관리
  // ============================================================

  describe("부서 생성/수정", () => {
    test("save로 부서 생성", async () => {
      const companyId = await createCompany("부서테스트회사");

      const [deptId] = await DepartmentModel.save([
        {
          name: "개발팀",
          company_id: companyId,
          parent_id: null,
        },
      ]);
      assert(deptId);

      // ID는 정수 타입
      expect(Number.isInteger(deptId)).toBe(true);

      const dept = await DepartmentModel.findById("A", deptId);
      expect(dept.name).toBe("개발팀");
    });

    test("계층 구조 — 상위 부서 지정", async () => {
      const companyId = await createCompany("계층회사");

      const [parentId] = await DepartmentModel.save([
        { name: "개발본부", company_id: companyId, parent_id: null },
      ]);
      assert(parentId);

      const [childId] = await DepartmentModel.save([
        { name: "백엔드팀", company_id: companyId, parent_id: parentId },
      ]);
      assert(childId);

      const child = await DepartmentModel.findById("A", childId);
      expect(child.parent?.id).toBe(parentId);
    });

    test("save로 부서 이름 수정", async () => {
      const companyId = await createCompany("수정테스트회사");

      const [deptId] = await DepartmentModel.save([
        { name: "수정전부서", company_id: companyId, parent_id: null },
      ]);
      assert(deptId);

      await DepartmentModel.save([
        { id: deptId, name: "수정후부서", company_id: companyId, parent_id: null },
      ]);

      const updated = await DepartmentModel.findById("A", deptId);
      expect(updated.name).toBe("수정후부서");
    });

    test("같은 회사 내 중복 부서명 저장 시 유니크 제약 위반", async () => {
      const companyId = await createCompany("중복부서회사");

      await DepartmentModel.save([{ name: "인사팀", company_id: companyId, parent_id: null }]);

      await expect(
        DepartmentModel.save([{ name: "인사팀", company_id: companyId, parent_id: null }]),
      ).rejects.toThrow();
    });

    test("다른 회사에서는 같은 부서명 허용", async () => {
      const companyId1 = await createCompany("A회사");
      const companyId2 = await createCompany("B회사");

      const [deptId1] = await DepartmentModel.save([
        { name: "개발팀", company_id: companyId1, parent_id: null },
      ]);
      const [deptId2] = await DepartmentModel.save([
        { name: "개발팀", company_id: companyId2, parent_id: null },
      ]);

      expect(deptId1).toBeDefined();
      expect(deptId2).toBeDefined();
    });
  });

  describe("부서 조회", () => {
    test("findById로 단건 조회", async () => {
      const companyId = await createCompany("조회테스트회사");
      const [deptId] = await DepartmentModel.save([
        { name: "조회부서", company_id: companyId, parent_id: null },
      ]);
      assert(deptId);

      const dept = await DepartmentModel.findById("A", deptId);
      expect(dept).toBeDefined();
      expect(dept.id).toBe(deptId);
      expect(dept.name).toBe("조회부서");
    });

    test("존재하지 않는 부서 조회 시 NotFoundException", async () => {
      await expect(DepartmentModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany 페이지네이션", async () => {
      const result = await DepartmentModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    test("findMany 이름 검색", async () => {
      const companyId = await createCompany("검색부서회사");
      await DepartmentModel.save([
        { name: "마케팅전략부서", company_id: companyId, parent_id: null },
      ]);

      const result = await DepartmentModel.findMany("A", {
        search: "name",
        keyword: "마케팅전략",
        num: 10,
        page: 1,
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows[0]?.name).toContain("마케팅전략");
    });

    test("부서 코드 자동 생성 (DEP-XXX 형식)", async () => {
      const wdb = DB.getDB("w");
      const companyId = await createCompany("코드테스트회사");

      const [deptId] = await DepartmentModel.save([
        { name: "코드테스트부서", company_id: companyId, parent_id: null },
      ]);
      assert(deptId);

      // DB에서 직접 code 컬럼 확인 (generated column)
      const row = await wdb("departments").where("id", deptId).first();
      expect(row.code).toMatch(/^DEP-\d{3}$/);
    });

    test("employee_count 가상 필드 (subset A)", async () => {
      const wdb = DB.getDB("w");
      const companyId = await createCompany("직원수회사");

      const [deptId] = await DepartmentModel.save([
        { name: "직원수부서", company_id: companyId, parent_id: null },
      ]);
      assert(deptId);

      // 직원 없는 부서의 employee_count는 0
      const dept = await DepartmentModel.findById("A", deptId);
      expect(dept.employee_count).toBe(0);

      // 직원 추가 (User 먼저 생성 필요)
      const [userResult] = await wdb("users")
        .insert({
          email: "emp-count@test.com",
          username: "empcountuser",
          password: "password123",
          role: "normal",
          is_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      await wdb("employees").insert({
        user_id: userResult.id,
        department_id: deptId,
        employee_number: "10000001",
        created_at: new Date(),
      });

      const deptWithEmp = await DepartmentModel.findById("A", deptId);
      expect(deptWithEmp.employee_count).toBe(1);
    });
  });

  describe("부서 삭제", () => {
    test("del은 hard delete", async () => {
      const wdb = DB.getDB("w");
      const companyId = await createCompany("삭제부서회사");

      const [deptId] = await DepartmentModel.save([
        { name: "삭제부서", company_id: companyId, parent_id: null },
      ]);
      assert(deptId);

      await DepartmentModel.del([deptId]);

      const row = await wdb("departments").where("id", deptId).first();
      expect(row).toBeUndefined();
    });

    test("부서 삭제 시 하위 부서도 CASCADE 삭제", async () => {
      const wdb = DB.getDB("w");
      const companyId = await createCompany("하위삭제회사");

      const [parentId] = await DepartmentModel.save([
        { name: "상위부서", company_id: companyId, parent_id: null },
      ]);
      assert(parentId);

      const [childId] = await DepartmentModel.save([
        { name: "하위부서", company_id: companyId, parent_id: parentId },
      ]);
      assert(childId);

      // 상위 부서 삭제
      await DepartmentModel.del([parentId]);

      // 하위 부서도 삭제되었는지 확인
      const child = await wdb("departments").where("id", childId).first();
      expect(child).toBeUndefined();
    });

    test("부서 삭제 시 소속 직원은 미배치 상태로 전환 (SET NULL)", async () => {
      const wdb = DB.getDB("w");
      const companyId = await createCompany("미배치회사");

      const [deptId] = await DepartmentModel.save([
        { name: "미배치부서", company_id: companyId, parent_id: null },
      ]);
      assert(deptId);

      // User + Employee 생성
      const [userResult] = await wdb("users")
        .insert({
          email: "unassign@test.com",
          username: "unassignuser",
          password: "password123",
          role: "normal",
          is_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const [empResult] = await wdb("employees")
        .insert({
          user_id: userResult.id,
          department_id: deptId,
          employee_number: "20000001",
          created_at: new Date(),
        })
        .returning("id");

      // 부서 삭제
      await DepartmentModel.del([deptId]);

      // 직원은 삭제되지 않고 department_id가 NULL (미배치)
      const emp = await wdb("employees").where("id", empResult.id).first();
      expect(emp).toBeDefined();
      expect(emp.department_id).toBeNull();
    });
  });
});

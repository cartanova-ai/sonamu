import assert from "assert";

import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { z } from "zod";

import { EmployeeModel } from "./employee.model";

bootstrap(vi);

const createUser = async (email: string, username: string) => {
  const wdb = DB.getDB("w");
  const [result] = await wdb("users")
    .insert({
      email,
      username,
      password: "password123",
      role: "normal",
      is_verified: true,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("id");
  return z.string().parse(result?.id);
};

const createCompany = async (name: string) => {
  const wdb = DB.getDB("w");
  const [result] = await wdb("companies").insert({ name, created_at: new Date() }).returning("id");
  return z.number().parse(result?.id);
};

const createDepartment = async (name: string, companyId: number) => {
  const wdb = DB.getDB("w");
  const [result] = await wdb("departments")
    .insert({ name, company_id: companyId, created_at: new Date() })
    .returning("id");
  return z.number().parse(result?.id);
};

describe("EmployeeModel", () => {
  // ============================================================
  // CDD 검증: employee.spec.json → 직원 관리
  // ============================================================

  describe("직원 생성/수정", () => {
    test("save로 직원 생성 (사번 부여)", async () => {
      const userId = await createUser("emp-save@test.com", "empsaveuser");

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "30000001",
          department_id: null,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);
      assert(empId);

      // ID는 정수 타입
      expect(Number.isInteger(empId)).toBe(true);

      const emp = await EmployeeModel.findById("A", empId);
      expect(emp.employee_number).toBe("30000001");
    });

    test("직원을 부서에 배치", async () => {
      const userId = await createUser("emp-dept@test.com", "empdeptuser");
      const companyId = await createCompany("배치테스트회사");
      const deptId = await createDepartment("배치부서", companyId);

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "30000002",
          department_id: deptId,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);
      assert(empId);

      const emp = await EmployeeModel.findById("A", empId);
      expect(emp.department?.id).toBe(deptId);
    });

    test("미배치 상태 직원 (department_id = null)", async () => {
      const userId = await createUser("emp-unassigned@test.com", "empunassigned");

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "30000003",
          department_id: null,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);
      assert(empId);

      const emp = await EmployeeModel.findById("A", empId);
      expect(emp.department).toBeNull();
    });

    test("급여와 입사일 기록", async () => {
      const userId = await createUser("emp-salary@test.com", "empsalaryuser");
      const hireDate = new Date("2025-03-01");

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "30000004",
          department_id: null,
          salary: "50000000.00",
          hire_date: hireDate,
          notes: "테스트 직원",
        },
      ]);
      assert(empId);

      const emp = await EmployeeModel.findById("A", empId);
      expect(emp.salary).toBe("50000000.00");
      expect(emp.hire_date).toBeDefined();
      expect(emp.notes).toBe("테스트 직원");
    });

    test("save로 직원 정보 수정", async () => {
      const userId = await createUser("emp-update@test.com", "empupdateuser");

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "30000005",
          department_id: null,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);
      assert(empId);

      // 급여 추가
      await EmployeeModel.save([
        {
          id: empId,
          user_id: userId,
          employee_number: "30000005",
          department_id: null,
          salary: "70000000.00",
          hire_date: null,
          notes: "급여 업데이트",
        },
      ]);

      const updated = await EmployeeModel.findById("A", empId);
      expect(updated.salary).toBe("70000000.00");
      expect(updated.notes).toBe("급여 업데이트");
    });
  });

  describe("직원 조회", () => {
    test("findById로 단건 조회", async () => {
      const userId = await createUser("emp-find@test.com", "empfinduser");

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "40000001",
          department_id: null,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);
      assert(empId);

      const emp = await EmployeeModel.findById("A", empId);
      expect(emp).toBeDefined();
      expect(emp.id).toBe(empId);
    });

    test("존재하지 않는 직원 조회 시 NotFoundException", async () => {
      await expect(EmployeeModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany 페이지네이션", async () => {
      const result = await EmployeeModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    test("사번 LIKE 검색", async () => {
      const userId = await createUser("emp-search@test.com", "empsearchuser");

      await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "99887766",
          department_id: null,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);

      const result = await EmployeeModel.findMany("A", {
        search: "employee_number",
        keyword: "998877",
        num: 10,
        page: 1,
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows[0]?.employee_number).toContain("998877");
    });

    test("ID 검색에 비숫자 값 → 빈 결과", async () => {
      const result = await EmployeeModel.findMany("A", {
        search: "id",
        keyword: "abc",
        num: 10,
        page: 1,
      });

      expect(result.rows.length).toBe(0);
    });
  });

  describe("직원 삭제", () => {
    test("del은 hard delete", async () => {
      const wdb = DB.getDB("w");
      const userId = await createUser("emp-del@test.com", "empdeluser");

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "50000001",
          department_id: null,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);
      assert(empId);

      await EmployeeModel.del([empId]);

      const row = await wdb("employees").where("id", empId).first();
      expect(row).toBeUndefined();
    });
  });

  // ============================================================
  // CDD 검증: Contract → 한 사용자는 하나의 직원만
  // ============================================================
  describe("Contract 비즈니스 규칙", () => {
    test("같은 사용자를 다른 사번으로 두 번 등록하면 거부해야 함", async () => {
      const userId = await createUser("emp-dup@test.com", "empdupuser");

      // 첫 번째 등록
      await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "60000001",
          department_id: null,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);

      // 같은 사용자를 다른 사번으로 두 번째 등록 시 에러
      await expect(
        EmployeeModel.save([
          {
            user_id: userId,
            employee_number: "60000002",
            department_id: null,
            salary: null,
            hire_date: null,
            notes: null,
          },
        ]),
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // CDD 검증: User 삭제 시 Employee CASCADE
  // ============================================================
  describe("User 삭제 시 Employee CASCADE", () => {
    test("User 삭제 시 Employee도 삭제", async () => {
      const wdb = DB.getDB("w");
      const userId = await createUser("emp-cascade@test.com", "empcascadeuser");

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "70000001",
          department_id: null,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);
      assert(empId);

      // User 삭제
      await wdb("users").where("id", userId).delete();

      // Employee도 삭제되었는지 확인
      const emp = await wdb("employees").where("id", empId).first();
      expect(emp).toBeUndefined();
    });
  });

  // ============================================================
  // CDD 검증: Department 삭제 시 Employee 미배치 전환
  // ============================================================
  describe("Department 삭제 시 Employee 미배치", () => {
    test("부서 삭제 시 소속 직원의 department_id가 NULL로 전환", async () => {
      const wdb = DB.getDB("w");
      const userId = await createUser("emp-setnull@test.com", "empsetnulluser");
      const companyId = await createCompany("미배치전환회사");
      const deptId = await createDepartment("미배치전환부서", companyId);

      const [empId] = await EmployeeModel.save([
        {
          user_id: userId,
          employee_number: "80000001",
          department_id: deptId,
          salary: null,
          hire_date: null,
          notes: null,
        },
      ]);
      assert(empId);

      // 배치 확인
      const before = await wdb("employees").where("id", empId).first();
      expect(before.department_id).toBe(deptId);

      // 부서 삭제
      await wdb("departments").where("id", deptId).delete();

      // 직원은 살아있고, department_id는 NULL
      const after = await wdb("employees").where("id", empId).first();
      expect(after).toBeDefined();
      expect(after.department_id).toBeNull();
    });
  });
});

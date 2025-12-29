import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { DepartmentModel } from "./department.model";

bootstrap(vi);
describe("DepartmentModelTest - Multiple Unique Constraints", () => {
  test("ISSUE: id 포함 + name 변경 시 PK 충돌 에러", async () => {
    const timestamp = Date.now();
    const wdb = DB.getDB("w");

    // 1단계: company 생성
    const [companyResult] = await wdb("companies")
      .insert({ name: `Test Company ${timestamp}`, created_at: new Date() })
      .returning("id");
    const companyId = companyResult.id;

    // 2단계: department 생성
    const [deptId] = await DepartmentModel.save([
      {
        parent_id: null,
        company_id: companyId,
        name: "개발팀",
      },
    ]);

    expect(deptId).toBeDefined();

    // 3단계: id 포함 + name 변경 → PK 충돌 에러 예상!
    // 현재 로직: ON CONFLICT (company_id, name)
    // 문제: id=deptId가 PK 충돌하는데 ON CONFLICT가 (company_id, name)만 체크
    const [updatedId] = await DepartmentModel.save([
      {
        id: deptId, // ← PK 포함
        parent_id: null,
        company_id: companyId,
        name: "개발팀 수정", // ← unique 값 변경
      },
    ]);

    // 이 테스트가 통과하면 문제 해결된 것
    expect(updatedId).toBe(deptId);

    const dept = await wdb("departments").where({ id: deptId }).first();
    expect(dept?.name).toBe("개발팀 수정");
  });
});

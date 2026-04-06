import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { DepartmentModel } from "../../application/department/department.model";
import { ProjectModel } from "../../application/project/project.model";

bootstrap(vi);

describe("Filter Operators - 모든 연산자 동작 검증", () => {
  describe("비교 연산자", () => {
    test("eq - 같음", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          id: { eq: 1 },
        },
      });

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.id).toBe(1);
      }
    });

    test("ne - 같지 않음", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          id: { ne: 1 },
        },
      });

      for (const row of result.rows) {
        expect(row.id).not.toBe(1);
      }
    });

    test("gt - 초과", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          budget: { gt: "10000" },
        },
      });

      for (const row of result.rows) {
        // PostgreSQL numeric 타입은 문자열로 반환되므로 숫자로 변환하여 비교
        expect(Number(row.budget)).toBeGreaterThan(10000);
      }
    });

    test("gte - 이상", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          budget: { gte: "10000" },
        },
      });

      for (const row of result.rows) {
        expect(Number(row.budget)).toBeGreaterThanOrEqual(10000);
      }
    });

    test("lt - 미만", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          budget: { lt: "50000" },
        },
      });

      for (const row of result.rows) {
        expect(Number(row.budget)).toBeLessThan(50000);
      }
    });

    test("lte - 이하", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          budget: { lte: "50000" },
        },
      });

      for (const row of result.rows) {
        expect(Number(row.budget)).toBeLessThanOrEqual(50000);
      }
    });
  });

  describe("포함 연산자", () => {
    test("in - 여러 값 중 하나", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          status: { in: ["planning", "in_progress"] },
        },
      });

      for (const row of result.rows) {
        expect(["planning", "in_progress"]).toContain(row.status);
      }
    });

    test("notIn - 여러 값에 포함되지 않음", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          status: { notIn: ["completed", "cancelled"] },
        },
      });

      for (const row of result.rows) {
        expect(["completed", "cancelled"]).not.toContain(row.status);
      }
    });
  });

  describe("문자열 패턴 연산자", () => {
    test("contains - 포함", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          name: { contains: "Project" },
        },
      });

      for (const row of result.rows) {
        expect(row.name.toLowerCase()).toContain("project");
      }
    });

    test("startsWith - 시작", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          name: { startsWith: "Test" },
        },
      });

      for (const row of result.rows) {
        expect(row.name).toMatch(/^Test/i);
      }
    });

    test("endsWith - 끝", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          name: { endsWith: "Project" },
        },
      });

      for (const row of result.rows) {
        expect(row.name).toMatch(/Project$/i);
      }
    });
  });

  describe("NULL 체크 연산자", () => {
    test("isNull - NULL인 경우", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          description: { isNull: true },
        },
      });

      for (const row of result.rows) {
        expect(row.description).toBeNull();
      }
    });

    test("isNotNull - NULL이 아닌 경우", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          description: { isNotNull: true },
        },
      });

      for (const row of result.rows) {
        expect(row.description).not.toBeNull();
      }
    });
  });

  describe("날짜 연산자", () => {
    test("before - 이전", async () => {
      const targetDate = new Date("2100-01-01");
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          created_at: { before: targetDate },
        },
      });

      for (const row of result.rows) {
        expect(new Date(row.created_at).getTime()).toBeLessThan(targetDate.getTime());
      }
    });

    test("after - 이후", async () => {
      const targetDate = new Date("2000-01-01");
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          created_at: { after: targetDate },
        },
      });

      for (const row of result.rows) {
        expect(new Date(row.created_at).getTime()).toBeGreaterThan(targetDate.getTime());
      }
    });

    test("between - 범위 사이 (날짜)", async () => {
      const startDate = new Date("2000-01-01");
      const endDate = new Date("2100-01-01");
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          created_at: { between: [startDate, endDate] },
        },
      });

      for (const row of result.rows) {
        const date = new Date(row.created_at).getTime();
        expect(date).toBeGreaterThanOrEqual(startDate.getTime());
        expect(date).toBeLessThanOrEqual(endDate.getTime());
      }
    });
  });

  describe("FK 필드 필터링 (Relation → Foreign Key)", () => {
    test("company_id로 필터링 (eq 연산자) - BelongsToOne FK", async () => {
      const result = await DepartmentModel.findMany("P", {
        sonamuFilter: {
          company_id: { eq: 1 },
        },
      });

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.company?.id).toBe(1);
      }
    });

    test("company_id로 필터링 (in 연산자) - BelongsToOne FK", async () => {
      const result = await DepartmentModel.findMany("P", {
        sonamuFilter: {
          company_id: { in: [1, 2] },
        },
      });

      for (const row of result.rows) {
        expect([1, 2]).toContain(row.company?.id);
      }
    });

    test("company_id로 필터링 (gt 연산자) - BelongsToOne FK", async () => {
      const result = await DepartmentModel.findMany("P", {
        sonamuFilter: {
          company_id: { gt: 1 },
        },
      });

      for (const row of result.rows) {
        expect(row.company?.id).toBeGreaterThan(1);
      }
    });

    test("parent_id로 필터링 (nullable FK, isNull) - BelongsToOne FK", async () => {
      const result = await DepartmentModel.findMany("P", {
        sonamuFilter: {
          parent_id: { isNull: true },
        },
      });

      for (const row of result.rows) {
        expect(row.parent).toBeNull();
      }
    });

    test("parent_id로 필터링 (nullable FK, isNotNull) - BelongsToOne FK", async () => {
      const result = await DepartmentModel.findMany("P", {
        sonamuFilter: {
          parent_id: { isNotNull: true },
        },
      });

      for (const row of result.rows) {
        expect(row.parent).not.toBeNull();
      }
    });

    test("복합 조건 - FK + 일반 필드", async () => {
      const result = await DepartmentModel.findMany("P", {
        sonamuFilter: {
          company_id: 1,
          name: { contains: "부서" },
        },
      });

      for (const row of result.rows) {
        expect(row.company?.id).toBe(1);
        expect(row.name).toContain("부서");
      }
    });

    test("FK 필드에 여러 연산자 조합", async () => {
      const result = await DepartmentModel.findMany("P", {
        sonamuFilter: {
          company_id: {
            gte: 1,
            lte: 3,
          },
        },
      });

      for (const row of result.rows) {
        const companyId = row.company?.id ?? 0;
        expect(companyId).toBeGreaterThanOrEqual(1);
        expect(companyId).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("범위 연산자", () => {
    test("between - 범위 사이 (숫자)", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          budget: { between: ["10000", "50000"] },
        },
      });

      for (const row of result.rows) {
        const budget = Number(row.budget);
        expect(budget).toBeGreaterThanOrEqual(10000);
        expect(budget).toBeLessThanOrEqual(50000);
      }
    });
  });

  describe("복합 조건 테스트", () => {
    test("여러 필드 + 여러 연산자", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          status: { in: ["planning", "in_progress"] },
          budget: { gte: "5000", lte: "100000" },
          name: { contains: "Project" },
          description: { isNotNull: true },
        },
      });

      for (const row of result.rows) {
        expect(["planning", "in_progress"]).toContain(row.status);
        const budget = Number(row.budget);
        expect(budget).toBeGreaterThanOrEqual(5000);
        expect(budget).toBeLessThanOrEqual(100000);
        expect(row.name.toLowerCase()).toContain("project");
        expect(row.description).not.toBeNull();
      }
    });

    test("같은 필드에 여러 연산자", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          budget: {
            gte: "10000",
            lte: "50000",
          },
        },
      });

      for (const row of result.rows) {
        const budget = Number(row.budget);
        expect(budget).toBeGreaterThanOrEqual(10000);
        expect(budget).toBeLessThanOrEqual(50000);
      }
    });
  });

  describe("엣지 케이스", () => {
    test("빈 배열 in 연산자", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          status: { in: [] },
        },
      });

      // 빈 배열이면 결과가 없어야 함
      expect(result.rows.length).toBe(0);
    });

    test("between 잘못된 배열 길이 - 에러 발생", async () => {
      // between은 정확히 2개 값이 필요하므로, 잘못된 경우 에러를 던짐
      await expect(
        ProjectModel.findMany("A", {
          sonamuFilter: {
            //@ts-expect-error
            budget: { between: ["10000"] },
          },
        }),
      ).rejects.toThrow("필드 'budget'의 'between' 연산자는 길이 2의 배열 값을 요구합니다");
    });

    test("null 값과 ne 연산자", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          description: { ne: "특정 설명" },
        },
      });

      for (const row of result.rows) {
        // null인 경우와 다른 값인 경우 모두 포함
        if (row.description !== null) {
          expect(row.description).not.toBe("특정 설명");
        }
      }
    });
  });

  describe("특수 필드 타입", () => {
    test("JSON 필드 - image_urls isNull", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          image_urls: { isNull: true },
        },
      });

      expect(Array.isArray(result.rows)).toBe(true);
    });

    test("tsvector 필드 - textsearchable_index_col eq", async () => {
      const result = await ProjectModel.findMany("A", {
        sonamuFilter: {
          textsearchable_index_col: { eq: "project" },
        },
      });

      expect(Array.isArray(result.rows)).toBe(true);
    });
  });

  describe("검증 에러 테스트", () => {
    test("존재하지 않는 필드 - 에러 발생", async () => {
      await expect(
        ProjectModel.findMany("A", {
          //@ts-expect-error
          sonamuFilter: { nonExistentField: 1 },
        }),
      ).rejects.toThrow("필드 'nonExistentField'는 필터링할 수 없습니다");
    });

    test("relation 필드 - 에러 발생", async () => {
      await expect(
        ProjectModel.findMany("A", {
          //@ts-expect-error
          sonamuFilter: { employee: { eq: 1 } },
        }),
      ).rejects.toThrow("필드 'employee'는 필터링할 수 없습니다");
    });

    test("virtual 필드 - 에러 발생", async () => {
      await expect(
        ProjectModel.findMany("A", {
          //@ts-expect-error
          sonamuFilter: { virtual_test: { eq: 1 } },
        }),
      ).rejects.toThrow("필드 'virtual_test'는 필터링할 수 없습니다");
    });

    test("지원하지 않는 연산자 - 에러 발생", async () => {
      await expect(
        ProjectModel.findMany("A", {
          sonamuFilter: {
            //@ts-expect-error
            name: { between: [1, 2] },
          },
        }),
      ).rejects.toThrow("필드 'name'(타입: string)는 'between' 연산자를 지원하지 않습니다");
    });

    test("잘못된 enum 값 - 에러 발생", async () => {
      await expect(
        ProjectModel.findMany("A", {
          //@ts-expect-error
          sonamuFilter: { status: "invalid_status" },
        }),
      ).rejects.toThrow("필드 'status'의 값 'invalid_status'는 유효하지 않습니다");
    });
  });
});

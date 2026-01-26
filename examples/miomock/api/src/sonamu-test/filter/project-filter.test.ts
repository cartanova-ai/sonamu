import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { ProjectModel } from "../../application/project/project.model";

bootstrap(vi);

describe("Project Filter Integration", () => {
  test("단일 조건 필터 - id", async () => {
    const result = await ProjectModel.findMany("A", {
      sonamuFilter: {
        id: { eq: 1 },
      },
    });

    for (const row of result.rows) {
      expect(row.id).toBe(1);
    }
  });

  test("AND 조건 필터 - budget gt", async () => {
    const result = await ProjectModel.findMany("A", {
      sonamuFilter: {
        budget: { gt: 10000 },
      },
    });

    for (const row of result.rows) {
      // PostgreSQL numeric 타입은 문자열로 반환되므로 숫자로 변환하여 비교
      expect(Number(row.budget)).toBeGreaterThan(10000);
    }
  });

  test("문자열 검색 - name contains", async () => {
    const result = await ProjectModel.findMany("A", {
      sonamuFilter: {
        name: { contains: "Project" },
      },
    });

    for (const row of result.rows) {
      expect(row.name.toLowerCase()).toContain("project");
    }
  });

  test("문자열 검색 - description contains", async () => {
    const result = await ProjectModel.findMany("A", {
      sonamuFilter: {
        description: { contains: "Project" },
      },
    });

    expect(Array.isArray(result.rows)).toBe(true);
  });

  test("날짜 조건 - created_at before", async () => {
    const result = await ProjectModel.findMany("A", {
      sonamuFilter: {
        created_at: { before: new Date() },
      },
    });

    expect(Array.isArray(result.rows)).toBe(true);
  });

  test("날짜 범위 - deadline between", async () => {
    const result = await ProjectModel.findMany("A", {
      sonamuFilter: {
        deadline: { between: [new Date("2000-01-01"), new Date("2100-01-01")] },
      },
    });

    expect(Array.isArray(result.rows)).toBe(true);
  });

  test("in 연산자 - status 여러 값", async () => {
    const result = await ProjectModel.findMany("A", {
      sonamuFilter: {
        status: { in: ["planning", "in_progress"] },
      },
    });

    for (const row of result.rows) {
      expect(["planning", "in_progress"]).toContain(row.status);
    }
  });

  test("복합 조건 - status + budget", async () => {
    const result = await ProjectModel.findMany("A", {
      sonamuFilter: {
        status: { in: ["planning", "in_progress"] },
        budget: { gt: 5000 },
      },
    });

    for (const row of result.rows) {
      expect(["planning", "in_progress"]).toContain(row.status);
      // PostgreSQL numeric 타입은 문자열로 반환되므로 숫자로 변환하여 비교
      expect(Number(row.budget)).toBeGreaterThanOrEqual(5000);
    }
  });

  test("json 필드 - image_urls isNull", async () => {
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

  // 검증 에러 테스트
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

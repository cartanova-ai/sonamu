import assert from "assert";

import { DB, Naite, Sonamu } from "sonamu";
import { type Context } from "sonamu";
import { bootstrap, runWithContext, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { z } from "zod";

import { ProjectModel } from "./project.model";
import { type ProjectAskStreamEvents } from "./project.types";

bootstrap(vi);

const createEmployee = async (employeeNumber: string) => {
  const wdb = DB.getDB("w");
  const [userResult] = await wdb("users")
    .insert({
      email: `emp-${employeeNumber}@test.com`,
      username: `empuser${employeeNumber}`,
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
      employee_number: employeeNumber,
      created_at: new Date(),
    })
    .returning("id");
  return z.number().parse(empResult?.id);
};

const createTag = async (name: string) => {
  const wdb = DB.getDB("w");
  const [result] = await wdb("tags").insert({ name, created_at: new Date() }).returning("id");
  return z.number().parse(result?.id);
};

describe("ProjectModel", () => {
  // ============================================================
  // CDD 검증: project.spec.json → 프로젝트 관리
  // ============================================================

  describe("프로젝트 생성/수정", () => {
    test("save로 프로젝트 생성 (이름, 설명, 예산, 마감일, 상태)", async () => {
      const [projectId] = await ProjectModel.save([
        {
          name: "테스트프로젝트",
          status: "planning",
          description: "프로젝트 설명입니다",
          budget: "10000000.00",
          deadline: new Date("2026-12-31"),
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      assert(projectId);

      expect(Number.isInteger(projectId)).toBe(true);

      const project = await ProjectModel.findById("A", projectId);
      expect(project.name).toBe("테스트프로젝트");
      expect(project.status).toBe("planning");
      expect(project.description).toBe("프로젝트 설명입니다");
      expect(project.budget).toBe("10000000.00");
    });

    test("save로 프로젝트 정보 수정", async () => {
      const [projectId] = await ProjectModel.save([
        {
          name: "수정전프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      assert(projectId);

      await ProjectModel.save([
        {
          id: projectId,
          name: "수정후프로젝트",
          status: "in_progress",
          description: "설명 추가",
          budget: "5000000.00",
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);

      const updated = await ProjectModel.findById("A", projectId);
      expect(updated.name).toBe("수정후프로젝트");
      expect(updated.status).toBe("in_progress");
      expect(updated.description).toBe("설명 추가");
    });

    test("프로젝트 상태 전이 (planning → in_progress → completed)", async () => {
      const [projectId] = await ProjectModel.save([
        {
          name: "상태전이프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      assert(projectId);

      await ProjectModel.save([
        {
          id: projectId,
          name: "상태전이프로젝트",
          status: "in_progress",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      let project = await ProjectModel.findById("A", projectId);
      expect(project.status).toBe("in_progress");

      await ProjectModel.save([
        {
          id: projectId,
          name: "상태전이프로젝트",
          status: "completed",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      project = await ProjectModel.findById("A", projectId);
      expect(project.status).toBe("completed");
    });

    test("프로젝트에 이미지 첨부 (image_urls JSON)", async () => {
      const images = [
        { url: "/uploads/img1.png", name: "img1.png", mime_type: "image/png", size: 100 },
        { url: "/uploads/img2.png", name: "img2.png", mime_type: "image/png", size: 100 },
      ];

      const [projectId] = await ProjectModel.save([
        {
          name: "이미지프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: images,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      assert(projectId);

      const project = await ProjectModel.findById("A", projectId);
      expect(project.image_urls).toHaveLength(2);
    });
  });

  // ============================================================
  // CDD 검증: project.spec.json → 인력 배정
  // ============================================================
  describe("인력 배정", () => {
    test("프로젝트에 직원 배정 (ManyToMany)", async () => {
      const empId1 = await createEmployee("90000001");
      const empId2 = await createEmployee("90000002");

      const [projectId] = await ProjectModel.save([
        {
          name: "배정프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [empId1, empId2],
          tag_ids: [],
        },
      ]);
      assert(projectId);

      const project = await ProjectModel.findById("A", projectId);
      expect(project.employee).toHaveLength(2);
    });

    test("저장 시 해제된 직원은 즉시 반영", async () => {
      const empId1 = await createEmployee("90000003");
      const empId2 = await createEmployee("90000004");
      const empId3 = await createEmployee("90000005");

      const [projectId] = await ProjectModel.save([
        {
          name: "해제프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [empId1, empId2, empId3],
          tag_ids: [],
        },
      ]);
      assert(projectId);

      // empId2 해제 (1, 3만 남김)
      await ProjectModel.save([
        {
          id: projectId,
          name: "해제프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [empId1, empId3],
          tag_ids: [],
        },
      ]);

      const project = await ProjectModel.findById("A", projectId);
      expect(project.employee).toHaveLength(2);
      const empIds = project.employee.map((e) => e.id);
      expect(empIds).toContain(empId1);
      expect(empIds).toContain(empId3);
      expect(empIds).not.toContain(empId2);
    });
  });

  // ============================================================
  // CDD 검증: project.spec.json → 태그 배정
  // ============================================================
  describe("태그 배정", () => {
    test("프로젝트에 태그 붙이기 (ManyToMany)", async () => {
      const tagId1 = await createTag("태그A");
      const tagId2 = await createTag("태그B");

      const [projectId] = await ProjectModel.save([
        {
          name: "태그프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [tagId1, tagId2],
        },
      ]);
      assert(projectId);

      const project = await ProjectModel.findById("A", projectId);
      expect(project.tags).toHaveLength(2);
    });

    test("저장 시 해제된 태그는 즉시 반영", async () => {
      const tagId1 = await createTag("유지태그");
      const tagId2 = await createTag("해제태그");

      const [projectId] = await ProjectModel.save([
        {
          name: "태그해제프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [tagId1, tagId2],
        },
      ]);
      assert(projectId);

      await ProjectModel.save([
        {
          id: projectId,
          name: "태그해제프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [tagId1],
        },
      ]);

      const project = await ProjectModel.findById("A", projectId);
      expect(project.tags).toHaveLength(1);
      expect(project.tags[0]?.id).toBe(tagId1);
    });
  });

  describe("프로젝트 조회", () => {
    test("findById로 단건 조회", async () => {
      const [projectId] = await ProjectModel.save([
        {
          name: "조회테스트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      assert(projectId);

      const project = await ProjectModel.findById("A", projectId);
      expect(project).toBeDefined();
      expect(project.id).toBe(projectId);
    });

    test("존재하지 않는 프로젝트 조회 시 NotFoundException", async () => {
      await expect(ProjectModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany 페이지네이션", async () => {
      const result = await ProjectModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("프로젝트 삭제", () => {
    test("del은 hard delete", async () => {
      const wdb = DB.getDB("w");

      const [projectId] = await ProjectModel.save([
        {
          name: "삭제프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      assert(projectId);

      await ProjectModel.del([projectId]);

      const row = await wdb("projects").where("id", projectId).first();
      expect(row).toBeUndefined();
    });
  });

  // ============================================================
  // AI 어시스턴트 (skip — OpenAI API 키 필요)
  // ============================================================
  describe.skip("AI 어시스턴트", () => {
    test("ask SSE 스트리밍", async () => {
      const events: Set<keyof ProjectAskStreamEvents> = new Set();
      await runWithContext(
        {
          ...Sonamu.getContext(),
          session: null,
          user: null,
          locale: "",
          naiteStore: Naite.createStore(),
          createSSE: vi.fn().mockImplementation(() => {
            return {
              publish: vi.fn().mockImplementation((event, _data) => {
                events.add(event);
              }),
              end: vi.fn().mockImplementation(() => Promise.resolve()),
            };
          }),
        } satisfies Context,
        async () => {
          await ProjectModel.ask("지금 어떤 프로젝트들이 등록되어 있나요?");

          const toolCalls = Naite.get("project.agent.fetchProjects").result();
          const fullText = Naite.get("project.ask.fullText").first();
          const tokens = Naite.get("project.ask.token").result();

          assert(Array.isArray(toolCalls));
          assert(toolCalls.length === 1);

          z.string().parse(fullText);
          assert(tokens.length > 0);
          assert(fullText === tokens.join(""));
        },
      );
    });
  });
});

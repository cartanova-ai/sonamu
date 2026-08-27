import assert from "assert";

import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { ProjectModel } from "../project/project.model";
import { ProjectStatus } from "../sonamu.generated";
import { MilestoneModel } from "./milestone.model";

bootstrap(vi);

// 마일스톤 테스트가 의존하는 최소 프로젝트를 생성한다.
const createProject = async (overrides?: { status?: string; deadline?: Date | null }) => {
  const deadline = overrides?.deadline === undefined ? new Date("2026-12-31") : overrides.deadline;
  const [projectId] = await ProjectModel.save([
    {
      name: `테스트프로젝트-${Date.now()}`,
      status: ProjectStatus.parse(overrides?.status ?? "planning"),
      description: null,
      budget: null,
      deadline,
      image_urls: null,
      employee_ids: [],
      tag_ids: [],
    },
  ]);
  assert(projectId);
  return projectId;
};

describe("MilestoneModel", () => {
  // ============================================================
  // CDD 검증: milestone.spec.json → 마일스톤 관리
  // ============================================================

  // ============================================================
  // 마일스톤 생성/수정
  // ============================================================
  describe("마일스톤 생성/수정", () => {
    test("save로 마일스톤 생성", async () => {
      const projectId = await createProject();

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "MVP 완료",
          description: "첫 번째 마일스톤",
          due_date: new Date("2026-06-30"),
        },
      ]);
      assert(milestoneId);

      const milestone = await MilestoneModel.findById("A", milestoneId);
      expect(milestone.name).toBe("MVP 완료");
      expect(milestone.description).toBe("첫 번째 마일스톤");
      expect(milestone.project.id).toBe(projectId);
      expect(milestone.completed_at).toBeNull();
    });

    test("save로 마일스톤 수정", async () => {
      const projectId = await createProject();

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "수정전",
          due_date: new Date("2026-06-30"),
        },
      ]);
      assert(milestoneId);

      await MilestoneModel.save([
        {
          id: milestoneId,
          project_id: projectId,
          name: "수정후",
          due_date: new Date("2026-07-31"),
        },
      ]);

      const updated = await MilestoneModel.findById("A", milestoneId);
      expect(updated.name).toBe("수정후");
    });

    test("description이 nullable — null로 생성 가능", async () => {
      const projectId = await createProject();

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "설명없음",
          due_date: new Date("2026-06-30"),
        },
      ]);
      assert(milestoneId);

      const milestone = await MilestoneModel.findById("A", milestoneId);
      expect(milestone.description).toBeNull();
    });
  });

  // ============================================================
  // CDD 검증: due_date 검증 (프로젝트 deadline 이후 불가)
  // ============================================================
  describe("due_date 검증", () => {
    test("due_date가 프로젝트 deadline 이전이면 정상 생성", async () => {
      const projectId = await createProject({ deadline: new Date("2026-12-31") });

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "마감일전",
          due_date: new Date("2026-11-30"),
        },
      ]);
      assert(milestoneId);
    });

    test("due_date가 프로젝트 deadline 이후이면 ValidationError", async () => {
      const projectId = await createProject({ deadline: new Date("2026-06-30") });

      await expect(
        MilestoneModel.save([
          {
            project_id: projectId,
            name: "마감일후",
            due_date: new Date("2026-07-01"),
          },
        ]),
      ).rejects.toThrow();
    });

    test("프로젝트 deadline이 null이면 due_date 검증 skip", async () => {
      const projectId = await createProject({ deadline: null });

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "무기한프로젝트",
          due_date: new Date("2099-12-31"),
        },
      ]);
      assert(milestoneId);
    });
  });

  // ============================================================
  // CDD 검증: 프로젝트 상태 검증
  // ============================================================
  describe("프로젝트 상태 검증", () => {
    test("completed 상태 프로젝트에 마일스톤 추가 시 ValidationError", async () => {
      const projectId = await createProject({ status: "completed" });

      await expect(
        MilestoneModel.save([
          {
            project_id: projectId,
            name: "완료된프로젝트",
            due_date: new Date("2026-06-30"),
          },
        ]),
      ).rejects.toThrow();
    });

    test("cancelled 상태 프로젝트에 마일스톤 추가 시 ValidationError", async () => {
      const projectId = await createProject({ status: "cancelled" });

      await expect(
        MilestoneModel.save([
          {
            project_id: projectId,
            name: "취소된프로젝트",
            due_date: new Date("2026-06-30"),
          },
        ]),
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // CDD 검증: 조회
  // ============================================================
  describe("마일스톤 조회", () => {
    test("findById로 단건 조회", async () => {
      const projectId = await createProject();

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "단건조회",
          due_date: new Date("2026-06-30"),
        },
      ]);
      assert(milestoneId);

      const milestone = await MilestoneModel.findById("A", milestoneId);
      expect(milestone).toBeDefined();
      expect(milestone.id).toBe(milestoneId);
    });

    test("존재하지 않는 마일스톤 조회 시 NotFoundException", async () => {
      await expect(MilestoneModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany — project_id 필터", async () => {
      const projectId = await createProject();

      await MilestoneModel.save([
        {
          project_id: projectId,
          name: "필터테스트1",
          due_date: new Date("2026-06-30"),
        },
      ]);
      await MilestoneModel.save([
        {
          project_id: projectId,
          name: "필터테스트2",
          due_date: new Date("2026-07-31"),
        },
      ]);

      const result = await MilestoneModel.findMany("A", {
        project_id: projectId,
        num: 10,
        page: 1,
      });

      expect(result.total).toBe(2);
      result.rows.forEach((row) => {
        expect(row.project.id).toBe(projectId);
      });
    });

    test("findMany — 기본 정렬 due_date ASC", async () => {
      const projectId = await createProject();

      await MilestoneModel.save([
        {
          project_id: projectId,
          name: "나중",
          due_date: new Date("2026-09-30"),
        },
      ]);
      await MilestoneModel.save([
        {
          project_id: projectId,
          name: "먼저",
          due_date: new Date("2026-03-31"),
        },
      ]);

      const result = await MilestoneModel.findMany("A", {
        project_id: projectId,
        num: 10,
        page: 1,
      });

      expect(result.rows.length).toBe(2);
      const dates = result.rows.map((r) => new Date(r.due_date).getTime());
      expect(dates[0]).toBeLessThanOrEqual(dates[1] ?? 0);
    });
  });

  // ============================================================
  // CDD 검증: 완료/완료취소
  // ============================================================
  describe("완료/완료취소", () => {
    test("complete — completed_at을 현재 시각으로 설정", async () => {
      const projectId = await createProject();

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "완료대상",
          due_date: new Date("2026-06-30"),
        },
      ]);
      assert(milestoneId);

      const completed = await MilestoneModel.complete(milestoneId);
      expect(completed.completed_at).not.toBeNull();
    });

    test("uncomplete — completed_at을 null로 설정", async () => {
      const projectId = await createProject();

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "완료취소대상",
          due_date: new Date("2026-06-30"),
        },
      ]);
      assert(milestoneId);

      await MilestoneModel.complete(milestoneId);
      const uncompleted = await MilestoneModel.uncomplete(milestoneId);
      expect(uncompleted.completed_at).toBeNull();
    });

    test("존재하지 않는 마일스톤 complete 시 NotFoundException", async () => {
      await expect(MilestoneModel.complete(999999)).rejects.toThrow();
    });

    test("존재하지 않는 마일스톤 uncomplete 시 NotFoundException", async () => {
      await expect(MilestoneModel.uncomplete(999999)).rejects.toThrow();
    });
  });

  // ============================================================
  // CDD 검증: 삭제
  // ============================================================
  describe("마일스톤 삭제", () => {
    test("del은 hard delete", async () => {
      const wdb = DB.getDB("w");
      const projectId = await createProject();

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "삭제대상",
          due_date: new Date("2026-06-30"),
        },
      ]);
      assert(milestoneId);

      await MilestoneModel.del([milestoneId]);

      const row = await wdb("milestones").where("id", milestoneId).first();
      expect(row).toBeUndefined();
    });

    test("프로젝트 삭제 시 CASCADE로 마일스톤 자동 삭제", async () => {
      const wdb = DB.getDB("w");
      const projectId = await createProject();

      const [milestoneId] = await MilestoneModel.save([
        {
          project_id: projectId,
          name: "CASCADE삭제",
          due_date: new Date("2026-06-30"),
        },
      ]);
      assert(milestoneId);

      await ProjectModel.del([projectId]);

      const row = await wdb("milestones").where("id", milestoneId).first();
      expect(row).toBeUndefined();
    });
  });
});

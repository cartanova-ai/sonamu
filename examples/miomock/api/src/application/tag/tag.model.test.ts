import assert from "assert";

import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { ProjectModel } from "../project/project.model";
import { TagModel } from "./tag.model";

bootstrap(vi);

describe("TagModel", () => {
  // ============================================================
  // CDD 검증: tag.spec.json → 태그 관리
  // ============================================================

  describe("태그 생성/수정", () => {
    test("save로 태그 생성", async () => {
      const [tagId] = await TagModel.save([{ name: "테스트태그" }]);
      assert(tagId);

      expect(Number.isInteger(tagId)).toBe(true);

      const tag = await TagModel.findById("A", tagId);
      expect(tag.name).toBe("테스트태그");
    });

    test("다국어 이름 저장 (name_ko, name_en)", async () => {
      const [tagId] = await TagModel.save([
        {
          name: "개발",
          name_ko: "개발",
          name_en: "Development",
        },
      ]);
      assert(tagId);

      const tag = await TagModel.findById("A", tagId);
      expect(tag.name_ko).toBe("개발");
      expect(tag.name_en).toBe("Development");
    });

    test("다국어 이름 nullable", async () => {
      const [tagId] = await TagModel.save([{ name: "기본태그" }]);
      assert(tagId);

      const tag = await TagModel.findById("A", tagId);
      expect(tag.name_ko).toBeNull();
      expect(tag.name_en).toBeNull();
    });

    test("save로 태그 수정", async () => {
      const [tagId] = await TagModel.save([{ name: "수정전태그" }]);
      assert(tagId);

      const created = await TagModel.findById("A", tagId);
      await TagModel.save([
        { ...created, name: "수정후태그", name_ko: "수정후", name_en: "Updated" },
      ]);

      const updated = await TagModel.findById("A", tagId);
      expect(updated.name).toBe("수정후태그");
      expect(updated.name_ko).toBe("수정후");
      expect(updated.name_en).toBe("Updated");
    });
  });

  describe("태그 조회", () => {
    test("findById로 단건 조회", async () => {
      const [tagId] = await TagModel.save([{ name: "조회태그" }]);
      assert(tagId);

      const tag = await TagModel.findById("A", tagId);
      expect(tag).toBeDefined();
      expect(tag.id).toBe(tagId);
      expect(tag.name).toBe("조회태그");
    });

    test("존재하지 않는 태그 조회 시 NotFoundException", async () => {
      await expect(TagModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany 페이지네이션", async () => {
      const result = await TagModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("태그 삭제", () => {
    test("del은 hard delete", async () => {
      const wdb = DB.getDB("w");

      const [tagId] = await TagModel.save([{ name: "삭제태그" }]);
      assert(tagId);

      await TagModel.del([tagId]);

      const row = await wdb("tags").where("id", tagId).first();
      expect(row).toBeUndefined();
    });
  });

  // ============================================================
  // CDD 검증: Contract → 프로젝트에 사용 중인 태그 삭제
  // ============================================================
  describe("프로젝트 연관 태그 삭제", () => {
    test("프로젝트에 붙은 태그를 삭제하면 project_tags 연관도 삭제", async () => {
      const wdb = DB.getDB("w");

      const [tagId] = await TagModel.save([{ name: "연관삭제태그" }]);
      assert(tagId);

      // ProjectModel.save로 프로젝트 생성 + 태그 연결
      const [projectId] = await ProjectModel.save([
        {
          name: "연관프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [tagId],
        },
      ]);
      assert(projectId);

      // 연관 확인
      const before = await wdb("project_tags").where("tag_id", tagId);
      expect(before).toHaveLength(1);

      // 태그 삭제
      await TagModel.del([tagId]);

      // project_tags도 삭제되었는지 확인
      const after = await wdb("project_tags").where("tag_id", tagId);
      expect(after).toHaveLength(0);
    });
  });
});

import assert from "assert";

import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { FileModel } from "./file.model";

bootstrap(vi);

describe("FileModel", () => {
  // ============================================================
  // CDD 검증: file.spec.json → 파일 관리
  // ============================================================

  describe("파일 생성/수정", () => {
    test("save로 파일 메타데이터 생성", async () => {
      const [fileId] = await FileModel.save([
        {
          name: "test-image.png",
          url: "/uploads/test-image.png",
          mime_type: "image/png",
        },
      ]);
      assert(fileId);

      expect(Number.isInteger(fileId)).toBe(true);

      const file = await FileModel.findById("A", fileId);
      expect(file.name).toBe("test-image.png");
      expect(file.url).toBe("/uploads/test-image.png");
      expect(file.mime_type).toBe("image/png");
    });

    test("save로 파일 메타데이터 수정", async () => {
      const [fileId] = await FileModel.save([
        {
          name: "before.pdf",
          url: "/uploads/before.pdf",
          mime_type: "application/pdf",
        },
      ]);
      assert(fileId);

      const created = await FileModel.findById("A", fileId);
      await FileModel.save([
        {
          ...created,
          name: "after.pdf",
        },
      ]);

      const updated = await FileModel.findById("A", fileId);
      expect(updated.name).toBe("after.pdf");
    });

    test("중복 URL은 DB 유니크 인덱스로 차단 (직접 INSERT)", async () => {
      const wdb = DB.getDB("w");

      await wdb("files").insert({
        name: "dup1.png",
        url: "/uploads/unique-url-test.png",
        mime_type: "image/png",
        created_at: new Date(),
      });

      await expect(
        wdb("files").insert({
          name: "dup2.png",
          url: "/uploads/unique-url-test.png",
          mime_type: "image/png",
          created_at: new Date(),
        }),
      ).rejects.toThrow();
    });
  });

  describe("파일 조회", () => {
    test("findById로 단건 조회", async () => {
      const [fileId] = await FileModel.save([
        {
          name: "find-test.jpg",
          url: "/uploads/find-test.jpg",
          mime_type: "image/jpeg",
        },
      ]);
      assert(fileId);

      const file = await FileModel.findById("A", fileId);
      expect(file).toBeDefined();
      expect(file.id).toBe(fileId);
      expect(file.name).toBe("find-test.jpg");
    });

    test("존재하지 않는 파일 조회 시 NotFoundException", async () => {
      await expect(FileModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany 페이지네이션", async () => {
      const result = await FileModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("파일 삭제", () => {
    test("del은 hard delete", async () => {
      const wdb = DB.getDB("w");

      const [fileId] = await FileModel.save([
        {
          name: "delete-test.txt",
          url: "/uploads/delete-test.txt",
          mime_type: "text/plain",
        },
      ]);
      assert(fileId);

      await FileModel.del([fileId]);

      const row = await wdb("files").where("id", fileId).first();
      expect(row).toBeUndefined();
    });
  });
});

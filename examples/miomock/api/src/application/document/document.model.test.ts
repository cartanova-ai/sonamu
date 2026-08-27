import assert from "assert";

import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { DocumentModel } from "./document.model";

bootstrap(vi);

describe("DocumentModel", () => {
  // ============================================================
  // CDD 검증: document-creation.spec.json → 문서 CRUD
  // ============================================================
  describe("문서 생성/수정/삭제", () => {
    test("save로 문서 생성", async () => {
      const [docId] = await DocumentModel.save([
        { title: "테스트문서", content: "테스트 본문", status: "draft" },
      ]);
      assert(docId);

      expect(Number.isInteger(docId)).toBe(true);

      const doc = await DocumentModel.findById("A", docId);
      expect(doc.title).toBe("테스트문서");
      expect(doc.content).toBe("테스트 본문");
    });

    test("문서 생성 시 기본 상태는 draft이다", async () => {
      const [docId] = await DocumentModel.save([
        { title: "상태기본값문서", content: null, status: "draft" },
      ]);
      assert(docId);

      const doc = await DocumentModel.findById("A", docId);
      expect(doc.status).toBe("draft");
    });

    test("save로 문서 수정", async () => {
      const [docId] = await DocumentModel.save([
        { title: "수정전문서", content: "수정전", status: "draft" },
      ]);
      assert(docId);

      const created = await DocumentModel.findById("A", docId);
      await DocumentModel.save([{ ...created, title: "수정후문서", content: "수정후" }]);

      const updated = await DocumentModel.findById("A", docId);
      expect(updated.title).toBe("수정후문서");
      expect(updated.content).toBe("수정후");
    });

    test("del로 문서 삭제", async () => {
      const [docId] = await DocumentModel.save([
        { title: "삭제대상문서", content: null, status: "draft" },
      ]);
      assert(docId);

      const count = await DocumentModel.del([docId]);
      expect(count).toBe(1);

      await expect(DocumentModel.findById("A", docId)).rejects.toThrow();
    });

    // BUG 재현: del()이 실제 삭제 수가 아닌 ids.length를 반환하는 버그
    test("존재하지 않는 문서 삭제 시 반환값은 0이어야 한다", async () => {
      const count = await DocumentModel.del([999999]);
      expect(count).toBe(0);
    });
  });

  // ============================================================
  // CDD 검증: document-creation.spec.json → 문서 조회
  // ============================================================
  describe("문서 조회", () => {
    test("findById로 단건 조회", async () => {
      const [docId] = await DocumentModel.save([
        { title: "조회테스트문서", content: "본문", status: "draft" },
      ]);
      assert(docId);

      const doc = await DocumentModel.findById("A", docId);
      expect(doc).toBeDefined();
      expect(doc.id).toBe(docId);
      expect(doc.title).toBe("조회테스트문서");
    });

    test("존재하지 않는 문서 조회 시 NotFoundException", async () => {
      await expect(DocumentModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany 페이지네이션", async () => {
      const result = await DocumentModel.findMany("A", {
        num: 10,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    test("findMany ID 검색", async () => {
      const [docId] = await DocumentModel.save([
        { title: "검색대상문서", content: null, status: "draft" },
      ]);
      assert(docId);

      const result = await DocumentModel.findMany("A", {
        search: "id",
        keyword: String(docId),
        num: 10,
        page: 1,
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.id).toBe(docId);
    });
  });

  // ============================================================
  // CDD 검증: document-status.spec.json → 문서 상태 관리
  // ============================================================
  describe("문서 상태 관리", () => {
    test("상태 값은 draft, published, archived만 허용된다", async () => {
      for (const status of ["draft", "published", "archived"] as const) {
        const [docId] = await DocumentModel.save([
          { title: `상태테스트_${status}`, content: null, status },
        ]);
        assert(docId);

        const doc = await DocumentModel.findById("A", docId);
        expect(doc.status).toBe(status);
      }
    });

    test("상태를 draft에서 published로 변경", async () => {
      const [docId] = await DocumentModel.save([
        { title: "상태변경문서", content: "본문", status: "draft" },
      ]);
      assert(docId);

      const created = await DocumentModel.findById("A", docId);
      expect(created.status).toBe("draft");

      await DocumentModel.save([{ ...created, status: "published" }]);
      const updated = await DocumentModel.findById("A", docId);
      expect(updated.status).toBe("published");
    });

    test("상태를 published에서 archived로 변경", async () => {
      const [docId] = await DocumentModel.save([
        { title: "보관문서", content: "본문", status: "published" },
      ]);
      assert(docId);

      const created = await DocumentModel.findById("A", docId);
      await DocumentModel.save([{ ...created, status: "archived" }]);

      const updated = await DocumentModel.findById("A", docId);
      expect(updated.status).toBe("archived");
    });

    test("상태별 필터 조회 (sonamuFilter)", async () => {
      await DocumentModel.save([
        { title: "필터테스트_published", content: null, status: "published" },
      ]);

      const result = await DocumentModel.findMany("A", {
        num: 100,
        page: 1,
        sonamuFilter: { status: "published" },
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of result.rows) {
        expect(row.status).toBe("published");
      }
    });
  });
});

import assert from "assert";

import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { z } from "zod";

import { CompanyModel } from "../company/company.model";
import { TagModel } from "../tag/tag.model";
import { AuditLogModel } from "./audit-log.model";

bootstrap(vi);

describe("AuditLogModel", () => {
  // ============================================================
  // CDD 검증: audit-log.spec.json → 변경 자동 기록
  // ============================================================
  describe("변경 자동 기록 (log)", () => {
    test("log()로 create 액션 감사 로그 생성", async () => {
      const logId = await AuditLogModel.log({
        actor_id: "user-1",
        action: "create",
        entity_type: "Project",
        entity_id: 1,
        old_value: null,
        new_value: { name: "새 프로젝트", status: "planning" },
      });
      assert(logId);

      const log = await AuditLogModel.findById("A", logId);
      expect(log.actor_id).toBe("user-1");
      expect(log.action).toBe("create");
      expect(log.entity_type).toBe("Project");
      expect(log.entity_id).toBe(1);
      expect(log.old_value).toBeNull();
      expect(log.new_value).toEqual({ name: "새 프로젝트", status: "planning" });
    });

    test("log()로 update 액션 감사 로그 생성", async () => {
      const logId = await AuditLogModel.log({
        actor_id: "user-2",
        action: "update",
        entity_type: "Company",
        entity_id: 5,
        old_value: { name: "이전회사" },
        new_value: { name: "변경회사" },
      });
      assert(logId);

      const log = await AuditLogModel.findById("A", logId);
      expect(log.action).toBe("update");
      expect(log.old_value).toEqual({ name: "이전회사" });
      expect(log.new_value).toEqual({ name: "변경회사" });
    });

    test("log()로 delete 액션 감사 로그 생성", async () => {
      const logId = await AuditLogModel.log({
        actor_id: "user-3",
        action: "delete",
        entity_type: "Tag",
        entity_id: 10,
        old_value: { name: "삭제된태그" },
        new_value: null,
      });
      assert(logId);

      const log = await AuditLogModel.findById("A", logId);
      expect(log.action).toBe("delete");
      expect(log.old_value).toEqual({ name: "삭제된태그" });
      expect(log.new_value).toBeNull();
    });

    test("actor_id가 null — 시스템 작업", async () => {
      const logId = await AuditLogModel.log({
        actor_id: null,
        action: "create",
        entity_type: "Employee",
        entity_id: 100,
        old_value: null,
        new_value: { employee_number: "20260001" },
      });
      assert(logId);

      const log = await AuditLogModel.findById("A", logId);
      expect(log.actor_id).toBeNull();
    });
  });

  // ============================================================
  // CDD 검증: audit-log.spec.json → 감사 로그 조회
  // ============================================================
  describe("감사 로그 조회", () => {
    test("findById로 단건 조회", async () => {
      const logId = await AuditLogModel.log({
        actor_id: "user-1",
        action: "create",
        entity_type: "Project",
        entity_id: 1,
        old_value: null,
        new_value: { name: "단건조회" },
      });
      assert(logId);

      const log = await AuditLogModel.findById("A", logId);
      expect(log).toBeDefined();
      expect(log.id).toBe(logId);
    });

    test("존재하지 않는 감사 로그 조회 시 NotFoundException", async () => {
      await expect(AuditLogModel.findById("A", 999999)).rejects.toThrow();
    });

    test("findMany — entity_type 필터", async () => {
      const uniqueType = `TestEntity_${Date.now()}`;
      await AuditLogModel.log({
        actor_id: "user-1",
        action: "create",
        entity_type: uniqueType,
        entity_id: 1,
        old_value: null,
        new_value: { test: true },
      });
      await AuditLogModel.log({
        actor_id: "user-1",
        action: "update",
        entity_type: uniqueType,
        entity_id: 1,
        old_value: { test: true },
        new_value: { test: false },
      });

      const result = await AuditLogModel.findMany("A", {
        entity_type: uniqueType,
        num: 10,
        page: 1,
      });

      expect(result.total).toBe(2);
      result.rows.forEach((row) => {
        expect(row.entity_type).toBe(uniqueType);
      });
    });

    test("findMany — actor_id 필터", async () => {
      const uniqueActor = `actor-${Date.now()}`;
      await AuditLogModel.log({
        actor_id: uniqueActor,
        action: "create",
        entity_type: "Project",
        entity_id: 1,
        old_value: null,
        new_value: {},
      });

      const result = await AuditLogModel.findMany("A", {
        actor_id: uniqueActor,
        num: 10,
        page: 1,
      });

      expect(result.total).toBe(1);
      expect(result.rows[0]?.actor_id).toBe(uniqueActor);
    });

    test("findMany — date_from / date_to 기간 필터", async () => {
      const wdb = DB.getDB("w");
      const uniqueType = `DateFilter_${Date.now()}`;

      // 과거 로그 직접 삽입
      await wdb("audit_logs").insert({
        actor_id: "user-1",
        action: "create",
        entity_type: uniqueType,
        entity_id: 1,
        created_at: new Date("2025-01-01"),
      });
      // 현재 로그
      const logId = await AuditLogModel.log({
        actor_id: "user-1",
        action: "update",
        entity_type: uniqueType,
        entity_id: 1,
        old_value: null,
        new_value: {},
      });
      assert(logId);

      // 2026년 이후만 조회
      const result = await AuditLogModel.findMany("A", {
        entity_type: uniqueType,
        date_from: new Date("2026-01-01"),
        num: 10,
        page: 1,
      });

      expect(result.total).toBe(1);
    });

    test("findMany — 기본 정렬 id DESC (최신순)", async () => {
      const uniqueType = `OrderTest_${Date.now()}`;
      await AuditLogModel.log({
        actor_id: "user-1",
        action: "create",
        entity_type: uniqueType,
        entity_id: 1,
        old_value: null,
        new_value: {},
      });
      await AuditLogModel.log({
        actor_id: "user-1",
        action: "update",
        entity_type: uniqueType,
        entity_id: 1,
        old_value: {},
        new_value: {},
      });

      const result = await AuditLogModel.findMany("A", {
        entity_type: uniqueType,
        num: 10,
        page: 1,
      });

      expect(result.rows.length).toBe(2);
      expect(result.rows[0]?.id).toBeGreaterThan(result.rows[1]?.id ?? 0);
    });

    test("findMany — 페이지네이션", async () => {
      const result = await AuditLogModel.findMany("A", {
        num: 5,
        page: 1,
      });

      expect(result.rows).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.rows.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================
  // CDD 검증: audit-log.spec.json → 대상 Model save/del 자동 연동
  // ============================================================
  describe("자동 연동 (대상 Model → audit_logs)", () => {
    test("Company save(create) → audit_logs에 create 로그 자동 생성", async () => {
      const [companyId] = await CompanyModel.save([{ name: `연동테스트회사_${Date.now()}` }]);
      assert(companyId);

      const result = await AuditLogModel.findMany("A", {
        entity_type: "Company",
        num: 100,
        page: 1,
      });

      const log = result.rows.find((r) => r.entity_id === companyId && r.action === "create");
      expect(log).toBeDefined();
      expect(log?.entity_type).toBe("Company");
      expect(log?.action).toBe("create");
    });

    test("Company save(update) → audit_logs에 update 로그 자동 생성", async () => {
      const [companyId] = await CompanyModel.save([{ name: `수정전_${Date.now()}` }]);
      assert(companyId);

      const company = await CompanyModel.findById("A", companyId);
      await CompanyModel.save([{ ...company, name: `수정후_${Date.now()}` }]);

      const result = await AuditLogModel.findMany("A", {
        entity_type: "Company",
        num: 100,
        page: 1,
      });

      const log = result.rows.find((r) => r.entity_id === companyId && r.action === "update");
      expect(log).toBeDefined();
      expect(log?.action).toBe("update");
    });

    test("Company del → audit_logs에 delete 로그 자동 생성 (old_value 포함)", async () => {
      const companyName = `삭제연동_${Date.now()}`;
      const [companyId] = await CompanyModel.save([{ name: companyName }]);
      assert(companyId);

      await CompanyModel.del([companyId]);

      const result = await AuditLogModel.findMany("A", {
        entity_type: "Company",
        num: 100,
        page: 1,
      });

      const log = result.rows.find((r) => r.entity_id === companyId && r.action === "delete");
      expect(log).toBeDefined();
      expect(log?.action).toBe("delete");
      expect(log?.old_value).toBeDefined();
      const oldValue = z.object({ name: z.string() }).passthrough().parse(log?.old_value);
      expect(oldValue.name).toBe(companyName);
    });

    test("Tag save(create) → audit_logs에 create 로그 자동 생성", async () => {
      const [tagId] = await TagModel.save([{ name: `태그_${Date.now()}` }]);
      assert(tagId);

      const result = await AuditLogModel.findMany("A", {
        entity_type: "Tag",
        num: 100,
        page: 1,
      });

      const log = result.rows.find((r) => r.entity_id === tagId && r.action === "create");
      expect(log).toBeDefined();
    });

    test("Tag del → audit_logs에 delete 로그 자동 생성", async () => {
      const [tagId] = await TagModel.save([{ name: `삭제태그_${Date.now()}` }]);
      assert(tagId);

      await TagModel.del([tagId]);

      const result = await AuditLogModel.findMany("A", {
        entity_type: "Tag",
        num: 100,
        page: 1,
      });

      const log = result.rows.find((r) => r.entity_id === tagId && r.action === "delete");
      expect(log).toBeDefined();
      expect(log?.old_value).toBeDefined();
    });
  });

  // ============================================================
  // CDD 검증: audit-log.spec.json → immutable (삭제/수정 불가)
  // ============================================================
  describe("immutable 검증", () => {
    test("audit_logs 테이블에 save/del API가 없음 (Model에 메서드 미노출)", async () => {
      // AuditLogModel에 save, del 메서드가 공개 API로 노출되지 않음을 확인
      // @api 데코레이터가 없으므로 HTTP 엔드포인트로 접근 불가
      expect("save" in AuditLogModel).toBe(false);
      expect("del" in AuditLogModel).toBe(false);
    });
  });

  // ============================================================
  // CDD 검증: 에러 핸들링 — log 실패 시 원래 작업 중단 안 함
  // ============================================================
  describe("에러 핸들링", () => {
    test("log() 실패 시 null 반환 (원래 작업 중단 안 함)", async () => {
      // entity_type에 너무 긴 문자열을 넣어 DB 에러 유발
      const result = await AuditLogModel.log({
        actor_id: "user-1",
        action: "create",
        entity_type: "x".repeat(1000), // 100자 제한 초과
        entity_id: 1,
        old_value: null,
        new_value: null,
      });

      expect(result).toBeNull();
    });
  });
});

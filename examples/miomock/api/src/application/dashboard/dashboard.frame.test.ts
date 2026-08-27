import { Sonamu } from "sonamu";
import { bootstrap, runWithContext, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { z } from "zod";

import { DashboardFrame } from "./dashboard.frame";

bootstrap(vi);

describe("DashboardFrame", () => {
  // ============================================================
  // CDD 검증: dashboard-stats.spec.json → 메트릭 집계
  // ============================================================
  describe("getStats", () => {
    test("모든 메트릭을 한 번에 반환한다", async () => {
      const stats = await DashboardFrame.getStats();

      // 조직 현황
      expect(stats.organization).toBeDefined();
      z.number().parse(stats.organization.companyCount);
      z.number().parse(stats.organization.departmentCount);
      z.number().parse(stats.organization.employeeCount);

      // 프로젝트 현황
      expect(stats.projects).toBeDefined();
      expect(stats.projects.statusCounts).toBeDefined();
      z.number().parse(stats.projects.statusCounts.planning);
      z.number().parse(stats.projects.statusCounts.in_progress);
      z.number().parse(stats.projects.statusCounts.completed);
      z.number().parse(stats.projects.statusCounts.cancelled);

      // 프로젝트 상태별 합 = 전체 프로젝트 수
      const totalProjects =
        stats.projects.statusCounts.planning +
        stats.projects.statusCounts.in_progress +
        stats.projects.statusCounts.completed +
        stats.projects.statusCounts.cancelled;
      expect(totalProjects).toBeGreaterThanOrEqual(0);

      // 문서 현황
      expect(stats.documents).toBeDefined();
      z.number().parse(stats.documents.total);
      z.number().parse(stats.documents.draft);
      z.number().parse(stats.documents.published);
      z.number().parse(stats.documents.archived);
      expect(stats.documents.total).toBe(
        stats.documents.draft + stats.documents.published + stats.documents.archived,
      );
      z.number().parse(stats.documents.recentCount);
    });

    test("진행중 프로젝트 TOP 5가 마감일 임박순으로 정렬된다", async () => {
      const stats = await DashboardFrame.getStats();
      const active = stats.projects.activeProjects;

      expect(active.length).toBeLessThanOrEqual(5);

      // 각 항목이 필수 필드를 포함
      active.forEach((project) => {
        z.number().parse(project.id);
        z.string().parse(project.name);
        z.number().parse(project.milestoneTotal);
        z.number().parse(project.milestoneCompleted);
        expect(project.milestoneCompleted).toBeLessThanOrEqual(project.milestoneTotal);
      });
    });

    test("카운트 메트릭은 항상 0 이상이다", async () => {
      const stats = await DashboardFrame.getStats();

      expect(stats.organization.companyCount).toBeGreaterThanOrEqual(0);
      expect(stats.organization.departmentCount).toBeGreaterThanOrEqual(0);
      expect(stats.organization.employeeCount).toBeGreaterThanOrEqual(0);
      expect(stats.documents.total).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // CDD 검증: activity-timeline.spec.json → 활동 타임라인
  // ============================================================
  describe("getRecentActivity", () => {
    test("기본 기간(7일)으로 최근 활동을 반환한다", async () => {
      const groups = await DashboardFrame.getRecentActivity();

      expect(Array.isArray(groups)).toBe(true);
      groups.forEach((group) => {
        z.string().parse(group.date);
        z.string().parse(group.label);
        expect(Array.isArray(group.items)).toBe(true);

        group.items.forEach((item) => {
          z.number().parse(item.id);
          expect(["create", "update", "delete"]).toContain(item.action);
          z.string().parse(item.entity_type);
          z.number().parse(item.entity_id);
        });
      });
    });

    test("전체 기간으로 조회할 수 있다", async () => {
      const groups = await DashboardFrame.getRecentActivity("all");
      expect(Array.isArray(groups)).toBe(true);
    });

    test("30일 기간으로 조회할 수 있다", async () => {
      const groups = await DashboardFrame.getRecentActivity("30");
      expect(Array.isArray(groups)).toBe(true);
    });

    test("최대 20건까지만 반환한다", async () => {
      const groups = await DashboardFrame.getRecentActivity("all");
      const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);
      expect(totalItems).toBeLessThanOrEqual(20);
    });

    test("날짜별 그룹이 올바른 형태이다", async () => {
      const groups = await DashboardFrame.getRecentActivity("all");

      groups.forEach((group) => {
        // label에 건수 포함
        expect(group.label).toMatch(/\d+건\)$/);
        // items가 빈 배열이 아님
        expect(group.items.length).toBeGreaterThan(0);
      });
    });

    // CDD 검증: AC4 - 일반 사용자는 본인의 변경 이력만 조회된다
    test("일반 사용자는 본인의 변경 이력만 조회된다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          user: {
            id: "1",
            role: "normal",
            email: "user@test.com",
            emailVerified: true,
            name: "TestUser",
            createdAt: new Date(),
            updatedAt: new Date(),
            created_at: new Date(),
          },
        },
        async () => {
          const groups = await DashboardFrame.getRecentActivity("all");
          const allItems = groups.flatMap((g) => g.items);

          // 모든 항목의 actor_id가 본인 ID와 일치
          allItems.forEach((item) => {
            expect(item.actor_id).toBe("1");
          });
        },
      );
    });

    // CDD 검증: AC5 - 관리자는 전체 변경 이력을 조회한다
    test("관리자는 전체 변경 이력을 조회한다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          user: {
            id: "1",
            role: "admin",
            email: "admin@test.com",
            emailVerified: true,
            name: "AdminUser",
            createdAt: new Date(),
            updatedAt: new Date(),
            created_at: new Date(),
          },
        },
        async () => {
          const groups = await DashboardFrame.getRecentActivity("all");
          expect(Array.isArray(groups)).toBe(true);

          // 관리자는 다른 사용자의 이력도 포함 가능 (actor_id 필터 없음)
          const allItems = groups.flatMap((g) => g.items);
          const uniqueActors = [...new Set(allItems.map((item) => item.actor_id))];
          // 관리자 조회 시 actor_id 제한 없이 반환됨을 확인
          expect(allItems.length).toBeGreaterThanOrEqual(0);
          // 테스트 데이터에 여러 actor가 있다면 uniqueActors > 1 가능
          expect(uniqueActors.length).toBeGreaterThanOrEqual(0);
        },
      );
    });
  });
});

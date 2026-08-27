import { api, BaseFrameClass, Sonamu, websocket, type WebSocketContext } from "sonamu";

import { CompanyModel } from "../company/company.model";
import { DepartmentModel } from "../department/department.model";
import { DocumentModel } from "../document/document.model";
import { EmployeeModel } from "../employee/employee.model";
import { ProjectModel } from "../project/project.model";
import {
  RecentActivityInEvents,
  RecentActivityOutEvents,
  type ActivityGroup,
  type ActivityItem,
  type ActivityPeriod,
  type DashboardStats,
} from "./dashboard.types";

class DashboardFrameClass extends BaseFrameClass {
  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"],
    resourceName: "DashboardStats",
  })
  async getStats(): Promise<DashboardStats> {
    const db = this.getDB("r");

    // 각 섹션을 독립적으로 집계 (부분 실패 시 해당 섹션만 기본값)
    const [organization, projects, documents] = await Promise.all([
      Promise.all([
        CompanyModel.findMany("A", { queryMode: "count" }),
        DepartmentModel.findMany("A", { queryMode: "count" }),
        EmployeeModel.findMany("A", { queryMode: "count" }),
      ])
        .then(([c, d, e]) => ({
          companyCount: c.total ?? 0,
          departmentCount: d.total ?? 0,
          employeeCount: e.total ?? 0,
        }))
        .catch(() => ({ companyCount: 0, departmentCount: 0, employeeCount: 0 })),

      // 프로젝트 현황
      (async () => {
        try {
          const [planning, inProgress, completed, cancelled, activeProjects] = await Promise.all([
            ProjectModel.findMany("A", {
              queryMode: "count",
              sonamuFilter: { status: "planning" },
            }),
            ProjectModel.findMany("A", {
              queryMode: "count",
              sonamuFilter: { status: "in_progress" },
            }),
            ProjectModel.findMany("A", {
              queryMode: "count",
              sonamuFilter: { status: "completed" },
            }),
            ProjectModel.findMany("A", {
              queryMode: "count",
              sonamuFilter: { status: "cancelled" },
            }),
            db("projects")
              .where("status", "in_progress")
              .orderByRaw("deadline ASC NULLS LAST")
              .limit(5)
              .select("id", "name", "deadline"),
          ]);

          const statusCounts = {
            planning: planning.total ?? 0,
            in_progress: inProgress.total ?? 0,
            completed: completed.total ?? 0,
            cancelled: cancelled.total ?? 0,
          };

          // 진행중 프로젝트별 마일스톤 진행률 집계
          const activeProjectItems = await Promise.all(
            activeProjects.map(
              async (project: { id: number; name: string; deadline: Date | null }) => {
                const milestoneStats = await db("milestones")
                  .where("project_id", project.id)
                  .select(db.raw("count(id) as total"), db.raw("count(completed_at) as completed"))
                  .first();

                return {
                  id: project.id,
                  name: project.name,
                  deadline: project.deadline,
                  milestoneTotal: Number(milestoneStats?.total ?? 0),
                  milestoneCompleted: Number(milestoneStats?.completed ?? 0),
                };
              },
            ),
          );

          return { statusCounts, activeProjects: activeProjectItems };
        } catch {
          return {
            statusCounts: { planning: 0, in_progress: 0, completed: 0, cancelled: 0 },
            activeProjects: [],
          };
        }
      })(),

      // 문서 현황: findMany queryMode count 활용
      (async () => {
        try {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const [all, draft, published, archived, recent] = await Promise.all([
            DocumentModel.findMany("A", { queryMode: "count" }),
            DocumentModel.findMany("A", { queryMode: "count", sonamuFilter: { status: "draft" } }),
            DocumentModel.findMany("A", {
              queryMode: "count",
              sonamuFilter: { status: "published" },
            }),
            DocumentModel.findMany("A", {
              queryMode: "count",
              sonamuFilter: { status: "archived" },
            }),
            db("documents").where("created_at", ">=", sevenDaysAgo).count("id as total").first(),
          ]);

          return {
            total: all.total ?? 0,
            draft: draft.total ?? 0,
            published: published.total ?? 0,
            archived: archived.total ?? 0,
            recentCount: Number(recent?.total ?? 0),
          };
        } catch {
          return { total: 0, draft: 0, published: 0, archived: 0, recentCount: 0 };
        }
      })(),
    ]);

    return { organization, projects, documents };
  }

  @websocket({ outEvents: RecentActivityOutEvents, inEvents: RecentActivityInEvents })
  async getRecentActivity2(
    initialPeriod: ActivityPeriod = "7",
    ctx: WebSocketContext<RecentActivityOutEvents, RecentActivityInEvents>,
  ): Promise<void> {
    const user = ctx.user;

    if (user?.id) {
      ctx.ws.setUserId(user.id);

      if (user.role === "admin") {
        ctx.ws.join("dashboard:recent-activity:admin");
      }
    }

    let currentPeriod: ActivityPeriod = initialPeriod;

    ctx.ws.onMessage("setPeriod", ({ period }) => {
      currentPeriod = period;
    });

    ctx.ws.publish("ready", {
      period: currentPeriod,
      groups: await this.getRecentActivity(currentPeriod),
    });

    await ctx.ws.waitForClose();
  }

  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"],
    resourceName: "RecentActivity",
  })
  async getRecentActivity(period: ActivityPeriod = "7"): Promise<ActivityGroup[]> {
    const db = this.getDB("r");
    const { user } = Sonamu.getContext();

    const query = db("audit_logs")
      .orderBy("created_at", "desc")
      .limit(20)
      .select("id", "actor_id", "action", "entity_type", "entity_id", "created_at");

    // 기간 필터
    if (period !== "all") {
      const days = Number(period);
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);
      query.where("created_at", ">=", dateFrom);
    }

    // 일반 사용자는 본인 이력만 (AC4), 관리자는 전체 (AC5)
    if (user && (!("role" in user) || user.role !== "admin")) {
      query.where("actor_id", String(user.id));
    }

    const rows: ActivityItem[] = await query;

    return this.groupByDate(rows);
  }

  groupByDate(items: ActivityItem[]): ActivityGroup[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = new Map<string, { label: string; items: ActivityItem[] }>();

    items.forEach((item) => {
      const itemDate = new Date(item.created_at);
      itemDate.setHours(0, 0, 0, 0);

      let dateKey: string;
      let label: string;

      if (itemDate.getTime() === today.getTime()) {
        dateKey = "today";
        label = "오늘";
      } else if (itemDate.getTime() === yesterday.getTime()) {
        dateKey = "yesterday";
        label = "어제";
      } else {
        dateKey = itemDate.toISOString().split("T")[0] ?? "";
        label = `${itemDate.getMonth() + 1}월 ${itemDate.getDate()}일`;
      }

      const existing = groups.get(dateKey);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(dateKey, { label, items: [item] });
      }
    });

    return Array.from(groups.entries()).map(([date, group]) => ({
      date,
      label: `${group.label} (${group.items.length}건)`,
      items: group.items,
    }));
  }
}

export const DashboardFrame = new DashboardFrameClass();

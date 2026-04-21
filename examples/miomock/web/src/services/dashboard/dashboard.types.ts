/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */

import { z } from "zod";

// 조직 현황
export const OrganizationStats = z.object({
  companyCount: z.number(),
  departmentCount: z.number(),
  employeeCount: z.number(),
});
export type OrganizationStats = z.infer<typeof OrganizationStats>;

// 프로젝트 상태별 카운트
export const ProjectStatusCounts = z.object({
  planning: z.number(),
  in_progress: z.number(),
  completed: z.number(),
  cancelled: z.number(),
});
export type ProjectStatusCounts = z.infer<typeof ProjectStatusCounts>;

// 진행중 프로젝트 TOP 5 항목
export const ActiveProjectItem = z.object({
  id: z.number(),
  name: z.string(),
  deadline: z.date().nullable(),
  milestoneTotal: z.number(),
  milestoneCompleted: z.number(),
});
export type ActiveProjectItem = z.infer<typeof ActiveProjectItem>;

// 프로젝트 현황
export const ProjectStats = z.object({
  statusCounts: ProjectStatusCounts,
  activeProjects: z.array(ActiveProjectItem),
});
export type ProjectStats = z.infer<typeof ProjectStats>;

// 문서 현황
export const DocumentStats = z.object({
  total: z.number(),
  draft: z.number(),
  published: z.number(),
  archived: z.number(),
  recentCount: z.number(),
});
export type DocumentStats = z.infer<typeof DocumentStats>;

// 대시보드 전체 메트릭
export const DashboardStats = z.object({
  organization: OrganizationStats,
  projects: ProjectStats,
  documents: DocumentStats,
});
export type DashboardStats = z.infer<typeof DashboardStats>;

// 활동 타임라인 항목
export const ActivityItem = z.object({
  id: z.number(),
  actor_id: z.string().nullable(),
  action: z.enum(["create", "update", "delete"]),
  entity_type: z.string(),
  entity_id: z.number(),
  created_at: z.date(),
});
export type ActivityItem = z.infer<typeof ActivityItem>;

// 날짜별 그룹
export const ActivityGroup = z.object({
  date: z.string(),
  label: z.string(),
  items: z.array(ActivityItem),
});
export type ActivityGroup = z.infer<typeof ActivityGroup>;

// 기간 필터
export const ActivityPeriod = z.enum(["7", "30", "all"]);
export type ActivityPeriod = z.infer<typeof ActivityPeriod>;

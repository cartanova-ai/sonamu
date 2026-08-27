import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sonamu-kit/react-components/components";
import { dateF } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ArrowRightIcon from "~icons/lucide/arrow-right";

import { authClient } from "@/contexts/sonamu-provider";
import { SD } from "@/i18n/sd.generated";
import {
  type ActivityGroup,
  type RecentActivityOutEvents,
  type ActiveProjectItem,
  type ActivityPeriod,
  type DocumentStats,
  type ActivityItem,
} from "@/services/dashboard/dashboard.types";
import { DashboardService } from "@/services/services.generated";
import { AuditLogActionLabel } from "@/services/sonamu.generated";

export const Route = createFileRoute("/admin/")({
  component: AdminIndexPage,
});

function AdminIndexPage() {
  const session = authClient.useSession();
  const user = session.data?.user ?? null;
  const navigate = useNavigate();
  const [period, setPeriod] = useState<ActivityPeriod>("7");
  const [activityGroups, setActivityGroups] = useState<ActivityGroup[]>([]);

  const { data: stats, isLoading: statsLoading } = DashboardService.useDashboardStats();

  const channel = DashboardService.useGetRecentActivity2(
    { initialPeriod: period },
    {
      ready: ({ groups }: RecentActivityOutEvents["ready"]) => setActivityGroups(groups),
      activityCreated: (item: ActivityItem) => {
        setActivityGroups((prev) => {
          const dateKey = item.created_at.toISOString().split("T")[0] ?? "";

          const idx = prev.findIndex((g) => g.date === dateKey);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], items: [item, ...next[idx].items] };
            return next;
          }
          return [{ date: dateKey, label: "오늘", items: [item] }, ...prev];
        });
      },
    },
  );

  const handleChangePeriod = (nextPeriod: ActivityPeriod) => {
    setPeriod(nextPeriod);
    channel.send("setPeriod", { period: nextPeriod });
  };

  const org = stats?.organization;
  const proj = stats?.projects;
  const docs = stats?.documents;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-350 mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold">{SD("dashboard.title")}</h1>
        </div>

        {/* 사용자 정보 */}
        <Card className="border-border/40 shadow-sm mb-5">
          <CardHeader className="px-5 py-3 border-b border-gray-100">
            <CardTitle className="text-sm font-medium leading-none m-0">
              {SD("dashboard.welcome")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {user ? (
              <div className="flex items-center justify-between">
                <div className="space-y-1 text-sm">
                  <p>
                    <strong>{SD("dashboard.name")}:</strong> {user.name}
                  </p>
                  <p>
                    <strong>{SD("dashboard.email")}:</strong> {user.email}
                  </p>
                  <p>
                    <strong>{SD("dashboard.role")}:</strong> {user.role}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => authClient.signOut()}>
                  {SD("common.logout")}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{SD("dashboard.loginRequired")}</p>
                <Button variant="secondary" onClick={() => navigate({ to: "/admin/login" })}>
                  {SD("common.login")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 조직 현황 */}
        <SectionLabel>{SD("dashboard.organizationStats")}</SectionLabel>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <MetricCard
            label={SD("entity.Company")}
            value={org?.companyCount ?? 0}
            loading={statsLoading}
          />
          <MetricCard
            label={SD("entity.Department")}
            value={org?.departmentCount ?? 0}
            loading={statsLoading}
          />
          <MetricCard
            label={SD("entity.Employee")}
            value={org?.employeeCount ?? 0}
            loading={statsLoading}
          />
        </div>

        {/* 프로젝트 상태 */}
        <SectionLabel>{SD("dashboard.projectStats")}</SectionLabel>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "기획 중", value: proj?.statusCounts.planning ?? 0 },
            { label: "진행 중", value: proj?.statusCounts.in_progress ?? 0 },
            { label: "완료", value: proj?.statusCounts.completed ?? 0 },
            { label: "취소", value: proj?.statusCounts.cancelled ?? 0 },
          ].map((s) => (
            <Card key={s.label} className="border-border/40 shadow-sm">
              <CardContent className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-lg font-bold tabular-nums">{s.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 2컬럼: 진행중 프로젝트 + 문서 현황 */}
        <div className="grid grid-cols-5 gap-4 mb-5">
          <div className="col-span-3">
            <Card className="border-border/40 shadow-sm h-full">
              <CardHeader className="px-5 py-3 border-b border-gray-100 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium leading-none m-0">
                  {SD("dashboard.activeProjects")}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => navigate({ to: "/admin/projects" })}
                >
                  전체보기
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ActiveProjectsList
                  projects={proj?.activeProjects ?? []}
                  loading={statsLoading}
                  navigate={navigate}
                />
              </CardContent>
            </Card>
          </div>

          <div className="col-span-2">
            <Card className="border-border/40 shadow-sm h-full">
              <CardHeader className="px-5 py-3 border-b border-gray-100">
                <CardTitle className="text-sm font-medium leading-none m-0">
                  {SD("dashboard.documentStats")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <DocumentStatsPanel docs={docs} loading={statsLoading} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 최근 활동 */}
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="px-5 py-3 border-b border-gray-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-sm font-medium leading-none m-0">
                {SD("dashboard.recentActivity")}
              </CardTitle>
              <WebSocketStatus readyState={channel.readyState} />
            </div>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded p-0.5">
              {(["7", "30", "all"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleChangePeriod(p)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    period === p
                      ? "bg-white shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {SD(`dashboard.period.${p}`)}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <ActivityTimeline
              groups={activityGroups ?? []}
              loading={channel.readyState === WebSocket.CONNECTING}
              period={period}
            />
            <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/admin/audit-logs" })}
                className="text-xs gap-1 text-muted-foreground"
              >
                {SD("dashboard.viewMore")}
                <ArrowRightIcon className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// --- Sub-components ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium text-muted-foreground mb-2">{children}</h3>;
}

function WebSocketStatus({ readyState }: { readyState: number }) {
  const config =
    readyState === WebSocket.OPEN
      ? { color: "bg-emerald-500", label: "연결됨", pulse: false }
      : readyState === WebSocket.CONNECTING
        ? { color: "bg-amber-500", label: "연결 중", pulse: true }
        : readyState === WebSocket.CLOSING
          ? { color: "bg-orange-500", label: "종료 중", pulse: true }
          : { color: "bg-red-500", label: "연결 끊김", pulse: false };

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`WebSocket: ${config.label}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${config.color} opacity-60 animate-ping`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.color}`} />
      </span>
      {config.label}
    </span>
  );
}

function MetricCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card className="border-border/40 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold tabular-nums">
          {loading ? (
            <span className="inline-block w-8 h-7 bg-gray-100 rounded animate-pulse" />
          ) : (
            value.toLocaleString()
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function ActiveProjectsList({
  projects,
  loading,
  navigate,
}: {
  projects: ActiveProjectItem[];
  loading: boolean;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (loading) {
    return (
      <div className="p-5 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        {SD("dashboard.noActiveProjects")}
      </p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {projects.map((project) => {
        const progress =
          project.milestoneTotal > 0
            ? Math.round((project.milestoneCompleted / project.milestoneTotal) * 100)
            : 0;

        return (
          <div
            key={project.id}
            className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => navigate({ to: `/admin/projects/${project.id}` })}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{project.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {project.deadline ? dateF(project.deadline) : "마감일 없음"}
                {" · "}
                {project.milestoneCompleted}/{project.milestoneTotal} {SD("dashboard.milestone")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-900 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
                {progress}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocumentStatsPanel({
  docs,
  loading,
}: {
  docs: DocumentStats | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-5 bg-gray-50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const total = docs?.total ?? 0;
  const items = [
    { label: "초안", value: docs?.draft ?? 0 },
    { label: "발행", value: docs?.published ?? 0 },
    { label: "보관", value: docs?.archived ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="text-center pb-3 border-b border-gray-100">
        <p className="text-3xl font-bold tabular-nums">{total.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-0.5">전체 문서</p>
        {(docs?.recentCount ?? 0) > 0 && (
          <p className="text-xs text-emerald-600 mt-1 font-medium">+{docs?.recentCount} 최근 7일</p>
        )}
      </div>

      {total > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
          {items.map(
            (item, idx) =>
              item.value > 0 && (
                <div
                  key={item.label}
                  className="transition-all"
                  style={{
                    width: `${(item.value / total) * 100}%`,
                    backgroundColor: idx === 0 ? "#a1a1aa" : idx === 1 ? "#52525b" : "#d4d4d8",
                  }}
                />
              ),
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {items.map((item, idx) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: idx === 0 ? "#a1a1aa" : idx === 1 ? "#52525b" : "#d4d4d8",
                }}
              />
              <span className="text-sm text-muted-foreground">{item.label}</span>
            </div>
            <span className="text-sm font-medium tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const actionBadgeVariant = {
  create: "default",
  update: "secondary",
  delete: "destructive",
} satisfies Record<ActivityItem["action"], "default" | "secondary" | "destructive">;

function relativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return dateF(date) ?? "";
}

function ActivityTimeline({
  groups,
  loading,
  period,
}: {
  groups: ActivityGroup[];
  loading: boolean;
  period: ActivityPeriod;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 bg-gray-50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {period === "7" || period === "30"
          ? SD("dashboard.noActivityInPeriod")
          : SD("dashboard.noActivity")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-gray-50 transition-colors text-sm"
              >
                <Badge
                  variant={actionBadgeVariant[item.action] ?? "outline"}
                  className="text-[10px] px-1.5 py-0 font-normal shrink-0"
                >
                  {AuditLogActionLabel[item.action]}
                </Badge>
                <span>{item.entity_type}</span>
                <span className="text-muted-foreground">#{item.entity_id}</span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {relativeTime(item.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

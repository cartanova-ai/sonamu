import {
  Button,
  DatePicker,
  EnumSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components";
import { createFileRoute, Link } from "@tanstack/react-router";
import classNames from "classnames";
import { useEffect, useMemo, useState } from "react";
import ChevronLeftIcon from "~icons/lucide/chevron-left";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import PauseCircleIcon from "~icons/lucide/pause-circle";
import PlayCircleIcon from "~icons/lucide/play-circle";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import RotateCcwIcon from "~icons/lucide/rotate-ccw";
import XCircleIcon from "~icons/lucide/x-circle";

import { useSonamuContext } from "../contexts/sonamu-provider";
import { useLocale } from "../i18n";
import { SonamuUIService } from "../services/sonamu-ui.service";
import {
  type StepAttempt,
  type WorkflowDefinitionInfo,
  type WorkflowRun,
} from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import { formatDateTime, formatDuration, STATUS_STYLES } from "../utils/tasks";

const WORKFLOW_RUN_STATUS_OPTIONS = [
  "pending",
  "running",
  "sleeping",
  "paused",
  "completed",
  "failed",
  "canceled",
] as const;
type FilterableStatus = (typeof WORKFLOW_RUN_STATUS_OPTIONS)[number];
const WorkflowRunStatusEnum = { options: WORKFLOW_RUN_STATUS_OPTIONS };
const WORKFLOW_RUN_STATUS_LABELS = {
  pending: "PENDING",
  running: "RUNNING",
  sleeping: "SLEEPING",
  paused: "PAUSED",
  completed: "COMPLETED",
  failed: "FAILED",
  canceled: "CANCELED",
} satisfies Record<FilterableStatus, string>;

function formatMs(ms: number): string {
  if (ms >= 60000) return `${ms / 60000}m`;
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function formatRetryPolicy(policy: WorkflowDefinitionInfo["retryPolicy"]): string {
  if (!policy) return "-";
  const parts: string[] = [];
  if (policy.maxAttempts) parts.push(`최대 ${policy.maxAttempts}회`);
  if (policy.initialIntervalMs) parts.push(`초기 ${formatMs(policy.initialIntervalMs)}`);
  if (policy.backoffCoefficient) parts.push(`배수 ${policy.backoffCoefficient}x`);
  if (policy.maximumIntervalMs) parts.push(`최대간격 ${formatMs(policy.maximumIntervalMs)}`);
  if (policy.hasDynamicPolicy) parts.push("(+ dynamic)");
  return parts.length > 0 ? parts.join(" · ") : "-";
}

function LiveElapsedTime({ startedAt }: { startedAt: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="font-mono text-sm">{formatDuration(startedAt, null)}</span>;
}

const STEP_CHIP_STYLES = {
  succeeded: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  running: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse",
  paused: "bg-gray-100 text-gray-600 border-gray-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

function StepTimeline({ steps }: { steps: StepAttempt[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-300 text-xs">→</span>}
          <span
            className={classNames(
              "inline-block px-1.5 py-0.5 text-[11px] font-mono rounded border",
              STEP_CHIP_STYLES[step.status],
            )}
          >
            {step.stepName}
          </span>
        </div>
      ))}
      <span className="text-gray-300 text-xs ml-0.5">→ ···</span>
    </div>
  );
}

function ActiveWorkflowCard({ run }: { run: WorkflowRun }) {
  const { SD } = useSonamuContext();
  const [canceling, setCanceling] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const { data: stepsData } = SonamuUIService.useStepAttempts(run.id);
  const steps = stepsData?.data ?? [];

  const isPausable = ["pending", "running", "sleeping"].includes(run.status);
  const isResumable = run.status === "paused";

  const handleCancel = () => {
    if (!confirm(SD("tasks.cancelConfirm"))) return;
    setCanceling(true);
    SonamuUIService.cancelWorkflowRun(run.id)
      .catch(defaultCatch)
      .finally(() => setCanceling(false));
  };

  const handlePause = () => {
    if (!confirm(SD("tasks.pauseConfirm"))) return;
    setPausing(true);
    SonamuUIService.pauseWorkflowRun(run.id)
      .catch(defaultCatch)
      .finally(() => setPausing(false));
  };

  const handleResume = () => {
    setResuming(true);
    SonamuUIService.resumeWorkflowRun(run.id)
      .catch(defaultCatch)
      .finally(() => setResuming(false));
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-white border border-blue-200 rounded-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Link
            to="/tasks/$workflowRunId"
            params={{ workflowRunId: run.id }}
            className="text-blue-600 hover:underline no-underline font-medium text-sm truncate"
          >
            {run.workflowName}
          </Link>
          <span
            className={classNames(
              "inline-block px-1.5 py-0.5 text-[10px] font-bold rounded border shrink-0",
              STATUS_STYLES[run.status] ?? "bg-gray-100 text-gray-800",
            )}
          >
            {run.status.toUpperCase()}
          </span>
        </div>
        {steps.length > 0 ? (
          <StepTimeline steps={steps} />
        ) : (
          <span className="text-xs text-gray-400">{SD("tasks.active.noStepsYet")}</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-xs text-gray-500">
          <span className="mr-1">{SD("tasks.active.elapsed")}:</span>
          <LiveElapsedTime startedAt={run.startedAt} />
        </div>
        {isPausable && (
          <Button
            size="xs"
            variant="outline"
            icon={<PauseCircleIcon />}
            disabled={pausing}
            onClick={handlePause}
          >
            {SD("tasks.pause")}
          </Button>
        )}
        {isResumable && (
          <Button
            size="xs"
            variant="outline"
            icon={<PlayCircleIcon />}
            disabled={resuming}
            onClick={handleResume}
          >
            {SD("tasks.resume")}
          </Button>
        )}
        <Button
          size="xs"
          variant="destructive"
          icon={<XCircleIcon />}
          disabled={canceling}
          onClick={handleCancel}
        >
          {SD("tasks.cancel")}
        </Button>
      </div>
    </div>
  );
}

function ActiveWorkflowsSection() {
  const { SD } = useSonamuContext();
  const { data } = SonamuUIService.useWorkflowRuns({
    status: ["pending", "running", "sleeping", "paused"],
  });
  const activeRuns = data?.data ?? [];

  if (activeRuns.length === 0) return null;

  return (
    <div className="block p-4 bg-blue-50 border-2 border-blue-300 rounded-md shadow-sm mb-4">
      <h3 className="text-lg font-semibold mb-3 text-blue-900">{SD("tasks.active.title")}</h3>
      <div className="flex flex-col gap-2">
        {activeRuns.map((run) => (
          <ActiveWorkflowCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/tasks")({
  component: TasksIndex,
});

function TasksIndex() {
  const { SD } = useSonamuContext();
  const locale = useLocale();
  const PAGE_SIZE = 50;

  const [cursors, setCursors] = useState<{ after?: string; before?: string }>({});
  const [filterStatus, setFilterStatus] = useState<FilterableStatus[]>([]);
  const [filterWorkflowName, setFilterWorkflowName] = useState("");
  const [filterCreatedAfter, setFilterCreatedAfter] = useState<Date | undefined>();
  const [filterCreatedBefore, setFilterCreatedBefore] = useState<Date | undefined>();

  const { data: defData } = SonamuUIService.useWorkflowDefinitions();
  const definitions = defData?.definitions ?? [];

  // definitions에서 워크플로우 이름 목록을 추출합니다.
  const workflowNameEnum = useMemo(() => {
    const names = definitions.map((d) => d.name);
    return { options: names };
  }, [definitions]);
  const workflowNameLabels = useMemo(() => {
    return Object.fromEntries(definitions.map((d) => [d.name, d.name]));
  }, [definitions]);

  const hasActiveFilter =
    filterStatus.length > 0 ||
    filterWorkflowName !== "" ||
    filterCreatedAfter ||
    filterCreatedBefore;

  const workflowRunQuery: Parameters<typeof SonamuUIService.useWorkflowRuns>[0] = {
    limit: PAGE_SIZE,
    ...cursors,
  };
  if (filterStatus.length > 0) workflowRunQuery.status = filterStatus;
  if (filterWorkflowName) workflowRunQuery.workflowName = filterWorkflowName;
  if (filterCreatedAfter) workflowRunQuery.createdAfter = filterCreatedAfter.toISOString();
  if (filterCreatedBefore) workflowRunQuery.createdBefore = filterCreatedBefore.toISOString();
  const { data, error, refetch, isLoading } = SonamuUIService.useWorkflowRuns(workflowRunQuery);

  const workflowRuns = data?.data ?? [];
  const pagination = data?.pagination;

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto my-[30vh] p-8 bg-white border-2 border-red-500 rounded-md whitespace-pre-line leading-8">
          {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <ActiveWorkflowsSection />
      <div className="block p-4 bg-white border border-gray-200 rounded-md shadow-sm mb-4">
        <h3 className="text-xl font-semibold mb-4">{SD("tasks.definitions")}</h3>
        {definitions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">{SD("tasks.noDefinitions")}</div>
        ) : (
          <Table className="text-[0.9em]">
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-gray-100">
                <TableHead>{SD("tasks.workflowName")}</TableHead>
                <TableHead>{SD("tasks.version")}</TableHead>
                <TableHead>{SD("tasks.schedule")}</TableHead>
                <TableHead>{SD("tasks.retryPolicy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {definitions.map((def) => (
                <TableRow key={def.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{def.name}</TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {def.version ?? <span className="italic text-gray-400">(unversioned)</span>}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {def.schedules.length > 0
                      ? def.schedules.map((s) => (
                          <div key={s.name} className="mb-1 last:mb-0">
                            <span className="font-medium">{s.name}</span>
                            <span className="ml-1 font-mono text-gray-400">{s.expression}</span>
                          </div>
                        ))
                      : "-"}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {formatRetryPolicy(def.retryPolicy)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="block p-4 bg-white border border-gray-200 rounded-md shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">{SD("tasks.title")}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{SD("tasks.autoRefresh")}: 5s</span>
            <Button size="xs" icon={<RefreshCwIcon />} onClick={() => refetch()}>
              {SD("common.refresh")}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 shrink-0">{SD("tasks.filter.status")}</label>
            <EnumSelect
              enum={WorkflowRunStatusEnum}
              labels={WORKFLOW_RUN_STATUS_LABELS}
              value={filterStatus}
              onValueChange={(v) => {
                setFilterStatus(Array.isArray(v) ? v : []);
                setCursors({});
              }}
              multiple
              placeholder={SD("common.all")}
              className="w-[200px]"
            />
          </div>
          {workflowNameEnum.options.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 shrink-0">
                {SD("tasks.filter.workflowName")}
              </label>
              <EnumSelect
                enum={workflowNameEnum}
                labels={workflowNameLabels}
                value={filterWorkflowName}
                onValueChange={(v) => {
                  setFilterWorkflowName(Array.isArray(v) ? "" : (v ?? ""));
                  setCursors({});
                }}
                clearable
                placeholder={SD("common.all")}
                className="w-[200px]"
              />
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 shrink-0">
              {SD("tasks.filter.createdAfter")}
            </label>
            <DatePicker
              value={filterCreatedAfter}
              onValueChange={(v) => {
                setFilterCreatedAfter(v);
                setCursors({});
              }}
              className="w-[180px]"
            />
          </div>
          <span className="text-gray-400">~</span>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 shrink-0">
              {SD("tasks.filter.createdBefore")}
            </label>
            <DatePicker
              value={filterCreatedBefore}
              onValueChange={(v) => {
                setFilterCreatedBefore(v);
                setCursors({});
              }}
              className="w-[180px]"
            />
          </div>
          {hasActiveFilter && (
            <Button
              size="xs"
              variant="outline"
              icon={<RotateCcwIcon />}
              onClick={() => {
                setFilterStatus([]);
                setFilterWorkflowName("");
                setFilterCreatedAfter(undefined);
                setFilterCreatedBefore(undefined);
                setCursors({});
              }}
            >
              {SD("tasks.filter.reset")}
            </Button>
          )}
        </div>

        {isLoading && <div className="text-center py-8">{SD("common.loading")}</div>}

        {!isLoading && (
          <Table className="text-[0.9em]">
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-gray-100">
                <TableHead>{SD("tasks.workflowName")}</TableHead>
                <TableHead>{SD("tasks.version")}</TableHead>
                <TableHead>{SD("tasks.status")}</TableHead>
                <TableHead>{SD("tasks.attempts")}</TableHead>
                <TableHead>{SD("tasks.createdAt")}</TableHead>
                <TableHead>{SD("tasks.startedAt")}</TableHead>
                <TableHead>{SD("tasks.finishedAt")}</TableHead>
                <TableHead>{SD("tasks.duration")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflowRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-400">
                    {SD("tasks.noData")}
                  </TableCell>
                </TableRow>
              )}
              {workflowRuns.map((run) => (
                <TableRow key={run.id} className="hover:bg-gray-50">
                  <TableCell>
                    <Link
                      to="/tasks/$workflowRunId"
                      params={{ workflowRunId: run.id }}
                      className="text-blue-600 hover:underline no-underline"
                    >
                      {run.workflowName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-gray-500">{run.version ?? "-"}</TableCell>
                  <TableCell>
                    <span
                      className={classNames(
                        "inline-block px-2 py-0.5 text-xs font-bold rounded border",
                        STATUS_STYLES[run.status] ?? "bg-gray-100 text-gray-800",
                      )}
                    >
                      {run.status.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{run.attempts}</TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {formatDateTime(run.createdAt, locale)}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {formatDateTime(run.startedAt, locale)}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {formatDateTime(run.finishedAt, locale)}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs font-mono">
                    {formatDuration(run.startedAt, run.finishedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {pagination && (pagination.prev || pagination.next) && (
          <div className="flex justify-center gap-2 mt-4">
            <Button
              size="sm"
              variant="outline"
              icon={<ChevronLeftIcon />}
              disabled={!pagination.prev}
              onClick={() => {
                if (pagination.prev) setCursors({ before: pagination.prev });
              }}
            >
              {SD("tasks.prev")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.next}
              onClick={() => {
                if (pagination.next) setCursors({ after: pagination.next });
              }}
            >
              {SD("tasks.next")}
              <span>
                <ChevronRightIcon className="w-4 h-4" />
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

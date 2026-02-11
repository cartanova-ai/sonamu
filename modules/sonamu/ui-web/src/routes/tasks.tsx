import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components";
import { createFileRoute, Link } from "@tanstack/react-router";
import classNames from "classnames";
import { useEffect, useState } from "react";
import ChevronLeftIcon from "~icons/lucide/chevron-left";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import XCircleIcon from "~icons/lucide/x-circle";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { useLocale } from "../i18n";
import { defaultCatch } from "../services/sonamu.shared";
import {
  SonamuUIService,
  type StepAttempt,
  type WorkflowDefinitionInfo,
  type WorkflowRun,
} from "../services/sonamu-ui.service";
import { formatDateTime, formatDuration, STATUS_STYLES } from "../utils/tasks";

function formatMs(ms: number): string {
  if (ms >= 60000) return `${ms / 60000}m`;
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function formatRetryPolicy(policy: WorkflowDefinitionInfo["retryPolicy"]): string {
  if (!policy) return "-";
  const parts: string[] = [];
  if (policy.maxAttempts != null) parts.push(`최대 ${policy.maxAttempts}회`);
  if (policy.initialIntervalMs != null) parts.push(`초기 ${formatMs(policy.initialIntervalMs)}`);
  if (policy.backoffCoefficient != null) parts.push(`배수 ${policy.backoffCoefficient}x`);
  if (policy.maximumIntervalMs != null)
    parts.push(`최대간격 ${formatMs(policy.maximumIntervalMs)}`);
  if (policy.hasDynamicPolicy) parts.push("(+ dynamic)");
  return parts.length > 0 ? parts.join(" · ") : "-";
}

function LiveElapsedTime({ startedAt }: { startedAt: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="font-mono text-sm">{formatDuration(startedAt, null)}</span>;
}

const STEP_CHIP_STYLES: Record<string, string> = {
  succeeded: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  running: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse",
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
              STEP_CHIP_STYLES[step.status] ?? "bg-gray-100 text-gray-600 border-gray-200",
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
  const { data: stepsData } = SonamuUIService.useStepAttempts(run.id);
  const steps = stepsData?.data ?? [];

  const handleCancel = () => {
    if (!confirm(SD("tasks.cancelConfirm"))) return;
    setCanceling(true);
    SonamuUIService.cancelWorkflowRun(run.id)
      .catch(defaultCatch)
      .finally(() => setCanceling(false));
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
    status: ["pending", "running", "sleeping"],
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

  const { data, error, refetch, isLoading } = SonamuUIService.useWorkflowRuns({
    limit: PAGE_SIZE,
    ...cursors,
  });

  const workflowRuns = data?.data ?? [];
  const pagination = data?.pagination;

  const { data: defData } = SonamuUIService.useWorkflowDefinitions();
  const definitions = defData?.definitions ?? [];

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

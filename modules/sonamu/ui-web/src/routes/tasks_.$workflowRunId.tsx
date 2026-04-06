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
import { Fragment, useState } from "react";
import ArrowLeftIcon from "~icons/lucide/arrow-left";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import PauseCircleIcon from "~icons/lucide/pause-circle";
import PlayCircleIcon from "~icons/lucide/play-circle";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import XCircleIcon from "~icons/lucide/x-circle";

import { useSonamuContext } from "../contexts/sonamu-provider";
import { useLocale } from "../i18n";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import { formatDateTime, formatDuration, STATUS_STYLES } from "../utils/tasks";

export const Route = createFileRoute("/tasks_/$workflowRunId")({
  component: WorkflowRunDetailPage,
});

function JsonViewer({ data, label }: { data: unknown; label: string }) {
  const [open, setOpen] = useState(false);
  if (data === null || data === undefined) return null;

  const jsonStr = JSON.stringify(data, null, 2);

  return (
    <div className="mb-4">
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-semibold text-gray-700 mb-1 cursor-pointer bg-transparent border-none p-0"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
        {label}
      </button>
      {open && <pre className="text-xs text-gray-600 mt-1">{jsonStr}</pre>}
    </div>
  );
}

function WorkflowRunDetailPage() {
  const { SD } = useSonamuContext();
  const locale = useLocale();
  const { workflowRunId } = Route.useParams();
  const [canceling, setCanceling] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);

  const { data: run, error, refetch, isLoading } = SonamuUIService.useWorkflowRun(workflowRunId);
  const { data: stepsData } = SonamuUIService.useStepAttempts(workflowRunId);

  const steps = stepsData?.data ?? [];

  const [expandedSteps, setExpandedSteps] = useState(new Set());
  const toggleStep = (id: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isCancelable = run && ["pending", "running", "sleeping", "paused"].includes(run.status);
  const isPausable = run && ["pending", "running", "sleeping"].includes(run.status);
  const isResumable = run && run.status === "paused";

  const handleCancel = () => {
    if (!confirm(SD("tasks.cancelConfirm"))) return;
    setCanceling(true);
    SonamuUIService.cancelWorkflowRun(workflowRunId)
      .then(() => refetch())
      .catch(defaultCatch)
      .finally(() => setCanceling(false));
  };

  const handlePause = () => {
    if (!confirm(SD("tasks.pauseConfirm"))) return;
    setPausing(true);
    SonamuUIService.pauseWorkflowRun(workflowRunId)
      .then(() => refetch())
      .catch(defaultCatch)
      .finally(() => setPausing(false));
  };

  const handleResume = () => {
    setResuming(true);
    SonamuUIService.resumeWorkflowRun(workflowRunId)
      .then(() => refetch())
      .catch(defaultCatch)
      .finally(() => setResuming(false));
  };

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto my-[30vh] p-8 bg-white border-2 border-red-500 rounded-md">
          {error.message}
        </div>
      </div>
    );
  }

  if (isLoading || !run) {
    return <div className="p-8 text-center">{SD("common.loading")}</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          to="/tasks"
          className="text-blue-600 hover:underline no-underline flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="w-4 h-4" /> {SD("tasks.title")}
        </Link>
      </div>

      <div className="block p-6 bg-white border border-gray-200 rounded-md shadow-sm">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold">{run.workflowName}</h3>
            <p className="text-xs text-gray-400 mt-1">ID: {run.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={classNames(
                "inline-block px-3 py-1 text-sm font-bold rounded border",
                STATUS_STYLES[run.status] ?? "bg-gray-100",
              )}
            >
              {run.status.toUpperCase()}
            </span>
            {isPausable && (
              <Button
                size="sm"
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
                size="sm"
                variant="outline"
                icon={<PlayCircleIcon />}
                disabled={resuming}
                onClick={handleResume}
              >
                {SD("tasks.resume")}
              </Button>
            )}
            {isCancelable && (
              <Button
                size="sm"
                variant="destructive"
                icon={<XCircleIcon />}
                disabled={canceling}
                onClick={handleCancel}
              >
                {SD("tasks.cancel")}
              </Button>
            )}
            <Button size="xs" onClick={() => refetch()}>
              <RefreshCwIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 메타데이터 그리드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-md text-sm">
          <div>
            <span className="text-gray-500">{SD("tasks.version")}:</span> {run.version ?? "-"}
          </div>
          <div>
            <span className="text-gray-500">{SD("tasks.attempts")}:</span> {run.attempts}
          </div>
          <div>
            <span className="text-gray-500">{SD("tasks.createdAt")}:</span>{" "}
            {formatDateTime(run.createdAt, locale)}
          </div>
          <div>
            <span className="text-gray-500">{SD("tasks.startedAt")}:</span>{" "}
            {formatDateTime(run.startedAt, locale)}
          </div>
          <div>
            <span className="text-gray-500">{SD("tasks.finishedAt")}:</span>{" "}
            {formatDateTime(run.finishedAt, locale)}
          </div>
          <div>
            <span className="text-gray-500">{SD("tasks.duration")}:</span>{" "}
            <span className="font-mono">{formatDuration(run.startedAt, run.finishedAt)}</span>
          </div>
          <div>
            <span className="text-gray-500">Worker:</span> {run.workerId ?? "-"}
          </div>
          <div>
            <span className="text-gray-500">Namespace:</span> {run.namespaceId}
          </div>
        </div>

        {/* Input/Output JSON */}
        <JsonViewer data={run.input} label={SD("tasks.detail.input")} />
        <JsonViewer data={run.output} label={SD("tasks.detail.output")} />

        {/* 에러 섹션 */}
        {run.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <span className="text-sm font-semibold text-red-800 mb-2">
              {SD("tasks.detail.error")}
            </span>
            <div className="text-sm">
              <div className="font-mono text-red-700">
                {run.error.name ? `${run.error.name}: ` : ""}
                {run.error.message}
              </div>
              {run.error.stack && (
                <pre className="mt-2 text-xs text-red-600 whitespace-pre-wrap overflow-x-auto">
                  {run.error.stack}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Step Attempts */}
        <h4 className="text-lg font-semibold mt-8 mb-4">{SD("tasks.detail.steps")}</h4>
        <Table className="text-[0.9em]">
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-gray-100">
              <TableHead className="w-8" />
              <TableHead>{SD("tasks.detail.stepName")}</TableHead>
              <TableHead>{SD("tasks.detail.stepKind")}</TableHead>
              <TableHead>{SD("tasks.detail.stepStatus")}</TableHead>
              <TableHead>{SD("tasks.startedAt")}</TableHead>
              <TableHead>{SD("tasks.finishedAt")}</TableHead>
              <TableHead>{SD("tasks.duration")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4 text-gray-400">
                  {SD("tasks.detail.noSteps")}
                </TableCell>
              </TableRow>
            )}
            {steps.map((step) => (
              <Fragment key={step.id}>
                <TableRow
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleStep(step.id)}
                >
                  <TableCell className="text-center">
                    {expandedSteps.has(step.id) ? (
                      <ChevronDownIcon className="w-4 h-4 inline" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 inline" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{step.stepName}</TableCell>
                  <TableCell>
                    <span
                      className={classNames(
                        "inline-block px-2 py-0.5 text-xs font-bold rounded",
                        step.kind === "sleep"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700",
                      )}
                    >
                      {step.kind}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={classNames(
                        "inline-block px-2 py-0.5 text-xs font-bold rounded border",
                        STATUS_STYLES[step.status] ?? "bg-gray-100",
                      )}
                    >
                      {step.status.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {formatDateTime(step.startedAt, locale)}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {formatDateTime(step.finishedAt, locale)}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs font-mono">
                    {formatDuration(step.startedAt, step.finishedAt)}
                  </TableCell>
                </TableRow>
                {expandedSteps.has(step.id) && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-gray-50 p-4">
                      <div className="flex flex-col gap-2">
                        {step.output !== null && (
                          <div>
                            <span className="text-xs font-semibold text-gray-600">Output:</span>
                            <pre className="text-xs text-gray-600 mt-1">
                              {JSON.stringify(step.output, null, 2)}
                            </pre>
                          </div>
                        )}
                        {step.error !== null && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded">
                            <span className="text-xs font-semibold text-red-600">
                              {SD("tasks.detail.error")}:
                            </span>
                            <pre className="text-xs text-red-700 whitespace-pre-wrap mt-1">
                              {JSON.stringify(step.error, null, 2)}
                            </pre>
                          </div>
                        )}
                        {step.context && (
                          <div>
                            <span className="text-xs font-semibold text-gray-600">Context:</span>
                            <pre className="text-xs text-gray-600 mt-1">
                              {JSON.stringify(step.context, null, 2)}
                            </pre>
                          </div>
                        )}
                        {step.childWorkflowRunId && (
                          <div>
                            <span className="text-xs font-semibold text-gray-600">
                              Child Workflow:
                            </span>
                            <Link
                              to="/tasks/$workflowRunId"
                              params={{ workflowRunId: step.childWorkflowRunId }}
                              className="text-blue-600 hover:underline ml-2 text-xs"
                            >
                              {step.childWorkflowRunId}
                            </Link>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

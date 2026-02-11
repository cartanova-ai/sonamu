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
import { useState } from "react";
import ChevronLeftIcon from "~icons/lucide/chevron-left";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { useLocale } from "../i18n";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { formatDateTime, formatDuration, STATUS_STYLES } from "../utils/tasks";

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

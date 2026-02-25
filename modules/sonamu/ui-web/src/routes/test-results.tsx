import { Button } from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import classNames from "classnames";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import CheckCircle2Icon from "~icons/lucide/check-circle-2";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import CircleIcon from "~icons/lucide/circle";
import FileTextIcon from "~icons/lucide/file-text";
import FolderIcon from "~icons/lucide/folder";
import MinusCircleIcon from "~icons/lucide/minus-circle";
import Trash2Icon from "~icons/lucide/trash-2";
import XCircleIcon from "~icons/lucide/x-circle";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { useRunHistorySession } from "../hooks/use-run-history-session";
import { useTestEvents } from "../hooks/use-test-events";
import {
  type ManagerStatus,
  type RunResult,
  type SerializedTrace,
  SonamuUIService,
  type StoredRunEntry,
  type TestCaseResult,
  type TestState,
} from "../services/sonamu-ui.service";

export const Route = createFileRoute("/test-results")({
  component: TestResultsPage,
});

function TestResultsPage() {
  const { SD } = useSonamuContext();
  const statusQuery = SonamuUIService.useTestStatus();
  const sseAvailable = statusQuery.data?.sseAvailable ?? false;
  const { connected, on } = useTestEvents({ enabled: sseAvailable });
  const { history, addRun, clearHistory } = useRunHistorySession();

  const [managerStatus, setManagerStatus] = useState<ManagerStatus | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (connected) {
      setConnecting(false);
    } else {
      setConnecting(true);
    }
  }, [connected]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      on("snapshot", (payload) => {
        setManagerStatus(payload.status);
      }),
    );

    unsubs.push(
      on("runStarted", () => {
        setManagerStatus((prev) => (prev ? { ...prev, running: true } : prev));
      }),
    );

    unsubs.push(
      on("runCompleted", (payload) => {
        setManagerStatus((prev) =>
          prev ? { ...prev, running: false, lastRunAt: payload.finishedAt } : prev,
        );
        addRun({
          runId: payload.runId,
          startedAt: payload.startedAt,
          finishedAt: payload.finishedAt,
          result: payload.result,
        });
      }),
    );

    unsubs.push(
      on("runErrored", (payload) => {
        setManagerStatus((prev) =>
          prev ? { ...prev, running: false, lastRunAt: payload.finishedAt } : prev,
        );
      }),
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [on, addRun]);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) return null;
    return history.runs.find((r) => r.runId === selectedRunId) ?? null;
  }, [selectedRunId, history.runs]);

  const nodeIndex = useMemo(() => {
    if (!selectedRun) return new Map<string, TestCaseResult>();
    const map = new Map<string, TestCaseResult>();
    const walk = (nodes: TestCaseResult[]) => {
      for (const n of nodes) {
        map.set(n.id, n);
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(selectedRun.result.results);
    return map;
  }, [selectedRun]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeIndex.get(selectedNodeId) ?? null;
  }, [nodeIndex, selectedNodeId]);

  const handleSelectRun = useCallback((runId: string) => {
    setSelectedRunId(runId);
    setSelectedNodeId(null);
  }, []);

  if (statusQuery.isSuccess && !sseAvailable) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-var(--gnb-height,48px))]">
        <div className="text-center">
          <p className="text-gray-600 text-sm">{SD("testResults.sseNotAvailable")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--gnb-height,48px))]">
      <ConnectionStatusBar
        connected={connected}
        connecting={connecting}
        managerStatus={managerStatus}
      />
      <div className="flex flex-1 overflow-hidden">
        <RunHistorySidebar
          runs={history.runs}
          selectedRunId={selectedRunId}
          onSelectRun={handleSelectRun}
          onClearHistory={clearHistory}
        />
        <div className="flex-1 overflow-auto">
          {selectedRun ? (
            <ResultViewPanel
              run={selectedRun}
              selectedNodeId={selectedNodeId}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNodeId}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              {SD("testResults.noHistory")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionStatusBar({
  connected,
  connecting,
  managerStatus,
}: {
  connected: boolean;
  connecting: boolean;
  managerStatus: ManagerStatus | null;
}) {
  const { SD } = useSonamuContext();
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm shrink-0">
      <div className="flex items-center gap-1.5">
        <span
          className={classNames("inline-block w-2.5 h-2.5 rounded-full", {
            "bg-green-500": connected,
            "bg-yellow-400 animate-pulse": connecting && !connected,
            "bg-gray-400": !connected && !connecting,
          })}
        />
        <span className="text-gray-600">
          {connected
            ? SD("testResults.connected")
            : connecting
              ? SD("testResults.connecting")
              : SD("testResults.disconnected")}
        </span>
      </div>
      {managerStatus?.running && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full animate-pulse">
          Running
        </span>
      )}
    </div>
  );
}

function RunHistorySidebar({
  runs,
  selectedRunId,
  onSelectRun,
  onClearHistory,
}: {
  runs: StoredRunEntry[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onClearHistory: () => void;
}) {
  const { SD } = useSonamuContext();
  const grouped = useMemo(() => {
    const map = new Map<string, StoredRunEntry[]>();
    for (const run of runs) {
      const existing = map.get(run.dateKey);
      if (existing) {
        existing.push(run);
      } else {
        map.set(run.dateKey, [run]);
      }
    }
    const entries = Array.from(map.entries());
    entries.sort((a, b) => b[0].localeCompare(a[0]));
    return entries;
  }, [runs]);

  return (
    <div className="w-60 shrink-0 flex flex-col border-r border-gray-200 bg-gray-50 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-2">
        {runs.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            {SD("testResults.noHistory")}
          </div>
        ) : (
          grouped.map(([dateKey, dateRuns]) => (
            <div key={dateKey} className="mb-3">
              <div className="text-xs font-semibold text-gray-500 px-2 py-1">{dateKey}</div>
              {dateRuns.map((run) => (
                <button
                  key={run.runId}
                  type="button"
                  className={classNames(
                    "w-full text-left px-2 py-1.5 rounded text-sm cursor-pointer transition-colors",
                    {
                      "bg-blue-100 text-blue-900": selectedRunId === run.runId,
                      "hover:bg-gray-200": selectedRunId !== run.runId,
                    },
                  )}
                  onClick={() => onSelectRun(run.runId)}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <SummaryBadges summary={run.result.summary} />
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatTime(run.finishedAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
      {runs.length > 0 && (
        <div className="p-2 border-t border-gray-200">
          <Button
            size="xs"
            variant="outline"
            icon={<Trash2Icon />}
            onClick={onClearHistory}
            className="w-full"
          >
            {SD("testResults.clearHistory")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryBadges({ summary }: { summary: RunResult["summary"] }) {
  return (
    <div className="flex items-center gap-1">
      {summary.passed > 0 && (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-700">
          {summary.passed}
        </span>
      )}
      {summary.failed > 0 && (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700">
          {summary.failed}
        </span>
      )}
      {summary.skipped > 0 && (
        <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded bg-gray-100 text-gray-500">
          {summary.skipped}
        </span>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function ResultViewPanel({
  run,
  selectedNodeId,
  selectedNode,
  onSelectNode,
}: {
  run: StoredRunEntry;
  selectedNodeId: string | null;
  selectedNode: TestCaseResult | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <SummaryHeader summary={run.result.summary} />
      <div className="flex flex-1 overflow-hidden">
        <ResultTreePanel
          results={run.result.results}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
        <ResultDetailPanel node={selectedNode} />
      </div>
    </div>
  );
}

function SummaryHeader({ summary }: { summary: RunResult["summary"] }) {
  const { SD } = useSonamuContext();
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200 text-sm shrink-0">
      <span className="text-gray-600">
        {SD("testResults.summary.total")}: <span className="font-semibold">{summary.total}</span>
      </span>
      <span className="text-green-600">
        {SD("testResults.summary.passed")}: <span className="font-semibold">{summary.passed}</span>
      </span>
      <span className="text-red-600">
        {SD("testResults.summary.failed")}: <span className="font-semibold">{summary.failed}</span>
      </span>
      <span className="text-gray-500">
        {SD("testResults.summary.skipped")}:{" "}
        <span className="font-semibold">{summary.skipped}</span>
      </span>
      <span className="text-gray-500">
        {SD("testResults.summary.duration")}:{" "}
        <span className="font-mono">{formatDurationMs(summary.durationMs)}</span>
      </span>
    </div>
  );
}

function formatDurationMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(2)}ms`;
}

function ResultTreePanel({
  results,
  selectedNodeId,
  onSelectNode,
}: {
  results: TestCaseResult[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <div className="w-120 shrink-0 border-r border-gray-200 overflow-y-auto p-2">
      {results.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      ))}
    </div>
  );
}

const TreeNode = memo(function TreeNode({
  node,
  depth,
  selectedNodeId,
  onSelectNode,
}: {
  node: TestCaseResult;
  depth: number;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedNodeId === node.id;

  return (
    <div>
      <button
        type="button"
        className={classNames(
          "w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer transition-colors text-left",
          {
            "bg-blue-100": isSelected,
            "hover:bg-gray-100": !isSelected,
          },
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          onSelectNode(node.id);
          if (hasChildren) {
            setExpanded((prev) => !prev);
          }
        }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          ) : (
            <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <StateIcon state={node.state} kind={node.kind} />
        <span
          className={classNames("truncate", {
            "text-red-600": node.state === "failed",
            "text-green-700": node.state === "passed",
            "text-gray-400": node.state === "skipped" || node.state === "todo",
          })}
        >
          {node.name}
        </span>
        {node.durationMs !== null && (
          <span className="ml-auto text-xs text-gray-400 font-mono shrink-0">
            {formatDurationMs(node.durationMs)}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function StateIcon({ state, kind }: { state: TestState; kind: string }) {
  if (kind === "file") {
    return (
      <FileTextIcon
        className={classNames("w-4 h-4 shrink-0", {
          "text-green-600": state === "passed",
          "text-red-500": state === "failed",
          "text-gray-400": state === "skipped" || state === "todo" || state === "unknown",
          "text-blue-500": state === "running",
        })}
      />
    );
  }
  if (kind === "suite") {
    return (
      <FolderIcon
        className={classNames("w-4 h-4 shrink-0", {
          "text-green-600": state === "passed",
          "text-red-500": state === "failed",
          "text-gray-400": state === "skipped" || state === "todo" || state === "unknown",
          "text-blue-500": state === "running",
        })}
      />
    );
  }
  if (state === "passed") {
    return <CheckCircle2Icon className="w-4 h-4 text-green-600 shrink-0" />;
  }
  if (state === "failed") {
    return <XCircleIcon className="w-4 h-4 text-red-500 shrink-0" />;
  }
  if (state === "skipped" || state === "todo") {
    return <MinusCircleIcon className="w-4 h-4 text-gray-400 shrink-0" />;
  }
  return <CircleIcon className="w-4 h-4 text-gray-400 shrink-0" />;
}

const ResultDetailPanel = memo(function ResultDetailPanel({
  node,
}: {
  node: TestCaseResult | null;
}) {
  if (!node) {
    return <div className="flex-1" />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <StateIcon state={node.state} kind={node.kind} />
        <span className="font-semibold">{node.fullName}</span>
        {node.durationMs !== null && (
          <span className="text-gray-400 font-mono text-xs">
            {formatDurationMs(node.durationMs)}
          </span>
        )}
      </div>

      {node.error && <ErrorBlock error={node.error} />}
      <TraceList traces={node.traces} />
    </div>
  );
});

function ErrorBlock({ error }: { error: { message: string; stack?: string } }) {
  const { SD } = useSonamuContext();
  return (
    <div className="border border-red-200 rounded-md overflow-hidden">
      <div className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-semibold border-b border-red-200">
        {SD("testResults.detail.error")}
      </div>
      <pre className="p-3 text-xs text-red-800 bg-red-50/50 overflow-x-auto whitespace-pre-wrap">
        {error.message}
        {error.stack && `\n\n${error.stack}`}
      </pre>
    </div>
  );
}

function formatTraceValue(value: unknown): string {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function TraceList({ traces }: { traces: SerializedTrace[] }) {
  const { SD } = useSonamuContext();
  const formattedValues = useMemo(
    () => traces.map((trace) => formatTraceValue(trace.value)),
    [traces],
  );
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 mb-1">
        {SD("testResults.detail.traces")}
      </div>
      {traces.length === 0 ? (
        <div className="text-xs text-gray-400">{SD("testResults.detail.noTraces")}</div>
      ) : (
        <div className="space-y-1.5">
          {traces.map((trace, i) => (
            <div
              key={`${trace.key}-${trace.at}-${i}`}
              className="text-xs border border-gray-100 rounded overflow-hidden"
            >
              <div className="flex items-center px-2 py-1 bg-gray-50">
                <span className="font-mono font-semibold text-blue-700">{trace.key}</span>
                <span className="ml-3 text-gray-400 text-[11px]">
                  {trace.filePath}:{trace.lineNumber}
                </span>
              </div>
              <pre className="px-2 py-1.5 text-gray-700 whitespace-pre-wrap break-all overflow-x-auto">
                {formattedValues[i]}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

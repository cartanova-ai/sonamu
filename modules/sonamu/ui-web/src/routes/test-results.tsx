import { Button } from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import classNames from "classnames";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type TestSSEEventMap,
  type TestState,
} from "../services/sonamu-ui.service";

export const Route = createFileRoute("/test-results")({
  component: TestResultsPage,
});

type LiveRunState = {
  runId: string;
  startedAt: string;
  fileResults: Map<string, TestCaseResult>;
};

function aggregateChildCounts(children: TestCaseResult[]): TestCaseResult["counts"] {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const child of children) {
    total += child.counts.total;
    passed += child.counts.passed;
    failed += child.counts.failed;
    skipped += child.counts.skipped;
  }
  return { total, passed, failed, skipped };
}

function deriveParentState(parent: TestCaseResult, children: TestCaseResult[]): TestState {
  if (children.some((c) => c.state === "running")) return "running";
  if (children.some((c) => c.state === "failed")) return "failed";
  if (children.every((c) => c.state === "passed" || c.state === "skipped" || c.state === "todo")) {
    return children.some((c) => c.state === "passed") ? "passed" : "skipped";
  }
  return parent.state;
}

function upsertNodeInTree(
  root: TestCaseResult,
  parentId: string,
  node: TestCaseResult,
  phase: "ready" | "result",
): TestCaseResult {
  if (root.id === parentId) {
    const existingIdx = root.children.findIndex((c) => c.id === node.id);
    let newChildren: TestCaseResult[];
    if (existingIdx >= 0) {
      if (phase === "ready" && root.children[existingIdx].state !== "running") {
        return root;
      }
      newChildren = [...root.children];
      newChildren[existingIdx] = node;
    } else {
      newChildren = [...root.children, node];
    }
    const counts = aggregateChildCounts(newChildren);
    const state = deriveParentState(root, newChildren);
    return { ...root, children: newChildren, counts, state };
  }

  let changed = false;
  const newChildren = root.children.map((child) => {
    if (changed) return child;
    const updated = upsertNodeInTree(child, parentId, node, phase);
    if (updated !== child) changed = true;
    return updated;
  });

  if (!changed) return root;

  const counts = aggregateChildCounts(newChildren);
  const state = deriveParentState(root, newChildren);
  return { ...root, children: newChildren, counts, state };
}

function applyNodeProgress(
  state: LiveRunState | null,
  payload: TestSSEEventMap["runNodeProgress"],
): LiveRunState | null {
  if (!state || payload.runId !== state.runId) return state;

  const next = new Map(state.fileResults);

  if (payload.kind === "file" || payload.parentId === null) {
    if (payload.phase === "ready") {
      if (!next.has(payload.fileId)) {
        next.set(payload.fileId, payload.node);
      }
    } else {
      next.set(payload.fileId, payload.node);
    }
  } else {
    const fileRoot = next.get(payload.fileId);
    if (!fileRoot) return state;
    const updated = upsertNodeInTree(fileRoot, payload.parentId, payload.node, payload.phase);
    next.set(payload.fileId, updated);
  }

  return { ...state, fileResults: next };
}

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
  const [liveRun, setLiveRun] = useState<LiveRunState | null>(null);

  const pendingProgressRef = useRef<TestSSEEventMap["runNodeProgress"][]>([]);
  const rafIdRef = useRef<number | null>(null);

  const flushPendingProgress = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const events = pendingProgressRef.current.splice(0);
    if (events.length > 0) {
      setLiveRun((prev) => {
        let next = prev;
        for (const payload of events) {
          next = applyNodeProgress(next, payload);
        }
        return next;
      });
    }
  }, []);

  const scheduleBatchFlush = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const events = pendingProgressRef.current.splice(0);
      if (events.length === 0) return;
      setLiveRun((prev) => {
        let next = prev;
        for (const payload of events) {
          next = applyNodeProgress(next, payload);
        }
        return next;
      });
    });
  }, []);

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
      on("runStarted", (payload) => {
        // 이전 런의 pending 큐를 초기화합니다.
        pendingProgressRef.current.length = 0;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setManagerStatus((prev) => (prev ? { ...prev, running: true } : prev));
        setLiveRun({ runId: payload.runId, startedAt: payload.startedAt, fileResults: new Map() });
        setSelectedRunId(null);
      }),
    );

    unsubs.push(
      on("runNodeProgress", (payload) => {
        pendingProgressRef.current.push(payload);
        scheduleBatchFlush();
      }),
    );

    unsubs.push(
      on("runCompleted", (payload) => {
        flushPendingProgress();
        setManagerStatus((prev) =>
          prev ? { ...prev, running: false, lastRunAt: payload.finishedAt } : prev,
        );
        addRun({
          runId: payload.runId,
          startedAt: payload.startedAt,
          finishedAt: payload.finishedAt,
          result: payload.result,
        });
        setLiveRun(null);
        setSelectedRunId(payload.runId);
      }),
    );

    unsubs.push(
      on("runErrored", (payload) => {
        flushPendingProgress();
        setManagerStatus((prev) =>
          prev ? { ...prev, running: false, lastRunAt: payload.finishedAt } : prev,
        );
        setLiveRun(null);
      }),
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingProgressRef.current.length = 0;
    };
  }, [on, addRun, flushPendingProgress, scheduleBatchFlush]);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) return null;
    return history.runs.find((r) => r.runId === selectedRunId) ?? null;
  }, [selectedRunId, history.runs]);

  const liveRunResults = useMemo(() => {
    if (!liveRun) return null;
    return Array.from(liveRun.fileResults.values());
  }, [liveRun]);

  const liveRunSummary = useMemo(() => {
    if (!liveRunResults) return null;
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let durationMs = 0;
    for (const f of liveRunResults) {
      total += f.counts.total;
      passed += f.counts.passed;
      failed += f.counts.failed;
      skipped += f.counts.skipped;
      if (f.durationMs) durationMs += f.durationMs;
    }
    return { total, passed, failed, skipped, durationMs };
  }, [liveRunResults]);

  const showLiveRun = !selectedRunId && liveRun !== null;

  const activeResults = useMemo(() => {
    if (showLiveRun && liveRunResults) return liveRunResults;
    if (selectedRun) return selectedRun.result.results;
    return null;
  }, [showLiveRun, liveRunResults, selectedRun]);

  const nodeIndex = useMemo(() => {
    if (!activeResults) return new Map<string, TestCaseResult>();
    const map = new Map<string, TestCaseResult>();
    const walk = (nodes: TestCaseResult[]) => {
      for (const n of nodes) {
        map.set(n.id, n);
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(activeResults);
    return map;
  }, [activeResults]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeIndex.get(selectedNodeId) ?? null;
  }, [nodeIndex, selectedNodeId]);

  const handleSelectRun = useCallback((runId: string) => {
    setSelectedRunId(runId);
    setSelectedNodeId(null);
  }, []);

  const handleSelectLiveRun = useCallback(() => {
    setSelectedRunId(null);
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
          liveRun={liveRun}
          showLiveRun={showLiveRun}
          onSelectLiveRun={handleSelectLiveRun}
        />
        <div className="flex-1 overflow-auto">
          {showLiveRun && liveRunResults && liveRunSummary ? (
            <LiveResultViewPanel
              results={liveRunResults}
              summary={liveRunSummary}
              selectedNodeId={selectedNodeId}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNodeId}
            />
          ) : selectedRun ? (
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
  liveRun,
  showLiveRun,
  onSelectLiveRun,
}: {
  runs: StoredRunEntry[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onClearHistory: () => void;
  liveRun: LiveRunState | null;
  showLiveRun: boolean;
  onSelectLiveRun: () => void;
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
        {liveRun && (
          <button
            type="button"
            className={classNames(
              "w-full text-left px-2 py-1.5 rounded text-sm cursor-pointer transition-colors mb-2",
              {
                "bg-blue-100 text-blue-900": showLiveRun,
                "hover:bg-gray-200": !showLiveRun,
              },
            )}
            onClick={onSelectLiveRun}
          >
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-semibold text-blue-700">
                {SD("testResults.liveRunning")}
              </span>
            </div>
          </button>
        )}
        {runs.length === 0 && !liveRun ? (
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

function LiveResultViewPanel({
  results,
  summary,
  selectedNodeId,
  selectedNode,
  onSelectNode,
}: {
  results: TestCaseResult[];
  summary: RunResult["summary"];
  selectedNodeId: string | null;
  selectedNode: TestCaseResult | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <SummaryHeader summary={summary} />
      <div className="flex flex-1 overflow-hidden">
        <ResultTreePanel
          results={results}
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

type VisibleRow = {
  node: TestCaseResult;
  depth: number;
  hasChildren: boolean;
};

function buildInitialExpandedIds(results: TestCaseResult[]): Set<string> {
  return new Set(results.map((r) => r.id));
}

function buildVisibleRows(results: TestCaseResult[], expandedIds: Set<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const visit = (node: TestCaseResult, depth: number) => {
    const hasChildren = node.children.length > 0;
    rows.push({ node, depth, hasChildren });
    if (hasChildren && expandedIds.has(node.id)) {
      for (const child of node.children) {
        visit(child, depth + 1);
      }
    }
  };
  for (const root of results) {
    visit(root, 0);
  }
  return rows;
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    buildInitialExpandedIds(results),
  );

  const prevResultsRef = useRef(results);
  useEffect(() => {
    if (prevResultsRef.current !== results) {
      prevResultsRef.current = results;
      // 새로 추가된 root id만 병합하여 사용자가 수동으로 접은 항목 상태를 보존합니다.
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const r of results) {
          if (!next.has(r.id)) next.add(r.id);
        }
        return next;
      });
    }
  }, [results]);

  const visibleRows = useMemo(() => buildVisibleRows(results, expandedIds), [results, expandedIds]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="w-120 shrink-0 border-r border-gray-200 overflow-y-auto p-2">
      {visibleRows.map((row) => (
        <TreeRow
          key={row.node.id}
          row={row}
          isSelected={selectedNodeId === row.node.id}
          expanded={expandedIds.has(row.node.id)}
          onSelectNode={onSelectNode}
          onToggleExpand={handleToggleExpand}
        />
      ))}
    </div>
  );
}

const TreeRow = memo(function TreeRow({
  row,
  isSelected,
  expanded,
  onSelectNode,
  onToggleExpand,
}: {
  row: VisibleRow;
  isSelected: boolean;
  expanded: boolean;
  onSelectNode: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={classNames(
        "w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer transition-colors text-left",
        {
          "bg-blue-100": isSelected,
          "hover:bg-gray-100": !isSelected,
        },
      )}
      style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
      onClick={() => {
        onSelectNode(row.node.id);
        if (row.hasChildren) {
          onToggleExpand(row.node.id);
        }
      }}
    >
      {row.hasChildren ? (
        expanded ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <StateIcon state={row.node.state} kind={row.node.kind} />
      <span
        className={classNames("truncate", {
          "text-red-600": row.node.state === "failed",
          "text-green-700": row.node.state === "passed",
          "text-gray-400": row.node.state === "skipped" || row.node.state === "todo",
        })}
      >
        {row.node.name}
      </span>
      {row.node.durationMs !== null && (
        <span className="ml-auto text-xs text-gray-400 font-mono shrink-0">
          {formatDurationMs(row.node.durationMs)}
        </span>
      )}
    </button>
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
  const [expandedTraceKeys, setExpandedTraceKeys] = useState<Set<string>>(() => new Set());
  const formattedCacheRef = useRef<Map<string, string>>(new Map());

  // 노드 전환 시 traces prop이 변경되면 캐시를 초기화하여 cacheKey 충돌을 방지합니다.
  useEffect(() => {
    formattedCacheRef.current.clear();
  }, [traces]);

  const toggleTrace = useCallback((cacheKey: string) => {
    setExpandedTraceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(cacheKey)) {
        next.delete(cacheKey);
      } else {
        next.add(cacheKey);
      }
      return next;
    });
  }, []);

  const getFormattedValue = useCallback((trace: SerializedTrace, cacheKey: string): string => {
    const cached = formattedCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const formatted = formatTraceValue(trace.value);
    formattedCacheRef.current.set(cacheKey, formatted);
    return formatted;
  }, []);

  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 mb-1">
        {SD("testResults.detail.traces")}
      </div>
      {traces.length === 0 ? (
        <div className="text-xs text-gray-400">{SD("testResults.detail.noTraces")}</div>
      ) : (
        <div className="space-y-1.5">
          {traces.map((trace, i) => {
            const cacheKey = `${trace.key}-${trace.at}-${i}`;
            const isExpanded = expandedTraceKeys.has(cacheKey);
            return (
              <div
                key={cacheKey}
                className="text-xs border border-gray-100 rounded overflow-hidden"
              >
                <button
                  type="button"
                  className="flex items-center w-full px-2 py-1 bg-gray-50 cursor-pointer text-left"
                  onClick={() => toggleTrace(cacheKey)}
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="w-3 h-3 text-gray-400 mr-1 shrink-0" />
                  ) : (
                    <ChevronRightIcon className="w-3 h-3 text-gray-400 mr-1 shrink-0" />
                  )}
                  <span className="font-mono font-semibold text-blue-700">{trace.key}</span>
                  <span className="ml-3 text-gray-400 text-[11px]">
                    {trace.filePath}:{trace.lineNumber}
                  </span>
                </button>
                {isExpanded && (
                  <pre className="px-2 py-1.5 text-gray-700 whitespace-pre-wrap overflow-x-auto">
                    {getFormattedValue(trace, cacheKey)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

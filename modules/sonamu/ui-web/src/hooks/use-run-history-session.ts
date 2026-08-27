import { useCallback, useRef, useState } from "react";

import { type StoredRunEntry, type StoredRunHistory } from "../services/sonamu-ui.service";
import { storedRunHistorySchema } from "./test-event-schemas";

const STORAGE_KEY = "sonamu.ui.test-result-viewer.v1";
const MAX_RUNS = 100;
const SESSION_STORAGE_QUOTA_HINT_BYTES = 5 * 1024 * 1024;

type StorageWriteResult =
  | { ok: true }
  | {
      ok: false;
      reason: "quota-exceeded";
      payloadBytes: number;
      quotaHintBytes: number;
    };

export type RunHistoryStorageWarning = {
  runId: string;
  reason: "quota-exceeded";
  payloadBytes: number;
  quotaHintBytes: number;
};

function readFromStorage(): StoredRunHistory {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { runs: [] };
    }
    const parsed = storedRunHistorySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { runs: [] };
    }
    return parsed.data;
  } catch {
    return { runs: [] };
  }
}

function estimateUtf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function writeToStorage(history: StoredRunHistory): StorageWriteResult {
  const json = JSON.stringify(history);
  const payloadBytes = estimateUtf8Bytes(json);
  try {
    sessionStorage.setItem(STORAGE_KEY, json);
    return { ok: true };
  } catch (err: unknown) {
    const isQuotaExceeded =
      err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
    if (isQuotaExceeded && history.runs.length > 1) {
      // 오래된 항목을 절반 제거 후 재시도
      const trimmed: StoredRunHistory = {
        runs: history.runs.slice(0, Math.ceil(history.runs.length / 2)),
      };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        return { ok: true };
      } catch {
        return {
          ok: false,
          reason: "quota-exceeded",
          payloadBytes,
          quotaHintBytes: SESSION_STORAGE_QUOTA_HINT_BYTES,
        };
      }
    }
    if (isQuotaExceeded) {
      return {
        ok: false,
        reason: "quota-exceeded",
        payloadBytes,
        quotaHintBytes: SESSION_STORAGE_QUOTA_HINT_BYTES,
      };
    }
    // Quota 이외의 에러(SecurityError 등)는 sessionStorage 자체를 사용할 수 없는 환경이므로,
    // 인메모리 상태에는 영향을 주지 않되, 개발자가 인지할 수 있도록 경고를 남깁니다.
    console.warn("[sonamu] sessionStorage write failed:", err);
    return { ok: true };
  }
}

function toDateKey(finishedAt: string): string {
  const d = new Date(finishedAt);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type UseRunHistorySessionResult = {
  history: StoredRunHistory;
  storageWarning: RunHistoryStorageWarning | null;
  addRun: (entry: Omit<StoredRunEntry, "dateKey">) => void;
  clearHistory: () => void;
};

export function useRunHistorySession(): UseRunHistorySessionResult {
  const [history, setHistory] = useState<StoredRunHistory>(readFromStorage);
  const [storageWarning, setStorageWarning] = useState<RunHistoryStorageWarning | null>(null);
  // sessionStorage에 저장 불가능한 runId를 추적하여 후속 쓰기 시 제외합니다.
  const unpersistableRef = useRef(new Set());

  const addRun = useCallback((entry: Omit<StoredRunEntry, "dateKey">) => {
    setHistory((prev) => {
      const fullEntry: StoredRunEntry = {
        ...entry,
        dateKey: toDateKey(entry.finishedAt),
      };
      const merged = [fullEntry, ...prev.runs];
      // 최신순 정렬
      merged.sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime());
      // 최대 100개 trim
      const trimmed = merged.slice(0, MAX_RUNS);
      const next: StoredRunHistory = { runs: trimmed };

      // sessionStorage에는 저장 불가능한 엔트리를 제외하고 쓰기를 시도합니다.
      const persistable = trimmed.filter((r) => !unpersistableRef.current.has(r.runId));
      const writeResult = writeToStorage({ runs: persistable });
      if (!writeResult.ok && writeResult.reason === "quota-exceeded") {
        // 새 엔트리 자체가 초과 원인이므로 저장 불가 목록에 추가합니다.
        unpersistableRef.current.add(fullEntry.runId);
        // 새 엔트리를 제외하고 기존 저장 상태를 복원합니다.
        const withoutNew = persistable.filter((r) => r.runId !== fullEntry.runId);
        writeToStorage({ runs: withoutNew });
        setStorageWarning({
          runId: fullEntry.runId,
          reason: "quota-exceeded",
          payloadBytes: writeResult.payloadBytes,
          quotaHintBytes: writeResult.quotaHintBytes,
        });
      } else {
        setStorageWarning(null);
      }
      // 인메모리에는 항상 전체를 유지하여 현재 세션에서 조회 가능하도록 합니다.
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    const empty: StoredRunHistory = { runs: [] };
    setHistory(empty);
    setStorageWarning(null);
    unpersistableRef.current.clear();
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage 접근 실패 시 무시
    }
  }, []);

  return { history, storageWarning, addRun, clearHistory };
}

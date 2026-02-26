import { useCallback, useState } from "react";
import type { StoredRunEntry, StoredRunHistory } from "../services/sonamu-ui.service";

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
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredRunHistory(parsed)) {
      return { runs: [] };
    }
    return parsed;
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
    if (isQuotaExceededError(err) && history.runs.length > 1) {
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
    if (isQuotaExceededError(err)) {
      return {
        ok: false,
        reason: "quota-exceeded",
        payloadBytes,
        quotaHintBytes: SESSION_STORAGE_QUOTA_HINT_BYTES,
      };
    }
    return { ok: true };
  }
}

function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === "QuotaExceededError" || err.code === 22;
  }
  return false;
}

function isStoredRunHistory(v: unknown): v is StoredRunHistory {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.runs);
}

function toDateKey(finishedAt: string): string {
  const d = new Date(finishedAt);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function useRunHistorySession(): {
  history: StoredRunHistory;
  storageWarning: RunHistoryStorageWarning | null;
  addRun: (entry: Omit<StoredRunEntry, "dateKey">) => void;
  clearHistory: () => void;
} {
  const [history, setHistory] = useState<StoredRunHistory>(readFromStorage);
  const [storageWarning, setStorageWarning] = useState<RunHistoryStorageWarning | null>(null);

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
      const writeResult = writeToStorage(next);
      if (!writeResult.ok && writeResult.reason === "quota-exceeded") {
        setStorageWarning({
          runId: fullEntry.runId,
          reason: "quota-exceeded",
          payloadBytes: writeResult.payloadBytes,
          quotaHintBytes: writeResult.quotaHintBytes,
        });
      } else {
        setStorageWarning(null);
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    const empty: StoredRunHistory = { runs: [] };
    setHistory(empty);
    setStorageWarning(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage 접근 실패 시 무시
    }
  }, []);

  return { history, storageWarning, addRun, clearHistory };
}

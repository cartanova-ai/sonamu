import { useCallback, useState } from "react";
import type { StoredRunEntry, StoredRunHistory } from "../services/sonamu-ui.service";

const STORAGE_KEY = "sonamu.ui.test-result-viewer.v1";
const MAX_RUNS = 100;

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

function writeToStorage(history: StoredRunHistory): void {
  const json = JSON.stringify(history);
  try {
    sessionStorage.setItem(STORAGE_KEY, json);
  } catch (err: unknown) {
    if (isQuotaExceededError(err) && history.runs.length > 1) {
      // 오래된 항목을 절반 제거 후 재시도
      const trimmed: StoredRunHistory = {
        runs: history.runs.slice(0, Math.ceil(history.runs.length / 2)),
      };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // 재시도도 실패하면 포기
      }
    }
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
  addRun: (entry: Omit<StoredRunEntry, "dateKey">) => void;
  clearHistory: () => void;
} {
  const [history, setHistory] = useState<StoredRunHistory>(readFromStorage);

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
      writeToStorage(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    const empty: StoredRunHistory = { runs: [] };
    setHistory(empty);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage 접근 실패 시 무시
    }
  }, []);

  return { history, addRun, clearHistory };
}

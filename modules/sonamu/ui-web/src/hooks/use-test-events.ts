import { useCallback, useEffect, useRef, useState } from "react";

import type { ManagerStatus, TestSSEEventMap } from "../services/sonamu-ui.service";

type EventHandler<K extends keyof TestSSEEventMap> = (payload: TestSSEEventMap[K]) => void;

type Unsubscribe = () => void;

// SSE 이벤트 페이로드 타입 가드
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function hasSchemaVersion1(v: Record<string, unknown>): boolean {
  return v.schemaVersion === 1;
}

function isManagerStatus(v: unknown): v is ManagerStatus {
  if (!isRecord(v)) return false;
  return (
    typeof v.ready === "boolean" &&
    typeof v.running === "boolean" &&
    (v.lastRunAt === null || typeof v.lastRunAt === "string")
  );
}

function isSnapshotPayload(v: unknown): v is TestSSEEventMap["snapshot"] {
  if (!isRecord(v) || !hasSchemaVersion1(v)) return false;
  return typeof v.serverTime === "string" && isManagerStatus(v.status);
}

function isRunQueuedPayload(v: unknown): v is TestSSEEventMap["runQueued"] {
  if (!isRecord(v) || !hasSchemaVersion1(v)) return false;
  return typeof v.runId === "string" && typeof v.queuedAt === "string" && isRecord(v.request);
}

function isRunStartedPayload(v: unknown): v is TestSSEEventMap["runStarted"] {
  if (!isRecord(v) || !hasSchemaVersion1(v)) return false;
  return typeof v.runId === "string" && typeof v.startedAt === "string";
}

function isRunCompletedPayload(v: unknown): v is TestSSEEventMap["runCompleted"] {
  if (!isRecord(v) || !hasSchemaVersion1(v)) return false;
  if (
    typeof v.runId !== "string" ||
    typeof v.startedAt !== "string" ||
    typeof v.finishedAt !== "string"
  )
    return false;
  if (!isRecord(v.result)) return false;
  const result = v.result as Record<string, unknown>;
  return (
    typeof result.ok === "boolean" && isRecord(result.summary) && Array.isArray(result.results)
  );
}

function isRunErroredPayload(v: unknown): v is TestSSEEventMap["runErrored"] {
  if (!isRecord(v) || !hasSchemaVersion1(v)) return false;
  return (
    typeof v.runId === "string" &&
    typeof v.finishedAt === "string" &&
    isRecord(v.error) &&
    typeof (v.error as Record<string, unknown>).message === "string"
  );
}

function isRunNodeProgressPayload(v: unknown): v is TestSSEEventMap["runNodeProgress"] {
  if (!isRecord(v) || !hasSchemaVersion1(v)) return false;
  return (
    typeof v.runId === "string" &&
    typeof v.startedAt === "string" &&
    typeof v.at === "string" &&
    (v.kind === "file" || v.kind === "suite" || v.kind === "test") &&
    (v.phase === "ready" || v.phase === "result") &&
    typeof v.fileId === "string" &&
    typeof v.nodeId === "string" &&
    (v.parentId === null || typeof v.parentId === "string") &&
    isRecord(v.node)
  );
}

function isHeartbeatPayload(v: unknown): v is TestSSEEventMap["heartbeat"] {
  if (!isRecord(v) || !hasSchemaVersion1(v)) return false;
  return typeof v.at === "string";
}

type PayloadGuard = {
  snapshot: (v: unknown) => v is TestSSEEventMap["snapshot"];
  runQueued: (v: unknown) => v is TestSSEEventMap["runQueued"];
  runStarted: (v: unknown) => v is TestSSEEventMap["runStarted"];
  runCompleted: (v: unknown) => v is TestSSEEventMap["runCompleted"];
  runErrored: (v: unknown) => v is TestSSEEventMap["runErrored"];
  runNodeProgress: (v: unknown) => v is TestSSEEventMap["runNodeProgress"];
  heartbeat: (v: unknown) => v is TestSSEEventMap["heartbeat"];
};

const payloadGuards: PayloadGuard = {
  snapshot: isSnapshotPayload,
  runQueued: isRunQueuedPayload,
  runStarted: isRunStartedPayload,
  runCompleted: isRunCompletedPayload,
  runErrored: isRunErroredPayload,
  runNodeProgress: isRunNodeProgressPayload,
  heartbeat: isHeartbeatPayload,
};

const SSE_URL = "/__test__/events";
const MAX_BACKOFF_MS = 30_000;

export function useTestEvents(options?: { enabled?: boolean }): {
  connected: boolean;
  on: <K extends keyof TestSSEEventMap>(event: K, handler: EventHandler<K>) => Unsubscribe;
} {
  const enabled = options?.enabled ?? true;
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const listenersRef = useRef<Map<keyof TestSSEEventMap, Set<EventHandler<keyof TestSSEEventMap>>>>(
    new Map(),
  );
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const es = new EventSource(SSE_URL);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (unmountedRef.current) return;
      retryCountRef.current = 0;
      setConnected(true);
    };

    es.onerror = () => {
      if (unmountedRef.current) return;
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
      scheduleReconnect();
    };

    const eventNames: (keyof TestSSEEventMap)[] = [
      "snapshot",
      "runQueued",
      "runStarted",
      "runCompleted",
      "runErrored",
      "runNodeProgress",
      "heartbeat",
    ];

    for (const eventName of eventNames) {
      es.addEventListener(eventName, (e: MessageEvent) => {
        if (unmountedRef.current) return;
        try {
          const parsed: unknown = JSON.parse(e.data as string);
          const guard = payloadGuards[eventName];
          if (guard(parsed)) {
            const handlers = listenersRef.current.get(eventName);
            if (handlers) {
              for (const handler of handlers) {
                handler(parsed);
              }
            }
          }
        } catch {
          // JSON 파싱 실패 시 무시
        }
      });
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (unmountedRef.current) return;
    const backoffMs = Math.min(1000 * 2 ** retryCountRef.current, MAX_BACKOFF_MS);
    retryCountRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      connect();
    }, backoffMs);
  }, [connect]);

  useEffect(() => {
    unmountedRef.current = false;

    if (!enabled) {
      return;
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect, enabled]);

  const on = useCallback(
    <K extends keyof TestSSEEventMap>(event: K, handler: EventHandler<K>): Unsubscribe => {
      let handlers = listenersRef.current.get(event);
      if (!handlers) {
        handlers = new Set();
        listenersRef.current.set(event, handlers);
      }
      const wrappedHandler = handler as EventHandler<keyof TestSSEEventMap>;
      handlers.add(wrappedHandler);

      return () => {
        handlers.delete(wrappedHandler);
      };
    },
    [],
  );

  return { connected, on };
}

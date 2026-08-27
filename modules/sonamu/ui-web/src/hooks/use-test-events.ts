import { useCallback, useEffect, useRef, useState } from "react";
import { type ZodType } from "zod";

import { type TestSSEEventMap } from "../services/sonamu-ui.service";
import { testEventPayloadSchemas } from "./test-event-schemas";

type EventHandler<K extends keyof TestSSEEventMap> = (payload: TestSSEEventMap[K]) => void;

type Unsubscribe = () => void;

type TestEventListeners = {
  [K in keyof TestSSEEventMap]: Set<EventHandler<K>>;
};

function createTestEventListeners(): TestEventListeners {
  return {
    snapshot: new Set(),
    runQueued: new Set(),
    runStarted: new Set(),
    runCompleted: new Set(),
    runErrored: new Set(),
    runNodeProgress: new Set(),
    heartbeat: new Set(),
  };
}

function addTestEventListener<Payload>(
  eventSource: EventSource,
  eventName: string,
  schema: ZodType<Payload>,
  listeners: Set<(payload: Payload) => void>,
  isUnmounted: () => boolean,
): void {
  eventSource.addEventListener(eventName, (event: MessageEvent<string>) => {
    if (isUnmounted()) return;
    try {
      const parsed = schema.safeParse(JSON.parse(event.data));
      if (!parsed.success) return;
      for (const handler of listeners) {
        handler(parsed.data);
      }
    } catch {
      // JSON 파싱 실패 시 이벤트를 전달하지 않습니다.
    }
  });
}

const SSE_URL = "/__test__/events";
const MAX_BACKOFF_MS = 30_000;

type UseTestEventsResult = {
  connected: boolean;
  on: <K extends keyof TestSSEEventMap>(event: K, handler: EventHandler<K>) => Unsubscribe;
};

export function useTestEvents(options?: { enabled?: boolean }): UseTestEventsResult {
  const enabled = options?.enabled ?? true;
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const listenersRef = useRef(createTestEventListeners());
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(function connectEventSource() {
    if (unmountedRef.current) return;

    const es = new EventSource(SSE_URL);
    eventSourceRef.current = es;

    es.addEventListener("open", () => {
      if (unmountedRef.current) return;
      retryCountRef.current = 0;
      setConnected(true);
    });

    es.addEventListener("error", () => {
      if (unmountedRef.current) return;
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
      const backoffMs = Math.min(1000 * 2 ** retryCountRef.current, MAX_BACKOFF_MS);
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        connectEventSource();
      }, backoffMs);
    });

    const isUnmounted = () => unmountedRef.current;
    addTestEventListener(
      es,
      "snapshot",
      testEventPayloadSchemas.snapshot,
      listenersRef.current.snapshot,
      isUnmounted,
    );
    addTestEventListener(
      es,
      "runQueued",
      testEventPayloadSchemas.runQueued,
      listenersRef.current.runQueued,
      isUnmounted,
    );
    addTestEventListener(
      es,
      "runStarted",
      testEventPayloadSchemas.runStarted,
      listenersRef.current.runStarted,
      isUnmounted,
    );
    addTestEventListener(
      es,
      "runCompleted",
      testEventPayloadSchemas.runCompleted,
      listenersRef.current.runCompleted,
      isUnmounted,
    );
    addTestEventListener(
      es,
      "runErrored",
      testEventPayloadSchemas.runErrored,
      listenersRef.current.runErrored,
      isUnmounted,
    );
    addTestEventListener(
      es,
      "runNodeProgress",
      testEventPayloadSchemas.runNodeProgress,
      listenersRef.current.runNodeProgress,
      isUnmounted,
    );
    addTestEventListener(
      es,
      "heartbeat",
      testEventPayloadSchemas.heartbeat,
      listenersRef.current.heartbeat,
      isUnmounted,
    );
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    if (!enabled) {
      return undefined;
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
      const handlers = listenersRef.current[event];
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },
    [],
  );

  return { connected, on };
}

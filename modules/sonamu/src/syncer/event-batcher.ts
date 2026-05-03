import { type AbsolutePath } from "../utils/path-utils";

/**
 * 파일 변경 이벤트를 batch로 모아 한 번에 처리하는 throttler를 만듭니다.
 *
 * 동작:
 * - 같은 path가 여러 번 push되면 마지막 event로 dedupe됩니다.
 * - 마지막 push 후 `delayMs` 동안 추가 push가 없으면 한 번에 flush됩니다 (trailing debounce).
 * - flush 도중 들어오는 push는 다음 batch로 큐잉됩니다.
 * - 한 시점에 onFlush는 단 하나만 진행됩니다 — 이로써 onFlush 내부에서 일어나는
 *   작업이 다른 onFlush 호출과 인터리브되지 않음을 보장합니다.
 *
 * 호출자는 push만 하면 됩니다. 내부 큐/타이머 상태는 캡슐화되어 있고, onFlush가
 * 받는 fileEvents는 dedupe된 Map입니다.
 *
 * @example
 * const push = createFileEventBatcher({
 *   delayMs: 100,
 *   onFlush: (fileEvents) => handleBatch(fileEvents),
 * });
 * push("/path/a.ts" as AbsolutePath, "change");
 * push("/path/b.ts" as AbsolutePath, "change"); // 100ms 후 둘 다 한 번에 onFlush로
 */
export function createFileEventBatcher(options: {
  delayMs: number;
  onFlush: (fileEvents: Map<AbsolutePath, string>) => Promise<void>;
}): (path: AbsolutePath, event: string) => void {
  const { delayMs, onFlush } = options;
  const pending = new Map<AbsolutePath, string>();
  let flushTimer: NodeJS.Timeout | null = null;
  let isFlushing = false;

  const scheduleFlush = (): void => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void runFlush();
    }, delayMs);
  };

  const runFlush = async (): Promise<void> => {
    // flush 도중 추가 push로 또 다른 runFlush가 트리거된 경우, 한 번에 하나만 진행되게 합니다.
    // 진행 중인 flush가 끝나면 finally에서 다음 batch를 자동으로 다시 스케줄합니다.
    if (isFlushing || pending.size === 0) {
      return;
    }
    isFlushing = true;
    try {
      // 현재까지 모인 변경을 snapshot으로 잡고 큐는 비웁니다.
      // 이 batch가 처리되는 동안 들어오는 새 변경은 다음 batch로 모입니다.
      const batch = new Map(pending);
      pending.clear();
      try {
        await onFlush(batch);
      } catch (e) {
        console.error(e);
      }
    } finally {
      isFlushing = false;
      if (pending.size > 0) {
        scheduleFlush();
      }
    }
  };

  return (path, event) => {
    pending.set(path, event);
    scheduleFlush();
  };
}

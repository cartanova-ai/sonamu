import { vi } from "vitest";

export interface TimerTracker {
  pending(): number;
  created(): number;
  restore(): void;
}

const FOREIGN_FRAME = /node_modules|\(node:|at node:/;

interface CallSite {
  stack?: string;
}

function callerFrame(stack: string | undefined): string {
  return (
    stack
      ?.split("\n")
      .slice(1)
      .find((line) => !FOREIGN_FRAME.test(line)) ?? ""
  );
}

// Counts only timers created directly from a file matching caller; a process-wide count also sees the SDK's and the
// pg pool's timers and cannot tell whether the code under test left one.
export function trackTimersFrom(caller: RegExp): TimerTracker {
  const live = new Set<unknown>();
  let created = 0;
  const original = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  function tracked(callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) {
    const site: CallSite = {};
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 30;
    Error.captureStackTrace(site, tracked);
    Error.stackTraceLimit = limit;
    const handle = original(
      (...inner: unknown[]) => {
        live.delete(handle);
        callback(...inner);
      },
      ms,
      ...args,
    );
    if (caller.test(callerFrame(site.stack))) {
      created += 1;
      live.add(handle);
    }
    return handle;
  }
  // SAFETY: tracked forwards the same arguments to the original setTimeout and returns its handle.
  const setSpy = vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation(tracked as typeof setTimeout);
  const clearSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation((handle) => {
    live.delete(handle);
    originalClear(handle);
  });
  return {
    pending: () => live.size,
    created: () => created,
    restore: () => {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    },
  };
}

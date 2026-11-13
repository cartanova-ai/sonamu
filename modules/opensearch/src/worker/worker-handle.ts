import {
  SearchConfigurationError,
  SearchError,
  SearchSchemaMissing,
  SearchStopping,
  SearchStoreMismatch,
  SearchUnavailable,
} from "../errors";
import { formatSearchMessage, type SearchMessage, type SearchMessageParamValue } from "../i18n";
import { backoffDelayMs, type RandomSource } from "./backoff";

// stop() refuses new drains (SearchStopping, no I/O), wakes the loop, waits for in-flight drains until the deadline,
// aborts them and waits up to abortGraceMs more; only then does finish() delete the heartbeat row and close the
// client, so no drain touches the database or engine after stop returns.

/** busy: another drain of the same indexer was running, nothing done; empty: targets existed but none was claimable. */
export type DrainOutcome = "processed" | "empty" | "no-targets" | "cooldown" | "cancelled" | "busy";

export interface DrainReport {
  readonly outcome: DrainOutcome;
  /** Sum of the eight counts below. */
  readonly claimed: number;
  readonly indexed: number;
  readonly superseded: number;
  readonly retried: number;
  readonly quarantined: number;
  /** Released without budget, including rows with a newer revision pending or being re-marked. */
  readonly released: number;
  readonly leaseLost: number;
  /** Still leased but locked by another transaction; retried after lease expiry. */
  readonly skippedLocked: number;
  /** Outcome unknown after cancellation; left to lease expiry. */
  readonly abandoned: number;
  readonly unsupportedTargets: readonly string[];
  readonly cooldownRemainingMs: number;
  readonly elapsedMs: number;
}

export type WorkerState = "idle" | "running" | "degraded" | "stopping" | "stopped";

export type WorkerStateReason =
  | "started"
  | "drain-failed"
  | "infrastructure-cooldown"
  | "recovered"
  | "stop-requested"
  | "stopped";

export interface WorkerStateChange {
  readonly previous: WorkerState;
  readonly state: WorkerState;
  readonly reason: WorkerStateReason;
}

export interface WorkerLastError {
  readonly code: string;
  readonly key: string;
  readonly params: Readonly<Record<string, SearchMessageParamValue>> | undefined;
  /** Localized in the package locale when status() is read. */
  readonly message: string;
  readonly at: number;
}

export interface WorkerStatus {
  readonly state: WorkerState;
  readonly startedAt?: number;
  readonly lastDrainAt?: number;
  readonly lastReport?: DrainReport;
  readonly lastError?: WorkerLastError;
  readonly consecutiveFailures: number;
  readonly pausedTargets: readonly string[];
  readonly fenceLostTargets: readonly string[];
  readonly unsupportedTargets: readonly string[];
}

export interface StopReport {
  readonly drained: boolean;
  readonly abortedInFlight: number;
  readonly clientClosed: boolean;
  /** Aborted drains still running after the grace period; every statement they run is bounded by statementTimeoutMs. */
  readonly abandonedDrains: number;
  readonly elapsedMs: number;
}

export interface WorkerHandle {
  stop(options: { deadlineMs: number }): Promise<StopReport>;
  status(): WorkerStatus;
}

export interface StartOptions {
  readonly pollIntervalMs: number;
  /** Aborting it equals stop({ deadlineMs: 0 }). */
  readonly signal?: AbortSignal;
}

export interface WorkerDriver {
  drain(signal: AbortSignal): Promise<DrainReport>;
  gateRemainingMs(): number;
  unrecovered?(): boolean;
  pausedTargets(): readonly string[];
  fenceLostTargets?(): readonly string[];
  finish(): Promise<{ clientClosed: boolean }>;
  onDrainError?(error: SearchError): void;
  onStateChange?(change: WorkerStateChange): void;
  continueImmediately?(report: DrainReport): boolean;
  readonly maxDocumentsPerClaim: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly random?: RandomSource;
  readonly abortGraceMs?: number;
}

export interface WorkerRuntime {
  drainOnce(signal: AbortSignal | undefined): Promise<DrainReport>;
  start(options: StartOptions): WorkerHandle;
  status(): WorkerStatus;
}

type StatusDraft = { -readonly [Key in keyof WorkerStatus]: WorkerStatus[Key] };

interface InFlightDrain {
  readonly controller: AbortController;
  readonly done: Promise<DrainReport | undefined>;
  aborted: boolean;
}

const MAX_TIMER_MS = 2_147_483_647;

function stoppingError(): SearchStopping {
  return new SearchStopping({ key: "error.stopping" }, { details: { reason: "worker-stopping" } });
}

export function toWorkerError<Thrown>(error: Thrown): SearchError {
  if (error instanceof SearchError) return error;
  return new SearchUnavailable(
    { key: "worker.unexpectedError" },
    { details: { reason: "unexpected-error" } },
  );
}

function isConfigurationError(error: SearchError): boolean {
  // A store binding mismatch also needs an operator fix, so it retries at the same slow interval.
  return (
    error instanceof SearchConfigurationError ||
    error instanceof SearchSchemaMissing ||
    error instanceof SearchStoreMismatch
  );
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, Math.min(ms, MAX_TIMER_MS));
    signal.addEventListener("abort", finish, { once: true });
  });
}

export function createWorkerRuntime(driver: WorkerDriver): WorkerRuntime {
  let state: WorkerState = "idle";
  let startedAt: number | undefined;
  let lastDrainAt: number | undefined;
  let lastReport: DrainReport | undefined;
  let lastError: { error: SearchError; at: number } | undefined;
  let consecutiveFailures = 0;
  let unsupportedTargets: readonly string[] = [];
  let handle: WorkerHandle | undefined;
  const inFlight = new Set<InFlightDrain>();
  const policy = { baseDelayMs: driver.retryBaseDelayMs, maxDelayMs: driver.retryMaxDelayMs };

  const stopping = () => state === "stopping" || state === "stopped";

  function setState(next: WorkerState, reason: WorkerStateReason): void {
    const previous = state;
    if (previous === next) return;
    state = next;
    driver.onStateChange?.(Object.freeze({ previous, state: next, reason }));
  }

  function status(): WorkerStatus {
    const snapshot: StatusDraft = {
      state,
      consecutiveFailures,
      pausedTargets: [...driver.pausedTargets()],
      fenceLostTargets: [...(driver.fenceLostTargets?.() ?? [])],
      unsupportedTargets: [...unsupportedTargets],
    };
    if (startedAt !== undefined) snapshot.startedAt = startedAt;
    if (lastDrainAt !== undefined) snapshot.lastDrainAt = lastDrainAt;
    if (lastReport !== undefined) snapshot.lastReport = lastReport;
    if (lastError !== undefined) {
      const { error, at } = lastError;
      snapshot.lastError = Object.freeze({
        code: error.code,
        key: error.messageKey,
        params: error.messageParams,
        // SAFETY: messageKey and messageParams come from the same error.
        message: formatSearchMessage({
          key: error.messageKey,
          params: error.messageParams,
        } as SearchMessage),
        at,
      });
    }
    return Object.freeze(snapshot);
  }

  function track(outer: AbortSignal | undefined): InFlightDrain & { result: Promise<DrainReport> } {
    const controller = new AbortController();
    const forward = () => controller.abort(outer?.reason);
    if (outer?.aborted === true) controller.abort(outer.reason);
    else outer?.addEventListener("abort", forward, { once: true });
    const result = (async () => {
      try {
        const report = await driver.drain(controller.signal);
        // A busy drain did nothing and changes no state.
        if (report.outcome !== "busy") {
          lastDrainAt = Date.now();
          lastReport = report;
          unsupportedTargets = report.unsupportedTargets;
        }
        return report;
      } finally {
        outer?.removeEventListener("abort", forward);
      }
    })();
    const entry: InFlightDrain & { result: Promise<DrainReport> } = {
      controller,
      aborted: false,
      result,
      done: result.then(
        (report) => report,
        () => undefined,
      ),
    };
    inFlight.add(entry);
    void entry.done.then(() => inFlight.delete(entry));
    return entry;
  }

  function recordFailure(error: SearchError): void {
    lastError = { error, at: Date.now() };
    consecutiveFailures += 1;
    driver.onDrainError?.(error);
  }

  return {
    status,

    drainOnce(signal) {
      if (stopping()) return Promise.reject(stoppingError());
      return track(signal).result.catch((thrown: Error) => {
        driver.onDrainError?.(toWorkerError(thrown));
        throw thrown;
      });
    },

    start(options) {
      if (handle !== undefined) return handle;
      if (stopping()) {
        throw stoppingError();
      }
      const pollIntervalMs = Math.min(Math.max(0, options.pollIntervalMs), MAX_TIMER_MS);
      const wake = new AbortController();
      let stopPromise: Promise<StopReport> | undefined;
      let detachSignal = () => {};
      startedAt = Date.now();
      setState("running", "started");

      const loop = (async () => {
        while (!stopping()) {
          let report: DrainReport;
          try {
            report = await track(undefined).result;
          } catch (thrown) {
            if (stopping()) break;
            const error = toWorkerError(thrown);
            recordFailure(error);
            setState("degraded", "drain-failed");
            const delay = isConfigurationError(error)
              ? driver.retryMaxDelayMs
              : backoffDelayMs(policy, consecutiveFailures - 1, driver.random);
            await abortableSleep(delay, wake.signal);
            continue;
          }
          if (stopping()) break;
          consecutiveFailures = 0;
          // A failed drain reports no cooldown, and claiming nothing after one proves no recovery: stay degraded
          // until a success clears the failure.
          const gateRemainingMs = driver.gateRemainingMs();
          const unhealthy =
            report.cooldownRemainingMs > 0 ||
            gateRemainingMs > 0 ||
            driver.unrecovered?.() === true;
          if (unhealthy) setState("degraded", "infrastructure-cooldown");
          else setState("running", "recovered");
          // A claim shortened by skipped locked candidates leaves a backlog too, so it continues at once.
          const more =
            report.claimed >= driver.maxDocumentsPerClaim ||
            (report.claimed > 0 && driver.continueImmediately?.(report) === true);
          if (more && report.cooldownRemainingMs === 0) {
            continue;
          }
          const sleepMs = Math.max(pollIntervalMs, report.cooldownRemainingMs, gateRemainingMs);
          await abortableSleep(sleepMs, wake.signal);
        }
      })();

      const stop = (stopOptions: { deadlineMs: number }): Promise<StopReport> => {
        if (stopPromise !== undefined) return stopPromise;
        const began = performance.now();
        const deadlineMs = Math.min(Math.max(0, stopOptions.deadlineMs), MAX_TIMER_MS);
        setState("stopping", "stop-requested");
        wake.abort();
        detachSignal();
        stopPromise = (async () => {
          const pending = [...inFlight];
          let timer: ReturnType<typeof setTimeout> | undefined;
          const expired = new Promise<"expired">((resolve) => {
            timer = setTimeout(() => resolve("expired"), deadlineMs);
          });
          const settled = Promise.all(pending.map((entry) => entry.done)).then(
            () => "settled" as const,
          );
          const first =
            deadlineMs === 0 && pending.length > 0
              ? "expired"
              : await Promise.race([settled, expired]);
          clearTimeout(timer);
          const drained = first === "settled";
          if (!drained) {
            for (const entry of pending) {
              entry.aborted = true;
              entry.controller.abort(stoppingError());
            }
          }
          const graceMs = driver.abortGraceMs;
          const finished = new Map<InFlightDrain, DrainReport | undefined>();
          const watched = Promise.all(
            pending.map(async (entry) => {
              finished.set(entry, await entry.done);
            }),
          );
          if (drained || graceMs === undefined) {
            await watched;
          } else {
            let graceTimer: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([
              watched,
              new Promise<void>((resolve) => {
                graceTimer = setTimeout(resolve, Math.min(Math.max(0, graceMs), MAX_TIMER_MS));
              }),
            ]);
            clearTimeout(graceTimer);
          }
          const abandonedDrains = pending.filter((entry) => !finished.has(entry)).length;
          // The loop ends only after a drain left behind, so it is not awaited then.
          if (abandonedDrains === 0) await loop;
          const reports = pending.map((entry) => finished.get(entry));
          let abortedInFlight = 0;
          reports.forEach((report, index) => {
            if (pending[index]?.aborted) abortedInFlight += report?.abandoned ?? 0;
          });
          const { clientClosed } = await driver.finish();
          setState("stopped", "stopped");
          return Object.freeze({
            drained,
            abortedInFlight,
            clientClosed,
            abandonedDrains,
            elapsedMs: Math.round(performance.now() - began),
          });
        })();
        return stopPromise;
      };

      handle = Object.freeze({ stop, status });
      if (options.signal !== undefined) {
        const outer = options.signal;
        const onAbort = () => void stop({ deadlineMs: 0 });
        if (outer.aborted) onAbort();
        else {
          outer.addEventListener("abort", onAbort, { once: true });
          detachSignal = () => outer.removeEventListener("abort", onAbort);
        }
      }
      return handle;
    },
  };
}

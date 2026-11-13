import {
  RECOMMENDED_QUERY_LIMITS,
  RECOMMENDED_WORKER_POLL_INTERVAL_MS,
  RECOMMENDED_WORKER_STOP_DEADLINE_MS,
  type SearchQueries,
} from "@sonamu-kit/opensearch";
import { type IndexerEvent } from "@sonamu-kit/opensearch/postgres";
import {
  createSearchLifecycle,
  createSonamuSearchQueries,
  type SearchLifecycle,
} from "@sonamu-kit/opensearch/sonamu";

import { miomockSearchClientOptions } from "./client";
import { getSearchHandles, isSearchWorkerEnabled, SEARCH_NAMESPACE } from "./index";
import { type ProjectSearchDocument, projectsSearchDefinitions } from "./projects.definition";
import { PROJECTS_SEARCH_KEY } from "./synchronization";
import { searchWorkerLimits } from "./worker-limits";

/*
  Re-evaluated with the models on HMR; the lifecycle of the same name then replaces the previous worker.
  Importing must never throw, so tools such as sonamu sync can load the models: a configuration error is kept
  and thrown on first use instead.
*/

export const SEARCH_LIFECYCLE_NAME = "miomock-search";

/** Milliseconds; may only shorten the recommended cursor lifetime, which is the recorded maximum. */
export const SEARCH_CURSOR_LIFETIME_ENV = "MIOMOCK_SEARCH_CURSOR_LIFETIME_MS";

/** Without a PIT (paginate: {} in project-search.ts), this lifetime alone decides how long a cursor stays valid. */
function searchQueryLimits(): typeof RECOMMENDED_QUERY_LIMITS {
  const raw = process.env[SEARCH_CURSOR_LIFETIME_ENV];
  if (raw === undefined || raw === "") {
    return RECOMMENDED_QUERY_LIMITS;
  }
  const lifetimeMs = Number(raw);
  if (
    !Number.isInteger(lifetimeMs) ||
    lifetimeMs <= 0 ||
    lifetimeMs > RECOMMENDED_QUERY_LIMITS.maxCursorLifetimeMs
  ) {
    throw new Error(
      `${SEARCH_CURSOR_LIFETIME_ENV}는 ${RECOMMENDED_QUERY_LIMITS.maxCursorLifetimeMs} 이하의 양의 정수(ms)여야 합니다`,
    );
  }
  return { ...RECOMMENDED_QUERY_LIMITS, maxCursorLifetimeMs: lifetimeMs };
}

/** A drain event arrives on every attempt, so empty drains are not logged. */
function logWorkerEvent(event: IndexerEvent): void {
  switch (event.type) {
    case "drain": {
      const { outcome, report } = event;
      if (outcome === "cooldown") {
        console.warn("[search] drain skipped: cooling down", {
          cooldownRemainingMs: report.cooldownRemainingMs,
        });
        return;
      }
      if (outcome !== "processed") {
        return;
      }
      const summary = {
        claimed: report.claimed,
        indexed: report.indexed,
        released: report.released,
        retried: report.retried,
        quarantined: report.quarantined,
        leaseLost: report.leaseLost,
        skippedLocked: report.skippedLocked,
        abandoned: report.abandoned,
        elapsedMs: report.elapsedMs,
      };
      // Returned or skipped documents are picked up late (up to a lease), so this warning is the only clue to apparent stalls.
      if (
        report.released > 0 ||
        report.retried > 0 ||
        report.leaseLost > 0 ||
        report.skippedLocked > 0 ||
        report.abandoned > 0
      ) {
        console.warn("[search] drain did not index everything", summary);
      } else if (report.indexed > 0 || report.quarantined > 0) {
        console.info("[search] drain", summary);
      }
      return;
    }
    case "quarantined":
      console.error("[search] document quarantined", {
        targetId: event.targetId,
        documentId: event.documentId,
        revision: event.revision,
        errorClass: event.errorClass,
      });
      return;
    case "target-paused":
      console.error("[search] target paused", { targetId: event.targetId, reason: event.reason });
      return;
    case "hash-mismatch":
    case "hash-version-mismatch":
      console.error(`[search] ${event.type}`, {
        targetId: event.targetId,
        documentId: event.documentId,
        revision: event.revision,
      });
      return;
    case "lease-reclaimed":
      console.warn("[search] leases reclaimed", { count: event.count });
      return;
    case "target-fence-lost":
      // Another database took the fence: run `sonamu search confirm-ownership` here, or adopt-store on the copy.
      console.error("[search] target fence lost", {
        targetId: event.targetId,
        class: event.class,
        localEpoch: event.localEpoch,
        remoteEpoch: event.remoteEpoch,
      });
      return;
    case "error":
      // On SEARCH_STORE_MISMATCH nothing is sent until an operator runs `sonamu search adopt-store` or confirm-ownership.
      console.error("[search] drain refused", { code: event.code, reason: event.reason ?? null });
      return;
    case "state":
      (event.state === "degraded" ? console.warn : console.info)("[search] worker state", {
        previous: event.previous,
        state: event.state,
        reason: event.reason,
      });
      return;
    default:
      event satisfies never;
  }
}

type SearchRuntime = {
  readonly queries: SearchQueries<ProjectSearchDocument>;
  readonly lifecycle: SearchLifecycle;
};

function buildRuntime(): SearchRuntime | undefined {
  const handles = getSearchHandles();
  if (handles === undefined) {
    return undefined;
  }
  const queries = createSonamuSearchQueries<ProjectSearchDocument>({
    client: handles.client,
    catalog: { namespace: SEARCH_NAMESPACE },
    logicalKey: PROJECTS_SEARCH_KEY,
    // Every supported fingerprint, so the old target stays readable during a rebuild.
    supportedFingerprints: projectsSearchDefinitions.map((definition) => definition.fingerprint),
    limits: searchQueryLimits(),
    cursor: { signingKeys: [handles.cursorSigningKey] },
    // Only to compare highlights with the current text; responses are built from database rows.
    policy: { sourceIncludes: ["name", "description"] },
  });
  const lifecycle = createSearchLifecycle({
    name: SEARCH_LIFECYCLE_NAME,
    synchronization: handles.synchronization,
    worker: {
      enabled: isSearchWorkerEnabled(),
      client: miomockSearchClientOptions(handles.url),
      definitions: projectsSearchDefinitions,
      limits: searchWorkerLimits(),
      pollIntervalMs: RECOMMENDED_WORKER_POLL_INTERVAL_MS,
      onEvent: logWorkerEvent,
    },
    stopDeadlineMs: RECOMMENDED_WORKER_STOP_DEADLINE_MS,
  });
  return { queries, lifecycle };
}

let runtime: SearchRuntime | undefined;
let runtimeError: unknown;
try {
  runtime = buildRuntime();
} catch (error) {
  runtimeError = error;
}

/** Undefined while search is disabled; throws the error kept from module evaluation. */
export function getSearchRuntime(): SearchRuntime | undefined {
  if (runtimeError !== undefined) {
    throw runtimeError;
  }
  return runtime;
}

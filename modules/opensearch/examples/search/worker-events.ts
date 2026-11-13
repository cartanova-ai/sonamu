import { type IndexerEvent, type WorkerState } from "@sonamu-kit/opensearch/postgres";

// Never use messages, targetId or documentId as metric labels (cardinality); documentId belongs in logs only.
export interface SearchLogger {
  info(message: string, fields: Record<string, string | number>): void;
  warn(message: string, fields: Record<string, string | number>): void;
  error(message: string, fields: Record<string, string | number>): void;
}

export interface SearchMetrics {
  increment(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
}

export function createWorkerEventListener(
  log: SearchLogger,
  metrics: SearchMetrics,
): (event: IndexerEvent) => void {
  return (event) => {
    switch (event.type) {
      case "drain": {
        const { report } = event;
        metrics.increment("search_worker_drains", 1, { outcome: event.outcome });
        metrics.increment("search_worker_indexed", report.indexed);
        metrics.increment("search_worker_retried", report.retried);
        metrics.increment("search_worker_quarantined", report.quarantined);
        if (event.outcome === "cooldown") {
          log.warn("search worker cooling down", { cooldownMs: report.cooldownRemainingMs });
        }
        return;
      }
      case "state":
        reportWorkerState(metrics, event.state);
        if (event.state === "degraded") {
          log.warn("search worker degraded", { previous: event.previous, reason: event.reason });
        } else {
          log.info("search worker state changed", {
            previous: event.previous,
            state: event.state,
            reason: event.reason,
          });
        }
        return;
      case "quarantined":
        // Fix the cause, then release the document with the admin tooling.
        metrics.increment("search_worker_quarantined_documents", 1, {
          errorClass: event.errorClass,
        });
        log.error("search document quarantined", {
          targetId: event.targetId,
          documentId: event.documentId,
          revision: event.revision,
          errorClass: event.errorClass,
        });
        return;
      case "target-paused":
        metrics.increment("search_worker_target_paused", 1, { reason: event.reason });
        log.error("search target paused", { targetId: event.targetId, reason: event.reason });
        return;
      case "hash-mismatch":
        // The projection is not deterministic, or changed without a projectionVersion bump.
        metrics.increment("search_worker_hash_mismatch", 1);
        log.error("search projection hash mismatch", {
          targetId: event.targetId,
          documentId: event.documentId,
          revision: event.revision,
        });
        return;
      case "hash-version-mismatch":
        // Workers of different package versions are running; this does not resolve itself until versions match.
        metrics.increment("search_worker_hash_version_mismatch", 1);
        log.warn("search hash version mismatch", {
          targetId: event.targetId,
          documentId: event.documentId,
          revision: event.revision,
        });
        return;
      case "lease-reclaimed":
        metrics.increment("search_worker_lease_reclaimed", event.count);
        log.warn("search leases reclaimed", { count: event.count });
        return;
      case "target-fence-lost":
        // Another database writes to this index; stop it, then run reclaimLostFences or adoptCopiedDatabase (administration.ts).
        metrics.increment("search_worker_target_fence_lost", 1, { class: event.class });
        log.error("search target fence lost", {
          targetId: event.targetId,
          class: event.class,
          localEpoch: event.localEpoch,
          remoteEpoch: event.remoteEpoch,
        });
        return;
      case "error":
        if (event.code === "SEARCH_STORE_MISMATCH") {
          // Run adoptCopiedStore on a copy, or confirmStoreOwnership on the same store (administration.ts).
          metrics.increment("search_worker_store_mismatch", 1, {
            reason: event.reason ?? "unknown",
          });
          log.error("search store binding mismatch", { reason: event.reason ?? "unknown" });
          return;
        }
        metrics.increment("search_worker_drain_errors", 1, { code: event.code });
        log.error("search drain failed", { code: event.code });
        return;
      default:
        event satisfies never;
    }
  };
}

export function reportWorkerState(metrics: SearchMetrics, state: WorkerState): void {
  metrics.gauge("search_worker_degraded", state === "degraded" ? 1 : 0);
  metrics.gauge("search_worker_running", state === "running" || state === "degraded" ? 1 : 0);
}

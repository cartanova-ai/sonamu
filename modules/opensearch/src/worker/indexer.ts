import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { z } from "zod";

import { getSearchRequester, type SearchClient } from "../client/search-client";
import { type DefinedSearch } from "../definition/define-search";
import { SearchConfigurationError, SearchError } from "../errors";
import {
  type BoundTarget,
  type BoundTargets,
  type ClaimResult,
  createDeliveryStore,
  type DeliveryError,
  type DeliveryKey,
  type DeliveryStore,
  type PauseReason,
} from "../postgres/delivery-store";
import { createFenceStore } from "../postgres/fence-store";
import { isSqlExecutor, uuidSchema } from "../postgres/rows";
import { type SqlExecutor } from "../postgres/sql";
import { storeBindingMismatch } from "../postgres/store-binding";
import { type PostgresSynchronization } from "../postgres/synchronization";
import { createWorkerHeartbeatStore } from "../postgres/worker-heartbeat";
import { backoffDelayMs } from "./backoff";
import {
  BULK_QUERYSTRING,
  type BulkItemRef,
  bulkPath,
  type BulkRequest,
  checkBulkItem,
  createBulkPacker,
  type SerializedBulkItem,
  serializeCanonicalBulkItem,
} from "./bulk";
import {
  applyCooldownEvents,
  type BulkItemOutcome,
  type BulkSendResult,
  deliverBulkRequest,
  type IsolationBudget,
} from "./classify";
import {
  type ConflictCandidate,
  type DivergentDocument,
  MGET_QUERYSTRING,
  mgetBody,
  mgetPath,
  type MgetResult,
  verifyConflicts,
} from "./conflict";
import { createCooldownRegistry } from "./cooldown";
import { FENCE_ACTION_MAX_BYTES } from "./fence";
import {
  createFenceKeeper,
  type FenceDrainContext,
  type GroupFence,
  type TargetFenceLostEvent,
} from "./fence-keeper";
import {
  bulkIsolationBudget,
  materializeCallBoundMs,
  parseWorkerLimits,
  type WorkerLimits,
} from "./limits";
import { type MaterializedDocument, materializeGroup } from "./materialize";
import { boundedExecutor } from "./statement-deadline";
import {
  createWorkerRuntime,
  type DrainOutcome,
  type DrainReport,
  type StartOptions,
  toWorkerError,
  type WorkerHandle,
  type WorkerState,
  type WorkerStateReason,
} from "./worker-handle";

// One drainOnce: gate on stopping, a transactional primary and the client/database cooldown; discover targets and
// check the store binding in one statement; claim under a lease token that fences every later statement on the row;
// run the lease heartbeat; then per target group materialize in a snapshot, check eligibility, bulk through the write
// alias with external versions, classify and settle. Housekeeping statements run one at a time per drain: concurrent
// ones would make SKIP LOCKED skip a row and misreport it as skippedLocked.

export type { DrainOutcome } from "./worker-handle";

/** Stable codes, ids and numbers, never localized; every drain attempt emits exactly one "drain" or "error". */
export type IndexerEvent =
  | { readonly type: "drain"; readonly outcome: DrainOutcome; readonly report: DrainReport }
  | {
      readonly type: "state";
      readonly previous: WorkerState;
      readonly state: WorkerState;
      readonly reason: WorkerStateReason;
    }
  | { readonly type: "target-paused"; readonly targetId: string; readonly reason: string }
  | {
      readonly type: "quarantined";
      readonly targetId: string;
      readonly documentId: string;
      readonly revision: number;
      readonly errorClass: string;
    }
  /** The same revision is indexed with another projection hash; that revision is quarantined. */
  | {
      readonly type: "hash-mismatch";
      readonly targetId: string;
      readonly documentId: string;
      readonly revision: number;
    }
  /** The same revision is indexed under another hash_version; released without budget, not quarantined. */
  | {
      readonly type: "hash-version-mismatch";
      readonly targetId: string;
      readonly documentId: string;
      readonly revision: number;
    }
  | { readonly type: "lease-reclaimed"; readonly count: number }
  /** This database lost the target's fence; nothing is sent to it until confirmStoreOwnership or adoptCopiedStore. */
  | TargetFenceLostEvent
  /** reason is details.reason; store-origin-changed and store-instance-mismatch block remote work until fixed. */
  | { readonly type: "error"; readonly code: string; readonly reason?: string };

const errorReasonSchema = z.string().min(1).max(64);

export interface IndexerOptions {
  readonly client: SearchClient;
  readonly synchronization: PostgresSynchronization;
  readonly definitions: readonly DefinedSearch[];
  readonly limits: WorkerLimits;
  /** Uuid of the worker heartbeat row; generated when omitted. */
  readonly workerId?: string;
  /** Listener exceptions are ignored. */
  readonly onEvent?: (event: IndexerEvent) => void;
}

export interface SearchIndexer {
  drainOnce(options?: { signal?: AbortSignal }): Promise<DrainReport>;
  start(options: StartOptions): WorkerHandle;
}

const functionSchema = z.instanceof(Function);
const optionsSchema = z.strictObject({
  client: z.looseObject({ close: functionSchema }),
  synchronization: z.looseObject({
    namespace: z.string().min(1),
    schema: z.string().min(1),
    options: z.looseObject({ getPrimaryDatabase: functionSchema }),
  }),
  definitions: z
    .array(
      z.looseObject({
        key: z.string().min(1),
        fingerprint: z.string().min(1),
        hashVersion: z.string().min(1),
        materialize: functionSchema,
      }),
    )
    .readonly(),
  limits: z.unknown(),
  workerId: uuidSchema.optional(),
  onEvent: functionSchema.optional(),
});

function invalidOptions(path: string): SearchConfigurationError {
  const field = path.slice(0, 120) || "options";
  return new SearchConfigurationError(
    { key: "worker.invalidOptions", params: { path: field } },
    { details: { reason: "invalid-indexer-options", path: field } },
  );
}

const CANCELLED_ERROR: DeliveryError = { class: "not_sent", reason: "cancelled" };
const INELIGIBLE_ERROR: DeliveryError = { class: "not_sent", reason: "target-ineligible" };
const DATABASE_ERROR: DeliveryError = { class: "infrastructure", cause: "database" };
const DEADLINE_ERROR: DeliveryError = { class: "not_sent", reason: "drain-deadline" };
const FENCE_LOST_ERROR: DeliveryError = { class: "not_sent", reason: "target-fence-lost" };
const FENCE_UNVERIFIED_ERROR: DeliveryError = { class: "not_sent", reason: "fence-unverified" };
const MAX_PAUSED_TARGETS = 256;
const MAX_PAUSE_DOCUMENTS = 20;

function keyId(key: DeliveryKey): string {
  return JSON.stringify([key.targetId, key.documentId, key.intentId]);
}

type KeyStatus = "pending" | "settled";

interface Entry {
  readonly delivery: ClaimResult;
  status: KeyStatus;
  // Never later than the database's lease_expires_at, which uses the statement's clock: the start of the claim or of
  // the heartbeat that last extended this row, plus the lease.
  leaseUntil: number;
}

interface SendDocument {
  readonly documentId: string;
  readonly entry: Entry;
  readonly revision: number;
  readonly meta: ConflictCandidate["attempted"];
}

let memoryProbe: ((heldBytes: number) => void) | undefined;
/** @internal */
export function setWorkerMemoryProbe(probe: ((heldBytes: number) => void) | undefined): void {
  memoryProbe = probe;
}

interface Group {
  readonly target: BoundTarget;
  readonly definition: DefinedSearch;
  readonly entries: Entry[];
  heartbeat: boolean;
  abandoned: boolean;
  sending: boolean;
  fence: GroupFence;
}

interface Ack {
  readonly entry: Entry;
  readonly revision: number;
  readonly kind: "indexed" | "superseded";
}
interface Failure {
  readonly entry: Entry;
  readonly revision: number;
  readonly mode: "retry" | "poison";
  readonly delayMs: number;
  readonly error: DeliveryError;
}
interface Release {
  readonly entry: Entry;
  readonly revision: number;
  readonly delayMs: number;
  readonly error: DeliveryError;
}

interface Counts {
  claimed: number;
  indexed: number;
  superseded: number;
  retried: number;
  quarantined: number;
  released: number;
  leaseLost: number;
  skippedLocked: number;
  abandoned: number;
}

function emptyCounts(): Counts {
  return {
    claimed: 0,
    indexed: 0,
    superseded: 0,
    retried: 0,
    quarantined: 0,
    released: 0,
    leaseLost: 0,
    skippedLocked: 0,
    abandoned: 0,
  };
}

function createSerial(): <T>(run: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(run: () => Promise<T>): Promise<T> => {
    const next = tail.then(run, run);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

/** Creates an indexing worker; nothing connects or starts until drainOnce or start. */
export function createIndexer(options: IndexerOptions): SearchIndexer {
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = [
      ...(issue?.path ?? []),
      ...(issue?.code === "unrecognized_keys" ? [issue.keys[0] ?? ""] : []),
    ];
    throw invalidOptions(path.map(String).join("."));
  }
  const limits = parseWorkerLimits(options.limits);
  const requester = getSearchRequester(options.client);
  const { synchronization, client } = options;
  const namespace = synchronization.namespace;
  const store: DeliveryStore = createDeliveryStore({ schema: synchronization.schema });
  const heartbeats = createWorkerHeartbeatStore({ schema: synchronization.schema });
  const workerId = options.workerId ?? randomUUID();
  const registry = new Map<string, DefinedSearch>();
  for (const definition of options.definitions) {
    const id = `${definition.key}@${definition.fingerprint}`;
    if (registry.has(id)) {
      throw new SearchConfigurationError(
        { key: "worker.duplicateDefinition", params: { key: definition.key } },
        { details: { reason: "duplicate-definition", key: definition.key } },
      );
    }
    registry.set(id, definition);
  }
  const capabilities = [...registry.keys()];
  const policy = { baseDelayMs: limits.retryBaseDelayMs, maxDelayMs: limits.retryMaxDelayMs };
  const cooldown = createCooldownRegistry(policy);
  const pausedTargets = new Set<string>();
  const rememberPaused = (targetId: string) => {
    pausedTargets.delete(targetId);
    pausedTargets.add(targetId);
    while (pausedTargets.size > MAX_PAUSED_TARGETS) {
      const oldest = pausedTargets.values().next();
      if (oldest.done === true) break;
      pausedTargets.delete(oldest.value);
    }
  };
  let activeDrain = false;
  const startedAt = new Date();
  let lastCapabilityBeat: number | undefined;
  let rowWritten = false;
  let directDrains = 0;
  // The next heartbeat write waits for this delete so the delete cannot remove a new row.
  let removing: Promise<void> = Promise.resolve();
  const shortBySkip = new WeakSet<DrainReport>();
  let systemIdentifierReadable = true;
  const instanceName = synchronization.instanceName ?? null;
  // Discovery calls a renewal due after interval × (1 + j), j in [0, 0.25) per process, while the advance intent uses
  // the plain interval: the worker with the smallest jitter renews and the others send nothing.
  const fenceStore = createFenceStore({ schema: synchronization.schema, context: "worker" });
  const discoveryIntervalMs = Math.round(limits.fenceRenewIntervalMs * (1 + Math.random() * 0.25));
  // Every request reserves room for the fence item (MIN_BULK_BYTES exceeds it).
  const requestBodyBytes = limits.maxBulkBytes - FENCE_ACTION_MAX_BYTES;
  const fenceKeeper = createFenceKeeper({
    fences: fenceStore,
    requester,
    limits,
    cooldown,
    emit: (event) => emit(event),
  });

  async function discoverTargets(db: SqlExecutor): Promise<BoundTargets> {
    // A role without pg_control_system() fails with 42501 once per process; discovery then runs without the identifier.
    const input = { namespace, instanceName, fenceRenewIntervalMs: discoveryIntervalMs };
    if (!systemIdentifierReadable) {
      return store.listBoundTargets(db, { ...input, systemIdentifierReadable: false });
    }
    try {
      return await store.listBoundTargets(db, { ...input, systemIdentifierReadable: true });
    } catch (error) {
      if (!(error instanceof SearchError) || error.details?.sqlstate !== "42501") throw error;
      const fallback = await store.listBoundTargets(db, {
        ...input,
        systemIdentifierReadable: false,
      });
      systemIdentifierReadable = false;
      return fallback;
    }
  }

  const emit = (event: IndexerEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // A listener failure never affects the worker.
    }
  };

  function primary(): Knex {
    const db = synchronization.options.getPrimaryDatabase();
    if (!isSqlExecutor(db)) {
      throw new SearchConfigurationError(
        { key: "worker.invalidPrimary" },
        { details: { reason: "invalid-primary" } },
      );
    }
    // Knex ignores isolation level and read-only in nested transactions.
    if (db.isTransaction === true) {
      throw new SearchConfigurationError(
        { key: "worker.primaryIsTransaction" },
        { details: { reason: "primary-is-transaction" } },
      );
    }
    return db;
  }

  function report(
    counts: Counts,
    outcome: DrainOutcome,
    extra: { unsupportedTargets: readonly string[]; cooldownRemainingMs: number; started: number },
  ): DrainReport {
    return Object.freeze({
      outcome,
      ...counts,
      unsupportedTargets: Object.freeze([...extra.unsupportedTargets]),
      cooldownRemainingMs: Math.ceil(extra.cooldownRemainingMs),
      elapsedMs: Math.round(performance.now() - extra.started),
    });
  }

  async function beatCapabilities(
    db: SqlExecutor,
    last: DrainReport | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    await removing;
    // After stop began, a heartbeat must not revive the row stop deletes.
    if (signal.aborted) return;
    const now = performance.now();
    if (lastCapabilityBeat !== undefined && now - lastCapabilityBeat < limits.heartbeatIntervalMs) {
      return;
    }
    const lastReport =
      last === undefined
        ? null
        : {
            claimed: last.claimed,
            indexed: last.indexed,
            superseded: last.superseded,
            retried: last.retried,
            quarantined: last.quarantined,
            released: last.released,
            leaseLost: last.leaseLost,
            skippedLocked: last.skippedLocked,
            abandoned: last.abandoned,
            unsupportedTargets: last.unsupportedTargets.length,
            elapsedMs: last.elapsedMs,
          };
    const state = runtime.status().state;
    await heartbeats.beat(db, {
      workerId,
      namespace,
      capabilities,
      state: state === "stopped" ? "stopping" : state,
      startedAt,
      lastReport,
    });
    lastCapabilityBeat = now;
    rowWritten = true;
    try {
      await heartbeats.prune(db, workerId);
    } catch {
      // Expired rows are invisible to inspection; the next heartbeat retries.
    }
  }

  function removeCapabilityRow(): Promise<void> {
    lastCapabilityBeat = undefined;
    removing = removing.then(async () => {
      if (!rowWritten) return;
      try {
        await heartbeats.remove(boundedExecutor(primary(), limits.statementTimeoutMs), workerId);
        rowWritten = false;
      } catch {
        // The row expires after WORKER_HEARTBEAT_EXPIRY_MS and another worker's heartbeat deletes it.
      }
    });
    return removing;
  }

  async function drain(signal: AbortSignal): Promise<DrainReport> {
    if (activeDrain) {
      const busy = report(emptyCounts(), "busy", {
        unsupportedTargets: [],
        cooldownRemainingMs: 0,
        started: performance.now(),
      });
      emit({ type: "drain", outcome: "busy", report: busy });
      return busy;
    }
    activeDrain = true;
    try {
      return await runDrain(signal);
    } finally {
      activeDrain = false;
    }
  }

  async function runDrain(signal: AbortSignal): Promise<DrainReport> {
    const started = performance.now();
    const counts = emptyCounts();
    const finish = (
      outcome: DrainOutcome,
      unsupported: readonly string[],
      cooldownRemainingMs = 0,
    ): DrainReport => {
      const finished = report(counts, outcome, {
        unsupportedTargets: unsupported,
        cooldownRemainingMs,
        started,
      });
      emit({ type: "drain", outcome, report: finished });
      return finished;
    };
    if (signal.aborted) return finish("cancelled", []);

    const db = primary();
    const sqlDb = boundedExecutor(db, limits.statementTimeoutMs);
    const gate = cooldown.drainGate();
    if (gate.blocked) return finish("cooldown", [], gate.remainingMs);

    const { binding, targets } = await discoverTargets(sqlDb);
    const mismatch = storeBindingMismatch(binding);
    if (mismatch !== undefined) throw mismatch;
    cooldown.retainTargets(new Set(targets.map((target) => target.targetId)));
    await fenceKeeper.observe(sqlDb, targets);
    const fencedTargets = targets.filter((target) => !target.fence.lost);
    const cooling = new Set(cooldown.coolingTargets());
    const unsupported: string[] = [];
    const supported = new Map<string, { target: BoundTarget; definition: DefinedSearch }>();
    for (const target of fencedTargets) {
      const definition = registry.get(`${target.definition}@${target.fingerprint}`);
      if (definition === undefined || definition.hashVersion !== target.hashVersion) {
        unsupported.push(target.targetId);
      } else if (!cooling.has(target.targetId)) {
        supported.set(target.targetId, { target, definition });
      }
      pausedTargets.delete(target.targetId);
    }
    unsupported.splice(0, unsupported.length, ...unsupported.toSorted());
    await beatCapabilities(sqlDb, runtime.status().lastReport, signal);
    if (signal.aborted) return finish("cancelled", unsupported);
    const renewOnly = async (from: number): Promise<void> => {
      if (signal.aborted) return;
      await fenceKeeper.maintain(
        { db: sqlDb, signal, deadline: from + limits.leaseDurationMs },
        { all: fencedTargets, groups: [] },
      );
    };
    if (supported.size === 0) {
      // Fences are renewed even when there is nothing to claim.
      await renewOnly(performance.now());
      return finish("no-targets", unsupported);
    }

    // The work deadline counts from the start of the claim, never after lease_expires_at, so work within it ends
    // inside the lease even if no heartbeat succeeds. Started work ends within its own timeout (maxDrainDurationMs).
    const leaseToken = randomUUID();
    const claimStartedAt = performance.now();
    const batch = await store.claimBatch(sqlDb, {
      targetIds: [...supported.keys()],
      limit: limits.maxDocumentsPerClaim,
      leaseToken,
      leaseMs: limits.leaseDurationMs,
    });
    const claimed = batch.rows;
    counts.claimed = claimed.length;
    if (claimed.length === 0) {
      await renewOnly(claimStartedAt);
      return finish("empty", unsupported);
    }
    const skippedCandidates =
      claimed.length < limits.maxDocumentsPerClaim && batch.candidates > claimed.length;
    const windowEnd = claimStartedAt + limits.leaseDurationMs;
    const leaseUntil = claimStartedAt + limits.leaseDurationMs;
    const fenceContext: FenceDrainContext = { db: sqlDb, signal, deadline: windowEnd };

    const entries = new Map<string, Entry>();
    const groups = new Map<string, Group>();
    const orphans: Entry[] = [];
    for (const delivery of claimed) {
      const entry: Entry = { delivery, status: "pending", leaseUntil };
      entries.set(keyId(delivery), entry);
      let group = groups.get(delivery.targetId);
      if (group === undefined) {
        const found = supported.get(delivery.targetId);
        if (found === undefined) {
          orphans.push(entry);
          continue;
        }
        group = {
          ...found,
          entries: [],
          heartbeat: true,
          abandoned: false,
          sending: false,
          fence: {
            pair: { epoch: found.target.fence.epoch, nonce: found.target.fence.nonce },
            status: "send",
            reconciling: undefined,
          },
        };
        groups.set(delivery.targetId, group);
      }
      group.entries.push(entry);
    }
    const serial = createSerial();
    const pending = (list: readonly Entry[]) => list.filter((entry) => entry.status === "pending");
    // After a database failure in this drain, later successful groups do not clear the database cooldown: it delays
    // the next claim while groups already claimed proceed.
    let databaseTrouble = false;
    if (orphans.length > 0) {
      await serial(() => settleBatch({ releases: releasesOf(orphans, INELIGIBLE_ERROR) }));
    }

    function releasesOf(list: readonly Entry[], error: DeliveryError): Release[] {
      return pending(list).map((entry) => ({
        entry,
        revision: entry.delivery.claimedRevision,
        delayMs: 0,
        error,
      }));
    }

    async function settleBatch(input: {
      acks?: readonly Ack[];
      failures?: readonly Failure[];
      releases?: readonly Release[];
    }): Promise<void> {
      const requested: Entry[] = [];
      const returned: DeliveryKey[] = [];
      const acks = (input.acks ?? []).filter((ack) => ack.entry.status === "pending");
      const failures = (input.failures ?? []).filter(
        (failure) => failure.entry.status === "pending",
      );
      const releases = (input.releases ?? []).filter(
        (release) => release.entry.status === "pending",
      );
      for (const item of [...acks, ...failures, ...releases]) item.entry.status = "settled";
      if (acks.length > 0) {
        requested.push(...acks.map((ack) => ack.entry));
        const rows = await store.acknowledge(sqlDb, {
          leaseToken,
          items: acks.map((ack) => ({ ...keyOf(ack.entry), materializedRevision: ack.revision })),
        });
        const kinds = new Map(acks.map((ack) => [keyId(ack.entry.delivery), ack.kind]));
        for (const row of rows) {
          // released: the marker holds the intent, so only the lease was freed and nothing was acknowledged.
          if (row.outcome === "released") counts.released += 1;
          else if (kinds.get(keyId(row)) === "superseded") counts.superseded += 1;
          else counts.indexed += 1;
        }
        returned.push(...rows);
      }
      if (failures.length > 0) {
        requested.push(...failures.map((failure) => failure.entry));
        const results = await store.classifyFailures(sqlDb, {
          leaseToken,
          maxRetryAttempts: limits.maxRetryAttempts,
          maxRetryAgeMs: limits.maxRetryAgeMs,
          items: failures.map((failure) => ({
            ...keyOf(failure.entry),
            materializedRevision: failure.revision,
            mode: failure.mode,
            delayMs: failure.delayMs,
            error: failure.error,
          })),
        });
        const byKey = new Map(failures.map((failure) => [keyId(failure.entry.delivery), failure]));
        for (const result of results) {
          if (result.outcome === "retry_scheduled") counts.retried += 1;
          else if (result.outcome === "newer_pending") counts.released += 1;
          else {
            counts.quarantined += 1;
            const failure = byKey.get(keyId(result));
            emit({
              type: "quarantined",
              targetId: result.targetId,
              documentId: result.documentId,
              revision: failure?.revision ?? 0,
              errorClass: failure?.error.class ?? "unknown",
            });
          }
        }
        returned.push(...results);
      }
      if (releases.length > 0) {
        requested.push(...releases.map((release) => release.entry));
        const rows = await store.release(sqlDb, {
          leaseToken,
          items: releases.map((release) => ({
            ...keyOf(release.entry),
            revision: release.revision,
            delayMs: release.delayMs,
            error: release.error,
          })),
        });
        counts.released += rows.length;
        returned.push(...rows);
      }
      if (requested.length === returned.length) return;
      const unreturned = await store.classifyUnreturned(
        sqlDb,
        leaseToken,
        requested.map((entry) => entry.delivery),
        returned,
      );
      counts.leaseLost += unreturned.leaseLost.length;
      counts.skippedLocked += unreturned.skippedLocked.length;
      if (unreturned.leaseLost.length > 0) {
        emit({ type: "lease-reclaimed", count: unreturned.leaseLost.length });
      }
    }

    async function abandonGroup(group: Group, error: DeliveryError): Promise<void> {
      group.abandoned = true;
      group.heartbeat = false;
      await serial(() => settleBatch({ releases: releasesOf(group.entries, error) }));
    }

    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatRunning: Promise<void> = Promise.resolve();
    let heartbeatStopped = false;
    async function heartbeatTick(): Promise<void> {
      const live = [...groups.values()].filter((group) => group.heartbeat && !group.abandoned);
      const skippedByGroup = new Map<Group, number>();
      await serial(async () => {
        const still = live.flatMap((group) => pending(group.entries));
        if (still.length === 0) return;
        const tickStartedAt = performance.now();
        const returned = await store.heartbeat(sqlDb, {
          leaseToken,
          deliveries: still.map((entry) => entry.delivery),
          leaseMs: limits.leaseDurationMs,
        });
        const answered = new Set(returned.map(keyId));
        const missing = still.filter((entry) => !answered.has(keyId(entry.delivery)));
        for (const entry of still) {
          if (answered.has(keyId(entry.delivery))) {
            entry.leaseUntil = tickStartedAt + limits.leaseDurationMs;
          }
        }
        if (missing.length === 0) return;
        const unreturned = await store.classifyUnreturned(
          sqlDb,
          leaseToken,
          missing.map((entry) => entry.delivery),
          [],
        );
        const lost = new Set(unreturned.leaseLost.map(keyId));
        for (const entry of missing) {
          if (lost.has(keyId(entry.delivery)) && entry.status === "pending") {
            entry.status = "settled";
            counts.leaseLost += 1;
          }
        }
        if (lost.size > 0) emit({ type: "lease-reclaimed", count: lost.size });
        const skipped = new Set(unreturned.skippedLocked.map(keyId));
        for (const group of live) {
          const left = pending(group.entries);
          if (left.length > 0 && left.every((entry) => skipped.has(keyId(entry.delivery)))) {
            skippedByGroup.set(group, left.length);
          }
        }
      });
      // A group missing entirely from the heartbeat and now ineligible is no longer extended; unsent, it is released.
      for (const group of skippedByGroup.keys()) {
        const eligibility = await store.checkTargetEligibility(sqlDb, group.target.targetId);
        if (eligibility.eligible) continue;
        group.heartbeat = false;
        if (!group.sending) await abandonGroup(group, INELIGIBLE_ERROR);
      }
    }
    const scheduleHeartbeat = () => {
      if (heartbeatStopped) return;
      heartbeatTimer = setTimeout(() => {
        heartbeatRunning = (async () => {
          try {
            await heartbeatTick();
          } catch {
            // A failed heartbeat only lets leases expire; the lease token on every recording statement keeps it safe.
          }
          scheduleHeartbeat();
        })();
      }, limits.heartbeatIntervalMs);
    };
    scheduleHeartbeat();

    try {
      const groupFences = await fenceKeeper.maintain(fenceContext, {
        all: fencedTargets,
        groups: [...groups.values()].map((group) => group.target),
      });
      for (const group of groups.values()) {
        const fence = groupFences.get(group.target.targetId);
        if (fence !== undefined) group.fence = fence;
      }
      for (const group of [...groups.values()].sort((a, b) =>
        a.target.targetId < b.target.targetId ? -1 : 1,
      )) {
        if (group.abandoned) continue;
        if (signal.aborted) {
          await abandonGroup(group, CANCELLED_ERROR);
          continue;
        }
        await processGroup(group);
      }
    } catch (error) {
      // Best-effort release without a shared delay (the cause may be this process's connection); entering the
      // database cooldown here also holds back direct drainOnce callers.
      if (cooldown.remainingMs({ scope: "database" }) <= 0) cooldown.enter({ scope: "database" });
      for (const group of groups.values()) {
        try {
          await serial(() => settleBatch({ releases: releasesOf(group.entries, DATABASE_ERROR) }));
        } catch {
          // Rows not released are reclaimed after lease expiry.
        }
      }
      throw error;
    } finally {
      heartbeatStopped = true;
      clearTimeout(heartbeatTimer);
      await heartbeatRunning;
    }

    const finished = finish("processed", unsupported);
    if (skippedCandidates) shortBySkip.add(finished);
    return finished;

    async function processGroup(group: Group): Promise<void> {
      const live = pending(group.entries);
      // Chunks of maxInFlightBytes / largest item seen share one bisection budget (each chunk's first call is free).
      const isolationBudget = { remaining: Math.max(0, limits.maxIsolationCallsPerBatch - 1) };
      const bulkBudget: IsolationBudget = { remaining: bulkIsolationBudget(limits) };
      let largestItemBytes = 0;
      let cursor = 0;
      while (cursor < live.length) {
        if (group.abandoned) return;
        const rest = live.slice(cursor);
        if (group.fence.status !== "send") {
          group.heartbeat = false;
          const error = group.fence.status === "lost" ? FENCE_LOST_ERROR : FENCE_UNVERIFIED_ERROR;
          await serial(() => settleBatch({ releases: releasesOf(rest, error) }));
          return;
        }
        if (signal.aborted) {
          await serial(() => settleBatch({ releases: releasesOf(rest, CANCELLED_ERROR) }));
          return;
        }
        if (performance.now() > windowEnd) {
          await serial(() => settleBatch({ releases: releasesOf(rest, DEADLINE_ERROR) }));
          return;
        }
        const perDocument = largestItemBytes > 0 ? largestItemBytes : limits.maxBulkBytes;
        const size = Math.max(
          1,
          Math.min(rest.length, Math.floor(limits.maxInFlightBytes / perDocument)),
        );
        const chunk = pending(rest.slice(0, size));
        cursor += size;
        if (chunk.length === 0) continue;
        const outcome = await processChunk(group, chunk, {
          isolationBudget,
          bulkBudget,
          observe: (bytes) => {
            largestItemBytes = Math.max(largestItemBytes, bytes);
          },
        });
        if (outcome === "infrastructure") {
          await serial(() =>
            settleBatch({ releases: releasesOf(live.slice(cursor), DATABASE_ERROR) }),
          );
          return;
        }
      }
    }

    async function processChunk(
      group: Group,
      chunk: readonly Entry[],
      shared: {
        isolationBudget: { remaining: number };
        bulkBudget: IsolationBudget;
        observe(bytes: number): void;
      },
    ): Promise<"ok" | "infrastructure"> {
      const { target, definition } = group;
      const targetId = target.targetId;
      const acks: Ack[] = [];
      const failures: Failure[] = [];
      const releases: Release[] = [];
      const divergent: { entry: Entry; revision: number; document: DivergentDocument }[] = [];
      const aliasMissing: { entry: Entry; revision: number; error: DeliveryError }[] = [];
      const conflicts: { entry: Entry; candidate: ConflictCandidate; revision: number }[] = [];
      const entryOf = (key: DeliveryKey): Entry | undefined => entries.get(keyId(key));

      const send = async (
        request: BulkRequest<SendDocument, BulkItemRef<SendDocument>>,
      ): Promise<BulkSendResult> => {
        if (group.abandoned || signal.aborted) return { kind: "skipped" };
        if (group.fence.reconciling !== undefined) await group.fence.reconciling;
        if (group.fence.status === "lost") return { kind: "skipped", reason: "target-fence-lost" };
        if (group.fence.status === "hold") return { kind: "skipped", reason: "fence-unverified" };
        if (performance.now() > windowEnd) return { kind: "deadline" };
        const eligibility = await store.checkTargetEligibility(sqlDb, targetId);
        if (!eligibility.eligible || group.abandoned) {
          group.heartbeat = false;
          return { kind: "skipped" };
        }
        // A request that could outlive its documents' lease is not sent: another worker could then handle them.
        let shortest = Number.POSITIVE_INFINITY;
        for (const item of request.items) {
          shortest = Math.min(shortest, item.document.entry.leaseUntil);
        }
        if (performance.now() + limits.requestTimeoutMs > shortest) return { kind: "deadline" };
        group.sending = true;
        const prefix = fenceKeeper.prefix(group.fence);
        let response;
        try {
          response = await requester.send(
            {
              method: "POST",
              path: bulkPath(target.writeAlias),
              ndjson: prefix + request.body,
              querystring: BULK_QUERYSTRING,
            },
            { signal, timeoutMs: limits.requestTimeoutMs },
          );
        } catch (error) {
          await fenceKeeper.afterSend(fenceContext, target, group.fence, { kind: "failed" });
          return { kind: "thrown", error };
        }
        // The fence item never changes document classification; on 409 this returns after reconciliation.
        await fenceKeeper.afterSend(fenceContext, target, group.fence, {
          kind: "response",
          status: response.status,
          body: response.body,
          prefixed: prefix !== "",
        });
        return {
          kind: "response",
          status: response.status,
          body: response.body,
          leadingItems: prefix === "" ? 0 : 1,
        };
      };

      // Held bytes (packing, sending, and each request's fence reservation) never exceed maxInFlightBytes.
      const packer = createBulkPacker<SendDocument>({
        maxBulkBytes: requestBodyBytes,
        maxDocuments: limits.maxDocumentsPerClaim,
      });
      const inFlight = new Set<Promise<void>>();
      let inFlightBytes = 0;
      const heldBytes = () =>
        inFlightBytes +
        (packer.pendingBytes() > 0 ? packer.pendingBytes() + FENCE_ACTION_MAX_BYTES : 0);
      const awaitOne = () => Promise.race(inFlight);
      const dispatch = async (
        request: BulkRequest<SendDocument, BulkItemRef<SendDocument>>,
      ): Promise<void> => {
        while (inFlight.size >= limits.maxConcurrentBulkRequests) await awaitOne();
        const reserved = request.bytes + FENCE_ACTION_MAX_BYTES;
        inFlightBytes += reserved;
        memoryProbe?.(heldBytes());
        const running = (async () => {
          try {
            const delivered = await deliverBulkRequest(request, send, {
              budget: shared.bulkBudget,
              signal,
            });
            applyCooldownEvents(cooldown, targetId, delivered.cooldown);
            for (const { item, outcome } of delivered.items) {
              routeItem(item.document, item.version, outcome);
            }
          } finally {
            inFlightBytes -= reserved;
          }
        })();
        inFlight.add(running);
        // Registered first, so a finished request leaves the set before any waiter wakes.
        void running.then(
          () => inFlight.delete(running),
          () => inFlight.delete(running),
        );
      };
      const admit = async (item: SerializedBulkItem<SendDocument>): Promise<void> => {
        if (packer.wouldClose(item)) {
          const closed = packer.flush();
          if (closed !== undefined) await dispatch(closed);
        }
        const opening = packer.pendingBytes() + FENCE_ACTION_MAX_BYTES;
        while (
          inFlight.size > 0 &&
          inFlightBytes + opening + item.bytes > limits.maxInFlightBytes
        ) {
          await awaitOne();
        }
        if (inFlightBytes + opening + item.bytes > limits.maxInFlightBytes) {
          // Nothing in flight and still over: send the open request first; maxInFlightBytes >= maxBulkBytes then fits
          // one.
          const closed = packer.flush();
          if (closed !== undefined) await dispatch(closed);
          while (
            inFlight.size > 0 &&
            inFlightBytes + item.bytes + FENCE_ACTION_MAX_BYTES > limits.maxInFlightBytes
          ) {
            await awaitOne();
          }
        }
        packer.add(item);
        memoryProbe?.(heldBytes());
      };

      const onMaterialized = async (document: MaterializedDocument): Promise<void> => {
        const entry = entryOf(document.delivery);
        if (entry === undefined || entry.status !== "pending") return;
        const meta = document.envelope.sonamu_meta;
        const sendDocument: SendDocument = {
          documentId: document.delivery.documentId,
          entry,
          revision: document.revision,
          meta,
        };
        const checked = checkBulkItem(
          serializeCanonicalBulkItem(sendDocument, {
            meta,
            canonical: document.projection.state === "present" ? document.canonical : undefined,
          }),
          // Without the fence reservation, so an item filling a request alone still fits with the fence item.
          { maxBulkBytes: requestBodyBytes },
        );
        if (checked.kind === "rejected") {
          failures.push({
            entry,
            revision: document.revision,
            mode: "poison",
            delayMs: 0,
            error: { class: checked.rejected.reason, bytes: checked.rejected.bytes },
          });
          return;
        }
        shared.observe(checked.item.bytes);
        await admit(checked.item);
      };

      let result;
      try {
        result = await materializeGroup({
          db,
          store,
          namespace,
          definition,
          deliveries: chunk.map((entry) => entry.delivery),
          limits: {
            projectionTimeoutMs: limits.projectionTimeoutMs,
            maxIsolationCallsPerBatch: limits.maxIsolationCallsPerBatch,
            maxBulkBytes: limits.maxBulkBytes,
          },
          signal,
          deadlineAt: windowEnd,
          callTimeoutMs: materializeCallBoundMs(limits),
          isolationBudget: shared.isolationBudget,
          onMaterialized,
        });
      } catch (error) {
        cooldown.enter({ scope: "database" });
        // Sent requests are awaited so no connection is left with unknown results.
        await Promise.allSettled(inFlight);
        throw error;
      }
      const tail = packer.flush();
      if (tail !== undefined) await dispatch(tail);
      while (inFlight.size > 0) await awaitOne();

      if (result.infrastructureError !== undefined) {
        databaseTrouble = true;
        cooldown.enter({ scope: "database" });
      } else if (!databaseTrouble) {
        cooldown.clear({ scope: "database" });
      }

      for (const outcome of result.documents) {
        if (outcome.kind !== "failed") continue;
        const entry = entryOf(outcome.delivery);
        if (entry === undefined || entry.status !== "pending") continue;
        switch (outcome.disposition) {
          case "poison":
            failures.push({
              entry,
              revision: outcome.revision,
              mode: "poison",
              delayMs: 0,
              error: outcome.deliveryError,
            });
            break;
          case "retry":
            failures.push({
              entry,
              revision: outcome.revision,
              mode: "retry",
              delayMs: retryDelay(entry.delivery, outcome.revision),
              error: outcome.deliveryError,
            });
            break;
          case "release":
            // The database cooldown holds back this worker; the shared row gets no delay so other workers take it at
            // once.
            releases.push({
              entry,
              revision: outcome.revision,
              delayMs: 0,
              error: outcome.deliveryError,
            });
            break;
        }
      }

      if (conflicts.length > 0) {
        if (performance.now() > windowEnd) {
          for (const conflict of conflicts) {
            releases.push({
              entry: conflict.entry,
              revision: conflict.revision,
              delayMs: 0,
              error: { class: "conflict_unverified", reason: "drain-deadline" },
            });
          }
        } else {
          await verify(conflicts);
        }
      }

      if (aliasMissing.length > 0 || divergent.length > 0) {
        let eligible = false;
        try {
          eligible = (await store.checkTargetEligibility(sqlDb, targetId)).eligible;
        } catch {
          eligible = false;
        }
        if (eligible) {
          const reason: PauseReason =
            divergent.length > 0
              ? {
                  class: "revision_divergence",
                  documents: divergent.slice(0, MAX_PAUSE_DOCUMENTS).map((item) => item.document),
                }
              : { class: "write_alias_missing" };
          const paused = await serial(() => store.pauseTarget(sqlDb, { targetId, reason }));
          if (paused) emit({ type: "target-paused", targetId, reason: reason.class });
          rememberPaused(targetId);
        }
        for (const item of aliasMissing)
          releases.push({
            entry: item.entry,
            revision: item.revision,
            delayMs: 0,
            error: item.error,
          });
        for (const item of divergent) {
          releases.push({
            entry: item.entry,
            revision: item.revision,
            delayMs: 0,
            error: {
              class: "revision_divergence",
              indexed: item.document.indexed,
              ledger: item.document.ledger,
            },
          });
        }
      }

      if (group.abandoned) {
        return "ok";
      }
      await serial(() => settleBatch({ acks, failures, releases }));
      return result.infrastructureError === undefined ? "ok" : "infrastructure";

      function routeItem(document: SendDocument, revision: number, outcome: BulkItemOutcome): void {
        const { entry } = document;
        switch (outcome.kind) {
          case "success":
            acks.push({ entry, revision, kind: "indexed" });
            return;
          case "conflict":
            conflicts.push({
              entry,
              revision,
              candidate: { documentId: document.documentId, attempted: document.meta },
            });
            return;
          case "retry":
            failures.push({
              entry,
              revision,
              mode: "retry",
              delayMs: retryDelay(entry.delivery, revision),
              error: outcome.error,
            });
            return;
          case "poison":
            failures.push({ entry, revision, mode: "poison", delayMs: 0, error: outcome.error });
            return;
          case "release":
            releases.push({
              entry,
              revision,
              delayMs: releaseDelay(outcome),
              error: outcome.error,
            });
            return;
          case "pause":
            aliasMissing.push({ entry, revision, error: outcome.error });
            return;
          case "abandoned":
            if (entry.status === "pending") {
              entry.status = "settled";
              counts.abandoned += 1;
            }
            return;
        }
      }

      async function verify(
        list: readonly { entry: Entry; candidate: ConflictCandidate; revision: number }[],
      ): Promise<void> {
        const candidates = list.map((conflict) => conflict.candidate);
        let mget: MgetResult;
        try {
          const response = await requester.send(
            {
              method: "POST",
              path: mgetPath(target.physicalIndex),
              body: { ...mgetBody(candidates) },
              querystring: MGET_QUERYSTRING,
            },
            { signal, timeoutMs: limits.requestTimeoutMs },
          );
          mget = { kind: "response", status: response.status, body: response.body };
        } catch {
          mget = { kind: "failed" };
        }
        let ledger: ReadonlyMap<string, number> | undefined;
        try {
          const rows = await store.readLedger(sqlDb, {
            namespace,
            definition: definition.key,
            documentIds: candidates.map((candidate) => candidate.documentId),
          });
          ledger = new Map(rows.map((row) => [row.documentId, row.revision]));
        } catch {
          ledger = undefined;
        }
        const verdicts = verifyConflicts({
          physicalIndex: target.physicalIndex,
          conflicts: candidates,
          mget,
          ledger,
        });
        list.forEach((conflict, index) => {
          const verdict = verdicts[index];
          const { entry, revision } = conflict;
          switch (verdict?.kind) {
            case "duplicate":
            case "superseded":
              acks.push({ entry, revision, kind: "superseded" });
              return;
            case "poison":
              failures.push({ entry, revision, mode: "poison", delayMs: 0, error: verdict.error });
              emit({
                type: "hash-mismatch",
                targetId,
                documentId: entry.delivery.documentId,
                revision,
              });
              return;
            case "pause":
              divergent.push({ entry, revision, document: verdict.document });
              return;
            case "release":
              releases.push({
                entry,
                revision,
                delayMs: backoffDelayMs(policy, 0),
                error: verdict.error,
              });
              if (verdict.error.class === "hash_version_mismatch") {
                emit({
                  type: "hash-version-mismatch",
                  targetId,
                  documentId: entry.delivery.documentId,
                  revision,
                });
              }
              return;
            default:
              releases.push({
                entry,
                revision,
                delayMs: 0,
                error: { class: "conflict_unverified" },
              });
          }
        });
      }
    }
  }

  function retryDelay(delivery: ClaimResult, revision: number): number {
    const attempts = delivery.failureRevision === revision ? delivery.attempts : 0;
    return backoffDelayMs(policy, attempts);
  }

  function releaseDelay(outcome: Extract<BulkItemOutcome, { kind: "release" }>): number {
    // Never this process's growing cooldown: available_at is shared. A target-side cause gets one base backoff so
    // workers seeing the same failure do not hammer it in turn; a possibly local cause gets none.
    switch (outcome.delay) {
      case "none":
      case "maximum":
        return 0;
      case "backoff":
        return outcome.cooldown === "client" ? 0 : backoffDelayMs(policy, 0);
    }
  }

  async function finish(): Promise<{ clientClosed: boolean }> {
    // Deleted even if never written: a previous process with the same workerId may have left one.
    rowWritten = true;
    await removeCapabilityRow();
    try {
      await client.close();
      return { clientClosed: true };
    } catch {
      return { clientClosed: false };
    }
  }

  const runtime = createWorkerRuntime({
    drain,
    gateRemainingMs: () => cooldown.drainGate().remainingMs,
    unrecovered: () =>
      cooldown.entry({ scope: "client" }) !== undefined ||
      cooldown.entry({ scope: "database" }) !== undefined,
    pausedTargets: () => [...pausedTargets].toSorted(),
    fenceLostTargets: () => fenceKeeper.lostTargets(),
    finish,
    onDrainError: (error: SearchError) => {
      const reason = errorReasonSchema.safeParse(error.details?.reason);
      emit(
        reason.success
          ? { type: "error", code: error.code, reason: reason.data }
          : { type: "error", code: error.code },
      );
    },
    onStateChange: (change) => emit({ type: "state", ...change }),
    continueImmediately: (drained) => shortBySkip.has(drained),
    maxDocumentsPerClaim: limits.maxDocumentsPerClaim,
    retryBaseDelayMs: limits.retryBaseDelayMs,
    retryMaxDelayMs: limits.retryMaxDelayMs,
    abortGraceMs: 3 * limits.statementTimeoutMs,
  });

  return Object.freeze({
    async drainOnce(drainOptions: { signal?: AbortSignal } = {}) {
      directDrains += 1;
      try {
        return await runtime.drainOnce(drainOptions.signal);
      } catch (error) {
        throw toWorkerError(error);
      } finally {
        directDrains -= 1;
        if (directDrains === 0 && runtime.status().state === "idle") await removeCapabilityRow();
      }
    },
    start(startOptions: StartOptions) {
      return runtime.start(startOptions);
    },
  } satisfies SearchIndexer);
}

function keyOf(entry: Entry): DeliveryKey {
  const { targetId, documentId, intentId } = entry.delivery;
  return { targetId, documentId, intentId };
}

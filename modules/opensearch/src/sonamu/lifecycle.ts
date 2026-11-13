import { z } from "zod";

import {
  createSearchClient,
  type SearchClient,
  type SearchClientOptions,
} from "../client/search-client";
import { type DefinedSearch } from "../definition/define-search";
import { SearchConfigurationError, type SearchError } from "../errors";
import { formatSearchMessage, type SearchMessage, type SearchMessageParamValue } from "../i18n";
import { storeBindingMismatch } from "../postgres/store-binding";
import { type PostgresSynchronization } from "../postgres/synchronization";
import { assertBackoffPolicy, backoffDelayMs, type BackoffPolicy } from "../worker/backoff";
import { createIndexer, type IndexerEvent } from "../worker/indexer";
import { MAX_DURATION_MS, type WorkerLimits } from "../worker/limits";
import {
  type StopReport,
  toWorkerError,
  type WorkerHandle,
  type WorkerStatus,
} from "../worker/worker-handle";
import { applySonamuDefaultLocale } from "./locale";

// Lifecycles with the same name share one process-wide slot (Symbol.for on globalThis). sonamu.config.ts is not
// re-evaluated, so Sonamu always calls the first generation's onStart/onShutdown; both act on the slot. An HMR
// re-evaluation of a started slot stops the previous worker within the deadline (heartbeat row, leases, worker client)
// before the new one starts, so at most one worker runs. import.meta.hot.dispose is not used: the Sonamu dev server
// never fires it. Wrappers in clients close only when a later generation stops passing them, never at onShutdown, so
// onStart after onShutdown still works.

export interface SearchLifecycleWorkerOptions {
  /** When false, onStart only initializes synchronization. */
  readonly enabled: boolean;
  /** Options for the worker's own client, created per generation; pass ownsClient: false to share the SDK client. */
  readonly client: SearchClientOptions;
  readonly definitions: readonly DefinedSearch[];
  readonly limits: WorkerLimits;
  readonly pollIntervalMs: number;
  /** A new UUID per generation when omitted. */
  readonly workerId?: string;
  readonly onEvent?: (event: IndexerEvent) => void;
}

export interface SearchLifecycleOptions {
  /** A lifecycle created under the same name on HMR re-evaluation replaces the previous generation. */
  readonly name: string;
  /** Required with worker. */
  readonly synchronization?: PostgresSynchronization;
  readonly worker?: SearchLifecycleWorkerOptions;
  /** Closed when a later generation stops passing them; onShutdown does not close them. */
  readonly clients?: readonly SearchClient[];
  readonly stopDeadlineMs: number;
  /** Default: from 1 to 30 seconds. */
  readonly initializeRetry?: BackoffPolicy;
}

export type SearchLifecycleState =
  | "idle"
  | "starting"
  | "running"
  | "degraded"
  | "failed"
  | "stopping"
  | "stopped";

export interface SearchLifecycleError {
  readonly code: string;
  readonly key: string;
  readonly params: Readonly<Record<string, SearchMessageParamValue>> | undefined;
  readonly message: string;
  readonly at: number;
}

export interface SearchLifecycleStatus {
  readonly name: string;
  /** degraded: retrying initialize() after a transient error; failed: a non-retryable start error. */
  readonly state: SearchLifecycleState;
  readonly generation: number | undefined;
  readonly latestGeneration: number;
  readonly initialized: boolean;
  readonly worker: WorkerStatus | undefined;
  readonly lastStop: StopReport | undefined;
  readonly lastError: SearchLifecycleError | undefined;
}

export interface SearchLifecycle {
  /** Starts the latest generation; a transient error is retried in the background, a non-retryable one rejects. */
  onStart(): Promise<void>;
  /** Stops the running worker within the deadline; safe to call repeatedly or without onStart. */
  onShutdown(): Promise<void>;
  handle(): WorkerHandle | undefined;
  status(): SearchLifecycleStatus;
}

export interface SearchResourceContainer {
  /** Disposes the previous resource of the name, then creates; if dispose fails, rejects without creating. */
  replace<T>(
    name: string,
    create: () => T | Promise<T>,
    dispose: (resource: T) => Promise<void>,
  ): Promise<T>;
  disposeAll(): Promise<void>;
}

const DEFAULT_INITIALIZE_RETRY: BackoffPolicy = Object.freeze({
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
});
const MAX_NAME_LENGTH = 200;

const functionSchema = z.instanceof(Function);
const durationSchema = z.number().int().min(0).max(MAX_DURATION_MS);
const nameSchema = z.string().min(1).max(MAX_NAME_LENGTH);
const lifecycleOptionsSchema = z.strictObject({
  name: nameSchema,
  synchronization: z
    .looseObject({ initialize: functionSchema, markChanged: functionSchema })
    .optional(),
  worker: z
    .strictObject({
      enabled: z.boolean(),
      client: z.looseObject({}),
      definitions: z.array(z.unknown()).readonly(),
      limits: z.unknown(),
      pollIntervalMs: durationSchema,
      workerId: z.unknown().optional(),
      onEvent: functionSchema.optional(),
    })
    .optional(),
  clients: z
    .array(z.looseObject({ close: functionSchema }))
    .readonly()
    .optional(),
  stopDeadlineMs: durationSchema,
  initializeRetry: z
    .strictObject({ baseDelayMs: durationSchema, maxDelayMs: durationSchema })
    .optional(),
});
const containerArgumentsSchema = z.tuple([nameSchema, functionSchema, functionSchema]);

function invalidOptions(path: string): SearchConfigurationError {
  const field = path.slice(0, 120) || "options";
  return new SearchConfigurationError(
    { key: "lifecycle.invalidOptions", params: { path: field } },
    { details: { reason: "invalid-lifecycle-options", path: field } },
  );
}

function issuePath(issue: z.core.$ZodIssue | undefined): string {
  return [
    ...(issue?.path ?? []),
    ...(issue?.code === "unrecognized_keys" ? [issue.keys[0] ?? ""] : []),
  ]
    .map(String)
    .join(".");
}

const SLOTS_KEY = Symbol.for("@sonamu-kit/opensearch/sonamu/lifecycle-slots");
const CONTAINERS_KEY = Symbol.for("@sonamu-kit/opensearch/sonamu/resource-containers");

interface Generation {
  readonly id: number;
  readonly options: SearchLifecycleOptions;
  readonly clients: readonly SearchClient[];
  readonly retry: BackoffPolicy;
}

interface Running {
  readonly generation: Generation;
  readonly abort: AbortController;
  handle: WorkerHandle | undefined;
  initialized: boolean;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  retryAttempts: number;
}

interface Slot {
  active: boolean;
  generations: number;
  latest: Generation | undefined;
  current: Running | undefined;
  readonly owned: Set<SearchClient>;
  tail: Promise<void>;
  state: SearchLifecycleState;
  lastError: { error: SearchError; at: number } | undefined;
  lastStop: StopReport | undefined;
}

interface ContainerEntry {
  readonly dispose: () => Promise<void>;
}

interface ContainerState {
  readonly entries: Map<string, ContainerEntry>;
  readonly tails: Map<string, Promise<void>>;
}

type GlobalHost = typeof globalThis & {
  [SLOTS_KEY]?: Map<string, Slot>;
  [CONTAINERS_KEY]?: Map<string, ContainerState>;
};

function globalHost(): GlobalHost {
  // SAFETY: only this module reads and writes the two Symbol.for keys, always with the Map shapes above.
  return globalThis;
}

function slotFor(name: string): Slot {
  const host = globalHost();
  host[SLOTS_KEY] ??= new Map();
  let slot = host[SLOTS_KEY].get(name);
  if (slot === undefined) {
    slot = {
      active: false,
      generations: 0,
      latest: undefined,
      current: undefined,
      owned: new Set(),
      tail: Promise.resolve(),
      state: "idle",
      lastError: undefined,
      lastStop: undefined,
    };
    host[SLOTS_KEY].set(name, slot);
  }
  return slot;
}

function enqueue<T>(slot: Slot, work: () => Promise<T>): Promise<T> {
  const next = slot.tail.then(work);
  slot.tail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function record(slot: Slot, error: SearchError): void {
  slot.lastError = { error, at: Date.now() };
}

async function closeClients(
  slot: Slot,
  shouldClose: (client: SearchClient) => boolean,
): Promise<void> {
  const closing = [...slot.owned].filter(shouldClose);
  for (const client of closing) slot.owned.delete(client);
  const results = await Promise.allSettled(closing.map((client) => client.close()));
  for (const result of results) {
    if (result.status === "rejected") record(slot, toWorkerError(result.reason));
  }
}

async function deactivate(slot: Slot, running: Running): Promise<void> {
  running.abort.abort();
  clearTimeout(running.retryTimer);
  running.retryTimer = undefined;
  slot.state = "stopping";
  if (running.handle !== undefined) {
    slot.lastStop = await running.handle.stop({
      deadlineMs: running.generation.options.stopDeadlineMs,
    });
  }
  if (slot.current === running) slot.current = undefined;
}

function scheduleInitializeRetry(slot: Slot, running: Running): void {
  const synchronization = running.generation.options.synchronization;
  if (synchronization === undefined || running.abort.signal.aborted) return;
  const delayMs = backoffDelayMs(running.generation.retry, running.retryAttempts);
  running.retryAttempts += 1;
  running.retryTimer = setTimeout(() => {
    running.retryTimer = undefined;
    void (async () => {
      try {
        await synchronization.initialize({ signal: running.abort.signal });
        running.initialized = true;
        if (slot.current === running && slot.state === "degraded") slot.state = "running";
      } catch (thrown) {
        if (running.abort.signal.aborted) return;
        const error = toWorkerError(thrown);
        record(slot, error);
        if (error.retryable) scheduleInitializeRetry(slot, running);
      }
    })();
  }, delayMs);
}

// Recorded only: capture continues and the worker refuses remote work on every drain.
async function recordBindingFailure(
  slot: Slot,
  running: Running,
  synchronization: PostgresSynchronization,
): Promise<void> {
  try {
    const mismatch = storeBindingMismatch(await synchronization.checkBinding());
    if (mismatch !== undefined) record(slot, mismatch);
  } catch (thrown) {
    if (!running.abort.signal.aborted) record(slot, toWorkerError(thrown));
  }
}

function buildIndexer(
  worker: SearchLifecycleWorkerOptions,
  synchronization: PostgresSynchronization,
) {
  return createIndexer({
    client: createSearchClient(worker.client),
    synchronization,
    definitions: worker.definitions,
    limits: worker.limits,
    workerId: worker.workerId,
    onEvent: worker.onEvent,
  });
}

async function activate(slot: Slot): Promise<void> {
  const generation = slot.latest;
  if (!slot.active || generation === undefined) return;
  if (slot.current?.generation === generation) return;
  if (slot.current !== undefined) await deactivate(slot, slot.current);
  // onShutdown arrived while the previous generation was stopping; do not start the new one.
  if (!slot.active) return;
  await closeClients(slot, (client) => !generation.clients.includes(client));
  for (const client of generation.clients) slot.owned.add(client);

  const running: Running = {
    generation,
    abort: new AbortController(),
    handle: undefined,
    initialized: false,
    retryTimer: undefined,
    retryAttempts: 0,
  };
  slot.current = running;
  slot.state = "starting";
  applySonamuDefaultLocale();

  const { synchronization, worker } = generation.options;
  if (synchronization === undefined) {
    running.initialized = true;
  } else {
    try {
      await synchronization.initialize({ signal: running.abort.signal });
      running.initialized = true;
      await recordBindingFailure(slot, running, synchronization);
    } catch (thrown) {
      if (running.abort.signal.aborted) return;
      const error = toWorkerError(thrown);
      record(slot, error);
      if (!error.retryable) {
        slot.current = undefined;
        slot.state = "failed";
        throw error;
      }
      scheduleInitializeRetry(slot, running);
    }
  }
  if (running.abort.signal.aborted) return;

  if (worker?.enabled === true && synchronization !== undefined) {
    try {
      running.handle = buildIndexer(worker, synchronization).start({
        pollIntervalMs: worker.pollIntervalMs,
      });
    } catch (thrown) {
      const error = toWorkerError(thrown);
      record(slot, error);
      running.abort.abort();
      clearTimeout(running.retryTimer);
      slot.current = undefined;
      slot.state = "failed";
      throw error;
    }
  }
  slot.state = running.initialized ? "running" : "degraded";
}

async function shutdown(slot: Slot): Promise<void> {
  slot.active = false;
  // Cancel in-flight initialization first so it cannot hold up shutdown.
  slot.current?.abort.abort();
  await enqueue(slot, async () => {
    if (slot.current !== undefined) await deactivate(slot, slot.current);
    const current = slot.latest?.clients ?? [];
    await closeClients(slot, (client) => !current.includes(client));
    slot.state = "stopped";
  });
}

function renderError(entry: { error: SearchError; at: number }): SearchLifecycleError {
  const { error, at } = entry;
  return Object.freeze({
    code: error.code,
    key: error.messageKey,
    params: error.messageParams,
    // SAFETY: messageKey and messageParams come from the same error, so they pair.
    message: formatSearchMessage({
      key: error.messageKey,
      params: error.messageParams,
    } as SearchMessage),
    at,
  });
}

function statusOf(name: string, slot: Slot): SearchLifecycleStatus {
  const running = slot.current;
  return Object.freeze({
    name,
    state: slot.state,
    generation: running?.generation.id,
    latestGeneration: slot.latest?.id ?? 0,
    initialized: running?.initialized ?? false,
    worker: running?.handle?.status(),
    lastStop: slot.lastStop,
    lastError: slot.lastError === undefined ? undefined : renderError(slot.lastError),
  });
}

function parseLifecycleOptions(options: SearchLifecycleOptions): BackoffPolicy {
  const parsed = lifecycleOptionsSchema.safeParse(options);
  if (!parsed.success) throw invalidOptions(issuePath(parsed.error.issues[0]));
  const { worker, synchronization } = options;
  if (worker !== undefined) {
    if (synchronization === undefined) throw invalidOptions("synchronization");
    buildIndexer(worker, synchronization);
  }
  const retry = options.initializeRetry ?? DEFAULT_INITIALIZE_RETRY;
  try {
    assertBackoffPolicy(retry);
  } catch {
    throw invalidOptions("initializeRetry");
  }
  return Object.freeze({ baseDelayMs: retry.baseDelayMs, maxDelayMs: retry.maxDelayMs });
}

/** Creates the lifecycle helper for server.lifecycle in sonamu.config.ts; inert except for the HMR replacement. */
export function createSearchLifecycle(options: SearchLifecycleOptions): SearchLifecycle {
  const retry = parseLifecycleOptions(options);
  const { name } = options;
  const slot = slotFor(name);
  slot.generations += 1;
  const generation: Generation = Object.freeze({
    id: slot.generations,
    options,
    clients: Object.freeze([...(options.clients ?? [])]),
    retry,
  });
  slot.latest = generation;

  if (slot.active) {
    enqueue(slot, () => activate(slot)).catch(() => {});
  }

  return Object.freeze({
    onStart(): Promise<void> {
      slot.active = true;
      return enqueue(slot, () => activate(slot));
    },
    onShutdown(): Promise<void> {
      return shutdown(slot);
    },
    handle(): WorkerHandle | undefined {
      return slot.current?.handle;
    },
    status(): SearchLifecycleStatus {
      return statusOf(name, slot);
    },
  } satisfies SearchLifecycle);
}

/** Read-only status of the lifecycle with this name in this process, or undefined if none was created. */
export function getSearchLifecycleStatus(name: string): SearchLifecycleStatus | undefined {
  if (!nameSchema.safeParse(name).success) throw invalidOptions("name");
  const slot = globalHost()[SLOTS_KEY]?.get(name);
  return slot === undefined ? undefined : statusOf(name, slot);
}

/** Process-wide container; replace() disposes the previous resource first, so HMR re-evaluation does not duplicate it. */
export function getSearchResourceContainer(scope = "default"): SearchResourceContainer {
  if (!nameSchema.safeParse(scope).success) throw invalidOptions("scope");
  const host = globalHost();
  host[CONTAINERS_KEY] ??= new Map();
  let state = host[CONTAINERS_KEY].get(scope);
  if (state === undefined) {
    state = { entries: new Map(), tails: new Map() };
    host[CONTAINERS_KEY].set(scope, state);
  }
  const { entries, tails } = state;

  const serialize = <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const next = (tails.get(name) ?? Promise.resolve()).then(work);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    tails.set(name, settled);
    void settled.then(() => {
      if (tails.get(name) === settled) tails.delete(name);
    });
    return next;
  };

  const take = async (name: string): Promise<void> => {
    const entry = entries.get(name);
    entries.delete(name);
    await entry?.dispose();
  };

  return Object.freeze({
    replace<T>(
      name: string,
      create: () => T | Promise<T>,
      dispose: (resource: T) => Promise<void>,
    ): Promise<T> {
      const parsed = containerArgumentsSchema.safeParse([name, create, dispose]);
      if (!parsed.success) return Promise.reject(invalidOptions(issuePath(parsed.error.issues[0])));
      return serialize(name, async () => {
        await take(name);
        const resource = await create();
        entries.set(name, { dispose: () => dispose(resource) });
        return resource;
      });
    },

    async disposeAll(): Promise<void> {
      const names = new Set([...entries.keys(), ...tails.keys()]);
      const results = await Promise.allSettled(
        [...names].map((name) => serialize(name, () => take(name))),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure !== undefined) throw failure.reason;
    },
  } satisfies SearchResourceContainer);
}

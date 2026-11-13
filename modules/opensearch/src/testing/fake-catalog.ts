import {
  type CatalogReadOptions,
  type ReadHeadState,
  type ReadHeadsResult,
  type ReadTarget,
  type ResolvedTarget,
  type SearchCatalogReader,
} from "../query/catalog";
import { readHeadStateSchema, readTargetSchema } from "../query/schemas";

export const FAKE_CATALOG_START_MS = Date.UTC(2026, 0, 1);

export type FakeCatalogCall =
  | { method: "resolveReadHeads"; logicalKeys: readonly string[]; timeoutMs: number }
  | { method: "resolveTarget"; targetId: string; timeoutMs: number };

export interface FakeCatalog extends SearchCatalogReader {
  set(head: ReadHeadState): void;
  /** Records a target that is not a head (an old retiring target, for example). */
  putTarget(target: ReadTarget): void;
  /** Fails the next lookup only. */
  fail(error: Error): void;
  advance(ms: number): void;
  calls(): readonly FakeCatalogCall[];
}

/** In-memory catalog reader; the clock moves only with advance(). */
export function createFakeCatalog(initial: Iterable<ReadHeadState> = []): FakeCatalog {
  const heads = new Map<string, ReadHeadState>();
  const targets = new Map<string, ReadTarget>();
  const recorded: FakeCatalogCall[] = [];
  let nowMs = FAKE_CATALOG_START_MS;
  let pendingFailure: Error | undefined;

  function set(head: ReadHeadState): void {
    const parsed = readHeadStateSchema.parse(head);
    heads.set(parsed.logicalKey, parsed);
    if (parsed.target !== null) targets.set(parsed.target.targetId, parsed.target);
  }

  function begin(options: CatalogReadOptions): void {
    options.signal?.throwIfAborted();
    const failure = pendingFailure;
    pendingFailure = undefined;
    if (failure !== undefined) throw failure;
  }

  for (const head of initial) set(head);

  return {
    set,
    putTarget(target) {
      const parsed = readTargetSchema.parse(target);
      targets.set(parsed.targetId, parsed);
    },
    fail(error) {
      pendingFailure = error;
    },
    advance(ms) {
      nowMs += ms;
    },
    calls() {
      return [...recorded];
    },
    async resolveReadHeads(logicalKeys, options): Promise<ReadHeadsResult> {
      recorded.push({
        method: "resolveReadHeads",
        logicalKeys: [...logicalKeys],
        timeoutMs: options.timeoutMs,
      });
      begin(options);
      const found = new Map<string, ReadHeadState>();
      for (const key of logicalKeys) {
        const head = heads.get(key);
        if (head !== undefined) found.set(key, structuredClone(head));
      }
      return { heads: found, cursorIssueMs: nowMs, databaseNowMs: nowMs };
    },
    async resolveTarget(targetId, options): Promise<ResolvedTarget> {
      recorded.push({ method: "resolveTarget", targetId, timeoutMs: options.timeoutMs });
      begin(options);
      const target = targets.get(targetId);
      if (target === undefined) {
        return { target: null, rebuildRequired: false, lifetimes: null, databaseNowMs: nowMs };
      }
      const head = heads.get(target.logicalKey);
      return {
        target: {
          ...structuredClone(target),
          currentCaptureEpoch: head?.target?.currentCaptureEpoch ?? target.currentCaptureEpoch,
        },
        rebuildRequired: head?.rebuildRequired ?? false,
        lifetimes: head === undefined ? null : structuredClone(head.lifetimes),
        databaseNowMs: nowMs,
      };
    },
  };
}

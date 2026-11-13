export type TargetState =
  | "creating"
  | "active"
  | "paused"
  | "retiring"
  | "retired"
  | "failed"
  | "detached";

export interface ReadTarget {
  targetId: string;
  logicalKey: string;
  physicalIndex: string;
  fingerprint: string;
  hashVersion: string;
  state: TargetState;
  captureEpoch: number;
  /** A value other than captureEpoch means the target predates a capture interruption. */
  currentCaptureEpoch: number;
}

export interface ReadLifetimeLimits {
  maxSearchLifetimeMs: number;
  maxCursorLifetimeMs: number;
  maxPitKeepAliveMs: number;
}

export interface ReadHeadState {
  logicalKey: string;
  readGeneration: number;
  rebuildRequired: boolean;
  target: ReadTarget | null;
  lifetimes: ReadLifetimeLimits;
}

export interface CatalogReadOptions {
  signal?: AbortSignal;
  timeoutMs: number;
}

export interface ReadHeadsResult {
  heads: ReadonlyMap<string, ReadHeadState>;
  /** transaction_timestamp() of the read, epoch ms; used as the cursor issue time. */
  cursorIssueMs: number;
  databaseNowMs: number;
}

export interface ResolvedTarget {
  target: ReadTarget | null;
  rebuildRequired: boolean;
  lifetimes: ReadLifetimeLimits | null;
  databaseNowMs: number;
}

/** Read on every request, never cached; implementations run outside application transactions. */
export interface SearchCatalogReader {
  resolveReadHeads(
    logicalKeys: readonly string[],
    options: CatalogReadOptions,
  ): Promise<ReadHeadsResult>;
  resolveTarget(targetId: string, options: CatalogReadOptions): Promise<ResolvedTarget>;
}

import { type StandardSchemaV1 } from "@standard-schema/spec";

import { type NativeProperty } from "../client/sdk-types";
import { compareCodeUnits, type JsonObject } from "../definition/canonical-json";
import {
  type DefinedSearch,
  defineSearch,
  type DocumentId,
  type Projection,
} from "../definition/define-search";
import { buildPhysicalIndexName } from "../definition/names";
import {
  type ReadHeadState,
  type ReadLifetimeLimits,
  type ReadTarget,
  type TargetState,
} from "../query/catalog";

export const TEST_READ_LIFETIMES: ReadLifetimeLimits = Object.freeze({
  maxSearchLifetimeMs: 30_000,
  maxCursorLifetimeMs: 600_000,
  maxPitKeepAliveMs: 60_000,
});

export interface TestDefinitionOptions<TDocument extends JsonObject> {
  key: string;
  schema: StandardSchemaV1<unknown, TDocument>;
  projectionVersion?: string;
  properties?: Record<string, NativeProperty>;
  /** Read on every call, so a test can change it; a missing ID is deleted. */
  documents?: () => ReadonlyMap<DocumentId, TDocument>;
}

/** In-memory search definition; the scan walks IDs in UTF-16 code unit order. */
export function createTestDefinition<TDocument extends JsonObject>(
  options: TestDefinitionOptions<TDocument>,
): DefinedSearch<TDocument> {
  const documents = options.documents ?? (() => new Map<DocumentId, TDocument>());
  const sortedIds = () => [...documents().keys()].toSorted(compareCodeUnits);
  return defineSearch<TDocument>({
    key: options.key,
    projectionVersion: options.projectionVersion ?? "1",
    schema: options.schema,
    settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
    mappings: { properties: options.properties ?? {} },
    requiredPlugins: [],
    async materialize(_context, ids) {
      const source = documents();
      return new Map(
        ids.map((id): [DocumentId, Projection<TDocument>] => {
          const document = source.get(id);
          return [
            id,
            document === undefined ? { state: "deleted" } : { state: "present", document },
          ];
        }),
      );
    },
    async captureScanBoundary() {
      return sortedIds().at(-1) ?? "";
    },
    async scanSourceIds(_context, page) {
      const after = page.after;
      const eligible = sortedIds().filter(
        (id) =>
          (after === undefined || compareCodeUnits(id, after) > 0) &&
          compareCodeUnits(id, page.through) <= 0,
      );
      const ids = eligible.slice(0, page.limit);
      const last = ids.at(-1);
      return eligible.length > ids.length && last !== undefined ? { ids, next: last } : { ids };
    },
  });
}

export interface TestReadTargetOptions {
  namespace: string;
  logicalKey: string;
  targetId: string;
  fingerprint: string;
  state?: TargetState;
  captureEpoch?: number;
  currentCaptureEpoch?: number;
}

export function createTestReadTarget(options: TestReadTargetOptions): ReadTarget {
  const captureEpoch = options.captureEpoch ?? 1;
  return {
    targetId: options.targetId,
    logicalKey: options.logicalKey,
    physicalIndex: buildPhysicalIndexName(options.namespace, options.logicalKey, options.targetId),
    fingerprint: options.fingerprint,
    hashVersion: "sonamu-c14n-v1",
    state: options.state ?? "active",
    captureEpoch,
    currentCaptureEpoch: options.currentCaptureEpoch ?? captureEpoch,
  };
}

export interface TestReadHeadOptions {
  logicalKey: string;
  target: ReadTarget | null;
  readGeneration?: number;
  rebuildRequired?: boolean;
  lifetimes?: Partial<ReadLifetimeLimits>;
}

export function createTestReadHead(options: TestReadHeadOptions): ReadHeadState {
  return {
    logicalKey: options.logicalKey,
    readGeneration: options.readGeneration ?? 1,
    rebuildRequired: options.rebuildRequired ?? false,
    target: options.target,
    lifetimes: { ...TEST_READ_LIFETIMES, ...options.lifetimes },
  };
}

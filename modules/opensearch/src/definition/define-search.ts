import { type StandardSchemaV1 } from "@standard-schema/spec";
import { type Knex } from "knex";
import { z } from "zod";

import { type NativeIndexSettings, type SearchDocumentMappings } from "../client/sdk-types";
import { SearchConfigurationError } from "../errors";
import { HASH_VERSION, type HashVersion, type JsonObject } from "./canonical-json";
import { parseDocumentMappings } from "./envelope";
import {
  assertProjectionVersion,
  computeDefinitionFingerprint,
  normalizeRequiredPlugins,
  parseIndexSettings,
} from "./fingerprint";
import { assertLogicalKey } from "./names";

export type DocumentId = string;
/** An integer from 1 to Number.MAX_SAFE_INTEGER, used as the OpenSearch external version. */
export type Revision = number;

export type Projection<TDocument> =
  | { state: "present"; document: TDocument }
  | { state: "deleted" };

export interface ProjectionReadContext {
  /** Read-only REPEATABLE READ primary transaction; projections must read only through it. */
  readonly trx: Knex.Transaction;
  readonly signal: AbortSignal;
  /** Epoch ms. */
  readonly deadlineAt: number;
  readonly namespace: string;
  readonly logicalKey: string;
}

export interface SearchDefinition<TDocument extends JsonObject = JsonObject> {
  key: string;
  /** Raise when projection semantics change; schema and functions are not part of the fingerprint. */
  projectionVersion: string;
  schema: StandardSchemaV1<unknown, TDocument>;
  settings: NativeIndexSettings;
  mappings: SearchDocumentMappings;
  requiredPlugins: readonly string[];
  /** Must return exactly one result per requested ID; a missing record is `deleted`. */
  materialize(
    context: ProjectionReadContext,
    ids: readonly DocumentId[],
  ): Promise<ReadonlyMap<DocumentId, Projection<TDocument>>>;
  captureScanBoundary(context: ProjectionReadContext): Promise<string>;
  scanSourceIds(
    context: ProjectionReadContext,
    page: { after?: string; through: string; limit: number },
  ): Promise<{ ids: readonly DocumentId[]; next?: string }>;
}

export interface DefinedSearch<
  TDocument extends JsonObject = JsonObject,
> extends SearchDefinition<TDocument> {
  readonly fingerprint: string;
  readonly hashVersion: HashVersion;
}

const FUNCTION_KEYS = ["materialize", "captureScanBoundary", "scanSourceIds"] as const;
const MAX_ECHOED_KEY_LENGTH = 64;

const functionSchema = z.instanceof(Function);
const standardSchemaPropsSchema = z.object({ version: z.literal(1), validate: functionSchema });
// Some schemas are functions (arktype), so only the ~standard property is checked.
const standardSchemaSchema = z.custom(
  (value) => standardSchemaPropsSchema.safeParse(Object(value)["~standard"]).success,
);
const definitionSchema = z.strictObject({
  key: z.string(),
  projectionVersion: z.string(),
  schema: standardSchemaSchema,
  settings: z.unknown(),
  mappings: z.unknown(),
  requiredPlugins: z.unknown(),
  materialize: functionSchema,
  captureScanBoundary: functionSchema,
  scanSourceIds: functionSchema,
});
const functionKeySchema = z.enum(FUNCTION_KEYS);

function definitionError(issue: z.core.$ZodIssue | undefined): SearchConfigurationError {
  const head = issue?.path[0];
  if (issue?.code === "unrecognized_keys") {
    const key = (issue.keys[0] ?? "").slice(0, MAX_ECHOED_KEY_LENGTH);
    return new SearchConfigurationError(
      { key: "definition.unknownKey", params: { key } },
      { details: { reason: "unknown_definition_key", key } },
    );
  }
  const functionKey = functionKeySchema.safeParse(head);
  if (functionKey.success) {
    return new SearchConfigurationError(
      { key: "definition.missingFunction", params: { field: functionKey.data } },
      { details: { reason: "missing_function", field: functionKey.data } },
    );
  }
  if (head === "schema") {
    return new SearchConfigurationError(
      { key: "definition.invalidSchema" },
      { details: { reason: "invalid_schema" } },
    );
  }
  if (head === "key") {
    return new SearchConfigurationError(
      { key: "definition.invalidLogicalKey" },
      { details: { reason: "invalid_logical_key" } },
    );
  }
  if (head === "projectionVersion") return projectionVersionError();
  return new SearchConfigurationError(
    { key: "definition.notObject" },
    { details: { reason: "definition_not_object" } },
  );
}

function projectionVersionError(): SearchConfigurationError {
  try {
    assertProjectionVersion("");
  } catch (error) {
    if (error instanceof SearchConfigurationError) return error;
  }
  return new SearchConfigurationError({ key: "error.configuration" });
}

function deepFreeze<Value>(value: Value): Value {
  if (Object(value) === value) {
    for (const child of Object.values(Object(value))) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Validates a search definition and returns it frozen with its fingerprint. */
export function defineSearch<TDocument extends JsonObject>(
  definition: SearchDefinition<TDocument>,
): DefinedSearch<TDocument> {
  const parsed = definitionSchema.safeParse(definition);
  if (!parsed.success) throw definitionError(parsed.error.issues[0]);
  const key = assertLogicalKey(definition.key);
  const projectionVersion = assertProjectionVersion(definition.projectionVersion);
  // SAFETY: the validated JSON object is the same value as the SDK input type.
  const settings = deepFreeze(parseIndexSettings(definition.settings) as NativeIndexSettings);
  const mappings = deepFreeze(parseDocumentMappings(definition.mappings));
  // Sorting applies to the fingerprint input only; the definition keeps the declared order.
  normalizeRequiredPlugins(definition.requiredPlugins);
  const requiredPlugins = Object.freeze([...definition.requiredPlugins]);
  const fingerprint = computeDefinitionFingerprint({
    key,
    projectionVersion,
    hashVersion: HASH_VERSION,
    settings,
    mappings,
    requiredPlugins,
  });
  return Object.freeze({
    key,
    projectionVersion,
    schema: definition.schema,
    settings,
    mappings,
    requiredPlugins,
    materialize: definition.materialize,
    captureScanBoundary: definition.captureScanBoundary,
    scanSourceIds: definition.scanSourceIds,
    fingerprint,
    hashVersion: HASH_VERSION,
  });
}

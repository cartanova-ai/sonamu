import { createHash } from "node:crypto";

import { z } from "zod";

import { SearchConfigurationError, type SearchError, SearchProjectionError } from "../errors";
import { type Projection } from "./define-search";

/** Name of the canonical JSON algorithm; a changed algorithm needs a new name and new targets. */
export const HASH_VERSION = "sonamu-c14n-v1" as const;
export type HashVersion = typeof HASH_VERSION;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type CanonicalJsonViolationReason =
  | "undefined"
  | "function"
  | "symbol"
  | "bigint"
  | "non_finite_number"
  | "unsupported_object"
  | "symbol_key"
  | "reserved_key"
  | "ill_formed_string"
  | "accessor_property"
  | "cycle"
  | "too_deep";

export interface CanonicalJsonViolation {
  reason: CanonicalJsonViolationReason;
  path: string;
}

export const MAX_CANONICAL_DEPTH = 512;

const MAX_REPORTED_PATH_LENGTH = 200;

const violationReasonSchema = z.enum([
  "undefined",
  "function",
  "symbol",
  "bigint",
  "non_finite_number",
  "unsupported_object",
  "symbol_key",
  "reserved_key",
  "ill_formed_string",
  "accessor_property",
  "cycle",
  "too_deep",
]);

interface ViolationRefinement {
  params: { reason: CanonicalJsonViolationReason };
}

function violationParams(reason: CanonicalJsonViolationReason): ViolationRefinement {
  return { params: { reason } };
}

const functionSchema = z.instanceof(Function);

const wellFormedStringSchema = z
  .string()
  .refine((value) => value.isWellFormed(), violationParams("ill_formed_string"));

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    wellFormedStringSchema,
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    jsonObjectSchema,
  ]),
);
export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  wellFormedStringSchema,
  jsonValueSchema,
);

export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function formatPointer(segments: readonly PropertyKey[]): string {
  const pointer = segments
    .map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
  return pointer.length > MAX_REPORTED_PATH_LENGTH
    ? `${pointer.slice(0, MAX_REPORTED_PATH_LENGTH)}…`
    : pointer;
}

// Runs before zod: zod throws TypeError or RangeError on cycles and deep nesting and silently drops a __proto__ key,
// and non-plain objects and getters are refused before zod reads them so validation and the copy see the same values.
function findStructuralViolation<Value>(root: Value): CanonicalJsonViolation | undefined {
  const ancestors = new Set<object>();
  const path: PropertyKey[] = [];
  const visit = <Child>(value: Child, depth: number): CanonicalJsonViolationReason | undefined => {
    if (Object(value) !== value || functionSchema.safeParse(value).success) return undefined;
    const target: object = Object(value);
    const prototype: object | null = Object.getPrototypeOf(target);
    const isArray = Array.isArray(target) && prototype === Array.prototype;
    if (!isArray && prototype !== Object.prototype && prototype !== null) {
      return "unsupported_object";
    }
    if (depth >= MAX_CANONICAL_DEPTH) return "too_deep";
    if (ancestors.has(target)) return "cycle";
    ancestors.add(target);
    for (const key of Object.keys(target)) {
      path.push(key);
      if (key === "__proto__") return "reserved_key";
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (descriptor !== undefined && !("value" in descriptor)) return "accessor_property";
      const reason = visit(descriptor?.value, depth + 1);
      if (reason !== undefined) return reason;
      path.pop();
    }
    ancestors.delete(target);
    return undefined;
  };
  const reason = visit(root, 0);
  return reason === undefined ? undefined : { reason, path: formatPointer(path) };
}

const infiniteNumberSchema = z.union([
  z.nan(),
  z.literal(Number.POSITIVE_INFINITY),
  z.literal(Number.NEGATIVE_INFINITY),
]);

function classifyRejectedInput<Value>(input: Value): CanonicalJsonViolationReason {
  if (z.undefined().safeParse(input).success) return "undefined";
  if (z.bigint().safeParse(input).success) return "bigint";
  if (z.symbol().safeParse(input).success) return "symbol";
  if (functionSchema.safeParse(input).success) return "function";
  if (infiniteNumberSchema.safeParse(input).success) return "non_finite_number";
  return "unsupported_object";
}

function reasonOfRefinement(issue: z.core.$ZodIssue): CanonicalJsonViolationReason {
  const parsed = violationReasonSchema.safeParse(
    issue.code === "custom" ? issue.params?.reason : undefined,
  );
  return parsed.success ? parsed.data : "unsupported_object";
}

interface LocatedViolation {
  reason: CanonicalJsonViolationReason;
  path: PropertyKey[];
}

// zod reports a nested union failure as a pathless invalid_union; descend into the branch whose kind matched.
function locateIssue(issue: z.core.$ZodIssue, base: readonly PropertyKey[]): LocatedViolation {
  const path = [...base, ...issue.path];
  switch (issue.code) {
    case "invalid_union": {
      const matched = issue.errors.find(
        (branch) =>
          !branch.every((nested) => nested.code === "invalid_type" && nested.path.length === 0),
      );
      const first = matched?.[0];
      return first === undefined
        ? { reason: classifyRejectedInput(issue.input), path }
        : locateIssue(first, path);
    }
    case "invalid_key": {
      if (z.symbol().safeParse(issue.input).success) {
        return { reason: "symbol_key", path: path.slice(0, -1) };
      }
      const nested = issue.issues[0];
      return {
        reason: nested === undefined ? "unsupported_object" : reasonOfRefinement(nested),
        path,
      };
    }
    case "custom":
      return { reason: reasonOfRefinement(issue), path };
    default:
      return { reason: classifyRejectedInput(issue.input), path };
  }
}

export function parseJsonWith<Output, Value>(
  schema: z.ZodType<Output>,
  value: Value,
  toError: (violation: CanonicalJsonViolation) => SearchError,
): Output {
  const structural = findStructuralViolation(value);
  if (structural !== undefined) throw toError(structural);
  const parsed = schema.safeParse(value, { reportInput: true });
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const located =
    issue === undefined
      ? { reason: "unsupported_object" as const, path: [] }
      : locateIssue(issue, []);
  throw toError({ reason: located.reason, path: formatPointer(located.path) });
}

// UTF-16 code unit order, which differs from localeCompare and from code point order.
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}

// Only for parsed values; the input must already be validated.
export function serializeCanonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(serializeCanonicalJson).join(",")}]`;
  if (isJsonObject(value)) {
    const members = Object.keys(value)
      .toSorted(compareCodeUnits)
      .map((key) => `${JSON.stringify(key)}:${serializeCanonicalJson(value[key] ?? null)}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface CanonicalJson {
  value: JsonValue;
  canonical: string;
}

export function canonicalizeJsonOrThrow<Value>(
  value: Value,
  toError: (violation: CanonicalJsonViolation) => SearchError,
): CanonicalJson {
  const parsed = parseJsonWith(jsonValueSchema, value, toError);
  return { value: parsed, canonical: serializeCanonicalJson(parsed) };
}

/**
 * Produces the `sonamu-c14n-v1` canonical JSON string: keys in UTF-16 code unit order, no whitespace, no Unicode
 * normalization. Values JSON cannot represent are refused, never converted.
 */
export function canonicalizeJson(value: JsonValue): string {
  return canonicalizeJsonOrThrow(
    value,
    (violation) =>
      new SearchConfigurationError(
        { key: "canonicalJson.invalidValue", params: { ...violation } },
        { details: { ...violation } },
      ),
  ).canonical;
}

export type ProjectionContractViolationReason = "invalid_projection" | "document_not_object";

const projectionContractSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("deleted") }),
  z.strictObject({ state: z.literal("present"), document: z.unknown() }),
]);

export interface CanonicalProjection {
  projection: Projection<JsonObject>;
  canonical: string;
}

export function parseCanonicalProjection(projection: Projection<JsonObject>): CanonicalProjection {
  const contract = projectionContractSchema.safeParse(projection);
  if (!contract.success) {
    throw new SearchProjectionError(
      { key: "projection.invalidResult" },
      { details: { reason: "invalid_projection" } },
    );
  }
  if (contract.data.state === "deleted") {
    return { projection: { state: "deleted" }, canonical: '{"state":"deleted"}' };
  }
  const document = parseJsonWith(jsonObjectSchema, contract.data.document, (violation) =>
    violation.path === "" && violation.reason !== "symbol_key"
      ? new SearchProjectionError(
          { key: "projection.documentNotObject" },
          { details: { reason: "document_not_object" } },
        )
      : new SearchProjectionError(
          {
            key: "projection.invalidDocument",
            params: { reason: violation.reason, path: `/document${violation.path}` },
          },
          { details: { reason: violation.reason, path: `/document${violation.path}` } },
        ),
  );
  return {
    projection: { state: "present", document },
    canonical: serializeCanonicalJson({ document, state: "present" }),
  };
}

export function canonicalizeProjection(projection: Projection<JsonObject>): string {
  return parseCanonicalProjection(projection).canonical;
}

/** The projection's `projection_hash`: lowercase hex SHA-256 of its canonical JSON, state included. */
export function computeProjectionHash(projection: Projection<JsonObject>): string {
  return sha256Hex(canonicalizeProjection(projection));
}

import { z } from "zod";

import { type NativeIndexSettings, type SearchDocumentMappings } from "../client/sdk-types";
import { SearchConfigurationError } from "../errors";
import {
  compareCodeUnits,
  HASH_VERSION,
  type HashVersion,
  type JsonObject,
  jsonObjectSchema,
  parseJsonWith,
  serializeCanonicalJson,
  sha256Hex,
} from "./canonical-json";
import { ENVELOPE_VERSION, parseDocumentMappingsJson } from "./envelope";
import { assertLogicalKey } from "./names";

/** Raise when the fingerprint input composition changes. */
export const FINGERPRINT_INPUT_VERSION = 1;

export const MAX_DEFINITION_LABEL_LENGTH = 256;

export interface FingerprintInput {
  key: string;
  projectionVersion: string;
  hashVersion: HashVersion;
  settings: NativeIndexSettings;
  mappings: SearchDocumentMappings;
  requiredPlugins: readonly string[];
}

const labelSchema = z
  .string()
  .min(1)
  .max(MAX_DEFINITION_LABEL_LENGTH)
  .refine((value) => value.isWellFormed() && value.trim() === value && !/\p{Cc}/u.test(value));
const requiredPluginsSchema = z
  .array(labelSchema)
  .refine((plugins) => new Set(plugins).size === plugins.length, {
    params: { reason: "duplicate_required_plugin" },
  });

export function assertProjectionVersion(projectionVersion: string): string {
  const parsed = labelSchema.safeParse(projectionVersion);
  if (!parsed.success) {
    throw new SearchConfigurationError(
      {
        key: "definition.invalidProjectionVersion",
        params: { maxLength: MAX_DEFINITION_LABEL_LENGTH },
      },
      { details: { reason: "invalid_projection_version" } },
    );
  }
  return parsed.data;
}

export function normalizeRequiredPlugins(requiredPlugins: readonly string[]): string[] {
  const parsed = requiredPluginsSchema.safeParse(requiredPlugins);
  if (parsed.success) return parsed.data.toSorted(compareCodeUnits);
  const duplicate = parsed.error.issues.some(
    (issue) => issue.code === "custom" && issue.params?.reason === "duplicate_required_plugin",
  );
  throw duplicate
    ? new SearchConfigurationError(
        { key: "definition.duplicateRequiredPlugin" },
        { details: { reason: "duplicate_required_plugin" } },
      )
    : new SearchConfigurationError(
        {
          key: "definition.invalidRequiredPlugins",
          params: { maxLength: MAX_DEFINITION_LABEL_LENGTH },
        },
        { details: { reason: "invalid_required_plugins" } },
      );
}

export function parseIndexSettings(settings: NativeIndexSettings): JsonObject {
  return parseJsonWith(jsonObjectSchema, settings, (violation) =>
    violation.path === ""
      ? new SearchConfigurationError(
          { key: "definition.settingsNotObject" },
          { details: { reason: "settings_not_object" } },
        )
      : new SearchConfigurationError(
          {
            key: "definition.invalidPart",
            params: { field: "settings", reason: violation.reason, path: violation.path },
          },
          { details: { field: "settings", reason: violation.reason, path: violation.path } },
        ),
  );
}

export function canonicalizeFingerprintInput(input: FingerprintInput): string {
  if (input.hashVersion !== HASH_VERSION) {
    throw new SearchConfigurationError(
      { key: "definition.unsupportedHashVersion", params: { supported: HASH_VERSION } },
      { details: { reason: "unsupported_hash_version" } },
    );
  }
  const settings = parseIndexSettings(input.settings);
  const { properties, dynamic } = parseDocumentMappingsJson(input.mappings);
  const canonicalMappings: JsonObject =
    dynamic === undefined ? { properties } : { properties, dynamic };
  return serializeCanonicalJson({
    envelope: ENVELOPE_VERSION,
    hashVersion: input.hashVersion,
    key: assertLogicalKey(input.key),
    mappings: canonicalMappings,
    projectionVersion: assertProjectionVersion(input.projectionVersion),
    requiredPlugins: normalizeRequiredPlugins(input.requiredPlugins),
    settings,
    v: FINGERPRINT_INPUT_VERSION,
  });
}

export function computeDefinitionFingerprint(input: FingerprintInput): string {
  return sha256Hex(canonicalizeFingerprintInput(input));
}

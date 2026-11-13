import { z } from "zod";

import {
  SearchConfigurationError,
  SearchError,
  SearchQueryInvalid,
  SearchTargetUnavailable,
  SearchTimeout,
  SearchUnavailable,
} from "../errors";

// Classified structurally because the SDK is not imported at runtime. Only status and engine error type are kept,
// never the SDK error or message, not even as cause: its meta holds request bodies and a URL that may carry
// credentials.

export type OpenSearchFailure =
  | { kind: "response"; status: number; type: string }
  | { kind: "timeout" }
  | { kind: "connection" }
  | { kind: "aborted" }
  | { kind: "serialization" }
  | { kind: "deserialization" }
  | { kind: "configuration" }
  | { kind: "unknown" };

const MAX_TYPE_LENGTH = 120;
export const UNKNOWN_ERROR_TYPE = "unknown";

const errorTypeSchema = z
  .string()
  .min(1)
  .transform((type) => type.slice(0, MAX_TYPE_LENGTH));

const engineErrorBodySchema = z.looseObject({
  // Older engines send `error` as a string.
  error: z.union([z.looseObject({ type: errorTypeSchema }), z.string()]).optional(),
});

const sdkErrorSchema = z.looseObject({
  name: z.string(),
  // ResponseError exposes statusCode and body as prototype getters; zod reads them like own properties.
  statusCode: z.unknown().optional(),
  body: z.unknown().optional(),
  meta: z.looseObject({ statusCode: z.unknown().optional(), body: z.unknown() }).optional(),
});

const httpStatusSchema = z.number().int().min(100).max(599);

export function readEngineErrorType<Body>(body: Body): string {
  const parsed = engineErrorBodySchema.safeParse(body);
  if (!parsed.success) return UNKNOWN_ERROR_TYPE;
  const parsedError = z.looseObject({ type: z.string() }).safeParse(parsed.data.error);
  return parsedError.success ? parsedError.data.type : UNKNOWN_ERROR_TYPE;
}

export function describeResponseFailure<Status, Body>(
  status: Status,
  body: Body,
): OpenSearchFailure {
  const parsedStatus = httpStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { kind: "unknown" };
  return { kind: "response", status: parsedStatus.data, type: readEngineErrorType(body) };
}

export function describeOpenSearchError<Thrown>(error: Thrown): OpenSearchFailure {
  const parsed = sdkErrorSchema.safeParse(error);
  if (!parsed.success) return { kind: "unknown" };
  switch (parsed.data.name) {
    case "ResponseError":
      return describeResponseFailure(
        parsed.data.statusCode ?? parsed.data.meta?.statusCode,
        parsed.data.body ?? parsed.data.meta?.body,
      );
    case "TimeoutError":
      return { kind: "timeout" };
    case "ConnectionError":
    case "NoLivingConnectionsError":
      return { kind: "connection" };
    case "RequestAbortedError":
      return { kind: "aborted" };
    case "SerializationError":
      return { kind: "serialization" };
    case "DeserializationError":
      return { kind: "deserialization" };
    case "ConfigurationError":
      return { kind: "configuration" };
    default:
      return { kind: "unknown" };
  }
}

export function toSearchError(failure: OpenSearchFailure): SearchError {
  switch (failure.kind) {
    case "timeout":
      return new SearchTimeout(
        { key: "client.requestTimeout" },
        { details: { reason: "request-timeout" } },
      );
    case "connection":
      return new SearchUnavailable(
        { key: "client.connectionFailed" },
        { details: { reason: "connection" } },
      );
    case "aborted":
      return new SearchUnavailable(
        { key: "client.requestFailed" },
        { details: { reason: "request-aborted" } },
      );
    case "serialization":
      return new SearchQueryInvalid(
        { key: "client.requestFailed" },
        { details: { reason: "serialization" } },
      );
    case "deserialization":
      return new SearchUnavailable(
        { key: "client.invalidResponse" },
        { retryable: false, details: { reason: "invalid-response" } },
      );
    case "configuration":
      return new SearchConfigurationError(
        { key: "client.requestFailed" },
        { details: { reason: "client-configuration" } },
      );
    case "unknown":
      return new SearchUnavailable(
        { key: "client.requestFailed" },
        { retryable: false, details: { reason: "unknown-client-error" } },
      );
    case "response":
      return responseError(failure.status, failure.type);
  }
}

function responseError(status: number, type: string): SearchError {
  const message = { key: "client.responseError", params: { status, type } } as const;
  if (status === 408 || status === 504) {
    return new SearchTimeout(message, { details: { reason: "engine-timeout", status, type } });
  }
  if (status === 401 || status === 403) {
    // Unavailable rather than invalid: renewed credentials can recover.
    const reason = status === 401 ? "authentication" : "authorization";
    return new SearchUnavailable(message, { details: { reason, status, type } });
  }
  if (status === 429 || status >= 500) {
    return new SearchUnavailable(message, {
      details: { reason: "engine-unavailable", status, type },
    });
  }
  if (status === 404 && type === "index_not_found_exception") {
    return new SearchTargetUnavailable(message, {
      details: { reason: "index-not-found", status, type },
    });
  }
  if (status >= 400) {
    return new SearchQueryInvalid(message, {
      details: { reason: "engine-rejected", status, type },
    });
  }
  return new SearchUnavailable(
    { key: "client.invalidResponse" },
    { retryable: false, details: { reason: "unexpected-status", status } },
  );
}

export function normalizeOpenSearchError<Thrown>(error: Thrown): SearchError {
  if (error instanceof SearchError) return error;
  return toSearchError(describeOpenSearchError(error));
}

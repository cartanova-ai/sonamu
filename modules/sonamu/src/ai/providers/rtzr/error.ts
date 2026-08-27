import { AISDKError, APICallError } from "@ai-sdk/provider";
import { extractResponseHeaders, safeParseJSON, zodSchema } from "@ai-sdk/provider-utils";
import { type ResponseHandler } from "@ai-sdk/provider-utils";
import { z } from "zod";

import { isStringValue } from "../../../utils/runtime-value";

const rtzrFlatErrorDataSchema = z.object({
  code: z.union([z.string(), z.number()]).nullish(),
  msg: z.string().nullish(),
  type: z.string().nullish(),
  param: z.unknown().nullish(),
});

const rtzrNestedErrorDataSchema = z.object({
  error: z.object({
    msg: z.string().nullish(),
    message: z.string().nullish(),
    type: z.string().nullish(),
    param: z.unknown().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

// RTZR returns flat HTTP errors, but async transcription failures wrap details in error.
export const rtzrErrorDataSchema = z.union([rtzrFlatErrorDataSchema, rtzrNestedErrorDataSchema]);

export type RtzrErrorData = z.infer<typeof rtzrErrorDataSchema>;

type NormalizedRtzrError = {
  code?: string | number | null;
  message?: string | null;
  msg?: string | null;
  type?: string | null;
  param?: unknown;
};

function isNullish<Value>(value: Value): value is Value & (null | undefined) {
  return value === null || value === undefined;
}

function normalizeRtzrErrorData(data: RtzrErrorData): NormalizedRtzrError {
  if ("error" in data) {
    return data.error;
  }

  return data;
}

function formatParam<Value>(param: Value): string | undefined {
  if (isNullish(param)) {
    return undefined;
  }

  if (isStringValue(param)) {
    return param;
  }

  try {
    return JSON.stringify(param);
  } catch {
    return String(param);
  }
}

export function formatRtzrErrorData(data: RtzrErrorData): string {
  const error = normalizeRtzrErrorData(data);
  const param = formatParam(error.param);
  const parts = [
    isNullish(error.code) ? undefined : `code ${error.code}`,
    isNullish(error.type) ? undefined : `type ${error.type}`,
    isNullish(param) ? undefined : `param ${param}`,
  ].filter((item): item is string => !isNullish(item) && item.length > 0);
  const message = error.msg ?? error.message;

  if (!isNullish(message) && message.length > 0) {
    return [...parts, message].join(": ");
  }

  if (parts.length > 0) {
    return parts.join(": ");
  }

  return "unknown RTZR error";
}

export async function formatRtzrErrorResponseBody(
  responseBody: string,
): Promise<string | undefined> {
  if (responseBody.trim().length === 0) {
    return undefined;
  }

  const parsedError = await safeParseJSON({
    text: responseBody,
    schema: zodSchema(rtzrErrorDataSchema),
  });

  if (!parsedError.success) {
    return undefined;
  }

  return formatRtzrErrorData(parsedError.value);
}

export const rtzrFailedResponseHandler: ResponseHandler<APICallError> = async ({
  response,
  url,
  requestBodyValues,
}) => {
  const responseBody = await response.text();
  const responseHeaders = extractResponseHeaders(response);
  const detail =
    (await formatRtzrErrorResponseBody(responseBody)) ??
    response.statusText ??
    "unparseable RTZR error response";
  const parsedError = await safeParseJSON({
    text: responseBody,
    schema: zodSchema(rtzrErrorDataSchema),
  });

  return {
    responseHeaders,
    value: new APICallError({
      message: `HTTP ${response.status}: ${detail}`,
      url,
      requestBodyValues,
      statusCode: response.status,
      responseHeaders,
      responseBody,
      data: parsedError.success ? parsedError.value : undefined,
    }),
  };
};

export class RtzrClientError extends AISDKError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
    },
  ) {
    super({
      name: "RtzrClientError",
      message,
      cause: options?.cause,
    });
  }
}

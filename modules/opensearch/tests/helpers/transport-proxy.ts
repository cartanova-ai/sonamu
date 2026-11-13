import { Readable } from "node:stream";
import { gunzipSync } from "node:zlib";

import {
  type ApiError,
  type ApiResponse,
  type Client,
  Transport,
} from "@opensearch-project/opensearch";
import {
  type TransportRequestCallback,
  type TransportRequestOptions,
  type TransportRequestParams,
  type TransportRequestPromise,
} from "@opensearch-project/opensearch/lib/Transport.js";
import { z } from "zod";

import { FENCE_DOCUMENT_ID } from "../../src/worker/fence";
import { BULK_ACTIONS, type BulkAction, bulkResponseSchema, type JsonLine } from "./opensearch-ops";

/**
 * withhold removes the item from the request and answers with the injected error, like a 429/503 item the engine did
 * not apply; replace sends it, so it is applied, and rewrites only its result. The client is a child sharing the
 * original's connection pool: close the original.
 */
export type BulkOperationInfo = {
  action: BulkAction;
  id: string | null;
  index: string | null;
  position: number;
  request: number;
};

export type InjectedItemOutcome = {
  status: number;
  type: string;
  reason?: string;
};

export type BulkInjectionRule = {
  match: (operation: BulkOperationInfo) => boolean;
  outcome: InjectedItemOutcome;
  mode?: "withhold" | "replace";
  times?: number;
};

export type BulkCallRecord = {
  request: number;
  path: string;
  operations: BulkOperationInfo[];
  injected: {
    operation: BulkOperationInfo;
    outcome: InjectedItemOutcome;
    mode: "withhold" | "replace";
  }[];
  sentBody: string | null;
};

export type BulkInjector = {
  readonly client: Client;
  inject(rule: BulkInjectionRule): void;
  injectTransientFor(documentId: string, outcome?: InjectedItemOutcome): void;
  clear(): void;
  readonly calls: readonly BulkCallRecord[];
  readonly pendingRuleCount: number;
};

export const TRANSIENT_REJECTION: InjectedItemOutcome = {
  status: 429,
  type: "es_rejected_execution_exception",
  reason: "injected by transport-proxy",
};

type ActiveRule = { rule: BulkInjectionRule; remaining: number };

const actionLineSchema = z.partialRecord(
  z.enum(BULK_ACTIONS),
  z.looseObject({ _id: z.string().optional(), _index: z.string().optional() }),
);

type ParsedOperation = { info: BulkOperationInfo; lines: string[] };

type InjectedResult = {
  _index: string | null;
  _id: string | null;
  status: number;
  error: { type: string; reason: string };
};
type InjectedBulkItem = { [K in BulkAction]?: InjectedResult };

function bulkBodyLines(bulkBody: TransportRequestParams["bulkBody"]): string[] {
  if (bulkBody === undefined) {
    return [];
  }
  if (Buffer.isBuffer(bulkBody)) {
    return bulkBody
      .toString("utf8")
      .split("\n")
      .filter((line) => line !== "");
  }
  if (Array.isArray(bulkBody)) {
    return bulkBody.map((entry: string | JsonLine) =>
      entry instanceof Object ? JSON.stringify(entry) : entry,
    );
  }
  if (bulkBody instanceof Object) {
    throw new Error("transport-proxy는 스트림 bulk 본문을 지원하지 않습니다.");
  }
  return bulkBody.split("\n").filter((line) => line !== "");
}

function parseOperations(lines: readonly string[], request: number): ParsedOperation[] {
  const operations: ParsedOperation[] = [];
  for (let cursor = 0; cursor < lines.length;) {
    const header = actionLineSchema.parse(JSON.parse(lines[cursor]));
    const actions = BULK_ACTIONS.filter((action) => header[action] !== undefined);
    if (actions.length !== 1) {
      throw new Error(`bulk 액션 줄을 해석하지 못했습니다: ${lines[cursor]}`);
    }
    const action = actions[0];
    const meta = header[action];
    const lineCount = action === "delete" ? 1 : 2;
    operations.push({
      info: {
        action,
        id: meta?._id ?? null,
        index: meta?._index ?? null,
        position: operations.length,
        request,
      },
      lines: lines.slice(cursor, cursor + lineCount),
    });
    cursor += lineCount;
  }
  return operations;
}

function injectedItem(
  operation: BulkOperationInfo,
  defaultIndex: string | null,
  outcome: InjectedItemOutcome,
): InjectedBulkItem {
  const item: InjectedBulkItem = {};
  item[operation.action] = {
    _index: operation.index ?? defaultIndex,
    _id: operation.id,
    status: outcome.status,
    error: { type: outcome.type, reason: outcome.reason ?? "injected by transport-proxy" },
  };
  return item;
}

function isBulkRequest(params: TransportRequestParams): boolean {
  return (
    (params.method === "POST" || params.method === "PUT") &&
    /(^|\/)_bulk$/.test(params.path) &&
    params.bulkBody !== undefined
  );
}

function pathIndex(path: string): string | null {
  const match = /^\/([^/]+)\/_bulk$/.exec(path);
  return match === null ? null : decodeURIComponent(match[1]);
}

const jsonObjectSchema = z.record(z.string(), z.json());

async function readStream(stream: Readable, headers: ApiResponse["headers"]): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const buffer = Buffer.concat(chunks);
  const encoding = String(headers?.["content-encoding"] ?? "");
  return (encoding.includes("gzip") ? gunzipSync(buffer) : buffer).toString("utf8");
}

function streamOf(json: string): Readable {
  return Readable.from([Buffer.from(json, "utf8")]);
}

export function createBulkInjector(base: Client): BulkInjector {
  const rules: ActiveRule[] = [];
  const calls: BulkCallRecord[] = [];
  let requestCount = 0;

  class InjectingTransport extends Transport {
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
    ): TransportRequestPromise<ApiResponse>;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestCallback;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestPromise<ApiResponse> | TransportRequestCallback {
      if (callback !== undefined || !isBulkRequest(params)) {
        return super.request(params, options, callback);
      }
      const parsedLines = bulkBodyLines(params.bulkBody);
      // The worker prefixes every bulk with a fence item; rules skip it and fence-only bulks pass through untouched.
      const fenceOnly = parseOperations(parsedLines, 0).every(
        (operation) => operation.info.id === FENCE_DOCUMENT_ID,
      );
      if (fenceOnly) return super.request(params, options);
      requestCount += 1;
      const request = requestCount;
      const operations = parseOperations(parsedLines, request);
      const record: BulkCallRecord = {
        request,
        path: params.path,
        operations: operations
          .filter((operation) => operation.info.id !== FENCE_DOCUMENT_ID)
          .map((operation) => operation.info),
        injected: [],
        sentBody: null,
      };
      calls.push(record);

      const decisions = operations.map((operation) => {
        if (operation.info.id === FENCE_DOCUMENT_ID) return null;
        const active = rules.find(
          (candidate) => candidate.remaining > 0 && candidate.rule.match(operation.info),
        );
        if (active === undefined) {
          return null;
        }
        active.remaining -= 1;
        const decision = {
          operation: operation.info,
          outcome: active.rule.outcome,
          mode: active.rule.mode ?? "withhold",
        };
        record.injected.push(decision);
        return decision;
      });
      const sent = operations.filter((_, position) => decisions[position]?.mode !== "withhold");
      const defaultIndex = pathIndex(params.path);
      const merge = (sentItems: readonly z.infer<typeof bulkResponseSchema>["items"][number][]) => {
        let sentCursor = 0;
        return operations.map((operation, position) => {
          const decision = decisions[position];
          if (decision?.mode === "withhold") {
            return injectedItem(operation.info, defaultIndex, decision.outcome);
          }
          const real = sentItems[sentCursor];
          sentCursor += 1;
          if (real === undefined) {
            throw new Error(`bulk 응답 항목 수가 보낸 항목 수보다 적습니다 (request ${request}).`);
          }
          return decision === null
            ? real
            : injectedItem(operation.info, defaultIndex, decision.outcome);
        });
      };

      if (sent.length === 0) {
        const items = merge([]);
        // SAFETY: callers on this path read only body and statusCode.
        const synthetic = {
          body: { took: 0, errors: true, items },
          statusCode: 200,
          headers: {},
          warnings: null,
          meta: {},
        } as ApiResponse;
        if (options?.asStream === true) synthetic.body = streamOf(JSON.stringify(synthetic.body));
        return Object.assign(Promise.resolve(synthetic), { abort: () => {} });
      }
      const sentBody = `${sent.flatMap((operation) => operation.lines).join("\n")}\n`;
      record.sentBody = sentBody;
      const inner = super.request({ ...params, bulkBody: sentBody }, options);
      const rewritten = inner.then(async (response) => {
        if (record.injected.length === 0) {
          return response;
        }
        // The package client requests asStream: true, so the body arrives as a (possibly gzipped) stream.
        if (options?.asStream === true) {
          const raw = jsonObjectSchema.parse(
            JSON.parse(
              await readStream(z.instanceof(Readable).parse(response.body), response.headers),
            ),
          );
          const body = bulkResponseSchema.parse(raw);
          const headers = { ...response.headers };
          delete headers["content-encoding"];
          delete headers["content-length"];
          return {
            ...response,
            headers,
            body: streamOf(JSON.stringify({ ...raw, errors: true, items: merge(body.items) })),
          };
        }
        const body = bulkResponseSchema.parse(response.body);
        return { ...response, body: { ...response.body, errors: true, items: merge(body.items) } };
      });
      return Object.assign(rewritten, { abort: () => inner.abort() });
    }
  }

  const client = base.child({ Transport: InjectingTransport });
  return {
    client,
    inject(rule) {
      const times = rule.times ?? 1;
      if (!(times > 0)) {
        throw new Error("주입 규칙의 times는 0보다 커야 합니다.");
      }
      rules.push({ rule, remaining: times });
    },
    injectTransientFor(documentId, outcome = TRANSIENT_REJECTION) {
      this.inject({ match: (operation) => operation.id === documentId, outcome });
    },
    clear() {
      rules.length = 0;
      calls.length = 0;
    },
    get calls() {
      return calls;
    },
    get pendingRuleCount() {
      return rules.filter((active) => active.remaining > 0 && Number.isFinite(active.remaining))
        .length;
    },
  };
}

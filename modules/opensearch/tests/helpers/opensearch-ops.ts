import { type Client } from "@opensearch-project/opensearch";
import { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonLine = { readonly [key: string]: JsonValue };

export const BULK_ACTIONS = ["index", "create", "update", "delete"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

const errorCauseSchema = z.looseObject({
  type: z.string(),
  reason: z.string().nullish(),
});

const bulkItemResultSchema = z.looseObject({
  _index: z.string().optional(),
  _id: z.string().optional(),
  status: z.number(),
  _version: z.number().optional(),
  result: z.string().optional(),
  error: errorCauseSchema.optional(),
});

const bulkItemSchema = z.partialRecord(z.enum(BULK_ACTIONS), bulkItemResultSchema);

export const bulkResponseSchema = z.looseObject({
  errors: z.boolean(),
  items: z.array(bulkItemSchema),
});

export type BulkItem = {
  action: BulkAction;
  id: string | undefined;
  index: string | undefined;
  status: number;
  version: number | undefined;
  result: string | undefined;
  error: { type: string; reason: string | null } | undefined;
};

export type BulkOutcome = {
  statusCode: number;
  errors: boolean;
  items: BulkItem[];
};

export function readBulkItem(item: z.infer<typeof bulkItemSchema>): BulkItem {
  const entries = BULK_ACTIONS.flatMap((action) => {
    const result = item[action];
    return result === undefined ? [] : [{ action, result }];
  });
  if (entries.length !== 1) {
    throw new Error(`bulk 응답 항목의 액션 키가 하나가 아닙니다: ${JSON.stringify(item)}`);
  }
  const { action, result } = entries[0];
  return {
    action,
    id: result._id,
    index: result._index,
    status: result.status,
    version: result._version,
    result: result.result,
    error:
      result.error === undefined
        ? undefined
        : { type: result.error.type, reason: result.error.reason ?? null },
  };
}

export function toNdjson(lines: readonly JsonLine[]): string {
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

export async function sendBulk(
  client: Client,
  target: string,
  lines: readonly JsonLine[],
  querystring: { readonly [key: string]: string | boolean } = {},
): Promise<BulkOutcome> {
  const response = await client.transport.request(
    {
      method: "POST",
      path: `/${encodeURIComponent(target)}/_bulk`,
      bulkBody: toNdjson(lines),
      querystring: { ...querystring },
    },
    { maxRetries: 0 },
  );
  const body = bulkResponseSchema.parse(response.body);
  return {
    statusCode: response.statusCode ?? 0,
    errors: body.errors,
    items: body.items.map(readBulkItem),
  };
}

const rootInfoSchema = z.looseObject({
  version: z.looseObject({ distribution: z.string().optional(), number: z.string() }),
});

export async function readEngineVersion(
  client: Client,
): Promise<{ distribution: string | undefined; number: string }> {
  const response = await client.info();
  const body = rootInfoSchema.parse(response.body);
  return { distribution: body.version.distribution, number: body.version.number };
}

export async function indexExists(client: Client, name: string): Promise<boolean> {
  const response = await client.indices.exists({ index: name });
  return z.boolean().parse(response.body);
}

export async function aliasExists(client: Client, name: string): Promise<boolean> {
  const response = await client.indices.existsAlias({ name });
  return z.boolean().parse(response.body);
}

const catIndicesSchema = z.array(z.looseObject({ index: z.string() }));

export async function listIndices(client: Client, prefix: string): Promise<string[]> {
  const response = await client.cat.indices({
    index: `${prefix}*`,
    format: "json",
    h: ["index"],
    expand_wildcards: "all",
  });
  return catIndicesSchema
    .parse(response.body)
    .map((row) => row.index)
    .filter((name) => name.startsWith(prefix))
    .toSorted();
}

// Deletes by explicit name so cleanup does not depend on the cluster allowing wildcard deletes.
export async function deleteIndicesWithPrefix(client: Client, prefix: string): Promise<string[]> {
  if (prefix.length < 6 || !prefix.endsWith("-")) {
    throw new Error(`정리 접두사가 너무 넓습니다: ${prefix}`);
  }
  const names = await listIndices(client, prefix);
  for (const name of names) {
    await client.indices.delete({ index: name, ignore_unavailable: true });
  }
  return names;
}

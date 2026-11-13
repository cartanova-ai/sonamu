import { defineSearch, type DocumentId, type Projection } from "@sonamu-kit/opensearch";
import { z } from "zod";

/** Read only through context.trx; room membership stays out of the document and is re-checked after search. */
export const CHAT_MESSAGES_KEY = "chat-messages";

export const chatMessageDocumentSchema = z.object({
  room_id: z.string(),
  author_id: z.string().nullable(),
  body: z.string(),
  updated_at: z.string(),
});
export type ChatMessageDocument = z.infer<typeof chatMessageDocumentSchema>;

// pg returns bigint columns as strings.
const idColumn = z.union([z.string(), z.number()]).transform(String);
const messageRowSchema = z.object({
  id: idColumn,
  room_id: idColumn,
  author_id: idColumn.nullable(),
  body: z.string(),
  updated_at: z.date(),
});
const DECIMAL_ID = /^[1-9][0-9]{0,18}$/;

export const chatMessagesSearch = defineSearch<ChatMessageDocument>({
  key: CHAT_MESSAGES_KEY,
  // Bump whenever the projection's meaning changes, so a rebuild picks it up.
  projectionVersion: "1",
  schema: chatMessageDocumentSchema,
  settings: { index: { number_of_shards: 1 } },
  mappings: {
    properties: {
      room_id: { type: "keyword" },
      author_id: { type: "keyword" },
      body: { type: "text" },
      updated_at: { type: "date" },
    },
  },
  requiredPlugins: [],

  async materialize(context, ids) {
    const lookup = ids.filter((id) => DECIMAL_ID.test(id));
    const rows = z
      .array(messageRowSchema)
      .parse(
        await context
          .trx("messages")
          .select("id", "room_id", "author_id", "body", "updated_at")
          .whereIn("id", lookup),
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    // Return exactly one result per requested id; a missing row is deleted.
    return new Map(
      ids.map((id): [DocumentId, Projection<ChatMessageDocument>] => {
        const row = byId.get(id);
        if (row === undefined) return [id, { state: "deleted" }];
        return [
          id,
          {
            state: "present",
            document: {
              room_id: row.room_id,
              author_id: row.author_id,
              body: row.body,
              updated_at: row.updated_at.toISOString(),
            },
          },
        ];
      }),
    );
  },

  async captureScanBoundary(context) {
    const row = z
      .object({ max: idColumn.nullable() })
      .parse(await context.trx("messages").max("id as max").first());
    return row.max ?? "0";
  },

  async scanSourceIds(context, page) {
    const rows = z.array(z.object({ id: idColumn })).parse(
      await context
        .trx("messages")
        .select("id")
        .where("id", ">", page.after ?? "0")
        .andWhere("id", "<=", page.through)
        .orderBy("id")
        .limit(page.limit),
    );
    const ids = rows.map((row) => row.id);
    const last = ids.at(-1);
    return ids.length === page.limit && last !== undefined ? { ids, next: last } : { ids };
  },
});

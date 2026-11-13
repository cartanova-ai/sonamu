import { type SearchQueries } from "@sonamu-kit/opensearch";
import { type Knex } from "knex";
import { z } from "zod";

import { type ChatMessageDocument } from "../search/chat-messages.definition";

// Hits are candidates, not authorized records: re-check each one on the primary and return current rows.

export const chatSearchInputSchema = z.strictObject({
  userId: z.string().regex(/^[1-9][0-9]{0,18}$/),
  text: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(50).default(20),
});
export type ChatSearchInput = z.input<typeof chatSearchInputSchema>;

export interface ChatSearchHit {
  id: string;
  roomId: string;
  authorId: string | null;
  body: string;
  highlights: string[];
}

export interface ChatSearchDependencies {
  queries: SearchQueries<ChatMessageDocument>;
  /** The primary pool, never a transaction: search refuses to run inside one. */
  db: Knex;
}

const idColumn = z.union([z.string(), z.number()]).transform(String);
const roomRowSchema = z.object({ room_id: idColumn });
const messageRowSchema = z.object({
  id: idColumn,
  room_id: idColumn,
  author_id: idColumn.nullable(),
  body: z.string(),
  updated_at: z.date(),
});

async function readableRoomIds(db: Knex, userId: string): Promise<string[]> {
  const rows = z
    .array(roomRowSchema)
    .parse(await db("room_members").where({ user_id: userId }).select("room_id"));
  return rows.map((row) => row.room_id);
}

export async function searchChatMessages(
  dependencies: ChatSearchDependencies,
  rawInput: ChatSearchInput,
): Promise<ChatSearchHit[]> {
  const input = chatSearchInputSchema.parse(rawInput);
  const { db, queries } = dependencies;

  // Read the authorization scope from the primary right before searching.
  const roomIds = await readableRoomIds(db, input.userId);

  // Send the terms filter even when empty; dropping it makes every room a candidate.
  const candidates = await queries.search({
    body: {
      query: {
        bool: {
          must: [{ match: { "doc.body": input.text } }],
          filter: [{ terms: { "doc.room_id": roomIds } }],
        },
      },
      highlight: { fields: { "doc.body": {} } },
      _source: ["updated_at"],
      size: input.size,
    },
  });
  if (candidates.hits.length === 0) return [];

  // The index may lag: re-check every candidate against current membership and existence.
  const ids = candidates.hits.map((hit) => hit.id);
  const current = z
    .array(messageRowSchema)
    .parse(
      await db("messages as m")
        .join("room_members as rm", "rm.room_id", "m.room_id")
        .where("rm.user_id", input.userId)
        .whereIn("m.id", ids)
        .select("m.id", "m.room_id", "m.author_id", "m.body", "m.updated_at"),
    );
  const byId = new Map(current.map((row) => [row.id, row]));

  // Drop highlights of bodies edited after indexing; they show text that no longer exists.
  const hits: ChatSearchHit[] = [];
  for (const candidate of candidates.hits) {
    const row = byId.get(candidate.id);
    if (row === undefined) continue;
    const indexedVersion = candidate.source?.updated_at;
    const fresh = indexedVersion === row.updated_at.toISOString();
    hits.push({
      id: row.id,
      roomId: row.room_id,
      authorId: row.author_id,
      body: row.body,
      highlights: fresh ? (candidate.highlight?.["doc.body"] ?? []) : [],
    });
  }
  return hits;
}

import { BaseModelClass } from "sonamu";
import { z } from "zod";

import { CHAT_MESSAGES_KEY } from "../search/chat-messages.definition";
import { chatSearchSync } from "../search/client";
import { withTransactionRetry } from "./transaction-retry";

const idColumn = z.union([z.string(), z.number()]).transform(String);
const searchRowSchema = z.object({
  id: idColumn,
  room_id: idColumn,
  author_id: idColumn.nullable(),
  body: z.string(),
  updated_at: z.date(),
});
export type ChatMessageSearchRow = z.infer<typeof searchRowSchema>;
const DECIMAL_ID = /^[1-9][0-9]{0,18}$/;

/** Mark in the same transaction as the domain write; on 40001 or 40P01 retry the whole transaction. */
class ChatMessageModelClass extends BaseModelClass {
  modelName = "ChatMessage";

  async send(roomId: string, authorId: string, body: string): Promise<string> {
    return this.getPuri("w").transaction(async (trx) => {
      const [row] = await trx
        .trx("messages")
        .insert({ room_id: roomId, author_id: authorId, body })
        .returning<{ id: string }[]>("id");
      await chatSearchSync.markChangedIn(trx, CHAT_MESSAGES_KEY, [String(row.id)]);
      return String(row.id);
    });
  }

  async edit(messageId: string, body: string): Promise<void> {
    await this.getPuri("w").transaction(async (trx) => {
      await trx
        .trx("messages")
        .where({ id: messageId })
        .update({ body, updated_at: trx.trx.raw("clock_timestamp()") });
      await chatSearchSync.markChangedIn(trx, CHAT_MESSAGES_KEY, [messageId]);
    });
  }

  async editWithRetry(messageId: string, body: string): Promise<void> {
    await withTransactionRetry(() => this.edit(messageId, body));
  }

  /** Called from defineSonamuSearch, where getPuri("r") is the worker's snapshot transaction. */
  async findForSearch(ids: readonly string[]): Promise<ChatMessageSearchRow[]> {
    const lookup = ids.filter((id) => DECIMAL_ID.test(id));
    return z
      .array(searchRowSchema)
      .parse(
        await this.getPuri("r")
          .knex("messages")
          .select("id", "room_id", "author_id", "body", "updated_at")
          .whereIn("id", lookup),
      );
  }

  /** Deletes must be marked too; the worker indexes a tombstone for a missing row. */
  async remove(messageId: string): Promise<void> {
    await this.getPuri("w").transaction(async (trx) => {
      await trx.trx("messages").where({ id: messageId }).delete();
      await chatSearchSync.markChangedIn(trx, CHAT_MESSAGES_KEY, [messageId]);
    });
  }

  /** CASCADE deletes are not marked for you: collect the ids first and mark them sorted in one call to avoid deadlocks. */
  async removeRoom(roomId: string): Promise<void> {
    await this.getPuri("w").transaction(async (trx) => {
      const rows = await trx
        .trx("messages")
        .where({ room_id: roomId })
        .select<{ id: string }[]>("id");
      await trx.trx("rooms").where({ id: roomId }).delete();
      const ids = rows.map((row) => String(row.id)).toSorted();
      if (ids.length > 0) await chatSearchSync.markChangedIn(trx, CHAT_MESSAGES_KEY, ids);
    });
  }
}

export const ChatMessageModel = new ChatMessageModelClass();

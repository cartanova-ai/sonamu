import { BaseModelClass, transactional } from "sonamu";
import { z } from "zod";

import { CHAT_MESSAGES_KEY } from "../search/chat-messages.definition";
import { chatSearchSync } from "../search/client";

const idRowSchema = z.object({ id: z.union([z.string(), z.number()]).transform(String) });

/** markChanged needs an open @transactional transaction and refuses with SearchInvalidTransaction without one. */
class ChatRoomModelClass extends BaseModelClass {
  modelName = "ChatRoom";

  /** Moving messages changes their room_id, so they must be marked. */
  @transactional()
  async moveMessages(fromRoomId: string, toRoomId: string): Promise<number> {
    const db = this.getPuri("w").knex;
    const rows = z
      .array(idRowSchema)
      .parse(
        await db("messages").where({ room_id: fromRoomId }).update({ room_id: toRoomId }, ["id"]),
      );
    const ids = rows.map((row) => row.id).toSorted();
    if (ids.length > 0) await chatSearchSync.markChanged(CHAT_MESSAGES_KEY, ids);
    return ids.length;
  }
}

export const ChatRoomModel = new ChatRoomModelClass();

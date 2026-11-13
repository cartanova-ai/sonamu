import { type DocumentId, type Projection } from "@sonamu-kit/opensearch";
import { defineSonamuSearch } from "@sonamu-kit/opensearch/sonamu";

import {
  CHAT_MESSAGES_KEY,
  type ChatMessageDocument,
  chatMessageDocumentSchema,
  chatMessagesSearch,
} from "../search/chat-messages.definition";
import { ChatMessageModel } from "./chat-message.model";

/** Same fingerprint as chatMessagesSearch: register only one of the two, and never read through DB.getDB() or another Knex here. */
export const chatMessagesSonamuSearch = defineSonamuSearch<ChatMessageDocument>({
  key: CHAT_MESSAGES_KEY,
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

  async materialize(_context, ids) {
    const rows = await ChatMessageModel.findForSearch(ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
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

  captureScanBoundary: (context) => chatMessagesSearch.captureScanBoundary(context),
  scanSourceIds: (context, page) => chatMessagesSearch.scanSourceIds(context, page),
});

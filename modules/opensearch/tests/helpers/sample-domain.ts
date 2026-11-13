import { type Knex } from "knex";

import { identifier, qualified, sql } from "./sql";

export type SampleId = string;

export type SampleUser = { id: SampleId; name: string };
export type SampleRoom = { id: SampleId; name: string };
export type SampleMessage = {
  id: SampleId;
  room_id: SampleId;
  author_id: SampleId | null;
  body: string;
  created_at: Date;
  updated_at: Date;
};

export type SampleTable = "users" | "rooms" | "room_members" | "messages";

// FK mutation tests rely on these actions: deleting a room cascades, deleting a user sets message authors to NULL.
export function sampleDomainDdl(schema: string): string {
  const users = qualified(schema, "users");
  const rooms = qualified(schema, "rooms");
  const members = qualified(schema, "room_members");
  const messages = qualified(schema, "messages");
  return sql`
CREATE SCHEMA ${identifier(schema)};
CREATE TABLE ${users} (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE ${rooms} (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE ${members} (
  room_id bigint NOT NULL REFERENCES ${rooms} (id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES ${users} (id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX room_members_user_id_idx ON ${members} (user_id);
CREATE TABLE ${messages} (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id bigint NOT NULL REFERENCES ${rooms} (id) ON DELETE CASCADE,
  author_id bigint REFERENCES ${users} (id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_room_id_idx ON ${messages} (room_id);
CREATE INDEX messages_author_id_idx ON ${messages} (author_id);
`;
}

export async function installSampleDomain(knex: Knex, schema: string): Promise<SampleChat> {
  await knex.raw(sampleDomainDdl(schema));
  return new SampleChat(knex, schema);
}

export class SampleChat {
  readonly schema: string;

  constructor(
    private readonly knex: Knex,
    schema: string,
  ) {
    identifier(schema);
    this.schema = schema;
  }

  from(table: SampleTable, db: Knex = this.knex): Knex.QueryBuilder {
    return db(table).withSchema(this.schema);
  }

  async count(table: SampleTable, db: Knex = this.knex): Promise<number> {
    const row = await this.from(table, db).count<{ count: string }[]>("* as count").first();
    return Number(row?.count ?? 0);
  }

  async findUser(userId: SampleId, db: Knex = this.knex): Promise<SampleUser | null> {
    const row = await this.from("users", db).where({ id: userId }).first<SampleUser | undefined>();
    return row ?? null;
  }

  async createUser(name: string, db: Knex = this.knex): Promise<SampleUser> {
    const [row] = await this.from("users", db)
      .insert({ name })
      .returning<SampleUser[]>(["id", "name"]);
    return row;
  }

  async createRoom(name: string, db: Knex = this.knex): Promise<SampleRoom> {
    const [row] = await this.from("rooms", db)
      .insert({ name })
      .returning<SampleRoom[]>(["id", "name"]);
    return row;
  }

  async addMember(roomId: SampleId, userId: SampleId, db: Knex = this.knex): Promise<void> {
    await this.from("room_members", db).insert({ room_id: roomId, user_id: userId });
  }

  async removeMember(roomId: SampleId, userId: SampleId, db: Knex = this.knex): Promise<boolean> {
    const removed = await this.from("room_members", db)
      .where({ room_id: roomId, user_id: userId })
      .delete();
    return removed > 0;
  }

  async sendMessage(
    message: { roomId: SampleId; authorId: SampleId | null; body: string },
    db: Knex = this.knex,
  ): Promise<SampleMessage> {
    const [row] = await this.from("messages", db)
      .insert({ room_id: message.roomId, author_id: message.authorId, body: message.body })
      .returning<SampleMessage[]>("*");
    return row;
  }

  async editMessage(
    messageId: SampleId,
    body: string,
    db: Knex = this.knex,
  ): Promise<SampleMessage> {
    const [row] = await this.from("messages", db)
      .where({ id: messageId })
      .update({ body, updated_at: db.raw("clock_timestamp()") })
      .returning<SampleMessage[]>("*");
    if (row === undefined) {
      throw new Error(`수정할 메시지 ${messageId}가 없습니다.`);
    }
    return row;
  }

  async deleteMessage(messageId: SampleId, db: Knex = this.knex): Promise<boolean> {
    return (await this.from("messages", db).where({ id: messageId }).delete()) > 0;
  }

  async deleteRoom(roomId: SampleId, db: Knex = this.knex): Promise<boolean> {
    return (await this.from("rooms", db).where({ id: roomId }).delete()) > 0;
  }

  async deleteUser(userId: SampleId, db: Knex = this.knex): Promise<boolean> {
    return (await this.from("users", db).where({ id: userId }).delete()) > 0;
  }

  async findMessage(messageId: SampleId, db: Knex = this.knex): Promise<SampleMessage | null> {
    const row = await this.from("messages", db)
      .where({ id: messageId })
      .first<SampleMessage | undefined>();
    return row ?? null;
  }

  async messagesInRoom(roomId: SampleId, db: Knex = this.knex): Promise<SampleMessage[]> {
    return this.from("messages", db)
      .where({ room_id: roomId })
      .orderBy("id")
      .select<SampleMessage[]>("*");
  }

  async memberRoomIds(userId: SampleId, db: Knex = this.knex): Promise<SampleId[]> {
    const rows = await this.from("room_members", db)
      .where({ user_id: userId })
      .orderBy("room_id")
      .select<{ room_id: SampleId }[]>("room_id");
    return rows.map((row) => row.room_id);
  }
}

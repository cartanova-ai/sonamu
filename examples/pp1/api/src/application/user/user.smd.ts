import { SMDInput } from "@sonamu/core";
import { p } from "@sonamu/core";
import { UserFieldExpr } from "./user.generated";

/*
  User MD
*/

export const userSMDInput: SMDInput<UserFieldExpr> = {
  id: "User",
  title: "유저",
  props: [
    p.integer("id", { unsigned: true }),
    p.enums("role", {
      length: 32,
    }),
    p.string("string_id", {
      length: 128,
    }),
    p.string("pw", {
      length: 256,
    }),
    p.string("name", { length: 64 }),
    p.integer("birthyear", { dbDefault: 1900, unsigned: true }),
    p.enums("status", {
      length: 64,
    }),
    p.timestamp("created_at", {
      now: true,
    }),
    p.relationHasMany("posts", {
      with: "Post",
      joinColumn: "author_id",
    }),
  ],

  subsets: {
    A: [
      "id",
      "role",
      "string_id",
      "pw",
      "name",
      "birthyear",
      "status",
      "created_at",
      "posts.id",
      "posts.title",
    ],
    D: ["id", "role", "string_id", "name", "birthyear", "status", "created_at"],
    SS: [
      "id",
      "role",
      "string_id",
      "name",
      "birthyear",
      "status",
      "created_at",
    ],
  },
};

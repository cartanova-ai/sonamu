import { z } from "zod";
import { p } from "@sonamu/core";
import { SMDInput } from "@sonamu/core";

/*
  Post MD
*/

export const postSMDInput: SMDInput<string> = {
  id: "Post",
  title: "포스트",
  props: [
    p.integer("id", { unsigned: true }),
    p.enums("type", {
      length: 64,
      toFilter: true,
    }),
    p.string("title", { length: 256, nullable: true }),
    p.text("content", { textType: "text" }),
    p.relationBelongsToOne("author", {
      with: "User",
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    }),
    p.enums("status", {
      length: 64,
      toFilter: true,
    }),
    p.decimal("rating", {
      unsigned: true,
      nullable: true,
    }),
    p.virtual("next_post", {
      as: z.object({
        a: z.string(),
        b: z.number(),
        c: z.date(),
      }),
    }),
    p.json("images", {
      as: z.string().array(),
    }),
    p.string("source_url", {
      length: 512,
      nullable: true,
    }),
    p.boolean("is_public"),
    p.timestamp("created_at", {
      now: true,
    }),
  ],

  subsets: {
    A: [
      "id",
      "type",
      "title",
      "content",
      "author.id",
      "author.name",
      "rating",
      "status",
      "next_post",
      "images",
      "source_url",
      "is_public",
      "created_at",
    ],
    D: ["id", "type", "author.id", "title", "content", "created_at"],
  },
};

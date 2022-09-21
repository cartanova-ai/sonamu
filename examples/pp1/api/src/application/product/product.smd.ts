import { z } from "zod";
import { p } from "sonamu";
import { SMDInput } from "sonamu";
import { ProductFieldExpr } from "./product.generated";

/*
  Product MD
*/
//
export const productSMDInput: SMDInput<ProductFieldExpr> = {
  id: "Product",
  title: "상품",
  props: [
    p.integer("id", { unsigned: true }),
    p.relationBelongsToOne("brand", {
      with: "Brand",
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    }),
    p.enums("type", {
      length: 32,
    }),
    p.string("title", {
      length: 128,
    }),
    p.text("description", {
      textType: "mediumtext",
    }),
    p.integer("price", {
      index: true,
    }),
    p.boolean("is_new", {
      index: true,
    }),
    p.timestamp("visible_until_at", {
      index: true,
    }),
    p.enums("status", {
      length: 32,
    }),
    p.timestamp("created_at", {
      now: true,
      index: true,
    }),
    p.timestamp("checked_at", {
      nullable: true,
    }),
    p.json("images", {
      as: z.string().array(),
    }),
    p.relationManyToMany("tags", {
      with: "Tag",
      joinTable: "products__tags",
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    }),
  ],
  subsets: {
    A: [
      "id",
      "brand.id",
      "brand.name",
      "type",
      "title",
      "description",
      "price",
      "is_new",
      "visible_until_at",
      "images",
      "status",
      "tags.id",
      "tags.name",
      "tags.created_at",
      "checked_at",
      "created_at",
    ],
  },
};

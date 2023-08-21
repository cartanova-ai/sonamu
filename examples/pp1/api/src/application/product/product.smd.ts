import { z } from "zod";
import { i, p } from "sonamu";
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
    p.integer("price"),
    p.boolean("is_new"),
    p.timestamp("visible_until_at"),
    p.enums("status", {
      length: 32,
    }),
    p.timestamp("created_at", {
      now: true,
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
  indexes: [
    i.index("price"),
    i.index("is_new"),
    i.index("visible_until_at"),
    i.index("created_at"),
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

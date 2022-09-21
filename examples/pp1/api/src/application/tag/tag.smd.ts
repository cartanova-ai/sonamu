import { p } from "sonamu";
import { SMDInput } from "sonamu";
import { TagFieldExpr } from "./tag.generated";

/*
  Tag MD
*/

export const tagSMDInput: SMDInput<TagFieldExpr> = {
  id: "Tag",
  title: "태그",
  props: [
    p.integer("id", { unsigned: true }),
    p.string("name", {
      length: 64,
      unique: true,
    }),
    p.timestamp("created_at", {
      now: true,
    }),
  ],
  subsets: {
    A: ["id", "name", "created_at"],
  },
};

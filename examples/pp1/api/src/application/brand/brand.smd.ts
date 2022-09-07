import { p, SMDInput } from "@sonamu/core";

/*
  Brand MD
*/

export const brandSMDInput: SMDInput<string> = {
  id: "Brand",
  title: "브랜드",
  props: [
    p.integer("id", { unsigned: true }),
    p.string("name", {
      length: 128,
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

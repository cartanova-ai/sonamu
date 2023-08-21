import { i, p, SMDInput } from "sonamu";

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
    }),
    p.timestamp("created_at", {
      now: true,
    }),
  ],
  indexes: [i.unique("name")],
  subsets: {
    A: ["id", "name", "created_at"],
  },
};

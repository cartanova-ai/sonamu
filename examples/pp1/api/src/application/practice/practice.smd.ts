import { SMDInput } from "@sonamu/core";
import { PracticeFieldExpr } from "./practice.generated";

/*
  Practice MD
*/

export const practiceSMDInput: SMDInput<PracticeFieldExpr> = {
  id: "Practice",
  title: "프랙티스",
  subsets: {
    A: [],
  },
};

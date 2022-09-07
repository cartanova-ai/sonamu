import { z } from "zod";
import {
  LogicompanyBaseSchema,
  LogicompanyBaseListParams,
} from "./logicompany.generated";

// Logicompany - ListParams
export const LogicompanyListParams = LogicompanyBaseListParams;
export type LogicompanyListParams = z.infer<typeof LogicompanyListParams>;

// Logicompany - SaveParams
export const LogicompanySaveParams = LogicompanyBaseSchema.partial({
  id: true,
});
export type LogicompanySaveParams = z.infer<typeof LogicompanySaveParams>;

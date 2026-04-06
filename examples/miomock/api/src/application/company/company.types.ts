import type { z } from "zod";

import { CompanyBaseListParams, CompanyBaseSchema } from "../sonamu.generated";

// Company - ListParams
export const CompanyListParams = CompanyBaseListParams;
export type CompanyListParams = z.infer<typeof CompanyListParams>;

// Company - SaveParams
export const CompanySaveParams = CompanyBaseSchema.partial({
  id: true,
  created_at: true,
});
export type CompanySaveParams = z.infer<typeof CompanySaveParams>;

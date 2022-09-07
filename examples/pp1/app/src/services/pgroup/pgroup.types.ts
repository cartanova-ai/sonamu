import { z } from "zod";
import { PgroupBaseSchema, PgroupBaseListParams } from "./pgroup.generated";

// Pgroup - ListParams
export const PgroupListParams = PgroupBaseListParams;
export type PgroupListParams = z.infer<typeof PgroupListParams>;

// Pgroup - SaveParams
export const PgroupSaveParams = PgroupBaseSchema.partial({ id: true });
export type PgroupSaveParams = z.infer<typeof PgroupSaveParams>;

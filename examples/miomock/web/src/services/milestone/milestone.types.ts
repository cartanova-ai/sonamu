/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */

import { z } from "zod";

import { MilestoneBaseListParams, MilestoneBaseSchema } from "../sonamu.generated";

// Milestone - ListParams
export const MilestoneListParams = MilestoneBaseListParams.extend({
  project_id: z.number().int().positive().optional(),
});
export type MilestoneListParams = z.infer<typeof MilestoneListParams>;

// Milestone - SaveParams
export const MilestoneSaveParams = MilestoneBaseSchema.partial({
  id: true,
  created_at: true,
  completed_at: true,
  description: true,
}).extend({
  description: z.string().nullish(),
  completed_at: z.date().nullish(),
});
export type MilestoneSaveParams = z.infer<typeof MilestoneSaveParams>;

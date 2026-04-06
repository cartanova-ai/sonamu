import { type z } from "zod";

import { SyncFixtureBaseListParams, SyncFixtureBaseSchema } from "../sonamu.generated";

// SyncFixture - ListParams
export const SyncFixtureListParams = SyncFixtureBaseListParams;
export type SyncFixtureListParams = z.infer<typeof SyncFixtureListParams>;

// SyncFixture - SaveParams
export const SyncFixtureSaveParams = SyncFixtureBaseSchema.partial({ id: true, created_at: true });
export type SyncFixtureSaveParams = z.infer<typeof SyncFixtureSaveParams>;

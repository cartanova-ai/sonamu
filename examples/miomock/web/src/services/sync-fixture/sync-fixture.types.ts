/**
 * @generated
 * 이 파일은 API 산출물을 대상(Web/App)용으로 동기화한 파일입니다.
 * 직접 수정하지 마세요. API 측 원본을 수정하면 자동으로 반영됩니다.
 * (sonamu → sonamu.shared import 치환이 적용되어 있습니다)
 */
import type { z } from "zod";
import { SyncFixtureBaseListParams, SyncFixtureBaseSchema } from "../sonamu.generated";

// SyncFixture - ListParams
export const SyncFixtureListParams = SyncFixtureBaseListParams;
export type SyncFixtureListParams = z.infer<typeof SyncFixtureListParams>;

// SyncFixture - SaveParams
export const SyncFixtureSaveParams = SyncFixtureBaseSchema.partial({ id: true, created_at: true });
export type SyncFixtureSaveParams = z.infer<typeof SyncFixtureSaveParams>;

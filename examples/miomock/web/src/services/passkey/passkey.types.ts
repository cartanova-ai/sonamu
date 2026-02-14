/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */
import type { z } from "zod";
import { PasskeyBaseListParams, PasskeyBaseSchema } from "../sonamu.generated";

// Passkey - ListParams
export const PasskeyListParams = PasskeyBaseListParams;
export type PasskeyListParams = z.infer<typeof PasskeyListParams>;

// Passkey - SaveParams
export const PasskeySaveParams = PasskeyBaseSchema.partial({ id: true, created_at: true });
export type PasskeySaveParams = z.infer<typeof PasskeySaveParams>;

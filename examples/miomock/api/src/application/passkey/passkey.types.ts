import type { z } from "zod";

import { PasskeyBaseListParams, PasskeyBaseSchema } from "../sonamu.generated";

// Passkey - ListParams
export const PasskeyListParams = PasskeyBaseListParams;
export type PasskeyListParams = z.infer<typeof PasskeyListParams>;

// Passkey - SaveParams
export const PasskeySaveParams = PasskeyBaseSchema.partial({ id: true, created_at: true });
export type PasskeySaveParams = z.infer<typeof PasskeySaveParams>;

import { passkey as _passkey, type PasskeyOptions } from "@better-auth/passkey";
import { merge } from "../../../utils/utils";

export type { PasskeyOptions } from "@better-auth/passkey";

/**
 * Passkey 플러그인 스키마
 *
 * better-auth passkey 플러그인 호출 시 전달합니다:
 * ```typescript
 * passkey({ schema: PASSKEY_SCHEMA })
 * ```
 */
export const PASSKEY_SCHEMA: PasskeyOptions["schema"] = {
  passkey: {
    modelName: "passkeys",
    fields: {
      publicKey: "public_key",
      userId: "user_id",
      credentialID: "credential_id",
      deviceType: "device_type",
      backedUp: "backed_up",
      createdAt: "created_at",
    },
  },
};

/**
 * passkey 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const passkey = (options: PasskeyOptions = {}): ReturnType<typeof _passkey> => {
  options.schema = merge(PASSKEY_SCHEMA, options.schema ?? {});
  return _passkey(options);
};

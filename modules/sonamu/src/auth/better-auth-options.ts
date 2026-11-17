import { type BetterAuthOptions } from "better-auth";

import { type SonamuServerOptions } from "../api/config";
import { merge } from "../utils/utils";
import { BASE_FIELD_MAPPINGS } from "./better-auth-entities";

/**
 * sonamu.config.ts의 `server.auth`를 better-auth에 넘길 옵션으로 만듭니다.
 *
 * - Sonamu 기본 테이블/컬럼 매핑(`BASE_FIELD_MAPPINGS`)에 사용자 설정을 합칩니다.
 * - `user.additionalFields` 중 `input`을 지정하지 않은 필드는 `input: false`로 둡니다.
 *   better-auth는 `input: false`가 아닌 필드를 sign-up, update-user 요청 바디에서 그대로 받으므로,
 *   `role` 같은 권한 필드를 가입 요청으로 스스로 올릴 수 있기 때문입니다.
 *   클라이언트가 직접 넣어야 하는 필드만 `input: true`로 명시하세요.
 *
 * 사용자 설정 객체는 바꾸지 않고 새 객체를 반환합니다.
 */
export function buildBetterAuthOptions(
  authConfig: NonNullable<SonamuServerOptions["auth"]>,
): BetterAuthOptions {
  const merged = merge(BASE_FIELD_MAPPINGS, authConfig);
  const additionalFields = merged.user?.additionalFields;
  if (!additionalFields) {
    return merged;
  }

  return {
    ...merged,
    user: {
      ...merged.user,
      additionalFields: Object.fromEntries(
        Object.entries(additionalFields).map(([key, field]) => [
          key,
          field.input === undefined ? { ...field, input: false } : field,
        ]),
      ),
    },
  };
}

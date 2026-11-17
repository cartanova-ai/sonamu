import { type EntityJson } from "../types/types";
import { betterAuthV1 } from "./better-auth-entities";
import { ENTITY_DEFINITIONS } from "./plugins/entity-definitions";

/**
 * better-auth가 인증 자격 증명을 저장하는 엔티티와, 그중 API 응답으로 내보내면 안 되는 비밀 필드입니다.
 *
 * - 비밀 필드는 기본 subset에 넣지 않습니다(세션 토큰, 비밀번호 해시, OAuth 토큰, 2FA secret, 서명 키 등).
 * - 비밀 필드가 없더라도 행을 쓰면 다른 사용자로 로그인할 수 있는 엔티티(Passkey)도 포함합니다.
 */
export const BETTER_AUTH_SECRET_FIELDS = {
  Session: ["token"],
  Account: ["access_token", "refresh_token", "id_token", "password"],
  Verification: ["value"],
  TwoFactor: ["secret", "backup_codes"],
  Passkey: [],
  Jwks: ["private_key"],
  ApiKey: ["key"],
  SsoProvider: ["oidc_config", "saml_config"],
} as const satisfies Record<string, readonly string[]>;

/**
 * better-auth 엔티티 정의(기본 + 플러그인) 전체를 반환합니다.
 */
export function getAllBetterAuthEntityDefinitions(): EntityJson[] {
  return [
    ...betterAuthV1,
    ...Object.values(ENTITY_DEFINITIONS).flatMap((definition) => definition.entities),
  ];
}

/**
 * 주어진 엔티티가 better-auth 자격 증명 엔티티면 해당 정의를 반환합니다.
 *
 * 같은 이름의 사용자 엔티티를 잘못 막지 않도록 엔티티 ID와 테이블명이 모두
 * better-auth 정의와 일치할 때만 자격 증명 엔티티로 판단합니다.
 */
export function findBetterAuthCredentialEntity(entity: {
  id: string;
  table: string;
}): EntityJson | undefined {
  if (!Object.hasOwn(BETTER_AUTH_SECRET_FIELDS, entity.id)) {
    return undefined;
  }
  return getAllBetterAuthEntityDefinitions().find(
    (definition) => definition.id === entity.id && definition.table === entity.table,
  );
}

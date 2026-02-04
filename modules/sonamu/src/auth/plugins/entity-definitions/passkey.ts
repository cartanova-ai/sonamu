import type { BetterAuthEntityDef } from "./types";

/**
 * better-auth Passkey 플러그인 엔티티 정의
 * https://www.better-auth.com/docs/plugins/passkey
 *
 * WebAuthn/FIDO2 기반 패스키 인증을 지원합니다.
 * Passkey 테이블을 생성하여 사용자의 패스키 정보를 저장합니다.
 */
export const passkeyEntityDef: BetterAuthEntityDef = {
  id: "passkey",
  name: "Passkey",
  entities: [
    {
      id: "Passkey",
      table: "passkeys",
      title: "패스키",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "name", type: "string", nullable: true, desc: "패스키 이름" },
        { name: "public_key", type: "string", desc: "공개키" },
        { name: "credential_id", type: "string", desc: "자격 증명 ID" },
        { name: "counter", type: "integer", desc: "카운터" },
        { name: "device_type", type: "string", desc: "장치 유형" },
        { name: "backed_up", type: "boolean", desc: "백업 여부" },
        { name: "transports", type: "string", nullable: true, desc: "전송 방식" },
        { name: "aaguid", type: "string", nullable: true, desc: "AAGUID" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        {
          type: "relation",
          name: "user",
          with: "User",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "사용자",
        },
      ],
      indexes: [
        { type: "index", name: "passkeys_user_id_idx", columns: [{ name: "user_id" }] },
        { type: "index", name: "passkeys_credential_id_idx", columns: [{ name: "credential_id" }] },
      ],
      subsets: {
        A: [
          "id",
          "name",
          "public_key",
          "credential_id",
          "counter",
          "device_type",
          "backed_up",
          "transports",
          "aaguid",
          "created_at",
          "user.id",
        ],
      },
      enums: {
        PasskeyOrderBy: { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" },
        PasskeySearchField: { id: "ID", name: "이름" },
      },
    },
  ],
  additionalProps: {},
};

import { type BetterAuthEntityDef } from "./types";

/**
 * better-auth API Key 플러그인 엔티티 정의
 * https://www.better-auth.com/docs/plugins/api-key
 *
 * API 키 인증을 지원합니다.
 */
export const apiKeyEntityDef: BetterAuthEntityDef = {
  id: "api-key",
  name: "API Key",
  entities: [
    {
      id: "ApiKey",
      table: "api_keys",
      title: "API 키",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "key", type: "string", desc: "해시된 API 키" },
        { name: "start", type: "string", nullable: true, desc: "키 시작 문자열" },
        { name: "prefix", type: "string", nullable: true, desc: "키 접두사" },
        { name: "name", type: "string", nullable: true, desc: "키 이름" },
        { name: "remaining", type: "integer", nullable: true, desc: "남은 요청 수" },
        { name: "last_request", type: "date", nullable: true, desc: "마지막 요청 시간" },
        { name: "request_count", type: "integer", desc: "요청 횟수" },
        { name: "rate_limit_enabled", type: "boolean", desc: "Rate Limit 활성화 여부" },
        {
          name: "rate_limit_time_window",
          type: "integer",
          nullable: true,
          desc: "Rate Limit 시간 창 (ms)",
        },
        {
          name: "rate_limit_max",
          type: "integer",
          nullable: true,
          desc: "Rate Limit 최대 요청 수",
        },
        { name: "refill_interval", type: "integer", nullable: true, desc: "리필 간격 (ms)" },
        { name: "refill_amount", type: "integer", nullable: true, desc: "리필 양" },
        { name: "last_refill_at", type: "date", nullable: true, desc: "마지막 리필 시간" },
        { name: "expires_at", type: "date", nullable: true, desc: "만료일시" },
        { name: "enabled", type: "boolean", desc: "활성화 여부" },
        { name: "permissions", type: "string", nullable: true, desc: "권한" },
        { name: "metadata", type: "string", nullable: true, desc: "메타데이터 (JSON)" },
        { name: "reference_id", type: "string", desc: "참조 대상 ID" },
        { name: "config_id", type: "string", dbDefault: "'default'", desc: "설정 ID" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        { name: "updated_at", type: "date", nullable: true, desc: "수정일시" },
      ],
      indexes: [
        { type: "index", name: "api_keys_reference_id_idx", columns: [{ name: "reference_id" }] },
        { type: "unique", name: "api_keys_key_unique", columns: [{ name: "key" }] },
      ],
      subsets: {
        A: [
          "id",
          "key",
          "start",
          "prefix",
          "name",
          "remaining",
          "last_request",
          "request_count",
          "rate_limit_enabled",
          "rate_limit_time_window",
          "rate_limit_max",
          "refill_interval",
          "refill_amount",
          "last_refill_at",
          "expires_at",
          "enabled",
          "permissions",
          "metadata",
          "created_at",
          "updated_at",
          "reference_id",
          "config_id",
        ],
      },
      enums: {
        ApiKeyOrderBy: { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" },
        ApiKeySearchField: { id: "ID", name: "이름" },
      },
    },
  ],
  additionalProps: {},
};

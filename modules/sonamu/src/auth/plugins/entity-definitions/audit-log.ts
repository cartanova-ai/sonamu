import { type BetterAuthEntityDef } from "./types";

/**
 * better-auth AuditLog 플러그인 엔티티 정의
 *
 * auth.plugins에 sonamuAuditLog() 추가 시 audit_events 테이블이 사용됩니다.
 * - sonamuAuditLog 플러그인이 Better Auth databaseHooks/organizationHooks/middleware에서 수신한 이벤트를 1건씩 적재합니다.
 * - dedupe_key(sha256 hex)로 중복 적재를 방지합니다.
 *
 * 생성 방법: pnpm sonamu auth generate --plugins audit-log
 */
export const auditLogEntityDef: BetterAuthEntityDef = {
  id: "audit-log",
  name: "AuditLog",
  entities: [
    {
      id: "AuditEvent",
      table: "audit_events",
      title: "감사이벤트",
      props: [
        { name: "id", type: "integer", desc: "ID" },
        { name: "source", type: "string", length: 32, desc: "이벤트 소스" },
        { name: "source_version", type: "string", length: 96, nullable: true, desc: "소스 버전" },
        { name: "category", type: "enum", id: "AuditEventCategory", desc: "카테고리" },
        { name: "event_type", type: "string", length: 64, desc: "이벤트 타입" },
        { name: "event_key", type: "string", length: 191, desc: "이벤트 키" },
        { name: "dedupe_key", type: "string", length: 64, desc: "중복 제거 키" },
        {
          name: "actor_user_id",
          type: "string",
          length: 191,
          nullable: true,
          desc: "액터 사용자 ID",
        },
        {
          name: "subject_user_id",
          type: "string",
          length: 191,
          nullable: true,
          desc: "대상 사용자 ID",
        },
        {
          name: "organization_id",
          type: "string",
          length: 191,
          nullable: true,
          desc: "조직 ID",
        },
        { name: "team_id", type: "string", length: 191, nullable: true, desc: "팀 ID" },
        { name: "session_id", type: "string", length: 191, nullable: true, desc: "세션 ID" },
        { name: "provider_id", type: "string", length: 64, nullable: true, desc: "프로바이더 ID" },
        { name: "login_method", type: "string", length: 64, nullable: true, desc: "로그인 방식" },
        { name: "identifier", type: "string", length: 255, nullable: true, desc: "식별자" },
        { name: "visitor_id", type: "string", length: 191, nullable: true, desc: "방문자 ID" },
        { name: "reason", type: "string", length: 128, nullable: true, desc: "사유" },
        { name: "action", type: "string", length: 64, nullable: true, desc: "액션" },
        {
          name: "trigger_context",
          type: "string",
          length: 64,
          nullable: true,
          desc: "트리거 컨텍스트",
        },
        { name: "ip_address", type: "string", length: 45, nullable: true, desc: "IP 주소" },
        { name: "country_code", type: "string", length: 8, nullable: true, desc: "국가 코드" },
        { name: "country", type: "string", length: 100, nullable: true, desc: "국가" },
        { name: "city", type: "string", length: 100, nullable: true, desc: "도시" },
        { name: "user_agent", type: "string", nullable: true, desc: "User-Agent" },
        { name: "payload_json", type: "json", id: "AuditEventPayload", desc: "원본 payload" },
        { name: "occurred_at", type: "date", desc: "발생 시각" },
        {
          name: "ingested_at",
          type: "date",
          dbDefault: "CURRENT_TIMESTAMP",
          desc: "적재 시각",
        },
      ],
      indexes: [
        {
          type: "unique",
          name: "audit_events_dedupe_key_unique",
          columns: [{ name: "dedupe_key" }],
        },
        {
          type: "index",
          name: "audit_events_occurred_at_index",
          columns: [{ name: "occurred_at" }],
        },
        {
          type: "index",
          name: "audit_events_event_type_occurred_at_index",
          columns: [{ name: "event_type" }, { name: "occurred_at" }],
        },
        {
          type: "index",
          name: "audit_events_subject_user_id_occurred_at_index",
          columns: [{ name: "subject_user_id" }, { name: "occurred_at" }],
        },
        {
          type: "index",
          name: "audit_events_actor_user_id_occurred_at_index",
          columns: [{ name: "actor_user_id" }, { name: "occurred_at" }],
        },
        {
          type: "index",
          name: "audit_events_organization_id_occurred_at_index",
          columns: [{ name: "organization_id" }, { name: "occurred_at" }],
        },
        {
          type: "index",
          name: "audit_events_team_id_occurred_at_index",
          columns: [{ name: "team_id" }, { name: "occurred_at" }],
        },
        {
          type: "index",
          name: "audit_events_session_id_index",
          columns: [{ name: "session_id" }],
        },
        {
          type: "index",
          name: "audit_events_reason_occurred_at_index",
          columns: [{ name: "reason" }, { name: "occurred_at" }],
        },
      ],
      subsets: {
        A: [
          "id",
          "source",
          "source_version",
          "category",
          "event_type",
          "event_key",
          "dedupe_key",
          "actor_user_id",
          "subject_user_id",
          "organization_id",
          "team_id",
          "session_id",
          "provider_id",
          "login_method",
          "identifier",
          "visitor_id",
          "reason",
          "action",
          "trigger_context",
          "ip_address",
          "country_code",
          "country",
          "city",
          "user_agent",
          "payload_json",
          "occurred_at",
          "ingested_at",
        ],
      },
      enums: {
        AuditEventOrderBy: { "id-desc": "ID최신순" },
        AuditEventSearchField: { id: "ID" },
        AuditEventCategory: {
          user: "사용자",
          session: "세션",
          account: "계정",
          verification: "인증",
          organization: "조직",
          security: "보안",
        },
      },
    },
  ],
  additionalProps: {},
};

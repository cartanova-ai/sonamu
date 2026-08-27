import { createHash } from "node:crypto";

import { type Knex } from "knex";

import { isStringValue } from "../utils/runtime-value";
import { getValidClientIp } from "./audit-log/client-ip";
import { type AuditEventData, type AuditLogEvent } from "./audit-log/events";

const AUDIT_EVENT_SOURCE = "better_auth";
const AUDIT_EVENT_SOURCE_VERSION = "better-auth|@better-auth/infra";

const SESSION_EVENT_TYPES = new Set<string>([
  "user_signed_in",
  "user_signed_out",
  "user_sign_in_failed",
  "session_created",
  "session_revoked",
  "all_sessions_revoked",
  "user_impersonated",
  "user_impersonated_stopped",
]);

const ACCOUNT_EVENT_TYPES = new Set<string>([
  "account_linked",
  "account_unlinked",
  "password_changed",

  // @better-auth/infra@0.1.14 기준 EVENT_TYPES 상수에는 정의되어 있으나 실제 trackEvent() 호출이 없는 미구현 이벤트임
  // 향후 버전에서 emit될 경우를 대비해 account로 임시 등록
  "two_factor_enabled",
  "two_factor_disabled",
  "two_factor_verified",
]);

const VERIFICATION_EVENT_TYPES = new Set<string>([
  "email_verification_sent",
  "password_reset_requested",
  "password_reset_completed",
]);

const SECURITY_EVENT_TYPES = new Set<string>([
  "security_blocked",
  "security_allowed",
  "security_challenged",
  "security_stale_account",
]);

const USER_EVENT_TYPES = new Set<string>([
  "user_created",
  "profile_updated",
  "profile_image_updated",
  "email_verified",
  "user_banned",
  "user_unbanned",
  "user_deleted",
]);

function pickString(source: AuditEventData, key: string): string | null {
  const value = source[key];
  return isStringValue(value) ? value : null;
}

function pickFirstString(source: AuditEventData, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = pickString(source, key);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function parseOccurredAt<Value>(raw: Value): Date {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw;
  }
  if (isStringValue(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function classifyCategory(
  eventType: string,
): "user" | "session" | "account" | "verification" | "organization" | "security" {
  if (eventType.startsWith("organization_")) {
    return "organization";
  }
  if (SESSION_EVENT_TYPES.has(eventType)) {
    return "session";
  }
  if (ACCOUNT_EVENT_TYPES.has(eventType)) {
    return "account";
  }
  if (VERIFICATION_EVENT_TYPES.has(eventType)) {
    return "verification";
  }
  if (SECURITY_EVENT_TYPES.has(eventType)) {
    return "security";
  }
  if (USER_EVENT_TYPES.has(eventType)) {
    return "user";
  }
  return "user";
}

function computeDedupeKey(parts: {
  source: string;
  event_type: string;
  event_key: string;
  actor_user_id: string | null;
  subject_user_id: string | null;
  organization_id: string | null;
  team_id: string | null;
  session_id: string | null;
  identifier: string | null;
  reason: string | null;
  action: string | null;
  occurred_at: Date;
}): string {
  const raw = [
    parts.source,
    parts.event_type,
    parts.event_key,
    normalizeNullableKeyPart(parts.actor_user_id),
    normalizeNullableKeyPart(parts.subject_user_id),
    normalizeNullableKeyPart(parts.organization_id),
    normalizeNullableKeyPart(parts.team_id),
    normalizeNullableKeyPart(parts.session_id),
    normalizeNullableKeyPart(parts.identifier),
    normalizeNullableKeyPart(parts.reason),
    normalizeNullableKeyPart(parts.action),
    parts.occurred_at.toISOString(),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function normalizeNullableKeyPart(value: string | null): string {
  return value ?? "";
}

function computeEventIdDedupeKey(source: string, eventId: string): string {
  return createHash("sha256").update(`${source}|${eventId}`).digest("hex");
}

/**
 * sonamuAuditLog 플러그인이 구성한 AuditLogEvent를 audit_events 테이블에 적재합니다.
 * ON CONFLICT (dedupe_key) DO NOTHING으로 중복을 silent 무시합니다.
 * auth.plugins에 sonamuAuditLog() 추가 시 sonamu 내부에서 자동으로 호출됩니다.
 */
export async function ingestAuditEvent(db: Knex, event: AuditLogEvent): Promise<void> {
  const eventData = event.eventData;
  const occurred_at = parseOccurredAt(eventData["occurredAt"]);

  const actor_user_id = pickString(eventData, "triggeredBy");
  const subject_user_id = pickFirstString(eventData, [
    "userId",
    "userid",
    "acceptedById",
    "rejectedById",
  ]);
  const organization_id = pickString(eventData, "organizationId");
  const team_id = pickFirstString(eventData, ["teamId", "inviteeTeamId"]);
  const session_id = pickString(eventData, "sessionId");
  const provider_id = pickString(eventData, "providerId");
  const login_method = pickString(eventData, "loginMethod");
  const identifier = pickFirstString(eventData, [
    "identifier",
    "userEmail",
    "memberEmail",
    "inviteeEmail",
    "acceptedByEmail",
    "rejectedByEmail",
  ]);
  const visitor_id = pickString(eventData, "visitorId");
  const reason = pickFirstString(eventData, ["reason", "banReason"]);
  const action = pickString(eventData, "action");
  const trigger_context = pickString(eventData, "triggerContext");
  const user_agent = pickString(eventData, "userAgent");

  const ip_address = getValidClientIp(event.ipAddress);
  const city = event.city ?? null;
  const country = event.country ?? null;
  const country_code = event.countryCode ?? null;

  const category = classifyCategory(event.eventType);
  const dedupe_key = event.eventId
    ? computeEventIdDedupeKey(AUDIT_EVENT_SOURCE, event.eventId)
    : computeDedupeKey({
        source: AUDIT_EVENT_SOURCE,
        event_type: event.eventType,
        event_key: event.eventKey,
        actor_user_id,
        subject_user_id,
        organization_id,
        team_id,
        session_id,
        identifier,
        reason,
        action,
        occurred_at,
      });

  // ON CONFLICT DO NOTHING: dedupe_key UNIQUE 위반을 silent 무시.
  // try/catch 방식은 PG 커넥션을 aborted 상태로 만드므로 사용하지 않는다.
  const inserted = await db("audit_events")
    .insert({
      source: AUDIT_EVENT_SOURCE,
      source_version: AUDIT_EVENT_SOURCE_VERSION,
      category,
      event_type: event.eventType,
      event_key: event.eventKey,
      dedupe_key,
      actor_user_id,
      subject_user_id,
      organization_id,
      team_id,
      session_id,
      provider_id,
      login_method,
      identifier,
      visitor_id,
      reason,
      action,
      trigger_context,
      ip_address,
      country_code,
      country,
      city,
      user_agent,
      payload_json: eventData,
      occurred_at,
    })
    .onConflict("dedupe_key")
    .ignore()
    .returning("dedupe_key");

  if (inserted.length === 0) {
    return; // silent dedupe
  }
}

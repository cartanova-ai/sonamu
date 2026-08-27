/**
 * sonamuAuditLog 플러그인이 audit-log-ingestor로 전달하는 이벤트 body 타입.
 */
export type AuditEventDataValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | Date
  | AuditEventDataValue[]
  | AuditEventData;

export interface AuditEventData {
  [key: string]: AuditEventDataValue;
}

export type AuditLogEvent = {
  eventType: string;
  eventData: AuditEventData;
  eventKey: string;
  eventId?: string;
  eventDisplayName?: string;
  ipAddress?: string;
  city?: string;
  country?: string;
  countryCode?: string;
};

// dash(@better-auth/infra)의 audit-event 상수 집합을 Sonamu 로컬 적재 경로에 맞게 포팅.
export const EVENT_TYPES = {
  USER_CREATED: "user_created",
  USER_SIGNED_IN: "user_signed_in",
  USER_SIGNED_OUT: "user_signed_out",
  USER_SIGN_IN_FAILED: "user_sign_in_failed",
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_RESET_COMPLETED: "password_reset_completed",
  PASSWORD_CHANGED: "password_changed",
  EMAIL_VERIFICATION_SENT: "email_verification_sent",
  EMAIL_VERIFIED: "email_verified",
  PROFILE_UPDATED: "profile_updated",
  PROFILE_IMAGE_UPDATED: "profile_image_updated",
  SESSION_CREATED: "session_created",
  SESSION_REVOKED: "session_revoked",
  ALL_SESSIONS_REVOKED: "all_sessions_revoked",
  ACCOUNT_LINKED: "account_linked",
  ACCOUNT_UNLINKED: "account_unlinked",
  USER_BANNED: "user_banned",
  USER_UNBANNED: "user_unbanned",
  USER_DELETED: "user_deleted",
  USER_IMPERSONATED: "user_impersonated",
  USER_IMPERSONATED_STOPPED: "user_impersonated_stopped",
} as const;

export const ORGANIZATION_EVENT_TYPES = {
  ORGANIZATION_CREATED: "organization_created",
  ORGANIZATION_UPDATED: "organization_updated",
  ORGANIZATION_MEMBER_ADDED: "organization_member_added",
  ORGANIZATION_MEMBER_REMOVED: "organization_member_removed",
  ORGANIZATION_MEMBER_ROLE_UPDATED: "organization_member_role_updated",
  ORGANIZATION_MEMBER_INVITED: "organization_member_invited",
  ORGANIZATION_MEMBER_INVITE_CANCELED: "organization_member_invite_canceled",
  ORGANIZATION_MEMBER_INVITE_ACCEPTED: "organization_member_invite_accepted",
  ORGANIZATION_MEMBER_INVITE_REJECTED: "organization_member_invite_rejected",
  ORGANIZATION_TEAM_CREATED: "organization_team_created",
  ORGANIZATION_TEAM_UPDATED: "organization_team_updated",
  ORGANIZATION_TEAM_DELETED: "organization_team_deleted",
  ORGANIZATION_TEAM_MEMBER_ADDED: "organization_team_member_added",
  ORGANIZATION_TEAM_MEMBER_REMOVED: "organization_team_member_removed",
} as const;

// dash의 routes 상수 중 우리가 실제 matcher로 쓰는 항목만 포팅.
export const ROUTES = {
  SIGN_IN: "/sign-in",
  SIGN_IN_EMAIL: "/sign-in/email",
  SIGN_IN_EMAIL_OTP: "/sign-in/email-otp",
  SIGN_IN_SOCIAL: "/sign-in/social",
  SIGN_IN_SOCIAL_CALLBACK: "/callback/:id",
  SIGN_IN_OAUTH_CALLBACK: "/oauth2/callback/:id",
  SIGN_UP: "/sign-up",
  SIGN_UP_EMAIL: "/sign-up/email",
  SIGN_OUT: "/sign-out",
  SEND_VERIFICATION_EMAIL: "/send-verification-email",
  UPDATE_USER: "/update-user",
  CHANGE_EMAIL: "/change-email",
  VERIFY_EMAIL: "/verify-email",
  CHANGE_PASSWORD: "/change-password",
  SET_PASSWORD: "/set-password",
  RESET_PASSWORD: "/reset-password",
  REQUEST_PASSWORD_RESET: "/request-password-reset",
  REVOKE_ALL_SESSIONS: "/revoke-sessions",
  DASH_ROUTE: "/dash",
  DASH_UPDATE_USER: "/dash/update-user",
  DASH_REVOKE_SESSIONS_ALL: "/dash/sessions/revoke-all",
  DASH_BAN_USER: "/dash/ban-user",
  DASH_UNBAN_USER: "/dash/unban-user",
  ADMIN_ROUTE: "/admin",
  ADMIN_REVOKE_USER_SESSIONS: "/admin/revoke-user-sessions",
  ADMIN_SET_PASSWORD: "/admin/set-user-password",
  ADMIN_BAN_USER: "/admin/ban-user",
  ADMIN_UNBAN_USER: "/admin/unban-user",
} as const;

export type BuilderTrigger = { triggeredBy: string; triggerContext: string };
export type BuilderLocation = {
  ipAddress?: string;
  city?: string;
  country?: string;
  countryCode?: string;
};

// 빌더에 넘기는 최소 엔티티 shape. better-auth 내부 타입을 그대로 쓰지 않고
// 필요한 필드만 선언하여 핸들러 레이어에서 좁혀서 전달한다.
export type UserSnapshot = {
  id: string;
  name?: string;
  email?: string;
  banned?: boolean;
  banReason?: string | null;
  banExpires?: Date | null;
};
export type SessionSnapshot = {
  id: string;
  userId: string;
  loginMethod?: string | null;
  userAgent?: string | null;
  impersonatedBy?: string | null;
};
export type AccountSnapshot = {
  id: string;
  userId: string;
  providerId: string;
};
export type VerificationSnapshot = {
  id: string;
  value: string;
};
export type OrganizationSnapshot = {
  id: string;
  slug?: string;
  name?: string;
};
export type TeamSnapshot = {
  id: string;
  name?: string;
};
export type MemberSnapshot = {
  id: string;
  userId: string;
  role?: string;
};
export type InvitationSnapshot = {
  id: string;
  email?: string;
  role?: string;
  teamId?: string | null;
};

// 사용자 프로필 보조 (조회 실패 시 null)
export type UserProfileLite = { id: string; name?: string; email?: string } | null;

// 모든 빌더는 pure: input -> AuditLogEvent.
// 비동기 adapter 조회는 hook 레이어에서 수행하고, 조회 결과를 인자로 전달한다.
export type Builder<A extends readonly unknown[]> = (...args: A) => AuditLogEvent;

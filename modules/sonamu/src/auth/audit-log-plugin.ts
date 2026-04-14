import { getLogger } from "@logtape/logtape";
import { type BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import { DB } from "../database/db";
import { ingestAuditEvent } from "./audit-log-ingestor";

/**
 * sonamuAuditLog 플러그인이 audit-log-ingestor로 전달하는 이벤트 body 타입.
 */
export type AuditLogEvent = {
  eventType: string;
  eventData: Record<string, unknown>;
  eventKey: string;
  eventDisplayName?: string;
  ipAddress?: string;
  city?: string;
  country?: string;
  countryCode?: string;
};

// ============================================================================
// 이벤트 타입 상수
// dash(@better-auth/infra)의 audit-event 상수 집합을 Sonamu 로컬 적재 경로에 맞게 포팅.
// ============================================================================
const EVENT_TYPES = {
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

const ORGANIZATION_EVENT_TYPES = {
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
const ROUTES = {
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

// ============================================================================
// 빌더 공용 타입
// ============================================================================
type BuilderTrigger = { triggeredBy: string; triggerContext: string };
type BuilderLocation = {
  ipAddress?: string;
  city?: string;
  country?: string;
  countryCode?: string;
};

// 빌더에 넘기는 최소 엔티티 shape. better-auth 내부 타입을 그대로 쓰지 않고
// 필요한 필드만 선언하여 핸들러 레이어에서 좁혀서 전달한다.
type UserSnapshot = {
  id: string;
  name?: string;
  email?: string;
  banned?: boolean;
  banReason?: string | null;
  banExpires?: Date | null;
};
type SessionSnapshot = {
  id: string;
  userId: string;
  loginMethod?: string | null;
  userAgent?: string | null;
  impersonatedBy?: string | null;
};
type AccountSnapshot = {
  id: string;
  userId: string;
  providerId: string;
};
type VerificationSnapshot = {
  id: string;
  value: string;
};
type OrganizationSnapshot = {
  id: string;
  slug?: string;
  name?: string;
};
type TeamSnapshot = {
  id: string;
  name?: string;
};
type MemberSnapshot = {
  id: string;
  userId: string;
  role?: string;
};
type InvitationSnapshot = {
  id: string;
  email?: string;
  role?: string;
  teamId?: string | null;
};

// 사용자 프로필 보조 (조회 실패 시 null)
type UserProfileLite = { id: string; name?: string; email?: string } | null;

// 모든 빌더는 pure: input -> AuditLogEvent.
// 비동기 adapter 조회는 hook 레이어에서 수행하고, 조회 결과를 인자로 전달한다.
type Builder<A extends readonly unknown[]> = (...args: A) => AuditLogEvent;

// ============================================================================
// Account 빌더
// ============================================================================
export type AccountEventBuilders = {
  trackAccountLinking: Builder<
    [AccountSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackAccountUnlink: Builder<
    [AccountSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackAccountPasswordChange: Builder<
    [AccountSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
};

const buildAccountEvents = (): AccountEventBuilders => ({
  trackAccountLinking: (account, user, trigger, location) => ({
    eventKey: account.userId,
    eventType: EVENT_TYPES.ACCOUNT_LINKED,
    eventDisplayName: `Linked ${account.providerId} account`,
    eventData: {
      userId: account.userId,
      userEmail: user?.email ?? "unknown",
      userName: user?.name ?? "unknown",
      accountId: account.id,
      providerId: account.providerId,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackAccountUnlink: (account, user, trigger, location) => ({
    eventKey: account.userId,
    eventType: EVENT_TYPES.ACCOUNT_UNLINKED,
    eventDisplayName: `Unlinked ${account.providerId} account`,
    eventData: {
      userId: account.userId,
      userEmail: user?.email ?? "unknown",
      userName: user?.name ?? "unknown",
      accountId: account.id,
      providerId: account.providerId,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackAccountPasswordChange: (account, user, trigger, location) => ({
    eventKey: account.userId,
    eventType: EVENT_TYPES.PASSWORD_CHANGED,
    eventDisplayName: "Password changed",
    eventData: {
      userId: account.userId,
      userEmail: user?.email ?? "unknown",
      userName: user?.name ?? "unknown",
      accountId: account.id,
      providerId: account.providerId,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
});

// ============================================================================
// Session 빌더
// ============================================================================
export type SessionEventBuilders = {
  trackUserSignedIn: Builder<
    [SessionSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackUserSignedOut: Builder<
    [SessionSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackSessionCreated: Builder<
    [SessionSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackSessionRevoked: Builder<
    [SessionSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackSessionRevokedAll: Builder<[SessionSnapshot, UserProfileLite, BuilderTrigger]>;
  trackUserImpersonated: Builder<
    [SessionSnapshot, UserProfileLite, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackUserImpersonationStop: Builder<
    [SessionSnapshot, UserProfileLite, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackEmailVerificationSent: Builder<
    [SessionSnapshot, { name?: string; email?: string }, BuilderTrigger]
  >;
  trackEmailSignInAttempt: Builder<
    [
      { email: string; loginMethod: string | null },
      UserProfileLite,
      BuilderTrigger,
      BuilderLocation | undefined,
    ]
  >;
  trackSocialSignInAttempt: Builder<
    [{ loginMethod: string | null }, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackSocialSignInRedirectionAttempt: Builder<
    [{ loginMethod: string | null }, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
};

const buildSessionEvents = (): SessionEventBuilders => ({
  trackUserSignedIn: (session, user, trigger, location) => {
    const loginMethod = session.loginMethod ?? "unknown";
    return {
      eventKey: session.userId,
      eventType: EVENT_TYPES.USER_SIGNED_IN,
      eventDisplayName: `Signed in via ${loginMethod}`,
      eventData: {
        userId: session.userId,
        userName: user?.name ?? "unknown",
        userEmail: user?.email ?? "unknown",
        sessionId: session.id,
        loginMethod,
        userAgent: session.userAgent,
        triggeredBy: trigger.triggeredBy,
        triggerContext: trigger.triggerContext,
      },
      ipAddress: location?.ipAddress,
      city: location?.city,
      country: location?.country,
      countryCode: location?.countryCode,
    };
  },
  trackUserSignedOut: (session, user, trigger, location) => {
    const loginMethod = session.loginMethod ?? "unknown";
    return {
      eventKey: session.userId,
      eventType: EVENT_TYPES.USER_SIGNED_OUT,
      eventDisplayName: "User signed out",
      eventData: {
        userId: session.userId,
        userName: user?.name ?? "unknown",
        userEmail: user?.email ?? "unknown",
        sessionId: session.id,
        loginMethod,
        userAgent: session.userAgent,
        triggeredBy: trigger.triggeredBy,
        triggerContext: trigger.triggerContext,
      },
      ipAddress: location?.ipAddress,
      city: location?.city,
      country: location?.country,
      countryCode: location?.countryCode,
    };
  },
  trackSessionCreated: (session, user, trigger, location) => {
    const loginMethod = session.loginMethod ?? "unknown";
    return {
      eventKey: session.userId,
      eventType: EVENT_TYPES.SESSION_CREATED,
      eventDisplayName: "Session created",
      eventData: {
        userId: session.userId,
        userName: user?.name ?? "unknown",
        userEmail: user?.email ?? "unknown",
        sessionId: session.id,
        loginMethod,
        userAgent: session.userAgent,
        triggeredBy: trigger.triggeredBy,
        triggerContext: trigger.triggerContext,
      },
      ipAddress: location?.ipAddress,
      city: location?.city,
      country: location?.country,
      countryCode: location?.countryCode,
    };
  },
  trackSessionRevoked: (session, user, trigger, location) => {
    const loginMethod = session.loginMethod ?? "unknown";
    return {
      eventKey: session.userId,
      eventType: EVENT_TYPES.SESSION_REVOKED,
      eventDisplayName: "Session revoked",
      eventData: {
        userId: session.userId,
        userName: user?.name ?? "unknown",
        userEmail: user?.email ?? "unknown",
        sessionId: session.id,
        loginMethod,
        userAgent: session.userAgent,
        triggeredBy: trigger.triggeredBy,
        triggerContext: trigger.triggerContext,
      },
      ipAddress: location?.ipAddress,
      city: location?.city,
      country: location?.country,
      countryCode: location?.countryCode,
    };
  },
  trackSessionRevokedAll: (session, user, trigger) => ({
    eventKey: session.userId,
    eventType: EVENT_TYPES.ALL_SESSIONS_REVOKED,
    eventDisplayName: "All sessions revoked",
    eventData: {
      userId: session.userId,
      userName: user?.name ?? "unknown",
      userEmail: user?.email ?? "unknown",
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackUserImpersonated: (session, user, impersonator, trigger, location) => {
    const loginMethod = session.loginMethod ?? "unknown";
    return {
      eventKey: session.userId,
      eventType: EVENT_TYPES.USER_IMPERSONATED,
      eventDisplayName: "User impersonated",
      eventData: {
        userId: session.userId,
        userName: user?.name ?? "unknown",
        userEmail: user?.email ?? "unknown",
        sessionId: session.id,
        loginMethod,
        userAgent: session.userAgent,
        impersonatedBy: impersonator?.name ?? impersonator?.email ?? session.impersonatedBy,
        impersonatedById: session.impersonatedBy,
        triggeredBy: trigger.triggeredBy,
        triggerContext: trigger.triggerContext,
      },
      ipAddress: location?.ipAddress,
      city: location?.city,
      country: location?.country,
      countryCode: location?.countryCode,
    };
  },
  trackUserImpersonationStop: (session, user, impersonator, trigger, location) => {
    const loginMethod = session.loginMethod ?? "unknown";
    return {
      eventKey: session.userId,
      eventType: EVENT_TYPES.USER_IMPERSONATED_STOPPED,
      eventDisplayName: "User impersonation stopped",
      eventData: {
        userId: session.userId,
        userName: user?.name ?? "unknown",
        userEmail: user?.email ?? "unknown",
        sessionId: session.id,
        loginMethod,
        userAgent: session.userAgent,
        impersonatedBy: impersonator?.name ?? impersonator?.email ?? session.impersonatedBy,
        impersonatedById: session.impersonatedBy,
        triggeredBy: trigger.triggeredBy,
        triggerContext: trigger.triggerContext,
      },
      ipAddress: location?.ipAddress,
      city: location?.city,
      country: location?.country,
      countryCode: location?.countryCode,
    };
  },
  trackEmailVerificationSent: (session, user, trigger) => ({
    eventKey: session.userId,
    eventType: EVENT_TYPES.EMAIL_VERIFICATION_SENT,
    eventDisplayName: "Verification email sent",
    eventData: {
      userId: session.userId,
      userName: user.name,
      userEmail: user.email,
      sessionId: session.id,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackEmailSignInAttempt: (attempt, user, trigger, location) => ({
    eventKey: user?.id ?? "unknown",
    eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
    eventDisplayName: "User sign-in attempt failed",
    eventData: {
      userId: user?.id ?? "unknown",
      nameName: user?.name ?? "unknown",
      userEmail: attempt.email,
      loginMethod: attempt.loginMethod,
      triggeredBy: user?.id ?? trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackSocialSignInAttempt: (attempt, user, trigger, location) => ({
    eventKey: user?.id ?? "unknown",
    eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
    eventDisplayName: "User sign-in attempt failed",
    eventData: {
      userId: user?.id ?? "unknown",
      userName: user?.name ?? "unknown",
      userEmail: user?.email ?? "unknown",
      loginMethod: attempt.loginMethod,
      triggeredBy: user?.id ?? trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackSocialSignInRedirectionAttempt: (attempt, user, trigger, location) => ({
    eventKey: user?.id ?? "unknown",
    eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
    eventDisplayName: "User sign-in attempt failed",
    eventData: {
      userId: user?.id ?? "unknown",
      userName: user?.name ?? "unknown",
      userEmail: user?.id ?? "unknown",
      loginMethod: attempt.loginMethod,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
});

// ============================================================================
// User 빌더
// ============================================================================
export type UserEventBuilders = {
  trackUserSignedUp: Builder<[UserSnapshot, BuilderTrigger, BuilderLocation | undefined]>;
  trackUserDeleted: Builder<[UserSnapshot, BuilderTrigger, BuilderLocation | undefined]>;
  trackUserProfileUpdated: Builder<
    [UserSnapshot, string[], BuilderTrigger, BuilderLocation | undefined]
  >;
  trackUserProfileImageUpdated: Builder<
    [UserSnapshot, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackUserBanned: Builder<[UserSnapshot, BuilderTrigger, BuilderLocation | undefined]>;
  trackUserUnBanned: Builder<[UserSnapshot, BuilderTrigger, BuilderLocation | undefined]>;
  trackUserEmailVerified: Builder<[UserSnapshot, BuilderTrigger, BuilderLocation | undefined]>;
};

const buildUserEvents = (): UserEventBuilders => ({
  trackUserSignedUp: (user, trigger, location) => ({
    eventKey: user.id,
    eventType: EVENT_TYPES.USER_CREATED,
    eventDisplayName: `${user.name || user.email} signed up`,
    eventData: {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackUserDeleted: (user, trigger, location) => ({
    eventKey: user.id,
    eventType: EVENT_TYPES.USER_DELETED,
    eventDisplayName: "User deleted",
    eventData: {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackUserProfileUpdated: (user, updatedFields, trigger, location) => ({
    eventKey: user.id,
    eventType: EVENT_TYPES.PROFILE_UPDATED,
    eventDisplayName: "Profile updated",
    eventData: {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      updatedFields,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackUserProfileImageUpdated: (user, trigger, location) => ({
    eventKey: user.id,
    eventType: EVENT_TYPES.PROFILE_IMAGE_UPDATED,
    eventDisplayName: "Profile image updated",
    eventData: {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackUserBanned: (user, trigger, location) => {
    const reasonSuffix = user.banReason ? `: ${user.banReason}` : "";
    const expiresSuffix = user.banExpires ? ` (until ${user.banExpires.toISOString()})` : "";
    return {
      eventKey: user.id,
      eventType: EVENT_TYPES.USER_BANNED,
      eventDisplayName: `User banned${reasonSuffix}${expiresSuffix}`,
      eventData: {
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        triggeredBy: trigger.triggeredBy,
        triggerContext: trigger.triggerContext,
      },
      ipAddress: location?.ipAddress,
      city: location?.city,
      country: location?.country,
      countryCode: location?.countryCode,
    };
  },
  trackUserUnBanned: (user, trigger, location) => ({
    eventKey: user.id,
    eventType: EVENT_TYPES.USER_UNBANNED,
    eventDisplayName: "User unbanned",
    eventData: {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      banned: user.banned,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackUserEmailVerified: (user, trigger, location) => ({
    eventKey: user.id,
    eventType: EVENT_TYPES.EMAIL_VERIFIED,
    eventDisplayName: "Email verified",
    eventData: {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
});

// ============================================================================
// Verification 빌더
// ============================================================================
export type VerificationEventBuilders = {
  trackPasswordResetRequest: Builder<
    [VerificationSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
  trackPasswordResetRequestCompletion: Builder<
    [VerificationSnapshot, UserProfileLite, BuilderTrigger, BuilderLocation | undefined]
  >;
};

const buildVerificationEvents = (): VerificationEventBuilders => ({
  trackPasswordResetRequest: (verification, user, trigger, location) => ({
    eventKey: verification.value,
    eventType: EVENT_TYPES.PASSWORD_RESET_REQUESTED,
    eventDisplayName: "Password reset requested",
    eventData: {
      userId: verification.value,
      userName: user?.name ?? "unknown",
      userEmail: user?.email ?? "unknown",
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
  trackPasswordResetRequestCompletion: (verification, user, trigger, location) => ({
    eventKey: verification.value,
    eventType: EVENT_TYPES.PASSWORD_RESET_COMPLETED,
    eventDisplayName: "Password reset completed",
    eventData: {
      userId: verification.value,
      userName: user?.name ?? "unknown",
      userEmail: user?.email ?? "unknown",
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
    ipAddress: location?.ipAddress,
    city: location?.city,
    country: location?.country,
    countryCode: location?.countryCode,
  }),
});

// ============================================================================
// Organization / Team / Member / Invitation 빌더
// ============================================================================
export type OrganizationEventBuilders = {
  trackOrganizationCreated: Builder<[OrganizationSnapshot, BuilderTrigger]>;
  trackOrganizationUpdated: Builder<[OrganizationSnapshot, BuilderTrigger]>;
};

const buildOrganizationEvents = (): OrganizationEventBuilders => ({
  trackOrganizationCreated: (organization, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_CREATED,
    eventDisplayName: "Organization Created",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationUpdated: (organization, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_UPDATED,
    eventDisplayName: "Organization Updated",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
});

export type TeamEventBuilders = {
  trackOrganizationTeamCreated: Builder<[OrganizationSnapshot, TeamSnapshot, BuilderTrigger]>;
  trackOrganizationTeamUpdated: Builder<[OrganizationSnapshot, TeamSnapshot, BuilderTrigger]>;
  trackOrganizationTeamDeleted: Builder<[OrganizationSnapshot, TeamSnapshot, BuilderTrigger]>;
  trackOrganizationTeamMemberAdded: Builder<
    [
      OrganizationSnapshot,
      TeamSnapshot,
      UserSnapshot,
      { teamId: string; userId: string },
      BuilderTrigger,
    ]
  >;
  trackOrganizationTeamMemberRemoved: Builder<
    [
      OrganizationSnapshot,
      TeamSnapshot,
      UserSnapshot,
      { teamId: string; userId: string },
      BuilderTrigger,
    ]
  >;
};

const buildTeamEvents = (): TeamEventBuilders => ({
  trackOrganizationTeamCreated: (organization, team, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_CREATED,
    eventDisplayName: "Organization team created",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      teamId: team.id,
      teamName: team.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationTeamUpdated: (organization, team, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_UPDATED,
    eventDisplayName: "Organization team updated",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      teamId: team.id,
      teamName: team.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationTeamDeleted: (organization, team, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_DELETED,
    eventDisplayName: "Organization team deleted",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      teamId: team.id,
      teamName: team.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationTeamMemberAdded: (organization, team, user, teamMember, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_MEMBER_ADDED,
    eventDisplayName: "User added to organization team",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      teamId: teamMember.teamId,
      teamName: team.name,
      userid: teamMember.userId,
      memberName: user.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationTeamMemberRemoved: (organization, team, user, teamMember, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_MEMBER_REMOVED,
    eventDisplayName: "User removed from organization team",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      teamId: teamMember.teamId,
      teamName: team.name,
      userid: teamMember.userId,
      memberName: user.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
});

export type MemberEventBuilders = {
  trackOrganizationMemberAdded: Builder<
    [OrganizationSnapshot, MemberSnapshot, UserSnapshot, BuilderTrigger]
  >;
  trackOrganizationMemberRemoved: Builder<
    [OrganizationSnapshot, MemberSnapshot, UserSnapshot, BuilderTrigger]
  >;
  trackOrganizationMemberRoleUpdated: Builder<
    [OrganizationSnapshot, MemberSnapshot, UserSnapshot, string, BuilderTrigger]
  >;
};

const buildMemberEvents = (): MemberEventBuilders => ({
  trackOrganizationMemberAdded: (organization, member, user, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_ADDED,
    eventDisplayName: "Member added to organization",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      userId: member.userId,
      memberName: user.name,
      role: member.role,
      memberId: member.id,
      memberEmail: user.email,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationMemberRemoved: (organization, member, user, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_REMOVED,
    eventDisplayName: "Member removed from organization",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      userId: member.userId,
      memberName: user.name,
      role: member.role,
      memberId: member.id,
      memberEmail: user.email,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationMemberRoleUpdated: (organization, member, user, previousRole, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_ROLE_UPDATED,
    eventDisplayName: "Organization member role updated",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      userId: member.userId,
      memberName: user.name,
      newRole: member.role,
      oldRole: previousRole,
      memberId: member.id,
      memberEmail: user.email,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
});

export type InvitationEventBuilders = {
  trackOrganizationMemberInvited: Builder<
    [OrganizationSnapshot, InvitationSnapshot, UserSnapshot, BuilderTrigger]
  >;
  trackOrganizationMemberInviteAccepted: Builder<
    [OrganizationSnapshot, InvitationSnapshot, MemberSnapshot, UserSnapshot, BuilderTrigger]
  >;
  trackOrganizationMemberInviteRejected: Builder<
    [OrganizationSnapshot, InvitationSnapshot, UserSnapshot, BuilderTrigger]
  >;
  trackOrganizationMemberInviteCanceled: Builder<
    [OrganizationSnapshot, InvitationSnapshot, UserSnapshot, BuilderTrigger]
  >;
};

const buildInvitationEvents = (): InvitationEventBuilders => ({
  trackOrganizationMemberInvited: (organization, invitation, inviter, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITED,
    eventDisplayName: "User invited to organization",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      inviteeId: invitation.id,
      inviteeEmail: invitation.email,
      inviteeRole: invitation.role,
      inviteeTeamId: invitation.teamId,
      inviterId: inviter.id,
      inviterName: inviter.name,
      inviterEmail: inviter.email,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationMemberInviteAccepted: (
    organization,
    invitation,
    member,
    acceptedBy,
    trigger,
  ) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_ACCEPTED,
    eventDisplayName: "User accepted invite organization invite",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      inviteeId: invitation.id,
      inviteeEmail: invitation.email,
      inviteeRole: invitation.role,
      inviteeTeamId: invitation.teamId,
      acceptedById: acceptedBy.id,
      acceptedByEmail: acceptedBy.email,
      acceptedByName: acceptedBy.name,
      memberId: member.id,
      memberRole: member.role,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationMemberInviteRejected: (organization, invitation, rejectedBy, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_REJECTED,
    eventDisplayName: "User rejected organization invite",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      inviteeId: invitation.id,
      inviteeEmail: invitation.email,
      inviteeRole: invitation.role,
      inviteeTeamId: invitation.teamId,
      rejectedById: rejectedBy.id,
      rejectedByEmail: rejectedBy.email,
      rejectedByName: rejectedBy.name,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
  trackOrganizationMemberInviteCanceled: (organization, invitation, cancelledBy, trigger) => ({
    eventKey: organization.id,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_CANCELED,
    eventDisplayName: "Organization invite cancelled",
    eventData: {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      inviteeId: invitation.id,
      inviteeEmail: invitation.email,
      inviteeRole: invitation.role,
      inviteeTeamId: invitation.teamId,
      cancelledById: cancelledBy.id,
      cancelledByName: cancelledBy.name,
      cancelledByEmail: cancelledBy.email,
      triggeredBy: trigger.triggeredBy,
      triggerContext: trigger.triggerContext,
    },
  }),
});

// TODO(security): sonamu.config의 security 옵션이 도입되면
// SecurityEventBuilders (trackSecurityBlocked/Allowed/Challenged/StaleAccount) 섹션을 추가한다.
// dash의 createSecurityClient/onSecurityEvent 구현은 현재 scope out (R1).

export type AuditEventBuilderCatalog = {
  account: AccountEventBuilders;
  session: SessionEventBuilders;
  user: UserEventBuilders;
  verification: VerificationEventBuilders;
  organization: OrganizationEventBuilders;
  team: TeamEventBuilders;
  member: MemberEventBuilders;
  invitation: InvitationEventBuilders;
};

export const buildAuditEventCatalog = (): AuditEventBuilderCatalog => ({
  account: buildAccountEvents(),
  session: buildSessionEvents(),
  user: buildUserEvents(),
  verification: buildVerificationEvents(),
  organization: buildOrganizationEvents(),
  team: buildTeamEvents(),
  member: buildMemberEvents(),
  invitation: buildInvitationEvents(),
});

// ============================================================================
// 라우팅/트리거 유틸
// ============================================================================
const stripQuery = (value: string): string => value.split("?")[0] || value;
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const routeToRegex = (route: string): RegExp => {
  const pattern = escapeRegex(stripQuery(route)).replace(/\/:([^/]+)/g, "/[^/]+");
  return new RegExp(`${pattern}(?:$|[/?])`);
};
const matchesAnyRoute = (routePath: string | undefined, routes: readonly string[]): boolean => {
  if (!routePath) return false;
  const cleanPath = stripQuery(routePath);
  return routes.some((route) => routeToRegex(route).test(cleanPath));
};

const LOGIN_PATHS = [
  ROUTES.SIGN_IN_SOCIAL_CALLBACK,
  ROUTES.SIGN_IN_OAUTH_CALLBACK,
  ROUTES.SIGN_IN_EMAIL,
  ROUTES.SIGN_IN_SOCIAL,
  ROUTES.SIGN_IN_EMAIL_OTP,
  ROUTES.SIGN_UP_EMAIL,
] as const;

// dash 319-323 미러: 현재 요청 path에서 로그인 방식을 추출한다.
const getLoginMethod = (ctxPath: string | undefined, paramsId?: string): string | null => {
  if (!ctxPath) return null;
  if (matchesAnyRoute(ctxPath, LOGIN_PATHS)) {
    if (paramsId) return paramsId;
    return ctxPath.split("/").pop() ?? null;
  }
  return null;
};

// dash 797-803 미러: 세션/요청에서 트리거 주체와 컨텍스트를 도출한다.
const getTriggerInfo = (
  ctxPath: string | undefined,
  sessionUserId: string | null,
  userId: string,
): BuilderTrigger => {
  const resolved = sessionUserId ?? userId;
  const triggerContext =
    resolved === userId
      ? "user"
      : matchesAnyRoute(ctxPath, [ROUTES.ADMIN_ROUTE])
        ? "admin"
        : matchesAnyRoute(ctxPath, [ROUTES.DASH_ROUTE])
          ? "dashboard"
          : resolved === "unknown"
            ? "user"
            : "unknown";
  return { triggeredBy: resolved, triggerContext };
};

// dash 809-814 미러: organization hook은 인증 컨텍스트 없이도 호출되므로
// 주어진 user 객체로부터 트리거 정보를 합성한다.
const getOrganizationTriggerInfo = (user: { id?: string } | null | undefined): BuilderTrigger => ({
  triggeredBy: user?.id ?? "unknown",
  triggerContext: "organization",
});

// ============================================================================
// better-auth ctx 타입 helpers (내부 shape은 런타임 구조를 기준으로 좁혀 사용한다)
// ============================================================================
type BetterAuthRequestCtx = {
  path?: string;
  body?: Record<string, unknown> | null | undefined;
  params?: Record<string, string | undefined> | null | undefined;
  context: {
    session?: {
      session?: { userId?: string };
      user?: { id?: string };
    } | null;
    location?: BuilderLocation | null;
    adapter?: {
      findOne: (args: {
        model: string;
        select?: string[];
        where: { field: string; value: unknown }[];
      }) => Promise<Record<string, unknown> | null>;
    };
    returned?: unknown;
  };
};

// adapter.findOne 호출 실패 시 null을 반환한다. dash 헬퍼와 동일 정책.
const fetchUserById = async (
  ctx: BetterAuthRequestCtx,
  userId: string | null | undefined,
): Promise<UserProfileLite> => {
  if (!userId) return null;
  const adapter = ctx.context.adapter;
  if (!adapter) return null;
  try {
    const row = await adapter.findOne({
      model: "user",
      select: ["id", "name", "email"],
      where: [{ field: "id", value: userId }],
    });
    if (!row) return null;
    return {
      id: String(row.id),
      name: typeof row.name === "string" ? row.name : undefined,
      email: typeof row.email === "string" ? row.email : undefined,
    };
  } catch {
    return null;
  }
};

const fetchUserByEmail = async (
  ctx: BetterAuthRequestCtx,
  email: string | null | undefined,
): Promise<UserProfileLite> => {
  if (!email) return null;
  const adapter = ctx.context.adapter;
  if (!adapter) return null;
  try {
    const row = await adapter.findOne({
      model: "user",
      select: ["id", "name", "email"],
      where: [{ field: "email", value: email }],
    });
    if (!row) return null;
    return {
      id: String(row.id),
      name: typeof row.name === "string" ? row.name : undefined,
      email: typeof row.email === "string" ? row.email : undefined,
    };
  } catch {
    return null;
  }
};

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

// databaseHooks after 콜백의 ctx는 선택적이며 shape을 런타임에서 좁힌다.
const narrowRequestCtx = (raw: unknown): BetterAuthRequestCtx | null => {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { context?: unknown };
  if (!candidate.context || typeof candidate.context !== "object") return null;
  return raw as BetterAuthRequestCtx;
};

// dash 제거 시 함께 사라진 location 공급 경로를 대체한다.
// 우선순위: cf-connecting-ip > x-forwarded-for(첫 항목) > x-real-ip > x-vercel-forwarded-for
// (sonamu.ts IP_HEADERS 상수와 동일)
const IP_HEADER_ORDER = [
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
] as const;

const readHeader = (headers: unknown, key: string): string | null => {
  if (!headers) return null;
  if (headers instanceof Headers) {
    return headers.get(key);
  }
  if (typeof headers === "object") {
    const map = headers as Record<string, unknown>;
    const v = map[key] ?? map[key.toLowerCase()];
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return null;
};

const extractLocationFromHeaders = (headers: unknown): BuilderLocation => {
  let ipAddress: string | null = null;
  for (const key of IP_HEADER_ORDER) {
    const raw = readHeader(headers, key);
    if (typeof raw === "string" && raw.length > 0) {
      const first = raw.split(",")[0]?.trim();
      if (first) {
        ipAddress = first;
        break;
      }
    }
  }
  const countryCode = readHeader(headers, "cf-ipcountry");
  const city = readHeader(headers, "cf-ipcity");
  return {
    ipAddress: ipAddress ?? undefined,
    city: city ?? undefined,
    country: undefined,
    countryCode: countryCode ?? undefined,
  };
};

// ============================================================================
// Plugin entry
// ============================================================================
/**
 * Better Auth databaseHooks/organizationHooks/middleware에서 수집한
 * 이벤트를 `DB.getDB("w")`로 얻은 knex에 `ingestAuditEvent`로 적재한다.
 *
 * - dash(@better-auth/infra)의 audit-event 수집 훅 구조를 참고해 Sonamu 내부 적재 경로로 포팅한다.
 * - dash의 infra 연결/API endpoint 제공 범위는 포함하지 않고, audit-event emit/ingest 경로만 유지한다.
 * - security 4종은 R1 결정에 따라 scope out (위의 TODO 주석 참조).
 */
export function sonamuAuditLog(): BetterAuthPlugin {
  const logger = getLogger(["sonamu", "audit-log"]);
  const catalog = buildAuditEventCatalog();

  // dash 7394: 동일 요청에서 세션 벌크 삭제가 다회 발생할 때 all_sessions_revoked를
  // 한 번만 emit하도록 처리 컨텍스트를 기억한다.
  const processedBulkOperationContexts = new WeakSet<object>();

  const emit = async (event: AuditLogEvent): Promise<void> => {
    try {
      await ingestAuditEvent(DB.getDB("w"), event);
    } catch (err) {
      logger.error("audit event ingest failed: {error}", { error: err });
    }
  };

  return {
    id: "sonamu-audit-log",

    init(pluginCtx: unknown) {
      // organization 플러그인이 활성화된 경우에 한해 organizationHooks를 합성한다.
      // (dash 7192-7281)
      const getPlugin = (pluginCtx as { getPlugin?: (id: string) => unknown })?.getPlugin;
      const organizationPlugin =
        typeof getPlugin === "function" ? getPlugin.call(pluginCtx, "organization") : null;

      if (organizationPlugin && typeof organizationPlugin === "object") {
        const orgPlugin = organizationPlugin as {
          options?: { organizationHooks?: Record<string, unknown> };
        };
        orgPlugin.options = orgPlugin.options ?? {};
        const organizationHooks = (orgPlugin.options.organizationHooks =
          orgPlugin.options.organizationHooks ?? {});

        // afterCreateOrganization
        const prevAfterCreateOrganization = organizationHooks.afterCreateOrganization as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterCreateOrganization = async (
          ...args: unknown[]
        ): Promise<unknown> => {
          const [payload] = args as [{ organization: OrganizationSnapshot; user: UserSnapshot }];
          await emit(
            catalog.organization.trackOrganizationCreated(
              payload.organization,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterCreateOrganization) return prevAfterCreateOrganization(...args);
          return undefined;
        };

        // afterUpdateOrganization
        const prevAfterUpdateOrganization = organizationHooks.afterUpdateOrganization as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterUpdateOrganization = async (
          ...args: unknown[]
        ): Promise<unknown> => {
          const [payload] = args as [{ organization?: OrganizationSnapshot; user: UserSnapshot }];
          if (payload.organization) {
            await emit(
              catalog.organization.trackOrganizationUpdated(
                payload.organization,
                getOrganizationTriggerInfo(payload.user),
              ),
            );
          }
          if (prevAfterUpdateOrganization) return prevAfterUpdateOrganization(...args);
          return undefined;
        };

        // afterAddMember
        const prevAfterAddMember = organizationHooks.afterAddMember as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterAddMember = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              member: MemberSnapshot;
              user: UserSnapshot;
            },
          ];
          await emit(
            catalog.member.trackOrganizationMemberAdded(
              payload.organization,
              payload.member,
              payload.user,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterAddMember) return prevAfterAddMember(...args);
          return undefined;
        };

        // afterRemoveMember
        const prevAfterRemoveMember = organizationHooks.afterRemoveMember as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterRemoveMember = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              member: MemberSnapshot;
              user: UserSnapshot;
            },
          ];
          await emit(
            catalog.member.trackOrganizationMemberRemoved(
              payload.organization,
              payload.member,
              payload.user,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterRemoveMember) return prevAfterRemoveMember(...args);
          return undefined;
        };

        // afterUpdateMemberRole
        const prevAfterUpdateMemberRole = organizationHooks.afterUpdateMemberRole as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterUpdateMemberRole = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              member: MemberSnapshot;
              user: UserSnapshot;
              previousRole: string;
            },
          ];
          await emit(
            catalog.member.trackOrganizationMemberRoleUpdated(
              payload.organization,
              payload.member,
              payload.user,
              payload.previousRole,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterUpdateMemberRole) return prevAfterUpdateMemberRole(...args);
          return undefined;
        };

        // afterCreateInvitation
        const prevAfterCreateInvitation = organizationHooks.afterCreateInvitation as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterCreateInvitation = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              invitation: InvitationSnapshot;
              inviter: UserSnapshot;
            },
          ];
          await emit(
            catalog.invitation.trackOrganizationMemberInvited(
              payload.organization,
              payload.invitation,
              payload.inviter,
              getOrganizationTriggerInfo(payload.inviter),
            ),
          );
          if (prevAfterCreateInvitation) return prevAfterCreateInvitation(...args);
          return undefined;
        };

        // afterAcceptInvitation
        const prevAfterAcceptInvitation = organizationHooks.afterAcceptInvitation as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterAcceptInvitation = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              invitation: InvitationSnapshot;
              member: MemberSnapshot;
              user: UserSnapshot;
            },
          ];
          await emit(
            catalog.invitation.trackOrganizationMemberInviteAccepted(
              payload.organization,
              payload.invitation,
              payload.member,
              payload.user,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterAcceptInvitation) return prevAfterAcceptInvitation(...args);
          return undefined;
        };

        // afterRejectInvitation
        const prevAfterRejectInvitation = organizationHooks.afterRejectInvitation as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterRejectInvitation = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              invitation: InvitationSnapshot;
              user: UserSnapshot;
            },
          ];
          await emit(
            catalog.invitation.trackOrganizationMemberInviteRejected(
              payload.organization,
              payload.invitation,
              payload.user,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterRejectInvitation) return prevAfterRejectInvitation(...args);
          return undefined;
        };

        // afterCancelInvitation
        const prevAfterCancelInvitation = organizationHooks.afterCancelInvitation as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterCancelInvitation = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              invitation: InvitationSnapshot;
              cancelledBy: UserSnapshot;
            },
          ];
          await emit(
            catalog.invitation.trackOrganizationMemberInviteCanceled(
              payload.organization,
              payload.invitation,
              payload.cancelledBy,
              getOrganizationTriggerInfo(payload.cancelledBy),
            ),
          );
          if (prevAfterCancelInvitation) return prevAfterCancelInvitation(...args);
          return undefined;
        };

        // afterCreateTeam
        const prevAfterCreateTeam = organizationHooks.afterCreateTeam as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterCreateTeam = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            { organization: OrganizationSnapshot; team: TeamSnapshot; user: UserSnapshot },
          ];
          await emit(
            catalog.team.trackOrganizationTeamCreated(
              payload.organization,
              payload.team,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterCreateTeam) return prevAfterCreateTeam(...args);
          return undefined;
        };

        // afterUpdateTeam
        const prevAfterUpdateTeam = organizationHooks.afterUpdateTeam as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterUpdateTeam = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            { organization: OrganizationSnapshot; team?: TeamSnapshot; user: UserSnapshot },
          ];
          if (payload.team) {
            await emit(
              catalog.team.trackOrganizationTeamUpdated(
                payload.organization,
                payload.team,
                getOrganizationTriggerInfo(payload.user),
              ),
            );
          }
          if (prevAfterUpdateTeam) return prevAfterUpdateTeam(...args);
          return undefined;
        };

        // afterDeleteTeam
        const prevAfterDeleteTeam = organizationHooks.afterDeleteTeam as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterDeleteTeam = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            { organization: OrganizationSnapshot; team: TeamSnapshot; user: UserSnapshot },
          ];
          await emit(
            catalog.team.trackOrganizationTeamDeleted(
              payload.organization,
              payload.team,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterDeleteTeam) return prevAfterDeleteTeam(...args);
          return undefined;
        };

        // afterAddTeamMember
        const prevAfterAddTeamMember = organizationHooks.afterAddTeamMember as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterAddTeamMember = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              team: TeamSnapshot;
              user: UserSnapshot;
              teamMember: { teamId: string; userId: string };
            },
          ];
          await emit(
            catalog.team.trackOrganizationTeamMemberAdded(
              payload.organization,
              payload.team,
              payload.user,
              payload.teamMember,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterAddTeamMember) return prevAfterAddTeamMember(...args);
          return undefined;
        };

        // afterRemoveTeamMember
        const prevAfterRemoveTeamMember = organizationHooks.afterRemoveTeamMember as
          | ((...args: unknown[]) => Promise<unknown>)
          | undefined;
        organizationHooks.afterRemoveTeamMember = async (...args: unknown[]): Promise<unknown> => {
          const [payload] = args as [
            {
              organization: OrganizationSnapshot;
              team: TeamSnapshot;
              user: UserSnapshot;
              teamMember: { teamId: string; userId: string };
            },
          ];
          await emit(
            catalog.team.trackOrganizationTeamMemberRemoved(
              payload.organization,
              payload.team,
              payload.user,
              payload.teamMember,
              getOrganizationTriggerInfo(payload.user),
            ),
          );
          if (prevAfterRemoveTeamMember) return prevAfterRemoveTeamMember(...args);
          return undefined;
        };
      } else {
        logger.debug("organization plugin not active; skipping instrumentation");
      }

      // dash 7283-7449 미러: databaseHooks (user/session/account/verification).
      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                after: async (rawUser: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const user = rawUser as UserSnapshot;
                  const trigger = getTriggerInfo(
                    ctx.path,
                    ctx.context.session?.session?.userId ?? null,
                    user.id,
                  );
                  const location = ctx.context.location ?? undefined;
                  await emit(catalog.user.trackUserSignedUp(user, trigger, location));
                },
              },
              update: {
                after: async (rawUser: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const user = rawUser as UserSnapshot & {
                    emailVerified?: boolean;
                    image?: string | null;
                  };
                  const path = ctx.path;
                  const trigger = getTriggerInfo(
                    path,
                    ctx.context.session?.session?.userId ?? null,
                    user.id,
                  );
                  const location = ctx.context.location ?? undefined;

                  if (matchesAnyRoute(path, [ROUTES.UPDATE_USER, ROUTES.DASH_UPDATE_USER])) {
                    const updatedFields = Object.keys((ctx.body as object) ?? {});
                    const isOnlyImageUpdate =
                      updatedFields.length === 1 && updatedFields[0] === "image";
                    const isOnlyEmailVerifiedUpdate =
                      updatedFields.length === 1 && updatedFields[0] === "emailVerified";
                    const hasEmailVerifiedUpdate = updatedFields.includes("emailVerified");
                    if (isOnlyEmailVerifiedUpdate && user.emailVerified) {
                      await emit(catalog.user.trackUserEmailVerified(user, trigger, location));
                    } else if (isOnlyImageUpdate && user.image) {
                      await emit(
                        catalog.user.trackUserProfileImageUpdated(user, trigger, location),
                      );
                    } else if (!isOnlyImageUpdate && !isOnlyEmailVerifiedUpdate) {
                      await emit(
                        catalog.user.trackUserProfileUpdated(
                          user,
                          updatedFields,
                          trigger,
                          location,
                        ),
                      );
                      if (hasEmailVerifiedUpdate && user.emailVerified) {
                        await emit(catalog.user.trackUserEmailVerified(user, trigger, location));
                      }
                    }
                  } else if (matchesAnyRoute(path, [ROUTES.CHANGE_EMAIL])) {
                    const updatedFields = Object.keys((ctx.body as object) ?? {});
                    await emit(
                      catalog.user.trackUserProfileUpdated(user, updatedFields, trigger, location),
                    );
                  }
                  if (matchesAnyRoute(path, [ROUTES.VERIFY_EMAIL]) && user.emailVerified) {
                    await emit(catalog.user.trackUserEmailVerified(user, trigger, location));
                  }
                  if (
                    matchesAnyRoute(path, [ROUTES.ADMIN_BAN_USER]) &&
                    "banned" in user &&
                    user.banned
                  ) {
                    await emit(catalog.user.trackUserBanned(user, trigger, location));
                  }
                  if (
                    matchesAnyRoute(path, [ROUTES.ADMIN_UNBAN_USER]) &&
                    "banned" in user &&
                    !user.banned
                  ) {
                    await emit(catalog.user.trackUserUnBanned(user, trigger, location));
                  }
                },
              },
              delete: {
                after: async (rawUser: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const user = rawUser as UserSnapshot;
                  const trigger = getTriggerInfo(
                    ctx.path,
                    ctx.context.session?.session?.userId ?? null,
                    user.id,
                  );
                  const location = ctx.context.location ?? undefined;
                  await emit(catalog.user.trackUserDeleted(user, trigger, location));
                },
              },
            },
            session: {
              create: {
                before: async (
                  rawSession: unknown,
                  rawCtx?: unknown,
                ): Promise<{ data: { loginMethod: string | null } } | undefined> => {
                  void rawSession;
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return undefined;
                  return { data: { loginMethod: getLoginMethod(ctx.path, ctx.params?.id) } };
                },
                after: async (rawSession: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const session = rawSession as SessionSnapshot;
                  if (!session.userId) return;
                  const location = ctx.context.location ?? undefined;
                  const loginMethod = getLoginMethod(ctx.path, ctx.params?.id) ?? undefined;
                  const enrichedSession: SessionSnapshot = {
                    ...session,
                    loginMethod: loginMethod ?? session.loginMethod ?? null,
                  };
                  const user = await fetchUserById(ctx, session.userId);

                  let trigger: BuilderTrigger;
                  if (
                    matchesAnyRoute(ctx.path, [
                      ROUTES.SIGN_IN,
                      ROUTES.SIGN_UP,
                      ROUTES.SIGN_IN_SOCIAL_CALLBACK,
                      ROUTES.SIGN_IN_OAUTH_CALLBACK,
                    ])
                  ) {
                    trigger = getTriggerInfo(ctx.path, session.userId, session.userId);
                    await emit(
                      catalog.session.trackUserSignedIn(enrichedSession, user, trigger, location),
                    );
                  } else {
                    trigger = getTriggerInfo(
                      ctx.path,
                      ctx.context.session?.session?.userId ?? null,
                      session.userId,
                    );
                  }
                  await emit(
                    catalog.session.trackSessionCreated(enrichedSession, user, trigger, location),
                  );
                  if (isNonEmptyString(session.impersonatedBy)) {
                    const impersonator = await fetchUserById(ctx, session.impersonatedBy);
                    const impTrigger: BuilderTrigger = {
                      triggeredBy: session.impersonatedBy,
                      triggerContext: trigger.triggerContext,
                    };
                    await emit(
                      catalog.session.trackUserImpersonated(
                        enrichedSession,
                        user,
                        impersonator,
                        impTrigger,
                        location,
                      ),
                    );
                  }
                },
              },
              delete: {
                after: async (rawSession: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const session = rawSession as SessionSnapshot;
                  const location = ctx.context.location ?? undefined;
                  const enrichedSession: SessionSnapshot = { ...session };
                  const user = await fetchUserById(ctx, session.userId);
                  const trigger = getTriggerInfo(
                    ctx.path,
                    ctx.context.session?.session?.userId ?? null,
                    session.userId,
                  );
                  if (
                    matchesAnyRoute(ctx.path, [
                      ROUTES.REVOKE_ALL_SESSIONS,
                      ROUTES.ADMIN_REVOKE_USER_SESSIONS,
                      ROUTES.DASH_REVOKE_SESSIONS_ALL,
                      ROUTES.DASH_BAN_USER,
                    ])
                  ) {
                    if (!processedBulkOperationContexts.has(ctx)) {
                      await emit(
                        catalog.session.trackSessionRevokedAll(enrichedSession, user, trigger),
                      );
                      processedBulkOperationContexts.add(ctx);
                    }
                  } else if (matchesAnyRoute(ctx.path, [ROUTES.SIGN_OUT])) {
                    await emit(
                      catalog.session.trackUserSignedOut(enrichedSession, user, trigger, location),
                    );
                  } else {
                    await emit(
                      catalog.session.trackSessionRevoked(enrichedSession, user, trigger, location),
                    );
                  }
                  if (isNonEmptyString(session.impersonatedBy)) {
                    const impersonator = await fetchUserById(ctx, session.impersonatedBy);
                    await emit(
                      catalog.session.trackUserImpersonationStop(
                        enrichedSession,
                        user,
                        impersonator,
                        trigger,
                        location,
                      ),
                    );
                  }
                },
              },
            },
            account: {
              create: {
                after: async (rawAccount: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const account = rawAccount as AccountSnapshot;
                  if (!account.userId) return;
                  const user = await fetchUserById(ctx, account.userId);
                  const trigger = getTriggerInfo(
                    ctx.path,
                    ctx.context.session?.session?.userId ?? null,
                    account.userId,
                  );
                  const location = ctx.context.location ?? undefined;
                  await emit(catalog.account.trackAccountLinking(account, user, trigger, location));
                },
              },
              update: {
                after: async (rawAccount: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const account = rawAccount as AccountSnapshot;
                  if (!account.userId) return;
                  const path = ctx.path;
                  const trigger = getTriggerInfo(
                    path,
                    ctx.context.session?.session?.userId ?? null,
                    account.userId,
                  );
                  const location = ctx.context.location ?? undefined;
                  if (
                    matchesAnyRoute(path, [
                      ROUTES.CHANGE_PASSWORD,
                      ROUTES.SET_PASSWORD,
                      ROUTES.RESET_PASSWORD,
                      ROUTES.ADMIN_SET_PASSWORD,
                    ])
                  ) {
                    const user = await fetchUserById(ctx, account.userId);
                    await emit(
                      catalog.account.trackAccountPasswordChange(account, user, trigger, location),
                    );
                  }
                },
              },
              delete: {
                after: async (rawAccount: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const account = rawAccount as AccountSnapshot;
                  if (!account.userId) return;
                  const user = await fetchUserById(ctx, account.userId);
                  const trigger = getTriggerInfo(
                    ctx.path,
                    ctx.context.session?.session?.userId ?? null,
                    account.userId,
                  );
                  const location = ctx.context.location ?? undefined;
                  await emit(catalog.account.trackAccountUnlink(account, user, trigger, location));
                },
              },
            },
            verification: {
              create: {
                after: async (rawVerification: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const verification = rawVerification as VerificationSnapshot;
                  const path = ctx.path;
                  const sessionUserId = ctx.context.session?.user?.id ?? "unknown";
                  const trigger = getTriggerInfo(path, sessionUserId, sessionUserId);
                  const location = ctx.context.location ?? undefined;
                  if (matchesAnyRoute(path, [ROUTES.REQUEST_PASSWORD_RESET])) {
                    const user = await fetchUserById(ctx, verification.value);
                    await emit(
                      catalog.verification.trackPasswordResetRequest(
                        verification,
                        user,
                        trigger,
                        location,
                      ),
                    );
                  }
                },
              },
              delete: {
                after: async (rawVerification: unknown, rawCtx?: unknown): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const verification = rawVerification as VerificationSnapshot;
                  const path = ctx.path;
                  const sessionUserId = ctx.context.session?.user?.id ?? "unknown";
                  const trigger = getTriggerInfo(path, sessionUserId, sessionUserId);
                  const location = ctx.context.location ?? undefined;
                  if (matchesAnyRoute(path, [ROUTES.RESET_PASSWORD])) {
                    const user = await fetchUserById(ctx, verification.value);
                    await emit(
                      catalog.verification.trackPasswordResetRequestCompletion(
                        verification,
                        user,
                        trigger,
                        location,
                      ),
                    );
                  }
                },
              },
            },
          },
        },
      };
    },

    hooks: {
      before: [
        {
          // dash 제거로 사라진 location 공급 경로를 복구한다.
          // 모든 요청에서 ctx.context.location을 채워 이후 빌더들이 ipAddress/city/countryCode를 기록할 수 있게 한다.
          matcher: () => true,
          handler: createAuthMiddleware(async (rawCtx) => {
            const ctx = rawCtx as {
              headers?: unknown;
              request?: { headers?: unknown } | undefined;
              context?: { location?: BuilderLocation | null } & Record<string, unknown>;
            };
            if (!ctx.context) return;
            const headers = ctx.headers ?? ctx.request?.headers;
            ctx.context.location = extractLocationFromHeaders(headers);
          }),
        },
      ],
      after: [
        {
          // dash 7462-7487 미러: verification email send, sign-in attempts.
          // GET 요청은 콜백 경로만 통과시킨다.
          matcher: (ctx: unknown): boolean => {
            const c = ctx as { request?: { method?: string; url?: string } };
            if (c.request?.method !== "GET") return true;
            if (!c.request.url) return false;
            try {
              const p = new URL(c.request.url).pathname;
              return matchesAnyRoute(p, [
                ROUTES.SIGN_IN_SOCIAL_CALLBACK,
                ROUTES.SIGN_IN_OAUTH_CALLBACK,
              ]);
            } catch {
              return false;
            }
          },
          handler: createAuthMiddleware(async (rawCtx) => {
            const ctx = narrowRequestCtx(rawCtx);
            if (!ctx) return;
            const sessionUser = ctx.context.session?.user;
            const sessionUserId = sessionUser?.id ?? "unknown";
            const trigger = getTriggerInfo(ctx.path, sessionUserId, sessionUserId);
            const location = ctx.context.location ?? undefined;
            const returned = ctx.context.returned;
            const isErrored = returned instanceof Error;

            // verification email sent
            if (
              matchesAnyRoute(ctx.path, [ROUTES.SEND_VERIFICATION_EMAIL]) &&
              ctx.context.session &&
              !isErrored
            ) {
              const sessionEntity = ctx.context.session.session as SessionSnapshot | undefined;
              const user = ctx.context.session.user as
                | { name?: string; email?: string }
                | undefined;
              if (sessionEntity && user) {
                await emit(
                  catalog.session.trackEmailVerificationSent(sessionEntity, user, trigger),
                );
              }
            }

            const body =
              (ctx.body as { email?: string; provider?: string; idToken?: string } | null) ?? null;
            // email sign-in attempt failed
            if (
              matchesAnyRoute(ctx.path, [ROUTES.SIGN_IN_EMAIL, ROUTES.SIGN_IN_EMAIL_OTP]) &&
              isErrored &&
              body?.email
            ) {
              const user = await fetchUserByEmail(ctx, body.email);
              await emit(
                catalog.session.trackEmailSignInAttempt(
                  { email: body.email, loginMethod: getLoginMethod(ctx.path, ctx.params?.id) },
                  user,
                  trigger,
                  location,
                ),
              );
            }
            // social sign-in attempt failed (POST)
            if (
              matchesAnyRoute(ctx.path, [ROUTES.SIGN_IN_SOCIAL]) &&
              isErrored &&
              body?.provider &&
              body?.idToken
            ) {
              await emit(
                catalog.session.trackSocialSignInAttempt(
                  { loginMethod: getLoginMethod(ctx.path, ctx.params?.id) },
                  null,
                  trigger,
                  location,
                ),
              );
            }
            // social redirection callback failed (GET)
            if (matchesAnyRoute(ctx.path, [ROUTES.SIGN_IN_SOCIAL_CALLBACK]) && isErrored) {
              await emit(
                catalog.session.trackSocialSignInRedirectionAttempt(
                  { loginMethod: getLoginMethod(ctx.path, ctx.params?.id) },
                  null,
                  trigger,
                  location,
                ),
              );
            }
          }),
        },
      ],
    },
  };
}

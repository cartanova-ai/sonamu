import { randomUUID } from "node:crypto";

import {
  type AccountSnapshot,
  type AuditEventData,
  type AuditLogEvent,
  type Builder,
  type BuilderLocation,
  type BuilderTrigger,
  EVENT_TYPES,
  type InvitationSnapshot,
  type MemberSnapshot,
  ORGANIZATION_EVENT_TYPES,
  type OrganizationSnapshot,
  type SessionSnapshot,
  type TeamSnapshot,
  type UserProfileLite,
  type UserSnapshot,
  type VerificationSnapshot,
} from "./events";

// 모든 빌더 공통 필드(triggeredBy/triggerContext, ipAddress/city/country/countryCode)를 합성한다.
const createEvent = (
  base: { eventKey: string; eventType: string; eventDisplayName?: string },
  data: AuditEventData,
  trigger: BuilderTrigger,
  location?: BuilderLocation,
): AuditLogEvent => ({
  ...base,
  eventId: randomUUID(),
  eventData: {
    ...data,
    triggeredBy: trigger.triggeredBy,
    triggerContext: trigger.triggerContext,
  },
  ipAddress: location?.ipAddress,
  city: location?.city,
  country: location?.country,
  countryCode: location?.countryCode,
});

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

const buildAccountEvent = (
  eventType: string,
  eventDisplayName: string,
  account: AccountSnapshot,
  user: UserProfileLite,
  trigger: BuilderTrigger,
  location: BuilderLocation | undefined,
): AuditLogEvent =>
  createEvent(
    { eventKey: account.userId, eventType, eventDisplayName },
    {
      userId: account.userId,
      userEmail: user?.email ?? "unknown",
      userName: user?.name ?? "unknown",
      accountId: account.id,
      providerId: account.providerId,
    },
    trigger,
    location,
  );

const buildAccountEvents = (): AccountEventBuilders => ({
  trackAccountLinking: (account, user, trigger, location) =>
    buildAccountEvent(
      EVENT_TYPES.ACCOUNT_LINKED,
      `Linked ${account.providerId} account`,
      account,
      user,
      trigger,
      location,
    ),
  trackAccountUnlink: (account, user, trigger, location) =>
    buildAccountEvent(
      EVENT_TYPES.ACCOUNT_UNLINKED,
      `Unlinked ${account.providerId} account`,
      account,
      user,
      trigger,
      location,
    ),
  trackAccountPasswordChange: (account, user, trigger, location) =>
    buildAccountEvent(
      EVENT_TYPES.PASSWORD_CHANGED,
      "Password changed",
      account,
      user,
      trigger,
      location,
    ),
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

const sessionLifecycleData = (session: SessionSnapshot, user: UserProfileLite) => ({
  userId: session.userId,
  userName: user?.name ?? "unknown",
  userEmail: user?.email ?? "unknown",
  sessionId: session.id,
  loginMethod: session.loginMethod ?? "unknown",
  userAgent: session.userAgent,
});

const buildSessionLifecycleEvent = (
  eventType: string,
  eventDisplayName: string,
  session: SessionSnapshot,
  user: UserProfileLite,
  trigger: BuilderTrigger,
  location: BuilderLocation | undefined,
): AuditLogEvent =>
  createEvent(
    { eventKey: session.userId, eventType, eventDisplayName },
    sessionLifecycleData(session, user),
    trigger,
    location,
  );

const buildImpersonationEvent = (
  eventType: string,
  eventDisplayName: string,
  session: SessionSnapshot,
  user: UserProfileLite,
  impersonator: UserProfileLite,
  trigger: BuilderTrigger,
  location: BuilderLocation | undefined,
): AuditLogEvent =>
  createEvent(
    { eventKey: session.userId, eventType, eventDisplayName },
    {
      ...sessionLifecycleData(session, user),
      impersonatedBy: impersonator?.name ?? impersonator?.email ?? session.impersonatedBy,
      impersonatedById: session.impersonatedBy,
    },
    trigger,
    location,
  );

const SIGN_IN_FAILED_DISPLAY = "User sign-in attempt failed";

const buildSessionEvents = (): SessionEventBuilders => ({
  trackUserSignedIn: (session, user, trigger, location) =>
    buildSessionLifecycleEvent(
      EVENT_TYPES.USER_SIGNED_IN,
      `Signed in via ${session.loginMethod ?? "unknown"}`,
      session,
      user,
      trigger,
      location,
    ),
  trackUserSignedOut: (session, user, trigger, location) =>
    buildSessionLifecycleEvent(
      EVENT_TYPES.USER_SIGNED_OUT,
      "User signed out",
      session,
      user,
      trigger,
      location,
    ),
  trackSessionCreated: (session, user, trigger, location) =>
    buildSessionLifecycleEvent(
      EVENT_TYPES.SESSION_CREATED,
      "Session created",
      session,
      user,
      trigger,
      location,
    ),
  trackSessionRevoked: (session, user, trigger, location) =>
    buildSessionLifecycleEvent(
      EVENT_TYPES.SESSION_REVOKED,
      "Session revoked",
      session,
      user,
      trigger,
      location,
    ),
  trackSessionRevokedAll: (session, user, trigger) =>
    createEvent(
      {
        eventKey: session.userId,
        eventType: EVENT_TYPES.ALL_SESSIONS_REVOKED,
        eventDisplayName: "All sessions revoked",
      },
      {
        userId: session.userId,
        userName: user?.name ?? "unknown",
        userEmail: user?.email ?? "unknown",
      },
      trigger,
    ),
  trackUserImpersonated: (session, user, impersonator, trigger, location) =>
    buildImpersonationEvent(
      EVENT_TYPES.USER_IMPERSONATED,
      "User impersonated",
      session,
      user,
      impersonator,
      trigger,
      location,
    ),
  trackUserImpersonationStop: (session, user, impersonator, trigger, location) =>
    buildImpersonationEvent(
      EVENT_TYPES.USER_IMPERSONATED_STOPPED,
      "User impersonation stopped",
      session,
      user,
      impersonator,
      trigger,
      location,
    ),
  trackEmailVerificationSent: (session, user, trigger) =>
    createEvent(
      {
        eventKey: session.userId,
        eventType: EVENT_TYPES.EMAIL_VERIFICATION_SENT,
        eventDisplayName: "Verification email sent",
      },
      {
        userId: session.userId,
        userName: user.name,
        userEmail: user.email,
        sessionId: session.id,
      },
      trigger,
    ),
  // 주의: 기존 동작 유지 — `nameName` 오타 필드명도 그대로 보존한다.
  trackEmailSignInAttempt: (attempt, user, trigger, location) =>
    createEvent(
      {
        eventKey: user?.id ?? "unknown",
        eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
        eventDisplayName: SIGN_IN_FAILED_DISPLAY,
      },
      {
        userId: user?.id ?? "unknown",
        nameName: user?.name ?? "unknown",
        userEmail: attempt.email,
        loginMethod: attempt.loginMethod,
      },
      { triggeredBy: user?.id ?? trigger.triggeredBy, triggerContext: trigger.triggerContext },
      location,
    ),
  trackSocialSignInAttempt: (attempt, user, trigger, location) =>
    createEvent(
      {
        eventKey: user?.id ?? "unknown",
        eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
        eventDisplayName: SIGN_IN_FAILED_DISPLAY,
      },
      {
        userId: user?.id ?? "unknown",
        userName: user?.name ?? "unknown",
        userEmail: user?.email ?? "unknown",
        loginMethod: attempt.loginMethod,
      },
      { triggeredBy: user?.id ?? trigger.triggeredBy, triggerContext: trigger.triggerContext },
      location,
    ),
  // 주의: 기존 동작 유지 — userEmail 값이 user?.id로 설정되는 기존 동작도 그대로 보존한다.
  trackSocialSignInRedirectionAttempt: (attempt, user, trigger, location) =>
    createEvent(
      {
        eventKey: user?.id ?? "unknown",
        eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
        eventDisplayName: SIGN_IN_FAILED_DISPLAY,
      },
      {
        userId: user?.id ?? "unknown",
        userName: user?.name ?? "unknown",
        userEmail: user?.id ?? "unknown",
        loginMethod: attempt.loginMethod,
      },
      trigger,
      location,
    ),
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

const userIdentityData = (user: UserSnapshot) => ({
  userId: user.id,
  userEmail: user.email,
  userName: user.name,
});

const buildUserEvent = (
  eventType: string,
  eventDisplayName: string,
  user: UserSnapshot,
  trigger: BuilderTrigger,
  location: BuilderLocation | undefined,
  extra?: AuditEventData,
): AuditLogEvent =>
  createEvent(
    { eventKey: user.id, eventType, eventDisplayName },
    { ...userIdentityData(user), ...extra },
    trigger,
    location,
  );

const buildUserEvents = (): UserEventBuilders => ({
  trackUserSignedUp: (user, trigger, location) =>
    buildUserEvent(
      EVENT_TYPES.USER_CREATED,
      `${user.name || user.email} signed up`,
      user,
      trigger,
      location,
    ),
  trackUserDeleted: (user, trigger, location) =>
    buildUserEvent(EVENT_TYPES.USER_DELETED, "User deleted", user, trigger, location),
  trackUserProfileUpdated: (user, updatedFields, trigger, location) =>
    buildUserEvent(EVENT_TYPES.PROFILE_UPDATED, "Profile updated", user, trigger, location, {
      updatedFields,
    }),
  trackUserProfileImageUpdated: (user, trigger, location) =>
    buildUserEvent(
      EVENT_TYPES.PROFILE_IMAGE_UPDATED,
      "Profile image updated",
      user,
      trigger,
      location,
    ),
  trackUserBanned: (user, trigger, location) => {
    const reasonSuffix = user.banReason ? `: ${user.banReason}` : "";
    const expiresSuffix = user.banExpires ? ` (until ${user.banExpires.toISOString()})` : "";
    return buildUserEvent(
      EVENT_TYPES.USER_BANNED,
      `User banned${reasonSuffix}${expiresSuffix}`,
      user,
      trigger,
      location,
      {
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
      },
    );
  },
  trackUserUnBanned: (user, trigger, location) =>
    buildUserEvent(EVENT_TYPES.USER_UNBANNED, "User unbanned", user, trigger, location, {
      banned: user.banned,
    }),
  trackUserEmailVerified: (user, trigger, location) =>
    buildUserEvent(EVENT_TYPES.EMAIL_VERIFIED, "Email verified", user, trigger, location),
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

const buildVerificationEvent = (
  eventType: string,
  eventDisplayName: string,
  verification: VerificationSnapshot,
  user: UserProfileLite,
  trigger: BuilderTrigger,
  location: BuilderLocation | undefined,
): AuditLogEvent =>
  createEvent(
    { eventKey: verification.value, eventType, eventDisplayName },
    {
      userId: verification.value,
      userName: user?.name ?? "unknown",
      userEmail: user?.email ?? "unknown",
    },
    trigger,
    location,
  );

const buildVerificationEvents = (): VerificationEventBuilders => ({
  trackPasswordResetRequest: (verification, user, trigger, location) =>
    buildVerificationEvent(
      EVENT_TYPES.PASSWORD_RESET_REQUESTED,
      "Password reset requested",
      verification,
      user,
      trigger,
      location,
    ),
  trackPasswordResetRequestCompletion: (verification, user, trigger, location) =>
    buildVerificationEvent(
      EVENT_TYPES.PASSWORD_RESET_COMPLETED,
      "Password reset completed",
      verification,
      user,
      trigger,
      location,
    ),
});

// ============================================================================
// Organization / Team / Member / Invitation 빌더
// ============================================================================
const organizationIdentityData = (organization: OrganizationSnapshot) => ({
  organizationId: organization.id,
  organizationSlug: organization.slug,
  organizationName: organization.name,
});

export type OrganizationEventBuilders = {
  trackOrganizationCreated: Builder<[OrganizationSnapshot, BuilderTrigger]>;
  trackOrganizationUpdated: Builder<[OrganizationSnapshot, BuilderTrigger]>;
};

const buildOrganizationEvent = (
  eventType: string,
  eventDisplayName: string,
  organization: OrganizationSnapshot,
  trigger: BuilderTrigger,
): AuditLogEvent =>
  createEvent(
    { eventKey: organization.id, eventType, eventDisplayName },
    organizationIdentityData(organization),
    trigger,
  );

const buildOrganizationEvents = (): OrganizationEventBuilders => ({
  trackOrganizationCreated: (organization, trigger) =>
    buildOrganizationEvent(
      ORGANIZATION_EVENT_TYPES.ORGANIZATION_CREATED,
      "Organization Created",
      organization,
      trigger,
    ),
  trackOrganizationUpdated: (organization, trigger) =>
    buildOrganizationEvent(
      ORGANIZATION_EVENT_TYPES.ORGANIZATION_UPDATED,
      "Organization Updated",
      organization,
      trigger,
    ),
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

const buildTeamLifecycleEvent = (
  eventType: string,
  eventDisplayName: string,
  organization: OrganizationSnapshot,
  team: TeamSnapshot,
  trigger: BuilderTrigger,
): AuditLogEvent =>
  createEvent(
    { eventKey: organization.id, eventType, eventDisplayName },
    { ...organizationIdentityData(organization), teamId: team.id, teamName: team.name },
    trigger,
  );

const buildTeamMemberEvent = (
  eventType: string,
  eventDisplayName: string,
  organization: OrganizationSnapshot,
  team: TeamSnapshot,
  user: UserSnapshot,
  teamMember: { teamId: string; userId: string },
  trigger: BuilderTrigger,
): AuditLogEvent =>
  createEvent(
    { eventKey: organization.id, eventType, eventDisplayName },
    {
      ...organizationIdentityData(organization),
      teamId: teamMember.teamId,
      teamName: team.name,
      userid: teamMember.userId,
      memberName: user.name,
    },
    trigger,
  );

const buildTeamEvents = (): TeamEventBuilders => ({
  trackOrganizationTeamCreated: (organization, team, trigger) =>
    buildTeamLifecycleEvent(
      ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_CREATED,
      "Organization team created",
      organization,
      team,
      trigger,
    ),
  trackOrganizationTeamUpdated: (organization, team, trigger) =>
    buildTeamLifecycleEvent(
      ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_UPDATED,
      "Organization team updated",
      organization,
      team,
      trigger,
    ),
  trackOrganizationTeamDeleted: (organization, team, trigger) =>
    buildTeamLifecycleEvent(
      ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_DELETED,
      "Organization team deleted",
      organization,
      team,
      trigger,
    ),
  trackOrganizationTeamMemberAdded: (organization, team, user, teamMember, trigger) =>
    buildTeamMemberEvent(
      ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_MEMBER_ADDED,
      "User added to organization team",
      organization,
      team,
      user,
      teamMember,
      trigger,
    ),
  trackOrganizationTeamMemberRemoved: (organization, team, user, teamMember, trigger) =>
    buildTeamMemberEvent(
      ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_MEMBER_REMOVED,
      "User removed from organization team",
      organization,
      team,
      user,
      teamMember,
      trigger,
    ),
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

const memberCoreData = (member: MemberSnapshot, user: UserSnapshot) => ({
  userId: member.userId,
  memberName: user.name,
  role: member.role,
  memberId: member.id,
  memberEmail: user.email,
});

const buildMemberEvents = (): MemberEventBuilders => ({
  trackOrganizationMemberAdded: (organization, member, user, trigger) =>
    createEvent(
      {
        eventKey: organization.id,
        eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_ADDED,
        eventDisplayName: "Member added to organization",
      },
      { ...organizationIdentityData(organization), ...memberCoreData(member, user) },
      trigger,
    ),
  trackOrganizationMemberRemoved: (organization, member, user, trigger) =>
    createEvent(
      {
        eventKey: organization.id,
        eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_REMOVED,
        eventDisplayName: "Member removed from organization",
      },
      { ...organizationIdentityData(organization), ...memberCoreData(member, user) },
      trigger,
    ),
  trackOrganizationMemberRoleUpdated: (organization, member, user, previousRole, trigger) =>
    createEvent(
      {
        eventKey: organization.id,
        eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_ROLE_UPDATED,
        eventDisplayName: "Organization member role updated",
      },
      {
        ...organizationIdentityData(organization),
        userId: member.userId,
        memberName: user.name,
        newRole: member.role,
        oldRole: previousRole,
        memberId: member.id,
        memberEmail: user.email,
      },
      trigger,
    ),
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

const inviteeData = (invitation: InvitationSnapshot) => ({
  inviteeId: invitation.id,
  inviteeEmail: invitation.email,
  inviteeRole: invitation.role,
  inviteeTeamId: invitation.teamId,
});

const buildInvitationEvents = (): InvitationEventBuilders => ({
  trackOrganizationMemberInvited: (organization, invitation, inviter, trigger) =>
    createEvent(
      {
        eventKey: organization.id,
        eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITED,
        eventDisplayName: "User invited to organization",
      },
      {
        ...organizationIdentityData(organization),
        ...inviteeData(invitation),
        inviterId: inviter.id,
        inviterName: inviter.name,
        inviterEmail: inviter.email,
      },
      trigger,
    ),
  trackOrganizationMemberInviteAccepted: (organization, invitation, member, acceptedBy, trigger) =>
    createEvent(
      {
        eventKey: organization.id,
        eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_ACCEPTED,
        eventDisplayName: "User accepted invite organization invite",
      },
      {
        ...organizationIdentityData(organization),
        ...inviteeData(invitation),
        acceptedById: acceptedBy.id,
        acceptedByEmail: acceptedBy.email,
        acceptedByName: acceptedBy.name,
        memberId: member.id,
        memberRole: member.role,
      },
      trigger,
    ),
  trackOrganizationMemberInviteRejected: (organization, invitation, rejectedBy, trigger) =>
    createEvent(
      {
        eventKey: organization.id,
        eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_REJECTED,
        eventDisplayName: "User rejected organization invite",
      },
      {
        ...organizationIdentityData(organization),
        ...inviteeData(invitation),
        rejectedById: rejectedBy.id,
        rejectedByEmail: rejectedBy.email,
        rejectedByName: rejectedBy.name,
      },
      trigger,
    ),
  trackOrganizationMemberInviteCanceled: (organization, invitation, cancelledBy, trigger) =>
    createEvent(
      {
        eventKey: organization.id,
        eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_CANCELED,
        eventDisplayName: "Organization invite cancelled",
      },
      {
        ...organizationIdentityData(organization),
        ...inviteeData(invitation),
        cancelledById: cancelledBy.id,
        cancelledByName: cancelledBy.name,
        cancelledByEmail: cancelledBy.email,
      },
      trigger,
    ),
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

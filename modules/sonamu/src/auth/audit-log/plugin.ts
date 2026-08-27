import { getLogger } from "@logtape/logtape";
import { type AuthContext, type BetterAuthPlugin, type GenericEndpointContext } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import { DB } from "../../database/db";
import { isObjectValue, isStringValue } from "../../utils/runtime-value";
import { ingestAuditEvent } from "../audit-log-ingestor";
import { buildAuditEventCatalog } from "./builders";
import {
  type AccountSnapshot,
  type AuditLogEvent,
  type BuilderLocation,
  type BuilderTrigger,
  ROUTES,
  type SessionSnapshot,
  type UserProfileLite,
  type UserSnapshot,
  type VerificationSnapshot,
} from "./events";

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
type BetterAuthRequestCtx = GenericEndpointContext & {
  context: GenericEndpointContext["context"] & {
    location?: BuilderLocation | null;
  };
};

// databaseHooks after 콜백의 ctx는 선택적이며 shape을 런타임에서 좁힌다.
const narrowRequestCtx = (raw: GenericEndpointContext | null): BetterAuthRequestCtx | null => raw;

// adapter.findOne 호출 실패 시 null을 반환한다. dash 헬퍼와 동일 정책.
const fetchUserBy = async (
  ctx: BetterAuthRequestCtx,
  field: "id" | "email",
  value: string | null | undefined,
): Promise<UserProfileLite> => {
  if (!value) return null;
  const adapter = ctx.context.adapter;
  if (!adapter) return null;
  try {
    const row = await adapter.findOne({
      model: "user",
      select: ["id", "name", "email"],
      where: [{ field, value }],
    });
    if (!row || !isObjectValue(row)) return null;
    const id = "id" in row ? row.id : undefined;
    const name = "name" in row ? row.name : undefined;
    const email = "email" in row ? row.email : undefined;
    return {
      id: String(id),
      name: isStringValue(name) ? name : undefined,
      email: isStringValue(email) ? email : undefined,
    };
  } catch {
    return null;
  }
};

const isNonEmptyString = <Value>(value: Value): value is Value & string =>
  isStringValue(value) && value.length > 0;

// dash 제거 시 함께 사라진 location 공급 경로를 대체한다.
// 우선순위: cf-connecting-ip > x-forwarded-for(첫 항목) > x-real-ip > x-vercel-forwarded-for
// (sonamu.ts IP_HEADERS 상수와 동일)
const IP_HEADER_ORDER = [
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
] as const;

type HeaderCollection =
  | Headers
  | { [key: string]: string | string[] | undefined }
  | null
  | undefined;

const readHeader = (headers: HeaderCollection, key: string): string | null => {
  if (!headers) return null;
  if (headers instanceof Headers) {
    return headers.get(key);
  }
  if (isObjectValue(headers)) {
    const v = headers[key] ?? headers[key.toLowerCase()];
    if (isStringValue(v)) return v;
    if (Array.isArray(v) && isStringValue(v[0])) return v[0];
  }
  return null;
};

const extractLocationFromHeaders = (headers: HeaderCollection): BuilderLocation => {
  let ipAddress: string | null = null;
  for (const key of IP_HEADER_ORDER) {
    const raw = readHeader(headers, key);
    if (isStringValue(raw) && raw.length > 0) {
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
// Organization hook 래핑 헬퍼
// ============================================================================
// 주어진 organizationHooks 레코드에 대해 해당 name의 기존 hook을 chain한다.
// handler는 payload 객체(첫 번째 인자)만 받아서 audit emit을 수행한다.
const wrapOrgHook = <Payload extends object>(
  previous: ((payload: Payload) => Promise<void>) | undefined,
  handler: (payload: Payload) => Promise<void>,
): ((payload: Payload) => Promise<void>) => {
  return async (payload) => {
    await handler(payload);
    await previous?.(payload);
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
 * - security 4종은 R1 결정에 따라 scope out (builders.ts의 TODO 주석 참조).
 */
function locationFor(ctx: BetterAuthRequestCtx): BuilderLocation | undefined {
  return ctx.context.location ?? undefined;
}

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

  // ctx.path + session에서 사용자 트리거를 도출한다(entity.id를 subject로 사용).
  const triggerFor = (ctx: BetterAuthRequestCtx, subjectUserId: string): BuilderTrigger =>
    getTriggerInfo(ctx.path, ctx.context.session?.session?.userId ?? null, subjectUserId);

  return {
    id: "sonamu-audit-log",

    init(pluginCtx) {
      installOrganizationHooks(pluginCtx, catalog, emit, logger);

      // dash 7283-7449 미러: databaseHooks (user/session/account/verification).
      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                after: async (rawUser, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const user =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawUser as UserSnapshot;
                  await emit(
                    catalog.user.trackUserSignedUp(
                      user,
                      triggerFor(ctx, user.id),
                      locationFor(ctx),
                    ),
                  );
                },
              },
              update: {
                after: async (rawUser, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const user =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawUser as UserSnapshot & {
                      emailVerified?: boolean;
                      image?: string | null;
                    };
                  const path = ctx.path;
                  const trigger = triggerFor(ctx, user.id);
                  const location = locationFor(ctx);

                  if (matchesAnyRoute(path, [ROUTES.UPDATE_USER, ROUTES.DASH_UPDATE_USER])) {
                    const updatedFields = Object.keys(
                      /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ (ctx.body as object) ??
                        {},
                    );
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
                    const updatedFields = Object.keys(
                      /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ (ctx.body as object) ??
                        {},
                    );
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
                after: async (rawUser, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const user =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawUser as UserSnapshot;
                  await emit(
                    catalog.user.trackUserDeleted(user, triggerFor(ctx, user.id), locationFor(ctx)),
                  );
                },
              },
            },
            session: {
              create: {
                before: async (
                  rawSession,
                  rawCtx,
                ): Promise<{ data: { loginMethod: string | null } } | undefined> => {
                  void rawSession;
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return undefined;
                  return { data: { loginMethod: getLoginMethod(ctx.path, ctx.params?.id) } };
                },
                after: async (rawSession, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const session =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawSession as SessionSnapshot;
                  if (!session.userId) return;
                  const location = locationFor(ctx);
                  const loginMethod = getLoginMethod(ctx.path, ctx.params?.id) ?? undefined;
                  const enrichedSession: SessionSnapshot = {
                    ...session,
                    loginMethod: loginMethod ?? session.loginMethod ?? null,
                  };
                  const user = await fetchUserBy(ctx, "id", session.userId);

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
                    trigger = triggerFor(ctx, session.userId);
                  }
                  await emit(
                    catalog.session.trackSessionCreated(enrichedSession, user, trigger, location),
                  );
                  if (isNonEmptyString(session.impersonatedBy)) {
                    const impersonator = await fetchUserBy(ctx, "id", session.impersonatedBy);
                    await emit(
                      catalog.session.trackUserImpersonated(
                        enrichedSession,
                        user,
                        impersonator,
                        {
                          triggeredBy: session.impersonatedBy,
                          triggerContext: trigger.triggerContext,
                        },
                        location,
                      ),
                    );
                  }
                },
              },
              delete: {
                after: async (rawSession, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const session =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawSession as SessionSnapshot;
                  const location = locationFor(ctx);
                  const enrichedSession: SessionSnapshot = { ...session };
                  const user = await fetchUserBy(ctx, "id", session.userId);
                  const trigger = triggerFor(ctx, session.userId);
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
                    const impersonator = await fetchUserBy(ctx, "id", session.impersonatedBy);
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
                after: async (rawAccount, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const account =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawAccount as AccountSnapshot;
                  if (!account.userId) return;
                  const user = await fetchUserBy(ctx, "id", account.userId);
                  await emit(
                    catalog.account.trackAccountLinking(
                      account,
                      user,
                      triggerFor(ctx, account.userId),
                      locationFor(ctx),
                    ),
                  );
                },
              },
              update: {
                after: async (rawAccount, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const account =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawAccount as AccountSnapshot;
                  if (!account.userId) return;
                  if (
                    !matchesAnyRoute(ctx.path, [
                      ROUTES.CHANGE_PASSWORD,
                      ROUTES.SET_PASSWORD,
                      ROUTES.RESET_PASSWORD,
                      ROUTES.ADMIN_SET_PASSWORD,
                    ])
                  ) {
                    return;
                  }
                  const user = await fetchUserBy(ctx, "id", account.userId);
                  await emit(
                    catalog.account.trackAccountPasswordChange(
                      account,
                      user,
                      triggerFor(ctx, account.userId),
                      locationFor(ctx),
                    ),
                  );
                },
              },
              delete: {
                after: async (rawAccount, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  const account =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawAccount as AccountSnapshot;
                  if (!account.userId) return;
                  const user = await fetchUserBy(ctx, "id", account.userId);
                  await emit(
                    catalog.account.trackAccountUnlink(
                      account,
                      user,
                      triggerFor(ctx, account.userId),
                      locationFor(ctx),
                    ),
                  );
                },
              },
            },
            verification: {
              create: {
                after: async (rawVerification, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  if (!matchesAnyRoute(ctx.path, [ROUTES.REQUEST_PASSWORD_RESET])) return;
                  const verification =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawVerification as VerificationSnapshot;
                  const sessionUserId = ctx.context.session?.user?.id ?? "unknown";
                  const trigger = getTriggerInfo(ctx.path, sessionUserId, sessionUserId);
                  const user = await fetchUserBy(ctx, "id", verification.value);
                  await emit(
                    catalog.verification.trackPasswordResetRequest(
                      verification,
                      user,
                      trigger,
                      locationFor(ctx),
                    ),
                  );
                },
              },
              delete: {
                after: async (rawVerification, rawCtx): Promise<void> => {
                  const ctx = narrowRequestCtx(rawCtx);
                  if (!ctx) return;
                  if (!matchesAnyRoute(ctx.path, [ROUTES.RESET_PASSWORD])) return;
                  const verification =
                    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ rawVerification as VerificationSnapshot;
                  const sessionUserId = ctx.context.session?.user?.id ?? "unknown";
                  const trigger = getTriggerInfo(ctx.path, sessionUserId, sessionUserId);
                  const user = await fetchUserBy(ctx, "id", verification.value);
                  await emit(
                    catalog.verification.trackPasswordResetRequestCompletion(
                      verification,
                      user,
                      trigger,
                      locationFor(ctx),
                    ),
                  );
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
            const ctx: BetterAuthRequestCtx = rawCtx;
            const headers = ctx.headers ?? ctx.request?.headers;
            ctx.context.location = extractLocationFromHeaders(headers);
          }),
        },
      ],
      after: [
        {
          // dash 7462-7487 미러: verification email send, sign-in attempts.
          // GET 요청은 콜백 경로만 통과시킨다.
          matcher: (ctx): boolean => {
            if (ctx.request?.method !== "GET") return true;
            if (!ctx.request.url) return false;
            try {
              const p = new URL(ctx.request.url).pathname;
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
            const location = locationFor(ctx);
            const returned = ctx.context.returned;
            const isErrored = returned instanceof Error;

            // verification email sent
            if (
              matchesAnyRoute(ctx.path, [ROUTES.SEND_VERIFICATION_EMAIL]) &&
              ctx.context.session &&
              !isErrored
            ) {
              const sessionEntity =
                /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ ctx.context
                  .session.session as SessionSnapshot | undefined;
              const user = /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ ctx
                .context.session.user as { name?: string; email?: string } | undefined;
              if (sessionEntity && user) {
                await emit(
                  catalog.session.trackEmailVerificationSent(sessionEntity, user, trigger),
                );
              }
            }

            const body = ctx.body;
            // email sign-in attempt failed
            if (
              matchesAnyRoute(ctx.path, [ROUTES.SIGN_IN_EMAIL, ROUTES.SIGN_IN_EMAIL_OTP]) &&
              isErrored &&
              isStringValue(body?.email)
            ) {
              const user = await fetchUserBy(ctx, "email", body.email);
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
              isStringValue(body?.provider) &&
              isStringValue(body?.idToken)
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

// ============================================================================
// Organization hook 합성 (organization 플러그인이 활성화된 경우에만)
// dash 7192-7281 미러.
// ============================================================================
type EventEmitter = (event: AuditLogEvent) => Promise<void>;
type AuditLogger = ReturnType<typeof getLogger>;

function installOrganizationHooks(
  pluginCtx: AuthContext,
  catalog: ReturnType<typeof buildAuditEventCatalog>,
  emit: EventEmitter,
  logger: AuditLogger,
): void {
  const organizationPlugin = pluginCtx.getPlugin("organization");

  if (!organizationPlugin) {
    logger.debug("organization plugin not active; skipping instrumentation");
    return;
  }

  organizationPlugin.options = organizationPlugin.options ?? {};
  const hooks = (organizationPlugin.options.organizationHooks =
    organizationPlugin.options.organizationHooks ?? {});

  hooks.afterCreateOrganization = wrapOrgHook(hooks.afterCreateOrganization, async (p) =>
    emit(
      catalog.organization.trackOrganizationCreated(
        p.organization,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterUpdateOrganization = wrapOrgHook(hooks.afterUpdateOrganization, async (p) => {
    if (!p.organization) return;
    await emit(
      catalog.organization.trackOrganizationUpdated(
        p.organization,
        getOrganizationTriggerInfo(p.user),
      ),
    );
  });

  hooks.afterAddMember = wrapOrgHook(hooks.afterAddMember, async (p) =>
    emit(
      catalog.member.trackOrganizationMemberAdded(
        p.organization,
        p.member,
        p.user,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterRemoveMember = wrapOrgHook(hooks.afterRemoveMember, async (p) =>
    emit(
      catalog.member.trackOrganizationMemberRemoved(
        p.organization,
        p.member,
        p.user,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterUpdateMemberRole = wrapOrgHook(hooks.afterUpdateMemberRole, async (p) =>
    emit(
      catalog.member.trackOrganizationMemberRoleUpdated(
        p.organization,
        p.member,
        p.user,
        p.previousRole,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterCreateInvitation = wrapOrgHook(hooks.afterCreateInvitation, async (p) =>
    emit(
      catalog.invitation.trackOrganizationMemberInvited(
        p.organization,
        p.invitation,
        p.inviter,
        getOrganizationTriggerInfo(p.inviter),
      ),
    ),
  );

  hooks.afterAcceptInvitation = wrapOrgHook(hooks.afterAcceptInvitation, async (p) =>
    emit(
      catalog.invitation.trackOrganizationMemberInviteAccepted(
        p.organization,
        p.invitation,
        p.member,
        p.user,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterRejectInvitation = wrapOrgHook(hooks.afterRejectInvitation, async (p) =>
    emit(
      catalog.invitation.trackOrganizationMemberInviteRejected(
        p.organization,
        p.invitation,
        p.user,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterCancelInvitation = wrapOrgHook(hooks.afterCancelInvitation, async (p) =>
    emit(
      catalog.invitation.trackOrganizationMemberInviteCanceled(
        p.organization,
        p.invitation,
        p.cancelledBy,
        getOrganizationTriggerInfo(p.cancelledBy),
      ),
    ),
  );

  hooks.afterCreateTeam = wrapOrgHook(hooks.afterCreateTeam, async (p) =>
    emit(
      catalog.team.trackOrganizationTeamCreated(
        p.organization,
        p.team,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterUpdateTeam = wrapOrgHook(hooks.afterUpdateTeam, async (p) => {
    if (!p.team) return;
    await emit(
      catalog.team.trackOrganizationTeamUpdated(
        p.organization,
        p.team,
        getOrganizationTriggerInfo(p.user),
      ),
    );
  });

  hooks.afterDeleteTeam = wrapOrgHook(hooks.afterDeleteTeam, async (p) =>
    emit(
      catalog.team.trackOrganizationTeamDeleted(
        p.organization,
        p.team,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterAddTeamMember = wrapOrgHook(hooks.afterAddTeamMember, async (p) =>
    emit(
      catalog.team.trackOrganizationTeamMemberAdded(
        p.organization,
        p.team,
        p.user,
        p.teamMember,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );

  hooks.afterRemoveTeamMember = wrapOrgHook(hooks.afterRemoveTeamMember, async (p) =>
    emit(
      catalog.team.trackOrganizationTeamMemberRemoved(
        p.organization,
        p.team,
        p.user,
        p.teamMember,
        getOrganizationTriggerInfo(p.user),
      ),
    ),
  );
}

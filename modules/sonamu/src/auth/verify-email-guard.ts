import { getLogger } from "@logtape/logtape";
import { type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";

/**
 * 누구나 알 수 있는 better-auth secret 값 목록입니다.
 *
 * 이 값으로 서명된 verify-email JWT는 외부인이 얼마든지 만들 수 있으므로 신뢰하지 않습니다.
 */
export const PUBLIC_AUTH_SECRETS: ReadonlySet<string> = new Set([
  // secret을 지정하지 않았을 때 better-auth가 쓰는 기본 상수(DEFAULT_SECRET)
  "better-auth-secret-12345678901234567890",
  // miomock·스캐폴드 예시 설정에 공개된 fallback 값
  "miomock-secret-key-change-this-in-production",
]);

/**
 * secret이 비어 있거나 공개된 값인지 확인합니다.
 */
export function isPublicAuthSecret(secret: string | undefined): boolean {
  return !secret || PUBLIC_AUTH_SECRETS.has(secret);
}

const VERIFY_EMAIL_PATH = "/verify-email";

/**
 * better-auth `/verify-email` 엔드포인트를 보호하는 Sonamu 내부 플러그인입니다.
 *
 * verify-email 토큰은 secret으로만 서명되는 stateless JWT이고, 이메일 변경 토큰이나
 * `autoSignInAfterVerification`이 쓰이면 쿠키 없는 요청에도 토큰 주인의 세션을 새로 발급합니다.
 * better-auth의 twoFactor 플러그인은 `/sign-in/*` 경로만 가로채므로 이 세션은 2FA도 거치지 않습니다.
 *
 * - 공개 secret으로 동작 중이면 verify-email 토큰을 모두 거부합니다.
 * - 2FA가 켜진 사용자에게 verify-email이 새로 발급한 세션은 쿠키와 DB에서 즉시 폐기합니다.
 *   이메일 인증·변경 자체는 그대로 반영되고, 로그인은 2FA를 거치는 일반 로그인으로 해야 합니다.
 *
 * Sonamu가 auth 초기화 시 자동으로 등록하므로 앱에서 직접 추가할 필요가 없습니다.
 */
export const sonamuVerifyEmailGuard = () =>
  ({
    id: "sonamu-verify-email-guard",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === VERIFY_EMAIL_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            if (!isPublicAuthSecret(ctx.context.secret)) return;
            getLogger(["sonamu", "auth"]).error(
              "Rejected a /verify-email request because the auth secret is a publicly known value. Set BETTER_AUTH_SECRET to a random secret.",
            );
            // 이 시점에는 callbackURL의 origin 검사가 끝나지 않았으므로 리다이렉트하지 않고 바로 거부한다.
            throw new APIError("UNAUTHORIZED", { code: "INVALID_TOKEN", message: "Invalid token" });
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === VERIFY_EMAIL_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const issued = ctx.context.newSession;
            if (!issued) return;

            // 요청에 실려 온 본인 세션을 재사용한 경우는 이미 2FA를 거친 로그인이므로 그대로 둔다.
            const requestToken = await ctx.getSignedCookie(
              ctx.context.authCookies.sessionToken.name,
              ctx.context.secret,
            );
            if (requestToken === issued.session.token) return;

            const user = await ctx.context.internalAdapter.findUserById(issued.user.id);
            if (!user || !("twoFactorEnabled" in user) || user.twoFactorEnabled !== true) return;

            // twoFactor 플러그인의 로그인 처리와 같이, 앞서 붙은 세션 쿠키를 지우고 세션을 폐기한다.
            deleteSessionCookie(ctx, true);
            await ctx.context.internalAdapter.deleteSession(issued.session.token);
            ctx.context.setNewSession(null);
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

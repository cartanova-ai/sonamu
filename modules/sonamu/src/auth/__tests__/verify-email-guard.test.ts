import { Buffer } from "node:buffer";
import crypto from "node:crypto";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { twoFactor } from "better-auth/plugins";
import { describe, expect, test } from "vitest";

import { sonamuVerifyEmailGuard } from "../verify-email-guard";

const BASE_URL = "http://localhost:35601";
const STRONG_SECRET = crypto.randomBytes(32).toString("base64");
const PUBLIC_FALLBACK_SECRET = "miomock-secret-key-change-this-in-production";
const BETTER_AUTH_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";
const PASSWORD = "Passw0rd!son601";

type MemoryDB = Parameters<typeof memoryAdapter>[0];

/** verify-email 엔드포인트가 해석하는 JWT 본문 필드 */
type VerifyEmailTokenPayload = {
  email: string;
  updateTo?: string;
  requestType?: string;
  iat?: number;
  exp?: number;
};

const encodeJwtPart = (value: { alg: string; typ: string } | VerifyEmailTokenPayload) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** secret을 아는 공격자가 만드는 것과 같은 HS256 verify-email JWT를 서명한다. */
function forgeVerifyEmailToken(secret: string, payload: VerifyEmailTokenPayload): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJwtPart({ alg: "HS256", typ: "JWT" });
  const body = encodeJwtPart({ ...payload, iat: now, exp: now + 600 });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

async function setup(secret: string) {
  // memory 어댑터는 모델 배열이 미리 있어야 한다.
  const db: MemoryDB = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  const auth = betterAuth({
    baseURL: BASE_URL,
    secret,
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    emailVerification: { autoSignInAfterVerification: true },
    // 세션 데이터 쿠키(session_data)도 함께 지워지는지 보기 위해 cookieCache를 켠다.
    session: { cookieCache: { enabled: true } },
    plugins: [sonamuVerifyEmailGuard(), twoFactor()],
    logger: { disabled: true },
  });

  /** 사용자를 만들고 가입 시 생긴 세션은 지워 "쿠키 없는 공격자" 상태에서 시작한다. */
  async function createUser(email: string, opts: { twoFactorEnabled: boolean }) {
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: email } });
    const user = db.user?.find((u) => u.email === email);
    if (!user) throw new Error("사용자 생성 실패");
    user.twoFactorEnabled = opts.twoFactorEnabled;
    db.session = db.session?.filter((s) => s.userId !== user.id) ?? [];
    return user;
  }

  async function signIn(email: string): Promise<string> {
    const res = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    const cookie = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.session_token="));
    if (!cookie) throw new Error("로그인 실패");
    return cookie.split(";")[0] ?? "";
  }

  function verifyEmail(token: string, opts: { cookie?: string; callbackURL?: string } = {}) {
    const url = new URL(`${BASE_URL}/api/auth/verify-email`);
    url.searchParams.set("token", token);
    if (opts.callbackURL) url.searchParams.set("callbackURL", opts.callbackURL);
    return auth.handler(
      new Request(url, { headers: opts.cookie ? { cookie: opts.cookie } : undefined }),
    );
  }

  const sessionsOf = (userId: string) => db.session?.filter((s) => s.userId === userId) ?? [];

  return { auth, db, createUser, signIn, verifyEmail, sessionsOf };
}

/** 응답에서 값이 살아 있는(만료 처리되지 않은) 세션 쿠키만 골라낸다. */
function liveSessionCookies(res: Response): string[] {
  return res.headers.getSetCookie().filter((c) => {
    const match = /^better-auth\.session_(?:token|data)(?:\.\d+)?=([^;]*)/.exec(c);
    return match !== null && match[1] !== "" && !/max-age=0/i.test(c);
  });
}

describe("verify-email 가드 — 공개 secret 토큰 거부 (SON-601)", () => {
  test.each([
    ["예시 fallback secret", PUBLIC_FALLBACK_SECRET],
    ["better-auth 기본 secret", BETTER_AUTH_DEFAULT_SECRET],
  ])("%s로 서명한 이메일 변경 토큰은 401이고 세션·이메일이 바뀌지 않는다", async (_, secret) => {
    const ctx = await setup(secret);
    const victim = await ctx.createUser("victim@son601.test", { twoFactorEnabled: false });
    const token = forgeVerifyEmailToken(secret, {
      email: "victim@son601.test",
      updateTo: "attacker@evil.test",
      requestType: "change-email-verification",
    });

    const res = await ctx.verifyEmail(token);

    expect(res.status).toBe(401);
    expect(liveSessionCookies(res)).toEqual([]);
    expect(ctx.sessionsOf(victim.id)).toHaveLength(0);
    expect(victim.email).toBe("victim@son601.test");
  });

  test("공개 secret이면 callbackURL이 있어도 리다이렉트하지 않고 401로 거부한다", async () => {
    const ctx = await setup(PUBLIC_FALLBACK_SECRET);
    await ctx.createUser("victim@son601.test", { twoFactorEnabled: false });
    const token = forgeVerifyEmailToken(PUBLIC_FALLBACK_SECRET, { email: "victim@son601.test" });

    const res = await ctx.verifyEmail(token, { callbackURL: "https://evil.test/landing" });

    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("verify-email 가드 — 2FA 계정 세션 발급 차단 (SON-601)", () => {
  test("2FA 계정은 이메일 변경 토큰만으로 세션을 얻지 못한다", async () => {
    const ctx = await setup(STRONG_SECRET);
    const victim = await ctx.createUser("victim@son601.test", { twoFactorEnabled: true });
    const token = forgeVerifyEmailToken(STRONG_SECRET, {
      email: "victim@son601.test",
      updateTo: "victim-new@son601.test",
      requestType: "change-email-verification",
    });

    const res = await ctx.verifyEmail(token);

    expect(res.status).toBe(200);
    expect(liveSessionCookies(res)).toEqual([]);
    expect(ctx.sessionsOf(victim.id)).toHaveLength(0);
  });

  test("callbackURL 리다이렉트 응답에도 2FA 계정의 세션 쿠키가 실리지 않는다", async () => {
    const ctx = await setup(STRONG_SECRET);
    const victim = await ctx.createUser("victim@son601.test", { twoFactorEnabled: true });
    const token = forgeVerifyEmailToken(STRONG_SECRET, {
      email: "victim@son601.test",
      updateTo: "victim-new@son601.test",
      requestType: "change-email-verification",
    });

    const res = await ctx.verifyEmail(token, { callbackURL: `${BASE_URL}/done` });

    expect(res.status).toBe(302);
    expect(liveSessionCookies(res)).toEqual([]);
    expect(ctx.sessionsOf(victim.id)).toHaveLength(0);
  });

  test("updateTo만 있는 레거시 토큰으로도 2FA 계정은 세션을 얻지 못한다", async () => {
    const ctx = await setup(STRONG_SECRET);
    const victim = await ctx.createUser("victim@son601.test", { twoFactorEnabled: true });
    const token = forgeVerifyEmailToken(STRONG_SECRET, {
      email: "victim@son601.test",
      updateTo: "victim-new@son601.test",
    });

    const res = await ctx.verifyEmail(token);

    expect(liveSessionCookies(res)).toEqual([]);
    expect(ctx.sessionsOf(victim.id)).toHaveLength(0);
  });

  test("autoSignInAfterVerification이 켜져도 2FA 계정은 인증만 되고 세션은 발급되지 않는다", async () => {
    const ctx = await setup(STRONG_SECRET);
    const victim = await ctx.createUser("victim@son601.test", { twoFactorEnabled: true });
    const token = forgeVerifyEmailToken(STRONG_SECRET, { email: "victim@son601.test" });

    const res = await ctx.verifyEmail(token);

    expect(res.status).toBe(200);
    expect(victim.emailVerified).toBe(true);
    expect(liveSessionCookies(res)).toEqual([]);
    expect(ctx.sessionsOf(victim.id)).toHaveLength(0);
  });

  test("2FA로 이미 로그인한 본인 세션은 이메일 변경 확인 뒤에도 유지된다", async () => {
    const ctx = await setup(STRONG_SECRET);
    const user = await ctx.createUser("owner@son601.test", { twoFactorEnabled: false });
    const cookie = await ctx.signIn("owner@son601.test");
    user.twoFactorEnabled = true;
    const [existing] = ctx.sessionsOf(user.id);
    const token = forgeVerifyEmailToken(STRONG_SECRET, {
      email: "owner@son601.test",
      updateTo: "owner-new@son601.test",
      requestType: "change-email-verification",
    });

    const res = await ctx.verifyEmail(token, { cookie });

    expect(res.status).toBe(200);
    expect(user.email).toBe("owner-new@son601.test");
    expect(ctx.sessionsOf(user.id)).toEqual([existing]);
  });

  test("2FA가 꺼진 계정은 기존 better-auth 동작대로 세션을 받는다", async () => {
    const ctx = await setup(STRONG_SECRET);
    const user = await ctx.createUser("plain@son601.test", { twoFactorEnabled: false });
    const token = forgeVerifyEmailToken(STRONG_SECRET, { email: "plain@son601.test" });

    const res = await ctx.verifyEmail(token);

    expect(res.status).toBe(200);
    expect(liveSessionCookies(res)).not.toEqual([]);
    expect(ctx.sessionsOf(user.id)).toHaveLength(1);
  });
});

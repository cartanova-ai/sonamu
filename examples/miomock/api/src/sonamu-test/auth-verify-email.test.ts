import crypto from "node:crypto";

import { betterAuth } from "better-auth";
import { DB, Sonamu } from "sonamu";
import { bootstrap } from "sonamu/test";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

bootstrap(vi);

const BASE_URL = "http://localhost:10280";
// 저장소에 공개된 예시 fallback secret (공격자가 아는 값)
const PUBLIC_FALLBACK_SECRET = "miomock-secret-key-change-this-in-production";

type AuthHandler = (request: Request) => Promise<Response>;

/** better-auth sign-up 응답에서 이 테스트가 쓰는 부분 */
const SignUpResponse = z.object({ user: z.object({ id: z.string() }) });

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

async function signUp(handler: AuthHandler, email: string): Promise<string> {
  const res = await handler(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
      body: JSON.stringify({ email, password: "Passw0rd!son601", name: "son601" }),
    }),
  );
  expect(res.status).toBe(200);
  const json = SignUpResponse.parse(await res.json());
  // 가입 시 생긴 세션은 지워 "쿠키 없는 공격자" 상태에서 시작한다.
  await DB.getDB("w")("sessions").where("user_id", json.user.id).delete();
  return json.user.id;
}

function verifyEmail(handler: AuthHandler, token: string): Promise<Response> {
  return handler(new Request(`${BASE_URL}/api/auth/verify-email?token=${token}`));
}

const hasLiveSessionCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .some((c) => /^better-auth\.session_token=[^;]+/.test(c) && !/max-age=0/i.test(c));

async function sessionCount(userId: string): Promise<number> {
  const rows = await DB.getDB("w")("sessions").where("user_id", userId);
  return rows.length;
}

describe("verify-email 위조 토큰 방어 (SON-601)", () => {
  test("공개 fallback secret으로 서명한 이메일 변경 토큰은 거부되고 세션·이메일이 그대로다", async () => {
    const handler: AuthHandler = (request) => Sonamu.auth.handler(request);
    const userId = await signUp(handler, "son601-public@test.com");
    const token = forgeVerifyEmailToken(PUBLIC_FALLBACK_SECRET, {
      email: "son601-public@test.com",
      updateTo: "attacker@evil.example",
      requestType: "change-email-verification",
    });

    const res = await verifyEmail(handler, token);

    expect(res.status).toBe(401);
    expect(hasLiveSessionCookie(res)).toBe(false);
    expect(await sessionCount(userId)).toBe(0);
    const row = await DB.getDB("w")("users").where("id", userId).first();
    expect(row.email).toBe("son601-public@test.com");
  });

  test("비공개 secret이어도 2FA 계정은 verify-email 토큰만으로 세션을 얻지 못한다", async () => {
    // Sonamu가 구성한 실제 auth 옵션(필드 매핑·어댑터·자동 등록 가드)에서 secret만 바꾼다.
    const secret = crypto.randomBytes(32).toString("base64");
    const auth = betterAuth({ ...Sonamu.auth.options, secret });
    const handler: AuthHandler = (request) => auth.handler(request);
    const userId = await signUp(handler, "son601-2fa@test.com");
    await DB.getDB("w")("users").where("id", userId).update({ two_factor_enabled: true });
    const token = forgeVerifyEmailToken(secret, {
      email: "son601-2fa@test.com",
      updateTo: "son601-2fa-new@test.com",
      requestType: "change-email-verification",
    });

    const res = await verifyEmail(handler, token);

    expect(res.status).toBe(200);
    expect(hasLiveSessionCookie(res)).toBe(false);
    expect(await sessionCount(userId)).toBe(0);
  });
});

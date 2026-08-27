import { DB, Sonamu } from "sonamu";
import { bootstrap } from "sonamu/test";
import { describe, expect, test, vi } from "vitest";

bootstrap(vi);

const AUTH_BASE = "http://localhost:10280/api/auth";

async function callAuth(path: string, init: { body: unknown; cookie?: string }): Promise<Response> {
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": "127.0.0.1",
  });
  if (init.cookie) {
    headers.set("cookie", init.cookie);
  }
  const request = new Request(`${AUTH_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(init.body),
  });
  return Sonamu.auth.handler(request);
}

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const firstPair = setCookie.split(";")[0] ?? "";
  return firstPair;
}

type SignUpResponse = { user: { id: string } };

async function signUp(email: string, password: string): Promise<string> {
  const res = await callAuth("/sign-up/email", {
    body: { email, password, name: email.split("@")[0] ?? "user" },
  });
  expect(res.status).toBe(200);
  // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
  const json = (await res.json()) as SignUpResponse;
  return json.user.id;
}

async function createAdminAndGetCookie(email: string, password: string): Promise<string> {
  const adminId = await signUp(email, password);

  const wdb = DB.getDB("w");
  await wdb("users").where("id", adminId).update({ role: "admin" });

  const signInRes = await callAuth("/sign-in/email", { body: { email, password } });
  expect(signInRes.status).toBe(200);
  return extractSessionCookie(signInRes);
}

describe("auth admin", () => {
  test("should ban user with reason and expiry seconds", async () => {
    const adminCookie = await createAdminAndGetCookie("admin-ban@test.com", "admin-pass-123");
    const targetId = await signUp("target-ban@test.com", "target-pass-123");

    const banReason = "규정 위반으로 인한 정지";
    const banExpiresIn = 60;
    const beforeMs = Date.now();

    const banRes = await callAuth("/admin/ban-user", {
      cookie: adminCookie,
      body: { userId: targetId, banReason, banExpiresIn },
    });
    expect(banRes.status).toBe(200);

    const afterMs = Date.now();

    const wdb = DB.getDB("w");
    const row = await wdb("users").where("id", targetId).first();
    expect(row).toBeDefined();
    expect(row.banned).toBe(true);
    expect(row.ban_reason).toBe(banReason);
    expect(row.ban_expires).toBeInstanceOf(Date);

    const expiresMs = Number(new Date(row.ban_expires).getTime());
    const expectedMinMs = beforeMs + banExpiresIn * 1000 - 5_000;
    const expectedMaxMs = afterMs + banExpiresIn * 1000 + 5_000;
    expect(expiresMs).toBeGreaterThanOrEqual(expectedMinMs);
    expect(expiresMs).toBeLessThanOrEqual(expectedMaxMs);
  });

  test("should unban user and clear ban fields", async () => {
    const adminCookie = await createAdminAndGetCookie("admin-unban@test.com", "admin-pass-123");
    const targetId = await signUp("target-unban@test.com", "target-pass-123");

    const banRes = await callAuth("/admin/ban-user", {
      cookie: adminCookie,
      body: { userId: targetId, banReason: "초기 밴", banExpiresIn: 60 },
    });
    expect(banRes.status).toBe(200);

    const unbanRes = await callAuth("/admin/unban-user", {
      cookie: adminCookie,
      body: { userId: targetId },
    });
    expect(unbanRes.status).toBe(200);

    const wdb = DB.getDB("w");
    const row = await wdb("users").where("id", targetId).first();
    expect(row).toBeDefined();
    expect(row.banned).toBe(false);
    expect(row.ban_reason).toBeNull();
    expect(row.ban_expires).toBeNull();
  });
});

describe("auth admin 통합", () => {
  test("admin.banUser 호출 시 audit_events에 user_banned 1건이 적재된다", async () => {
    const adminCookie = await createAdminAndGetCookie("admin-ac12@test.com", "admin-pass-123");
    const targetId = await signUp("target-ac12@test.com", "target-pass-123");

    const banReason = "AC-12 회귀";
    const banRes = await callAuth("/admin/ban-user", {
      cookie: adminCookie,
      body: { userId: targetId, banReason, banExpiresIn: 60 },
    });
    expect(banRes.status).toBe(200);

    const wdb = DB.getDB("w");
    const rows = await wdb("audit_events")
      .where({ event_type: "user_banned", subject_user_id: targetId })
      .select("*");
    expect(rows.length).toBe(1);
    expect(rows[0].reason).toBe(banReason);
    expect(rows[0].ip_address).toBe("127.0.0.1");
  });
});

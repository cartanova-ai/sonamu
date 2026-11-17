import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, test } from "vitest";

import { buildBetterAuthOptions } from "../better-auth-options";
import { passkey, twoFactor } from "../plugins/wrappers";

const BASE_URL = "http://localhost:3000";

type StoredRow = { role?: string; email?: string };

// better-auth memory adapter가 테이블 이름(modelName)별로 행을 저장하는 저장소
type MemoryAuthTables = {
  users: StoredRow[];
  sessions: StoredRow[];
  accounts: StoredRow[];
  verifications: StoredRow[];
};

type AuthRequestBody = {
  email?: string;
  password?: string;
  name?: string;
  role?: string;
  created_at?: string;
};

type AdditionalFields = NonNullable<
  NonNullable<Parameters<typeof buildBetterAuthOptions>[0]["user"]>["additionalFields"]
>;

// 수정 전 스캐폴드 auth 예시의 additionalFields (input 미지정)
const LEGACY_SCAFFOLD_FIELDS: AdditionalFields = {
  role: { type: "string", sonamuType: "UserRole" },
  created_at: { type: "date" },
};

// create-sonamu 스캐폴드의 주석 처리된 auth 예시를 켠 설정 (admin 플러그인 없음)
function createScaffoldAuth(additionalFields: AdditionalFields = LEGACY_SCAFFOLD_FIELDS) {
  const db: MemoryAuthTables = {
    users: [],
    sessions: [],
    accounts: [],
    verifications: [],
  };
  const auth = betterAuth({
    database: memoryAdapter(db),
    ...buildBetterAuthOptions({
      appName: "Sonamu Project",
      plugins: [twoFactor(), passkey()],
      emailAndPassword: { enabled: true },
      baseURL: BASE_URL,
      secret: "son-609-test-secret-son-609-test-secret",
      trustedOrigins: [BASE_URL],
      user: {
        fields: {
          name: "username",
          emailVerified: "is_verified",
        },
        additionalFields,
      },
    }),
  });
  return { auth, db };
}

function post(
  auth: ReturnType<typeof createScaffoldAuth>["auth"],
  path: string,
  body: AuthRequestBody,
  cookie?: string,
) {
  const headers = new Headers({ "content-type": "application/json", origin: BASE_URL });
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe("buildBetterAuthOptions", () => {
  test("input을 지정하지 않은 user.additionalFields는 input: false가 된다", () => {
    const options = buildBetterAuthOptions({
      user: {
        additionalFields: {
          role: { type: "string", sonamuType: "UserRole" },
          created_at: { type: "date" },
        },
      },
    });

    expect(options.user?.additionalFields).toEqual({
      role: { type: "string", sonamuType: "UserRole", input: false },
      created_at: { type: "date", input: false },
    });
  });

  test("명시한 input 값은 그대로 둔다", () => {
    const options = buildBetterAuthOptions({
      user: {
        additionalFields: {
          nickname: { type: "string", input: true },
          role: { type: "string", input: false, defaultValue: "user" },
        },
      },
    });

    expect(options.user?.additionalFields).toEqual({
      nickname: { type: "string", input: true },
      role: { type: "string", input: false, defaultValue: "user" },
    });
  });

  test("사용자 설정 객체를 바꾸지 않고 기본 필드 매핑을 합친다", () => {
    const role = { type: "string" as const };
    const authConfig = { user: { additionalFields: { role } } };

    const options = buildBetterAuthOptions(authConfig);

    expect(role).toEqual({ type: "string" });
    expect(options.user?.modelName).toBe("users");
    expect(options.session?.modelName).toBe("sessions");
  });

  test("additionalFields가 없으면 기본 필드 매핑만 합친다", () => {
    const options = buildBetterAuthOptions({ appName: "Sonamu" });

    expect(options.appName).toBe("Sonamu");
    expect(options.user?.additionalFields).toBeUndefined();
    expect(options.user?.fields?.emailVerified).toBe("email_verified");
  });
});

describe("스캐폴드 auth 예시의 role 자가 승격 방지 (SON-609)", () => {
  test("sign-up 바디의 role과 created_at을 저장하지 않는다", async () => {
    const { auth, db } = createScaffoldAuth();

    const response = await post(auth, "/sign-up/email", {
      email: "self-admin@son609.test",
      password: "Passw0rd!son609",
      name: "self-admin",
      role: "admin",
      created_at: "1999-01-01T00:00:00Z",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    expect(db.users).toEqual([]);
  });

  test("현재 스캐폴드 예시(input: false, defaultValue)는 sign-up 바디의 role을 무시하고 기본값을 저장한다", async () => {
    const { auth, db } = createScaffoldAuth({
      role: { type: "string", sonamuType: "UserRole", input: false, defaultValue: "user" },
      created_at: { type: "date", input: false },
    });

    const response = await post(auth, "/sign-up/email", {
      email: "self-admin@son609.test",
      password: "Passw0rd!son609",
      name: "self-admin",
      role: "admin",
    });

    expect(response.status).toBe(200);
    expect(db.users).toHaveLength(1);
    expect(db.users[0]?.role).toBe("user");
  });

  test("role 없이 가입한 사용자는 update-user로 role을 바꿀 수 없다", async () => {
    const { auth, db } = createScaffoldAuth();
    const signUp = await post(auth, "/sign-up/email", {
      email: "normal@son609.test",
      password: "Passw0rd!son609",
      name: "normal",
    });
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");

    const update = await post(auth, "/update-user", { role: "admin" }, cookie);

    expect(update.status).toBe(400);
    expect(await update.json()).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    expect(db.users).toHaveLength(1);
    expect(db.users[0]?.role).toBeUndefined();
  });
});

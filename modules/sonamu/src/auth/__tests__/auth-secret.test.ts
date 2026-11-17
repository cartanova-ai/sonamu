import { describe, expect, test } from "vitest";

import {
  assertAuthSecretConfigured,
  KNOWN_PUBLIC_AUTH_SECRETS,
  resolveAuthSecretCandidates,
} from "../auth-secret";

const STRONG_SECRET = "Yq3vN8kP2xR7tL0wZ5mB9cH4jF6sD1gA";
const MIOMOCK_FALLBACK = "miomock-secret-key-change-this-in-production";
const BETTER_AUTH_DEFAULT = "better-auth-secret-12345678901234567890";

describe("assertAuthSecretConfigured — secret 누락·공개값 기동 거부 (SON-600)", () => {
  test.each(["development", "staging", "production"] as const)(
    "%s에서 secret이 없으면 오류를 던진다",
    (environment) => {
      expect(() => assertAuthSecretConfigured({}, {}, environment)).toThrow(/secret is missing/);
    },
  );

  test("NODE_ENV가 없으면 development로 보고 secret 누락을 거부한다", () => {
    expect(() => assertAuthSecretConfigured({}, {})).toThrow(/NODE_ENV=development/);
  });

  test("공백뿐인 secret은 없는 것으로 본다", () => {
    expect(() =>
      assertAuthSecretConfigured({ secret: "   " }, { BETTER_AUTH_SECRET: " " }, "production"),
    ).toThrow(/secret is missing/);
  });

  test.each([MIOMOCK_FALLBACK, BETTER_AUTH_DEFAULT, "better-auth-secret-123456789"])(
    "공개된 secret(%s)은 설정·환경변수 어느 쪽이든 거부한다",
    (publicSecret) => {
      expect(() => assertAuthSecretConfigured({ secret: publicSecret }, {}, "staging")).toThrow(
        /publicly known/,
      );
      expect(() =>
        assertAuthSecretConfigured({}, { BETTER_AUTH_SECRET: publicSecret }, "development"),
      ).toThrow(/publicly known/);
      expect(() =>
        assertAuthSecretConfigured({}, { AUTH_SECRET: ` ${publicSecret} ` }, "production"),
      ).toThrow(/publicly known/);
    },
  );

  test("오류 메시지에 secret 값을 넣지 않는다", () => {
    expect(() =>
      assertAuthSecretConfigured({ secret: MIOMOCK_FALLBACK }, {}, "production"),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining(MIOMOCK_FALLBACK) }));
  });

  test("교체용 secrets 목록에 공개값이 하나라도 있으면 거부한다", () => {
    expect(() =>
      assertAuthSecretConfigured(
        {
          secrets: [
            { version: 2, value: STRONG_SECRET },
            { version: 1, value: MIOMOCK_FALLBACK },
          ],
        },
        {},
        "production",
      ),
    ).toThrow(/publicly known/);
    expect(() =>
      assertAuthSecretConfigured(
        {},
        { BETTER_AUTH_SECRETS: `2:${STRONG_SECRET}, 1:${MIOMOCK_FALLBACK}` },
        "production",
      ),
    ).toThrow(/publicly known/);
  });

  test("secrets 목록이 있어도 함께 남는 legacy secret이 공개값이면 거부한다", () => {
    expect(() =>
      assertAuthSecretConfigured(
        { secrets: [{ version: 1, value: STRONG_SECRET }] },
        { BETTER_AUTH_SECRET: MIOMOCK_FALLBACK },
        "production",
      ),
    ).toThrow(/publicly known/);
  });

  test("임의의 secret이 있으면 모든 환경에서 통과한다", () => {
    for (const environment of ["development", "staging", "production"] as const) {
      expect(() =>
        assertAuthSecretConfigured({ secret: STRONG_SECRET }, {}, environment),
      ).not.toThrow();
      expect(() =>
        assertAuthSecretConfigured({}, { BETTER_AUTH_SECRET: STRONG_SECRET }, environment),
      ).not.toThrow();
      expect(() =>
        assertAuthSecretConfigured({}, { BETTER_AUTH_SECRETS: `1:${STRONG_SECRET}` }, environment),
      ).not.toThrow();
    }
  });

  test("test 환경은 secret이 없거나 공개값이어도 검사하지 않는다", () => {
    expect(() => assertAuthSecretConfigured({}, {}, "test")).not.toThrow();
    expect(() =>
      assertAuthSecretConfigured({ secret: MIOMOCK_FALLBACK }, {}, "test"),
    ).not.toThrow();
  });
});

describe("resolveAuthSecretCandidates — better-auth와 같은 secret 해석 (SON-600)", () => {
  test("설정의 secret이 환경변수보다 우선한다", () => {
    expect(
      resolveAuthSecretCandidates({ secret: STRONG_SECRET }, { BETTER_AUTH_SECRET: "env-secret" }),
    ).toEqual([STRONG_SECRET]);
  });

  test("BETTER_AUTH_SECRET이 없으면 AUTH_SECRET을 쓴다", () => {
    expect(resolveAuthSecretCandidates({}, { AUTH_SECRET: STRONG_SECRET })).toEqual([
      STRONG_SECRET,
    ]);
  });

  test("설정의 secrets가 BETTER_AUTH_SECRETS보다 우선한다", () => {
    expect(
      resolveAuthSecretCandidates(
        { secrets: [{ version: 1, value: STRONG_SECRET }] },
        { BETTER_AUTH_SECRETS: `1:${MIOMOCK_FALLBACK}` },
      ),
    ).toEqual([STRONG_SECRET]);
  });

  test("공개 secret 목록에 예시 fallback과 better-auth 기본값이 들어 있다", () => {
    expect(KNOWN_PUBLIC_AUTH_SECRETS).toEqual(
      expect.arrayContaining([MIOMOCK_FALLBACK, BETTER_AUTH_DEFAULT]),
    );
  });
});

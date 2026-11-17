import { request as httpRequest } from "node:http";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { type SonamuServerOptions } from "../../api/config";
import { resolveAuthBaseURL } from "../base-url";
import { createBetterAuthRequest } from "../better-auth-request";

// better-auth가 baseURL로 읽는 환경 변수들. 실행 환경 값이 섞이지 않도록 매 테스트 비운다.
const BETTER_AUTH_URL_ENV_KEYS = [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "PUBLIC_BETTER_AUTH_URL",
  "NUXT_PUBLIC_BETTER_AUTH_URL",
  "NUXT_PUBLIC_AUTH_URL",
  "BASE_URL",
];

const USER_EMAIL = "victim@example.com";

type Harness = { server: FastifyInstance; port: number; resetLinks: string[] };

/**
 * Sonamu.init + registerBetterAuth와 같은 방식으로 better-auth를 구성해 실제 포트로 띄운다.
 * (baseURL은 resolveAuthBaseURL로 정하고, 라우트는 createBetterAuthRequest로 변환한다)
 */
async function startAuthServer(
  serverOptions: Pick<SonamuServerOptions, "auth" | "baseUrl" | "listen">,
): Promise<Harness> {
  const resolution = resolveAuthBaseURL(serverOptions, { local: true });
  const resetLinks: string[] = [];
  const auth = betterAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    secret: "son-612-test-secret-0123456789abcdef",
    rateLimit: { enabled: false },
    logger: { disabled: true },
    // better-auth는 NODE_ENV=test에서 origin 검사를 끄므로 프로덕션과 같게 켠다
    advanced: { disableOriginCheck: false },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ url }) => {
        resetLinks.push(url);
      },
    },
    ...serverOptions.auth,
    baseURL: resolution.baseURL,
  });
  await auth.api.signUpEmail({
    body: { email: USER_EMAIL, password: "Passw0rd!son612", name: "victim" },
  });

  const server = Fastify();
  server.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      const response = await auth.handler(
        createBetterAuthRequest(request, undefined, resolution.requestBaseURL),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      return reply.send(response.body ? await response.text() : null);
    },
  });
  await server.listen({ port: 0, host: "127.0.0.1" });
  // Fastify의 addresses()는 TCP listen 주소만 AddressInfo로 돌려준다.
  const address = server.addresses().at(0);
  if (address === undefined) {
    await server.close();
    throw new Error("listen한 TCP 주소를 얻지 못했습니다");
  }
  return { server, port: address.port, resetLinks };
}

/** 비밀번호 리셋 요청 본문 */
type PasswordResetBody = { email: string; redirectTo: string };

/** Host 헤더와 request-target을 임의로 지정해 원시 HTTP 요청을 보낸다 */
function rawPost(
  port: number,
  target: string,
  host: string,
  body: PasswordResetBody,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: target,
        headers: {
          host,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

describe("better-auth 비밀번호 리셋 링크 Host 헤더 포이즈닝 방지 (SON-612)", () => {
  let harness: Harness | undefined;

  beforeEach(() => {
    for (const key of BETTER_AUTH_URL_ENV_KEYS) vi.stubEnv(key, "");
  });

  afterEach(async () => {
    await harness?.server.close();
    harness = undefined;
    vi.unstubAllEnvs();
  });

  test("auth.baseURL 없이 server.baseUrl만 있을 때 Host: attacker.example로 요청해도 링크는 server.baseUrl을 가리킨다", async () => {
    harness = await startAuthServer({ baseUrl: "https://app.example.com", auth: {} });

    const res = await rawPost(
      harness.port,
      "/api/auth/request-password-reset",
      "attacker.example",
      {
        email: USER_EMAIL,
        redirectTo: "/reset",
      },
    );

    expect(res.status).toBe(200);
    expect(harness.resetLinks).toHaveLength(1);
    expect(new URL(harness.resetLinks[0]).origin).toBe("https://app.example.com");
  });

  test("절대형 request-target(http://abs-attacker.example/...)으로 요청해도 링크 도메인이 바뀌지 않는다", async () => {
    harness = await startAuthServer({ baseUrl: "https://app.example.com", auth: {} });

    const res = await rawPost(
      harness.port,
      "http://abs-attacker.example/api/auth/request-password-reset",
      `127.0.0.1:${harness.port}`,
      { email: USER_EMAIL, redirectTo: "/reset" },
    );

    expect(res.status).toBe(200);
    expect(harness.resetLinks).toHaveLength(1);
    expect(new URL(harness.resetLinks[0]).origin).toBe("https://app.example.com");
  });

  test("로컬 환경에서 아무 설정이 없어도 Host 대신 listen 주소로 링크를 만든다", async () => {
    harness = await startAuthServer({ listen: { host: "127.0.0.1", port: 4000 }, auth: {} });

    await rawPost(harness.port, "/api/auth/request-password-reset", "attacker.example", {
      email: USER_EMAIL,
      redirectTo: "/reset",
    });

    expect(harness.resetLinks).toHaveLength(1);
    expect(new URL(harness.resetLinks[0]).origin).toBe("http://127.0.0.1:4000");
  });

  test("Host 헤더의 도메인이 trustedOrigins에 들어가지 않아 외부 redirectTo를 거부한다", async () => {
    harness = await startAuthServer({ baseUrl: "https://app.example.com", auth: {} });

    const res = await rawPost(
      harness.port,
      "/api/auth/request-password-reset",
      "attacker.example",
      {
        email: USER_EMAIL,
        redirectTo: "http://attacker.example/steal",
      },
    );

    expect(res.status).toBe(403);
    expect(res.text).toContain("INVALID_REDIRECT_URL");
    expect(harness.resetLinks).toHaveLength(0);
  });
});

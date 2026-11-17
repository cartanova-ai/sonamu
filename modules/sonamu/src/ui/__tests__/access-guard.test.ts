import fastify, { type FastifyInstance, type RouteOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setSDConfig } from "../../dict/sd";
import {
  canServeSonamuUIToken,
  getSonamuUIToken,
  requireSonamuUIToken,
  SONAMU_UI_TOKEN_HEADER,
} from "../access-guard";
import { sonamuUIApiPlugin } from "../api";

const HOST = "localhost:10280";
// 없는 엔티티라 가드를 통과해도 핸들러가 파일을 지우기 전에 실패합니다.
const MISSING_ENTITY_BODY = "entityId=Son618MissingEntity";
// 읽기 전용 라우트에 없는 규칙을 요청해 가드 통과 여부만 확인합니다.
const MISSING_RULE_BODY = { ruleKey: "son618-missing-rule" };

let server: FastifyInstance;
const uiRoutes: RouteOptions[] = [];

beforeAll(async () => {
  setSDConfig({ defaultLocale: "ko", supportedLocales: ["ko"] });
  server = fastify();
  // 플러그인이 등록하는 모든 라우트의 최종 옵션을 모읍니다(같은 객체를 참조하므로 이후 수정도 반영됩니다).
  server.addHook("onRoute", (routeOptions) => {
    uiRoutes.push(routeOptions);
  });
  await server.register(import("@fastify/formbody"));
  await server.register(import("@fastify/multipart"));
  await server.register(sonamuUIApiPlugin);
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

function tokenHeaders(extra: Record<string, string> = {}) {
  return { host: HOST, [SONAMU_UI_TOKEN_HEADER]: getSonamuUIToken(), ...extra };
}

describe("Sonamu UI API 접근 토큰", () => {
  test("/sonamu-ui/api 아래 모든 라우트에 토큰 가드가 붙는다", () => {
    const apiRoutes = uiRoutes.filter((route) => route.url.startsWith("/sonamu-ui/api/"));
    // 가드 누락을 놓치지 않도록 라우트가 실제로 수집됐는지도 확인합니다.
    expect(apiRoutes.length).toBeGreaterThan(50);
    for (const route of apiRoutes) {
      const hooks = [route.onRequest ?? []].flat();
      expect(hooks[0], `${String(route.method)} ${route.url}`).toBe(requireSonamuUIToken);
    }
  });

  test("토큰 없는 GET·HEAD 요청은 401로 거부한다", async () => {
    for (const method of ["GET", "HEAD"] as const) {
      const res = await server.inject({
        method,
        url: "/sonamu-ui/api/sonamu/config",
        headers: { host: HOST },
      });
      expect(res.statusCode, method).toBe(401);
    }
  });

  test("토큰 없는 form·no-cors·본문 없는 POST는 핸들러 전에 401로 거부한다", async () => {
    const crossSite = { host: HOST, origin: "http://evil.example", "sec-fetch-site": "cross-site" };
    const requests: { headers: Record<string, string>; payload?: string }[] = [
      {
        headers: { ...crossSite, "content-type": "application/x-www-form-urlencoded" },
        payload: MISSING_ENTITY_BODY,
      },
      {
        headers: { ...crossSite, "content-type": "text/plain;charset=UTF-8" },
        payload: '{"entityId":"Son618MissingEntity"}',
      },
      { headers: crossSite },
    ];
    for (const { headers, payload } of requests) {
      const res = await server.inject({
        method: "POST",
        url: "/sonamu-ui/api/entity/del",
        headers,
        payload,
      });
      expect(res.statusCode, JSON.stringify(headers)).toBe(401);
    }
  });

  test("multipart 업로드도 토큰이 없으면 401로 거부한다", async () => {
    const boundary = "----son618";
    const res = await server.inject({
      method: "POST",
      url: "/sonamu-ui/api/i18n/import",
      headers: { host: HOST, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.xlsx"\r\n\r\nx\r\n--${boundary}--\r\n`,
    });
    expect(res.statusCode).toBe(401);
  });

  test("틀린 토큰은 401로 거부한다", async () => {
    for (const token of ["", "wrong", `${getSonamuUIToken()}x`, getSonamuUIToken().slice(1)]) {
      const res = await server.inject({
        method: "GET",
        url: "/sonamu-ui/api/sonamu/config",
        headers: { host: HOST, [SONAMU_UI_TOKEN_HEADER]: token },
      });
      expect(res.statusCode, token).toBe(401);
    }
  });

  test("퍼센트 인코딩한 경로로도 토큰 검사를 우회할 수 없다", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/sonamu-ui/%61pi/entity/del",
      headers: { host: HOST, "content-type": "application/x-www-form-urlencoded" },
      payload: MISSING_ENTITY_BODY,
    });
    expect([401, 404]).toContain(res.statusCode);
  });

  test("토큰이 있어도 다른 출처에서 온 요청은 403으로 거부한다", async () => {
    const crossOriginHeaders: Record<string, string>[] = [
      { origin: "http://evil.example", "sec-fetch-site": "cross-site" },
      // 같은 사이트의 다른 포트(localhost의 다른 개발 서버)도 다른 출처입니다.
      { origin: "http://localhost:3000", "sec-fetch-site": "same-site" },
      // Sec-Fetch-Site를 보내지 않는 브라우저는 Origin과 Host를 비교합니다.
      { origin: "http://evil.example" },
      { origin: "null" },
    ];
    for (const extra of crossOriginHeaders) {
      const res = await server.inject({
        method: "POST",
        url: "/sonamu-ui/api/cdd/readRule",
        headers: tokenHeaders({ "content-type": "application/json", ...extra }),
        payload: JSON.stringify(MISSING_RULE_BODY),
      });
      expect(res.statusCode, JSON.stringify(extra)).toBe(403);
    }
  });

  test("동일 출처 Sonamu UI의 토큰 요청은 가드를 통과해 핸들러까지 도달한다", async () => {
    const sameOriginHeaders: Record<string, string>[] = [
      { origin: `http://${HOST}`, "sec-fetch-site": "same-origin" },
      // ui-web Vite 개발 프록시(changeOrigin)는 Host를 바꾸지만 브라우저는 동일 출처로 표시합니다.
      { origin: "http://localhost:65000", "sec-fetch-site": "same-origin" },
      { origin: `http://${HOST}` },
      // 브라우저 밖 로컬 클라이언트
      {},
    ];
    for (const extra of sameOriginHeaders) {
      const res = await server.inject({
        method: "POST",
        url: "/sonamu-ui/api/cdd/readRule",
        headers: tokenHeaders({ "content-type": "application/json", ...extra }),
        payload: JSON.stringify(MISSING_RULE_BODY),
      });
      // 없는 규칙 파일이라 핸들러에서 실패합니다. 가드가 막았다면 401·403입니다.
      expect(res.statusCode, JSON.stringify(extra)).not.toBe(401);
      expect(res.statusCode, JSON.stringify(extra)).not.toBe(403);
      expect(res.statusCode, JSON.stringify(extra)).toBeGreaterThanOrEqual(400);
    }
  });
});

describe("index.html 접근 토큰 노출 범위", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = fastify();
    app.get("/index", async (request, reply) =>
      canServeSonamuUIToken(request) ? "token" : reply.code(403).send(),
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test("동일 출처 요청과 다른 출처에서의 페이지 이동은 토큰이 담긴 HTML을 받는다", async () => {
    const allowed: Record<string, string>[] = [
      {},
      { "sec-fetch-site": "none", "sec-fetch-mode": "navigate" },
      { "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" },
      // 다른 출처 링크로 이동하면 문서를 열 뿐, 링크를 건 페이지는 응답을 읽을 수 없습니다.
      { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
    ];
    for (const extra of allowed) {
      const res = await app.inject({
        method: "GET",
        url: "/index",
        headers: { host: HOST, ...extra },
      });
      expect(res.statusCode, JSON.stringify(extra)).toBe(200);
    }
  });

  test("다른 출처의 fetch·XHR로 HTML을 읽으려는 요청은 403으로 거부한다", async () => {
    const rejected: Record<string, string>[] = [
      { origin: "http://evil.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" },
      {
        origin: "http://evil.example",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "no-cors",
      },
      { origin: "http://evil.example" },
    ];
    for (const extra of rejected) {
      const res = await app.inject({
        method: "GET",
        url: "/index",
        headers: { host: HOST, ...extra },
      });
      expect(res.statusCode, JSON.stringify(extra)).toBe(403);
    }
  });
});

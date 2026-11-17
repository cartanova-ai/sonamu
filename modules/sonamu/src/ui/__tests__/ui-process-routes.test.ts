import fs from "fs";
import os from "os";
import path from "path";

import formbody from "@fastify/formbody";
import fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setSDConfig } from "../../dict/sd";
import { getSonamuUIToken } from "../access-guard";
import { sonamuUIApiPlugin } from "../api";

const HOST = "localhost:10280";
// SON-618 접근 토큰 검사를 통과시켜 SON-603 가드 자체의 거부·허용을 검증합니다.
const UI_TOKEN_HEADERS = { "x-sonamu-ui-token": getSonamuUIToken() };
const SAME_ORIGIN_HEADERS = {
  host: HOST,
  origin: `http://${HOST}`,
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
  "x-sonamu-ui": "1",
  ...UI_TOKEN_HEADERS,
};

/**
 * 프로세스를 실행하는 라우트와, 가드를 통과하더라도 프로세스 실행 전에 실패하는 무해한 본문입니다.
 * 가드가 막으면 403, 통과하면 핸들러의 검증 오류(400/500)가 나므로 상태 코드로 가드 동작을 구분합니다.
 */
type ProcessRoute = {
  url: string;
  payload: Record<string, string>;
};

let server: FastifyInstance;
let tmpDir: string;
let processRoutes: ProcessRoute[];

beforeAll(async () => {
  setSDConfig({ defaultLocale: "ko", supportedLocales: ["ko"] });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sonamu-ui-guard-"));
  const missingFile = path.join(tmpDir, "missing.ts");
  processRoutes = [
    // entityId·preset·absPath가 모두 없으면 400으로 끝납니다.
    { url: "/sonamu-ui/api/tools/openVscode", payload: {} },
    // 알 수 없는 에디터는 400으로 끝납니다.
    {
      url: "/sonamu-ui/api/tools/openEditor",
      payload: { editor: "unknown", absPath: missingFile },
    },
    // 없는 파일은 에디터를 찾기 전에 실패합니다.
    { url: "/sonamu-ui/api/cdd/openSource", payload: { filePath: missingFile } },
    { url: "/sonamu-ui/api/cdd/editContent", payload: { filePath: "missing.contract.md" } },
  ];

  server = fastify();
  await server.register(formbody);
  await server.register(sonamuUIApiPlugin);
  await server.ready();
});

afterAll(async () => {
  await server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function expectRejected(
  headers: Record<string, string>,
  bodyOf: (route: ProcessRoute) => string,
) {
  for (const route of processRoutes) {
    const res = await server.inject({
      method: "POST",
      url: route.url,
      headers,
      payload: bodyOf(route),
    });
    expect(res.statusCode, `${route.url} ${JSON.stringify(headers)}`).toBe(403);
  }
}

describe("Sonamu UI 프로세스 실행 API의 교차 출처 차단", () => {
  test("<img>·링크 이동으로 호출할 수 있는 GET 라우트는 등록하지 않는다", () => {
    for (const url of ["/sonamu-ui/api/tools/openVscode", "/sonamu-ui/api/tools/openEditor"]) {
      expect(server.hasRoute({ method: "GET", url }), url).toBe(false);
      expect(server.hasRoute({ method: "POST", url }), url).toBe(true);
    }
  });

  test("교차 출처 form POST(application/x-www-form-urlencoded)는 403으로 거부한다", async () => {
    await expectRejected(
      {
        host: HOST,
        origin: "http://evil.example",
        "sec-fetch-site": "cross-site",
        "content-type": "application/x-www-form-urlencoded",
        ...UI_TOKEN_HEADERS,
      },
      (route) => new URLSearchParams(route.payload).toString(),
    );
  });

  test("no-cors fetch(text/plain) POST는 403으로 거부한다", async () => {
    await expectRejected(
      {
        host: HOST,
        origin: "http://127.0.0.1:10997",
        "sec-fetch-site": "same-site",
        "content-type": "text/plain;charset=UTF-8",
        ...UI_TOKEN_HEADERS,
      },
      (route) => JSON.stringify(route.payload),
    );
  });

  test("X-Sonamu-UI 헤더가 없는 JSON 요청은 403으로 거부한다", async () => {
    const { "x-sonamu-ui": _omitted, ...headers } = SAME_ORIGIN_HEADERS;
    await expectRejected(headers, (route) => JSON.stringify(route.payload));
  });

  test("CORS가 열려 있어도 Sec-Fetch-Site가 교차 출처면 403으로 거부한다", async () => {
    for (const fetchSite of ["cross-site", "same-site"]) {
      await expectRejected(
        { ...SAME_ORIGIN_HEADERS, origin: "http://evil.example", "sec-fetch-site": fetchSite },
        (route) => JSON.stringify(route.payload),
      );
    }
  });

  test("Sec-Fetch-Site가 없으면 Origin이 Host와 다른 요청을 403으로 거부한다", async () => {
    const { "sec-fetch-site": _omitted, ...headers } = SAME_ORIGIN_HEADERS;
    for (const origin of ["http://evil.example", "http://localhost:10997", "null"]) {
      await expectRejected({ ...headers, origin }, (route) => JSON.stringify(route.payload));
    }
  });

  test("동일 출처 Sonamu UI의 JSON 요청은 가드를 통과해 핸들러까지 도달한다", async () => {
    const allowedHeaders: Record<string, string>[] = [
      SAME_ORIGIN_HEADERS,
      // Vite 개발 프록시(changeOrigin)는 Host를 바꾸지만 브라우저는 동일 출처로 표시합니다.
      { ...SAME_ORIGIN_HEADERS, origin: "http://localhost:65000" },
      // Sec-Fetch-Site를 보내지 않는 브라우저의 동일 출처 요청
      (({ "sec-fetch-site": _omitted, ...rest }) => rest)(SAME_ORIGIN_HEADERS),
      // 브라우저 밖 로컬 클라이언트(Origin·Sec-Fetch-Site 없음)
      {
        host: HOST,
        "content-type": "application/json; charset=utf-8",
        "x-sonamu-ui": "1",
        ...UI_TOKEN_HEADERS,
      },
    ];
    for (const headers of allowedHeaders) {
      for (const route of processRoutes) {
        const res = await server.inject({
          method: "POST",
          url: route.url,
          headers,
          payload: JSON.stringify(route.payload),
        });
        expect(res.statusCode, `${route.url} ${JSON.stringify(headers)}`).not.toBe(403);
        expect(res.statusCode, `${route.url} ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(
          400,
        );
      }
    }
  });
});

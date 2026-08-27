import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type SonamuConfig } from "../../api/config";
import { type ExtendedApi } from "../../api/decorators";
import { Sonamu } from "../../api/sonamu";
import { Syncer } from "../../syncer/syncer";
import { Template__http_validators } from "../implementations/http_validators.template";

function createApi(overrides: {
  httpMethod: "GET" | "POST";
  modelName: string;
  path: string;
  parameterType?: "number" | "string";
}): ExtendedApi {
  return {
    modelName: overrides.modelName,
    methodName: "find",
    path: overrides.path,
    options: {
      httpMethod: overrides.httpMethod,
    },
    typeParameters: [],
    parameters: [
      {
        name: "filter",
        optional: false,
        type: {
          t: "object",
          props: [
            {
              name: "page",
              optional: false,
              type: overrides.parameterType ?? "number",
            },
          ],
        },
      },
    ],
    returnType: "unknown",
  };
}

function readFingerprint(body: string): string {
  const match = body.match(/fingerprint\w*\s*[:=]\s*["']([^"']+)["']/i);
  if (match?.[1] === undefined) {
    throw new Error("generated validator registry에 fingerprint가 없습니다");
  }
  return match[1];
}

const testConfig = {
  api: { dir: ".", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
  sync: { targets: [] },
  validation: { zodCompiler: { api: "aot" } },
  database: {},
  server: {
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => undefined,
    },
  },
} satisfies SonamuConfig;

function setSyncerState(apis: ExtendedApi[]) {
  const syncer = new Syncer();
  syncer.apis = apis;
  syncer.types = {};
  Sonamu.syncer = syncer;
}

describe("Template__http_validators 생성 계약", () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    Sonamu.config = testConfig;
  });

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  it("충돌 없는 route key와 fingerprint로 최종 caster의 explicit compile registry를 결정적으로 만든다", () => {
    const apis = [
      createApi({ httpMethod: "GET", modelName: "ReportModel", path: "/report/find" }),
      createApi({ httpMethod: "GET", modelName: "AuditModel", path: "/audit/find" }),
      createApi({ httpMethod: "POST", modelName: "ReportModel", path: "/report/find" }),
      createApi({ httpMethod: "GET", modelName: "ReportModel", path: "/report/find-alternate" }),
    ];
    const template = new Template__http_validators();

    setSyncerState(apis);
    const first = template.render();
    setSyncerState(apis.toReversed());
    const reordered = template.render();

    expect(first.body).toBe(reordered.body);
    expect(first.body.match(/\bcompile\(/g)).toHaveLength(4);
    expect(first.body).toMatch(/compile\(\s*fastifyCaster\(/);
    expect(readFingerprint(first.body)).toBe(readFingerprint(reordered.body));

    const changedApis = [
      ...apis.slice(0, -1),
      createApi({
        httpMethod: "GET",
        modelName: "ReportModel",
        parameterType: "string",
        path: "/report/find-alternate",
      }),
    ];
    setSyncerState(changedApis);
    const changed = template.render();

    expect(readFingerprint(changed.body)).not.toBe(readFingerprint(first.body));
  });

  it("동일한 canonical route key가 중복되면 registry 생성을 거부한다", () => {
    const duplicatedApi = createApi({
      httpMethod: "GET",
      modelName: "ReportModel",
      path: "/report/find",
    });
    setSyncerState([duplicatedApi, { ...duplicatedApi }]);

    const template = new Template__http_validators();

    expect(() => template.render()).toThrow();
  });

  it("REST API가 0개인 AOT registry는 compiler import 없이 내보내며 독립적으로 로드된다", async () => {
    setSyncerState([]);

    const rendered = new Template__http_validators().render();
    const source = [...(rendered.customHeaders ?? []), rendered.body].join("\n");

    expect(rendered.body).toMatch(/export const validators = new Map\(\[\s*\]\);/);
    expect(rendered.body).toContain("export const routeIds = {}");
    expect(source).not.toContain('from "zod-compiler"');
    expect(source).not.toContain('from "sonamu"');
    expect(source).not.toMatch(/\bcompile\(/);
    expect(readFingerprint(rendered.body)).toHaveLength(64);

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sonamu-zero-registry-load-test-"));
    tempRoots.push(tempRoot);
    const modulePath = path.join(tempRoot, "sonamu.validators.generated.mjs");
    await writeFile(modulePath, source);

    await expect(import(`${pathToFileURL(modulePath).href}?test=zero`)).resolves.toMatchObject({
      routeIds: {},
      validators: expect.any(Map),
    });
  });
});

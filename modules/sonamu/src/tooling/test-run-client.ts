import { z } from "zod";

import { loadConfig } from "../api/config";
import { findApiRootPath } from "../utils/utils";

export interface TestRunRequest {
  files?: string[];
  pattern?: string;
  traces?: boolean;
}

interface TestRunResult {
  ok: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  results: z.infer<typeof jsonValueSchema>[];
}

export interface TestRunClient {
  status(): Promise<JsonObject>;
  run(input: TestRunRequest): Promise<TestRunResult>;
}

interface TestRunClientDependencies {
  projectRoot: string;
  loadConfig(projectRoot: string): Promise<object>;
  fetch: typeof globalThis.fetch;
}

class TestRunClientError extends Error {
  constructor(
    readonly code:
      | "TEST_RUN_CONFIG_ERROR"
      | "TEST_RUN_FAILED"
      | "TEST_RUN_HTTP_ERROR"
      | "TEST_RUN_NETWORK_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "TestRunClientError";
  }
}

const jsonValueSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
type JsonObject = z.infer<typeof jsonObjectSchema>;
const configSchema = z.object({
  server: z
    .object({
      listen: z.object({ host: z.string().optional(), port: z.number().optional() }).optional(),
    })
    .optional(),
  test: z
    .object({
      devRunner: z
        .object({ enabled: z.boolean().optional(), routePrefix: z.string().optional() })
        .optional(),
    })
    .optional(),
});
const testRunResultSchema = z.object({
  ok: z.boolean(),
  summary: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
    durationMs: z.number(),
  }),
  results: z.array(jsonValueSchema),
});

async function resolveBaseUrl(dependencies: TestRunClientDependencies): Promise<string> {
  let config: object;
  try {
    config = await dependencies.loadConfig(dependencies.projectRoot);
  } catch {
    throw new TestRunClientError(
      "TEST_RUN_CONFIG_ERROR",
      "sonamu.config를 불러올 수 없습니다. 프로젝트 설정을 확인하세요.",
    );
  }
  const parsedConfig = configSchema.parse(config);
  const listen = parsedConfig.server?.listen;
  const devRunner = parsedConfig.test?.devRunner;
  if (devRunner?.enabled !== true) {
    throw new TestRunClientError(
      "TEST_RUN_CONFIG_ERROR",
      "sonamu.config의 test.devRunner.enabled를 true로 설정해야 합니다.",
    );
  }
  const configuredHost = listen?.host ?? "localhost";
  const host = ["0.0.0.0", "::"].includes(configuredHost) ? "127.0.0.1" : configuredHost;
  const port = listen?.port ?? 3000;
  const routePrefix = devRunner.routePrefix ?? "/__test__";
  const prefix = (routePrefix.startsWith("/") ? routePrefix : `/${routePrefix}`).replace(/\/$/, "");
  return `http://${host}:${port}${prefix}`;
}

async function requestJson(
  dependencies: TestRunClientDependencies,
  url: string,
  init?: RequestInit,
): Promise<JsonObject> {
  let response: Response;
  try {
    response = await dependencies.fetch(url, init);
  } catch {
    throw new TestRunClientError(
      "TEST_RUN_NETWORK_ERROR",
      "로컬 DevRunner에 연결할 수 없습니다. sonamu dev 실행 상태를 확인하세요.",
    );
  }
  if (!response.ok) {
    throw new TestRunClientError(
      "TEST_RUN_HTTP_ERROR",
      `DevRunner 요청이 HTTP ${response.status} 상태로 실패했습니다.`,
    );
  }
  const object = jsonObjectSchema.safeParse(await response.json());
  if (!object.success) {
    throw new TestRunClientError("TEST_RUN_HTTP_ERROR", "DevRunner 응답이 JSON 객체가 아닙니다.");
  }
  return object.data;
}

function parseResult(value: JsonObject): TestRunResult {
  const result = testRunResultSchema.safeParse(value);
  if (!result.success) {
    throw new TestRunClientError(
      "TEST_RUN_HTTP_ERROR",
      "DevRunner 테스트 결과의 구조가 올바르지 않습니다.",
    );
  }
  return result.data;
}

function createTestRunClient(dependencies: TestRunClientDependencies): TestRunClient {
  return {
    async status() {
      return requestJson(dependencies, `${await resolveBaseUrl(dependencies)}/status`);
    },
    async run(input) {
      const payload: TestRunRequest = {};
      if (input.files !== undefined) payload.files = input.files;
      if (input.pattern !== undefined) payload.pattern = input.pattern;
      const result = parseResult(
        await requestJson(dependencies, `${await resolveBaseUrl(dependencies)}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      if (!result.ok) {
        throw Object.assign(
          new TestRunClientError("TEST_RUN_FAILED", "테스트 실행이 실패했습니다."),
          { exitCode: 1, result },
        );
      }
      return result;
    },
  };
}

export function createDefaultTestRunClient(projectRoot: string = findApiRootPath()): TestRunClient {
  return createTestRunClient({
    projectRoot,
    loadConfig,
    fetch: globalThis.fetch,
  });
}

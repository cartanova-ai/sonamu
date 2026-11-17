import { dispose, getLogger, type Config, type LogRecord } from "@logtape/logtape";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configureLogTape } from "../configure";

describe("CLI LogTape 설정 합성", () => {
  afterEach(async () => {
    globalThis.sonamuKitCliLogTapeOverride = undefined;
    await dispose();
  });

  it("CLI 출력 설정과 프로젝트 카테고리 설정을 함께 유지한다", async () => {
    const cliRecords: LogRecord[] = [];
    const appRecords: LogRecord[] = [];
    const cliConfig: Config<string, string> = {
      sinks: { default: (record) => cliRecords.push(record) },
      loggers: [{ category: [], lowestLevel: "debug", sinks: ["default"] }],
      reset: true,
    };
    globalThis.sonamuKitCliLogTapeOverride = { config: cliConfig, applied: false };

    await configureLogTape({
      sinks: { default: (record) => appRecords.push(record) },
      loggers: [{ category: ["app"], lowestLevel: "debug", sinks: ["default"] }],
    });
    getLogger(["cli"]).debug("CLI 로그");
    getLogger(["app"]).debug("프로젝트 로그");

    expect(globalThis.sonamuKitCliLogTapeOverride.applied).toBe(true);
    expect(cliRecords.map((record) => record.category[0])).toEqual(["cli", "app"]);
    expect(appRecords).toHaveLength(1);
  });
});

describe("fastify 기본 로그 싱크", () => {
  const longUrl = `/api/healthcheck?x=${"a".repeat(15_000)}`;
  let lines: string[];

  beforeEach(() => {
    lines = [];
    for (const method of ["debug", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await dispose();
  });

  it("15KB URL 요청 로그를 줄바꿈 없이 빠르게 출력하고 URL을 잘라 남긴다", async () => {
    await configureLogTape({});
    const req = { method: "GET", url: longUrl, originalUrl: longUrl };

    const startedAt = performance.now();
    getLogger(["fastify"]).info("incoming request", { req });
    const elapsedMs = performance.now() - startedAt;

    // 수정 전에는 pretty 포매터의 줄바꿈 처리가 길이의 제곱에 비례해 수 초가 걸렸다
    expect(elapsedMs).toBeLessThan(1_000);
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
    expect(lines[0]).toContain("[GET] /api/healthcheck?x=aaa");
    expect(lines[0]).toContain("incoming request");
    expect(lines[0]).not.toContain(longUrl);
    expect(lines[0].length).toBeLessThan(2_000);
  });

  it("req가 없는 fastify 로그에 긴 URL이 있어도 빠르게 출력한다", async () => {
    await configureLogTape({});

    const startedAt = performance.now();
    // fastify 404 처리기가 남기는 형태의 로그
    getLogger(["fastify"]).info(`Route GET:${longUrl} not found`);
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1_000);
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
  });
});

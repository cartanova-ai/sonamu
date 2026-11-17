import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildWebCommand } from "../build-config";

describe("buildWebCommand", () => {
  const calls: { cmd: string; cwd: string }[] = [];
  let failPattern: string | undefined;
  let appRoot: string;

  // 실제 셸 실행 대신 명령과 cwd만 기록한다.
  const exec = async (cmd: string, options: { cwd: string }) => {
    calls.push({ cmd, cwd: options.cwd });
    if (failPattern !== undefined && cmd.includes(failPattern)) {
      throw new Error("명령 실패");
    }
  };

  beforeEach(async () => {
    calls.length = 0;
    failPattern = undefined;
    appRoot = await mkdtemp(path.join(tmpdir(), "sonamu-build-web-"));
    await mkdir(path.join(appRoot, "api"));
    await mkdir(path.join(appRoot, "web"));
    vi.stubEnv("PNPM_SCRIPT_SRC_DIR", path.join(appRoot, "api"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(appRoot, { recursive: true, force: true });
  });

  it("web 빌드는 타입체크를 vite 빌드 전에 한 번만 실행한다", async () => {
    await buildWebCommand({ exec });

    expect(calls.map((call) => call.cmd)).toEqual([
      expect.stringContaining("typecheck-web"),
      "rm -rf dist/client",
      "vite build --config vite.config.ts --outDir dist/client",
      "rm -rf dist/server",
      "vite build --config vite.config.ts --ssr src/entry-server.generated.tsx --outDir dist/server",
      "rm -rf ../api/web-dist && mkdir -p ../api/web-dist && cp -r dist/* ../api/web-dist",
    ]);
    expect(calls.every((call) => call.cwd === path.join(appRoot, "web"))).toBe(true);
  });

  it("타입체크가 실패하면 vite 빌드와 web-dist 복사를 실행하지 않는다", async () => {
    failPattern = "typecheck-web";

    await expect(buildWebCommand({ exec })).rejects.toThrow("typecheck failed");
    // 타입 오류 시 기존 dist/*를 건드리지 않도록 타입체크 명령 하나만 실행된다.
    expect(calls).toHaveLength(1);
  });

  it("NODE_ENV가 없으면 vite 빌드를 production NODE_ENV로 실행한다", async () => {
    vi.stubEnv("NODE_ENV", "");
    const nodeEnvs: (string | undefined)[] = [];

    await buildWebCommand({
      exec: async (cmd, options) => {
        nodeEnvs.push(process.env.NODE_ENV);
        await exec(cmd, options);
      },
    });

    // development NODE_ENV를 물려받으면 SSR 번들이 jsxDEV를 써서 프로덕션 렌더링이 실패한다.
    expect(nodeEnvs.length).toBeGreaterThan(0);
    expect(nodeEnvs.every((nodeEnv) => nodeEnv === "production")).toBe(true);
  });

  it("명시한 NODE_ENV는 web 빌드에서도 그대로 유지한다", async () => {
    vi.stubEnv("NODE_ENV", "staging");

    await buildWebCommand({ exec });

    expect(process.env.NODE_ENV).toBe("staging");
  });
});

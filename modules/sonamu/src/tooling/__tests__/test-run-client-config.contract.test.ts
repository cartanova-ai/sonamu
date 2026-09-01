import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDefaultTestRunClient } from "../test-run-client";

const STATUS_PAYLOAD = { running: false };
const RUN_RESULT = {
  ok: true,
  summary: { total: 1, passed: 1, failed: 0, skipped: 0, durationMs: 12 },
  results: [],
};

const originalVitest = process.env.VITEST;
const originalHot = process.env.HOT;
const temporaryRoots: string[] = [];
const startedServers: Server[] = [];

/** DevRunner 응답을 대신하는 실제 로컬 HTTP 서버를 띄웁니다. */
async function startDevRunnerServer(): Promise<number> {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/__test__/status") {
      response.end(JSON.stringify(STATUS_PAYLOAD));
      return;
    }
    if (request.url === "/__test__/run") {
      response.end(JSON.stringify(RUN_RESULT));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  startedServers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  // SAFETY: TCP listen 이후의 주소는 항상 AddressInfo 입니다.
  const address = server.address() as AddressInfo;
  return address.port;
}

/** dist 빌드 없이 src/sonamu.config.ts만 가진 일반 개발 프로젝트를 만듭니다. */
async function createSourceOnlyProject(port: number | null): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "sonamu-test-run-client-"));
  temporaryRoots.push(projectRoot);
  await mkdir(path.join(projectRoot, "src"), { recursive: true });
  await writeFile(path.join(projectRoot, ".env"), "SONAMU_TEST_RUN_CLIENT=1\n");
  if (port === null) return projectRoot;

  await writeFile(
    path.join(projectRoot, "src", "sonamu.config.ts"),
    `
export default {
  server: { listen: { host: "127.0.0.1", port: ${port} } },
  test: { devRunner: { enabled: true, routePrefix: "/__test__" } },
};
`,
  );
  return projectRoot;
}

function enterPlainDevShell(): void {
  // dist 설정을 고르는 환경변수가 없는 일반 개발 셸을 재현합니다.
  delete process.env.VITEST;
  delete process.env.HOT;
}

afterEach(async () => {
  if (originalVitest === undefined) delete process.env.VITEST;
  else process.env.VITEST = originalVitest;
  if (originalHot === undefined) delete process.env.HOT;
  else process.env.HOT = originalHot;

  await Promise.all(
    startedServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("test-run-client의 sonamu.config 로딩", () => {
  it("dist 빌드가 없어도 status가 src/sonamu.config.ts를 읽는다", async () => {
    const port = await startDevRunnerServer();
    const projectRoot = await createSourceOnlyProject(port);
    enterPlainDevShell();

    await expect(createDefaultTestRunClient(projectRoot).status()).resolves.toEqual(STATUS_PAYLOAD);
    expect(process.env.VITEST).toBeUndefined();
  });

  it("dist 빌드가 없어도 run이 src/sonamu.config.ts를 읽는다", async () => {
    const port = await startDevRunnerServer();
    const projectRoot = await createSourceOnlyProject(port);
    enterPlainDevShell();

    await expect(
      createDefaultTestRunClient(projectRoot).run({ files: ["a.test.ts"] }),
    ).resolves.toMatchObject({ ok: true });
    expect(process.env.VITEST).toBeUndefined();
  });

  it("기존 VITEST 값은 설정 로딩 후 원래 값으로 되돌린다", async () => {
    const port = await startDevRunnerServer();
    const projectRoot = await createSourceOnlyProject(port);
    enterPlainDevShell();
    process.env.VITEST = "false";

    await expect(createDefaultTestRunClient(projectRoot).status()).resolves.toEqual(STATUS_PAYLOAD);
    expect(process.env.VITEST).toBe("false");
  });

  it("설정 파일이 없으면 TEST_RUN_CONFIG_ERROR로 실패하고 환경변수를 복원한다", async () => {
    const projectRoot = await createSourceOnlyProject(null);
    enterPlainDevShell();

    await expect(createDefaultTestRunClient(projectRoot).status()).rejects.toMatchObject({
      code: "TEST_RUN_CONFIG_ERROR",
    });
    expect(process.env.VITEST).toBeUndefined();
  });

  it("devRunner가 비활성화되어 있으면 설정 오류로 실패한다", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "sonamu-test-run-client-off-"));
    temporaryRoots.push(projectRoot);
    await mkdir(path.join(projectRoot, "src"), { recursive: true });
    await writeFile(path.join(projectRoot, ".env"), "SONAMU_TEST_RUN_CLIENT=1\n");
    await writeFile(
      path.join(projectRoot, "src", "sonamu.config.ts"),
      `
export default {
  server: { listen: { host: "127.0.0.1", port: 3000 } },
  test: { devRunner: { enabled: false } },
};
`,
    );
    enterPlainDevShell();

    await expect(createDefaultTestRunClient(projectRoot).status()).rejects.toMatchObject({
      code: "TEST_RUN_CONFIG_ERROR",
    });
    expect(process.env.VITEST).toBeUndefined();
  });
});

import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Sonamu } from "../../api/sonamu";
import { setSDConfig } from "../../dict/sd";
import { type AbsolutePath } from "../../utils/path-utils";
import { registerOpenVscodeApi } from "../open-vscode-api";

/** 문자열이 `/`로 시작하는 절대 경로인지 확인해 AbsolutePath로 좁힙니다. */
function isAbsolutePath(value: string): value is AbsolutePath {
  return value.startsWith("/");
}

describe("GET /sonamu-ui/api/tools/openVscode", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  const originalPath = process.env.PATH;
  let tempRoot: string;
  let appRoot: string;
  let markerPath: string;
  let shimLogPath: string;
  let server: FastifyInstance;

  beforeEach(async () => {
    tempRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "sonamu-open-vscode-test-")));
    appRoot = path.join(tempRoot, "app");
    await mkdir(path.join(appRoot, "api", "src"), { recursive: true });
    markerPath = path.join(tempRoot, "pwned.txt");
    shimLogPath = path.join(tempRoot, "code-args.log");

    // 실제 VS Code 대신 받은 인자를 한 줄씩 기록하는 가짜 code 명령을 PATH 맨 앞에 둡니다.
    const binPath = path.join(tempRoot, "bin");
    await mkdir(binPath);
    const shimPath = path.join(binPath, "code");
    await writeFile(
      shimPath,
      `#!/bin/sh\nfor arg in "$@"; do printf '%s\\n' "$arg" >> '${shimLogPath}'; done\n`,
    );
    await chmod(shimPath, 0o755);
    process.env.PATH = `${binPath}${path.delimiter}${originalPath ?? ""}`;

    const apiRootPath = path.join(appRoot, "api");
    if (!isAbsolutePath(apiRootPath)) {
      throw new Error(`apiRootPath가 절대 경로가 아닙니다: ${apiRootPath}`);
    }
    Sonamu.apiRootPath = apiRootPath;
    // 거부 응답의 오류 메시지를 만들 수 있도록 i18n 설정을 주입합니다.
    setSDConfig({ defaultLocale: "ko", supportedLocales: ["ko"] });
    server = Fastify();
    await server.register(registerOpenVscodeApi, { prefix: "/sonamu-ui" });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    process.env.PATH = originalPath;
    Sonamu.restoreTestingSnapshot(originalState);
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function openVscode(absPath: string) {
    return server.inject({
      method: "GET",
      url: "/sonamu-ui/api/tools/openVscode",
      query: { absPath },
    });
  }

  async function readShimArgs(): Promise<string[] | null> {
    if (!existsSync(shimLogPath)) {
      return null;
    }
    return (await readFile(shimLogPath, "utf-8")).split("\n").filter((line) => line !== "");
  }

  it.each([
    ["세미콜론", (marker: string) => `/tmp/x; touch '${marker}'`],
    ["명령 치환 $( )", (marker: string) => `$(touch '${marker}')`],
    ["백틱", (marker: string) => `\`touch '${marker}'\``],
    ["파이프", (marker: string) => `/tmp/x | touch '${marker}'`],
  ])("absPath에 %s가 있어도 셸 명령이 실행되지 않음", async (_label, buildPayload) => {
    const response = await openVscode(buildPayload(markerPath));

    expect(existsSync(markerPath)).toBe(false);
    expect(await readShimArgs()).toBeNull();
    expect(response.statusCode).toBe(400);
  });

  it("앱 루트 아래 파일 이름에 셸 메타문자가 있어도 인자 하나로만 전달됨", async () => {
    const filePath = path.join(appRoot, "api", "src", "a; id $(id) `id` | id.ts");
    await writeFile(filePath, "");

    const response = await openVscode(filePath);

    expect(response.statusCode).toBe(200);
    expect(await readShimArgs()).toEqual(["--", filePath]);
  });

  it("옵션처럼 보이는 경로도 code 옵션으로 해석되지 않음", async () => {
    const filePath = path.join(appRoot, "--install-extension=evil.ext");
    await writeFile(filePath, "");

    const response = await openVscode(filePath);

    expect(response.statusCode).toBe(200);
    expect(await readShimArgs()).toEqual(["--", filePath]);
  });

  it("앱 루트 밖 파일, 상위 경로 우회, 없는 파일, 디렉터리는 거부함", async () => {
    const outsidePath = path.join(tempRoot, "outside.ts");
    await writeFile(outsidePath, "");

    for (const absPath of [
      outsidePath,
      path.join(appRoot, "api", "..", "..", "outside.ts"),
      path.join(appRoot, "api", "src", "missing.ts"),
      path.join(appRoot, "api", "src"),
    ]) {
      const response = await openVscode(absPath);
      expect(response.statusCode).toBe(400);
    }
    expect(await readShimArgs()).toBeNull();
  });

  it("앱 루트 밖을 가리키는 심볼릭 링크는 거부함", async () => {
    const outsidePath = path.join(tempRoot, "outside.ts");
    await writeFile(outsidePath, "");
    const linkPath = path.join(appRoot, "api", "src", "link.ts");
    await symlink(outsidePath, linkPath);

    const response = await openVscode(linkPath);

    expect(response.statusCode).toBe(400);
    expect(await readShimArgs()).toBeNull();
  });
});

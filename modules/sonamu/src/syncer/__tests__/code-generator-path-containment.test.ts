import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type SonamuConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { type RenderedTemplate, Template } from "../../template/template";
import { TemplateManager } from "../../template/template-manager";
import { type AbsolutePath } from "../../utils/path-utils";
import { generateTemplate } from "../code-generator";

/** 문자열이 AbsolutePath 형식(`/`로 시작)인지 런타임에 확인합니다. */
function isAbsolutePath(value: string): value is AbsolutePath {
  return value.startsWith("/");
}

/** 지정한 경로로 렌더링되는 테스트용 템플릿입니다. */
class FixedPathTemplate extends Template {
  constructor(private readonly renderedPath: string) {
    super("model_test");
  }

  render(): RenderedTemplate {
    return {
      target: "api/src/application",
      path: this.renderedPath,
      body: "export const marker = 1;",
      importKeys: [],
    };
  }

  getTargetAndPath() {
    return { target: "api/src/application", path: this.renderedPath };
  }
}

function createConfig(): SonamuConfig {
  return {
    projectName: "sonamu-test",
    api: { dir: "api", route: { prefix: "/api" } },
    i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
    sync: { targets: ["web"] },
    database: {},
    server: {
      apiConfig: {
        contextProvider: (defaultContext) => defaultContext,
        guardHandler: () => undefined,
      },
    },
  };
}

describe("generateTemplate의 생성 경로 제한", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  let workspace: string;
  let appRoot: string;

  beforeEach(async () => {
    // 앱 루트를 한 단계 안쪽에 두어, 탈출한 파일도 임시 디렉터리 안에만 생기게 합니다.
    workspace = await mkdtemp(path.join(os.tmpdir(), "sonamu-codegen-containment-"));
    appRoot = path.join(workspace, "app");
    await mkdir(path.join(appRoot, "api", "src", "application"), { recursive: true });
    const apiRootPath = path.join(appRoot, "api");
    if (!isAbsolutePath(apiRootPath)) {
      throw new Error(`테스트용 apiRootPath가 절대 경로가 아닙니다: ${apiRootPath}`);
    }
    Sonamu.apiRootPath = apiRootPath;
    Sonamu.config = createConfig();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    Sonamu.restoreTestingSnapshot(originalState);
    await rm(workspace, { recursive: true, force: true });
  });

  it.each(["../../../../outside.model.test.ts", "../../../../outside/x/x.model.test.ts"])(
    "앱 루트 밖을 가리키는 경로 %j는 파일을 만들지 않고 거부한다",
    async (renderedPath) => {
      vi.spyOn(TemplateManager, "get").mockReturnValue(new FixedPathTemplate(renderedPath));

      await expect(
        generateTemplate("model_test", { entityId: "Post" }, { overwrite: true }),
      ).rejects.toThrow("앱 루트 밖");

      expect(existsSync(path.join(workspace, "outside.model.test.ts"))).toBe(false);
      expect(existsSync(path.join(workspace, "outside"))).toBe(false);
    },
  );

  it("앱 루트 안의 경로는 그대로 생성한다", async () => {
    vi.spyOn(TemplateManager, "get").mockReturnValue(
      new FixedPathTemplate("post/post.model.test.ts"),
    );

    const written = await generateTemplate("model_test", { entityId: "Post" }, { overwrite: true });

    const expected = path.join(appRoot, "api/src/application/post/post.model.test.ts");
    expect(written).toEqual([expected]);
    await expect(readFile(expected, "utf8")).resolves.toContain("marker");
  });
});

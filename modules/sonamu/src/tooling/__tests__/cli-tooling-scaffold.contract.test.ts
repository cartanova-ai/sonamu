import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sonamu } from "../../api/sonamu";
import * as codeGenerator from "../../syncer/code-generator";
import { tooling } from "../cli-tooling";
import { attachSonamuTestRoot, detachSonamuTestRoot } from "./helpers/sonamu-test-root";

const RENDERED_PATH = "/:target/src/components/PostSearchInput.tsx";

function stubRenderTemplate() {
  return vi
    .spyOn(codeGenerator, "renderTemplate")
    .mockResolvedValue([{ path: RENDERED_PATH, code: "// rendered" }]);
}

beforeEach(async () => {
  await attachSonamuTestRoot();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await detachSonamuTestRoot();
});

describe("scaffold의 view_search_input 템플릿", () => {
  it("status에서 view_search_input을 렌더링 대상으로 인식한다", async () => {
    const renderTemplate = stubRenderTemplate();

    await expect(
      tooling.scaffold.status({ entities: ["Post"], templates: ["view_search_input"] }),
    ).resolves.toEqual([
      {
        entityId: "Post",
        template: "view_search_input",
        target: path.join(Sonamu.appRootPath, "web/src/components/PostSearchInput.tsx"),
        exists: false,
      },
    ]);

    expect(renderTemplate).toHaveBeenCalledWith("view_search_input", { entityId: "Post" });
  });

  it("preview에서 view_search_input의 렌더링 내용을 반환한다", async () => {
    stubRenderTemplate();

    await expect(
      tooling.scaffold.preview({ entities: ["Post"], templates: ["view_search_input"] }),
    ).resolves.toEqual([
      expect.objectContaining({ template: "view_search_input", content: "// rendered" }),
    ]);
  });

  it("batch dry run에서도 view_search_input을 렌더링한다", async () => {
    const renderTemplate = stubRenderTemplate();

    await expect(
      tooling.scaffold.batch({
        entities: ["Post"],
        templates: ["view_search_input"],
        dryRun: true,
      }),
    ).resolves.toEqual([expect.objectContaining({ template: "view_search_input" })]);

    expect(renderTemplate).toHaveBeenCalledWith("view_search_input", { entityId: "Post" });
  });

  it("기존 템플릿 키도 그대로 렌더링한다", async () => {
    const renderTemplate = stubRenderTemplate();

    await tooling.scaffold.status({ entities: ["Post"], templates: ["view_list"] });

    expect(renderTemplate).toHaveBeenCalledWith("view_list", { entityId: "Post" });
  });

  it("지원하지 않는 템플릿 키는 거절한다", async () => {
    const renderTemplate = stubRenderTemplate();

    await expect(
      tooling.scaffold.status({ entities: ["Post"], templates: ["bogus_template"] }),
    ).rejects.toThrow();

    expect(renderTemplate).not.toHaveBeenCalled();
  });
});

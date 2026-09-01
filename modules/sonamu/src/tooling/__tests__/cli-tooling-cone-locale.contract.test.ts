import { writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { type ConeGenerationResult } from "../../cone/cone-generator";
import { EntityManager } from "../../entity/entity-manager";
import { Syncer } from "../../syncer/syncer";
import { type EntityJson } from "../../types/types";
import { tooling } from "../cli-tooling";
import { attachSonamuTestRoot, detachSonamuTestRoot } from "./helpers/sonamu-test-root";

const CONE_RESULT: ConeGenerationResult = {
  propCones: {},
  subsetCones: {},
  enumCones: {},
  tokensUsed: 100,
};

function entityJson(id: string): EntityJson {
  return {
    id,
    table: `${id.toLowerCase()}s`,
    title: id,
    props: [{ name: "id", type: "integer" }],
    indexes: [],
    subsets: {},
    enums: {},
  };
}

/**
 * 임시 프로젝트를 만들고 sonamu.config.ts를 실제로 로딩해 Sonamu에 주입합니다.
 *
 * @param i18nSource - config에 넣을 i18n 블록 소스. null이면 i18n 자체를 생략합니다.
 */
async function attachProject(i18nSource: string | null): Promise<void> {
  const apiRootPath = await attachSonamuTestRoot();
  await writeFile(path.join(apiRootPath, ".env"), "SONAMU_CONE_LOCALE_TEST=1\n");
  await writeFile(
    path.join(apiRootPath, "src", "sonamu.config.ts"),
    `export default { ${i18nSource === null ? "" : `i18n: ${i18nSource},`} };\n`,
  );
  Sonamu.config = await loadConfig(apiRootPath);
  Sonamu.syncer = new Syncer();

  await EntityManager.register(entityJson("Post"));
  await EntityManager.register(entityJson("Comment"));
}

function spyOnCones(entityId: string) {
  return vi.spyOn(EntityManager.get(entityId), "generateCones").mockResolvedValue(CONE_RESULT);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await detachSonamuTestRoot();
});

describe("cone 생성의 locale 기본값", () => {
  it("cone gen에 locale이 없으면 설정된 defaultLocale을 사용한다", async () => {
    await attachProject(`{ defaultLocale: "en", supportedLocales: ["en", "ko"] }`);
    const generateCones = spyOnCones("Post");

    await tooling.entity.cones({ entityId: "Post" });

    expect(generateCones).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
  });

  it("i18n 설정이 없으면 ko로 폴백한다", async () => {
    await attachProject(null);
    const generateCones = spyOnCones("Post");

    await tooling.entity.cones({ entityId: "Post" });

    expect(generateCones).toHaveBeenCalledWith(expect.objectContaining({ locale: "ko" }));
  });

  it("지원하지 않는 defaultLocale이면 ko로 폴백한다", async () => {
    await attachProject(`{ defaultLocale: "fr", supportedLocales: ["fr"] }`);
    const generateCones = spyOnCones("Post");

    await tooling.entity.cones({ entityId: "Post" });

    expect(generateCones).toHaveBeenCalledWith(expect.objectContaining({ locale: "ko" }));
  });

  it("명시한 locale이 설정된 defaultLocale보다 우선한다", async () => {
    await attachProject(`{ defaultLocale: "en", supportedLocales: ["en", "ja"] }`);
    const generateCones = spyOnCones("Post");

    await tooling.entity.cones({ entityId: "Post", locale: "ja" });

    expect(generateCones).toHaveBeenCalledWith(expect.objectContaining({ locale: "ja" }));
  });

  it("stub entity --ai도 설정된 defaultLocale을 사용한다", async () => {
    await attachProject(`{ defaultLocale: "en", supportedLocales: ["en", "ko"] }`);
    const createEntity = vi.spyOn(Sonamu.syncer, "createEntity").mockResolvedValue(undefined);
    const generateCones = spyOnCones("Post");

    await tooling.entity.create({ name: "Post", ai: true });

    expect(createEntity).toHaveBeenCalledWith({ entityId: "Post", title: "Post" });
    expect(generateCones).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
  });
});

describe("cone gen all의 엔티티별 결과 보존", () => {
  it("모두 성공하면 엔티티별 결과를 배열로 반환한다", async () => {
    await attachProject(null);
    spyOnCones("Post");
    spyOnCones("Comment");

    await expect(tooling.entity.cones({ entityId: "all" })).resolves.toEqual([
      { entityId: "Post", ...CONE_RESULT },
      { entityId: "Comment", ...CONE_RESULT },
    ]);
  });

  it("일부 엔티티가 실패해도 성공한 엔티티 결과를 함께 보고한다", async () => {
    await attachProject(null);
    spyOnCones("Post");
    vi.spyOn(EntityManager.get("Comment"), "generateCones").mockRejectedValue(
      new Error("LLM rate limit"),
    );

    await expect(tooling.entity.cones({ entityId: "all" })).rejects.toMatchObject({
      code: "CONE_GENERATION_FAILED",
      details: {
        results: [{ entityId: "Post", tokensUsed: 100 }],
        failures: [{ entityId: "Comment", message: expect.stringContaining("LLM rate limit") }],
      },
    });
  });

  it("한 엔티티가 실패해도 다른 엔티티의 cone 생성을 건너뛰지 않는다", async () => {
    await attachProject(null);
    const post = spyOnCones("Post");
    vi.spyOn(EntityManager.get("Comment"), "generateCones").mockRejectedValue(
      new Error("LLM rate limit"),
    );

    await expect(tooling.entity.cones({ entityId: "all" })).rejects.toThrow();

    expect(post).toHaveBeenCalledTimes(1);
  });
});

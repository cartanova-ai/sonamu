import { mkdtemp, mkdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { Sonamu } from "../../api/sonamu";
import { Entity } from "../entity";
import { EntityManager } from "../entity-manager";

describe("Entity 사용자 정의 속성", () => {
  let apiRootPath: string | undefined;

  afterEach(async () => {
    if (apiRootPath) {
      await rm(apiRootPath, { recursive: true, force: true });
      apiRootPath = undefined;
    }
  });

  it("스키마 검증과 저장 과정에서 custom을 보존한다", async () => {
    apiRootPath = await mkdtemp(path.join(tmpdir(), "sonamu-entity-custom-"));
    const entityDirectory = path.join(apiRootPath, "src/application/custom-history");
    await mkdir(entityDirectory, { recursive: true });
    // SAFETY: 테스트에서 생성한 절대 임시 경로입니다.
    Sonamu.apiRootPath = apiRootPath as typeof Sonamu.apiRootPath;

    const entityJson = {
      id: "CustomHistory",
      title: "사용자 정의 이력",
      table: "custom_histories",
      custom: { history: true },
      props: [],
      indexes: [],
      subsets: {},
      enums: {},
    };

    expect(EntityManager.schemaValidate(entityJson)).toBeNull();

    const entity = new Entity(entityJson);
    await entity.save();

    const saved = JSON.parse(
      await readFile(path.join(entityDirectory, "custom-history.entity.json"), "utf8"),
    );
    expect(saved.custom).toEqual({ history: true });
    expect(EntityManager.get("CustomHistory").custom).toEqual({ history: true });
  });
});

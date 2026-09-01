import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EntityManager } from "../../entity/entity-manager";
import { type EntityJson, type EntityProp } from "../../types/types";
import { tooling } from "../cli-tooling";
import { attachSonamuTestRoot, detachSonamuTestRoot } from "./helpers/sonamu-test-root";

const BASE_PROPS: EntityProp[] = [{ name: "id", type: "integer" }];

const POST_JSON: EntityJson = {
  id: "Post",
  table: "posts",
  title: "게시글",
  props: BASE_PROPS,
  indexes: [],
  subsets: {},
  enums: {},
};

let apiRootPath = "";
let entityJsonPath = "";
let patchFilePath = "";

/**
 * prop 추가 patch 파일을 만듭니다.
 *
 * 스키마를 위반하는 입력도 그대로 기록해야 하므로 raw JSON 문자열을 받습니다.
 */
async function writePatchFile(valueJson: string): Promise<string> {
  await writeFile(
    patchFilePath,
    `{"entityId":"Post","operations":[{"op":"add","path":"/props/-","value":${valueJson}}]}`,
    "utf8",
  );
  return patchFilePath;
}

async function readEntityFile(): Promise<string> {
  return readFile(entityJsonPath, "utf8");
}

beforeEach(async () => {
  apiRootPath = await attachSonamuTestRoot();
  const entityDirectory = path.join(apiRootPath, "src", "application", "post");
  await mkdir(entityDirectory, { recursive: true });
  entityJsonPath = path.join(entityDirectory, "post.entity.json");
  patchFilePath = path.join(apiRootPath, "patch.json");
  await writeFile(entityJsonPath, JSON.stringify(POST_JSON, null, 2), "utf8");
  await EntityManager.register(POST_JSON);
});

afterEach(async () => {
  await detachSonamuTestRoot();
});

describe("entity apply의 prop 검증", () => {
  it("존재하지 않는 prop type은 파일을 바꾸기 전에 거절한다", async () => {
    const before = await readEntityFile();
    const file = await writePatchFile(`{"name":"status","type":"bogus"}`);

    await expect(tooling.entity.applyPatch({ file, execute: true })).rejects.toMatchObject({
      code: "INVALID_ENTITY_PATCH",
      exitCode: 2,
    });

    await expect(readEntityFile()).resolves.toBe(before);
    expect(EntityManager.get("Post").props).toEqual(BASE_PROPS);
  });

  it("타입에 맞지 않는 부가 필드도 파일을 바꾸기 전에 거절한다", async () => {
    // integer prop은 length 부가 필드를 허용하지 않습니다.
    const before = await readEntityFile();
    const file = await writePatchFile(`{"name":"count","type":"integer","length":10}`);

    await expect(tooling.entity.applyPatch({ file, execute: true })).rejects.toMatchObject({
      code: "INVALID_ENTITY_PATCH",
    });

    await expect(readEntityFile()).resolves.toBe(before);
    expect(EntityManager.get("Post").props).toEqual(BASE_PROPS);
  });

  it("유효한 prop은 entity 파일에 반영한다", async () => {
    const file = await writePatchFile(`{"name":"title","type":"string","length":128}`);

    await expect(tooling.entity.applyPatch({ file, execute: true })).resolves.toMatchObject({
      changed: true,
      after: {
        props: [
          { name: "id", type: "integer" },
          { name: "title", type: "string", length: 128 },
        ],
      },
    });

    await expect(readEntityFile()).resolves.toContain(`"title"`);
    expect(EntityManager.get("Post").props).toEqual([
      { name: "id", type: "integer" },
      { name: "title", type: "string", length: 128 },
    ]);
  });

  it("dry run은 유효한 patch도 파일에 쓰지 않는다", async () => {
    const before = await readEntityFile();
    const file = await writePatchFile(`{"name":"title","type":"string","length":128}`);

    await expect(tooling.entity.applyPatch({ file, dryRun: true })).resolves.toMatchObject({
      changed: true,
    });

    await expect(readEntityFile()).resolves.toBe(before);
  });
});

describe("entity show의 미존재 처리", () => {
  it("존재하지 않는 entityId는 ENTITY_NOT_FOUND로 실패한다", async () => {
    await expect(tooling.entity.show({ entityId: "UNKNOWN_ID" })).rejects.toMatchObject({
      code: "ENTITY_NOT_FOUND",
    });
  });

  it("존재하는 entityId는 entity JSON을 반환한다", async () => {
    await expect(tooling.entity.show({ entityId: "Post" })).resolves.toMatchObject({
      id: "Post",
      table: "posts",
    });
  });
});

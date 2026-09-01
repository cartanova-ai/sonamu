import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { type Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sonamu } from "../../api/sonamu";
import { type SonamuDBConfig } from "../../database/db";
import { EntityManager } from "../../entity/entity-manager";
import { FixtureManager, type FixtureSourceRecord } from "../../testing/fixture-manager";
import { type FixtureRecord } from "../../types/types";
import { tooling } from "../cli-tooling";
import { attachSonamuTestRoot, detachSonamuTestRoot } from "./helpers/sonamu-test-root";

// 실제 커넥션 없이 preset 존재 여부만 검증되도록 빈 Knex 설정을 사용합니다.
const DB_CONFIG: SonamuDBConfig = {
  development: {},
  staging: {},
  production: {},
  test: {},
  fixture: {},
  development_readonly: {},
  staging_readonly: {},
  production_readonly: {},
  test_readonly: {},
};

const FIXTURE_RECORD: FixtureRecord = {
  fixtureId: "Post#1",
  entityId: "Post",
  id: 1,
  columns: { id: { prop: { name: "id", type: "integer" }, value: 1 } },
  fetchedRecords: [],
  belongsRecords: [],
};

type TransferOverrides = {
  depth?: number;
  target?: string;
  relations?: string;
  dryRun?: boolean;
  execute?: boolean;
};

// fixture transfer 선택자는 depth를 제외하면 모든 케이스에서 동일합니다.
function transferInput(overrides: TransferOverrides) {
  return {
    entityId: "Post",
    source: "development",
    target: "fixture",
    field: "id",
    values: ["1"],
    relations: "none",
    ...overrides,
  };
}

function stubFixtureManager() {
  return {
    getFixtures: vi.spyOn(FixtureManager, "getFixtures").mockResolvedValue([FIXTURE_RECORD]),
    insertFixtures: vi.spyOn(FixtureManager, "insertFixtures").mockResolvedValue([]),
  };
}

let apiRoot = "";

const POST_ENTITY_JSON = {
  id: "Post",
  table: "posts",
  title: "게시글",
  props: [
    { name: "id", type: "integer" },
    { name: "title", type: "string", length: 128 },
    { name: "author", type: "relation", relationType: "BelongsToOne", with: "User" },
  ],
  indexes: [],
  subsets: {},
  enums: {},
};

const USER_ENTITY_JSON = {
  id: "User",
  table: "users",
  title: "사용자",
  props: [
    { name: "id", type: "integer" },
    { name: "name", type: "string", length: 64 },
  ],
  indexes: [],
  subsets: {},
  enums: {},
};

/** 임시 api root에 Post -> User BelongsToOne 관계를 가진 엔티티를 등록합니다. */
async function registerRelatedEntities(): Promise<void> {
  await Promise.all(
    [POST_ENTITY_JSON, USER_ENTITY_JSON].map(async (entityJson) => {
      const moduleName = entityJson.id.toLowerCase();
      const directory = path.join(apiRoot, "src", "application", moduleName);
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, `${moduleName}.entity.json`),
        JSON.stringify(entityJson, null, 2),
        "utf8",
      );
    }),
  );
  EntityManager.isAutoloaded = false;
  await EntityManager.autoload(true, apiRoot);
}

/** 관계 순회가 실제로 일어나야만 호출되는 최소 Knex 대역입니다. */
function createStubDb(rowsByTable: Record<string, FixtureSourceRecord>) {
  const queriedTables: string[] = [];
  const query = (table: string) => {
    queriedTables.push(table);
    return {
      where: () => ({
        first: () => Promise.resolve(rowsByTable[table]),
        pluck: () => Promise.resolve([]),
      }),
    };
  };
  // SAFETY: createFixtureRecord가 쓰는 db(table).where(...).first() 경로만 구현한 테스트 대역입니다.
  return { db: Object.assign(query, {} as Knex), queriedTables };
}

beforeEach(async () => {
  apiRoot = await attachSonamuTestRoot();
  Sonamu.dbConfig = DB_CONFIG;
});

afterEach(async () => {
  vi.restoreAllMocks();
  // 임시 루트에서 등록한 엔티티가 다음 케이스로 새지 않도록 되돌립니다.
  EntityManager.isAutoloaded = false;
  await detachSonamuTestRoot();
});

describe("fixture transfer의 depth 검증", () => {
  it("--depth 0을 허용하고 maxDepth 0으로 관계 순회를 막는다", async () => {
    const fixtures = stubFixtureManager();

    await expect(
      tooling.fixture.fetch(transferInput({ depth: 0, dryRun: true })),
    ).resolves.toMatchObject({ dryRun: true, records: [FIXTURE_RECORD] });

    expect(fixtures.getFixtures).toHaveBeenCalledWith(
      "development",
      "fixture",
      { entityId: "Post", field: "id", value: "1", searchType: "equals" },
      { includeRelations: false, maxDepth: 0 },
    );
    expect(fixtures.insertFixtures).not.toHaveBeenCalled();
  });

  it("--depth 0으로 실제 이관까지 수행한다", async () => {
    const fixtures = stubFixtureManager();

    await expect(
      tooling.fixture.fetch(transferInput({ depth: 0, execute: true })),
    ).resolves.toMatchObject({ records: [FIXTURE_RECORD] });

    expect(fixtures.insertFixtures).toHaveBeenCalledWith("fixture", [FIXTURE_RECORD]);
  });

  it("양의 정수 depth는 계속 허용한다", async () => {
    const fixtures = stubFixtureManager();

    await expect(
      tooling.fixture.fetch(transferInput({ depth: 2, dryRun: true })),
    ).resolves.toMatchObject({ dryRun: true });

    expect(fixtures.getFixtures).toHaveBeenCalledWith("development", "fixture", expect.anything(), {
      includeRelations: false,
      maxDepth: 2,
    });
  });

  it("음수 depth는 거절하고 fixture 조회를 시도하지 않는다", async () => {
    const fixtures = stubFixtureManager();

    await expect(
      tooling.fixture.fetch(transferInput({ depth: -1, dryRun: true })),
    ).rejects.toMatchObject({ code: "INVALID_FIXTURE_TRANSFER", exitCode: 2 });

    expect(fixtures.getFixtures).not.toHaveBeenCalled();
    expect(fixtures.insertFixtures).not.toHaveBeenCalled();
  });

  it("정수가 아닌 depth는 거절한다", async () => {
    const fixtures = stubFixtureManager();

    await expect(
      tooling.fixture.fetch(transferInput({ depth: 1.5, dryRun: true })),
    ).rejects.toMatchObject({ code: "INVALID_FIXTURE_TRANSFER", exitCode: 2 });

    expect(fixtures.getFixtures).not.toHaveBeenCalled();
  });

  it("설정되지 않은 DB preset은 depth 0이어도 거절한다", async () => {
    const fixtures = stubFixtureManager();

    await expect(
      tooling.fixture.fetch(transferInput({ depth: 0, target: "unknown", dryRun: true })),
    ).rejects.toMatchObject({ code: "INVALID_FIXTURE_TRANSFER", exitCode: 2 });

    expect(fixtures.getFixtures).not.toHaveBeenCalled();
  });
});

describe("relations include와 depth 0의 관계 순회 억제", () => {
  it("relations include에서도 --depth 0은 maxDepth 0으로 전달한다", async () => {
    const fixtures = stubFixtureManager();

    await expect(
      tooling.fixture.fetch(transferInput({ relations: "include", depth: 0, dryRun: true })),
    ).resolves.toMatchObject({ dryRun: true, records: [FIXTURE_RECORD] });

    // includeRelations가 true인 상태에서는 maxDepth 0만이 순회를 막는 조건입니다.
    expect(fixtures.getFixtures).toHaveBeenCalledWith("development", "fixture", expect.anything(), {
      includeRelations: true,
      maxDepth: 0,
    });
  });

  it("includeRelations true여도 maxDepth 0이면 관계 레코드를 조회하지 않는다", async () => {
    await registerRelatedEntities();
    const { db, queriedTables } = createStubDb({ users: { id: 7, name: "글쓴이" } });

    const records = await FixtureManager.createFixtureRecord(
      EntityManager.get("Post"),
      { id: 1, title: "첫 글", author_id: 7 },
      { db, includeRelations: true, maxDepth: 0 },
    );

    expect(records.map((record) => record.fixtureId)).toEqual(["Post#1"]);
    expect(records[0].belongsRecords).toEqual(["User#7"]);
    expect(queriedTables).toEqual([]);
  });

  it("maxDepth 1이면 같은 입력에서 관계 레코드까지 수집한다", async () => {
    await registerRelatedEntities();
    const { db, queriedTables } = createStubDb({ users: { id: 7, name: "글쓴이" } });

    const records = await FixtureManager.createFixtureRecord(
      EntityManager.get("Post"),
      { id: 1, title: "첫 글", author_id: 7 },
      { db, includeRelations: true, maxDepth: 1 },
    );

    expect(records.map((record) => record.fixtureId).toSorted()).toEqual(["Post#1", "User#7"]);
    expect(queriedTables).toEqual(["users"]);
  });
});

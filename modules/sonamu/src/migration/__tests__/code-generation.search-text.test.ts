import { describe, expect, test } from "vitest";
import { Sonamu } from "../../api";
import { Entity } from "../../entity/entity";
import { EntityManager } from "../../entity/entity-manager";
import type { MigrationSet } from "../../types/types";
import { setupBiome } from "../../utils/formatter";
import {
  generateAlterCode,
  generateCreateCode,
  setMigrationIndexDefaults,
} from "../code-generation";
import { getMigrationSetFromEntity } from "../migration-set";

const TEST_API_ROOT = "/Users/Nebuleto/Workspace/sonamu/modules/sonamu";

setupBiome(TEST_API_ROOT);
Sonamu.apiRootPath = TEST_API_ROOT;

let entitySeq = 0;

async function registerEntity(
  definition: Omit<
    Parameters<typeof EntityManager.register>[0],
    "id" | "table" | "title" | "subsets" | "enums"
  > & {
    id: string;
    table: string;
  },
) {
  entitySeq += 1;

  const entity = {
    ...definition,
    id: `${definition.id}${entitySeq}`,
    title: `${definition.id}${entitySeq}`,
    table: `${definition.table}_${entitySeq}`,
    subsets: {
      A: definition.props.map((prop) => prop.name),
    },
    enums: {},
  };

  await EntityManager.register(entity, {
    deferSearchTextJsonSourceValidation: true,
  });

  return EntityManager.get(entity.id);
}

function buildDbSetWithGeneratedSearchText(
  entitySet: MigrationSet,
  expression: string,
): MigrationSet {
  return {
    ...entitySet,
    columns: entitySet.columns.map((column) =>
      column.name === "search_text"
        ? {
            ...column,
            generated: {
              type: "STORED",
              expression,
            },
          }
        : column,
    ),
  };
}

describe("code-generation searchText/opclass DDL", () => {
  test("searchText가 없으면 generated/helper SQL을 추가하지 않고 vector index를 유지해야 한다", async () => {
    const entity = await registerEntity({
      id: "CodeGenerationNoSearchText",
      table: "code_generation_no_search_text",
      props: [
        { name: "id", type: "integer" },
        { name: "title", type: "string" },
        { name: "embedding", type: "vector", dimensions: 1536 },
      ],
      indexes: [
        {
          type: "hnsw",
          name: "code_generation_no_search_text_embedding_hnsw",
          columns: [{ name: "embedding", vectorOps: "vector_cosine_ops" }],
        },
      ],
    });

    const [migration] = await generateCreateCode(getMigrationSetFromEntity(entity));

    expect(migration.formatted).not.toContain("GENERATED ALWAYS AS");
    expect(migration.formatted).not.toContain("sonamu_text_array_agg");
    expect(migration.formatted).not.toContain("sonamu_jsonb_array_agg");
    expect(migration.formatted).toContain(
      "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)",
    );
  });

  test("searchText generated DDL, helper 함수, generic opclass를 올바르게 출력해야 한다", async () => {
    const entity = await registerEntity({
      id: "CodeGenerationSearchText",
      table: "code_generation_search_text",
      props: [
        { name: "id", type: "integer" },
        { name: "title_ci", type: "string" },
        { name: "code_cs", type: "string" },
        { name: "tags_ci", type: "string[]" },
        { name: "tags_cs", type: "string[]" },
        { name: "aliases_ci", type: "json", id: "StringArrayCi" },
        { name: "aliases_cs", type: "json", id: "StringArrayCs" },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [
            { name: "title_ci", caseInsensitive: true },
            { name: "code_cs", caseInsensitive: false },
            { name: "tags_ci", caseInsensitive: true },
            { name: "tags_cs", caseInsensitive: false },
            { name: "aliases_ci", caseInsensitive: true },
            { name: "aliases_cs", caseInsensitive: false },
          ],
        },
      ],
      indexes: [
        {
          type: "index",
          name: "code_generation_search_text_search_text_index",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    });

    const [migration] = await generateCreateCode(getMigrationSetFromEntity(entity));

    expect(migration.formatted).toContain(
      "CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)",
    );
    expect(migration.formatted).toContain(
      "CREATE OR REPLACE FUNCTION sonamu_jsonb_array_agg(arr jsonb, ci boolean DEFAULT true)",
    );
    expect(migration.formatted).toContain(
      "ADD COLUMN \"search_text\" text GENERATED ALWAYS AS (trim(lower(COALESCE(title_ci, '')) || ' ' || COALESCE(code_cs, '')",
    );
    expect(migration.formatted).toContain("COALESCE(sonamu_text_array_agg(tags_ci), '')");
    expect(migration.formatted).toContain("COALESCE(sonamu_text_array_agg(tags_cs, false), '')");
    expect(migration.formatted).toContain("COALESCE(sonamu_jsonb_array_agg(aliases_ci), '')");
    expect(migration.formatted).toContain(
      "COALESCE(sonamu_jsonb_array_agg(aliases_cs, false), '')",
    );
    expect(migration.formatted).toContain(
      "CREATE INDEX code_generation_search_text_search_text_index ON",
    );
    expect(migration.formatted).toContain("USING gin(search_text gin_trgm_ops);");
  });

  test("searchText generated expression 변경 시 alter path에서 helper와 index를 함께 재생성해야 한다", async () => {
    const entity = await registerEntity({
      id: "CodeGenerationSearchTextAlter",
      table: "code_generation_search_text_alter",
      props: [
        { name: "id", type: "integer" },
        { name: "title_ci", type: "string" },
        { name: "tags_ci", type: "string[]" },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [
            { name: "title_ci", caseInsensitive: false },
            { name: "tags_ci", caseInsensitive: true },
          ],
        },
      ],
      indexes: [
        {
          type: "index",
          name: "code_generation_search_text_alter_search_text_index",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    });

    const entitySet = getMigrationSetFromEntity(entity);
    const dbSet = buildDbSetWithGeneratedSearchText(
      entitySet,
      `trim(lower(COALESCE(title_ci, '')))`,
    );

    const [migration] = await generateAlterCode(entitySet, dbSet);

    expect(migration.formatted).toContain(
      'table.dropIndex(["search_text"], "code_generation_search_text_alter_search_text_index")',
    );
    expect(migration.formatted).toContain('table.dropColumns("search_text")');
    expect(migration.formatted).toContain(
      "CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)",
    );
    expect(migration.formatted).toContain(
      `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(title_ci, '') || ' ' || COALESCE(sonamu_text_array_agg(tags_ci), ''))) STORED NOT NULL`,
    );
    expect(migration.formatted).toContain(
      "CREATE INDEX code_generation_search_text_alter_search_text_index ON",
    );
    expect(migration.formatted).toContain(
      `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(lower(COALESCE(title_ci, '')))) STORED NOT NULL`,
    );
  });

  test("searchText generated expression이 Postgres canonical form과 semantically equivalent면 no-op이어야 한다", async () => {
    const entity = await registerEntity({
      id: "CodeGenerationSearchTextCanonicalNoop",
      table: "code_generation_search_text_canonical_noop",
      props: [
        { name: "id", type: "integer" },
        { name: "username", type: "string" },
        { name: "tags", type: "string[]" },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [
            { name: "username", caseInsensitive: false },
            { name: "tags", caseInsensitive: true },
          ],
        },
      ],
      indexes: [
        {
          type: "index",
          name: "code_generation_search_text_canonical_noop_search_text_index",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    });

    const entitySet = getMigrationSetFromEntity(entity);
    const dbSet = buildDbSetWithGeneratedSearchText(
      {
        ...entitySet,
        indexes: entitySet.indexes.map(setMigrationIndexDefaults),
      },
      `TRIM(BOTH FROM ((COALESCE(username, ''::text)) || ' '::text) || COALESCE(sonamu_text_array_agg(tags, true), ''::text))`,
    );

    const migrations = await generateAlterCode(entitySet, dbSet);

    expect(migrations).toHaveLength(0);
  });

  test("searchText caseInsensitive 변경만 있어도 alter path에서 재생성해야 한다", async () => {
    const entity = await registerEntity({
      id: "CodeGenerationSearchTextCaseInsensitiveAlter",
      table: "code_generation_search_text_case_insensitive_alter",
      props: [
        { name: "id", type: "integer" },
        { name: "title_ci", type: "string" },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [{ name: "title_ci", caseInsensitive: false }],
        },
      ],
      indexes: [
        {
          type: "index",
          name: "code_generation_search_text_case_insensitive_alter_search_text_index",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    });

    const entitySet = getMigrationSetFromEntity(entity);
    const dbSet = buildDbSetWithGeneratedSearchText(
      entitySet,
      `TRIM(BOTH FROM lower(COALESCE(title_ci, ''::text)))`,
    );

    const [migration] = await generateAlterCode(entitySet, dbSet);

    expect(migration.formatted).toContain("table.dropIndex(");
    expect(migration.formatted).toContain(
      '"code_generation_search_text_case_insensitive_alter_search_text_index"',
    );
    expect(migration.formatted).toContain('table.dropColumns("search_text")');
    expect(migration.formatted).toContain(
      `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(title_ci, ''))) STORED NOT NULL`,
    );
    expect(migration.formatted).toContain("lower(COALESCE(title_ci");
  });

  test("searchText helper kind가 바뀌어도 down path는 복원 expression 기준 helper를 재생성해야 한다", async () => {
    const entity = await registerEntity({
      id: "CodeGenerationSearchTextRollbackHelperMismatch",
      table: "code_generation_search_text_rollback_helper_mismatch",
      props: [
        { name: "id", type: "integer" },
        { name: "tags", type: "string[]" },
        { name: "aliases", type: "json", id: "RollbackHelperMismatchJson" },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [{ name: "tags", caseInsensitive: true }],
        },
      ],
      indexes: [
        {
          type: "index",
          name: "code_generation_search_text_rollback_helper_mismatch_search_text_index",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    });

    const entitySet = getMigrationSetFromEntity(entity);
    const dbSet = buildDbSetWithGeneratedSearchText(
      entitySet,
      `trim(COALESCE(sonamu_jsonb_array_agg(aliases), ''))`,
    );

    const [migration] = await generateAlterCode(entitySet, dbSet);

    expect(migration.formatted).toContain(
      "CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)",
    );
    expect(migration.formatted).toContain(
      `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(sonamu_text_array_agg(tags), ''))) STORED NOT NULL`,
    );
    expect(migration.formatted).toContain(
      "CREATE OR REPLACE FUNCTION sonamu_jsonb_array_agg(arr jsonb, ci boolean DEFAULT true)",
    );
    expect(migration.formatted).toContain(
      `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(sonamu_jsonb_array_agg(aliases), ''))) STORED NOT NULL`,
    );
  });

  test("searchText가 제거되어도 down path는 이전 expression helper를 복원해야 한다", async () => {
    const entity = await registerEntity({
      id: "CodeGenerationSearchTextRollbackDropped",
      table: "code_generation_search_text_rollback_dropped",
      props: [
        { name: "id", type: "integer" },
        { name: "tags", type: "string[]" },
      ],
      indexes: [],
    });

    const previousEntity = new Entity({
      ...entity.toJson(),
      props: [
        ...entity.toJson().props,
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [{ name: "tags", caseInsensitive: true }],
        },
      ],
      indexes: [
        {
          type: "index",
          name: "code_generation_search_text_rollback_dropped_search_text_index",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    });

    const entitySet = getMigrationSetFromEntity(entity);
    const dbSet = buildDbSetWithGeneratedSearchText(
      getMigrationSetFromEntity(previousEntity),
      `trim(COALESCE(sonamu_text_array_agg(tags), ''))`,
    );

    const [migration] = await generateAlterCode(entitySet, dbSet);

    expect(migration.formatted).toContain('table.dropColumns("search_text")');
    expect(migration.formatted).toContain(
      "CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)",
    );
    expect(migration.formatted).toContain(
      `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(sonamu_text_array_agg(tags), ''))) STORED NOT NULL`,
    );
    expect(migration.formatted).toContain(
      "CREATE INDEX code_generation_search_text_rollback_dropped_search_text_index ON",
    );
    expect(migration.formatted).toContain("USING gin(search_text gin_trgm_ops);");
  });
});

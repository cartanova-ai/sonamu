import { describe, expect, test } from "vitest";
import { z } from "zod";

import { EntityJsonSchema, isSearchTextJsonSourceZodType, TemplateOptions } from "../types";

function createBaseEntity() {
  return {
    id: "SearchTextTest",
    title: "SearchText Test",
    table: "search_text_tests",
    props: [
      { name: "id", type: "integer" },
      { name: "title", type: "string" },
      { name: "tags", type: "string[]" },
      { name: "aliases", type: "json", id: "StringArray" },
      {
        name: "search_text",
        type: "searchText",
        sourceColumns: [{ name: "title", caseInsensitive: true }],
      },
    ],
    indexes: [
      {
        type: "index",
        name: "search_text_tests_search_text_index",
        using: "gin",
        columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
      },
    ],
    subsets: {
      A: ["id", "title", "tags", "aliases", "search_text"],
    },
    enums: {},
  } as const;
}

describe("EntityJsonSchema searchText/opclass validation", () => {
  test("opclass known/free string과 vectorOps 하위호환을 허용해야 한다", () => {
    const knownOpclass = createBaseEntity();
    const knownResult = EntityJsonSchema.safeParse(knownOpclass);
    expect(knownResult.success).toBe(true);

    const freeOpclass = createBaseEntity();
    freeOpclass.indexes[0] = {
      ...freeOpclass.indexes[0],
      columns: [{ name: "search_text", opclass: "custom_text_ops" }],
    };
    const freeResult = EntityJsonSchema.safeParse(freeOpclass);
    expect(freeResult.success).toBe(true);

    const legacyVectorOps = createBaseEntity();
    legacyVectorOps.indexes[0] = {
      type: "hnsw",
      name: "search_text_tests_embedding_hnsw",
      columns: [{ name: "embedding", vectorOps: "vector_cosine_ops" }],
      m: 16,
      efConstruction: 64,
    };
    const legacyResult = EntityJsonSchema.safeParse(legacyVectorOps);
    expect(legacyResult.success).toBe(true);
  });

  test("index where predicate는 raw SQL 문자열로 허용하되 빈 문자열은 거부해야 한다", () => {
    const baseEntity = createBaseEntity();
    const partialIndex = {
      ...baseEntity,
      indexes: [
        {
          ...baseEntity.indexes[0],
          where: "deleted_at IS NULL",
        },
      ],
    };
    const partialResult = EntityJsonSchema.safeParse(partialIndex);
    expect(partialResult.success).toBe(true);

    const emptyPredicate = {
      ...baseEntity,
      indexes: [
        {
          ...baseEntity.indexes[0],
          where: "",
        },
      ],
    };
    const emptyResult = EntityJsonSchema.safeParse(emptyPredicate);
    expect(emptyResult.success).toBe(false);

    const blankPredicate = {
      ...baseEntity,
      indexes: [
        {
          ...baseEntity.indexes[0],
          where: "   ",
        },
      ],
    };
    const blankResult = EntityJsonSchema.safeParse(blankPredicate);
    expect(blankResult.success).toBe(false);
  });

  test("searchText source column 존재/타입 검증이 동작해야 한다", () => {
    const unknownSource = createBaseEntity();
    unknownSource.props[4] = {
      name: "search_text",
      type: "searchText",
      sourceColumns: [{ name: "missing_col", caseInsensitive: true }],
    };
    const unknownResult = EntityJsonSchema.safeParse(unknownSource);
    expect(unknownResult.success).toBe(false);

    const unsupportedSourceType = createBaseEntity();
    unsupportedSourceType.props[4] = {
      name: "search_text",
      type: "searchText",
      sourceColumns: [{ name: "id", caseInsensitive: true }],
    };
    const unsupportedResult = EntityJsonSchema.safeParse(unsupportedSourceType);
    expect(unsupportedResult.success).toBe(false);
  });

  test("schema 단계에서는 searchText json source id naming을 강제하지 않아야 한다", () => {
    const nullableWrapper = createBaseEntity();
    nullableWrapper.props[3] = { name: "aliases", type: "json", id: "NullableStringArray" };
    nullableWrapper.props[4] = {
      name: "search_text",
      type: "searchText",
      sourceColumns: [{ name: "aliases", caseInsensitive: true }],
    };
    const wrapperResult = EntityJsonSchema.safeParse(nullableWrapper);
    expect(wrapperResult.success).toBe(true);

    const nullableElement = createBaseEntity();
    nullableElement.props[3] = { name: "aliases", type: "json", id: "StringNullableArray" };
    nullableElement.props[4] = {
      name: "search_text",
      type: "searchText",
      sourceColumns: [{ name: "aliases", caseInsensitive: true }],
    };
    const nullableElementResult = EntityJsonSchema.safeParse(nullableElement);
    expect(nullableElementResult.success).toBe(true);

    const customNamedType = createBaseEntity();
    customNamedType.props[3] = { name: "aliases", type: "json", id: "CustomAliasType" };
    customNamedType.props[4] = {
      name: "search_text",
      type: "searchText",
      sourceColumns: [{ name: "aliases", caseInsensitive: true }],
    };
    const customNamedTypeResult = EntityJsonSchema.safeParse(customNamedType);
    expect(customNamedTypeResult.success).toBe(true);
  });

  test("TemplateOptions.entity 경로도 searchText source 검증을 동일하게 적용해야 한다", () => {
    const validEntity = createBaseEntity();
    const validTemplateEntity = {
      entityId: validEntity.id,
      title: validEntity.title,
      table: validEntity.table,
      props: validEntity.props,
      indexes: validEntity.indexes,
      subsets: validEntity.subsets,
      enums: validEntity.enums,
    };
    const validResult = TemplateOptions.pick({ entity: true }).safeParse({
      entity: validTemplateEntity,
    });
    expect(validResult.success).toBe(true);

    const invalidEntity = createBaseEntity();
    invalidEntity.props[4] = {
      name: "search_text",
      type: "searchText",
      sourceColumns: [{ name: "missing_col", caseInsensitive: true }],
    };
    const invalidTemplateEntity = {
      entityId: invalidEntity.id,
      title: invalidEntity.title,
      table: invalidEntity.table,
      props: invalidEntity.props,
      indexes: invalidEntity.indexes,
      subsets: invalidEntity.subsets,
      enums: invalidEntity.enums,
    };
    const invalidResult = TemplateOptions.pick({ entity: true }).safeParse({
      entity: invalidTemplateEntity,
    });
    expect(invalidResult.success).toBe(false);
  });

  test("TemplateOptions.entity 경로도 json id naming에 의존하지 않아야 한다", () => {
    const customNamedType = createBaseEntity();
    customNamedType.props[3] = { name: "aliases", type: "json", id: "CustomAliasType" };
    customNamedType.props[4] = {
      name: "search_text",
      type: "searchText",
      sourceColumns: [{ name: "aliases", caseInsensitive: true }],
    };

    const customTemplateEntity = {
      entityId: customNamedType.id,
      title: customNamedType.title,
      table: customNamedType.table,
      props: customNamedType.props,
      indexes: customNamedType.indexes,
      subsets: customNamedType.subsets,
      enums: customNamedType.enums,
    };
    const customTemplateResult = TemplateOptions.pick({ entity: true }).safeParse({
      entity: customTemplateEntity,
    });
    expect(customTemplateResult.success).toBe(true);
  });

  test("searchText json source Zod 구조 검증 유틸이 wrapper/element 타입을 정확히 판정해야 한다", () => {
    expect(isSearchTextJsonSourceZodType(z.array(z.string()))).toBe(true);
    expect(isSearchTextJsonSourceZodType(z.array(z.string()).optional())).toBe(true);
    expect(isSearchTextJsonSourceZodType(z.array(z.string()).nullable())).toBe(true);
    expect(isSearchTextJsonSourceZodType(z.array(z.string()).nullish())).toBe(true);

    expect(isSearchTextJsonSourceZodType(z.array(z.string().nullable()))).toBe(false);
    expect(isSearchTextJsonSourceZodType(z.array(z.number()))).toBe(false);
    expect(isSearchTextJsonSourceZodType(z.string())).toBe(false);
  });
});

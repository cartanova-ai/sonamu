import { describe, expect, test } from "vitest";
import { z } from "zod";

import { Sonamu } from "../../api";
import { EntityManager } from "../../entity/entity-manager";
import { SonamuFileArraySchema, SonamuFileSchema } from "../../types/types";
import { Template__generated } from "../implementations/generated.template";
import { Template__init_types } from "../implementations/init_types.template";
import { propToZodType, propToZodTypeDef, zodTypeToZodCode } from "../zod-converter";

const TEST_API_ROOT = "/Users/Nebuleto/Workspace/sonamu/modules/sonamu";

Sonamu.apiRootPath = TEST_API_ROOT;

let entitySeq = 0;

async function registerEntity() {
  entitySeq += 1;

  const entity = {
    id: `GeneratedTemplateSearchText${entitySeq}`,
    title: `GeneratedTemplateSearchText${entitySeq}`,
    table: `generated_template_search_text_${entitySeq}`,
    props: [
      { name: "id", type: "integer" as const },
      { name: "title", type: "string" as const },
      {
        name: "slug",
        type: "string" as const,
        generated: {
          type: "STORED" as const,
          expression: "title",
        },
      },
      {
        name: "search_text",
        type: "searchText" as const,
        sourceColumns: [{ name: "title", caseInsensitive: true }],
      },
    ],
    indexes: [],
    subsets: {
      A: ["id", "title", "slug", "search_text"],
    },
    enums: {},
  };

  await EntityManager.register(entity, {
    deferSearchTextJsonSourceValidation: true,
  });

  return EntityManager.get(entity.id);
}

async function registerEntityWithFileCustomScalar() {
  entitySeq += 1;

  const typeId = `GeneratedTemplateFileProps${entitySeq}`;
  const entity = {
    id: `GeneratedTemplateFile${entitySeq}`,
    title: `GeneratedTemplateFile${entitySeq}`,
    table: `generated_template_file_${entitySeq}`,
    props: [
      { name: "id", type: "integer" as const },
      { name: "title", type: "string" as const },
      { name: "created_at", type: "date" as const },
      {
        name: "file_props",
        type: "json" as const,
        id: typeId,
      },
    ],
    indexes: [],
    subsets: {
      A: ["id", "title", "created_at", "file_props"],
    },
    enums: {},
  };

  await EntityManager.register(entity);

  const registeredEntity = EntityManager.get(entity.id);
  registeredEntity.types[typeId] = z.object({
    image: SonamuFileSchema.nullable(),
  });

  return { entity: registeredEntity, typeId };
}

describe("Template__generated searchText", () => {
  test("SonamuFileSchema를 중첩 Zod 코드에서 내장 스키마 import로 유지해야 한다", () => {
    const importKeys: string[] = [];
    const code = zodTypeToZodCode(
      z.object({
        image: SonamuFileSchema.nullable(),
        attachments: SonamuFileArraySchema.optional(),
      }),
      importKeys,
    );

    expect(code).toContain("image: SonamuFileSchema.nullable(),");
    expect(code).toContain("attachments: SonamuFileArraySchema.optional(),");
    expect(importKeys).toEqual(["SonamuFileSchema", "SonamuFileArraySchema"]);
  });

  test("custom scalar 안의 SonamuFileSchema를 inline할 때 sonamu import를 유지해야 한다", async () => {
    const { typeId } = await registerEntityWithFileCustomScalar();
    const template = new Template__generated();
    template.getTargetAndPath = () => ({ target: "", path: "" });

    const rendered = template.render();
    const headers = rendered.customHeaders.join("\n");

    expect(rendered.body).toContain(`const ${typeId} = z.object({`);
    expect(rendered.body).toContain("image: SonamuFileSchema.nullable(),");
    expect(headers).toContain("SonamuFileSchema");
  });

  test("searchText를 문자열 스키마로 변환해야 한다", async () => {
    const prop = {
      name: "search_text",
      type: "searchText" as const,
      sourceColumns: [{ name: "title", caseInsensitive: true }],
    };

    const schema = await propToZodType(prop);

    expect(propToZodTypeDef(prop, [])).toBe("search_text: z.string(),");
    expect(schema.safeParse("fuzzy query").success).toBe(true);
    expect(schema.safeParse(123).success).toBe(false);
  });

  test("searchText를 __generated__ 메타데이터에 포함하면서 기존 generated 키를 유지해야 한다", async () => {
    const entity = await registerEntity();
    const template = new Template__generated();

    const source = template.getBaseSchemaSourceCode(entity).lines.join("\n");

    expect(source).toContain("search_text: z.string(),");
    expect(source).toContain('readonly __generated__: readonly ["slug", "search_text"],');
    expect(source).toContain('readonly __hasDefault__: readonly ["id"],');
  });

  test("SaveParams write schema에서 generated/searchText 컬럼을 제외해야 한다", async () => {
    const entity = await registerEntity();
    const template = new Template__init_types();
    template.getTargetAndPath = () => ({ target: "", path: "" });

    const { body } = template.render({ entityId: entity.id });

    expect(body).toContain(
      `export const ${entity.id}SaveParams = ${entity.id}BaseSchema.omit({ slug: true, search_text: true }).partial({ id: true });`,
    );
  });
});

describe("Template__generated JSON metadata", () => {
  test("only type=json properties appear in readonly __json__", async () => {
    const { entity } = await registerEntityWithFileCustomScalar();
    const template = new Template__generated();

    const source = template.getBaseSchemaSourceCode(entity).lines.join("\n");

    expect(source).toContain('readonly __json__: readonly ["file_props"],');
    expect(source).not.toContain('readonly __json__: readonly ["title"');
    expect(source).not.toContain('readonly __json__: readonly ["created_at"');
  });
});

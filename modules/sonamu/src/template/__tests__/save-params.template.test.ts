import { describe, expect, test } from "vitest";

import { Sonamu } from "../../api";
import { betterAuthV1 } from "../../auth/better-auth-entities";
import { ENTITY_DEFINITIONS } from "../../auth/plugins/entity-definitions";
import { EntityManager } from "../../entity/entity-manager";
import { type EntityJson, EntityJsonSchema } from "../../types/types";
import { Template__generated } from "../implementations/generated.template";
import { Template__init_types } from "../implementations/init_types.template";

const TEST_API_ROOT = "/Users/Nebuleto/Workspace/sonamu/modules/sonamu";

Sonamu.apiRootPath = TEST_API_ROOT;

let entitySeq = 0;

async function registerEntity(props: EntityJson["props"], subsetFields: string[]) {
  entitySeq += 1;
  const entity = {
    id: `SaveParamsTemplate${entitySeq}`,
    title: `SaveParamsTemplate${entitySeq}`,
    table: `save_params_template_${entitySeq}`,
    props,
    indexes: [],
    subsets: { A: subsetFields },
    enums: {},
  };
  await EntityManager.register(entity, { deferSearchTextJsonSourceValidation: true });
  return EntityManager.get(entity.id);
}

async function registerTargetEntity() {
  entitySeq += 1;
  const entity = {
    id: `SaveParamsTarget${entitySeq}`,
    title: `SaveParamsTarget${entitySeq}`,
    table: `save_params_target_${entitySeq}`,
    props: [{ name: "id", type: "integer" as const }],
    indexes: [],
    subsets: { A: ["id"] },
    enums: {},
  };
  await EntityManager.register(entity);
  return entity.id;
}

describe("BaseSaveParams 생성", () => {
  test("created_at·generated·searchText·readonly 컬럼과 readonly relation의 FK를 제외해야 한다", async () => {
    const targetId = await registerTargetEntity();
    const entity = await registerEntity(
      [
        { name: "id", type: "integer" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP" },
        { name: "title", type: "string" },
        { name: "role", type: "string", readonly: true },
        { name: "password", type: "string", nullable: true, readonly: true },
        { name: "slug", type: "string", generated: { type: "STORED", expression: "title" } },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [{ name: "title", caseInsensitive: true }],
        },
        {
          type: "relation",
          name: "owner",
          with: targetId,
          relationType: "BelongsToOne",
          readonly: true,
        },
        { type: "relation", name: "editor", with: targetId, relationType: "BelongsToOne" },
      ],
      ["id", "title"],
    );

    const { lines } = new Template__generated().getBaseSaveParamsSourceCode(entity);

    expect(lines).toEqual([
      `export const ${entity.id}BaseSaveParams = ${entity.id}BaseSchema.omit({ created_at: true, role: true, password: true, slug: true, search_text: true, owner_id: true });`,
      `export type ${entity.id}BaseSaveParams = z.infer<typeof ${entity.id}BaseSaveParams>;`,
    ]);
  });

  test("제외할 컬럼이 없으면 BaseSchema를 그대로 써야 한다", async () => {
    const entity = await registerEntity(
      [
        { name: "id", type: "integer" },
        { name: "title", type: "string" },
      ],
      ["id", "title"],
    );

    const { lines } = new Template__generated().getBaseSaveParamsSourceCode(entity);

    expect(lines[0]).toBe(`export const ${entity.id}BaseSaveParams = ${entity.id}BaseSchema;`);
  });

  test("sonamu.generated.ts에서 BaseSaveParams를 BaseSchema 뒤에 출력해야 한다", async () => {
    const entity = await registerEntity(
      [
        { name: "id", type: "integer" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP" },
      ],
      ["id"],
    );
    const template = new Template__generated();
    template.getTargetAndPath = () => ({ target: "", path: "" });

    const { body } = template.render();
    const baseSchemaAt = body.indexOf(`export const ${entity.id}BaseSchema = `);
    const saveParamsAt = body.indexOf(
      `export const ${entity.id}BaseSaveParams = ${entity.id}BaseSchema.omit({ created_at: true });`,
    );

    expect(baseSchemaAt).toBeGreaterThanOrEqual(0);
    expect(saveParamsAt).toBeGreaterThan(baseSchemaAt);
  });

  test("init_types의 SaveParams는 BaseSaveParams에서 id만 optional로 만들어야 한다", async () => {
    const entity = await registerEntity(
      [
        { name: "id", type: "integer" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP" },
        { name: "title", type: "string" },
      ],
      ["id", "title"],
    );
    const template = new Template__init_types();
    template.getTargetAndPath = () => ({ target: "", path: "" });

    const { body } = template.render({ entityId: entity.id });

    expect(body).toContain(
      `import { ${entity.id}BaseSaveParams, ${entity.id}BaseListParams } from "../sonamu.generated";`,
    );
    expect(body).toContain(
      `export const ${entity.id}SaveParams = ${entity.id}BaseSaveParams.partial({ id: true });`,
    );
    expect(body).not.toContain("created_at");
  });

  test("better-auth User의 권한·인증 상태 컬럼을 SaveParams에서 제외해야 한다", async () => {
    const userDef = betterAuthV1.find((entity) => entity.id === "User");
    if (!userDef) {
      throw new Error("better-auth User 엔티티 정의를 찾을 수 없습니다");
    }
    // 플러그인이 나중에 추가하는 prop도 재생성되는 BaseSaveParams에 반영되는지 함께 확인합니다.
    const pluginProps = [
      ...(ENTITY_DEFINITIONS.admin.additionalProps.User ?? []),
      ...(ENTITY_DEFINITIONS["2fa"].additionalProps.User ?? []),
      ...(ENTITY_DEFINITIONS["phone-number"].additionalProps.User ?? []),
      ...(ENTITY_DEFINITIONS.anonymous.additionalProps.User ?? []),
    ];
    const entity = await registerEntity(
      [...(userDef.props ?? []), ...pluginProps],
      ["id", "name", "email"],
    );

    const [line] = new Template__generated().getBaseSaveParamsSourceCode(entity).lines;

    for (const column of [
      "email_verified",
      "created_at",
      "role",
      "banned",
      "ban_reason",
      "ban_expires",
      "two_factor_enabled",
      "phone_number_verified",
      "is_anonymous",
    ]) {
      expect(line).toContain(`${column}: true`);
    }
    for (const column of ["name", "email", "image", "phone_number"]) {
      expect(line).not.toContain(` ${column}: true`);
    }
  });
});

describe("entity.json readonly 옵션", () => {
  const baseEntity = {
    id: "ReadonlyOption",
    title: "ReadonlyOption",
    table: "readonly_options",
    indexes: [],
    subsets: { A: ["id"] },
    enums: {},
  };

  test("prop의 readonly를 boolean으로 받아야 한다", () => {
    const result = EntityJsonSchema.safeParse({
      ...baseEntity,
      props: [
        { name: "id", type: "integer" },
        { name: "role", type: "string", readonly: true },
        {
          type: "relation",
          name: "owner",
          with: "User",
          relationType: "BelongsToOne",
          readonly: true,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  test("boolean이 아닌 readonly는 거부해야 한다", () => {
    const result = EntityJsonSchema.safeParse({
      ...baseEntity,
      props: [
        { name: "id", type: "integer" },
        { name: "role", type: "string", readonly: "yes" },
      ],
    });

    expect(result.success).toBe(false);
  });
});

import fastify from "fastify";
import { flatten, range, uniq } from "lodash";
import {
  Sonamu,
  EntityManager,
  EntityProp,
  EntityIndex,
  EntitySubsetRow,
  Migrator,
  nonNullable,
} from "sonamu";
import { Entity } from "sonamu/dist/entity/entity";
import knex from "knex";
import { z } from "zod";
import { execSync } from "child_process";
import { pluralize, underscore } from "inflection";

export async function createApiServer(options: {
  listen: {
    host: string;
    port: number;
  };
  apiRootPath: string;
}) {
  const { listen, apiRootPath } = options;

  const server = fastify();
  server.register(require("@fastify/cors"), {
    origin: true,
    credentials: true,
  });

  server.get("/api", async (_request, _reply) => {
    return { hello: "world", now: new Date() };
  });

  server.get("/api/t1", async () => {
    const entityIds = EntityManager.getAllIds();
    const { apiRootPath, isInitialized } = Sonamu;

    return {
      t1: "t4",
      apiRootPath,
      entityIds,
    };
  });

  server.get<{
    Querystring: {
      entityId: string;
      preset: "types" | "entity.json" | "generated";
    };
  }>("/api/tools/openVscode", async (request) => {
    const { entityId, preset } = request.query;
    const entity = EntityManager.get(entityId);
    const { names } = entity;

    const { apiRootPath } = Sonamu;
    const filename = (() => {
      switch (preset) {
        case "types":
          return `${names.fs}.types.ts`;
        case "entity.json":
          return `${names.fs}.entity.json`;
        case "generated":
          return `${names.fs}.generated.ts`;
      }
    })();
    execSync(
      `code ${apiRootPath}/src/application/${entity.names.parentFs}/${filename}`
    );
  });

  server.get<{
    Querystring: {
      origin: string;
      entityId?: string;
    };
  }>("/api/tools/getSuggestion", async (request) => {
    const { origin, entityId } = request.query;

    // 치환 용어집
    const glossary = new Map<string, string>([
      ["status", "상태"],
      ["type", "타입"],
      ["image", "이미지"],
      ["images", "이미지리스트"],
      ["url", "URL"],
      ["id", "ID"],
      ["name", `{EntityID}명`],
      ["title", "{EntityID}명"],
      ["parent", "상위{EntityID}"],
      ["desc", "설명"],
      ["at", "일시"],
      ["created", "등록"],
      ["updated", "수정"],
      ["deleted", "삭제"],
      ["by", "유저"],
      ["date", "일자"],
      ["time", "시간"],
      ["ko", "(한글)"],
      ["en", "(영문)"],
      ["krw", "(원)"],
      ["usd", "(USD)"],
      ["color", "컬러"],
      ["code", "코드"],
      ["x", "X좌표"],
      ["y", "Y좌표"],
      ["current", "현재"],
      ["stock", "재고"],
      ["total", "총"],
      ["admin", "관리자"],
      ["group", "그룹"],
      ["item", "아이템"],
      ["cnt", "수량"],
      ["price", "가격"],
      ["preset", "프리셋"],
      ["acct", "계좌"],
      ["tel", "전화번호"],
      ["no", "번호"],
      ["body", "내용"],
      ["content", "내용"],
      ["orderno", "정렬순서"],
      ["priority", "우선순위"],
      ["text", "텍스트"],
      ["key", "키"],
      ["sum", "합산"],
      ["expected", "예상"],
      ["actual", "실제"],
    ]);
    // 전체 엔티티 순회하며, 엔티티 타이틀과 프롭 설명을 치환 용어집에 추가
    for (const entityId of EntityManager.getAllIds()) {
      const entity = EntityManager.get(entityId);
      if ((entity.title ?? "") !== "") {
        glossary.set(underscore(entity.id), entity.title);
        glossary.set(underscore(pluralize(entity.id)), entity.title + "리스트");
      }

      entity.props.map((prop) => {
        if (glossary.has(prop.name)) {
          return;
        }
        if (prop.desc) {
          glossary.set(
            prop.name,
            prop.desc.replace(entity.title ?? "", "{EntityID}")
          );
        }
      });
    }

    const suggested = (() => {
      // 단어 분리, 가능한 조합 생성
      const words = origin.split("_");
      const combinations = range(words.length, 0, -1)
        .map((len) => {
          return range(0, words.length - len + 1).map((start) => {
            return {
              len,
              w: words.slice(start, start + len).join("_"),
            };
          });
        })
        .flat();

      // 조합을 순회하며, 치환 용어집에 있는 단어가 포함된 경우, 치환 용어로 치환
      const REPLACED_PREFIX = "#REPLACED//"; // 치환된 단어를 join 이후에도 식별하기 위해 prefix 추가
      let remainArr: string[] = [...words];
      for (const comb of combinations) {
        const remainStr = remainArr.join("_");
        if (remainStr.includes(comb.w) && glossary.has(comb.w)) {
          remainArr = remainStr
            .replace(comb.w, REPLACED_PREFIX + glossary.get(comb.w)!)
            .split("_");
        }
      }

      return remainArr
        .map((r) => {
          if (r.startsWith(REPLACED_PREFIX)) {
            return r.replace(REPLACED_PREFIX, "");
          } else {
            return r.toUpperCase();
          }
        })
        .join("")
        .replace(
          /{EntityID}/g,
          entityId ? EntityManager.get(entityId).title : ""
        );
    })();

    console.log({ entityId, origin, suggested });
    return { suggested };
  });

  server.get("/api/entity/findMany", async () => {
    const entityIds = EntityManager.getAllIds();

    function flattenSubsetRows(subsetRows: EntitySubsetRow[]) {
      return subsetRows
        .map((subsetRow) => {
          const { children, ...sRow } = subsetRow;
          return [sRow, ...flattenSubsetRows(children)];
        })
        .flat();
    }

    const entities = await Promise.all(
      entityIds.map((entityId) => {
        const entity = EntityManager.get(entityId);
        const subsetRows = entity.getSubsetRows();

        return {
          ...entity,
          flattenSubsetRows: flattenSubsetRows(subsetRows),
        };
      })
    );

    entities.sort((a, b) => {
      const aId = a.parentId ?? a.id;
      const bId = b.parentId ?? b.id;
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      if (aId === bId) {
        if (a.parentId === undefined) return -1;
        if (b.parentId === undefined) return 1;
        return 0;
      }
      return 0;
    });
    return { entities };
  });

  server.get<{
    Querystring: {
      filter?: "enums" | "types";
    };
  }>("/api/entity/typeIds", async (request): Promise<{ typeIds: string[] }> => {
    const { filter } = request.query;

    const typeIds = (() => {
      const typeIds = Object.entries(Sonamu.syncer.types)
        .filter(
          ([_typeId, zodType]) =>
            (zodType._def.typeName as string) !== "ZodEnum"
        )
        .map(([typeId, _zodType]) => typeId);

      if (filter === "types") {
        return typeIds;
      }

      const enumIds = EntityManager.getAllIds()
        .map((entityId) => {
          const entity = EntityManager.get(entityId);
          return Object.keys(entity.enumLabels);
        })
        .flat();

      if (filter === "enums") {
        return enumIds;
      } else {
        return [...typeIds, ...enumIds];
      }
    })();

    return {
      typeIds,
    };
  });

  server.post<{
    Body: {
      form: {
        id: string;
        title: string;
        table: string;
        parentId?: string;
      };
    };
  }>("/api/entity/create", async (request) => {
    const { form } = request.body;
    await Sonamu.syncer.createEntity(
      form.id,
      form.parentId,
      form.table,
      form.title
    );

    return 1;
  });

  server.post<{
    Body: {
      entityId: string;
    };
  }>("/api/entity/del", async (request) => {
    const { entityId } = request.body;
    return Sonamu.syncer.delEntity(entityId);
  });

  server.post<{
    Body: {
      entityId: string;
      newValues: {
        title: string;
        table: string;
        parentId?: string;
      };
    };
  }>("/api/entity/modifyEntityBase", async (request) => {
    const { entityId, newValues } = request.body;
    const entity = EntityManager.get(entityId);
    entity.title = newValues.title;
    entity.table = newValues.table;
    entity.parentId = newValues.parentId;
    await entity.save();

    return 1;
  });

  server.post<{
    Body: {
      entityId: string;
      subsetKey: string;
      fields: string[];
    };
  }>("/api/entity/modifySubset", async (request) => {
    const { entityId, subsetKey, fields } = request.body;
    const entity = EntityManager.get(entityId);
    entity.subsets[subsetKey] = fields;
    await entity.save();

    return { updated: fields };
  });

  server.post<{
    Body: {
      entityId: string;
      subsetKey: string;
    };
  }>("/api/entity/delSubset", async (request) => {
    const { entityId, subsetKey } = request.body;
    const entity = EntityManager.get(entityId);
    delete entity.subsets[subsetKey];
    await entity.save();

    return 1;
  });

  server.post<{
    Body: {
      entityId: string;
      newProp: EntityProp;
      at?: number;
    };
  }>("/api/entity/createProp", async (request) => {
    const { entityId, at, newProp } = request.body;

    const entity = EntityManager.get(entityId);
    await entity.createProp(newProp, at);

    return true;
  });

  server.post<{
    Body: {
      entityId: string;
      newProp: EntityProp;
      at: number;
    };
  }>("/api/entity/modifyProp", async (request) => {
    const { entityId, at, newProp } = request.body;

    const entity = EntityManager.get(entityId);
    entity.modifyProp(newProp, at);

    return true;
  });

  server.post<{
    Body: {
      entityId: string;
      at: number;
    };
  }>("/api/entity/delProp", async (request) => {
    const { entityId, at } = request.body;

    const entity = EntityManager.get(entityId);
    entity.delProp(at);
    return true;
  });

  server.post<{
    Body: {
      entityId: string;
      at: number;
      to: number;
    };
  }>("/api/entity/moveProp", async (request) => {
    const { entityId, at, to } = request.body;

    const entity = EntityManager.get(entityId);
    entity.moveProp(at, to);

    return true;
  });

  server.post<{
    Body: {
      entityId: string;
      indexes: EntityIndex[];
    };
  }>("/api/entity/modifyIndexes", async (request) => {
    const { entityId, indexes } = request.body;
    const entity = EntityManager.get(entityId);
    entity.indexes = indexes;
    await entity.save();

    return { updated: indexes };
  });

  server.post<{
    Body: {
      entityId: string;
      enumLabels: Entity["enumLabels"];
    };
  }>("/api/entity/modifyEnumLabels", async (request) => {
    const { entityId, enumLabels } = request.body;
    const entity = EntityManager.get(entityId);
    entity.enumLabels = enumLabels;
    await entity.save();

    return { updated: enumLabels };
  });

  server.post<{
    Body: {
      entityId: string;
      newEnumId: string;
    };
  }>("/api/entity/createEnumId", async (request) => {
    const { entityId, newEnumId } = request.body;
    const entity = EntityManager.get(entityId);

    if (entity.enumLabels[newEnumId]) {
      throw new Error(`이미 존재하는 enumId입니다: ${newEnumId}`);
    }

    entity.enumLabels[newEnumId] = {
      ...(newEnumId.endsWith("Status")
        ? {
            active: "노출",
            hidden: "숨김",
          }
        : {
            "": "",
          }),
    };
    await entity.save();

    return 1;
  });

  server.get<{
    Querystring: {
      entityId: string;
    };
  }>("/api/entity/getTableColumns", async (request) => {
    const { entityId } = request.query;
    const entity = EntityManager.get(entityId);
    const columns = await entity.getTableColumns();
    return { columns };
  });

  const migrator = new Migrator({
    mode: "dev",
  });
  console.log("migrator inialized");

  server.get("/api/migrations/status", async () => {
    const status = await migrator.getStatus();

    return { status };
  });

  server.post<{
    Body: {
      action: "latest" | "rollback" | "shadow";
      targets: string[];
    };
  }>(
    "/api/migrations/runAction",
    async (
      request
    ): Promise<
      {
        connKey: string;
        batchNo: number;
        applied: string[];
      }[]
    > => {
      const { action, targets } = request.body;

      if (action === "shadow") {
        return migrator.runShadowTest();
      } else {
        return migrator.runAction(action, targets);
      }
    }
  );

  server.post<{
    Body: {
      codeNames: string[];
    };
  }>("/api/migrations/delCodes", async (request) => {
    const { codeNames } = request.body;
    return await migrator.delCodes(codeNames);
  });

  server.post<{
    Body: {};
  }>("/api/migrations/generatePreparedCodes", async (request) => {
    return await migrator.generatePreparedCodes();
  });

  server.get("/api/all_routes", async () => {
    return {
      // apis: Sonamu.syncer.apis,
      models: Sonamu.syncer.models,
    };
  });

  server
    .listen(listen)
    .then(() => {
      console.log(
        `sonamu-ui API Server is listening on ${listen.host}:${listen.port}`
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

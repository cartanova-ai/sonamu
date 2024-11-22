import fastify from "fastify";
import _ from "lodash";
import {
  Sonamu,
  SonamuDBConfig,
  EntityManager,
  EntityProp,
  EntityIndex,
  EntitySubsetRow,
  Migrator,
  nonNullable,
  BadRequestException,
  TemplateKey,
  isSoException,
  ServiceUnavailableException,
  PathAndCode,
  Entity,
  FixtureRecord,
  FixtureManager,
  FixtureSearchOptions,
} from "sonamu";
import { execSync } from "child_process";
import { pluralize, underscore } from "inflection";
import { openai } from "./openai";

export async function createApiServer(options: {
  listen: {
    host: string;
    port: number;
  };
  apiRootPath: string;
  watch?: boolean;
}) {
  const { listen, apiRootPath, watch } = options;

  const server = fastify();
  server.register(import("fastify-qs"));
  server.register(import("@fastify/cors"), {
    origin: true,
    credentials: true,
  });

  if (watch) {
    server.get("/api/reload", async () => {
      await EntityManager.reload();
      return true;
    });
  }

  if (Sonamu.secrets) {
    await openai.init();

    server.get("/api/openai/message", async (request) => {
      const { id } = request.query as { id: string };

      return openai.getMessage(id);
    });

    server.post("/api/openai/chat", async (request) => {
      const { message } = request.body as {
        message: string;
      };

      await openai.createMessage(message);
      const run = await openai.runStatus();

      return (await openai.getMessages({ run_id: run.id }))[0];
    });

    server.get("/api/openai/chat/stream", async (request, reply) => {
      const runner = openai.getRunner();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "http://localhost:57000",
        "Access-Control-Allow-Credentials": "true",
      });

      for await (const message of runner) {
        if (
          message.event === "thread.message.delta" &&
          message.data.delta.content?.length
        ) {
          const data =
            (message.data.delta.content[0].type === "text"
              ? message.data.delta.content[0].text?.value
              : ""
            )?.replace(/\n/g, "\\n") ?? "";
          reply.raw.write(`data: ${data}\n\n`);
        }
      }

      reply.raw.write("event: end\n");
      reply.raw.write("data: Stream end\n\n");
    });

    server.post("/api/openai/clearThread", async () => {
      return openai.clearThread();
    });
  }

  server.get("/api", async (_request, _reply) => {
    return { hello: "world", now: new Date() };
  });

  server.get("/api/t1", async () => {
    const entityIds = EntityManager.getAllIds();
    const { apiRootPath, isInitialized } = Sonamu;

    return {
      t1: "t5",
      apiRootPath,
      entityIds,
    };
  });

  server.get<{
    Querystring: {
      entityId?: string;
      preset?: "types" | "entity.json" | "generated" | "path";
      absPath?: string;
    };
  }>("/api/tools/openVscode", async (request) => {
    const { entityId, preset, absPath } = request.query;

    const targetPath = (() => {
      if (entityId && preset) {
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
        return `${apiRootPath}/src/application/${entity.names.parentFs}/${filename}`;
      } else {
        if (!absPath) {
          throw new BadRequestException("preset or absPath must be provided");
        }
        return absPath;
      }
    })();
    execSync(`code ${targetPath}`);
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
      const combinations = _.range(words.length, 0, -1)
        .map((len) => {
          return _.range(0, words.length - len + 1).map((start) => {
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
      reload?: "1";
    };
  }>("/api/entity/typeIds", async (request): Promise<{ typeIds: string[] }> => {
    const { filter, reload } = request.query;

    if (reload === "1") {
      await Sonamu.syncer.autoloadTypes(true);
    }

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
    await Sonamu.syncer.createEntity({ ...form, entityId: form.id });

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

  server.post<{
    Body: {
      entityId: string;
      enumId: {
        before: string;
        after: string;
      };
    };
  }>("/api/entity/modifyEnumId", async (request) => {
    const { entityId, enumId } = request.body;
    const entityIds = EntityManager.getAllIds();
    const isExists = entityIds.some((entityId) => {
      const entity = EntityManager.get(entityId);
      return Object.keys(entity.enumLabels).includes(enumId.after);
    });
    if (isExists) {
      throw new Error(`이미 존재하는 EnumId입니다: ${enumId.after}`);
    }

    const entity = EntityManager.get(entityId);
    entity.enumLabels[enumId.after] = entity.enumLabels[enumId.before];
    delete entity.enumLabels[enumId.before];

    await entity.save();

    for (const entityId of entityIds) {
      const entity = EntityManager.get(entityId);
      for (const prop of entity.props) {
        if (prop.type === "enum" && prop.id === enumId.before) {
          prop.id = enumId.after;
        }
      }
      await entity.save();
    }
  });

  server.post<{
    Body: {
      entityId: string;
      enumId: string;
    };
  }>("/api/entity/deleteEnumId", async (request) => {
    const { entityId, enumId } = request.body;

    const entityIds = EntityManager.getAllIds();
    const isReferenced = entityIds
      .map((entityId) => EntityManager.get(entityId).props)
      .flat()
      .some((prop) => prop.type === "enum" && prop.id === enumId);
    if (isReferenced) {
      throw new Error(`${enumId}를 참조하는 프로퍼티가 존재합니다.`);
    }

    const entity = EntityManager.get(entityId);
    delete entity.enumLabels[enumId];
    await entity.save();
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

  server.post<{
    Body: {
      templateGroupName: "Entity" | "Enums";
      entityIds: string[];
      templateKeys: string[];
      enumIds: string[];
    };
  }>("/api/scaffolding/getStatus", async (request) => {
    const {
      templateGroupName,
      entityIds,
      templateKeys: _templateKeys,
      enumIds,
    } = request.body;
    if ((entityIds ?? []).length === 0) {
      throw new BadRequestException("entityIds must be provided");
    } else if ((_templateKeys ?? []).length === 0) {
      throw new BadRequestException("templateKeys must be provided");
    } else if (templateGroupName === "Enums" && (enumIds ?? []).length === 0) {
      throw new BadRequestException("enumIds must be provided");
    }

    // sorting
    entityIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const templateKeys = TemplateKey.options.filter((tk) =>
      _templateKeys.includes(tk)
    );

    const combinations = entityIds
      .map((entityId) => {
        if (templateGroupName === "Enums") {
          const entityIds = [
            entityId,
            ...EntityManager.getChildrenIds(entityId),
          ];
          const allEnumIds = entityIds
            .map((entityId) =>
              Object.keys(EntityManager.get(entityId).enumLabels)
            )
            .flat();
          return templateKeys
            .map((templateKey) =>
              allEnumIds
                .filter((enumId) => enumIds.includes(enumId))
                .map((enumId) => [entityId, templateKey, enumId])
            )
            .flat();
        } else {
          return templateKeys.map((templateKey) => [entityId, templateKey]);
        }
      })
      .flat();

    const statuses = combinations.map(([entityId, templateKey, enumId]) => {
      const { subPath, fullPath, isExists } = Sonamu.syncer.checkExistsGenCode(
        entityId,
        templateKey as TemplateKey,
        enumId
      );
      return {
        entityId,
        templateGroupName,
        templateKey,
        enumId,
        subPath,
        fullPath,
        isExists,
      };
    });
    return { statuses };
  });

  server.post<{
    Body: {
      options: {
        entityId: string;
        templateKey: string;
        enumId?: string;
        overwrite?: boolean;
      }[];
    };
  }>("/api/scaffolding/generate", async (request) => {
    const { options } = request.body;
    if (options.length === 0) {
      throw new BadRequestException("options must be provided");
    }

    const result = await Promise.all(
      options.map(async ({ entityId, templateKey, enumId, overwrite }) => {
        try {
          return await Sonamu.syncer.generateTemplate(
            templateKey as TemplateKey,
            {
              entityId,
              enumId,
            } as {
              entityId: string;
              enumId?: string;
            },
            {
              overwrite,
            }
          );
        } catch (e) {
          if (isSoException(e) && e.statusCode === 541) {
            return null;
          } else {
            console.error(e);
            throw e;
          }
        }
      })
    );
    console.log(result);

    if (result.filter(nonNullable).length === 0) {
      throw new ServiceUnavailableException(
        "이미 모든 파일이 생성된 상태입니다."
      );
    }
    return result;
  });

  server.post<{
    Body: {
      option: {
        entityId: string;
        templateKey: string;
        enumId?: string;
      };
    };
  }>(
    "/api/scaffolding/preview",
    async (request): Promise<{ pathAndCodes: PathAndCode[] }> => {
      const { option } = request.body;

      try {
        const { templateKey, ...templateOptions } = option;
        const pathAndCodes = await Sonamu.syncer.renderTemplate(
          templateKey as TemplateKey,
          templateOptions
        );

        return { pathAndCodes };
      } catch (e) {
        console.error(e);
        throw e;
      }
    }
  );

  server.post("/api/fixture", async (request) => {
    const { sourceDB, targetDB, search } = request.body as {
      sourceDB: keyof SonamuDBConfig;
      targetDB: keyof SonamuDBConfig;
      search: FixtureSearchOptions;
    };

    return FixtureManager.getFixtures(sourceDB, targetDB, search);
  });

  server.post("/api/fixture/import", async (request) => {
    const { db, fixtures } = request.body as {
      db: keyof SonamuDBConfig;
      fixtures: FixtureRecord[];
    };

    return FixtureManager.insertFixtures(db, fixtures);
  });

  server.post("/api/fixture/addFixtureLoader", async (request) => {
    const { code } = request.body as { code: string };

    return FixtureManager.addFixtureLoader(code);
  });

  server.get("/api/entity/findById", async (request) => {
    const { db, entityId, id, subset } = request.query as {
      db: keyof SonamuDBConfig;
      entityId: string;
      id: string;
      subset: string;
    };

    const { BaseModel } = await import("sonamu/knex");
    const entity = EntityManager.get(entityId);
    const {
      rows: [row],
    } = await BaseModel.runSubsetQuery({
      subset,
      params: { id: Number(id), page: 1, num: 1 },
      subsetQuery: entity.getSubsetQuery(subset),
      build: ({ qb }) => {
        qb.where(`${entity.table}.id`, id);
        return qb;
      },
      baseTable: entity.table,
    });

    return row;
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

import { execSync } from "child_process";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import inflection from "inflection";
import path from "path";
import { range } from "radashi";
import { Sonamu } from "../api/sonamu";
import type { SonamuDBConfig } from "../database/db";
import { SD } from "../dict/sd";
import { sonamuDictionary } from "../dict/sonamu-dictionary";
import type { Entity } from "../entity/entity";
import { EntityManager } from "../entity/entity-manager";
import {
  BadRequestException,
  isSoException,
  ServiceUnavailableException,
} from "../exceptions/so-exceptions";
import { type MigrationResult, Migrator } from "../migration/migrator";
import { TemplateManager } from "../template/template-manager";
import { type DuplicateCheckOptions, FixtureManager } from "../testing/fixture-manager";
import {
  BUILT_IN_TYPE_IDS,
  type EntityIndex,
  type EntityProp,
  type EntitySubsetRow,
  type FixtureRecord,
  type FixtureSearchOptions,
  type FlattenSubsetRow,
  type PathAndCode,
  TemplateKey,
} from "../types/types";
import { nonNullable } from "../utils/utils";
import { setAiApi } from "./ai-api";

export async function sonamuUIApiPlugin(fastify: FastifyInstance) {
  fastify.register(
    async (server) => {
      // migrator
      const migrator = new Migrator();

      // waitForHMRCompleted
      async function waitForHMRCompleted<T>(fn: () => Promise<T>): Promise<T> {
        const waitPromise = new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            resolve();
          }, 1500);

          const handler = () => {
            clearTimeout(timeout);
            Sonamu.syncer.eventEmitter.off("onHMRCompleted", handler);
            resolve();
          };

          Sonamu.syncer.eventEmitter.once("onHMRCompleted", handler);
        });

        const result = await fn();
        await waitPromise;
        return result;
      }

      await setAiApi(server);

      server.get("/api/sonamu/config", async () => {
        return Sonamu.config;
      });

      server.get<{
        Querystring: {
          entityId?: string;
          preset?: "types" | "entity.json" | "generated";
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
              throw new BadRequestException(SD("sonamu.error.presetOrAbsPathRequired"));
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
            glossary.set(inflection.underscore(entity.id), entity.title);
            glossary.set(
              inflection.underscore(inflection.pluralize(entity.id)),
              `${entity.title}리스트`,
            );
          }

          entity.props.forEach((prop) => {
            if (glossary.has(prop.name)) {
              return;
            }
            if (prop.desc) {
              glossary.set(prop.name, prop.desc.replace(entity.title ?? "", "{EntityID}"));
            }
          });
        }

        const suggested = (() => {
          // 단어 분리, 가능한 조합 생성
          const words = origin.split("_");
          const combinations = [...range(words.length, 0, -1)].flatMap((len) => {
            return [
              ...range(0, words.length - len + 1, (idx) => {
                return {
                  len,
                  w: words.slice(idx, idx + len).join("_"),
                };
              }),
            ];
          });

          // 조합을 순회하며, 치환 용어집에 있는 단어가 포함된 경우, 치환 용어로 치환
          const REPLACED_PREFIX = "#REPLACED//"; // 치환된 단어를 join 이후에도 식별하기 위해 prefix 추가
          let remainArr: string[] = [...words];
          for (const comb of combinations) {
            const remainStr = remainArr.join("_");
            if (remainStr.includes(comb.w) && glossary.has(comb.w)) {
              remainArr = remainStr
                .replace(comb.w, REPLACED_PREFIX + glossary.get(comb.w))
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
            .replace(/{EntityID}/g, entityId ? EntityManager.get(entityId).title : "");
        })();

        return { suggested };
      });

      server.get("/api/entity/findMany", async () => {
        const entityIds = EntityManager.getAllIds();

        function flattenSubsetRows(subsetRows: EntitySubsetRow[]): FlattenSubsetRow[] {
          return subsetRows.flatMap((subsetRow) => {
            const { children, ...sRow } = subsetRow;
            return [sRow, ...flattenSubsetRows(children)];
          });
        }

        const entities = await Promise.all(
          entityIds.map((entityId) => {
            const entity = EntityManager.get(entityId);
            const subsetRows = entity.getSubsetRows();

            return {
              ...entity,
              flattenSubsetRows: flattenSubsetRows(subsetRows),
            };
          }),
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
          await Sonamu.syncer.autoloadTypes();
        }

        const typeIds = (() => {
          // 프로젝트에서 정의한 타입들
          const projectTypeIds = Object.entries(Sonamu.syncer.types)
            .filter(([_typeId, zodType]) => (zodType.def.type as string) !== "enum")
            .map(([typeId, _zodType]) => typeId);

          // 내장 타입들 (sonamu 코어에서 제공)
          const builtInTypeIds = [...BUILT_IN_TYPE_IDS];

          // 모든 타입 병합
          const allTypeIds = [...builtInTypeIds, ...projectTypeIds];

          if (filter === "types") {
            return allTypeIds;
          }

          const enumIds = EntityManager.getAllIds().flatMap((entityId) => {
            const entity = EntityManager.get(entityId);
            return Object.keys(entity.enumLabels);
          });

          if (filter === "enums") {
            return enumIds;
          } else {
            return [...allTypeIds, ...enumIds];
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
        return await waitForHMRCompleted(async () => {
          const { form } = request.body;
          await Sonamu.syncer.createEntity({ ...form, entityId: form.id });

          return 1;
        });
      });

      server.post<{
        Body: {
          entityId: string;
        };
      }>("/api/entity/del", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId } = request.body;
          return await Sonamu.syncer.delEntity(entityId);
        });
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
        return await waitForHMRCompleted(async () => {
          const { entityId, newValues } = request.body;
          const entity = EntityManager.get(entityId);
          entity.title = newValues.title;
          entity.table = newValues.table;
          entity.parentId = newValues.parentId;
          await entity.save();

          return 1;
        });
      });

      server.post<{
        Body: {
          entityId: string;
          subsetKey: string;
          fields: string[];
          fieldsInternal?: string[];
        };
      }>("/api/entity/modifySubset", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, subsetKey, fields, fieldsInternal } = request.body;
          const entity = EntityManager.get(entityId);
          entity.subsets[subsetKey] = fields;
          if (fieldsInternal !== undefined) {
            if (fieldsInternal.length > 0) {
              entity.subsetsInternal[subsetKey] = fieldsInternal;
            } else {
              delete entity.subsetsInternal[subsetKey];
            }
          }
          await entity.save();

          return { updated: fields, updatedInternal: fieldsInternal };
        });
      });

      server.post<{
        Body: {
          entityId: string;
          subsetKey: string;
        };
      }>("/api/entity/delSubset", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, subsetKey } = request.body;
          const entity = EntityManager.get(entityId);
          delete entity.subsets[subsetKey];
          delete entity.subsetsInternal[subsetKey];
          await entity.save();

          return 1;
        });
      });

      server.post<{
        Body: {
          entityId: string;
          newProp: EntityProp;
          at?: number;
        };
      }>("/api/entity/createProp", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, at, newProp } = request.body;
          const entity = EntityManager.get(entityId);
          await entity.createProp(newProp, at);
          return true;
        });
      });

      server.post<{
        Body: {
          entityId: string;
          newProp: EntityProp;
          at: number;
        };
      }>("/api/entity/modifyProp", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, at, newProp } = request.body;

          const entity = EntityManager.get(entityId);
          entity.modifyProp(newProp, at);

          return true;
        });
      });

      server.post<{
        Body: {
          entityId: string;
          at: number;
        };
      }>("/api/entity/delProp", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, at } = request.body;

          const entity = EntityManager.get(entityId);
          entity.delProp(at);
          return true;
        });
      });

      server.post<{
        Body: {
          entityId: string;
          at: number;
          to: number;
        };
      }>("/api/entity/moveProp", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, at, to } = request.body;

          const entity = EntityManager.get(entityId);
          entity.moveProp(at, to);

          return true;
        });
      });

      server.post<{
        Body: {
          entityId: string;
          indexes: EntityIndex[];
        };
      }>("/api/entity/modifyIndexes", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, indexes } = request.body;
          const entity = EntityManager.get(entityId);
          entity.indexes = indexes;
          await entity.save();

          return { updated: indexes };
        });
      });

      server.post<{
        Body: {
          entityId: string;
          enumLabels: Entity["enumLabels"];
        };
      }>("/api/entity/modifyEnumLabels", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, enumLabels } = request.body;
          const entity = EntityManager.get(entityId);
          entity.enumLabels = enumLabels;
          await entity.save();

          return { updated: enumLabels };
        });
      });

      server.post<{
        Body: {
          entityId: string;
          newEnumId: string;
        };
      }>("/api/entity/createEnumId", async (request) => {
        return await waitForHMRCompleted(async () => {
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
        return await waitForHMRCompleted(async () => {
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
      });

      server.post<{
        Body: {
          entityId: string;
          enumId: string;
        };
      }>("/api/entity/deleteEnumId", async (request) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, enumId } = request.body;

          const entityIds = EntityManager.getAllIds();
          const isReferenced = entityIds
            .flatMap((entityId) => EntityManager.get(entityId).props)
            .some((prop) => prop.type === "enum" && prop.id === enumId);
          if (isReferenced) {
            throw new Error(`${enumId}를 참조하는 프로퍼티가 존재합니다.`);
          }

          const entity = EntityManager.get(entityId);
          delete entity.enumLabels[enumId];
          await entity.save();
        });
      });

      server.get<{
        Querystring: {
          entityId: string;
        };
      }>("/api/entity/getTableColumns", async (request) => {
        const { entityId } = request.query;
        const entity = EntityManager.get(entityId);
        const columns = entity.getTableColumns();
        return { columns };
      });

      server.get("/api/migrations/status", async () => {
        const status = await migrator.getStatus();

        return { status };
      });

      server.post<{
        Body: {
          action: "apply" | "rollback" | "shadow";
          targets: (keyof SonamuDBConfig)[];
        };
      }>("/api/migrations/runAction", async (request): Promise<MigrationResult> => {
        const { action, targets } = request.body;

        if (action === "shadow") {
          return migrator.runShadowTest();
        } else {
          return migrator.runAction(action, targets);
        }
      });

      server.post<{
        Body: {
          codeNames: string[];
        };
      }>("/api/migrations/delCodes", async (request) => {
        const { codeNames } = request.body;
        return await migrator.delCodes(codeNames);
      });

      server.post("/api/migrations/generatePreparedCodes", async (_requestt) => {
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
        const { templateGroupName, entityIds, templateKeys: _templateKeys, enumIds } = request.body;
        if ((entityIds ?? []).length === 0) {
          throw new BadRequestException(SD("sonamu.error.entityIdsRequired"));
        } else if ((_templateKeys ?? []).length === 0) {
          throw new BadRequestException(SD("sonamu.error.templateKeysRequired"));
        } else if (templateGroupName === "Enums" && (enumIds ?? []).length === 0) {
          throw new BadRequestException(SD("sonamu.error.enumIdsRequired"));
        }

        // sorting
        entityIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        const templateKeys = TemplateKey.options.filter((tk) => _templateKeys.includes(tk));

        const combinations = entityIds.flatMap((entityId) => {
          if (templateGroupName === "Enums") {
            const entityIds = [entityId, ...EntityManager.getChildrenIds(entityId)];
            const allEnumIds = entityIds.flatMap((entityId) =>
              Object.keys(EntityManager.get(entityId).enumLabels),
            );
            return templateKeys.flatMap((templateKey) =>
              allEnumIds
                .filter((enumId) => enumIds.includes(enumId))
                .map((enumId) => [entityId, templateKey, enumId]),
            );
          } else {
            return templateKeys.map((templateKey) => [entityId, templateKey]);
          }
        });

        const statuses = await Promise.all(
          combinations.map(async ([entityId, templateKey, enumId]) => {
            const { subPath, fullPath, isExists } = await Sonamu.syncer.checkExistsGenCode(
              entityId,
              templateKey as TemplateKey,
              enumId,
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
          }),
        );
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
          throw new BadRequestException(SD("sonamu.error.optionsRequired"));
        }

        // 1. 모든 템플릿에서 필요한 dict 키를 수집
        const keys = options.flatMap(({ templateKey }) => {
          const template = TemplateManager.get(templateKey);
          return template.getRequiredDictKeys() ?? [];
        });

        // 2. target별로 ensureDictKeys 호출 (순차 처리)
        await sonamuDictionary.ensureDictKeys([...new Set(keys)]);

        // 3. 템플릿 생성 (병렬 처리)
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
                },
              );
            } catch (e) {
              if (isSoException(e) && e.statusCode === 541) {
                return null;
              } else {
                console.error(e);
                throw e;
              }
            }
          }),
        );

        if (result.filter(nonNullable).length === 0) {
          throw new ServiceUnavailableException(SD("sonamu.error.allFilesGenerated"));
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
      }>("/api/scaffolding/preview", async (request): Promise<{ pathAndCodes: PathAndCode[] }> => {
        const { option } = request.body;

        try {
          const { templateKey, ...templateOptions } = option;
          const pathAndCodes = await Sonamu.syncer.renderTemplate(
            templateKey as TemplateKey,
            templateOptions,
          );

          return { pathAndCodes };
        } catch (e) {
          console.error(e);
          throw e;
        }
      });

      server.post("/api/fixture", async (request) => {
        const { sourceDB, targetDB, search, duplicateCheck } = request.body as {
          sourceDB: keyof SonamuDBConfig;
          targetDB: keyof SonamuDBConfig;
          search: FixtureSearchOptions;
          duplicateCheck?: DuplicateCheckOptions;
        };

        return FixtureManager.getFixtures(sourceDB, targetDB, search, duplicateCheck);
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

      server.get("/api/i18n/dictionary", async () => {
        return sonamuDictionary.getDictionary();
      });

      server.get("/api/i18n/export", async (_request, reply) => {
        const { filename, buffer } = await sonamuDictionary.exportToExcel();
        reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(buffer);
      });

      server.post("/api/i18n/import", async (request) => {
        const data = await request.file();
        if (!data) {
          throw new BadRequestException(SD("sonamu.error.fileNotUploaded"));
        }
        const buffer = await data.toBuffer();
        return sonamuDictionary.importFromExcel(buffer);
      });

      server.post<{
        Body: {
          oldKey: string;
          newKey: string;
          source: "entity" | "project";
          values: Record<string, string>;
        };
      }>("/api/i18n/update", async (request) => {
        await sonamuDictionary.updateEntry(request.body);
        return { success: true };
      });

      server.post<{
        Body: {
          key: string;
          values: Record<string, string>;
        };
      }>("/api/i18n/create", async (request) => {
        await sonamuDictionary.createEntry(request.body);
        return { success: true };
      });

      server.post<{
        Body: {
          key: string;
        };
      }>("/api/i18n/delete", async (request) => {
        await sonamuDictionary.deleteEntry(request.body.key);
        return { success: true };
      });

      server.post<{ Body: { keys: string[] } }>("/api/i18n/checkUsage", async (request) => {
        return sonamuDictionary.checkUsage(request.body.keys);
      });

      // ui-web 빌드 파일 서빙
      const uiDistPath = path.resolve(import.meta.dirname, "../ui-web");

      // 정적 파일 서빙: 루트 폴더 전체 (assets, setting.svg 등)
      server.register(await import("@fastify/static"), {
        root: uiDistPath,
        prefix: "/",
        decorateReply: false,
        wildcard: false,
      });

      // SPA fallback - 정적 파일이 없는 모든 경로는 index.html로
      server.get("*", async (_request, reply) => {
        reply.headers({ "Content-type": "text/html" }).send(
          fs
            .readFileSync(path.resolve(uiDistPath, "index.html"))
            .toString()
            .replace("{{projectName}}", Sonamu.config.projectName ?? "UnknownSonamuProject"),
        );
      });
    },
    { prefix: "/sonamu-ui" },
  );
}

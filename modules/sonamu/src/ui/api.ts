import { execSync } from "child_process";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import inflection from "inflection";
import path from "path";
import { range } from "radashi";
import * as XLSX from "xlsx";
import { Sonamu } from "../api/sonamu";
import type { SonamuDBConfig } from "../database/db";
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
  type EntityIndex,
  type EntityProp,
  type EntitySubsetRow,
  type FixtureRecord,
  type FixtureSearchOptions,
  type FlattenSubsetRow,
  type PathAndCode,
  TemplateKey,
} from "../types/types";
import { type DictEntry, parseConstObjectDeclaration, parseDictFile } from "../utils/dict-parser";
import { ensureDictKeys, generateProjectDict } from "../utils/dict-utils";
import { formatCode } from "../utils/formatter";
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

        console.log({ entityId, origin, suggested });
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
          const typeIds = Object.entries(Sonamu.syncer.types)
            .filter(([_typeId, zodType]) => (zodType.def.type as string) !== "enum")
            .map(([typeId, _zodType]) => typeId);

          if (filter === "types") {
            return typeIds;
          }

          const enumIds = EntityManager.getAllIds().flatMap((entityId) => {
            const entity = EntityManager.get(entityId);
            return Object.keys(entity.enumLabels);
          });

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
          throw new BadRequestException("entityIds must be provided");
        } else if ((_templateKeys ?? []).length === 0) {
          throw new BadRequestException("templateKeys must be provided");
        } else if (templateGroupName === "Enums" && (enumIds ?? []).length === 0) {
          throw new BadRequestException("enumIds must be provided");
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
          throw new BadRequestException("options must be provided");
        }

        // 1. 모든 템플릿에서 필요한 dict 키를 수집
        const keys = options.flatMap(({ templateKey }) => {
          const template = TemplateManager.get(templateKey);
          return template.getRequiredDictKeys() ?? [];
        });

        // 2. target별로 ensureDictKeys 호출 (순차 처리)
        await ensureDictKeys([...new Set(keys)]);

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
        console.log(result);

        if (result.filter(nonNullable).length === 0) {
          throw new ServiceUnavailableException("이미 모든 파일이 생성된 상태입니다.");
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

      // i18n API
      type I18nDictionaryRow = {
        key: string;
        source: "entity" | "project";
        isFunction: boolean;
        [locale: string]: string | boolean | undefined;
      };

      /**
       * 함수 형태의 값인지 판별: (params) => `template` 또는 (params) => "string"
       */
      const FUNCTION_VALUE_PATTERN = /^\([^)]*\)\s*=>\s*(?:`[^`]*`|"[^"]*")$/;
      function isFunctionValue(value: string): boolean {
        return FUNCTION_VALUE_PATTERN.test(value);
      }

      /**
       * entity key 파싱 결과 타입
       */
      type EntityKeyInfo =
        | { type: "entityTitle"; entityId: string }
        | { type: "propDesc"; entityId: string; propName: string }
        | { type: "enumLabel"; enumId: string; enumValue: string }
        | { type: "other" };

      /**
       * i18n key를 파싱하여 entity 관련 정보 추출
       */
      function parseEntityKey(key: string): EntityKeyInfo {
        // entity.{EntityId} (list, create, edit 제외)
        const entityTitleMatch = key.match(/^entity\.([A-Z][a-zA-Z0-9]*)$/);
        if (
          entityTitleMatch &&
          !key.includes(".list") &&
          !key.includes(".create") &&
          !key.includes(".edit")
        ) {
          return { type: "entityTitle", entityId: entityTitleMatch[1] };
        }

        // entity.{EntityId}.{propName}
        const propDescMatch = key.match(/^entity\.([A-Z][a-zA-Z0-9]*)\.([a-z_][a-z0-9_]*)$/);
        if (propDescMatch) {
          return { type: "propDesc", entityId: propDescMatch[1], propName: propDescMatch[2] };
        }

        // enum.{EnumId}.{value}
        const enumLabelMatch = key.match(/^enum\.([A-Z][a-zA-Z0-9]*)\.(.+)$/);
        if (enumLabelMatch) {
          return { type: "enumLabel", enumId: enumLabelMatch[1], enumValue: enumLabelMatch[2] };
        }

        return { type: "other" };
      }

      /**
       * entity key에 대해 entity.json 업데이트 수행
       * @returns 업데이트 여부
       */
      async function updateEntityByKey(key: string, value: string): Promise<boolean> {
        const keyInfo = parseEntityKey(key);

        switch (keyInfo.type) {
          case "entityTitle": {
            try {
              const entity = EntityManager.get(keyInfo.entityId);
              if (entity.title !== value) {
                entity.title = value;
                await entity.save();
                return true;
              }
            } catch {
              // entity not found
            }
            return false;
          }

          case "propDesc": {
            try {
              const entity = EntityManager.get(keyInfo.entityId);
              const propIndex = entity.props.findIndex((p) => p.name === keyInfo.propName);
              if (propIndex !== -1 && entity.props[propIndex].desc !== value) {
                entity.props[propIndex].desc = value;
                await entity.save();
                return true;
              }
            } catch {
              // entity not found
            }
            return false;
          }

          case "enumLabel": {
            for (const entityId of EntityManager.getAllIds()) {
              const entity = EntityManager.get(entityId);
              if (entity.enumLabels[keyInfo.enumId]) {
                if (entity.enumLabels[keyInfo.enumId][keyInfo.enumValue] !== value) {
                  entity.enumLabels[keyInfo.enumId][keyInfo.enumValue] = value;
                  await entity.save();
                  return true;
                }
                break;
              }
            }
            return false;
          }

          default:
            return false;
        }
      }

      /**
       * sd.generated.ts에서 entity labels 추출
       * entity.json에서 관리되는 값만 포함 (.list, .create, .edit 제외)
       */
      function extractEntityLabels(): DictEntry[] {
        const sdPath = path.join(Sonamu.apiRootPath, "src", "i18n", "sd.generated.ts");
        if (!fs.existsSync(sdPath)) {
          return [];
        }

        return parseConstObjectDeclaration(sdPath, "entityLabels");
      }

      /**
       * Project dict 파일([locale].ts)에서 딕셔너리 로드
       */
      function loadProjectDict(locale: string): { entries: DictEntry[] } {
        const dictPath = path.join(Sonamu.apiRootPath, "src", "i18n", `${locale}.ts`);
        if (!fs.existsSync(dictPath)) {
          return { entries: [] };
        }
        return { entries: parseDictFile(dictPath) };
      }

      /**
       * 딕셔너리 데이터 수집 (entity + project)
       */
      async function collectDictionary(): Promise<{
        rows: I18nDictionaryRow[];
        locales: string[];
        defaultLocale: string;
        stats: Record<string, { total: number; filled: number; percent: number }>;
      }> {
        const { defaultLocale, supportedLocales } = Sonamu.config.i18n ?? {
          defaultLocale: "ko",
          supportedLocales: ["ko"],
        };
        const locales = supportedLocales;

        const rows: I18nDictionaryRow[] = [];
        const rowMap = new Map<string, I18nDictionaryRow>();

        // 1. Entity labels (default locale 기준)
        const entityLabels = extractEntityLabels();
        for (const label of entityLabels) {
          const row: I18nDictionaryRow = {
            key: label.key,
            source: "entity",
            isFunction: label.isFunction ?? false,
            [defaultLocale]: label.value,
          };
          rowMap.set(label.key, row);
        }

        // 2. Project dict (각 locale별)
        for (const locale of locales) {
          const { entries } = loadProjectDict(locale);
          for (const entry of entries) {
            const existing = rowMap.get(entry.key);
            if (existing) {
              // entity source가 있으면 해당 locale 값만 추가
              existing[locale] = entry.value;
              if (entry.isFunction) {
                existing.isFunction = true;
              }
            } else {
              // project source로 새로 추가
              let row = rowMap.get(entry.key);
              if (!row) {
                row = {
                  key: entry.key,
                  source: "project",
                  isFunction: entry.isFunction,
                };
                rowMap.set(entry.key, row);
              }
              row[locale] = entry.value;
            }
          }
        }

        rows.push(...rowMap.values());
        rows.sort((a, b) => a.key.localeCompare(b.key));

        // 통계 계산: locale별 (채워진 값 / 전체 키 수)
        const stats: Record<string, { total: number; filled: number; percent: number }> = {};
        const total = rows.length;
        for (const locale of locales) {
          const filled = rows.filter((row) => row[locale] != null && row[locale] !== "").length;
          const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
          stats[locale] = { total, filled, percent };
        }

        return { rows, locales, defaultLocale, stats };
      }

      // GET /api/i18n/dictionary
      server.get("/api/i18n/dictionary", async () => {
        return collectDictionary();
      });

      // GET /api/i18n/export
      server.get("/api/i18n/export", async (_request, reply) => {
        const { rows, locales } = await collectDictionary();

        // Excel 데이터 생성 (함수인 경우 value가 이미 원형 전체)
        const headers = ["key", "source", ...locales];
        const data = [
          headers,
          ...rows.map((row) => [
            row.key,
            row.source,
            ...locales.map((locale) => row[locale] ?? ""),
          ]),
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "i18n");

        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header(
            "Content-Disposition",
            `attachment; filename="i18n-${new Date().toISOString().split("T")[0]}.xlsx"`,
          )
          .send(buffer);
      });

      // POST /api/i18n/import
      server.post("/api/i18n/import", async (request) => {
        const data = await request.file();
        if (!data) {
          throw new BadRequestException("파일이 업로드되지 않았습니다");
        }

        const buffer = await data.toBuffer();
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);

        const { defaultLocale, supportedLocales } = Sonamu.config.i18n ?? {
          defaultLocale: "ko",
          supportedLocales: ["ko"],
        };
        const locales = supportedLocales;

        let updatedEntities = 0;
        let updatedLocales = 0;

        // locale별 project dict entries
        const projectDictEntries: Record<string, DictEntry[]> = {};
        for (const locale of locales) {
          projectDictEntries[locale] = [];
        }

        for (const row of jsonData) {
          const key = row.key;
          const source = row.source as "entity" | "project";

          if (!key || !source) continue;

          if (source === "entity") {
            // entity source: default locale만 entity.json에 저장
            const defaultValue = row[defaultLocale];
            if (defaultValue) {
              const updated = await updateEntityByKey(key, defaultValue);
              if (updated) {
                updatedEntities++;
              }
            }

            // non-default locale은 project dict에 저장
            for (const locale of locales) {
              if (locale === defaultLocale) continue;
              const cellValue = row[locale]?.trim();
              if (cellValue) {
                projectDictEntries[locale].push({
                  key,
                  value: cellValue,
                  isFunction: isFunctionValue(cellValue),
                });
              }
            }
          } else if (source === "project") {
            // project source: 모든 locale을 project dict에 저장
            for (const locale of locales) {
              const cellValue = row[locale]?.trim();
              if (cellValue) {
                projectDictEntries[locale].push({
                  key,
                  value: cellValue,
                  isFunction: isFunctionValue(cellValue),
                });
              }
            }
          }
        }

        // Project dict 파일 생성
        const i18nDir = path.join(Sonamu.apiRootPath, "src", "i18n");
        if (!fs.existsSync(i18nDir)) {
          fs.mkdirSync(i18nDir, { recursive: true });
        }

        for (const locale of locales) {
          const entries = projectDictEntries[locale];
          if (entries.length > 0) {
            const dictPath = path.join(i18nDir, `${locale}.ts`);
            const content = generateProjectDict(locale, entries, locale === defaultLocale);
            const formatted = formatCode(content, "typescript", dictPath);
            fs.writeFileSync(dictPath, formatted, "utf-8");
            updatedLocales++;
          }
        }

        return {
          success: true,
          updatedEntities,
          updatedLocales,
        };
      });

      // POST /api/i18n/update - 단일 딕셔너리 항목 수정
      server.post<{
        Body: {
          oldKey: string;
          newKey: string;
          source: "entity" | "project";
          values: Record<string, string>;
        };
      }>("/api/i18n/update", async (request) => {
        const { oldKey, newKey, source, values } = request.body;

        const { defaultLocale, supportedLocales } = Sonamu.config.i18n ?? {
          defaultLocale: "ko",
          supportedLocales: ["ko"],
        };
        const locales = supportedLocales;

        // entity source의 default locale 처리
        if (source === "entity" && values[defaultLocale]) {
          await updateEntityByKey(newKey, values[defaultLocale]);
        }

        // project dict 업데이트 (entity의 non-default locale 또는 project source)
        const i18nDir = path.join(Sonamu.apiRootPath, "src", "i18n");
        if (!fs.existsSync(i18nDir)) {
          fs.mkdirSync(i18nDir, { recursive: true });
        }

        for (const locale of locales) {
          // entity source의 default locale은 entity.json에서 처리했으므로 스킵
          if (source === "entity" && locale === defaultLocale) continue;

          const cellValue = values[locale]?.trim();
          if (!cellValue) continue;

          // 기존 dict 로드
          const { entries } = loadProjectDict(locale);

          // key 변경 시 기존 key 제거
          if (oldKey !== newKey) {
            const oldIndex = entries.findIndex((e) => e.key === oldKey);
            if (oldIndex !== -1) {
              entries.splice(oldIndex, 1);
            }
          }

          // 새 값 업데이트 또는 추가
          const existingIndex = entries.findIndex((e) => e.key === newKey);
          const newEntry: DictEntry = {
            key: newKey,
            value: cellValue,
            isFunction: isFunctionValue(cellValue),
          };

          if (existingIndex !== -1) {
            entries[existingIndex] = newEntry;
          } else {
            entries.push(newEntry);
          }

          // dict 파일 저장
          const dictPath = path.join(i18nDir, `${locale}.ts`);
          const content = generateProjectDict(locale, entries, locale === defaultLocale);
          const formatted = formatCode(content, "typescript", dictPath);
          fs.writeFileSync(dictPath, formatted, "utf-8");
        }

        return { success: true };
      });

      // POST /api/i18n/create - 새 딕셔너리 키 추가 (project source만)
      server.post<{
        Body: {
          key: string;
          values: Record<string, string>;
        };
      }>("/api/i18n/create", async (request) => {
        const { key, values } = request.body;

        if (!key?.trim()) {
          throw new BadRequestException("키를 입력해주세요");
        }

        const { defaultLocale, supportedLocales } = Sonamu.config.i18n ?? {
          defaultLocale: "ko",
          supportedLocales: ["ko"],
        };
        const locales = supportedLocales;

        // 중복 키 체크
        for (const locale of locales) {
          const { entries } = loadProjectDict(locale);
          if (entries.some((e) => e.key === key)) {
            throw new BadRequestException(`이미 존재하는 키입니다: ${key}`);
          }
        }

        const i18nDir = path.join(Sonamu.apiRootPath, "src", "i18n");
        if (!fs.existsSync(i18nDir)) {
          fs.mkdirSync(i18nDir, { recursive: true });
        }

        // 각 locale에 새 키 추가
        for (const locale of locales) {
          const cellValue = values[locale]?.trim();
          if (!cellValue) continue;

          const { entries } = loadProjectDict(locale);
          entries.push({
            key,
            value: cellValue,
            isFunction: isFunctionValue(cellValue),
          });

          const dictPath = path.join(i18nDir, `${locale}.ts`);
          const content = generateProjectDict(locale, entries, locale === defaultLocale);
          const formatted = formatCode(content, "typescript", dictPath);
          fs.writeFileSync(dictPath, formatted, "utf-8");
        }

        return { success: true };
      });

      // POST /api/i18n/delete - 딕셔너리 키 삭제 (project source만)
      server.post<{
        Body: {
          key: string;
        };
      }>("/api/i18n/delete", async (request) => {
        const { key } = request.body;

        if (!key) {
          throw new BadRequestException("키를 입력해주세요");
        }

        const { defaultLocale, supportedLocales } = Sonamu.config.i18n ?? {
          defaultLocale: "ko",
          supportedLocales: ["ko"],
        };
        const locales = supportedLocales;

        const i18nDir = path.join(Sonamu.apiRootPath, "src", "i18n");

        let deleted = false;
        for (const locale of locales) {
          const { entries } = loadProjectDict(locale);
          const index = entries.findIndex((e) => e.key === key);
          if (index !== -1) {
            entries.splice(index, 1);
            deleted = true;

            const dictPath = path.join(i18nDir, `${locale}.ts`);
            const content = generateProjectDict(locale, entries, locale === defaultLocale);
            const formatted = formatCode(content, "typescript", dictPath);
            fs.writeFileSync(dictPath, formatted, "utf-8");
          }
        }

        if (!deleted) {
          throw new BadRequestException(`키를 찾을 수 없습니다: ${key}`);
        }

        return { success: true };
      });

      // POST /api/i18n/checkUsage - ast-grep을 사용하여 미사용 키 검사
      server.post<{ Body: { keys: string[] } }>("/api/i18n/checkUsage", async (request) => {
        const { keys } = request.body;
        const { execSync } = await import("child_process");

        // ast-grep 설치 확인
        let sgPath: string | null = null;
        try {
          sgPath = execSync("which sg", { encoding: "utf-8" }).trim();
        } catch {
          try {
            sgPath = execSync("which ast-grep", { encoding: "utf-8" }).trim();
          } catch {
            // ast-grep not installed
          }
        }

        if (!sgPath) {
          return {
            error:
              "ast-grep이 설치되어 있지 않습니다. brew install ast-grep 또는 npm install -g @ast-grep/cli로 설치해주세요.",
            unusedKeys: [] as string[],
          };
        }

        const searchPaths: string[] = [];
        for (const entry of ["api", "web", "app"]) {
          const srcPath = path.join(Sonamu.appRootPath, entry, "src");
          if (fs.existsSync(srcPath)) {
            searchPaths.push(srcPath);
          }
        }

        if (searchPaths.length === 0) {
          return {
            error: "검색할 src 디렉토리를 찾을 수 없습니다.",
            unusedKeys: [] as string[],
          };
        }

        const usedKeys = new Set<string>();

        try {
          // ast-grep으로 SD("...") 패턴 검색
          // 패턴: SD("KEY") 또는 SD('KEY') 형태
          const patterns = ['SD("$KEY")', "SD('$KEY')"];

          for (const searchPath of searchPaths) {
            for (const pattern of patterns) {
              try {
                const result = execSync(`${sgPath} --pattern '${pattern}' --json ${searchPath}`, {
                  encoding: "utf-8",
                  maxBuffer: 50 * 1024 * 1024, // 50MB
                });

                if (result.trim()) {
                  const matches = JSON.parse(result);
                  for (const match of matches) {
                    // metaVariables.single.KEY.text에서 키 추출
                    const keyText = match.metaVariables?.single?.KEY?.text;
                    if (keyText) {
                      // 따옴표 제거
                      const cleanKey = keyText.replace(/^["']|["']$/g, "");
                      usedKeys.add(cleanKey);
                    }
                  }
                }
              } catch {
                // 패턴 매치 없으면 에러 (무시)
              }
            }
          }

          // keys 중에서 usedKeys에 없는 것들이 미사용 키
          const unusedKeys = keys.filter((k) => !usedKeys.has(k));

          return { unusedKeys, usedKeysCount: usedKeys.size };
        } catch (e) {
          return {
            error: `검색 중 오류 발생: ${e instanceof Error ? e.message : String(e)}`,
            unusedKeys: [] as string[],
          };
        }
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

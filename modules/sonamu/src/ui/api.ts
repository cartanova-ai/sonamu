import assert from "assert";
import { execSync } from "child_process";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import inflection from "inflection";
import path from "path";
import { range } from "radashi";
import * as XLSX from "xlsx";
import { Sonamu } from "../api/sonamu";
import type { SonamuDBConfig } from "../database/db";
import { sonamuDictEn, sonamuDictKo } from "../dict";
import type { Entity } from "../entity/entity";
import { EntityManager } from "../entity/entity-manager";
import {
  BadRequestException,
  isSoException,
  ServiceUnavailableException,
} from "../exceptions/so-exceptions";
import { type MigrationResult, Migrator } from "../migration/migrator";
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
        source: "entity" | "sonamu" | "project";
        isFunction: boolean;
        [locale: string]: string | boolean;
      };

      /**
       * entity.json에서 entity labels 추출
       */
      function extractEntityLabels(): { key: string; value: string; isFunction?: boolean }[] {
        const labels: { key: string; value: string; isFunction?: boolean }[] = [];

        if (!EntityManager.isAutoloaded) {
          return labels;
        }

        const entityIds = EntityManager.getAllIds();

        for (const entityId of entityIds) {
          const entity = EntityManager.get(entityId);

          // entity title
          labels.push({ key: `entity.${entityId}`, value: entity.title });

          // entity CRUD labels
          labels.push({ key: `entity.${entityId}.list`, value: `${entity.title} 목록` });
          labels.push({ key: `entity.${entityId}.create`, value: `${entity.title} 생성` });
          labels.push({
            key: `entity.${entityId}.edit`,
            value: `${entity.title} 수정 (#\${id})`,
            isFunction: true,
          });

          // prop labels
          for (const prop of entity.props) {
            if (prop.desc) {
              labels.push({ key: `entity.${entityId}.${prop.name}`, value: prop.desc });
            }
          }

          // enum labels
          for (const [enumId, enumLabelsMap] of Object.entries(entity.enumLabels)) {
            for (const [value, label] of Object.entries(enumLabelsMap)) {
              labels.push({ key: `enum.${enumId}.${value}`, value: label });
            }
          }
        }

        return labels;
      }

      /**
       * 프로젝트 dictionary 파일 로드
       */
      function loadProjectDict(
        locale: string,
      ): Record<string, string | ((...args: unknown[]) => string)> {
        const dictPath = path.join(Sonamu.apiRootPath, "src/i18n", `${locale}.ts`);
        if (!fs.existsSync(dictPath)) {
          return {};
        }

        try {
          // ts 파일을 동적으로 import 할 수 없으므로 파일 내용을 파싱
          const content = fs.readFileSync(dictPath, "utf-8");

          // defineLocale({ ... }) 또는 export default { ... } 패턴에서 객체 추출
          const match = content.match(
            /(?:defineLocale|export\s+default)\s*\(\s*\{([\s\S]*)\}\s*\)/,
          );
          if (!match) {
            return {};
          }

          const objContent = match[1];
          const dict: Record<string, string> = {};

          // "key": "value" 또는 "key": (args) => `template` 패턴 매칭
          const entryRegex = /"([^"]+)":\s*(?:"([^"]*)"|(.*?=>.*?)),?\s*(?="|$|\})/g;
          let entryMatch: RegExpExecArray | null;
          while (true) {
            entryMatch = entryRegex.exec(objContent);
            if (!entryMatch) break;
            const key = entryMatch[1];
            const stringValue = entryMatch[2];
            const funcValue = entryMatch[3];

            if (stringValue !== undefined) {
              dict[key] = stringValue;
            } else if (funcValue) {
              // 함수인 경우 템플릿 문자열 추출 시도
              const templateMatch = funcValue.match(/`([^`]*)`/);
              if (templateMatch) {
                dict[key] = templateMatch[1];
              }
            }
          }

          return dict;
        } catch (e) {
          console.error(`Failed to load project dict for ${locale}:`, e);
          return {};
        }
      }

      /**
       * 전체 dictionary 조회
       */
      server.get("/api/i18n/dictionary", async () => {
        const i18nConfig = Sonamu.config.i18n ?? {
          defaultLocale: "ko",
          supportedLocales: ["ko"],
        };
        const { defaultLocale, supportedLocales } = i18nConfig;

        // 1. entity labels 추출
        const entityLabels = extractEntityLabels();

        // 2. sonamu 내장 dict
        // biome-ignore lint/suspicious/noExplicitAny: dict 함수들의 파라미터 타입이 다양해서 any 처리
        const sonamuDicts: Record<string, Record<string, string | ((...args: any[]) => string)>> = {
          ko: sonamuDictKo,
          en: sonamuDictEn,
        };

        // 3. project dict 로드
        const projectDicts: Record<
          string,
          // biome-ignore lint/suspicious/noExplicitAny: dict 함수들의 파라미터 타입이 다양해서 any 처리
          Record<string, string | ((...args: any[]) => string)>
        > = {};
        for (const locale of supportedLocales) {
          projectDicts[locale] = loadProjectDict(locale);
        }

        // 4. 통합하여 rows 구성
        const keySet = new Set<string>();
        const rows: I18nDictionaryRow[] = [];

        // entity labels
        for (const { key, value, isFunction } of entityLabels) {
          keySet.add(key);
          const row: I18nDictionaryRow = {
            key,
            source: "entity",
            isFunction: isFunction ?? false,
            [defaultLocale]: value,
          };
          // 다른 locale에서 project dict에 정의되어 있으면 가져옴
          for (const locale of supportedLocales) {
            if (locale !== defaultLocale && projectDicts[locale]?.[key]) {
              const dictValue = projectDicts[locale][key];
              row[locale] = typeof dictValue === "function" ? String(dictValue) : dictValue;
            }
          }
          rows.push(row);
        }

        // sonamu dict
        const sonamuKeys = new Set([
          ...Object.keys(sonamuDicts.ko ?? {}),
          ...Object.keys(sonamuDicts.en ?? {}),
        ]);
        for (const key of sonamuKeys) {
          if (keySet.has(key)) continue;
          keySet.add(key);
          const row: I18nDictionaryRow = {
            key,
            source: "sonamu",
            isFunction: false,
          };
          for (const locale of supportedLocales) {
            const value = sonamuDicts[locale]?.[key];
            if (value) {
              row.isFunction = typeof value === "function";
              row[locale] = typeof value === "function" ? String(value) : value;
            }
          }
          rows.push(row);
        }

        // project dict
        for (const locale of supportedLocales) {
          for (const [key, value] of Object.entries(projectDicts[locale] ?? {})) {
            if (keySet.has(key)) continue;
            keySet.add(key);
            const row: I18nDictionaryRow = {
              key,
              source: "project",
              isFunction: typeof value === "function",
            };
            for (const loc of supportedLocales) {
              const locValue = projectDicts[loc]?.[key];
              if (locValue) {
                row[loc] = typeof locValue === "function" ? String(locValue) : locValue;
              }
            }
            rows.push(row);
          }
        }

        // 1. key 기준 정렬
        // 2. source 기준 정렬(entity > project > sonamu)
        rows
          .sort((a, b) => a.key.localeCompare(b.key))
          .sort((a, _b) => {
            if (a.source === "entity") {
              return -1;
            } else if (a.source === "project") {
              return 0;
            } else {
              return 1;
            }
          });

        return {
          rows,
          locales: supportedLocales,
          defaultLocale,
        };
      });

      /**
       * 엑셀 export
       */
      server.get("/api/i18n/export", async (_request, reply) => {
        const i18nConfig = Sonamu.config.i18n ?? {
          defaultLocale: "ko",
          supportedLocales: ["ko"],
        };
        const { defaultLocale, supportedLocales } = i18nConfig;

        // dictionary 데이터 가져오기
        const entityLabels = extractEntityLabels();
        // biome-ignore lint/suspicious/noExplicitAny: dict 함수들의 파라미터 타입이 다양해서 any 처리
        const sonamuDicts: Record<string, Record<string, string | ((...args: any[]) => string)>> = {
          ko: sonamuDictKo,
          en: sonamuDictEn,
        };
        const projectDicts: Record<
          string,
          // biome-ignore lint/suspicious/noExplicitAny: dict 함수들의 파라미터 타입이 다양해서 any 처리
          Record<string, string | ((...args: any[]) => string)>
        > = {};
        for (const locale of supportedLocales) {
          projectDicts[locale] = loadProjectDict(locale);
        }

        // 엑셀 데이터 구성
        const excelData: Record<string, string>[] = [];
        const keySet = new Set<string>();

        // entity labels
        for (const { key, value } of entityLabels) {
          keySet.add(key);
          const row: Record<string, string> = {
            key,
            source: "entity",
            [defaultLocale]: value,
          };
          for (const locale of supportedLocales) {
            if (locale !== defaultLocale) {
              const dictValue = projectDicts[locale]?.[key];
              row[locale] = dictValue
                ? typeof dictValue === "function"
                  ? String(dictValue)
                  : dictValue
                : "";
            }
          }
          excelData.push(row);
        }

        // sonamu dict
        const sonamuKeys = new Set([
          ...Object.keys(sonamuDicts.ko ?? {}),
          ...Object.keys(sonamuDicts.en ?? {}),
        ]);
        for (const key of sonamuKeys) {
          if (keySet.has(key)) continue;
          keySet.add(key);
          const row: Record<string, string> = {
            key,
            source: "sonamu",
          };
          for (const locale of supportedLocales) {
            const value = sonamuDicts[locale]?.[key];
            row[locale] = value ? (typeof value === "function" ? String(value) : value) : "";
          }
          excelData.push(row);
        }

        // project dict
        for (const locale of supportedLocales) {
          for (const [key] of Object.entries(projectDicts[locale] ?? {})) {
            if (keySet.has(key)) continue;
            keySet.add(key);
            const row: Record<string, string> = {
              key,
              source: "project",
            };
            for (const loc of supportedLocales) {
              const locValue = projectDicts[loc]?.[key];
              row[loc] = locValue
                ? typeof locValue === "function"
                  ? String(locValue)
                  : locValue
                : "";
            }
            excelData.push(row);
          }
        }

        // 정렬
        excelData.sort((a, b) => a.key.localeCompare(b.key));

        // 엑셀 파일 생성
        const worksheet = XLSX.utils.json_to_sheet(excelData, {
          header: ["key", "source", ...supportedLocales],
        });
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

      /**
       * 엑셀 import
       */
      server.post("/api/i18n/import", async (request) => {
        return await waitForHMRCompleted(async () => {
          const data = await request.file();
          if (!data) {
            throw new BadRequestException("파일이 업로드되지 않았습니다.");
          }

          const buffer = await data.toBuffer();
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);

          const i18nConfig = Sonamu.config.i18n ?? {
            defaultLocale: "ko",
            supportedLocales: ["ko"],
          };
          const { defaultLocale, supportedLocales } = i18nConfig;

          // entity.json 수정을 위한 데이터 수집
          const entityUpdates: Map<
            string,
            { title?: string; props: Map<string, string>; enums: Map<string, Map<string, string>> }
          > = new Map();

          // project dict 수정을 위한 데이터 수집
          const projectDictUpdates: Map<string, Map<string, string>> = new Map();
          for (const locale of supportedLocales) {
            projectDictUpdates.set(locale, new Map());
          }

          for (const row of rows) {
            const { key, source } = row;

            // sonamu source는 read-only이므로 무시
            if (source === "sonamu") continue;

            if (source === "entity") {
              // entity.* 또는 enum.* 키 처리
              if (key.startsWith("entity.")) {
                const parts = key.split(".");
                const entityId = parts[1];
                const propOrAction = parts[2];

                if (!entityUpdates.has(entityId)) {
                  entityUpdates.set(entityId, { props: new Map(), enums: new Map() });
                }
                const entityUpdate = entityUpdates.get(entityId);
                assert(entityUpdate, `entityUpdate not found for ${entityId}`);

                if (!propOrAction) {
                  // entity.{entityId} - title
                  entityUpdate.title = row[defaultLocale];
                } else if (["list", "create", "edit"].includes(propOrAction)) {
                  // CRUD labels는 title에서 자동 생성되므로 무시
                } else {
                  // entity.{entityId}.{propName} - prop desc
                  entityUpdate.props.set(propOrAction, row[defaultLocale]);
                }

                // 다른 locale 값은 project dict에 저장
                for (const locale of supportedLocales) {
                  if (locale !== defaultLocale && row[locale]) {
                    const projectDictUpdate = projectDictUpdates.get(locale);
                    assert(projectDictUpdate, `projectDictUpdate not found for ${locale}`);
                    projectDictUpdate.set(key, row[locale]);
                  }
                }
              } else if (key.startsWith("enum.")) {
                // enum.{EnumId}.{value}
                const parts = key.split(".");
                const enumId = parts[1];
                const enumValue = parts[2];

                // enum이 속한 entity 찾기
                const entityIds = EntityManager.getAllIds();
                for (const entityId of entityIds) {
                  const entity = EntityManager.get(entityId);
                  if (entity.enumLabels[enumId]) {
                    if (!entityUpdates.has(entityId)) {
                      entityUpdates.set(entityId, { props: new Map(), enums: new Map() });
                    }
                    const entityUpdate = entityUpdates.get(entityId);
                    assert(entityUpdate, `entityUpdate not found for ${entityId}`);
                    if (!entityUpdate.enums.has(enumId)) {
                      entityUpdate.enums.set(enumId, new Map());
                    }
                    const enumUpdate = entityUpdate.enums.get(enumId);
                    assert(enumUpdate, `enumUpdate not found for ${enumId}`);
                    enumUpdate.set(enumValue, row[defaultLocale]);
                    break;
                  }
                }

                // 다른 locale 값은 project dict에 저장
                for (const locale of supportedLocales) {
                  if (locale !== defaultLocale && row[locale]) {
                    const projectDictUpdate = projectDictUpdates.get(locale);
                    assert(projectDictUpdate, `projectDictUpdate not found for ${locale}`);
                    projectDictUpdate.set(key, row[locale]);
                  }
                }
              }
            } else if (source === "project") {
              // project dict에 저장
              for (const locale of supportedLocales) {
                if (row[locale]) {
                  const projectDictUpdate = projectDictUpdates.get(locale);
                  assert(projectDictUpdate, `projectDictUpdate not found for ${locale}`);
                  projectDictUpdate.set(key, row[locale]);
                }
              }
            }
          }

          // entity.json 업데이트
          for (const [entityId, updates] of entityUpdates) {
            const entity = EntityManager.get(entityId);

            if (updates.title) {
              entity.title = updates.title;
            }

            for (const [propName, desc] of updates.props) {
              const prop = entity.props.find((p) => p.name === propName);
              if (prop) {
                prop.desc = desc;
              }
            }

            for (const [enumId, enumLabels] of updates.enums) {
              if (entity.enumLabels[enumId]) {
                for (const [value, label] of enumLabels) {
                  entity.enumLabels[enumId][value] = label;
                }
              }
            }

            await entity.save();
          }

          // project dict 파일 업데이트
          for (const [locale, updates] of projectDictUpdates) {
            if (updates.size === 0) continue;

            const dictPath = path.join(Sonamu.apiRootPath, "src/i18n", `${locale}.ts`);

            // 기존 dict 로드
            const existingDict = loadProjectDict(locale);

            // 업데이트 적용
            for (const [key, value] of updates) {
              existingDict[key] = value;
            }

            // 파일 생성
            const entries = Object.entries(existingDict)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => {
                if (typeof value === "function") {
                  return `  "${key}": ${String(value)},`;
                }
                return `  "${key}": "${value.replace(/"/g, '\\"')}",`;
              })
              .join("\n");

            const content = `import { defineLocale } from "./sd.generated";

export default defineLocale({
${entries}
});
`;
            fs.writeFileSync(dictPath, content, "utf-8");
          }

          return {
            success: true,
            updatedEntities: entityUpdates.size,
            updatedLocales: projectDictUpdates.size,
          };
        });
      });

      // ui-web 빌드 파일 서빙
      const uiDistPath = path.resolve(import.meta.dirname, "../ui-web");

      // 정적 파일 서빙: 루트 폴더 전체 (assets, setting.svg 등)
      server.register(await import("@fastify/static"), {
        root: uiDistPath,
        prefix: "/",
        decorateReply: false,
      });

      // SPA fallback - 정적 파일이 없는 경로만 index.html로
      server.setNotFoundHandler(async (_request, reply) => {
        reply.headers({ "Content-type": "text/html" }).send(
          fs
            .readFileSync(path.resolve(import.meta.dirname, "../ui-web/index.html"))
            .toString()
            .replace("{{projectName}}", Sonamu.config.projectName ?? "UnknownSonamuProject"),
        );
      });
    },
    { prefix: "/sonamu-ui" },
  );
}

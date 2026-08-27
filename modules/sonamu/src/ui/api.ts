import { execFileSync, execSync } from "child_process";
import fs from "fs";
import path from "path";

import { type FastifyInstance } from "fastify";
import inflection from "inflection";
import { range } from "radashi";

import { Sonamu } from "../api/sonamu";
import { DB } from "../database/db";
import { type SonamuDBConfig } from "../database/db";
import { createKnexInstance } from "../database/knex";
import { SD } from "../dict/sd";
import { sonamuDictionary } from "../dict/sonamu-dictionary";
import { type Entity } from "../entity/entity";
import { EntityManager } from "../entity/entity-manager";
import {
  BadRequestException,
  isSoException,
  ServiceUnavailableException,
} from "../exceptions/so-exceptions";
import { TemplateManager } from "../template/template-manager";
import { DataExplorer, type DataExplorerOptions } from "../testing/data-explorer";
import { FixtureGenerator, type FixtureGenerationSpec } from "../testing/fixture-generator";
import { FixtureManager } from "../testing/fixture-manager";
import { type DuplicateCheckOptions } from "../testing/fixture-manager";
import { BUILT_IN_TYPE_IDS, TemplateKey } from "../types/types";
import {
  type Cone,
  type EntityIndex,
  type EntityProp,
  type EntitySubsetRow,
  type FixtureRecord,
  type FixtureSearchOptions,
  type FlattenSubsetRow,
  type PathAndCode,
} from "../types/types";
import { isObjectValue } from "../utils/runtime-value";
import { nonNullable } from "../utils/utils";
import { setAiApi } from "./ai-api";
import { forwardAsyncErrors } from "./async-route";
import { type CddAddRuleRequest } from "./cdd-service";
import {
  addRule,
  editContent,
  getAcList,
  getCddTree,
  listRules,
  openSourceFile,
  readContent,
  readRule,
} from "./cdd-service";
import { registerMigrationsApi } from "./migrations-api";

interface EntityTemplateInput {
  entityId: string;
  enumId?: string;
}

async function waitForHMRCompleted<T>(fn: () => Promise<T>): Promise<T> {
  const waitPromise = new Promise<void>((resolve) => {
    const handler = () => {
      clearTimeout(timeout);
      resolve();
    };

    const timeout = setTimeout(() => {
      Sonamu.syncer.eventEmitter.off("onHMRCompleted", handler);
      resolve();
    }, 1500);

    Sonamu.syncer.eventEmitter.once("onHMRCompleted", handler);
  });

  const result = await fn();
  await waitPromise;
  return result;
}

function flattenSubsetRows(subsetRows: EntitySubsetRow[]): FlattenSubsetRow[] {
  return subsetRows.flatMap((subsetRow) => {
    const { children, ...sRow } = subsetRow;
    return [sRow, ...flattenSubsetRows(children)];
  });
}

export async function sonamuUIApiPlugin(fastify: FastifyInstance) {
  fastify.register(
    async (server) => {
      await setAiApi(server);
      await registerMigrationsApi(server);

      server.get("/api/sonamu/config", async () => {
        return Sonamu.config;
      });

      server.get<{
        Querystring: {
          entityId?: string;
          preset?: "types" | "entity.json" | "generated";
          absPath?: string;
        };
      }>("/api/tools/openVscode", (request) =>
        forwardAsyncErrors(async () => {
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
                return undefined;
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
        }),
      );

      server.get<{
        Querystring: {
          editor: "vscode" | "cursor" | "zed";
          absPath: string;
        };
      }>("/api/tools/openEditor", (request) =>
        forwardAsyncErrors(async () => {
          const commands = {
            vscode: "code",
            cursor: "cursor",
            zed: "zed",
          } as const;
          const command = commands[request.query.editor];
          if (command === undefined) {
            throw new BadRequestException(SD("error.badRequest"));
          }

          // 셸을 거치지 않아 파일 경로가 명령으로 해석되지 않도록 합니다.
          execFileSync(command, [request.query.absPath]);
        }),
      );

      server.get<{
        Querystring: {
          origin: string;
          entityId?: string;
        };
      }>("/api/tools/getSuggestion", (request) =>
        forwardAsyncErrors(async () => {
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
          for (const glossaryEntityId of EntityManager.getAllIds()) {
            const glossaryEntity = EntityManager.get(glossaryEntityId);
            if ((glossaryEntity.title ?? "") !== "") {
              glossary.set(inflection.underscore(glossaryEntity.id), glossaryEntity.title);
              glossary.set(
                inflection.underscore(inflection.pluralize(glossaryEntity.id)),
                `${glossaryEntity.title}리스트`,
              );
            }

            glossaryEntity.props.forEach((prop) => {
              if (glossary.has(prop.name)) {
                return;
              }
              if (prop.desc) {
                glossary.set(
                  prop.name,
                  prop.desc.replace(glossaryEntity.title ?? "", "{EntityID}"),
                );
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
        }),
      );

      server.get("/api/entity/findMany", async () => {
        const entityIds = EntityManager.getAllIds();

        const entities = await Promise.all(
          entityIds.map((entityId) => {
            const entity = EntityManager.get(entityId);
            const subsetRows = entity.getSubsetRows();

            // zod 인스턴스를 spread하면 JSON.stringify가 reference를 인라인으로 풀어내며 응답이 수백 MB까지 부풀어 V8 string limit를 초과한다.
            const {
              types: _types,
              enums: _enums,
              enumCones: _enumCones,
              subsetCones: _subsetCones,
              ...rest
            } = entity;

            return {
              ...rest,
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
      }>(
        "/api/entity/typeIds",
        (request): Promise<{ typeIds: string[] }> =>
          forwardAsyncErrors(async () => {
            const { filter, reload } = request.query;

            if (reload === "1") {
              await Sonamu.syncer.autoloadTypes();
            }

            const typeIds = (() => {
              // 프로젝트에서 정의한 타입들
              const projectTypeIds = Object.entries(Sonamu.syncer.types)
                .filter(([_typeId, zodType]) => {
                  const { _zod: zodMetadata } = zodType;
                  return (
                    /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ (zodMetadata
                      .def.type as string) !== "enum"
                  );
                })
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
          }),
      );

      server.post<{
        Body: {
          form: {
            id: string;
            title: string;
            table: string;
            parentId?: string;
          };
        };
      }>("/api/entity/create", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { form } = request.body;
            await Sonamu.syncer.createEntity({ ...form, entityId: form.id });

            return 1;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
        };
      }>("/api/entity/del", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId } = request.body;
            return await Sonamu.syncer.delEntity(entityId);
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          newValues: {
            title: string;
            table: string;
            parentId?: string;
          };
        };
      }>("/api/entity/modifyEntityBase", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, newValues } = request.body;
            const entity = EntityManager.get(entityId);
            entity.title = newValues.title;
            entity.table = newValues.table;
            entity.parentId = newValues.parentId;
            await entity.save();

            return 1;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          subsetKey: string;
          fields: string[];
          fieldsInternal?: string[];
        };
      }>("/api/entity/modifySubset", (request) =>
        forwardAsyncErrors(async () => {
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
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          subsetKey: string;
        };
      }>("/api/entity/delSubset", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, subsetKey } = request.body;
            const entity = EntityManager.get(entityId);
            delete entity.subsets[subsetKey];
            delete entity.subsetsInternal[subsetKey];
            await entity.save();

            return 1;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          newProp: EntityProp;
          at?: number;
        };
      }>("/api/entity/createProp", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, at, newProp } = request.body;
            const entity = EntityManager.get(entityId);
            await entity.createProp(newProp, at);
            return true;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          newProp: EntityProp;
          at: number;
        };
      }>("/api/entity/modifyProp", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, at, newProp } = request.body;

            const entity = EntityManager.get(entityId);
            entity.modifyProp(newProp, at);

            return true;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          at: number;
        };
      }>("/api/entity/delProp", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, at } = request.body;

            const entity = EntityManager.get(entityId);
            entity.delProp(at);
            return true;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          at: number;
          to: number;
        };
      }>("/api/entity/moveProp", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, at, to } = request.body;

            const entity = EntityManager.get(entityId);
            entity.moveProp(at, to);

            return true;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          indexes: EntityIndex[];
        };
      }>("/api/entity/modifyIndexes", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, indexes } = request.body;
            const entity = EntityManager.get(entityId);
            entity.indexes = indexes;
            await entity.save();

            return { updated: indexes };
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          enumLabels: Entity["enumLabels"];
        };
      }>("/api/entity/modifyEnumLabels", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, enumLabels } = request.body;
            const entity = EntityManager.get(entityId);
            entity.enumLabels = enumLabels;
            await entity.save();

            return { updated: enumLabels };
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          newEnumId: string;
        };
      }>("/api/entity/createEnumId", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, newEnumId } = request.body;
            const entity = EntityManager.get(entityId);

            if (entity.enumLabels[newEnumId]) {
              throw new Error(`이미 존재하는 enumId입니다: ${newEnumId}`);
            }

            entity.enumLabels[newEnumId] = newEnumId.endsWith("Status")
              ? {
                  active: "노출",
                  hidden: "숨김",
                }
              : {
                  "": "",
                };
            await entity.save();

            return 1;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          enumId: {
            before: string;
            after: string;
          };
        };
      }>("/api/entity/modifyEnumId", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, enumId } = request.body;
            const entityIds = EntityManager.getAllIds();
            const isExists = entityIds.some((candidateEntityId) => {
              const candidateEntity = EntityManager.get(candidateEntityId);
              return Object.keys(candidateEntity.enumLabels).includes(enumId.after);
            });
            if (isExists) {
              throw new Error(`이미 존재하는 EnumId입니다: ${enumId.after}`);
            }

            const entity = EntityManager.get(entityId);
            entity.enumLabels[enumId.after] = entity.enumLabels[enumId.before];
            delete entity.enumLabels[enumId.before];

            await entity.save();

            for (const relatedEntityId of entityIds) {
              const relatedEntity = EntityManager.get(relatedEntityId);
              for (const prop of relatedEntity.props) {
                if (prop.type === "enum" && prop.id === enumId.before) {
                  prop.id = enumId.after;
                }
              }
              await relatedEntity.save();
            }
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          enumId: string;
        };
      }>("/api/entity/deleteEnumId", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, enumId } = request.body;

            const entityIds = EntityManager.getAllIds();
            const isReferenced = entityIds
              .flatMap((referencingEntityId) => EntityManager.get(referencingEntityId).props)
              .some((prop) => prop.type === "enum" && prop.id === enumId);
            if (isReferenced) {
              throw new Error(`${enumId}를 참조하는 프로퍼티가 존재합니다.`);
            }

            const entity = EntityManager.get(entityId);
            delete entity.enumLabels[enumId];
            await entity.save();
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          target: "entity" | "prop" | "enum" | "subset";
          propName?: string;
          enumId?: string;
          subsetKey?: string;
          cone: Cone;
        };
      }>("/api/entity/updateCone", (request) =>
        forwardAsyncErrors(async () => {
          return await waitForHMRCompleted(async () => {
            const { entityId, target, propName, enumId, subsetKey, cone } = request.body;
            const entity = EntityManager.get(entityId);

            if (target === "entity") {
              entity.cone = cone;
            } else if (target === "prop" && propName) {
              const prop = entity.props.find((p) => p.name === propName);
              if (prop) {
                /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ (
                  prop as { cone?: Cone }
                ).cone = cone;
              }
            } else if (target === "enum" && enumId) {
              entity.enumCones[enumId] = cone;
            } else if (target === "subset" && subsetKey) {
              entity.subsetCones[subsetKey] = cone;
            }

            await entity.save();
            return true;
          });
        }),
      );

      server.post<{
        Body: {
          entityId: string;
          preserveExisting?: boolean;
          onlyEmpty?: boolean;
          locale?: "ko" | "en" | "ja";
        };
      }>("/api/entity/generateCones", async (request, reply) => {
        return await waitForHMRCompleted(async () => {
          const { entityId, preserveExisting, onlyEmpty, locale } = request.body;

          try {
            // Entity 존재 여부 확인
            const entity = EntityManager.get(entityId);

            // locale 기본값: Sonamu.config.i18n.defaultLocale 사용
            // SAFETY: i18n 구성 스키마가 지원 locale을 ko/en/ja로 제한한다.
            const effectiveLocale =
              locale ?? (Sonamu.config.i18n.defaultLocale as "ko" | "en" | "ja");

            // Cone 생성
            const result = await entity.generateCones({
              preserveExisting: preserveExisting ?? true,
              onlyEmpty: onlyEmpty ?? false,
              locale: effectiveLocale,
            });

            return result;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            // Entity not found
            if (message.includes("존재하지 않는 Entity")) {
              reply.status(404);
              return {
                success: false,
                error: `Entity not found: ${entityId}`,
              };
            }

            // API 키 없음
            if (message.includes("ANTHROPIC_API_KEY not found")) {
              reply.status(500);
              return {
                success: false,
                error: "API key not configured",
              };
            }

            // Rate limit
            if (message.includes("Rate limit exceeded")) {
              reply.status(429);
              return {
                success: false,
                error: "Rate limit exceeded. Please try again later.",
              };
            }

            // 기타 에러
            reply.status(500);
            return {
              success: false,
              error: `Cone generation failed: ${message}`,
            };
          }
        });
      });

      server.get<{
        Querystring: {
          entityId: string;
        };
      }>("/api/entity/getTableColumns", (request) =>
        forwardAsyncErrors(async () => {
          const { entityId } = request.query;
          const entity = EntityManager.get(entityId);
          const columns = entity.getTableColumns();
          return { columns };
        }),
      );

      server.post<{
        Body: {
          entityIds: string[];
          templateKeys: string[];
        };
      }>("/api/scaffolding/getStatus", (request) =>
        forwardAsyncErrors(async () => {
          const { entityIds, templateKeys: _templateKeys } = request.body;
          if ((entityIds ?? []).length === 0) {
            throw new BadRequestException(SD("sonamu.error.entityIdsRequired"));
          } else if ((_templateKeys ?? []).length === 0) {
            throw new BadRequestException(SD("sonamu.error.templateKeysRequired"));
          }

          // sorting
          entityIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          const templateKeys = TemplateKey.options.filter((tk) => _templateKeys.includes(tk));

          const combinations = entityIds.flatMap((entityId) => {
            return templateKeys.map((templateKey) => [entityId, templateKey]);
          });

          const statuses = await Promise.all(
            combinations.map(async ([entityId, templateKey]) => {
              const { subPath, fullPath, isExists } = await Sonamu.syncer.checkExistsGenCode(
                entityId,
                /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ templateKey as TemplateKey,
              );
              return {
                entityId,
                templateKey,
                subPath,
                fullPath,
                isExists,
              };
            }),
          );
          return { statuses };
        }),
      );

      server.post<{
        Body: {
          options: {
            entityId: string;
            templateKey: string;
            enumId?: string;
            overwrite?: boolean;
          }[];
        };
      }>("/api/scaffolding/generate", (request) =>
        forwardAsyncErrors(async () => {
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
                  /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ templateKey as TemplateKey,
                  /* SAFETY: UI 도구의 Zod 입력 스키마가 Entity 템플릿 옵션을 보장한다. */ {
                    entityId,
                    enumId,
                  } as EntityTemplateInput,
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
        }),
      );

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
        (request): Promise<{ pathAndCodes: PathAndCode[] }> =>
          forwardAsyncErrors(async () => {
            const { option } = request.body;

            try {
              const { templateKey, ...templateOptions } = option;
              const pathAndCodes = await Sonamu.syncer.renderTemplate(
                /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ templateKey as TemplateKey,
                templateOptions,
              );

              return { pathAndCodes };
            } catch (e) {
              console.error(e);
              throw e;
            }
          }),
      );

      server.post("/api/fixture", (request) =>
        forwardAsyncErrors(async () => {
          const { sourceDB, targetDB, search, duplicateCheck } =
            /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ request.body as {
              sourceDB: keyof SonamuDBConfig;
              targetDB: keyof SonamuDBConfig;
              search: FixtureSearchOptions;
              duplicateCheck?: DuplicateCheckOptions;
            };

          return FixtureManager.getFixtures(sourceDB, targetDB, search, duplicateCheck);
        }),
      );

      server.post("/api/fixture/import", (request) =>
        forwardAsyncErrors(async () => {
          const { db, fixtures } =
            /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ request.body as {
              db: keyof SonamuDBConfig;
              fixtures: FixtureRecord[];
            };

          return FixtureManager.insertFixtures(db, fixtures);
        }),
      );

      server.post("/api/fixture/addFixtureLoader", (request) =>
        forwardAsyncErrors(async () => {
          const { code } =
            /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ request.body as {
              code: string;
            };

          return FixtureManager.addFixtureLoader(code);
        }),
      );

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

      server.post("/api/i18n/import", (request) =>
        forwardAsyncErrors(async () => {
          const data = await request.file();
          if (!data) {
            throw new BadRequestException(SD("sonamu.error.fileNotUploaded"));
          }
          const buffer = await data.toBuffer();
          return sonamuDictionary.importFromExcel(buffer);
        }),
      );

      server.post<{
        Body: {
          oldKey: string;
          newKey: string;
          source: "entity" | "project" | "sonamu";
          values: Record<string, string>;
        };
      }>("/api/i18n/update", (request) =>
        forwardAsyncErrors(async () => {
          await sonamuDictionary.updateEntry(request.body);
          return { success: true };
        }),
      );

      server.post<{
        Body: {
          key: string;
          values: Record<string, string>;
        };
      }>("/api/i18n/create", (request) =>
        forwardAsyncErrors(async () => {
          await sonamuDictionary.createEntry(request.body);
          return { success: true };
        }),
      );

      server.post<{
        Body: {
          key: string;
        };
      }>("/api/i18n/delete", (request) =>
        forwardAsyncErrors(async () => {
          await sonamuDictionary.deleteEntry(request.body.key);
          return { success: true };
        }),
      );

      server.post<{ Body: { keys: string[] } }>("/api/i18n/checkUsage", (request) =>
        forwardAsyncErrors(async () => {
          return sonamuDictionary.checkUsage(request.body.keys);
        }),
      );

      // Tasks API
      server.get("/api/tasks/status", async () => {
        try {
          Sonamu.workflows;
          return { active: true };
        } catch {
          return { active: false };
        }
      });

      server.get("/api/tasks/workflowDefinitions", async () => {
        const definitions = Sonamu.workflows.workflowDefinitions;
        return { definitions };
      });

      server.get<{
        Querystring: {
          limit?: string;
          after?: string;
          before?: string;
          order?: "asc" | "desc";
          status?: string;
          workflowName?: string;
          createdAfter?: string;
          createdBefore?: string;
        };
      }>("/api/tasks/workflowRuns", (request) =>
        forwardAsyncErrors(async () => {
          const backend = Sonamu.workflows.backend;
          const { limit, after, before, order, status, workflowName, createdAfter, createdBefore } =
            request.query;
          return backend.listWorkflowRuns({
            limit: limit ? Number.parseInt(limit, 10) : undefined,
            after,
            before,
            order,
            status: status ? status.split(",") : undefined,
            workflowName: workflowName || undefined,
            createdAfter: createdAfter ? new Date(createdAfter) : undefined,
            createdBefore: createdBefore ? new Date(createdBefore) : undefined,
          });
        }),
      );

      server.get<{
        Params: { id: string };
      }>("/api/tasks/workflowRuns/:id", (request) =>
        forwardAsyncErrors(async () => {
          const backend = Sonamu.workflows.backend;
          const workflowRun = await backend.getWorkflowRun({
            workflowRunId: request.params.id,
          });
          if (!workflowRun) {
            throw new Error(`Workflow run not found: ${request.params.id}`);
          }
          return workflowRun;
        }),
      );

      server.post<{
        Params: { id: string };
      }>("/api/tasks/workflowRuns/:id/cancel", (request) =>
        forwardAsyncErrors(async () => {
          const backend = Sonamu.workflows.backend;
          return backend.cancelWorkflowRun({
            workflowRunId: request.params.id,
          });
        }),
      );

      server.post<{
        Params: { id: string };
      }>("/api/tasks/workflowRuns/:id/pause", (request) =>
        forwardAsyncErrors(async () => {
          const backend = Sonamu.workflows.backend;
          return backend.pauseWorkflowRun({
            workflowRunId: request.params.id,
          });
        }),
      );

      server.post<{
        Params: { id: string };
      }>("/api/tasks/workflowRuns/:id/resume", (request) =>
        forwardAsyncErrors(async () => {
          const backend = Sonamu.workflows.backend;
          return backend.resumeWorkflowRun({
            workflowRunId: request.params.id,
          });
        }),
      );

      server.get<{
        Params: { id: string };
        Querystring: {
          limit?: string;
          after?: string;
          before?: string;
        };
      }>("/api/tasks/workflowRuns/:id/steps", (request) =>
        forwardAsyncErrors(async () => {
          const backend = Sonamu.workflows.backend;
          const { limit, after, before } = request.query;
          return backend.listStepAttempts({
            workflowRunId: request.params.id,
            limit: limit ? Number.parseInt(limit, 10) : undefined,
            after,
            before,
          });
        }),
      );

      /**
       * Health Check API
       * MCP 도구가 Sonamu 서버를 자동 감지하기 위한 엔드포인트
       */
      server.get("/api/sonamu/health", (request) =>
        forwardAsyncErrors(async () => {
          const address = request.server.server.address();
          const port = address && isObjectValue(address) ? address.port : 0;

          return {
            ok: true,
            project: process.cwd().split("/").pop() || "unknown",
            port,
            timestamp: new Date().toISOString(),
          };
        }),
      );

      /**
       * Fixture 생성 API
       */
      server.post<{
        Body: {
          entity: string;
          count?: number;
          overrides?: FixtureGenerationSpec["overrides"];
          targetDb?: "fixture" | "test";
        };
      }>("/api/sonamu/fixture/generate", async (request, reply) => {
        const { entity, count = 1, overrides, targetDb = "fixture" } = request.body;

        // 타겟 DB 설정 가져오기
        const dbConfig = targetDb === "fixture" ? Sonamu.dbConfig.fixture : Sonamu.dbConfig.test;

        // Knex 인스턴스 생성
        const db = createKnexInstance(dbConfig);

        try {
          // FixtureGenerator 생성
          const generator = new FixtureGenerator(db, db, targetDb, EntityManager);

          // 단일 Entity 배치 생성
          const fixtures = await generator.generateBatch([
            {
              entity,
              count,
              overrides: overrides ?? {},
            },
          ]);

          return {
            success: true,
            entity,
            count: fixtures.length,
            fixtures,
            targetDb,
          };
        } catch (error) {
          reply.status(400);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        } finally {
          await db.destroy();
        }
      });

      /**
       * Fixture 데이터 탐색 API
       */
      server.post<{
        Body: {
          entity: string;
          strategy: "sample" | "recent" | "random" | "query";
          limit?: number;
          where?: DataExplorerOptions["where"];
        };
      }>("/api/sonamu/fixture/explore", async (request, reply) => {
        const { entity, strategy, limit = 10, where } = request.body;

        // Fixture DB 설정 가져오기
        const fixtureDbConfig = Sonamu.dbConfig.fixture;

        // Knex 인스턴스 생성
        const fixtureDb = createKnexInstance(fixtureDbConfig);

        try {
          // DataExplorer 생성
          const explorer = new DataExplorer(fixtureDb, EntityManager);

          const data = await explorer.explore(entity, {
            strategy,
            limit,
            where,
          });

          return {
            success: true,
            entity,
            strategy,
            count: data.length,
            data,
          };
        } catch (error) {
          reply.status(400);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        } finally {
          await fixtureDb.destroy();
        }
      });

      /**
       * Fixture 데이터 가져오기 (fetch) API
       * production/development DB에서 실제 데이터를 fixture DB로 import
       */
      server.post<{
        Body: {
          entity: string;
          strategy?: "sample" | "recent" | "random" | "query";
          limit?: number;
          includeRelations?: boolean;
          maxDepth?: number;
        };
      }>("/api/sonamu/fixture/fetch", async (request, reply) => {
        const {
          entity,
          strategy = "recent",
          limit = 10,
          includeRelations = true,
          maxDepth = 2,
        } = request.body;

        // Source DB (production/development) - 읽기 전용
        const sourceDb = DB.getDB("r");

        // Target DB (fixture)
        const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);

        try {
          // FixtureGenerator 생성
          const generator = new FixtureGenerator(sourceDb, fixtureDb, "fixture", EntityManager);

          // production 데이터를 fixture DB로 import
          const results = await generator.importFromSource(entity, {
            strategy,
            limit,
            includeRelations,
            maxDepth,
          });

          return {
            success: true,
            entity,
            strategy,
            count: results.length,
            imported: results,
          };
        } catch (error) {
          reply.status(400);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        } finally {
          // sourceDb는 Sonamu가 관리하므로 destroy하지 않음
          await fixtureDb.destroy();
        }
      });

      /**
       * Fixture 데이터 삭제 (clean) API
       * FK 순서를 고려하여 안전하게 삭제
       */
      server.post<{
        Body: {
          entities?: string[];
        };
      }>("/api/sonamu/fixture/clean", async (request, reply) => {
        const { entities } = request.body;

        // Fixture DB 연결
        const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);

        try {
          // 삭제할 Entity 목록 결정
          const targetEntities =
            entities && entities.length > 0 ? entities : EntityManager.getAllIds();

          // Entity ID를 테이블명으로 변환 (snake_case 복수형)
          const tableNames = targetEntities.map((entityId) => {
            const entity = EntityManager.get(entityId);
            return entity.table;
          });

          // PostgreSQL: TRUNCATE CASCADE로 FK 순서 무관하게 안전하게 삭제
          // CASCADE 옵션으로 의존성 있는 데이터도 함께 삭제
          await fixtureDb.raw(
            `TRUNCATE TABLE ${tableNames.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
          );

          return {
            success: true,
            cleaned: tableNames,
            count: tableNames.length,
          };
        } catch (error) {
          reply.status(400);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        } finally {
          await fixtureDb.destroy();
        }
      });

      // CDD API
      server.get("/api/cdd/tree", async () => {
        return getCddTree();
      });

      server.post<{ Body: { filePath: string } }>("/api/cdd/readContent", (request) =>
        forwardAsyncErrors(async () => {
          const { filePath } = request.body;
          return readContent(filePath);
        }),
      );

      server.post<{ Body: { filePath: string } }>("/api/cdd/editContent", (request) =>
        forwardAsyncErrors(async () => {
          const { filePath } = request.body;
          return editContent(filePath);
        }),
      );

      server.post<{ Body: { filePath: string } }>("/api/cdd/openSource", (request) =>
        forwardAsyncErrors(async () => {
          const { filePath } = request.body;
          openSourceFile(filePath);
          return { success: true };
        }),
      );

      // CDD Rules API
      server.get("/api/cdd/rules", async () => {
        return listRules();
      });

      server.post<{ Body: { ruleKey: string } }>("/api/cdd/readRule", (request) =>
        forwardAsyncErrors(async () => {
          const { ruleKey } = request.body;
          return readRule(ruleKey);
        }),
      );

      server.post<{ Body: CddAddRuleRequest }>("/api/cdd/addRule", (request) =>
        forwardAsyncErrors(async () => {
          return addRule(request.body);
        }),
      );

      // CDD AC API
      server.get("/api/cdd/ac", async () => {
        return getAcList();
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

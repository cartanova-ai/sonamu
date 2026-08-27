import assert from "assert";
import fs from "fs";
import path from "path";

/* oxlint-disable @typescript-eslint/no-explicit-any */ // AI SDK의 타입이 명확하지 않아 any를 허용함
import { type LanguageModel, type ModelMessage, type StreamTextResult } from "ai";
import { z } from "zod";

import { Sonamu } from "../api/sonamu";
import { EntityManager } from "../entity/entity-manager";
import {
  getEnumDefValues,
  isInternalSubsetField,
  normalizeSubsetField,
  TemplateOptions,
} from "../types/types";
import { type EntityProp, type FixtureRecord } from "../types/types";
import { nonNullable } from "../utils/utils";

type ValidationError = {
  field: string;
  message: string;
};

const fixtureScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const fixtureColumnValueSchema = z.union([fixtureScalarSchema, z.array(fixtureScalarSchema)]);
const fixtureColumnsSchema = z.record(z.string(), fixtureColumnValueSchema);
type FixtureToolColumns = z.infer<typeof fixtureColumnsSchema>;

class AIClient {
  private model: LanguageModel | null = null;
  private aiSdk:
    | (typeof import("ai") & {
        anthropic?: typeof import("@ai-sdk/anthropic").anthropic;
      })
    | null = null;

  async init() {
    try {
      const { anthropic } = await import("@ai-sdk/anthropic");
      const aiModule = await import("ai");
      this.aiSdk = { ...aiModule, anthropic };
      this.model = anthropic("claude-sonnet-4-6");
    } catch (error) {
      console.warn(
        "AI SDK packages not installed. Install @ai-sdk/anthropic and ai to use AI features.",
      );
      throw error;
    }
  }

  handleFixture(
    messages: ModelMessage[],
    fixtureRecords: FixtureRecord[],
  ): StreamTextResult<any, any> {
    if (!this.aiSdk || !this.model) {
      throw new Error("AI SDK not initialized. Call init() first.");
    }
    const model = this.model;

    // 현재 fixtureRecords에서 사용된 엔티티들의 구조 정보 수집
    const usedEntityIds = [...new Set(fixtureRecords.map((r) => r.entityId))];
    const entityStructures = usedEntityIds.map((entityId) => {
      const entity = EntityManager.get(entityId);

      return {
        entityId: entity.id,
        table: entity.table,
        props: entity.props,
        relations: entity.relations,
        enumLabels: entity.enumLabels,
      };
    });

    const systemMessage = `
        당신은 픽스쳐 레코드를 수정하고 생성할 수 있는 도우미입니다.

        현재 픽스쳐 레코드:
        ${JSON.stringify(fixtureRecords, null, 2)}

        엔티티 구조 정보:
        ${JSON.stringify(entityStructures, null, 2)}

        ## 픽스쳐 수정
        사용자가 픽스쳐 값 수정을 요청하면 updateFixtures 도구를 사용하여 변경사항을 적용하세요.
        - fixtureId: 수정할 픽스쳐 ID (형식: "EntityId#id")
        - updates: 컬럼명을 키로, 새 값을 값으로 하는 객체

        예시: "User#1" 픽스쳐의 "name" 컬럼을 "홍길동"으로 변경하려면:
        updateFixtures({ updates: [{ fixtureId: "User#1", updates: { name: "홍길동" } }] })

        변경될 컬럼의 type이 relation인 경우, 관련 엔티티에도 반영되어야 할 컬럼이 있는지 확인하세요.

        ## 픽스쳐 생성
        사용자가 새로운 픽스쳐 생성을 요청하면 createFixtures 도구를 사용하세요.
        - entityId: 생성할 엔티티 ID
        - id: 새 레코드의 ID (기존 픽스쳐와 중복되지 않는 음수 사용 권장, 예: -1, -2)
        - columns: 컬럼명을 키로, 값을 값으로 하는 객체 (엔티티 구조 참고)

        예시: 새로운 User 픽스쳐를 생성하려면:
        createFixtures({ fixtures: [{ entityId: "User", id: -1, columns: { name: "홍길동", email: "hong@example.com" } }] })
      `;

    const { streamText, tool } = this.aiSdk;

    return streamText({
      model,
      system: systemMessage,
      messages,
      tools: {
        updateFixtures: tool({
          description:
            "픽스쳐 레코드의 값을 수정합니다. 사용자가 특정 컬럼이나 값을 변경해달라고 요청할 때 사용하세요.",
          inputSchema: z.object({
            updates: z.array(
              z.object({
                fixtureId: z.string().describe("수정할 픽스쳐 ID (형식: EntityId#id)"),
                updates: fixtureColumnsSchema.describe("컬럼명을 키로, 새 값을 값으로 하는 객체"),
              }),
            ),
          }),
          execute: async ({
            updates,
          }: {
            updates: Array<{ fixtureId: string; updates: FixtureToolColumns }>;
          }): Promise<{ success: boolean; updatedRecords: FixtureRecord[] }> => {
            // fixtureRecords를 복사하고 업데이트 적용
            const updatedRecords: FixtureRecord[] = fixtureRecords.map((record) => {
              const update = updates.find(
                (u: { fixtureId: string }) => u.fixtureId === record.fixtureId,
              );
              if (update) {
                // columns의 value를 업데이트
                for (const [columnName, newValue] of Object.entries(update.updates)) {
                  record.columns[columnName].value = newValue;
                }
                return record;
              }

              return record;
            });

            return { success: true, updatedRecords };
          },
        }),
        createFixtures: tool({
          description:
            "새로운 픽스쳐 레코드를 생성합니다. 사용자가 새로운 데이터를 추가해달라고 요청할 때 사용하세요.",
          inputSchema: z.object({
            fixtures: z.array(
              z.object({
                entityId: z.string().describe("생성할 엔티티 ID"),
                id: z.number().describe("새 레코드의 ID (음수 권장, 예: -1, -2)"),
                columns: fixtureColumnsSchema.describe("컬럼명을 키로, 값을 값으로 하는 객체"),
              }),
            ),
          }),
          execute: async ({
            fixtures,
          }: {
            fixtures: Array<{ entityId: string; id: number; columns: FixtureToolColumns }>;
          }): Promise<{ success: boolean; updatedRecords: FixtureRecord[] }> => {
            const newRecords: FixtureRecord[] = fixtures.map((fixture) => {
              const entity = EntityManager.get(fixture.entityId);

              // 엔티티 props를 기반으로 columns 구성
              const columns: FixtureRecord["columns"] = {};
              for (const prop of entity.props) {
                if (prop.type === "virtual") continue;

                let value = fixture.columns[prop.name] ?? null;

                if (prop.name === "created_at") {
                  // 현재 시간으로 설정
                  value = new Date().toISOString();
                } else if (
                  prop.type === "relation" &&
                  (prop.relationType === "HasMany" || prop.relationType === "ManyToMany")
                ) {
                  // 배열로 변환
                  value = Array.isArray(value) ? value : [value].filter(nonNullable);
                }

                columns[prop.name] = {
                  prop,
                  value,
                };
              }

              return {
                fixtureId: `${fixture.entityId}#${fixture.id}`,
                entityId: fixture.entityId,
                id: fixture.id,
                columns,
                fetchedRecords: [],
                belongsRecords: [],
                override: false,
              };
            });

            // 새 레코드들의 relation 컬럼을 확인하여 기존 레코드들의 역방향 relation 업데이트
            for (const newRecord of newRecords) {
              for (const [_colName, col] of Object.entries(newRecord.columns)) {
                if (col.prop.type !== "relation" || col.value === null) continue;

                const relatedEntityId = col.prop.with;
                const relatedIds = Array.isArray(col.value) ? col.value : [col.value];

                for (const relatedId of relatedIds) {
                  const relatedFixtureId = `${relatedEntityId}#${relatedId}`;
                  const relatedRecord = newRecords.find((r) => r.fixtureId === relatedFixtureId);

                  if (relatedRecord) {
                    // 역방향 relation 찾기
                    const reverseCol = Object.entries(relatedRecord.columns).find(
                      ([, c]) => c.prop.type === "relation" && c.prop.with === newRecord.entityId,
                    );

                    if (reverseCol) {
                      const [reverseColName, reverseColValue] = reverseCol;
                      const currentValue = reverseColValue.value;

                      // 역방향이 배열인 경우 (HasMany, ManyToMany)
                      if (
                        reverseColValue.prop.type === "relation" &&
                        (reverseColValue.prop.relationType === "HasMany" ||
                          reverseColValue.prop.relationType === "ManyToMany")
                      ) {
                        assert(Array.isArray(currentValue), "currentValue must be an array");
                        if (!currentValue.includes(newRecord.id)) {
                          relatedRecord.columns[reverseColName] = {
                            ...reverseColValue,
                            value: [...currentValue, newRecord.id],
                          };
                        }
                      } else {
                        // 역방향이 단일 값인 경우 (BelongsToOne, OneToOne)
                        relatedRecord.columns[reverseColName] = {
                          ...reverseColValue,
                          value: newRecord.id,
                        };
                      }
                    }
                  }
                }
              }
            }

            return { success: true, updatedRecords: newRecords };
          },
        }),
      },
    });
  }

  handleEntity(messages: ModelMessage[]): StreamTextResult<any, any> {
    if (!this.aiSdk || !this.model) {
      throw new Error("AI SDK not initialized. Call init() first.");
    }
    const model = this.model;

    // entity.instructions.md 파일 읽기 (dist/ui 또는 src/ui에서 실행되므로 패키지 루트 기준으로 접근)
    const instructionsPath = path.join(
      import.meta.dirname,
      "..",
      "..",
      "src",
      "ui",
      "entity.instructions.md",
    );
    const instructions = fs.readFileSync(instructionsPath, "utf-8");

    // 현재 등록된 엔티티 정보 수집
    const entityIds = EntityManager.getAllIds();
    const existingEntities = entityIds.map((entityId) => {
      const entity = EntityManager.get(entityId);
      return {
        id: entity.id,
        title: entity.title,
        table: entity.table,
        props: entity.props.map((p) => ({
          name: p.name,
          type: p.type,
          desc: p.desc,
        })),
      };
    });

    const systemMessage = `
당신은 Sonamu 프레임워크에서 Entity와 Enum을 생성하는 도우미입니다.

${instructions}

## 현재 등록된 Entity 목록
다른 엔티티와 관계(relation)를 맺거나 subset에서 참조할 때 반드시 아래 정보를 확인하세요.

${JSON.stringify(existingEntities, null, 2)}

## Tool 사용 가이드

### Entity 생성 (createEntity)
사용자가 새로운 Entity 생성을 요청하면 createEntity 도구를 사용하세요.
- entityId: PascalCase로 된 Entity ID (예: "User", "ProductCategory")
- title: 한글 제목 (예: "사용자", "상품 카테고리")
- table: snake_case로 된 테이블명 (예: "users", "product_categories")
- parentId: 부모 Entity ID (선택사항)
- props: Entity의 프로퍼티 배열 (위 문서의 Property Types 참고)
- indexes: 인덱스 배열
- subsets: 서브셋 정의 (기본값: { A: ["id"] })
- enums: Enum 정의

### Entity 수정 (updateEntity)
기존 Entity를 수정할 때 updateEntity 도구를 사용하세요. Enum 추가, props 추가/수정, indexes 수정 등 모든 수정 작업에 사용합니다.
- entityId: 수정할 Entity ID
- updates: 수정할 필드들 (부분 업데이트)
  - title: 엔티티 한글 제목
  - table: 테이블명
  - props: 추가할 프로퍼티 배열 (기존 props에 추가, 같은 이름이면 교체)
  - indexes: 추가할 인덱스 배열 (기존 indexes에 추가)
  - subsets: 서브셋 정의 (기존 subsets에 병합)
  - enumLabels: Enum 정의 (기존 enumLabels에 병합)
- mode: "merge"(기본값) 또는 "replace"
  - merge: 기존 값에 병합
  - replace: 해당 필드 전체 교체

예시: Employee에 새 Enum 추가
updateEntity({ entityId: "Employee", updates: { enumLabels: { "EmployeeRole": { "admin": "관리자", "user": "일반" } } } })

예시: Project에 새 프로퍼티 추가
updateEntity({ entityId: "Project", updates: { props: [{ name: "priority", type: "integer", desc: "우선순위" }] } })

## 필수 사항
- Entity의 props에는 최소한 id(integer, unsigned), created_at(timestamp)가 포함되어야 합니다.
- relation 필드는 onUpdate, onDelete가 필수입니다. (예외: OneToOne에서 hasJoinColumn이 false인 경우)
- Enum ID는 보통 EntityId + 속성명 형태입니다 (예: UserStatus, ProductType)
- subset에서 다른 엔티티의 프로퍼티를 참조할 때는 반드시 해당 엔티티의 실제 프로퍼티명을 사용하세요.

## 검증 오류 처리
도구 호출 결과로 검증 오류(validationErrors)가 반환되면:
1. 오류 메시지를 분석하여 문제점을 파악하세요.
2. 오류를 수정한 데이터로 createEntity를 다시 호출하세요.
3. 사용자에게 오류를 그대로 전달하지 말고, 수정 후 재시도하세요.

### 일반적인 검증 오류와 수정 방법
| 오류 메시지 | 수정 방법 |
|------------|----------|
| "id 프로퍼티가 필수" | props에 { name: "id", type: "integer", unsigned: true } 추가 |
| "created_at 프로퍼티가 필수" | props에 { name: "created_at", type: "timestamp", dbDefault: "CURRENT_TIMESTAMP" } 추가 |
| "XxxOrderBy enum이 필수" | enums에 { "XxxOrderBy": { "id-desc": "ID최신순" } } 추가 |
| "XxxSearchField enum이 필수" | enums에 { "XxxSearchField": { "id": "ID" } } 추가 |
| "string 타입은 length가 필수" | 해당 prop에 length 추가 (예: 255) |
| "text 타입은 textType이 필수" | 해당 prop에 textType 추가 ("text", "mediumtext", "longtext") |
| "onUpdate가 필수" | 해당 relation prop에 onUpdate, onDelete 추가 ("CASCADE") |
      `;

    const { streamText, tool, stepCountIs } = this.aiSdk;

    return streamText({
      model,
      system: systemMessage,
      messages,
      stopWhen: stepCountIs(2),
      tools: {
        createEntity: tool({
          description:
            "새로운 Entity를 생성합니다. 사용자가 새로운 엔티티나 테이블 생성을 요청할 때 사용하세요.",
          inputSchema: TemplateOptions["shape"].entity,
          execute: async (
            entity: z.infer<(typeof TemplateOptions)["shape"]["entity"]>,
          ): Promise<{
            success: boolean;
            entityId: string;
            error?: string;
            validationErrors?: ValidationError[];
          }> => {
            try {
              // 입력 검증
              const validationErrors = validateEntityJson(entity);

              if (validationErrors.length > 0) {
                return {
                  success: false,
                  entityId: entity.entityId,
                  error: `검증 오류: ${validationErrors.map((e) => `[${e.field}] ${e.message}`).join(", ")}`,
                  validationErrors,
                };
              }

              await Sonamu.syncer.createEntity({
                subsets: { A: ["id"] },
                enums: {},
                ...entity,
              });

              // EntityManager 리로드
              await EntityManager.reload();

              return { success: true, entityId: entity.entityId };
            } catch (e) {
              const error = e instanceof Error ? e.message : "Unknown error";
              return { success: false, entityId: entity.entityId, error };
            }
          },
        }),
        updateEntity: tool({
          description:
            "기존 Entity를 수정합니다. Enum 추가, props 추가/수정, indexes 수정, subsets 수정 등 모든 엔티티 수정 작업에 사용하세요.",
          inputSchema: z.object({
            entityId: z.string().describe("수정할 Entity ID"),
            updates: TemplateOptions["shape"].entity.partial().describe("수정할 필드들"),
            mode: z
              .enum(["merge", "replace"])
              .optional()
              .describe("수정 모드: merge(기본값, 기존 값에 병합) 또는 replace(전체 교체)"),
          }),
          execute: async ({
            entityId,
            updates,
            mode = "merge",
          }: {
            entityId: string;
            updates: Partial<z.infer<(typeof TemplateOptions)["shape"]["entity"]>>;
            mode?: "merge" | "replace";
          }): Promise<{
            success: boolean;
            entityId: string;
            error?: string;
            validationErrors?: ValidationError[];
          }> => {
            try {
              const entity = EntityManager.get(entityId);

              // Update basic properties
              if (updates.entityId !== undefined) entity.id = updates.entityId;
              if (updates.parentId !== undefined) entity.parentId = updates.parentId;
              if (updates.title !== undefined) entity.title = updates.title;
              if (updates.table !== undefined) entity.table = updates.table;
              if (updates.cone !== undefined) entity.cone = updates.cone;

              // props: merge 시 이름 기준 병합, replace 시 교체
              if (updates.props !== undefined) {
                if (mode === "replace") {
                  entity.props =
                    /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ updates.props as EntityProp[];
                } else {
                  for (const newProp of updates.props) {
                    const existingIndex = entity.props.findIndex((p) => p.name === newProp.name);
                    if (existingIndex >= 0) {
                      entity.props[existingIndex] =
                        /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ newProp as EntityProp;
                    } else {
                      entity.props.push(
                        /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ newProp as EntityProp,
                      );
                    }
                  }
                }
              }

              // indexes: merge 시 추가, replace 시 교체
              if (updates.indexes !== undefined) {
                entity.indexes =
                  mode === "replace" ? updates.indexes : [...entity.indexes, ...updates.indexes];
              }

              // subsets, subsetsInternal: assign으로 병합 또는 교체
              if (updates.subsets !== undefined) {
                // Normalize subset fields: separate into subsets (normal) and subsetsInternal (internal)
                const normalizedSubsets: { [key: string]: string[] } = {};
                const normalizedSubsetsInternal: { [key: string]: string[] } = {};

                for (const [key, fields] of Object.entries(updates.subsets)) {
                  const fieldArray =
                    /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ fields as string[];
                  normalizedSubsets[key] = fieldArray
                    .filter((f: string) => !isInternalSubsetField(f))
                    .map(normalizeSubsetField);
                  normalizedSubsetsInternal[key] = fieldArray
                    .filter(isInternalSubsetField)
                    .map(normalizeSubsetField);
                }

                entity.subsets =
                  mode === "replace"
                    ? normalizedSubsets
                    : { ...entity.subsets, ...normalizedSubsets };
                entity.subsetsInternal =
                  mode === "replace"
                    ? normalizedSubsetsInternal
                    : { ...entity.subsetsInternal, ...normalizedSubsetsInternal };
              }

              if (updates.enums !== undefined) {
                const convertedEnums = Object.fromEntries(
                  Object.entries(updates.enums).map(([key, enumDef]) => [
                    key,
                    getEnumDefValues(enumDef),
                  ]),
                );
                entity.enumLabels =
                  mode === "replace" ? convertedEnums : { ...entity.enumLabels, ...convertedEnums };
              }

              // 저장 전 검증
              const validationErrors = validateEntityJson({
                ...entity,
                entityId: entity.id,
                enums: entity.enumLabels,
              });

              if (validationErrors.length > 0) {
                return {
                  success: false,
                  entityId,
                  error: `검증 오류: ${validationErrors.map((e) => `[${e.field}] ${e.message}`).join(", ")}`,
                  validationErrors,
                };
              }

              await entity.save();

              return { success: true, entityId };
            } catch (e) {
              const error = e instanceof Error ? e.message : "Unknown error";
              return { success: false, entityId, error };
            }
          },
        }),
      },
    });
  }
}

/**
 * Entity JSON이 entity.instructions.md의 규칙을 따르는지 검증합니다.
 */
function validateEntityJson(input: TemplateOptions["entity"]): ValidationError[] {
  const errors: ValidationError[] = [];
  const { entityId, props, enums } = input;

  // 1. id, created_at prop 필수
  const hasIdProp = props?.some((p) => p.name === "id");
  if (!hasIdProp) {
    errors.push({ field: "props", message: "id 프로퍼티가 필수입니다." });
  }
  const hasCreatedAtProp = props?.some((p) => p.name === "created_at");
  if (!hasCreatedAtProp) {
    errors.push({ field: "props", message: "created_at 프로퍼티가 필수입니다." });
  }

  // 2. 필수 enum 검증: EntityNameOrderBy, EntityNameSearchField
  const orderByEnumId = `${entityId}OrderBy`;
  const searchFieldEnumId = `${entityId}SearchField`;

  if (!enums?.[orderByEnumId]) {
    errors.push({
      field: "enums",
      message: `${orderByEnumId} enum이 필수입니다. (예: { "id-desc": "ID최신순" })`,
    });
  }
  if (!enums?.[searchFieldEnumId]) {
    errors.push({
      field: "enums",
      message: `${searchFieldEnumId} enum이 필수입니다. (예: { "id": "ID" })`,
    });
  }

  // 3. enum prop의 id가 enums에 정의되어 있는지 확인 (cross-field 검증)
  for (const prop of props ?? []) {
    if (prop.type === "enum" && !enums?.[prop.id]) {
      errors.push({
        field: `props.${prop.name}`,
        message: `enum id "${prop.id}"가 enums에 정의되어 있지 않습니다.`,
      });
    }
  }

  return errors;
}

export const aiClient = new AIClient();

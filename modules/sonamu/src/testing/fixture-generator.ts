import { type LanguageModel } from "ai";
import chalk from "chalk";
import { type Knex } from "knex";
import { z } from "zod";

import { type SonamuDBPreset } from "../database/db";
import { type Entity } from "../entity/entity";
import { type EntityManager } from "../entity/entity-manager";
import { type EntityProp, type FixtureImportResult, type FixtureRecord } from "../types/types";
import { isBelongsToOneRelationProp, isOneToOneRelationProp, isRelationProp } from "../types/types";
import { isTest } from "../utils/controller";
import { isFunctionValue } from "../utils/runtime-value";
import { DataExplorer, dataExplorerRecordSchema, dataExplorerValueSchema } from "./data-explorer";
import { dataSourceConfigSchema } from "./data-explorer";
import { type DataExplorerRecord, type DataExplorerValue } from "./data-explorer";
import { type ExploreWithRelationsOptions, type ExploreWithRelationsResult } from "./data-explorer";
import { fakerMappings } from "./faker-mappings";
import { type FakerMappings } from "./faker-mappings";
import { FixtureManager } from "./fixture-manager";
import { type FixtureSourceRecord } from "./fixture-manager";

export type Locale = "ko" | "en" | "ja";
export type FixtureOverrides = object;

type FakerFunction = (...args: DataExplorerValue[]) => DataExplorerValue;
type FakerNamespaceMember = FakerFunction | FakerNamespace;
type FakerNamespace = { [name: string]: FakerNamespaceMember };

const fakerFunctionSchema = z.custom<FakerFunction>(
  isFunctionValue,
  "Faker 경로의 마지막 값은 함수여야 합니다.",
);
const fakerNamespaceObjectSchema = z.object({});
const dynamicNamespaceSchema = z.custom<FakerNamespace>(
  (candidate) => fakerNamespaceObjectSchema.safeParse(candidate).success,
  "Faker 경로는 객체 namespace여야 합니다.",
);
const generatorArgumentsSchema = z.array(dataExplorerValueSchema);
const fixtureRecordIdSchema = z.union([z.number(), z.string()]);
const fixtureWhereValueSchema = z.union([z.string(), z.number(), z.boolean(), z.date(), z.null()]);

export type FixtureGenerationSpec = {
  entity: string;
  count: number;
  overrides?: FixtureOverrides;
};

type GeneratedFixture = {
  entity: string;
  data: DataExplorerRecord;
  explicitId?: boolean;
};

function parseFixtureSourceRecord(record: DataExplorerRecord): FixtureSourceRecord {
  return {
    ...record,
    id: fixtureRecordIdSchema.parse(record.id),
  };
}

export type FixtureGeneratorOptions = {
  locale?: Locale;
  useLLM?: boolean;
  enableLLMCache?: boolean;
  llmModel?: string;
  /** 테스트나 대체 LLM 공급자를 위한 텍스트 생성 구현 */
  generateText?: FixtureTextGenerator;
};

export type FixtureTextGenerator = (request: {
  model: LanguageModel;
  prompt: string;
}) => Promise<{ text: string; usage?: { totalTokens?: number } }>;

export type GeneratorContext = {
  /** 생성 중인 fixture들 (메모리 상) */
  fixtures: Map<string, DataExplorerRecord>;

  /** 참조 데이터 캐시 (DataExplorer 결과) */
  referenceCache: Map<string, DataExplorerRecord[]>;

  /** 이미 import된 레코드를 추적하여 중복 import를 방지합니다 */
  importedRecords: Set<string>; // "User#123"
};

export class FixtureGenerator {
  private dataExplorer: DataExplorer;
  private locale: Locale;
  private mappings: FakerMappings;
  private llmCache: Map<string, DataExplorerValue> = new Map();
  private entityCache: Map<string, Entity> = new Map();
  private options: FixtureGeneratorOptions;

  constructor(
    private sourceDb: Knex,
    // FixtureManager.insertFixtures가 dbName 문자열을 받기 때문에 직접 사용하지 않습니다
    // 미래 확장성을 위해 API 시그니처에는 포함시켰습니다
    _targetDb: Knex,
    private targetDbName: SonamuDBPreset,
    private entityManager: typeof EntityManager,
    options?: FixtureGeneratorOptions,
  ) {
    this.dataExplorer = new DataExplorer(sourceDb, entityManager);
    this.locale = options?.locale || "ko";
    this.mappings = fakerMappings;
    this.options = {
      locale: options?.locale || "ko",
      useLLM: options?.useLLM || false,
      enableLLMCache: options?.enableLLMCache !== false,
      llmModel: options?.llmModel || "claude-sonnet-4-6",
      generateText: options?.generateText,
    };
  }

  /**
   * Fixture 생성 (단일)
   * @returns 생성된 fixture 데이터 (메모리 상)
   */
  async generate<Overrides = undefined>(
    entityName: string,
    overrides?: Overrides,
    context: GeneratorContext = this.createContext(),
  ): Promise<DataExplorerRecord> {
    const parsedOverrides = dataExplorerRecordSchema.parse(overrides ?? {});
    // Entity 캐싱: 테스트에서 entity cone 수정이 반영되도록 보장
    let entity = this.entityCache.get(entityName);
    if (!entity) {
      entity = this.entityManager.get(entityName);
      this.entityCache.set(entityName, entity);
    }

    const tempId = `${entityName}#temp#${Date.now()}`; // 임시 ID

    // LLM row 단위 생성을 위한 고유 키 (같은 row의 필드들이 동일한 rowKey를 공유)
    const rowKey = this.options.useLLM ? `${entityName}#row#${Date.now()}` : undefined;

    // 각 prop별 값 생성
    const fixture: DataExplorerRecord = {};

    for (const prop of entity.props) {
      // Virtual prop은 스킵
      if ("virtual" in prop && prop.virtual) {
        continue;
      }

      // id prop 처리
      if (prop.name === "id") {
        // DB sequence가 자동 할당: integer/bigInteger이거나, string이지만 dbDefault에 nextval이 있는 경우
        const hasDbSequence =
          prop.type === "integer" ||
          prop.type === "bigInteger" ||
          (prop.type === "string" &&
            "dbDefault" in prop &&
            z.string().safeParse(prop.dbDefault).data?.includes("nextval") === true);
        if (hasDbSequence) {
          // generateBatch에서 처리하므로 여기선 스킵
          continue;
        }
        if (prop.type === "string") {
          // string PK: alphanumeric 32자 생성 (better-auth 스타일)
          const { faker: _faker } = await import("@faker-js/faker");
          fixture[prop.name] = _faker.string.alphanumeric(32);
          continue;
        }
        if (prop.type === "uuid") {
          const { faker: _faker } = await import("@faker-js/faker");
          fixture[prop.name] = _faker.string.uuid();
          continue;
        }
        continue;
      }

      // override가 있으면 사용
      if (prop.name in parsedOverrides) {
        fixture[prop.name] = parsedOverrides[prop.name];
        continue;
      }

      // cone에서 생성 전략 확인
      const cone = prop.cone;

      // 1. Relation prop 처리
      if (isRelationProp(prop)) {
        // BelongsToOne / OneToOne(hasJoinColumn)은 FK 컬럼명({prop.name}_id)으로도 override를 받는다
        const fkColName = `${prop.name}_id`;
        if (
          fkColName in parsedOverrides &&
          (isBelongsToOneRelationProp(prop) || (isOneToOneRelationProp(prop) && prop.hasJoinColumn))
        ) {
          fixture[fkColName] = parsedOverrides[fkColName];
          continue;
        }

        const relationValue = await this.generateRelationValue(entity, prop, context);
        // BelongsToOne, OneToOne(hasJoinColumn)의 경우 foreign key 컬럼명으로 저장
        if (
          isBelongsToOneRelationProp(prop) ||
          (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
        ) {
          fixture[`${prop.name}_id`] = relationValue;
        } else {
          fixture[prop.name] = relationValue;
        }
        continue;
      }

      // 2. cone.note + LLM 사용 (useLLM이면 fixtureGenerator보다 우선)
      if (cone?.note && this.options.useLLM) {
        try {
          const llmValue = await this.generateWithLLM(cone.note, prop, entity, rowKey);
          // string 타입이고 length 제약이 있으면 초과 시 truncation
          const llmText = z.string().safeParse(llmValue);
          const maxLength = "length" in prop ? z.number().safeParse(prop.length) : undefined;
          if (llmText.success && maxLength?.success && llmText.data.length > maxLength.data) {
            fixture[prop.name] = llmText.data.slice(0, maxLength.data);
          } else {
            fixture[prop.name] = llmValue;
          }
          continue;
        } catch (error) {
          console.warn(
            `[FixtureGenerator] LLM generation failed for ${entity.id}.${prop.name}, falling back to fixtureGenerator or default`,
            error instanceof Error ? error.message : error,
          );
          // fallback: fixtureGenerator → fixtureDefault → 기본값으로 계속
        }
      }

      // 3. fixtureGenerator 사용
      if (cone?.fixtureGenerator) {
        fixture[prop.name] = await this.executeGenerator(cone.fixtureGenerator, prop, entity);
        continue;
      }

      // 4. fixtureDefault 사용
      if (cone?.fixtureDefault !== undefined) {
        fixture[prop.name] = dataExplorerValueSchema.parse(cone.fixtureDefault);
        continue;
      }

      // 5. 타입별 기본 생성
      fixture[prop.name] = await this.generateDefaultValue(prop, entity);
    }

    // 6. email 필드가 있고 name 필드가 있으면, email의 로컬 파트를 name 기반으로 보정
    const email = z.string().safeParse(fixture.email);
    if (email.success && !("email" in parsedOverrides)) {
      const nameValue = fixture.name || fixture.username || fixture.full_name || fixture.name_en;
      const parsedName = z.string().safeParse(nameValue);
      if (parsedName.success) {
        const domain = email.data.split("@")[1] || "example.com";
        const romanized = await this.romanizeName(parsedName.data);
        fixture.email = `${romanized}@${domain}`;
      }
    }

    // 7. password 필드 암호화
    const password = z.string().safeParse(fixture.password);
    if (password.success && password.data.length > 0) {
      const bcrypt = await import("bcrypt");
      fixture.password = await bcrypt.hash(password.data, 10);
    }

    context.fixtures.set(tempId, fixture);
    return fixture;
  }

  /**
   * Relation 값 생성 + 자동 Import
   */
  private async generateRelationValue(
    entity: Entity,
    prop: EntityProp,
    context: GeneratorContext,
  ): Promise<number | string | null> {
    if (!isRelationProp(prop)) {
      throw new Error(`FixtureGenerator: ${entity.id}.${prop.name} is not a relation prop`);
    }

    // BelongsToOne, OneToOne(hasJoinColumn)만 처리
    if (
      !isBelongsToOneRelationProp(prop) &&
      !(isOneToOneRelationProp(prop) && prop.hasJoinColumn)
    ) {
      return null;
    }

    const cone = prop.cone;
    const dataSource = cone?.dataSource;

    // DataExplorer로 참조 데이터 조회 (sourceDb)
    // 관계 체인을 따라가기 위해 exploreWithRelations 사용
    if (dataSource) {
      const cacheKey = `${prop.with}:${JSON.stringify(dataSource)}`;

      if (!context.referenceCache.has(cacheKey)) {
        const dataSourceConfig = dataSourceConfigSchema.parse(dataSource.config ?? {});
        const exploreResult = await this.dataExplorer.exploreWithRelations(prop.with, {
          strategy: dataSource.strategy,
          limit: dataSourceConfig.limit ?? 10,
          includeRelations: true,
          maxDepth: 3,
          ...dataSourceConfig,
        });
        context.referenceCache.set(cacheKey, exploreResult.main.records);

        // 조회한 데이터와 관계된 모든 엔티티를 targetDb에 import
        await this.importExploreResult(exploreResult, context);
      }

      const candidates = context.referenceCache.get(cacheKey);
      if (candidates && candidates.length > 0) {
        // 랜덤하게 하나 선택
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        return z.union([z.number(), z.string()]).parse(selected.id);
      }
    }

    // dataSource가 없을 때 자동으로 fixture DB에서 조회 시도
    // 관계 체인을 따라가기 위해 exploreWithRelations 사용
    const autoKey = `${prop.with}:auto`;
    if (!context.referenceCache.has(autoKey)) {
      // fixture DB(sourceDb)에서 자동 조회 (관계 포함)
      const autoExploreResult = await this.dataExplorer.exploreWithRelations(prop.with, {
        strategy: "random",
        limit: 10,
        includeRelations: true,
        maxDepth: 3,
      });
      context.referenceCache.set(autoKey, autoExploreResult.main.records);

      // 조회한 데이터와 관계된 모든 엔티티를 targetDb에 import
      if (autoExploreResult.main.records.length > 0) {
        await this.importExploreResult(autoExploreResult, context);
      }
    }

    const autoCandidates = context.referenceCache.get(autoKey);
    if (autoCandidates && autoCandidates.length > 0) {
      // 랜덤하게 하나 선택
      const selected = autoCandidates[Math.floor(Math.random() * autoCandidates.length)];
      return z.union([z.number(), z.string()]).parse(selected.id);
    }

    // 참조 데이터가 없으면 null 반환 (nullable인 경우)
    if (prop.nullable) {
      return null;
    }

    // nullable이 아니고 데이터도 없으면 에러
    throw new Error(
      `FixtureGenerator: ${entity.id}.${prop.name}에 필요한 ${prop.with} 데이터가 없습니다. ` +
        `먼저 ${prop.with}를 생성하거나 cone.dataSource를 설정하세요.`,
    );
  }

  /**
   * ExploreWithRelations 결과를 targetDb에 import
   *
   * 관계 체인을 따라간 결과(main + related)를 모두 import합니다.
   * 의존성 순서는 FixtureManager.insertFixtures가 자동으로 처리합니다.
   */
  private async importExploreResult(
    exploreResult: ExploreWithRelationsResult,
    context: GeneratorContext,
  ): Promise<void> {
    const allFixtureRecords: FixtureRecord[] = [];

    // 1. Related entities import (Company, Department 등)
    for (const [entityId, records] of exploreResult.related.entries()) {
      const entity = this.entityManager.get(entityId);
      const recordsToImport: DataExplorerRecord[] = [];

      !isTest() &&
        console.log(
          chalk.cyan(`Importing related entity: ${entityId} (${records.length} records)`),
        );

      for (const record of records) {
        const recordKey = `${entityId}#${record.id}`;
        if (!context.importedRecords.has(recordKey)) {
          recordsToImport.push(record);
          context.importedRecords.add(recordKey);
        }
      }

      if (recordsToImport.length > 0) {
        for (const record of recordsToImport) {
          !isTest() &&
            console.log(
              chalk.gray(
                `  - Processing ${entityId} record:`,
                JSON.stringify(record).slice(0, 100),
              ),
            );
          const fixtureRecords = await FixtureManager.createFixtureRecord(
            entity,
            parseFixtureSourceRecord(record),
            { db: this.sourceDb, singleRecord: true },
          );
          allFixtureRecords.push(...fixtureRecords);
        }
      }
    }

    // 2. Main entity import (Employee 등)
    const mainEntity = this.entityManager.get(exploreResult.main.entityId);
    const mainRecordsToImport: DataExplorerRecord[] = [];

    !isTest() &&
      console.log(
        chalk.cyan(
          `Importing main entity: ${exploreResult.main.entityId} (${exploreResult.main.records.length} records)`,
        ),
      );

    for (const record of exploreResult.main.records) {
      const recordKey = `${exploreResult.main.entityId}#${record.id}`;
      if (!context.importedRecords.has(recordKey)) {
        mainRecordsToImport.push(record);
        context.importedRecords.add(recordKey);
      }
    }

    if (mainRecordsToImport.length > 0) {
      for (const record of mainRecordsToImport) {
        !isTest() &&
          console.log(
            chalk.gray(
              `  - Processing ${exploreResult.main.entityId} record:`,
              JSON.stringify(record).slice(0, 100),
            ),
          );
        const fixtureRecords = await FixtureManager.createFixtureRecord(
          mainEntity,
          parseFixtureSourceRecord(record),
          { db: this.sourceDb, singleRecord: true },
        );
        allFixtureRecords.push(...fixtureRecords);
      }
    }

    // 3. 모든 fixture를 한 번에 삽입 (의존성 순서 자동 처리)
    if (allFixtureRecords.length > 0) {
      await FixtureManager.insertFixtures(this.targetDbName, allFixtureRecords);

      !isTest() &&
        console.log(
          chalk.green(
            `Auto-imported ${exploreResult.main.entityId} with relations: ` +
              `${exploreResult.main.records.length} main + ${exploreResult.related.size} related entities`,
          ),
        );
    }
  }

  /**
   * fixtureGenerator 실행 (Faker.js만 지원)
   *
   * faker.* 형식의 표현식을 안전하게 파싱하여 실행합니다.
   * 예: "faker.internet.email()" → faker.internet.email()
   * 예: "faker.lorem.words(3)" → faker.lorem.words(3)
   */
  private async executeGenerator(
    generator: string,
    prop: EntityProp,
    entity: Entity,
  ): Promise<DataExplorerValue> {
    // Faker.js 표현식만 지원
    if (generator.startsWith("faker.")) {
      // username이나 name 필드는 한국어 faker 사용
      const isNameField = prop.name === "username" || prop.name === "name";
      const fakerModule = await import("@faker-js/faker");
      const faker = isNameField ? fakerModule.fakerKO : fakerModule.faker;
      const expr = generator.slice(6); // "faker." 제거

      try {
        // 함수 경로와 인자 파싱
        const match = expr.match(/^([\w.]+)(?:\((.*?)\))?$/);
        if (!match) {
          throw new Error(
            `FixtureGenerator: Invalid faker expression for ${prop.name}: ${generator}`,
          );
        }

        const [, path, argsStr] = match;
        const parts = path.split(".");

        // faker 객체에서 함수 찾기
        let member = dynamicNamespaceSchema.parse(faker);
        for (const part of parts) {
          if (!(part in member)) {
            throw new Error(`FixtureGenerator: Invalid faker path for ${prop.name}: faker.${path}`);
          }
          const nextMember = member[part];
          if (part !== parts.at(-1)) {
            member = dynamicNamespaceSchema.parse(nextMember);
          }
        }

        const fn = fakerFunctionSchema.parse(member[parts.at(-1) ?? ""]);

        let args: DataExplorerValue[] = [];
        if (argsStr?.trim()) {
          args = this.parseGeneratorArgs(argsStr, prop.name);
        }

        return dataExplorerValueSchema.parse(fn(...args));
      } catch (error) {
        !isTest() &&
          console.log(
            chalk.yellow(
              `Failed to execute generator "${generator}" for ${prop.name}, falling back to default:`,
            ),
            error,
          );
        return this.generateDefaultValue(prop, entity);
      }
    }

    // faker 이외의 표현식은 지원하지 않음
    !isTest() &&
      console.log(
        chalk.yellow(
          `Unsupported generator expression for ${prop.name}: ${generator}. Only faker.* expressions are supported. Using default value.`,
        ),
      );
    return this.generateDefaultValue(prop, entity);
  }

  /**
   * 필드의 타입과 이름을 분석하여 적절한 기본값을 생성합니다.
   *
   * 우선순위:
   * 1. 필드명 패턴 매칭 (salary, budget 등 의미있는 데이터)
   * 2. 특수 케이스 (Department name 등 도메인 지식)
   * 3. 배열 타입 (JSON 배열)
   * 4. Enum 타입
   * 5. 타입별 기본값
   */
  private async generateDefaultValue(
    prop: EntityProp,
    entity?: Entity,
  ): Promise<DataExplorerValue> {
    const fakerModule = await import("@faker-js/faker");
    const faker = fakerModule.faker;
    const fakerKO = fakerModule.fakerKO;
    const fakerJA = fakerModule.fakerJA;

    const localeFaker = this.locale === "ko" ? fakerKO : this.locale === "ja" ? fakerJA : faker;

    /**
     * 1. Entity-specific 특수 케이스를 먼저 처리합니다.
     * field_patterns보다 우선하여, 특정 엔티티의 필드에 도메인에 맞는 값을 생성합니다.
     * 예: Department.name → 한국어 부서명 (사람 이름이 아님)
     */

    /**
     * Department name은 한국어 부서명 목록에서 선택합니다.
     * 고유성을 위해 70% 확률로 prefix/suffix를 추가합니다.
     */
    if (entity?.id === "Department" && prop.name === "name") {
      const departments = [
        "개발팀",
        "기획팀",
        "마케팅팀",
        "영업팀",
        "인사팀",
        "총무팀",
        "재무팀",
        "회계팀",
        "법무팀",
        "디자인팀",
        "IT팀",
        "고객지원팀",
        "품질관리팀",
        "연구개발팀",
        "생산팀",
        "구매팀",
        "물류팀",
      ];
      const prefixes = ["신규", "통합", "전략", "글로벌", "디지털", "핵심"];
      const suffixes = ["1팀", "2팀", "3팀", "A팀", "B팀", "본부", "센터", "그룹"];

      const dept = faker.helpers.arrayElement(departments);

      const random = Math.random();
      if (random > 0.7) {
        const prefix = faker.helpers.arrayElement(prefixes);
        return `${prefix} ${dept}`;
      }
      if (random > 0.4) {
        const suffix = faker.helpers.arrayElement(suffixes);
        return `${dept} ${suffix}`;
      }
      return dept;
    }

    /**
     * 2. 필드명에서 의미를 추론하여 현실적인 데이터를 생성합니다.
     * 예: salary → 30M~150M (한국 연봉 범위)
     *     budget → 10M~500M (프로젝트 예산 범위)
     */
    const localeMappings = this.mappings[this.locale] || this.mappings.en;
    const normalizedName = prop.name.toLowerCase().replace(/_/g, "");

    for (const [pattern, config] of Object.entries(localeMappings.field_patterns)) {
      if (normalizedName.includes(pattern.toLowerCase())) {
        try {
          return await this.executeFakerExpression(config.faker, prop);
        } catch (error) {
          !isTest() &&
            console.log(
              chalk.yellow(
                `Failed to execute field pattern "${pattern}" for ${prop.name}, falling back:`,
              ),
              error,
            );
          break;
        }
      }
    }

    /**
     * 3. JSON 타입이면서 배열인 경우 (SonamuFile[], string[] 등)
     * 필드명 패턴을 보고 적절한 배열 데이터를 생성합니다.
     */
    if (prop.type === "json" && "id" in prop && prop.id) {
      if (prop.id.endsWith("[]")) {
        return this.generateArrayValue(prop, entity, faker, localeFaker);
      }
    }

    /** 4. Enum 타입은 정의된 값 중 하나를 랜덤 선택합니다 */
    if (prop.type === "enum") {
      let enumValues: string[] = [];

      if ("enum" in prop && Array.isArray(prop.enum) && prop.enum.length > 0) {
        enumValues = prop.enum;
      } else if ("id" in prop && prop.id && entity?.enumLabels?.[prop.id]) {
        enumValues = Object.keys(entity.enumLabels[prop.id]);
      }

      if (enumValues.length > 0) {
        return faker.helpers.arrayElement(enumValues);
      }
      return prop.nullable ? null : "UNKNOWN";
    }

    if (prop.type === "enum[]") {
      let enumValues: string[] = [];

      if ("enum" in prop && Array.isArray(prop.enum) && prop.enum.length > 0) {
        enumValues = prop.enum;
      } else if ("id" in prop && prop.id && entity?.enumLabels?.[prop.id]) {
        enumValues = Object.keys(entity.enumLabels[prop.id]);
      }

      if (enumValues.length > 0) {
        return [faker.helpers.arrayElement(enumValues)];
      }
      return [];
    }

    /**
     * 5. Vector 타입은 현재 지원하지 않으므로 null을 반환합니다.
     * 향후 AI embedding 생성 기능 추가 시 구현 예정입니다.
     */
    if (prop.type === "vector" || prop.type === "vector[]" || prop.type === "tsvector") {
      return null;
    }

    /** 6. 타입별 기본 Faker 표현식을 실행합니다 */
    const typeDefault = localeMappings.type_defaults[prop.type];
    if (typeDefault) {
      try {
        return await this.executeFakerExpression(typeDefault.faker, prop);
      } catch (error) {
        !isTest() &&
          console.log(
            chalk.yellow(`Failed to execute type default for ${prop.type}, using fallback:`, error),
          );
      }
    }

    /** 7. 매핑되지 않은 타입은 기본 Faker 함수로 처리합니다 */
    switch (prop.type) {
      case "string":
      case "string[]":
        return faker.lorem.words(3);
      case "integer":
        return faker.number.int({ min: 1, max: 1000 });
      case "integer[]":
        return [faker.number.int({ min: 1, max: 1000 })];
      case "bigInteger":
        return faker.number.bigInt({ min: 1n, max: 1000n });
      case "bigInteger[]":
        return [faker.number.bigInt({ min: 1n, max: 1000n })];
      case "number":
      case "numeric":
        return faker.number.float({ min: 0, max: 1000 });
      case "number[]":
      case "numeric[]":
        return [faker.number.float({ min: 0, max: 1000 })];
      case "boolean":
        return faker.datatype.boolean();
      case "boolean[]":
        return [faker.datatype.boolean()];
      case "date":
      case "date[]":
        return faker.date.past();
      case "json":
        return {};
      case "uuid":
      case "uuid[]":
        return faker.string.uuid();
      default:
        return null;
    }
  }

  /**
   * 배열 타입의 값을 생성합니다.
   *
   * 타입 ID와 필드명 패턴을 분석하여 적절한 배열 데이터를 생성합니다.
   * 예: image_urls → [{url, name, mime_type}, ...]
   *     tag_ids → [1, 23, 45]
   */
  private generateArrayValue(
    prop: EntityProp,
    _entity: Entity | undefined,
    faker: typeof import("@faker-js/faker").faker,
    _localeFaker: typeof import("@faker-js/faker").faker,
  ): DataExplorerValue[] {
    const count = faker.number.int({ min: 1, max: 3 });

    /** SonamuFile[]은 Sonamu 내장 타입으로 구조가 정해져 있습니다 */
    if ("id" in prop && prop.id === "SonamuFile[]") {
      return Array.from({ length: count }, () => ({
        url: faker.image.url(),
        name: faker.system.fileName(),
        mime_type: faker.helpers.arrayElement([
          "image/jpeg",
          "image/png",
          "image/gif",
          "application/pdf",
        ]),
      }));
    }

    /** 필드명에서 배열의 용도를 추론합니다 */
    const normalizedName = prop.name.toLowerCase().replace(/_/g, "");

    if (normalizedName.includes("url") || normalizedName.includes("image")) {
      return Array.from({ length: count }, () => faker.internet.url());
    }

    if (normalizedName.includes("id") && normalizedName.endsWith("s")) {
      return Array.from({ length: count }, () => faker.number.int({ min: 1, max: 100 }));
    }

    if (normalizedName.includes("tag") || normalizedName.includes("name")) {
      return Array.from({ length: count }, () => faker.lorem.word());
    }

    /** 패턴 매칭되지 않으면 빈 배열을 반환합니다 */
    return [];
  }

  /**
   * JSON 매핑의 Faker 표현식을 파싱하여 실행합니다.
   *
   * 표현식 예시:
   * - "faker.internet.email()" → 인자 없음
   * - "faker.number.int({ min: 1, max: 100 })" → JSON 인자
   * - "{}" → 리터럴 값 (JSON.parse)
   *
   * fakerKO, fakerJA도 지원하여 다국어 데이터를 생성합니다.
   */
  private async executeFakerExpression(
    expression: string,
    prop: EntityProp,
  ): Promise<DataExplorerValue> {
    const fakerModule = await import("@faker-js/faker");
    const faker = fakerModule.faker;
    const fakerKO = fakerModule.fakerKO;
    const fakerJA = fakerModule.fakerJA;

    /** Faker 표현식이 아닌 리터럴 값은 JSON으로 파싱합니다 */
    if (!expression.startsWith("faker")) {
      try {
        return dataExplorerValueSchema.parse(JSON.parse(expression));
      } catch {
        return expression;
      }
    }

    /** 표현식에서 Faker 객체와 경로를 추출합니다 */
    const match = expression.match(/^(faker|fakerKO|fakerJA)\.(.*?)$/);
    if (!match) {
      throw new Error(`Invalid faker expression: ${expression}`);
    }

    const [, fakerName, expr] = match;
    const selectedFaker =
      fakerName === "fakerKO" ? fakerKO : fakerName === "fakerJA" ? fakerJA : faker;

    const funcMatch = expr.match(/^([\w.]+)(?:\((.*?)\))?$/);
    if (!funcMatch) {
      throw new Error(`Invalid faker expression for ${prop.name}: ${expression}`);
    }

    const [, path, argsStr] = funcMatch;
    const parts = path.split(".");

    /** 점 표기법(dot notation)으로 Faker 함수를 찾아갑니다 */
    let member = dynamicNamespaceSchema.parse(selectedFaker);
    for (const part of parts) {
      if (!(part in member)) {
        throw new Error(`Invalid faker path for ${prop.name}: ${fakerName}.${path}`);
      }
      const nextMember = member[part];
      if (part !== parts.at(-1)) {
        member = dynamicNamespaceSchema.parse(nextMember);
      }
    }

    const fn = fakerFunctionSchema.parse(member[parts.at(-1) ?? ""]);

    let args: DataExplorerValue[] = [];
    if (argsStr?.trim()) {
      args = this.parseGeneratorArgs(argsStr, prop.name);
    }

    return dataExplorerValueSchema.parse(fn(...args));
  }

  /**
   * fixtureHint를 LLM에게 전달하여 현실적인 테스트 데이터를 생성합니다.
   *
   * faker.js로는 생성하기 어려운 복잡한 텍스트(자기소개, 설명문 등)를
   * LLM을 활용하여 생성합니다. 동일한 hint에 대한 중복 호출을 방지하기 위해
   * 캐싱을 기본으로 지원합니다 (LLM API 비용 절감).
   *
   * ai 패키지는 dynamic import로 불러오므로, useLLM이 false인 경우
   * 의존성이 설치되지 않아도 fixture 생성이 정상 동작합니다.
   */
  private async generateWithLLM(
    fixtureHint: string,
    prop: EntityProp,
    entity: Entity,
    rowKey?: string,
  ): Promise<DataExplorerValue> {
    // rowKey가 있으면 row 단위 생성 전략 사용
    if (rowKey) {
      const rowCacheKey = `${rowKey}:${prop.name}`;

      // 이미 이 row에 대한 LLM 호출이 완료된 경우 캐시에서 바로 반환
      if (this.llmCache.has(rowCacheKey)) {
        return this.llmCache.get(rowCacheKey);
      }

      // 새 row: LLM 대상 prop 전체를 한 번에 생성
      const llmProps = entity.props.filter((p) => {
        if (isRelationProp(p)) return false;
        if (p.cone?.fixtureGenerator) return false;
        if (p.name === "id") return false;
        return !!p.cone?.note;
      });

      // llmProps가 비어있으면 단일 필드 방식으로 fallback
      if (llmProps.length === 0) {
        !isTest() &&
          console.log(
            `[FixtureGenerator] llmProps is empty for ${entity.id}.${prop.name}, using single field fallback`,
          );
        return this.generateSingleWithLLM(fixtureHint, prop, entity);
      }

      const apiKey = this.getApiKey();
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const generateText = await this.getTextGenerator();

      const rowResponse = await generateText({
        model: createAnthropic({ apiKey })(this.options.llmModel || "claude-sonnet-4-6"),
        prompt: this.buildRowLLMPrompt(llmProps, entity),
      });
      const rowResponseText = z.string().safeParse(rowResponse?.text);
      if (!rowResponseText.success) {
        throw new Error("Invalid LLM response");
      }

      // 응답을 파싱하여 각 필드에 대한 결과를 캐시에 저장
      const rowResult = this.parseRowLLMResponse(rowResponseText.data, llmProps);
      for (const [fieldName, value] of Object.entries(rowResult)) {
        this.llmCache.set(`${rowKey}:${fieldName}`, value);
      }

      // 요청한 필드의 값 반환 (없으면 단일 필드 fallback)
      if (this.llmCache.has(rowCacheKey)) {
        return this.llmCache.get(rowCacheKey);
      }

      // 만약 row 응답에 이 필드가 누락된 경우 단일 필드 fallback
      return this.generateSingleWithLLM(fixtureHint, prop, entity);
    }

    // rowKey가 없으면 기존 단일 필드 방식
    return this.generateSingleWithLLM(fixtureHint, prop, entity);
  }

  /**
   * 단일 필드를 LLM으로 생성합니다 (rowKey 없을 때 fallback용)
   */
  private async generateSingleWithLLM(
    fixtureHint: string,
    prop: EntityProp,
    entity: Entity,
  ): Promise<DataExplorerValue> {
    const cacheKey = `${entity.id}:${prop.name}:${fixtureHint}`;
    if (this.options.enableLLMCache && this.llmCache.has(cacheKey)) {
      return this.llmCache.get(cacheKey);
    }

    const apiKey = this.getApiKey();
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const generateText = await this.getTextGenerator();

    const singleResponse = await generateText({
      model: createAnthropic({ apiKey })(this.options.llmModel || "claude-sonnet-4-6"),
      prompt: this.buildLLMPrompt(fixtureHint, prop, entity),
    });
    const singleResponseText = z.string().safeParse(singleResponse?.text);
    if (!singleResponseText.success) {
      throw new Error("Invalid LLM response");
    }

    const value = this.parseLLMResponse(singleResponseText.data, prop.type);
    if (this.options.enableLLMCache) {
      this.llmCache.set(cacheKey, value);
    }

    return value;
  }

  private async getTextGenerator(): Promise<FixtureTextGenerator> {
    if (this.options.generateText) {
      return this.options.generateText;
    }
    const ai = await import("ai");
    return async (request) => ai.generateText(request);
  }

  /**
   * row 전체를 한 번에 생성하는 LLM 프롬프트를 만듭니다.
   */
  private buildRowLLMPrompt(props: EntityProp[], entity: Entity): string {
    const locale = this.options.locale || "ko";
    const language = locale === "ko" ? "Korean" : locale === "ja" ? "Japanese" : "English";

    const fieldDescriptions = props
      .map((p) => {
        let desc = `- ${p.name} (${p.type}): ${p.cone?.note ?? ""}`;
        if (
          (p.type === "enum" || p.type === "enum[]") &&
          "id" in p &&
          p.id &&
          entity.enumLabels?.[p.id]
        ) {
          const values = Object.keys(entity.enumLabels[p.id]).join(", ");
          desc += ` [allowed values: ${values}]`;
        }
        return desc;
      })
      .join("\n");

    // LLM 대상이 아닌 prop들도 맥락으로 제공 (relation 제외)
    const otherProps = entity.props
      .filter(
        (p) =>
          !props.includes(p) &&
          !isRelationProp(p) &&
          p.name !== "id" &&
          !("virtual" in p && p.virtual),
      )
      .map((p) => {
        let desc = `- ${p.name} (${p.type})`;
        if (p.cone?.note) desc += `: ${p.cone.note}`;
        if (
          (p.type === "enum" || p.type === "enum[]") &&
          "id" in p &&
          p.id &&
          entity.enumLabels?.[p.id]
        ) {
          const values = Object.keys(entity.enumLabels[p.id]).join(", ");
          desc += ` [allowed values: ${values}]`;
        }
        return desc;
      })
      .join("\n");
    const otherPropsContext = otherProps
      ? `\n\nOther fields in this entity (for context, do NOT generate these):\n${otherProps}`
      : "";

    const resultTemplate = props.map((p) => `  "${p.name}": <${p.type}>`).join(",\n");

    const entityContext = entity.cone?.note ? `\nEntity description: ${entity.cone.note}` : "";

    return `Generate test fixture data for the ${entity.id} entity. All fields must be coherent and consistent with each other.

Entity: ${entity.id}${entityContext}
Locale: ${locale} (use ${language} for text fields)

Fields to generate:
${fieldDescriptions}${otherPropsContext}

Rules:
- All fields in a single row must be logically consistent (e.g. name/name_en/name_cn should represent the same person)
- Return ONLY valid JSON, no markdown or explanation
- Dates in ISO 8601 format
- Use ${language} for text unless field description says otherwise

Return exactly this JSON shape:
{
${resultTemplate}
}`;
  }

  /**
   * row LLM 응답을 파싱하여 필드별 값으로 변환합니다.
   */
  private parseRowLLMResponse(text: string, props: EntityProp[]): DataExplorerRecord {
    const jsonText = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    let parsed: DataExplorerRecord;
    try {
      const parsedRecord = dataExplorerRecordSchema.safeParse(JSON.parse(jsonText));
      if (!parsedRecord.success) {
        !isTest() &&
          console.warn("[FixtureGenerator] Row LLM response is not a plain object:", text);
        return {};
      }
      parsed = parsedRecord.data;
    } catch {
      !isTest() && console.warn("[FixtureGenerator] Failed to parse row LLM response:", text);
      return {};
    }

    const result: DataExplorerRecord = {};
    for (const prop of props) {
      if (prop.name in parsed) {
        result[prop.name] = this.parseLLMResponse(String(parsed[prop.name] ?? ""), prop.type);
      }
    }
    return result;
  }

  private buildLLMPrompt(hint: string, prop: EntityProp, entity: Entity): string {
    const locale = this.options.locale || "ko";
    const language = locale === "ko" ? "Korean" : locale === "ja" ? "Japanese" : "English";

    const entityContext = entity.cone?.note ? `\nEntity context: ${entity.cone.note}` : "";

    const otherFields = entity.props
      .filter((p) => p.name !== prop.name && !isRelationProp(p) && p.cone?.note)
      .map((p) => `- ${p.name} (${p.type}): ${p.cone?.note}`)
      .join("\n");
    const otherFieldsContext = otherFields
      ? `\n\nOther fields in this entity (for context):\n${otherFields}`
      : "";

    let prompt = `Generate test data for ${entity.id}.${prop.name} (type: ${prop.type})${entityContext}${otherFieldsContext}

Requirement: ${hint}

Rules:
- Return ONLY the value, no explanation or markdown
- Use ${language} language if applicable
- Format: ${this.getExpectedFormat(prop.type)}`;

    // enum 타입인 경우 가능한 값 목록 추가
    if (prop.type === "enum" || prop.type === "enum[]") {
      let enumValues: string[] = [];

      if ("enum" in prop && Array.isArray(prop.enum) && prop.enum.length > 0) {
        enumValues = prop.enum;
      } else if ("id" in prop && prop.id && entity?.enumLabels?.[prop.id]) {
        enumValues = Object.keys(entity.enumLabels[prop.id]);
      }

      if (enumValues.length > 0) {
        prompt += `\n- IMPORTANT: Choose ONLY from these allowed values: ${enumValues.join(", ")}`;
      }
    }

    prompt += `\n\nExample: ${this.getExampleForType(prop.type, locale)}`;

    return prompt;
  }

  private parseLLMResponse(text: string, propType: string): DataExplorerValue {
    const cleaned = text.trim();

    // 배열 타입 처리
    if (propType.endsWith("[]")) {
      try {
        const parsed = dataExplorerValueSchema.parse(JSON.parse(cleaned));
        const baseType = propType.slice(0, -2); // "integer[]" -> "integer"

        if (Array.isArray(parsed)) {
          return parsed.map((item) => {
            // null/undefined는 타입별 기본값으로
            if (item === null || item === undefined) {
              return this.getDefaultValueForType(baseType);
            }
            // 객체는 JSON.stringify 후 파싱 (json 타입인 경우)
            if (dataExplorerRecordSchema.safeParse(item).success || Array.isArray(item)) {
              return baseType === "json"
                ? item
                : this.parseScalarValue(JSON.stringify(item), baseType);
            }
            // primitive 값은 문자열로 변환 후 파싱
            return this.parseScalarValue(String(item), baseType);
          });
        }

        // 단일 값이 온 경우 배열로 감싸기
        if (parsed === null || parsed === undefined) {
          return [this.getDefaultValueForType(baseType)];
        }
        return [this.parseScalarValue(String(parsed), baseType)];
      } catch {
        return [];
      }
    }

    return this.parseScalarValue(cleaned, propType);
  }

  private getDefaultValueForType(propType: string): DataExplorerValue {
    switch (propType) {
      case "integer":
        return 0;
      case "bigInteger":
        return 0n;
      case "float":
      case "number":
      case "numeric":
        return 0;
      case "boolean":
        return false;
      case "date":
        return new Date();
      case "json":
        return {};
      case "uuid":
        return "00000000-0000-0000-0000-000000000000";
      default:
        return "";
    }
  }

  private parseScalarValue(text: string, propType: string): DataExplorerValue {
    const cleaned = text.trim();

    switch (propType) {
      case "integer": {
        const num = parseInt(cleaned, 10);
        return Number.isNaN(num) ? 0 : num;
      }
      case "bigInteger": {
        try {
          return BigInt(cleaned);
        } catch {
          return 0n;
        }
      }
      case "float":
      case "number":
      case "numeric": {
        const num = parseFloat(cleaned);
        return Number.isNaN(num) ? 0 : num;
      }
      case "boolean":
        return cleaned.toLowerCase() === "true";
      case "date": {
        const date = new Date(cleaned);
        return Number.isNaN(date.getTime()) ? new Date() : date;
      }
      case "json":
        try {
          return dataExplorerValueSchema.parse(JSON.parse(cleaned));
        } catch {
          return cleaned;
        }
      case "uuid":
      case "enum":
        return cleaned;
      default:
        return cleaned;
    }
  }

  /**
   * faker 함수 인자 문자열을 파싱하여 인자 배열로 반환합니다.
   *
   * 3단계 전략:
   * 1. JSON 직접 파싱 (표준 JSON 표현식)
   * 2. JS 객체 리터럴 → JSON 변환 후 재시도 (single quote, unquoted key 처리)
   * 3. 단순 단일 인자 폴백 (숫자, 문자열)
   */
  private parseGeneratorArgs(argsStr: string, propName: string): DataExplorerValue[] {
    // 1. JSON 직접 파싱
    let parsedArguments: DataExplorerValue[] | null;
    try {
      parsedArguments = generatorArgumentsSchema.parse(JSON.parse(`[${argsStr}]`));
    } catch {
      parsedArguments = null;
    }
    if (parsedArguments) {
      return parsedArguments;
    }

    // 2. JS 객체 리터럴 → JSON 변환 후 재시도
    try {
      const jsonStr = this.convertJsLiteralToJson(argsStr);
      parsedArguments = generatorArgumentsSchema.parse(JSON.parse(`[${jsonStr}]`));
    } catch {
      parsedArguments = null;
    }
    if (parsedArguments) {
      return parsedArguments;
    }

    // 3. 단순 단일 인자 폴백
    const trimmed = argsStr.trim();
    if (!Number.isNaN(Number(trimmed))) {
      return [Number(trimmed)];
    }
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return [trimmed.slice(1, -1)];
    }

    throw new Error(`FixtureGenerator: Cannot parse arguments for ${propName}: ${argsStr}`);
  }

  /**
   * JS 객체 리터럴을 JSON으로 변환합니다.
   *
   * 두 가지 변환:
   * 1. Single-quoted 문자열 → double-quoted (이스케이프 처리 포함)
   * 2. Unquoted 객체 키 → double-quoted
   */
  private convertJsLiteralToJson(input: string): string {
    // 1. 'value' → "value" (내부 " 이스케이프, \' → ')
    const withDoubleQuotes = input.replace(
      /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
      (_, content: string) => `"${content.replace(/"/g, '\\"').replace(/\\'/g, "'")}"`,
    );

    // 2. { key: → { "key":
    return withDoubleQuotes.replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
  }

  /**
   * Sonamu.secret을 우선으로 하고, 없으면 환경변수에서 API 키를 읽습니다.
   *
   * Sonamu.secret은 프로젝트별 설정(sonamu.config.ts)이므로 더 높은 우선순위를 가지며,
   * 환경변수는 개발 환경이나 CI/CD에서 fallback으로 사용됩니다.
   */
  private getApiKey(): string {
    let apiKey: string | undefined;

    try {
      const { Sonamu } = require("../api");
      apiKey = Sonamu.secrets?.anthropic_api_key;
    } catch {
      // Sonamu가 초기화되지 않은 경우 (테스트 환경 등)
    }

    if (!apiKey) {
      apiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY not found. Set it in environment variables or Sonamu.secret.anthropic_api_key",
      );
    }

    return apiKey;
  }

  private hasSequenceDefault(prop: EntityProp): boolean {
    if (!("dbDefault" in prop)) {
      return false;
    }
    const dbDefault = z.string().safeParse(prop.dbDefault);
    return dbDefault.success && dbDefault.data.includes("nextval");
  }

  private getExpectedFormat(propType: string): string {
    // 배열 타입 처리
    if (propType.endsWith("[]")) {
      const baseType = propType.slice(0, -2);
      const baseFormat = this.getScalarFormat(baseType);
      return `JSON array of ${baseFormat} (e.g., [${this.getExampleForType(baseType, "en")}, ...])`;
    }

    return this.getScalarFormat(propType);
  }

  private getScalarFormat(propType: string): string {
    switch (propType) {
      case "integer":
      case "bigInteger":
        return "integer numbers";
      case "float":
      case "number":
      case "numeric":
        return "decimal numbers";
      case "boolean":
        return "booleans (true or false)";
      case "date":
        return "ISO 8601 date strings";
      case "json":
        return "valid JSON object or array";
      case "uuid":
        return "UUID strings";
      case "enum":
        return "one of the allowed enum values";
      default:
        return "plain text strings";
    }
  }

  private getExampleForType(propType: string, locale: Locale): string {
    // 배열 타입 처리
    if (propType.endsWith("[]")) {
      const baseType = propType.slice(0, -2);
      const baseExample = this.getScalarExample(baseType, locale);
      return `[${baseExample}]`;
    }

    return this.getScalarExample(propType, locale);
  }

  private getScalarExample(propType: string, locale: Locale): string {
    const isKorean = locale === "ko";

    switch (propType) {
      case "integer":
      case "bigInteger":
        return "42";
      case "float":
      case "number":
      case "numeric":
        return "3.14";
      case "boolean":
        return "true";
      case "date":
        return "2024-01-01";
      case "json":
        return '{"key": "value"}';
      case "uuid":
        return "550e8400-e29b-41d4-a716-446655440000";
      case "enum":
        return "ENUM_VALUE";
      default:
        return isKorean ? "안녕하세요" : "Hello";
    }
  }

  /**
   * 이름을 이메일 로컬 파트용 로마나이즈드 문자열로 변환합니다.
   *
   * 한글 이름은 초성-중성-종성 분해 후 로마나이즈 처리합니다.
   * 영문 이름은 소문자로 변환하고 공백을 점(.)\uc73c로 치환합니다.
   * 예: "김철수" → "cheolsu.kim", "John Doe" → "john.doe"
   */
  private async romanizeName(name: string): Promise<string> {
    // 한글 포함 여부 확인
    if (/[\uAC00-\uD7AF]/.test(name)) {
      return this.romanizeKoreanName(name);
    }
    // 영문: 소문자 + 점 구분
    return name
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9.]/g, "");
  }

  /**
   * 한글 이름을 로마나이즈 처리합니다.
   *
   * 초성/중성/종성 매핑 테이블을 사용하여 한글을 로마자로 변환합니다.
   * 첫 글자를 성으로 간주하여 "김철수" → "cheolsu.kim" 형태로 출력합니다.
   */
  private romanizeKoreanName(name: string): string {
    const CHOSEONG = [
      "g",
      "kk",
      "n",
      "d",
      "tt",
      "r",
      "m",
      "b",
      "pp",
      "s",
      "ss",
      "",
      "j",
      "jj",
      "ch",
      "k",
      "t",
      "p",
      "h",
    ];
    const JUNGSEONG = [
      "a",
      "ae",
      "ya",
      "yae",
      "eo",
      "e",
      "yeo",
      "ye",
      "o",
      "wa",
      "wae",
      "oe",
      "yo",
      "u",
      "wo",
      "we",
      "wi",
      "yu",
      "eu",
      "ui",
      "i",
    ];
    const JONGSEONG = [
      "",
      "k",
      "k",
      "k",
      "n",
      "n",
      "n",
      "t",
      "l",
      "l",
      "l",
      "l",
      "l",
      "l",
      "l",
      "l",
      "m",
      "p",
      "p",
      "t",
      "t",
      "ng",
      "t",
      "t",
      "k",
      "t",
      "p",
      "t",
    ];

    const romanize = (char: string): string => {
      const code = char.charCodeAt(0);
      if (code < 0xac00 || code > 0xd7af) return char;
      const offset = code - 0xac00;
      const cho = Math.floor(offset / 588);
      const jung = Math.floor((offset % 588) / 28);
      const jong = offset % 28;
      return CHOSEONG[cho] + JUNGSEONG[jung] + JONGSEONG[jong];
    };

    const chars = [...name];
    // 첫 글자를 성(姓)으로 간주
    const familyName = romanize(chars[0]);
    const givenName = chars.slice(1).map(romanize).join("");

    if (givenName) {
      return `${givenName}.${familyName}`;
    }
    return familyName;
  }

  /**
   * LLM 캐시 통계를 반환합니다.
   */
  getLLMCacheStats() {
    return {
      size: this.llmCache.size,
      enabled: this.options.enableLLMCache,
    };
  }

  /**
   * LLM 캐시를 초기화합니다.
   */
  clearLLMCache() {
    this.llmCache.clear();
  }

  /**
   * 컨텍스트 생성
   */
  private createContext(): GeneratorContext {
    return {
      fixtures: new Map(),
      referenceCache: new Map(),
      importedRecords: new Set(),
    };
  }

  /**
   * 배치 생성 및 자동 저장
   *
   * 1. 각 spec별로 fixture 생성 (메모리)
   * 2. FixtureRecord로 변환
   * 3. FixtureManager.insertFixtures()로 targetDb에 저장
   *
   * @returns 저장된 fixture 데이터 (실제 DB ID 포함)
   */
  async generateBatch(specs: FixtureGenerationSpec[]): Promise<FixtureImportResult[]> {
    const context = this.createContext();
    const generatedFixtures: GeneratedFixture[] = [];

    // 1. 각 spec별로 fixture 생성
    for (const spec of specs) {
      const specEntity = this.entityManager.get(spec.entity);

      if (specEntity.parentId) {
        // parentId 엔티티: DB에서 서브타입 행이 없는 부모 id를 조회하여 사용
        // (새 부모 생성 대신 기존 데이터 재활용)
        const idProp = specEntity.props.find((p) => p.name === "id");
        const parentOverrides = idProp?.cone?.fixtureParentOverrides ?? {};
        const parentEntity = this.entityManager.get(specEntity.parentId);

        // 부모 테이블에서 서브타입 테이블에 없는 id를 조회
        let query = this.sourceDb(parentEntity.table).select(`${parentEntity.table}.id`);
        for (const [col, val] of Object.entries(parentOverrides)) {
          query = query.where(`${parentEntity.table}.${col}`, fixtureWhereValueSchema.parse(val));
        }
        query = query
          .leftJoin(specEntity.table, `${specEntity.table}.id`, `${parentEntity.table}.id`)
          .whereNull(`${specEntity.table}.id`)
          .limit(spec.count);

        const rows = await query;
        const availableIds: number[] = rows.map((r: { id: number }) => r.id);

        if (availableIds.length === 0) {
          !isTest() &&
            console.warn(
              chalk.yellow(
                `[parentId] ${spec.entity}: 서브타입이 없는 부모 레코드가 부족합니다. 건너뜁니다.`,
              ),
            );
        } else {
          for (const parentId of availableIds) {
            const fixture = await this.generate(spec.entity, spec.overrides || {}, context);
            fixture.id = parentId;
            generatedFixtures.push({ entity: spec.entity, data: fixture, explicitId: true });
          }
        }
      } else {
        for (let i = 0; i < spec.count; i++) {
          const fixture = await this.generate(spec.entity, spec.overrides || {}, context);
          generatedFixtures.push({
            entity: spec.entity,
            data: fixture,
          });
        }
      }
    }

    // 2. FixtureRecord로 변환
    const fixtureRecords: FixtureRecord[] = [];
    for (const { entity: entityName, data, explicitId } of generatedFixtures) {
      const entity = this.entityManager.get(entityName);

      // integer/bigInteger PK는 임시 ID 생성 (DB 시퀀스가 실제 ID 할당)
      // string PK with dbDefault nextval도 동일하게 처리
      // 그 외 string/uuid PK는 generate()에서 이미 생성된 id 값을 그대로 사용
      // parentId 엔티티는 부모의 실제 id를 그대로 사용 (시퀀스 미사용)
      const idProp = entity.props.find((p) => p.name === "id");
      const usesSequence =
        !explicitId &&
        (idProp?.type === "integer" ||
          idProp?.type === "bigInteger" ||
          (idProp?.type === "string" && this.hasSequenceDefault(idProp)));

      const dataForRecord = usesSequence
        ? { ...data, id: Math.floor(Math.random() * 1000000) }
        : data;

      const records = await FixtureManager.createFixtureRecord(
        entity,
        parseFixtureSourceRecord(dataForRecord),
        { singleRecord: true },
      );
      fixtureRecords.push(...records);
    }

    // 3. targetDb에 삽입 (FixtureManager가 의존성 정렬 처리)
    const results = await FixtureManager.insertFixtures(this.targetDbName, fixtureRecords);

    // 4. companion fixtures 생성 (fixtureCompanions가 선언된 경우)
    const companionResults = await this.generateCompanions(specs, results);

    const total = results.length + companionResults.length;
    !isTest() &&
      console.log(chalk.green(`Generated and saved ${total} fixtures to ${this.targetDbName}`));
    return [...results, ...companionResults];
  }

  /**
   * 부모 fixture 결과를 기반으로 fixtureCompanions에 선언된 companion Entity를 생성합니다.
   *
   * generateBatch()에서만 호출되며, companion 생성 시 재귀를 방지하기 위해
   * generateBatch()를 다시 호출하지 않고 직접 삽입합니다.
   */
  private async generateCompanions(
    specs: FixtureGenerationSpec[],
    parentResults: FixtureImportResult[],
  ): Promise<FixtureImportResult[]> {
    const allResults: FixtureImportResult[] = [];
    const processedEntities = new Set<string>();

    for (const spec of specs) {
      if (processedEntities.has(spec.entity)) continue;
      processedEntities.add(spec.entity);

      const entity = this.entityManager.get(spec.entity);
      const idProp = entity.props.find((p) => p.name === "id");
      const companions = idProp?.cone?.fixtureCompanions;
      if (!companions || companions.length === 0) continue;

      const entityResults = parentResults.filter((r) => r.entityId === spec.entity);
      if (entityResults.length === 0) continue;

      for (const companion of companions) {
        // companion entity에서 부모 entity로의 BelongsToOne FK 컬럼명 파악
        const companionEntity = this.entityManager.get(companion.entity);
        const fkProp = companionEntity.props.find(
          (p) => isRelationProp(p) && isBelongsToOneRelationProp(p) && p.with === spec.entity,
        );
        if (!fkProp) {
          !isTest() &&
            console.warn(
              chalk.yellow(
                `[Companion] No BelongsToOne relation from ${companion.entity} to ${spec.entity}. Skipping.`,
              ),
            );
          continue;
        }
        const fkColName = `${fkProp.name}_id`;

        // companion의 idProp, usesSequence, count는 companion 단위로 고정
        const companionIdProp = companionEntity.props.find((p) => p.name === "id");
        const usesSequence =
          companionIdProp?.type === "integer" ||
          companionIdProp?.type === "bigInteger" ||
          (companionIdProp?.type === "string" && this.hasSequenceDefault(companionIdProp));
        const companionCount = companion.count ?? 1;

        // 각 parent result에 대해 companion fixture 생성
        const context = this.createContext();
        const companionFixtureRecords: FixtureRecord[] = [];

        for (const parentResult of entityResults) {
          const resolvedOverrides = this.resolveTemplateOverrides(
            dataExplorerRecordSchema.parse(companion.overrides ?? {}),
            parentResult.data,
          );
          resolvedOverrides[fkColName] = parentResult.data.id;

          for (let i = 0; i < companionCount; i++) {
            const fixture = await this.generate(companion.entity, resolvedOverrides, context);

            const dataForRecord = usesSequence
              ? { ...fixture, id: Math.floor(Math.random() * 1000000) }
              : fixture;

            const records = await FixtureManager.createFixtureRecord(
              companionEntity,
              parseFixtureSourceRecord(dataForRecord),
              { singleRecord: true },
            );
            companionFixtureRecords.push(...records);
          }
        }

        const companionResults = await FixtureManager.insertFixtures(
          this.targetDbName,
          companionFixtureRecords,
        );
        allResults.push(...companionResults);

        !isTest() &&
          console.log(
            chalk.green(
              `[Companion] Generated ${companionResults.length} ${companion.entity} fixtures`,
            ),
          );
      }
    }

    return allResults;
  }

  /**
   * overrides 값의 "{{fieldName}}" 템플릿을 부모 fixture 데이터로 치환합니다.
   *
   * 예: { "account_id": "{{email}}" } → { "account_id": "user@example.com" }
   */
  private resolveTemplateOverrides(
    overrides: DataExplorerRecord,
    parentData: { [key: string]: string | number | boolean | Date | null },
  ): DataExplorerRecord {
    const resolved: DataExplorerRecord = {};
    for (const [key, value] of Object.entries(overrides)) {
      const template = z.string().safeParse(value);
      if (template.success && template.data.startsWith("{{") && template.data.endsWith("}}")) {
        const fieldName = template.data.slice(2, -2).trim();
        if (!(fieldName in parentData)) {
          throw new Error(
            `템플릿 필드 "${fieldName}"이(가) 부모 fixture 데이터에 존재하지 않습니다 (override key: "${key}")`,
          );
        }
        resolved[key] = parentData[fieldName];
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /**
   * 실제 DB(sourceDb)에서 데이터를 조회하여 fixture DB(targetDb)에 import합니다.
   *
   * 1. DataExplorer로 sourceDb에서 데이터 조회 (관련 데이터 포함)
   * 2. FixtureRecord로 변환
   * 3. targetDb에 삽입
   *
   * @param entityName - 조회할 entity 이름
   * @param options - 조회 옵션 (strategy, limit, includeRelations 등)
   * @returns 저장된 fixture 데이터 (실제 DB ID 포함)
   *
   * @example
   * // 프로덕션 DB에서 User 10명 + 관련 Employee, Department 가져오기
   * await generator.importFromSource("User", {
   *   strategy: "sample",
   *   limit: 10,
   *   includeRelations: true,
   *   maxDepth: 2
   * });
   */
  async importFromSource(
    entityName: string,
    options: ExploreWithRelationsOptions,
  ): Promise<FixtureImportResult[]> {
    !isTest() &&
      console.log(
        chalk.blue(
          `Importing ${entityName} from source DB with options: ${JSON.stringify({ strategy: options.strategy, limit: options.limit, includeRelations: options.includeRelations, maxDepth: options.maxDepth })}`,
        ),
      );

    // 1. DataExplorer로 sourceDb에서 데이터 조회 (관련 데이터 포함)
    const exploreResult = await this.dataExplorer.exploreWithRelations(entityName, options);

    !isTest() &&
      console.log(
        chalk.cyan(
          `Found ${exploreResult.main.records.length} ${entityName} records and ${exploreResult.related.size} related entities`,
        ),
      );

    // 2. FixtureRecord로 변환
    const fixtureRecords: FixtureRecord[] = [];

    // 메인 entity의 records를 FixtureRecord로 변환
    const mainEntity = this.entityManager.get(entityName);
    for (const record of exploreResult.main.records) {
      const records = await FixtureManager.createFixtureRecord(
        mainEntity,
        parseFixtureSourceRecord(record),
        { db: this.sourceDb, singleRecord: true },
      );
      fixtureRecords.push(...records);
    }

    // 관련 entity의 records를 FixtureRecord로 변환
    for (const [relatedEntityName, relatedRecords] of exploreResult.related.entries()) {
      const relatedEntity = this.entityManager.get(relatedEntityName);
      for (const record of relatedRecords) {
        const records = await FixtureManager.createFixtureRecord(
          relatedEntity,
          parseFixtureSourceRecord(record),
          { db: this.sourceDb, singleRecord: true },
        );
        fixtureRecords.push(...records);
      }

      !isTest() &&
        console.log(chalk.gray(`  - ${relatedEntityName}: ${relatedRecords.length} records`));
    }

    // 3. targetDb에 삽입 (FixtureManager가 의존성 정렬 처리)
    const results = await FixtureManager.insertFixtures(this.targetDbName, fixtureRecords);

    !isTest() &&
      console.log(
        chalk.green(
          `Successfully imported ${results.length} records to ${this.targetDbName} (${exploreResult.main.records.length} ${entityName} + ${results.length - exploreResult.main.records.length} related)`,
        ),
      );

    return results;
  }
}

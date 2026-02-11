import chalk from "chalk";
import type { Knex } from "knex";
import type { Entity } from "../entity/entity";
import type { EntityManager } from "../entity/entity-manager";
import type { EntityProp, FixtureImportResult, FixtureRecord } from "../types/types";
import { isBelongsToOneRelationProp, isOneToOneRelationProp, isRelationProp } from "../types/types";
import { DataExplorer, type ExploreWithRelationsOptions } from "./data-explorer";
import { FixtureManager } from "./fixture-manager";

export type GeneratorContext = {
  // 생성 중인 fixture들 (메모리 상)
  fixtures: Map<string, Record<string, unknown>>;

  // 참조 데이터 캐시 (DataExplorer 결과)
  referenceCache: Map<string, Record<string, unknown>[]>;

  // 이미 import된 레코드 추적 (중복 import 방지)
  importedRecords: Set<string>; // "User#123"
};

export class FixtureGenerator {
  private dataExplorer: DataExplorer;

  constructor(
    private sourceDb: Knex, // 참조 데이터 조회용
    // targetDb는 FixtureManager.insertFixtures가 dbName(문자열)을 받기 때문에 직접 사용하지 않음
    _targetDb: Knex, // 저장용 (Fixture DB) - 미래 확장을 위해 API에 포함
    private targetDbName: "fixture" | "test" | "production_master", // targetDb의 이름
    private entityManager: typeof EntityManager,
  ) {
    // DataExplorer는 sourceDb 사용
    this.dataExplorer = new DataExplorer(sourceDb, entityManager);
  }

  /**
   * Fixture 생성 (단일)
   * @returns 생성된 fixture 데이터 (메모리 상)
   */
  async generate(
    entityName: string,
    overrides: Record<string, unknown> = {},
    context: GeneratorContext = this.createContext(),
  ): Promise<Record<string, unknown>> {
    const entity = this.entityManager.get(entityName);
    const tempId = `${entityName}#temp#${Date.now()}`; // 임시 ID

    // 각 prop별 값 생성
    const fixture: Record<string, unknown> = {};

    for (const prop of entity.props) {
      // Virtual prop은 스킵
      if ("virtual" in prop && prop.virtual) {
        continue;
      }

      // override가 있으면 사용
      if (prop.name in overrides) {
        fixture[prop.name] = overrides[prop.name];
        continue;
      }

      // postIt에서 생성 전략 확인
      const postIt = prop.postIt;

      // 1. Relation prop 처리
      if (isRelationProp(prop)) {
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

      // 2. fixtureGenerator 사용
      if (postIt?.fixtureGenerator) {
        fixture[prop.name] = await this.executeGenerator(
          postIt.fixtureGenerator as string,
          prop,
          entity,
        );
        continue;
      }

      // 3. fixtureDefault 사용
      if (postIt?.fixtureDefault !== undefined) {
        fixture[prop.name] = postIt.fixtureDefault;
        continue;
      }

      // 4. 타입별 기본 생성
      fixture[prop.name] = await this.generateDefaultValue(prop, entity);
    }

    // 5. password 필드 암호화
    if ("password" in fixture && fixture.password && typeof fixture.password === "string") {
      const bcrypt = await import("bcrypt");
      fixture.password = await bcrypt.hash(fixture.password, 10);
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
  ): Promise<number | null> {
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

    const postIt = prop.postIt;
    const dataSource = postIt?.dataSource;

    // DataExplorer로 참조 데이터 조회 (sourceDb)
    if (dataSource) {
      const cacheKey = `${prop.with}:${JSON.stringify(dataSource)}`;

      if (!context.referenceCache.has(cacheKey)) {
        const data = await this.dataExplorer.explore(prop.with, {
          strategy: dataSource.strategy,
          limit:
            ((dataSource.config as Record<string, unknown> | undefined)?.limit as
              | number
              | undefined) || 10,
          ...(dataSource.config as Record<string, unknown> | undefined),
        });
        context.referenceCache.set(cacheKey, data);

        // 조회한 데이터를 targetDb에 자동 import
        await this.importReferencedData(prop.with, data, context);
      }

      const candidates = context.referenceCache.get(cacheKey);
      if (candidates && candidates.length > 0) {
        // 랜덤하게 하나 선택
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        return selected.id as number;
      }
    }

    // dataSource가 없을 때 자동으로 fixture DB에서 조회 시도
    const autoKey = `${prop.with}:auto`;
    if (!context.referenceCache.has(autoKey)) {
      // fixture DB(sourceDb)에서 자동 조회
      const autoData = await this.dataExplorer.explore(prop.with, {
        strategy: "random",
        limit: 10,
      });
      context.referenceCache.set(autoKey, autoData);

      // 조회한 데이터를 targetDb에 자동 import
      if (autoData.length > 0) {
        await this.importReferencedData(prop.with, autoData, context);
      }
    }

    const autoCandidates = context.referenceCache.get(autoKey);
    if (autoCandidates && autoCandidates.length > 0) {
      // 랜덤하게 하나 선택
      const selected = autoCandidates[Math.floor(Math.random() * autoCandidates.length)];
      return selected.id as number;
    }

    // 참조 데이터가 없으면 null 반환 (nullable인 경우)
    if (prop.nullable) {
      return null;
    }

    // nullable이 아니고 데이터도 없으면 에러
    throw new Error(
      `FixtureGenerator: ${entity.id}.${prop.name}에 필요한 ${prop.with} 데이터가 없습니다. ` +
        `먼저 ${prop.with}를 생성하거나 postIt.dataSource를 설정하세요.`,
    );
  }

  /**
   * 참조된 데이터를 targetDb에 import
   */
  private async importReferencedData(
    entityName: string,
    records: Record<string, unknown>[],
    context: GeneratorContext,
  ): Promise<void> {
    const entity = this.entityManager.get(entityName);
    const recordsToImport: Record<string, unknown>[] = [];

    for (const record of records) {
      const recordKey = `${entityName}#${record.id}`;

      // 이미 import된 레코드는 스킵
      if (context.importedRecords.has(recordKey)) {
        continue;
      }

      recordsToImport.push(record);
      context.importedRecords.add(recordKey);
    }

    if (recordsToImport.length === 0) {
      return;
    }

    // FixtureRecord로 변환
    const fixtureRecords: FixtureRecord[] = [];
    for (const record of recordsToImport) {
      const records = await FixtureManager.createFixtureRecord(
        entity,
        record as { id: number; [key: string]: string | number | boolean | null },
        { _db: this.sourceDb, singleRecord: true },
      );
      fixtureRecords.push(...records);
    }

    // targetDb에 삽입
    await FixtureManager.insertFixtures(this.targetDbName, fixtureRecords);

    console.log(
      chalk.green(
        `Auto-imported ${recordsToImport.length} ${entityName} records to ${this.targetDbName}`,
      ),
    );
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
  ): Promise<unknown> {
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
        let fn: unknown = faker;
        for (const part of parts) {
          if (typeof fn === "object" && fn !== null && part in fn) {
            fn = (fn as Record<string, unknown>)[part];
          } else {
            throw new Error(`FixtureGenerator: Invalid faker path for ${prop.name}: faker.${path}`);
          }
        }

        // 함수가 아니면 에러
        if (typeof fn !== "function") {
          throw new Error(`FixtureGenerator: faker.${path} is not a function (for ${prop.name})`);
        }

        // 인자 파싱 (JSON 형식만 지원)
        let args: unknown[] = [];
        if (argsStr?.trim()) {
          try {
            // JSON 배열로 파싱 시도
            const parsed = JSON.parse(`[${argsStr}]`) as unknown;
            args = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            // 숫자나 문자열 단일 인자 처리
            const trimmed = argsStr.trim();
            if (!Number.isNaN(Number(trimmed))) {
              args = [Number(trimmed)];
            } else if (
              (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
              (trimmed.startsWith("'") && trimmed.endsWith("'"))
            ) {
              args = [trimmed.slice(1, -1)];
            } else {
              throw new Error(
                `FixtureGenerator: Cannot parse arguments for ${prop.name}: ${argsStr}`,
              );
            }
          }
        }

        return fn(...args);
      } catch (error) {
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
    console.log(
      chalk.yellow(
        `Unsupported generator expression for ${prop.name}: ${generator}. Only faker.* expressions are supported. Using default value.`,
      ),
    );
    return this.generateDefaultValue(prop, entity);
  }

  /**
   * 타입별 기본값 생성 (Faker.js 사용)
   */
  private async generateDefaultValue(prop: EntityProp, entity?: Entity): Promise<unknown> {
    const fakerModule = await import("@faker-js/faker");
    const faker = fakerModule.faker;
    const fakerKO = fakerModule.fakerKO;

    switch (prop.type) {
      case "string":
      case "string[]":
        // Department의 name 필드는 한국어 부서명 생성
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

          // 70% 확률로 prefix 또는 suffix 추가하여 고유성 확보
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
        // 일반 name 필드는 한국어 사람 이름 생성
        if (prop.name === "name" || prop.name === "username") {
          return fakerKO.person.fullName();
        }
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
      case "enum": {
        // enum 타입은 prop.enum 또는 entity.enumLabels[prop.id]에 정의되어 있습니다
        let enumValues: string[] = [];

        if ("enum" in prop && Array.isArray(prop.enum) && prop.enum.length > 0) {
          enumValues = prop.enum;
        } else if ("id" in prop && prop.id && entity?.enumLabels?.[prop.id]) {
          // entity.enumLabels에서 enum 키들을 추출합니다
          enumValues = Object.keys(entity.enumLabels[prop.id]);
        }

        if (enumValues.length > 0) {
          return faker.helpers.arrayElement(enumValues);
        }
        // enum 값이 없으면 nullable 여부에 따라 처리합니다
        return prop.nullable ? null : "UNKNOWN";
      }
      case "enum[]": {
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
      case "vector":
      case "vector[]":
      case "tsvector":
        return null;
      default:
        return null;
    }
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
  async generateBatch(
    specs: Array<{ entity: string; count: number; overrides?: Record<string, unknown> }>,
  ): Promise<FixtureImportResult[]> {
    const context = this.createContext();
    const generatedFixtures: Array<{ entity: string; data: Record<string, unknown> }> = [];

    // 1. 각 spec별로 fixture 생성
    for (const spec of specs) {
      for (let i = 0; i < spec.count; i++) {
        const fixture = await this.generate(spec.entity, spec.overrides || {}, context);
        generatedFixtures.push({
          entity: spec.entity,
          data: fixture,
        });
      }
    }

    // 2. FixtureRecord로 변환
    const fixtureRecords: FixtureRecord[] = [];
    for (const { entity: entityName, data } of generatedFixtures) {
      const entity = this.entityManager.get(entityName);

      // 임시 ID 생성 (targetDb에 INSERT 후 실제 ID를 받음)
      const tempId = Math.floor(Math.random() * 1000000);
      const records = await FixtureManager.createFixtureRecord(
        entity,
        { ...data, id: tempId } as { id: number; [key: string]: string | number | boolean | null },
        { singleRecord: true },
      );
      fixtureRecords.push(...records);
    }

    // 3. targetDb에 삽입 (FixtureManager가 의존성 정렬 처리)
    const results = await FixtureManager.insertFixtures(this.targetDbName, fixtureRecords);

    console.log(
      chalk.green(`Generated and saved ${results.length} fixtures to ${this.targetDbName}`),
    );
    return results;
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
    console.log(
      chalk.blue(
        `Importing ${entityName} from source DB with options: ${JSON.stringify({ strategy: options.strategy, limit: options.limit, includeRelations: options.includeRelations, maxDepth: options.maxDepth })}`,
      ),
    );

    // 1. DataExplorer로 sourceDb에서 데이터 조회 (관련 데이터 포함)
    const exploreResult = await this.dataExplorer.exploreWithRelations(entityName, options);

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
        record as { id: number; [key: string]: string | number | boolean | null },
        { _db: this.sourceDb, singleRecord: true },
      );
      fixtureRecords.push(...records);
    }

    // 관련 entity의 records를 FixtureRecord로 변환
    for (const [relatedEntityName, relatedRecords] of exploreResult.related.entries()) {
      const relatedEntity = this.entityManager.get(relatedEntityName);
      for (const record of relatedRecords) {
        const records = await FixtureManager.createFixtureRecord(
          relatedEntity,
          record as { id: number; [key: string]: string | number | boolean | null },
          { _db: this.sourceDb, singleRecord: true },
        );
        fixtureRecords.push(...records);
      }

      console.log(chalk.gray(`  - ${relatedEntityName}: ${relatedRecords.length} records`));
    }

    // 3. targetDb에 삽입 (FixtureManager가 의존성 정렬 처리)
    const results = await FixtureManager.insertFixtures(this.targetDbName, fixtureRecords);

    console.log(
      chalk.green(
        `Successfully imported ${results.length} records to ${this.targetDbName} (${exploreResult.main.records.length} ${entityName} + ${results.length - exploreResult.main.records.length} related)`,
      ),
    );

    return results;
  }
}

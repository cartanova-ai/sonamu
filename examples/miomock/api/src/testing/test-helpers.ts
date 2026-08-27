import { DB, Entity, EntityManager, TemplateManager } from "sonamu";
import { type EntityJson, type Template } from "sonamu";
import { vi } from "vitest";
import { type Mock } from "vitest";

/**
 * EntityManager.get을 모킹하여 특정 엔티티만 override하고 나머지는 원본을 반환합니다.
 * @param targetEntityId override할 엔티티 ID
 * @param override override할 Entity 속성
 */
export function mockEntityManagerGet(
  targetEntityId: string,
  overrideCallback: (original: EntityJson) => EntityJson,
): Mock<typeof EntityManager.get> {
  const originalEntityJson = EntityManager.get(targetEntityId).toJson();
  const originalGet = EntityManager.get;
  return vi.spyOn(EntityManager, "get").mockImplementation((entityId: string) => {
    if (entityId === targetEntityId) {
      return new Entity(overrideCallback(originalEntityJson));
    }
    return originalGet.call(EntityManager, entityId);
  });
}

/**
 * EntityManager.get을 모킹하여 여러 개의 가짜 엔티티를 완전히 대체합니다.
 * @param entities entityId와 Entity 인스턴스의 매핑
 */
export function mockEntityManagerGetMultiple(entities: Record<string, Entity>) {
  vi.spyOn(EntityManager, "get").mockImplementation((entityId: string) => {
    if (entities[entityId]) {
      return entities[entityId];
    }
    throw new Error(`테스트용 EntityManager.get 모의 구현에 '${entityId}'가 정의되지 않았습니다.`);
  });
}

/**
 * TemplateManager.get을 모킹하여 특정 템플릿만 교체하고 나머지는 원본을 반환합니다.
 * @param templateKey 교체할 템플릿 키
 * @param mockTemplate 교체할 Template 인스턴스
 */
export function mockTemplateManagerGet(
  templateKey: string,
  mockTemplate: Template,
): Mock<typeof TemplateManager.get> {
  const originalGet = TemplateManager.get.bind(TemplateManager);
  return vi.spyOn(TemplateManager, "get").mockImplementation((key: string) => {
    if (key === templateKey) {
      return mockTemplate;
    }
    return originalGet(key);
  });
}

/**
 * TemplateManager.get을 모킹하여 여러 템플릿을 교체합니다.
 * @param templates 템플릿 키와 Template 인스턴스의 매핑
 */
export function mockTemplateManagerGetMultiple(
  templates: Record<string, Template>,
): Mock<typeof TemplateManager.get> {
  const originalGet = TemplateManager.get.bind(TemplateManager);
  return vi.spyOn(TemplateManager, "get").mockImplementation((key: string) => {
    if (templates[key]) {
      return templates[key];
    }
    return originalGet(key);
  });
}

/**
 * fixture DB에서 각 테이블의 max ID를 조회합니다.
 * fixture 데이터가 추가되어도 자동으로 반영됩니다.
 */
export async function getFixtureMaxIds() {
  const fixtureDb = DB.getDB("fixture");

  const [userResult, companyResults, deptResults, empResults] = await Promise.all([
    fixtureDb.raw("SELECT MAX(CAST(id AS INTEGER)) as max_id FROM users WHERE id ~ '^[0-9]+$'"),
    fixtureDb("companies").max("id as maxId"),
    fixtureDb("departments").max("id as maxId"),
    fixtureDb("employees").max("id as maxId"),
  ]);

  return {
    users: Number(userResult.rows[0]?.max_id) || 0,
    companies: Number(companyResults[0]?.maxId) || 0,
    departments: Number(deptResults[0]?.maxId) || 0,
    employees: Number(empResults[0]?.maxId) || 0,
  };
}

/**
 * test DB의 sequence를 fixture max ID + 1로 리셋합니다.
 * @param maxIds getFixtureMaxIds()로 조회한 max ID 맵
 */
export async function resetSequencesToFixture(
  maxIds: Awaited<ReturnType<typeof getFixtureMaxIds>>,
) {
  const db = DB.getDB("w");

  const tables = [
    { name: "users", seqName: "users_id_seq", maxId: maxIds.users },
    { name: "companies", seqName: "companies_id_seq", maxId: maxIds.companies },
    { name: "departments", seqName: "departments_id_seq", maxId: maxIds.departments },
    { name: "employees", seqName: "employees_id_seq", maxId: maxIds.employees },
  ];

  for (const { name: table, seqName, maxId } of tables) {
    try {
      await db.raw(`SELECT setval('${seqName}', ${maxId + 1}, false)`);

      const checkResult = await db.raw(`SELECT last_value FROM ${seqName}`);
      const lastValue = checkResult.rows[0]?.last_value;

      console.log(`✅ ${table} 시퀀스 리셋 완료: ${seqName} = ${lastValue}`);
    } catch (e) {
      console.log(`⚠️  ${table} 시퀀스 리셋 실패:`, e);
    }
  }
}

/**
 * fixture max ID 이후의 테스트 레코드를 삭제합니다.
 * @param maxIds getFixtureMaxIds()로 조회한 max ID 맵
 */
export async function cleanupTestRecords(maxIds: Awaited<ReturnType<typeof getFixtureMaxIds>>) {
  const db = DB.getDB("w");

  const deletedCompanies = await db("companies").where("id", ">", maxIds.companies).delete();

  const deletedUsers = await db.raw(
    `DELETE FROM users WHERE id ~ '^[0-9]+$' AND CAST(id AS INTEGER) > ${maxIds.users}`,
  );

  return {
    companies: deletedCompanies,
    users: deletedUsers.rowCount || 0,
  };
}

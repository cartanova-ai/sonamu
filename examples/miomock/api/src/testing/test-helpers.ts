import { type Entity, EntityManager } from "sonamu";
import { vi } from "vitest";
import { MigrationSetTestEntity } from "./mock-entities";

/**
 * EntityManager.get을 모킹하여 특정 엔티티만 override하고 나머지는 원본을 반환합니다.
 * @param targetEntityId override할 엔티티 ID
 * @param override override할 Entity 속성
 */
export function mockEntityManagerGet(targetEntityId: string, override: Partial<Entity>) {
  const originalGet = EntityManager.get;
  const originalEntity = EntityManager.get(targetEntityId);
  vi.spyOn(EntityManager, "get").mockImplementation((entityId: string) => {
    if (entityId === targetEntityId) {
      return { ...originalEntity, ...override } as Entity;
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
 * migration-set.test.ts에서 사용할 엔티티들을 한 번에 모킹하는 헬퍼 함수
 */
export function mockMigrationSetTestEntities() {
  mockEntityManagerGetMultiple({
    MigrationSetTest: MigrationSetTestEntity,
  });
}

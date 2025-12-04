import { Entity, type EntityJson, EntityManager, type Template, TemplateManager } from "sonamu";
import { type Mock, vi } from "vitest";

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

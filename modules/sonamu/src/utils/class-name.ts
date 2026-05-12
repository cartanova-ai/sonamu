// Sonamu 데코레이터의 컨벤션:
//   - Model/Frame/Agent 등 데코레이터가 식별하는 클래스명은 `${ModelName}Class` 형식입니다.
//   - "UserModelClass" → "UserModel", "ChatFrameClass" → "ChatFrame".
const CLASS_SUFFIX_RE = /(.+)Class$/;

/**
 * `target.constructor.name`에서 trailing "Class"를 떼어내 registeredApis에서 사용하는 modelName을 만듭니다.
 * 정상적인 데코레이터 대상이 아니면 undefined를 반환합니다.
 */
export function getModelNameFromClassName(className: string): string | undefined {
  return className.match(CLASS_SUFFIX_RE)?.[1];
}

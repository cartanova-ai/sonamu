import type { EntityIndex, EntityJson, EntityProp } from "../../types/types";

/**
 * better-auth 플러그인 ID
 * 지원하는 플러그인 목록을 정의합니다.
 */
export type BetterAuthPluginId = "phone-number" | "2fa";

/**
 * 플러그인용 스키마 타입
 *
 * better-auth 플러그인 호출 시 schema 옵션으로 전달됩니다.
 * BetterAuthOptions보다 유연하게 정의하여 플러그인 필드도 허용합니다.
 */
export type PluginSchema = {
  [modelName: string]: {
    modelName?: string;
    fields?: Record<string, string>;
  };
};

/**
 * better-auth 플러그인 정의
 *
 * 각 플러그인은 다음을 정의할 수 있습니다:
 * - entities: 새로 생성할 테이블들
 * - additionalProps: 기존 테이블에 추가할 필드들
 * - schema: 플러그인 호출 시 전달할 스키마 옵션
 */
export type BetterAuthPlugin = {
  /** 플러그인 식별자 */
  id: BetterAuthPluginId;

  /** 플러그인 이름 (표시용) */
  name: string;

  /** 새로 생성할 엔티티들 */
  entities: EntityJson[];

  /**
   * 기존 엔티티에 추가할 필드들
   * key: entityId (예: "User")
   * value: 추가할 EntityProp 배열
   */
  additionalProps: {
    [entityId: string]: EntityProp[];
  };

  /**
   * 기존 엔티티에 추가할 인덱스들
   * key: entityId (예: "User")
   * value: 추가할 EntityIndex 배열
   */
  additionalIndexes?: {
    [entityId: string]: EntityIndex[];
  };

  /**
   * better-auth 플러그인 호출 시 전달할 스키마 옵션
   *
   * 사용 예:
   * ```typescript
   * phoneNumber({ schema: PHONE_NUMBER_SCHEMA })
   * ```
   */
  schema: PluginSchema;
};

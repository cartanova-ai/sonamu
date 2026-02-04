import type { EntityIndex, EntityJson, EntityProp } from "../../../types/types";

/**
 * better-auth 플러그인 ID
 * 지원하는 플러그인 목록을 정의합니다.
 */
export type BetterAuthPluginId = "phone-number" | "2fa" | "username" | "admin" | "sso" | "passkey";

/**
 * better-auth 엔티티 정의
 *
 * 각 플러그인의 Sonamu 엔티티 생성에 필요한 메타데이터입니다.
 * - entities: 새로 생성할 테이블들
 * - additionalProps: 기존 테이블에 추가할 필드들
 * - additionalIndexes: 기존 테이블에 추가할 인덱스들
 */
export type BetterAuthEntityDef = {
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
};

import type { BentoCache } from "bentocache";
import type { RawCommonOptions } from "bentocache/types";

/**
 * 캐시 설정 (sonamu.config.ts에서 사용)
 */
export type CacheConfig = ConstructorParameters<typeof BentoCache>[0];

/**
 * @cache 데코레이터 옵션
 */
export type CacheDecoratorOptions = {
  /**
   * 캐시 키
   * - 문자열: 고정 키 (args가 자동으로 suffix로 추가됨)
   * - 함수: 인자를 받아 키 생성
   * - 미지정: ModelName.methodName:serializedArgs 형태로 자동 생성
   */
  key?: string | ((...args: unknown[]) => string);

  /**
   * 사용할 스토어 이름
   * 미지정 시 default 스토어 사용
   */
  store?: string;
} & RawCommonOptions;

/**
 * CacheManager 타입 (BentoCache 확장)
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- BentoCache의 제네릭 타입을 그대로 사용
export type CacheManager = BentoCache<any>;

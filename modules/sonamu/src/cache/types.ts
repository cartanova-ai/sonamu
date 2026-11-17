import { type BentoCache } from "bentocache";
import { type RawCommonOptions } from "bentocache/types";

/**
 * 캐시 설정 (sonamu.config.ts에서 사용)
 */
export type CacheConfig = ConstructorParameters<typeof BentoCache>[0];

/**
 * @cache 키를 요청 사용자별로 나눌지 여부
 * - "global": 인자가 같으면 모든 사용자가 같은 캐시를 공유 (기본값). 단, 자동 키·문자열 키의 Context 인자는 그 사용자로 구분
 * - "user": Context 인자 또는 현재 요청(HTTP/WebSocket)의 사용자(`user:<id>` 또는 `anon`)를 키에 포함
 */
export type CacheScope = "user" | "global";

/**
 * @cache 데코레이터 옵션
 */
export type CacheDecoratorOptions = {
  /**
   * 캐시 키
   * - 문자열: 고정 키 (args가 자동으로 suffix로 추가됨)
   * - 함수: 인자를 받아 키 생성
   * - 미지정: ModelName.methodName:serializedArgs 형태로 자동 생성
   *
   * Context 인자는 직렬화하지 않고, 그 Context의 사용자(`user:<id>` 또는 `anon`)로 바꿔 키에 넣습니다(함수 키 제외).
   * 직렬화할 수 없는 인자(BigInt, 순환 참조, Map/Set, 함수 등)는 에러로 거부합니다.
   */
  key?: string | ((...args: unknown[]) => string);

  /**
   * 캐시 공유 범위 (기본값: "global")
   *
   * 메서드가 `Sonamu.getContext().user` 등 요청 사용자에 따라 다른 결과를 돌려준다면 "user"로 지정하세요.
   * Context 인자 없이 요청 밖(테스트·스크립트·워크플로)에서 호출되면 키에 사용자 구분자가 붙지 않습니다.
   */
  scope?: CacheScope;

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

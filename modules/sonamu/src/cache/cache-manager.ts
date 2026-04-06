import { BentoCache, bentostore } from "bentocache";
import { memoryDriver } from "bentocache/drivers/memory";

import type { CacheConfig, CacheManager } from "./types";

/**
 * BentoCache 인스턴스를 생성합니다.
 */
export function createCacheManager(config: CacheConfig): CacheManager {
  return new BentoCache(config);
}

/**
 * 테스트 환경용 기본 CacheManager를 생성합니다.
 * 메모리 드라이버만 사용하는 간단한 설정
 */
export function createTestCacheManager(): CacheManager {
  return new BentoCache({
    default: "memory",
    stores: {
      memory: bentostore().useL1Layer(memoryDriver({ maxItems: 1000 })),
    },
  });
}

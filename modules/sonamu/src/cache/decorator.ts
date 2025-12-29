import type { CacheDecoratorOptions, CacheManager } from "./types";

type DecoratorTarget = { constructor: { name: string } };

// 캐시 매니저 참조 (Sonamu.init에서 설정됨)
let cacheManagerRef: CacheManager | null = null;

/**
 * 캐시 매니저 참조 설정 (내부 사용)
 */
export function setCacheManagerRef(manager: CacheManager | null): void {
  cacheManagerRef = manager;
}

/**
 * 캐시 매니저 참조 가져오기 (내부 사용)
 */
export function getCacheManagerRef(): CacheManager | null {
  return cacheManagerRef;
}

/**
 * 캐시 키 생성
 */
function generateCacheKey(
  modelName: string,
  methodName: string,
  args: unknown[],
  keyOption?: CacheDecoratorOptions["key"],
): string {
  // 커스텀 키 함수 사용
  if (typeof keyOption === "function") {
    return keyOption(...args);
  }

  // 문자열 키 + args suffix
  if (typeof keyOption === "string") {
    const argsSuffix = serializeArgs(args);
    return argsSuffix ? `${keyOption}:${argsSuffix}` : keyOption;
  }

  // 자동 생성: ModelName.methodName:serializedArgs
  const baseKey = `${modelName}.${methodName}`;
  const argsSuffix = serializeArgs(args);
  return argsSuffix ? `${baseKey}:${argsSuffix}` : baseKey;
}

/**
 * 인자 직렬화
 */
function serializeArgs(args: unknown[]): string {
  if (args.length === 0) return "";

  // 단일 primitive 값
  if (args.length === 1) {
    const arg = args[0];
    if (arg === null || arg === undefined) return "";
    if (typeof arg === "string" || typeof arg === "number" || typeof arg === "boolean") {
      return String(arg);
    }
  }

  // 복잡한 값은 JSON 직렬화
  try {
    return JSON.stringify(args);
  } catch {
    // 직렬화 실패 시 toString 사용
    return args.map((arg) => String(arg)).join(":");
  }
}

/**
 * @cache 데코레이터
 *
 * 메서드의 결과를 캐싱합니다.
 *
 * @example
 * class UserModelClass extends BaseModel {
 *   @cache({ ttl: '10m', tags: ['user'] })
 *   @api()
 *   async findById(id: number) {
 *     return this.findOne(['id', id]);
 *   }
 * }
 */
export function cache(options: CacheDecoratorOptions = {}) {
  return (_target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const modelName = _target.constructor.name.match(/(.+)Class$/)?.[1] ?? _target.constructor.name;
    const methodName = propertyKey;

    descriptor.value = async function (...args: unknown[]) {
      const manager = cacheManagerRef;

      if (!manager) {
        throw new Error(
          "CacheManager is not initialized. Please configure 'cache' in sonamu.config.ts.",
        );
      }

      const cacheKey = generateCacheKey(modelName, methodName, args, options.key);
      const store = options.store ? manager.use(options.store) : manager;

      return store.getOrSet({
        ...options,
        key: cacheKey,
        factory: () => originalMethod.apply(this, args),
      });
    };

    return descriptor;
  };
}

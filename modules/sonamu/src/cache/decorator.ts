import { type BaseFrameClass } from "../api/base-frame";
import { type RuntimeContext } from "../api/context";
import { Sonamu } from "../api/sonamu";
import { BaseModelClass } from "../database/base-model";
import { isBooleanValue } from "../runtime-type";
import {
  isBigIntValue,
  isFunctionValue,
  isNumberValue,
  isObjectValue,
  isStringValue,
  isSymbolValue,
} from "../utils/runtime-value";
import { type CacheDecoratorOptions, type CacheManager } from "./types";

type DecoratorTarget = { constructor: { name: string } };
type CacheKeyFactory = (...args: unknown[]) => string;

function isCacheKeyFactory(keyOption: CacheDecoratorOptions["key"]): keyOption is CacheKeyFactory {
  return isFunctionValue(keyOption);
}

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
 * 캐시 키를 만들 수 없는 인자를 받았을 때 던지는 에러
 */
export class CacheKeySerializationError extends TypeError {
  constructor(cacheName: string, reason: string) {
    super(
      `@cache(${cacheName}): ${reason} 캐시 키를 만들 수 없습니다. key 옵션으로 키를 직접 지정하세요.`,
    );
    this.name = "CacheKeySerializationError";
  }
}

/**
 * Sonamu가 API 메서드에 주입하는 Context(HTTP/WebSocket) 객체인지 판별합니다.
 */
function isRuntimeContextArg<Value>(value: Value): value is Value & RuntimeContext {
  if (!isObjectValue(value)) return false;
  const candidate: Partial<Record<"transport" | "naiteStore", Value>> = value;
  return (
    (candidate.transport === "http" || candidate.transport === "ws") &&
    candidate.naiteStore instanceof Map &&
    "user" in value
  );
}

/**
 * 키에 넣을 사용자 구분자를 만듭니다.
 * id를 JSON 문자열로 감싸 뒤따르는 인자 suffix와 경계가 섞이지 않게 합니다.
 */
function userSegment(context: RuntimeContext): string {
  const userId = context.user?.id;
  return userId === undefined || userId === null ? "anon" : `user:${JSON.stringify(userId)}`;
}

/**
 * 현재 요청(ALS)의 Context를 가져옵니다. 요청 밖(테스트·스크립트·워크플로)에서는 null입니다.
 * Sonamu.getContext()는 테스트 환경에서 mock을 돌려주므로 ALS store를 직접 읽습니다.
 */
function getRequestContext(): RuntimeContext | null {
  return Sonamu.asyncLocalStorage.getStore()?.context ?? null;
}

/**
 * 캐시 키 생성
 */
function generateCacheKey(
  cacheName: string,
  modelName: string,
  methodName: string,
  args: unknown[],
  options: Pick<CacheDecoratorOptions, "key" | "scope">,
): string {
  const { key: keyOption, scope = "global" } = options;
  const contextArg = args.find(isRuntimeContextArg);
  const requestContext = contextArg ?? (scope === "user" ? getRequestContext() : null);
  const userSuffix = scope === "user" && requestContext ? userSegment(requestContext) : "";

  // 커스텀 키 함수 사용 (Context 인자는 함수가 직접 다룸)
  if (isCacheKeyFactory(keyOption)) {
    const customKey = keyOption(...args);
    return userSuffix ? `${customKey}:${userSuffix}` : customKey;
  }

  // Context 객체 자체는 키에서 빼고, 그 메서드는 Context 사용자 기준으로 키를 나눔
  // (Context를 받는 메서드는 요청 사용자에 따라 결과가 달라질 수 있어 사용자 간 공유를 막음)
  const contextSuffix = contextArg ? userSegment(contextArg) : userSuffix;
  const keyArgs = args.filter((arg) => !isRuntimeContextArg(arg));

  // 문자열 키 또는 자동 생성(ModelName.methodName) + args suffix
  const baseKey = isStringValue(keyOption) ? keyOption : `${modelName}.${methodName}`;
  const argsSuffix = serializeArgs(cacheName, keyArgs);
  return [baseKey, contextSuffix, argsSuffix].filter((part) => part !== "").join(":");
}

/**
 * JSON.stringify가 조용히 버리거나 뭉개는 값을 거부하는 replacer
 */
function rejectUnserializable(cacheName: string) {
  return <Value>(_key: string, value: Value): Value => {
    if (isRuntimeContextArg(value)) {
      throw new CacheKeySerializationError(cacheName, "인자 안에 Context 객체가 있어");
    }
    if (value instanceof Map || value instanceof Set) {
      // JSON에서는 모두 {}가 되어 서로 다른 인자가 같은 키로 충돌함
      throw new CacheKeySerializationError(cacheName, "Map/Set 인자는");
    }
    if (isFunctionValue(value) || isSymbolValue(value)) {
      throw new CacheKeySerializationError(cacheName, "함수/심벌 인자는");
    }
    return value;
  };
}

/**
 * 인자 직렬화
 *
 * 직렬화할 수 없는 인자(BigInt, 순환 참조, Map/Set, 함수 등)는 문자열로 뭉개지 않고
 * CacheKeySerializationError를 던집니다.
 */
function serializeArgs(cacheName: string, args: unknown[]): string {
  if (args.length === 0) return "";

  // 단일 primitive 값
  if (args.length === 1) {
    const arg = args[0];
    if (arg === null || arg === undefined) return "";
    if (isStringValue(arg) || isNumberValue(arg) || isBooleanValue(arg)) {
      return String(arg);
    }
  }

  if (args.some(isBigIntValue)) {
    throw new CacheKeySerializationError(cacheName, "BigInt 인자는");
  }

  // 복잡한 값은 JSON 직렬화
  try {
    return JSON.stringify(args, rejectUnserializable(cacheName));
  } catch (error) {
    if (error instanceof CacheKeySerializationError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new CacheKeySerializationError(cacheName, `인자를 JSON으로 직렬화할 수 없어(${reason})`);
  }
}

/**
 * @cache 데코레이터
 *
 * 메서드의 결과를 캐싱합니다.
 *
 * - 자동 키·문자열 키에서 Context 인자는 키에서 빠지고, 대신 그 Context의 사용자(`user:<id>` 또는 `anon`)가 키에 들어갑니다.
 *   함수 키는 Context 인자를 직접 다룹니다.
 * - `scope: "user"`이면 요청 안에서 호출될 때 요청 사용자가 키에 들어갑니다. 기본값은 `"global"`입니다.
 * - 직렬화할 수 없는 인자는 CacheKeySerializationError로 거부합니다.
 * - 캐시 적중 시 메서드 본문을 실행하지 않으므로, 권한 검사는 캐시 밖(호출하는 메서드나 가드)에서 하세요.
 *
 * @example
 * class UserModelClass extends BaseModelClass<...> {
 *   @cache({ ttl: '10m', tags: ['user'] })
 *   @api()
 *   async findById(subset: UserSubsetKey, id: string) {
 *     const { rows } = await this.findMany(subset, { id, num: 1, page: 1 });
 *     return rows[0];
 *   }
 * }
 */
export function cache(options: CacheDecoratorOptions = {}) {
  const { key, scope, store: storeName, ...cacheOptions } = options;

  return (_target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: BaseModelClass | BaseFrameClass, ...args: unknown[]) {
      const manager = cacheManagerRef;

      if (!manager) {
        throw new Error(
          "CacheManager is not initialized. Please configure 'cache' in sonamu.config.ts.",
        );
      }

      const modelName = this instanceof BaseModelClass ? this.modelName : this.frameName;
      const methodName = propertyKey;

      const cacheKey = generateCacheKey(`${modelName}.${methodName}`, modelName, methodName, args, {
        key,
        scope,
      });
      const store = storeName ? manager.use(storeName) : manager;

      return store.getOrSet({
        ...cacheOptions,
        key: cacheKey,
        factory: () => originalMethod.apply(this, args),
      });
    };

    return descriptor;
  };
}

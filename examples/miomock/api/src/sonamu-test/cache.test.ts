import { cache, Sonamu } from "sonamu";
import { setCacheManagerRef } from "sonamu/cache";
import { bootstrap } from "sonamu/test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

bootstrap(vi);

type CacheMethodResult = object | string | number | boolean | null | undefined;

const createMockTarget = (modelName: string) => ({
  constructor: { name: `${modelName}Class` },
  frameName: modelName,
});

const applyCache = <T extends (...args: never[]) => CacheMethodResult>(
  target: ReturnType<typeof createMockTarget>,
  methodName: string,
  originalFn: T,
  options: Parameters<typeof cache>[0] = {},
) => {
  const descriptor = { value: originalFn };
  cache(options)(target, methodName, descriptor);
  // SAFETY: 데코레이터가 원본 함수 시그니처를 유지하며 테스트 대상에 바인딩한다.
  return descriptor.value.bind(target) as T;
};

describe("cache", () => {
  beforeAll(async () => {
    Sonamu.isInitialized = false;
    await Sonamu.initForTesting();
  });

  afterEach(async () => {
    await Sonamu.cache.clear();
  });

  describe("Sonamu.cache 직접 접근", () => {
    test("set/get - 기본 동작", async () => {
      await Sonamu.cache.set({ key: "test-key", value: { id: 1, name: "test" } });
      const result = await Sonamu.cache.get({ key: "test-key" });

      expect(result).toEqual({ id: 1, name: "test" });
    });

    test("get - 존재하지 않는 키", async () => {
      const result = await Sonamu.cache.get({ key: "non-existent" });

      expect(result).toBeUndefined();
    });

    test("get - defaultValue 옵션", async () => {
      const result = await Sonamu.cache.get({
        key: "non-existent",
        defaultValue: "default",
      });

      expect(result).toBe("default");
    });

    test("has - 키 존재 확인", async () => {
      await Sonamu.cache.set({ key: "exists", value: "value" });

      expect(await Sonamu.cache.has({ key: "exists" })).toBe(true);
      expect(await Sonamu.cache.has({ key: "not-exists" })).toBe(false);
    });

    test("delete - 키 삭제", async () => {
      await Sonamu.cache.set({ key: "to-delete", value: "value" });
      expect(await Sonamu.cache.has({ key: "to-delete" })).toBe(true);

      await Sonamu.cache.delete({ key: "to-delete" });
      expect(await Sonamu.cache.has({ key: "to-delete" })).toBe(false);
    });

    test("deleteMany - 여러 키 삭제", async () => {
      await Sonamu.cache.set({ key: "key1", value: "value1" });
      await Sonamu.cache.set({ key: "key2", value: "value2" });
      await Sonamu.cache.set({ key: "key3", value: "value3" });

      await Sonamu.cache.deleteMany({ keys: ["key1", "key2"] });

      expect(await Sonamu.cache.has({ key: "key1" })).toBe(false);
      expect(await Sonamu.cache.has({ key: "key2" })).toBe(false);
      expect(await Sonamu.cache.has({ key: "key3" })).toBe(true);
    });

    test("clear - 전체 캐시 삭제", async () => {
      await Sonamu.cache.set({ key: "a", value: 1 });
      await Sonamu.cache.set({ key: "b", value: 2 });
      await Sonamu.cache.set({ key: "c", value: 3 });

      await Sonamu.cache.clear();

      expect(await Sonamu.cache.has({ key: "a" })).toBe(false);
      expect(await Sonamu.cache.has({ key: "b" })).toBe(false);
      expect(await Sonamu.cache.has({ key: "c" })).toBe(false);
    });

    test("getOrSet - 캐시 미스 시 factory 실행", async () => {
      const factory = vi.fn().mockResolvedValue({ data: "from factory" });

      const result = await Sonamu.cache.getOrSet({
        key: "computed",
        factory,
      });

      expect(result).toEqual({ data: "from factory" });
      expect(factory).toHaveBeenCalledTimes(1);
    });

    test("getOrSet - 캐시 히트 시 factory 미실행", async () => {
      const factory = vi.fn().mockResolvedValue({ data: "new" });

      // 먼저 캐시 저장
      await Sonamu.cache.set({ key: "cached", value: { data: "old" } });

      const result = await Sonamu.cache.getOrSet({
        key: "cached",
        factory,
      });

      expect(result).toEqual({ data: "old" });
      expect(factory).not.toHaveBeenCalled();
    });

    test("getOrSet - ttl 옵션", async () => {
      const factory = vi.fn().mockResolvedValue("value");

      await Sonamu.cache.getOrSet({
        key: "with-ttl",
        ttl: "10s",
        factory,
      });

      expect(await Sonamu.cache.has({ key: "with-ttl" })).toBe(true);
    });

    test("set with ttl 옵션", async () => {
      await Sonamu.cache.set({ key: "ttl-test", value: "value", ttl: "1s" });

      expect(await Sonamu.cache.get({ key: "ttl-test" })).toBe("value");
    });

    test("getOrSet - forceFresh 옵션", async () => {
      let callCount = 0;
      const factory = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ count: callCount });
      });

      // 첫 번째 호출
      const result1 = await Sonamu.cache.getOrSet({
        key: "force-fresh-test",
        factory,
      });
      expect(result1).toEqual({ count: 1 });

      // forceFresh로 캐시 무시
      const result2 = await Sonamu.cache.getOrSet({
        key: "force-fresh-test",
        factory,
        forceFresh: true,
      });
      expect(result2).toEqual({ count: 2 });
      expect(factory).toHaveBeenCalledTimes(2);
    });

    test("set/deleteByTag - 태그 기반 캐시 관리", async () => {
      // 태그와 함께 캐시 저장
      await Sonamu.cache.set({
        key: "product:1",
        value: { name: "Product 1" },
        tags: ["product", "featured"],
      });
      await Sonamu.cache.set({
        key: "product:2",
        value: { name: "Product 2" },
        tags: ["product"],
      });
      await Sonamu.cache.set({
        key: "user:1",
        value: { name: "User 1" },
        tags: ["user"],
      });

      // 태그로 무효화
      await Sonamu.cache.deleteByTag({ tags: ["product"] });

      // product 태그가 있는 키들은 삭제됨
      expect(await Sonamu.cache.has({ key: "product:1" })).toBe(false);
      expect(await Sonamu.cache.has({ key: "product:2" })).toBe(false);
      // user 태그만 있는 키는 유지됨
      expect(await Sonamu.cache.has({ key: "user:1" })).toBe(true);
    });

    test("namespace - 네임스페이스 분리", async () => {
      const usersNs = Sonamu.cache.namespace("users");
      const productsNs = Sonamu.cache.namespace("products");

      // 같은 키지만 다른 네임스페이스
      await usersNs.set({ key: "1", value: { name: "User 1" } });
      await productsNs.set({ key: "1", value: { name: "Product 1" } });

      expect(await usersNs.get({ key: "1" })).toEqual({ name: "User 1" });
      expect(await productsNs.get({ key: "1" })).toEqual({ name: "Product 1" });

      // 네임스페이스 클리어
      await usersNs.clear();
      expect(await usersNs.has({ key: "1" })).toBe(false);
      expect(await productsNs.has({ key: "1" })).toBe(true);
    });

    test("missing - has의 반대", async () => {
      await Sonamu.cache.set({ key: "exists", value: "value" });

      expect(await Sonamu.cache.missing({ key: "exists" })).toBe(false);
      expect(await Sonamu.cache.missing({ key: "not-exists" })).toBe(true);
    });

    test("pull - 가져오면서 삭제", async () => {
      await Sonamu.cache.set({ key: "to-pull", value: { data: "value" } });

      const result = await Sonamu.cache.pull("to-pull");
      expect(result).toEqual({ data: "value" });

      // 삭제되었는지 확인
      expect(await Sonamu.cache.has({ key: "to-pull" })).toBe(false);
    });

    test("setForever - TTL 없이 영구 저장", async () => {
      await Sonamu.cache.setForever({ key: "forever-key", value: "permanent" });

      expect(await Sonamu.cache.get({ key: "forever-key" })).toBe("permanent");
    });

    test("getOrSetForever - TTL 없이 영구 캐싱", async () => {
      const factory = vi.fn().mockResolvedValue({ config: "value" });

      const result = await Sonamu.cache.getOrSetForever({
        key: "config-forever",
        factory,
      });

      expect(result).toEqual({ config: "value" });
      expect(factory).toHaveBeenCalledTimes(1);

      // 두 번째 호출 - 캐시 히트
      await Sonamu.cache.getOrSetForever({ key: "config-forever", factory });
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe("@cache 데코레이터", () => {
    test("기본 동작 - 캐시 미스 후 히트", async () => {
      const target = createMockTarget("TestModel");
      const originalFn = vi.fn().mockResolvedValue({ id: 1, name: "test" });
      const cachedFn = applyCache(target, "findById", originalFn, { ttl: "10s" });

      // 첫 번째 호출 - 캐시 미스
      const result1 = await cachedFn(123);
      expect(result1).toEqual({ id: 1, name: "test" });
      expect(originalFn).toHaveBeenCalledTimes(1);

      // 두 번째 호출 - 캐시 히트
      const result2 = await cachedFn(123);
      expect(result2).toEqual({ id: 1, name: "test" });
      expect(originalFn).toHaveBeenCalledTimes(1); // 여전히 1번
    });

    test("다른 인자는 다른 캐시 키", async () => {
      const target = createMockTarget("TestModel");
      const originalFn = vi.fn().mockImplementation((id) => Promise.resolve({ id }));
      const cachedFn = applyCache(target, "findById", originalFn, { ttl: "10s" });

      await cachedFn(1);
      await cachedFn(2);
      await cachedFn(1); // 캐시 히트

      expect(originalFn).toHaveBeenCalledTimes(2); // 1, 2 각각 한 번씩
    });

    test("key 옵션 - 문자열", async () => {
      const target = createMockTarget("TestModel");
      const originalFn = vi.fn().mockResolvedValue("result");
      const cachedFn = applyCache(target, "method", originalFn, { key: "custom-key", ttl: "10s" });

      await cachedFn(123);

      // custom-key:123 으로 캐시됨
      expect(await Sonamu.cache.has({ key: "custom-key:123" })).toBe(true);
    });

    test("key 옵션 - 함수", async () => {
      const target = createMockTarget("TestModel");
      const originalFn = vi.fn().mockResolvedValue("result");
      const cachedFn = applyCache(target, "method", originalFn, {
        key: (...args: unknown[]) => `user:${args[0]}:${args[1]}`,
        ttl: "10s",
      });

      await cachedFn(42, "profile");

      expect(await Sonamu.cache.has({ key: "user:42:profile" })).toBe(true);
    });

    test("자동 키 생성 - ModelName.methodName:args", async () => {
      // modelName/frameName을 이용하여 User.findById:999 형태로 키 생성
      const target = createMockTarget("User");
      const originalFn = vi.fn().mockResolvedValue("result");
      const cachedFn = applyCache(target, "findById", originalFn, { ttl: "10s" });

      await cachedFn(999);

      expect(await Sonamu.cache.has({ key: "User.findById:999" })).toBe(true);
    });

    test("인자 없는 메서드", async () => {
      const target = createMockTarget("Config");
      const originalFn = vi.fn().mockResolvedValue({ setting: "value" });
      const cachedFn = applyCache(target, "getAll", originalFn, { ttl: "10s" });

      await cachedFn();

      expect(await Sonamu.cache.has({ key: "Config.getAll" })).toBe(true);
    });

    test("복잡한 인자 직렬화", async () => {
      const target = createMockTarget("Search");
      const originalFn = vi.fn().mockResolvedValue([]);
      const cachedFn = applyCache(target, "search", originalFn, { ttl: "10s" });

      await cachedFn({ query: "test", page: 1 });

      // JSON 직렬화된 키
      expect(await Sonamu.cache.has({ key: 'Search.search:[{"query":"test","page":1}]' })).toBe(
        true,
      );
    });

    test("캐시 매니저 없으면 에러", async () => {
      setCacheManagerRef(null);

      const target = createMockTarget("TestModel");
      const originalFn = vi.fn().mockResolvedValue("result");
      const cachedFn = applyCache(target, "method", originalFn, { ttl: "10s" });

      await expect(cachedFn()).rejects.toThrow("CacheManager is not initialized");

      // 원래대로 복원
      setCacheManagerRef(Sonamu.cache);
    });

    test("factory 에러 전파", async () => {
      const target = createMockTarget("TestModel");
      const originalFn = vi.fn().mockRejectedValue(new Error("DB Error"));
      const cachedFn = applyCache(target, "method", originalFn, { ttl: "10s" });

      // BentoCache는 factory 에러를 래핑함
      await expect(cachedFn()).rejects.toThrow("Factory has thrown an error");
    });

    test("내부 메서드 호출 시 캐시 공유 (findById → findMany 패턴)", async () => {
      // findMany에 캐시 적용된 모델 시뮬레이션
      const findManyFn = vi.fn().mockImplementation((params) =>
        Promise.resolve({
          rows: [{ id: params.id, name: `Item ${params.id}` }],
          total: 1,
        }),
      );

      // 모델 객체 생성
      const model = {
        constructor: { name: "ItemModelClass" },
        frameName: "Item",
        findMany: findManyFn,
        findById: async function (id: number) {
          const { rows } = await this.findMany({ id, num: 1, page: 1 });
          return rows[0];
        },
      };

      // findMany에 캐시 데코레이터 적용
      const findManyDescriptor = { value: model.findMany };
      cache({ ttl: "10s" })(model, "findMany", findManyDescriptor);
      model.findMany = findManyDescriptor.value;

      // findById 호출 (내부에서 findMany 호출)
      const result1 = await model.findById(123);
      expect(result1).toEqual({ id: 123, name: "Item 123" });
      expect(findManyFn).toHaveBeenCalledTimes(1);

      // 같은 파라미터로 findById 다시 호출 → findMany 캐시 히트
      const result2 = await model.findById(123);
      expect(result2).toEqual({ id: 123, name: "Item 123" });
      expect(findManyFn).toHaveBeenCalledTimes(1); // 여전히 1번 (캐시 히트)

      // findMany 직접 호출도 같은 캐시 사용
      const result3 = await model.findMany({ id: 123, num: 1, page: 1 });
      expect(result3.rows[0]).toEqual({ id: 123, name: "Item 123" });
      expect(findManyFn).toHaveBeenCalledTimes(1); // 여전히 1번 (캐시 히트)

      // 다른 파라미터는 캐시 미스
      await model.findById(456);
      expect(findManyFn).toHaveBeenCalledTimes(2);
    });

    test("TTL 만료 후 캐시 미스", async () => {
      vi.useFakeTimers();

      const target = createMockTarget("TestModel");
      let callCount = 0;
      const originalFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ count: callCount });
      });
      const cachedFn = applyCache(target, "getData", originalFn, { ttl: "100ms", grace: false });

      // 첫 번째 호출 - 캐시 미스
      const result1 = await cachedFn();
      expect(result1).toEqual({ count: 1 });
      expect(originalFn).toHaveBeenCalledTimes(1);

      // 50ms 후 - 아직 TTL 내
      vi.advanceTimersByTime(50);
      const result2 = await cachedFn();
      expect(result2).toEqual({ count: 1 }); // 캐시된 값
      expect(originalFn).toHaveBeenCalledTimes(1);

      // 100ms 더 경과 (총 150ms) - TTL 만료
      vi.advanceTimersByTime(100);
      const result3 = await cachedFn();
      expect(result3).toEqual({ count: 2 }); // 새로운 값
      expect(originalFn).toHaveBeenCalledTimes(2);

      vi.clearAllTimers();
    });

    test("TTL 만료 후 Stale 값 반환 - grace: true", async () => {
      vi.useFakeTimers();

      const target = createMockTarget("TestModel");
      let callCount = 0;
      const originalFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ count: callCount });
      });
      const cachedFn = applyCache(target, "getData", originalFn, { ttl: "100ms", grace: "1s" });

      // 첫 번째 호출 - 캐시 미스
      const result1 = await cachedFn();
      expect(result1).toEqual({ count: 1 });
      expect(originalFn).toHaveBeenCalledTimes(1);

      // 50ms 후 - 아직 TTL 내
      vi.advanceTimersByTime(50);
      const result2 = await cachedFn();
      expect(result2).toEqual({ count: 1 }); // 캐시된 값
      expect(originalFn).toHaveBeenCalledTimes(1);

      // 100ms 더 경과 (총 150ms) - TTL 만료
      vi.advanceTimersByTime(100);
      const result3 = await cachedFn();
      expect(result3).toEqual({ count: 1 }); // Stale 값 반환
      expect(originalFn).toHaveBeenCalledTimes(2); // factory는 background 실행

      vi.clearAllTimers();
    });

    test("forceFresh - 캐시 무시하고 강제 갱신", async () => {
      const target = createMockTarget("TestModel");
      let callCount = 0;
      const originalFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ count: callCount });
      });
      const cachedFn = applyCache(target, "getData", originalFn, { ttl: "10s", forceFresh: true });

      // 첫 번째 호출
      const result1 = await cachedFn();
      expect(result1).toEqual({ count: 1 });
      expect(originalFn).toHaveBeenCalledTimes(1);

      // 두 번째 호출 - forceFresh이므로 캐시 무시하고 factory 재실행
      const result2 = await cachedFn();
      expect(result2).toEqual({ count: 2 });
      expect(originalFn).toHaveBeenCalledTimes(2);
    });

    test("tags - 태그 기반 무효화", async () => {
      const target = createMockTarget("Product");
      const originalFn = vi.fn().mockResolvedValue({ name: "Product A" });
      const cachedFn = applyCache(target, "findById", originalFn, {
        ttl: "10s",
        tags: ["product", "category:1"],
      });

      // 캐시 저장
      await cachedFn(1);
      expect(originalFn).toHaveBeenCalledTimes(1);

      // 캐시 히트
      await cachedFn(1);
      expect(originalFn).toHaveBeenCalledTimes(1);

      // 태그로 무효화
      await Sonamu.cache.deleteByTag({ tags: ["product"] });

      // 캐시 미스 (무효화됨)
      await cachedFn(1);
      expect(originalFn).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * Fixture Loader Factory
 *
 * 테스트에서 사용할 fixture를 로드하는 함수를 생성
 *
 * @example
 * ```typescript
 * // fixture.ts
 * import { createFixtureLoader } from "sonamu/test";
 *
 * export const loadFixtures = createFixtureLoader({
 *   company01: async () => CompanyModel.findById("A", 1),
 *   user01: async () => UserModel.findById("A", 1),
 * });
 *
 * // test.ts
 * const { company01, user01 } = await loadFixtures(["company01", "user01"]);
 * ```
 */
type FixtureLoaderValue = object | string | number | boolean | bigint | symbol | null | undefined;

export function createFixtureLoader<T extends Record<string, () => Promise<FixtureLoaderValue>>>(
  loaders: T,
) {
  return async function loadFixtures<K extends keyof T>(
    names: K[],
  ): Promise<{ [P in K]: Awaited<ReturnType<T[P]>> }> {
    return Object.fromEntries(
      await Promise.all(names.map(async (name) => [name, await loaders[name]()])),
    );
  };
}

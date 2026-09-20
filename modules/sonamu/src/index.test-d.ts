import { describe, expectTypeOf, it } from "vitest";

import { getSonamuEnvironment, type SonamuEnvironment } from "./index";
// @ts-expect-error 환경 스냅샷 타입은 루트 공개 API가 아니다.
import { type EnvironmentSnapshot } from "./index";
// @ts-expect-error 환경 스냅샷 컬렉션 타입은 루트 공개 API가 아니다.
import { type EnvironmentSnapshots } from "./index";

describe("sonamu 루트 환경 API 타입", () => {
  it("공개 환경 타입을 정확한 네 값의 유니온으로 유지한다", () => {
    expectTypeOf<SonamuEnvironment>().toEqualTypeOf<
      "test" | "development" | "staging" | "production"
    >();
  });

  it("환경 조회 함수가 공개 환경 타입을 반환한다", () => {
    expectTypeOf(getSonamuEnvironment).toEqualTypeOf<
      (env?: NodeJS.ProcessEnv) => SonamuEnvironment
    >();
  });

  it("내부 환경 스냅샷 타입은 공개하지 않는다", () => {
    expectTypeOf<EnvironmentSnapshot>();
    expectTypeOf<EnvironmentSnapshots>();
  });
});

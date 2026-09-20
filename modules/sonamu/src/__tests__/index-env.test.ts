import { afterEach, describe, expect, it } from "vitest";

import * as sonamu from "../index";

const originalNodeEnv = process.env.NODE_ENV;

describe("sonamu 루트 환경 API", () => {
  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
      return;
    }

    process.env.NODE_ENV = originalNodeEnv;
  });

  it.each(["test", "development", "staging", "production"] as const)(
    "%s 환경을 루트 진입점에서 반환한다",
    (environment) => {
      expect(sonamu.getSonamuEnvironment({ NODE_ENV: environment })).toBe(environment);
    },
  );

  it.each([undefined, ""])("NODE_ENV가 %s이면 development를 반환한다", (nodeEnv) => {
    expect(sonamu.getSonamuEnvironment({ NODE_ENV: nodeEnv })).toBe("development");
  });

  it("지원하지 않는 환경값을 거부한다", () => {
    expect(() => sonamu.getSonamuEnvironment({ NODE_ENV: "preview" })).toThrow(
      'Invalid NODE_ENV "preview". Sonamu supports only test, development, staging, production.',
    );
  });

  it("인자를 생략하면 process.env.NODE_ENV를 사용한다", () => {
    process.env.NODE_ENV = "staging";

    expect(sonamu.getSonamuEnvironment()).toBe("staging");
  });

  it("환경 내부 유틸리티는 루트 진입점에 노출하지 않는다", () => {
    expect(sonamu).not.toHaveProperty("SONAMU_ENVIRONMENTS");
    expect(sonamu).not.toHaveProperty("isSonamuEnvironment");
    expect(sonamu).not.toHaveProperty("readEnvironmentSnapshot");
    expect(sonamu).not.toHaveProperty("readAllEnvironmentSnapshots");
    expect(sonamu).not.toHaveProperty("applyCurrentSnapshotToProcessEnv");
    expect(sonamu).not.toHaveProperty("isDevelopmentEnvironment");
    expect(sonamu).not.toHaveProperty("isStagingEnvironment");
    expect(sonamu).not.toHaveProperty("isProductionEnvironment");
    expect(sonamu).not.toHaveProperty("isTestEnvironment");
  });
});

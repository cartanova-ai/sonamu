import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  isDaemonServer,
  isDevelopment,
  isInDocker,
  isLocal,
  isProduction,
  isRemote,
  isStaging,
  isTest,
} from "../../../../../modules/sonamu/dist/utils/controller";

describe("controller", () => {
  let originalNodeEnv: string | undefined;
  let originalNodeType: string | undefined;
  let originalInDocker: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalNodeType = process.env.NODE_TYPE;
    originalInDocker = process.env.SONAMU_IN_DOCKER;
    delete process.env.SONAMU_IN_DOCKER;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalNodeType === undefined) {
      delete process.env.NODE_TYPE;
    } else {
      process.env.NODE_TYPE = originalNodeType;
    }

    if (originalInDocker === undefined) {
      delete process.env.SONAMU_IN_DOCKER;
    } else {
      process.env.SONAMU_IN_DOCKER = originalInDocker;
    }
  });

  test("NODE_ENV가 없으면 development로 동작한다", () => {
    delete process.env.NODE_ENV;

    expect(isDevelopment()).toBe(true);
    expect(isLocal()).toBe(true);
    expect(isRemote()).toBe(false);
  });

  test("test는 로컬 테스트 환경으로 동작한다", () => {
    process.env.NODE_ENV = "test";

    expect(isTest()).toBe(true);
    expect(isLocal()).toBe(true);
    expect(isRemote()).toBe(false);
  });

  test("staging은 원격 서버 환경으로 동작한다", () => {
    process.env.NODE_ENV = "staging";

    expect(isStaging()).toBe(true);
    expect(isLocal()).toBe(false);
    expect(isRemote()).toBe(true);
  });

  test("production은 원격 서버 환경으로 동작한다", () => {
    process.env.NODE_ENV = "production";

    expect(isProduction()).toBe(true);
    expect(isLocal()).toBe(false);
    expect(isRemote()).toBe(true);
  });

  test("development는 개발 환경으로 동작한다", () => {
    process.env.NODE_ENV = "development";

    expect(isDevelopment()).toBe(true);
    expect(isStaging()).toBe(false);
    expect(isProduction()).toBe(false);
    expect(isTest()).toBe(false);
  });

  test("SONAMU_IN_DOCKER로 도커 환경을 감지한다", () => {
    process.env.SONAMU_IN_DOCKER = "true";
    expect(isInDocker()).toBe(true);

    process.env.SONAMU_IN_DOCKER = "1";
    expect(isInDocker()).toBe(true);

    process.env.SONAMU_IN_DOCKER = "false";
    expect(isInDocker()).toBe(false);
  });

  test("NODE_TYPE=daemon이면 데몬 서버로 동작한다", () => {
    process.env.NODE_TYPE = "daemon";
    expect(isDaemonServer()).toBe(true);
  });

  test("지원하지 않는 NODE_ENV는 명시적으로 실패한다", () => {
    process.env.NODE_ENV = "qa";
    expect(() => isLocal()).toThrow(/Invalid NODE_ENV/);
  });
});

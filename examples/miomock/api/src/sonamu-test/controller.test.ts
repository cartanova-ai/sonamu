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
  // 원래 환경 변수 백업
  let originalLR: string | undefined;
  let originalNodeEnv: string | undefined;
  let originalNodeType: string | undefined;

  beforeEach(() => {
    // 환경 변수 백업
    originalLR = process.env.LR;
    originalNodeEnv = process.env.NODE_ENV;
    originalNodeType = process.env.NODE_TYPE;
  });

  afterEach(() => {
    // 환경 변수 복원
    if (originalLR === undefined) {
      delete process.env.LR;
    } else {
      process.env.LR = originalLR;
    }

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
  });

  describe("isLocal: 로컬 환경 감지", () => {
    test("LR 환경변수가 없을 때 true를 반환한다", () => {
      delete process.env.LR;
      expect(isLocal()).toBe(true);
    });

    test('LR="local"일 때 true를 반환한다', () => {
      process.env.LR = "local";
      expect(isLocal()).toBe(true);
    });

    test('LR="remote"일 때 false를 반환한다', () => {
      process.env.LR = "remote";
      expect(isLocal()).toBe(false);
    });
  });

  describe("isRemote: 원격 환경 감지", () => {
    test('LR="remote"일 때 true를 반환한다', () => {
      process.env.LR = "remote";
      expect(isRemote()).toBe(true);
    });

    test('LR="local"일 때 false를 반환한다', () => {
      process.env.LR = "local";
      expect(isRemote()).toBe(false);
    });

    test("LR 환경변수가 없을 때 false를 반환한다", () => {
      delete process.env.LR;
      expect(isRemote()).toBe(false);
    });
  });

  describe("isInDocker: 도커 환경 감지", () => {
    test("LR 환경변수가 존재할 때 true를 반환한다", () => {
      process.env.LR = "remote";
      expect(isInDocker()).toBe(true);
    });

    test('LR="local"일 때도 true를 반환한다 (LR이 정의되어 있으므로)', () => {
      process.env.LR = "local";
      expect(isInDocker()).toBe(true);
    });

    test("LR 환경변수가 없을 때 false를 반환한다", () => {
      delete process.env.LR;
      expect(isInDocker()).toBe(false);
    });
  });

  describe("isDaemonServer: 데몬 서버 감지", () => {
    test('NODE_TYPE="daemon"일 때 true를 반환한다', () => {
      process.env.NODE_TYPE = "daemon";
      expect(isDaemonServer()).toBe(true);
    });

    test("NODE_TYPE이 다른 값일 때 false를 반환한다", () => {
      process.env.NODE_TYPE = "worker";
      expect(isDaemonServer()).toBe(false);
    });

    test("NODE_TYPE이 없을 때 false를 반환한다", () => {
      delete process.env.NODE_TYPE;
      expect(isDaemonServer()).toBe(false);
    });
  });

  describe("isDevelopment: 개발 환경 감지", () => {
    test('LR="remote" + NODE_ENV="development"일 때 true를 반환한다', () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "development";
      expect(isDevelopment()).toBe(true);
    });

    test('LR="local"이면 NODE_ENV="development"이어도 false를 반환한다', () => {
      process.env.LR = "local";
      process.env.NODE_ENV = "development";
      expect(isDevelopment()).toBe(false);
    });

    test('LR="remote"이지만 NODE_ENV가 다르면 false를 반환한다', () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "production";
      expect(isDevelopment()).toBe(false);
    });

    test("환경변수가 없을 때 false를 반환한다", () => {
      delete process.env.LR;
      delete process.env.NODE_ENV;
      expect(isDevelopment()).toBe(false);
    });
  });

  describe("isStaging: 스테이징 환경 감지", () => {
    test('LR="remote" + NODE_ENV="staging"일 때 true를 반환한다', () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "staging";
      expect(isStaging()).toBe(true);
    });

    test('LR="local"이면 NODE_ENV="staging"이어도 false를 반환한다', () => {
      process.env.LR = "local";
      process.env.NODE_ENV = "staging";
      expect(isStaging()).toBe(false);
    });

    test('LR="remote"이지만 NODE_ENV가 다르면 false를 반환한다', () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "production";
      expect(isStaging()).toBe(false);
    });

    test("환경변수가 없을 때 false를 반환한다", () => {
      delete process.env.LR;
      delete process.env.NODE_ENV;
      expect(isStaging()).toBe(false);
    });
  });

  describe("isProduction: 프로덕션 환경 감지", () => {
    test('LR="remote" + NODE_ENV="production"일 때 true를 반환한다', () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "production";
      expect(isProduction()).toBe(true);
    });

    test('LR="local"이면 NODE_ENV="production"이어도 false를 반환한다', () => {
      process.env.LR = "local";
      process.env.NODE_ENV = "production";
      expect(isProduction()).toBe(false);
    });

    test('LR="remote"이지만 NODE_ENV가 다르면 false를 반환한다', () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "development";
      expect(isProduction()).toBe(false);
    });

    test("환경변수가 없을 때 false를 반환한다", () => {
      delete process.env.LR;
      delete process.env.NODE_ENV;
      expect(isProduction()).toBe(false);
    });
  });

  describe("isTest: 테스트 환경 감지", () => {
    test('LR이 없고 NODE_ENV="test"일 때 true를 반환한다', () => {
      delete process.env.LR;
      process.env.NODE_ENV = "test";
      expect(isTest()).toBe(true);
    });

    test('LR="local" + NODE_ENV="test"일 때 true를 반환한다', () => {
      process.env.LR = "local";
      process.env.NODE_ENV = "test";
      expect(isTest()).toBe(true);
    });

    test('LR="remote"이면 NODE_ENV="test"이어도 false를 반환한다', () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "test";
      expect(isTest()).toBe(false);
    });

    test("isLocal()이지만 NODE_ENV가 다르면 false를 반환한다", () => {
      delete process.env.LR;
      process.env.NODE_ENV = "development";
      expect(isTest()).toBe(false);
    });
  });

  describe("실제 사용 시나리오", () => {
    test("로컬 개발 환경 시뮬레이션", () => {
      delete process.env.LR;
      process.env.NODE_ENV = "development";

      expect(isLocal()).toBe(true);
      expect(isRemote()).toBe(false);
      expect(isInDocker()).toBe(false);
      expect(isDevelopment()).toBe(false); // isRemote()가 false이므로
      expect(isTest()).toBe(false);
    });

    test("로컬 테스트 환경 시뮬레이션", () => {
      delete process.env.LR;
      process.env.NODE_ENV = "test";

      expect(isLocal()).toBe(true);
      expect(isRemote()).toBe(false);
      expect(isTest()).toBe(true);
    });

    test("원격 개발 서버 시뮬레이션", () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "development";

      expect(isLocal()).toBe(false);
      expect(isRemote()).toBe(true);
      expect(isInDocker()).toBe(true);
      expect(isDevelopment()).toBe(true);
      expect(isStaging()).toBe(false);
      expect(isProduction()).toBe(false);
    });

    test("스테이징 서버 시뮬레이션", () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "staging";

      expect(isLocal()).toBe(false);
      expect(isRemote()).toBe(true);
      expect(isInDocker()).toBe(true);
      expect(isDevelopment()).toBe(false);
      expect(isStaging()).toBe(true);
      expect(isProduction()).toBe(false);
    });

    test("프로덕션 서버 시뮬레이션", () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "production";

      expect(isLocal()).toBe(false);
      expect(isRemote()).toBe(true);
      expect(isInDocker()).toBe(true);
      expect(isDevelopment()).toBe(false);
      expect(isStaging()).toBe(false);
      expect(isProduction()).toBe(true);
    });

    test("데몬 서버 시뮬레이션", () => {
      process.env.LR = "remote";
      process.env.NODE_ENV = "production";
      process.env.NODE_TYPE = "daemon";

      expect(isRemote()).toBe(true);
      expect(isProduction()).toBe(true);
      expect(isDaemonServer()).toBe(true);
    });
  });
});

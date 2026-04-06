import { describe, expect, test } from "vitest";

import { runtimePath } from "../../../../../modules/sonamu/dist/utils/path-utils";

describe("path-utils", () => {
  describe("runtimePath", () => {
    test.each([
      // 개발 모드: dist → src 변환
      {
        input: "dist/app/user.js",
        isDev: true,
        expected: "src/app/user.ts",
        description: "개발 모드에서 dist → src 변환",
      },
      {
        input: "/api/dist/user.js",
        isDev: true,
        expected: "/api/src/user.ts",
        description: "개발 모드에서 절대 경로 dist → src 변환",
      },

      // 배포 모드: src → dist 변환
      {
        input: "src/app/user.ts",
        isDev: false,
        expected: "dist/app/user.js",
        description: "배포 모드에서 src → dist 변환",
      },
      {
        input: "/api/src/user.ts",
        isDev: false,
        expected: "/api/dist/user.js",
        description: "배포 모드에서 절대 경로 src → dist 변환",
      },

      // 쿼리 파라미터 유지
      {
        input: "dist/user.js?hot=123",
        isDev: true,
        expected: "src/user.ts?hot=123",
        description: "개발 모드에서 쿼리 파라미터 유지",
      },
      {
        input: "src/user.ts?hot=123",
        isDev: false,
        expected: "dist/user.js?hot=123",
        description: "배포 모드에서 쿼리 파라미터 유지",
      },

      // 그 외 케이스
      {
        input: "src/dist/helper.ts",
        isDev: false,
        expected: "dist/dist/helper.js",
        description: "중첩된 경로에서 첫 번째만 변환",
      },
      {
        input: "sonamu.config.ts",
        isDev: false,
        expected: "sonamu.config.js",
        description: "특수 파일 확장자 변환",
      },
    ])("$description", ({ input, isDev, expected }) => {
      expect(runtimePath(input, isDev)).toBe(expected);
    });
  });
});

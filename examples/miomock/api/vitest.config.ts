import { NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

const maxWorkers = 6;

export default defineConfig({
  plugins: [],
  test: {
    exclude: ["**/node_modules/**", "**/.yarn/**", "**/dist/**"],
    globals: true,
    setupFiles: ["./src/testing/setup-mocks.ts"],
    reporters: ["default", NaiteVitestReporter],
    restoreMocks: true,
    typecheck: {
      enabled: true,
      tsconfig: "./tsconfig.json",
      include: ["src/**/*type-safety.test.ts"],
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/testing/**", "**/node_modules/**", "**/dist/**"],
    },
    includeTaskLocation: true,
    // 단일 프로젝트로 모든 테스트를 병렬 실행합니다.
    // forTesting: false는 테스트 파일 내 bootstrap 옵션으로 처리됩니다.
    // migrator 테스트의 runShadowTest()는 병렬 모드에서 DB.destroy()를 스킵하여
    // worker DB 연결을 유지합니다.
    projects: [
      {
        extends: true,
        test: {
          name: "parallel",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.test-hold.ts", "**/node_modules/**"],
          pool: "forks",
          maxWorkers,
          isolate: false, // worker 재사용 → 초기화 오버헤드 감소
          globalSetup: ["./src/testing/global.ts"],
          env: {
            SONAMU_PARALLEL_TEST: "true",
          },
        },
      },
    ],
  },
});

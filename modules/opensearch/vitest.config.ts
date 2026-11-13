import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// examples/ imports by the package name the docs copy (@sonamu-kit/opensearch). A self-import resolves to dist through
// exports, so each entry point is aliased to src for tests (same as the paths in tsconfig.test.json).
const SOURCE_ENTRIES = ["postgres", "sonamu", "admin", "testing"] as const;
const entryAliases = [
  ...SOURCE_ENTRIES.map((entry) => ({
    find: `@sonamu-kit/opensearch/${entry}`,
    replacement: fileURLToPath(new URL(`./src/${entry}/index.ts`, import.meta.url)),
  })),
  {
    find: /^@sonamu-kit\/opensearch$/,
    replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
  },
];

export default defineConfig({
  resolve: { alias: entryAliases },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    // teardownTimeout is root-only; projects cannot set it.
    teardownTimeout: 120_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          // Only tests that run without containers or network.
          include: ["tests/unit/**/*.test.ts"],
          // vitest 5 does not pass --typecheck* CLI options to inline projects, so it is enabled here; test:type runs
          // only the type tests with a path filter.
          typecheck: {
            enabled: true,
            include: ["tests/types/**/*.test-d.ts"],
            tsconfig: "./tsconfig.test.json",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          // Starts one PostgreSQL and one OpenSearch container per run and provides their connection details.
          globalSetup: ["tests/global-setup.ts"],
          // Files run sequentially because they share those containers.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: "sonamu",
          include: ["tests/sonamu/**/*.test.ts"],
          // The same globalSetup starts only PostgreSQL for this project.
          globalSetup: ["tests/global-setup.ts"],
          // Sonamu in test mode creates a one-connection pool that blocks catalog lookups, so it runs as development.
          env: { NODE_ENV: "development" },
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});

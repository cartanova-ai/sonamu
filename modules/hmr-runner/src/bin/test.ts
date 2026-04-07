import { assert } from "@japa/assert";
import { fileSystem } from "@japa/file-system";
import { configure, processCLIArgs, run } from "@japa/runner";
import { snapshot } from "@japa/snapshot";
import { join } from "desm";

processCLIArgs(process.argv.splice(2));
configure({
  files: ["tests/**/*.spec.ts"],
  plugins: [
    assert(),
    fileSystem({ basePath: join(import.meta.url, "../../tmp"), autoClean: true }),
    snapshot(),
  ],
});

run();

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

import ts from "@typescript/typescript6";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const requireFromHere = createRequire(import.meta.url);
const configPath = path.resolve("tsconfig.json");
const parsedConfig = ts.parseConfigFileTextToJson(configPath, await readFile(configPath, "utf8"));
if (parsedConfig.error) {
  throw new Error(ts.flattenDiagnosticMessageText(parsedConfig.error.messageText, "\n"));
}
const configResult = z
  .object({ references: z.array(z.object({ path: z.string() })).optional() })
  .safeParse(parsedConfig.config);
if (!configResult.success) {
  throw new Error("tsconfig.json의 project references를 읽을 수 없습니다.", {
    cause: configResult.error,
  });
}
const config = configResult.data;
const references = config.references ?? [];

if (references.length === 0) {
  throw new Error("tsconfig.json에 typecheck할 project reference가 없습니다.");
}

const tscPath = path.join(
  path.dirname(requireFromHere.resolve("typescript/package.json")),
  "bin/tsc",
);
for (const reference of references) {
  // Web 앱은 선언을 배포하지 않으므로 참조별 타입 검사에서 선언 직렬화만 비활성화합니다.
  await execFileAsync(
    process.execPath,
    [
      tscPath,
      "--noEmit",
      "--composite",
      "false",
      "--declaration",
      "false",
      "--declarationMap",
      "false",
      "--emitDeclarationOnly",
      "false",
      "-p",
      path.resolve(reference.path),
    ],
    { cwd: process.cwd() },
  );
}

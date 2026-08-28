import { createHash } from "node:crypto";
// 테스트 환경에서는 fs/promises가 mock되지만, 아래 runOxlint이 isTest 가드로 안 도니까
// 그냥 fs/promises 그대로 사용. (production에서만 임시파일 흐름이 돕니다.)
import { constants } from "node:fs";
import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path, { dirname, join } from "node:path";

import { format, type FormatConfig } from "oxfmt";
import { z } from "zod";

import { cached } from "./async-utils";
import { isTest } from "./controller";
import { execute } from "./process-utils";
import { isNumberValue } from "./runtime-value";

const requireFromHere = createRequire(import.meta.url);

export type ResolveOxlintBinOptions = {
  resolveModule: (specifier: string) => string;
  readFile: (filePath: string) => Promise<string>;
  access: (filePath: string, mode: number) => Promise<void>;
};

const OxlintStringBinManifestSchema = z.object({ bin: z.string().trim().min(1) });
const OxlintNamedBinManifestSchema = z.object({
  bin: z.object({ oxlint: z.string().trim().min(1) }),
});

/**
 * 코드를 프로젝트의 oxfmt + oxlint 설정에 맞춰 포매팅한 문자열을 반환합니다.
 *
 * 캐싱도 있어요 ㅎㅎ 똑같은 입력에 대해서 캐시 커버됩니다.
 * 수명은 프로세스 죽을때까지 ㅋ
 */
export const formatCode = cached(formatCodeInternal, (code, filePath) => {
  const ext = filePath.endsWith(".tsx") ? "tsx" : filePath.endsWith(".json") ? "json" : "ts";
  return `${ext}:${createHash("sha1").update(code).digest("hex")}`;
});

/**
 * 캐시 없는 포맷함수 엔트리.
 */
async function formatCodeInternal(code: string, filePath: string): Promise<string> {
  // json은 포맷만 하면 됩니다.
  if (filePath.endsWith(".json")) {
    return runOxfmt(code, filePath);
  }

  // 린트 먼저 한 다음에 포맷으로 마무리해요.
  return runOxfmt(await runOxlint(code), filePath);
}

/**
 * 프로젝트 설정을 찾아서 이에 맞춰서 코드를 포맷합니다.
 */
async function runOxfmt(code: string, filePath: string): Promise<string> {
  const result = await format(path.basename(filePath), code, await loadOxfmtConfig());

  const errors = result.errors.filter((e) => e.severity === "Error");
  if (errors.length > 0) {
    if (!isTest()) {
      console.error(`oxfmt errors (${filePath}):`);
      for (const err of errors) {
        const label = err.labels[0];
        if (label) {
          const before = code.slice(Math.max(0, label.start - 80), label.start);
          const at = code.slice(label.start, label.end);
          const after = code.slice(label.end, Math.min(code.length, label.end + 80));
          console.error(`  - ${err.message} (offset ${label.start}-${label.end})`);
          console.error(`    around: ...${before}»${at}«${after}...`);
        } else {
          console.error(`  - ${err.message}`);
        }
      }
    }
    return code;
  }
  return result.code;
}

let cachedOxfmtConfig: FormatConfig | null = null;
async function loadOxfmtConfig(): Promise<FormatConfig> {
  if (cachedOxfmtConfig !== null) {
    return cachedOxfmtConfig;
  }

  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, ".oxfmtrc.json");
    try {
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      cachedOxfmtConfig = JSON.parse(await readFile(candidate, "utf-8")) as FormatConfig;
      return cachedOxfmtConfig;
    } catch (e) {
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        !isTest() && console.error(`Failed to load ${candidate}:`, e);
        break;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  cachedOxfmtConfig = {};
  return cachedOxfmtConfig;
}

/**
 * 프로젝트 설정에 맞춰 코드를 lint합니다.
 *
 * 프로젝트 설정을 적용받는 oxlint cli를 찾아 띄워서,
 * 임시 파일에 in-place로 써서 그 결과를 빼오는 방식으로 작동합니다.
 * 왜 이렇게 하느냐? oxlint가 node api도 안 주고 cli에서 stdin 옵션도 안 주기 때문...
 */
async function runOxlint(code: string): Promise<string> {
  if (isTest()) {
    // 테스트 환경에서는 느려지기만 하고 검증할 가치도 없어서 안 합니다.
    // GitHub Actions 환경에서 lint가 오래 걸려서 뻗기도 했어요. (https://github.com/cartanova-ai/sonamu/actions/runs/25267214027/job/74083630169)
    return code;
  }

  const tmpFile = join(
    // 타겟 파일이 루트 아래에 있어야 해요. 그래서 tmp 디렉토리같은거 안 씁니다!
    process.cwd(),
    `.sonamu-fmt-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
  );

  try {
    await writeFile(tmpFile, code, "utf-8");

    try {
      await execute(
        await resolveOxlintBin(),
        ["--fix", "--fix-suggestions", "--type-aware", tmpFile],
        {
          timeout: 10000,
        },
      );
    } catch (e) {
      // lint 위반 시 exit code != 0이지만 --fix는 적용됨. exec 자체 실패만 throw.
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      if (!isNumberValue((e as Error & { code?: number }).code)) {
        throw e;
      }
    }

    return await readFile(tmpFile, "utf-8");
  } finally {
    try {
      await unlink(tmpFile);
    } catch {
      // 삭제 실패해도 어차피 ignore됨.
    }
  }
}

export async function resolveOxlintBin(
  options: ResolveOxlintBinOptions = {
    resolveModule: (specifier) => requireFromHere.resolve(specifier),
    readFile: (filePath) => readFile(filePath, "utf-8"),
    access: (filePath, mode) => access(filePath, mode),
  },
): Promise<string> {
  let manifestPath: string;
  try {
    manifestPath = options.resolveModule("oxlint/package.json");
  } catch {
    throw createOxlintBinResolutionError(
      "oxlint package.json을 찾을 수 없습니다. oxlint 의존성을 설치한 뒤 다시 시도해 주세요.",
    );
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(await options.readFile(manifestPath));
  } catch {
    throw createOxlintBinResolutionError(
      "oxlint package.json을 읽거나 해석할 수 없습니다. 패키지를 다시 설치한 뒤 시도해 주세요.",
    );
  }

  // npm의 bin은 단일 실행 파일 문자열과 명령 이름별 객체를 모두 허용합니다.
  const stringBinManifest = OxlintStringBinManifestSchema.safeParse(manifest);
  const namedBinManifest = OxlintNamedBinManifestSchema.safeParse(manifest);
  let bin: string | null = null;
  if (stringBinManifest.success) {
    bin = stringBinManifest.data.bin;
  } else if (namedBinManifest.success) {
    bin = namedBinManifest.data.bin.oxlint;
  }
  if (bin === null) {
    throw createOxlintBinResolutionError(
      "oxlint package.json의 bin 필드가 없거나 올바르지 않습니다. 호환되는 oxlint 패키지를 설치해 주세요.",
    );
  }

  const binPath = path.resolve(dirname(manifestPath), bin);
  try {
    await options.access(binPath, constants.F_OK | constants.X_OK);
  } catch {
    throw createOxlintBinResolutionError(
      "oxlint package.json의 bin 실행 파일이 없거나 실행할 수 없습니다. 패키지를 다시 설치해 주세요.",
    );
  }

  return binPath;
}
function createOxlintBinResolutionError(message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code: "OXLINT_BIN_RESOLUTION_FAILED" });
}

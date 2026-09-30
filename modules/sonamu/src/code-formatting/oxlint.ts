// 테스트 환경에서는 fs/promises가 mock되지만, 아래 runOxlint이 isTest 가드로 안 도니까
// 그냥 fs/promises 그대로 사용. (production에서만 임시파일 흐름이 돕니다.)
import { constants } from "node:fs";
import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path, { dirname, join } from "node:path";

import { z } from "zod";

import { isTest } from "../utils/controller";
import { execute } from "../utils/process-utils";
import { isNumberValue } from "../utils/runtime-value";

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

type OxlintRequest = {
  tmpFile: string;
  resolve: () => void;
  reject: (error: OxlintError) => void;
};

type OxlintError = Error & { code?: string | number | null };

const oxlintQueue: OxlintRequest[] = [];
let isOxlintRunning = false;

/**
 * 프로젝트 설정에 맞춰 코드를 lint합니다.
 *
 * 프로젝트 설정을 적용받는 oxlint cli를 찾아 띄워서,
 * 임시 파일에 in-place로 써서 그 결과를 빼오는 방식으로 작동합니다.
 * 왜 이렇게 하느냐? oxlint가 node api도 안 주고 cli에서 stdin 옵션도 안 주기 때문...
 *
 * 그런데 이 친구는 호출할 때마다 무지성으로 oxlint cli를 돌리지는 않습니다.
 * 그런 식으로 했다가는 oxlint 프로세스만 동시에 수십 개가 떠 있게 될 수도 있어요.
 * 그러다가 sync에서 파일 생성이 10초도 넘게 걸리는 일도 있었습니다.
 * 이를 막기 위해, oxlint가 돌아가고 있을 때에 새 runOxlint 호출이 들어오면 내부에서 알아서 잘 쟁여놨다가 실행 끝나면 배치로 굴립니다.
 * 한 번에 오직 하나의 oxlint cli 실행만 돌아가게 하는 겁니다.
 *
 * 자세한 배칭 전략:
 * - 아무 것도 없을 때에 호출되면 바로 oxlint 실행합니다.
 * - oxlint 실행 중에 들어오면 큐에 쟁여둡니다.
 * - oxlint 실행 완료 시점에서 큐에 뭐가 있으면 그걸로 다음 배치 바로 실행합니다.
 *
 * 그래서 띄엄띄엄 하나씩 들어오면 그냥 순차 실행과 다름이 없고, 여러개 우루루 들어오면 그때 효용이 생깁니다.
 * 다만 동시에 30개가 한번에 들어온다고 30개가 모두 한 배치를 타지는 않고,
 * idle에서의 첫 요청에 즉시 배치를 시작하므로 최소 2배치가 소요된다는 점 주의염.
 */
export async function runOxlint(code: string): Promise<string> {
  if (isTest()) {
    // 테스트 환경에서는 느려지기만 하고 검증할 가치도 없어서 안 합니다.
    // GitHub Actions 환경에서 lint가 오래 걸려서 뻗기도 했어요. (https://github.com/cartanova-ai/sonamu/actions/runs/25267214027/job/74083630169)
    return code;
  }

  const tmpFile = join(
    // 타겟 파일이 루트 아래에 있어야 해요. 그래서 tmp 디렉토리같은거 안 씁니다!
    process.cwd(),
    `.sonamu-oxlint-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
  );

  try {
    await writeFile(tmpFile, code, "utf-8");
    await enqueueOxlint(tmpFile);
    return await readFile(tmpFile, "utf-8");
  } finally {
    try {
      await unlink(tmpFile);
    } catch {
      // 삭제 실패해도 어차피 ignore됨.
    }
  }
}

function enqueueOxlint(tmpFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    oxlintQueue.push({ tmpFile, resolve, reject });
    if (!isOxlintRunning) {
      void flushOxlintQueue();
    }
  });
}

async function flushOxlintQueue(): Promise<void> {
  if (isOxlintRunning || oxlintQueue.length === 0) {
    return;
  }

  isOxlintRunning = true;
  // 실행을 시작할 때까지 준비된 파일만 묶어 다음 요청은 후속 배치로 넘깁니다.
  const batch = oxlintQueue.splice(0);

  try {
    try {
      await execute(
        await resolveOxlintBin(),
        ["--fix", "--fix-suggestions", "--type-aware", ...batch.map(({ tmpFile }) => tmpFile)],
        {
          timeout: 10000,
        },
      );
    } catch (e) {
      // lint 위반 시 exit code != 0이지만 --fix는 적용됨. exec 자체 실패만 배치 전체에 전달합니다.
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      const error = e as OxlintError;
      if (!isNumberValue(error.code)) {
        batch.forEach(({ reject }) => reject(error));
        return;
      }
    }

    batch.forEach(({ resolve }) => resolve());
  } finally {
    isOxlintRunning = false;
    if (oxlintQueue.length > 0) {
      void flushOxlintQueue();
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

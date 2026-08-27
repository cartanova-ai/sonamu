import { strict as assert } from "assert";
import { type Stats } from "node:fs";
import path from "path";

import chalk from "chalk";
import { type FSWatcher, watch } from "chokidar";
import { minimatch } from "minimatch";

import { Sonamu } from "../api";
import { type AbsolutePath } from "../utils/path-utils";
import { createFileEventBatcher } from "./event-batcher";
import { getChecksumPatternGroupInAbsolutePath } from "./file-patterns";
import { isLastChangedByMe } from "./file-tracking";

/**
 * Watcher를 설정합니다.
 * 이 친구는 진짜로 syncer가 받아야 할 변경 이벤트들만 추려서 batch로 전달해줍니다.
 */
export async function setupWatcher(
  onFileEvents: (fileEvents: Map<AbsolutePath, "change" | "add">) => Promise<void>,
): Promise<FSWatcher> {
  // api 본인뿐 아니라 sync target들의 src도 봅니다.
  // target 산출물(sonamu.generated, services.generated, i18n copy 등)이 외부에서
  // 변경되는 경우를 drift로 잡아 워닝을 띄우기 위함입니다.
  const watcher = watch(apiAndTargetsSrcPaths(), {
    ignored: ignoreIfExtensionIsNotOneOf(".ts", ".json", ".http"),
    persistent: true,
    ignoreInitial: true,
  });

  // 100ms 안에 들어온 변경들을 한 batch로 모아 한 사이클로 처리합니다.
  const pushFileEvent = createFileEventBatcher<"change" | "add">({
    delayMs: 100,
    onFlush: async (fileEvents) => {
      const realChanges = new Map<AbsolutePath, "change" | "add">();
      for (const [p, e] of fileEvents) {
        // self-write echo는 flush 시점에 거릅니다.
        // watcher.on에서 즉시 거르면 너무 이릅니다.
        // 여기에서는 파일이 디스크에 쓰이고 나서 약간의 딜레이가 있기 때문에
        // "디스크에 썼지만 아직 trackWritten이 완료되기 전 상태" 같은 문제가 사라집니다.
        if (!(await isLastChangedByMe(p))) {
          realChanges.set(p, e);
        }
      }
      if (realChanges.size > 0) {
        await onFileEvents(realChanges);
      }
    },
  });

  watcher.on("all", (event: string, filePath: string) => {
    const absolutePath =
      /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ filePath as AbsolutePath;
    assert(
      absolutePath.startsWith(Sonamu.appRootPath),
      "File path is not within the app root path",
    );

    if (!isWantedEvent(event)) {
      return;
    }

    if (isConfigChange(absolutePath)) {
      triggerSelfRestart(event, filePath);
      return;
    }

    if (isOutOfScope(absolutePath)) {
      return;
    }

    // 여기까지 왔다면 syncer가 진짜로 처리해야 할 변경사항이라고 보면 됩니다.
    // 이 호출은 이벤트를 batcher에 쌓습니다.
    // 이후 때가 되면 이렇게 쌓인 이벤트를 들고 onFileEvents 콜백이 호출됩니다.
    pushFileEvent(absolutePath, event);
  });

  return watcher;
}

function apiAndTargetsSrcPaths() {
  return [
    path.join(Sonamu.apiRootPath, "src"),
    ...Sonamu.config.sync.targets.map((t) => path.join(Sonamu.appRootPath, t, "src")),
  ];
}

/**
 * chokidar의 `ignored` 옵션에 박는 헬퍼.
 * 주어진 확장자가 *아닌* 파일은 무시합니다 — 즉 주어진 확장자만 watch 대상.
 *
 * chokidar `ignored`는 `true`를 반환하면 해당 경로를 무시합니다.
 * 따라서 "이 확장자만 허용"을 표현하려면 *다른 확장자에 대해 true*를 반환해야 합니다.
 */
function ignoreIfExtensionIsNotOneOf(...allowedExtensions: `.${string}`[]) {
  const isAllowed = (ext: string) =>
    /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
      allowedExtensions as string[]
    ).includes(ext);

  return (p: string, stats?: Stats) => !!stats?.isFile() && !isAllowed(path.extname(p));
}

function isWantedEvent(event: string): event is "change" | "add" {
  return event === "change" || event === "add";
}

function isConfigChange(filePath: AbsolutePath): boolean {
  return filePath === path.join(Sonamu.apiRootPath, "src", "sonamu.config.ts");
}

function triggerSelfRestart(event: string, filePath: string): void {
  const relativePath = filePath.replace(Sonamu.apiRootPath, "api");
  console.log(chalk.bold(`Detected(${event}): ${chalk.blue(relativePath)} - Restarting...`));
  process.kill(process.pid, "SIGUSR2");
}

/**
 * 스코프 정의:
 * - api/src 안의 모든 변경은 스코프 안 (HMR 대상이 될 수 있으므로)
 * - api/src 밖이라면 checksumPatternGroup 패턴에 매칭되는 경로만 스코프 안
 *
 * 그 외(예: web/src/App.tsx 같은 target의 비추적 파일)는 스코프 밖이라 무시합니다.
 */
function isOutOfScope(filePath: AbsolutePath): boolean {
  const apiSrc = path.join(Sonamu.apiRootPath, "src");
  if (filePath.startsWith(apiSrc)) {
    return false;
  }
  const checkPatternGroup = getChecksumPatternGroupInAbsolutePath();
  return !Object.values(checkPatternGroup).some((pattern) => minimatch(filePath, pattern));
}

/// <reference types="node" />

/**
 * 여러 파일을 하드링크하는 공통 스크립트
 *
 * 하드링크를 사용하면:
 * - 빌드 사이에 파일 수정이 즉시 동기화됨
 * - 에디터가 링크를 풀어도 다음 빌드 때 복구됨
 * - 복사보다 빠름 (파일 내용을 읽지 않음)
 *
 * 새로운 파일을 하드링크하려면 hardlinkConfigs 배열에 추가하세요.
 */

import { existsSync, linkSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(currentDir, "..");

const hardlinkConfigs = [
  {
    name: "rc-keys",
    source: join(rootDir, "modules/react-components/src/i18n/rc-keys.ts"),
    targets: [
      join(rootDir, "modules/sonamu/src/dict/rc-keys.ts"),
      join(rootDir, "modules/sonamu/ui-web/src/i18n/rc-keys.ts"),
    ],
  },
  // 나중에 추가할 다른 파일들
];

console.log("Hard-linking files...");

for (const config of hardlinkConfigs) {
  console.log(`\n${config.name}:`);

  for (const target of config.targets) {
    try {
      // 디렉토리가 없으면 생성
      mkdirSync(dirname(target), { recursive: true });

      // 기존 파일 삭제 (하드링크가 끊어졌을 수 있으므로)
      if (existsSync(target)) {
        rmSync(target);
      }

      // 하드링크 생성
      linkSync(config.source, target);
      console.log(`  ✓ ${target}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Failed to link to ${target}:`, message);
      process.exit(1);
    }
  }
}

console.log("\n✅ All files hard-linked successfully!");

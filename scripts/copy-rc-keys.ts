/**
 * react-components의 rc-keys.ts를 sonamu 패키지들로 복사하는 스크립트
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const sourceFile = join(rootDir, "modules/react-components/src/i18n/rc-keys.ts");

const targets = [
  join(rootDir, "modules/sonamu/src/dict/rc-keys.ts"),
  join(rootDir, "modules/sonamu/ui-web/src/i18n/rc-keys.ts"),
];

console.log("Copying rc-keys.ts to Sonamu packages...");

for (const target of targets) {
  try {
    // 디렉토리가 없으면 생성
    mkdirSync(dirname(target), { recursive: true });

    // 파일 복사
    copyFileSync(sourceFile, target);
    console.log(`  ✓ ${target}`);
  } catch (error) {
    console.error(`  ✗ Failed to copy to ${target}:`, (error as Error).message);
    process.exit(1);
  }
}

console.log("✅ rc-keys.ts copied successfully!");

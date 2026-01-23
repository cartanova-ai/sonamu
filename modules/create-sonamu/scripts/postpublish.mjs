#!/usr/bin/env zx
import "zx/globals";

/**
 * postpublish 스크립트
 *
 * npm 배포 후 prepublish에서 백업한 원본 template 파일을 복원합니다.
 */

const templateFiles = [
  "./template/src/packages/api/package.json",
  "./template/src/packages/web/package.json",
];

console.log("📁 Restoring template files from backup...");

for (const file of templateFiles) {
  const backupFile = `${file}.bak`;

  if (await fs.exists(backupFile)) {
    await fs.move(backupFile, file, { overwrite: true });
    console.log(`  ✅ ${backupFile} → ${file}`);
  } else {
    console.warn(`  ⚠️  Backup not found: ${backupFile}`);
  }
}

console.log("\n✅ Template files restored");

#!/usr/bin/env zx
import "zx/globals";

/**
 * postpublish 스크립트
 *
 * npm 배포 후 prepublish에서 백업한 원본 template 파일을 복원합니다.
 */

const packageRoot = path.resolve(__dirname, "..");
const templateRoot = path.resolve(packageRoot, "template");
const backupRoot = path.resolve(packageRoot, ".publish-backups");
const templateFiles = [
  path.join(templateRoot, "src", "packages", "api", "package.json"),
  path.join(templateRoot, "src", "packages", "web", "package.json"),
];

// 템플릿 외부 경로의 백업을 복원하지 않도록 제한합니다.
function getBackupFile(file) {
  const relativePath = path.relative(templateRoot, file);
  if (path.isAbsolute(relativePath) || relativePath.startsWith("..")) {
    throw new Error(`Template file is outside template root: ${file}`);
  }
  return path.join(backupRoot, relativePath);
}

console.log("📁 Restoring template files from backup...");

for (const file of templateFiles) {
  const backupFile = getBackupFile(file);

  if (await fs.exists(backupFile)) {
    await fs.move(backupFile, file, { overwrite: true });
    console.log(`  ✅ ${backupFile} → ${file}`);
  } else {
    console.warn(`  ⚠️  Backup not found: ${backupFile}`);
  }
}

await fs.remove(backupRoot);

// catalog.json 삭제
const catalogJsonPath = path.join(packageRoot, "catalog.json");
if (await fs.exists(catalogJsonPath)) {
  await fs.remove(catalogJsonPath);
  console.log("  ✅ catalog.json removed");
}

console.log("\n✅ Template files restored");

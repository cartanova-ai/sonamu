#!/usr/bin/env zx
import "zx/globals";

/**
 * prepublish 스크립트
 *
 * npm 배포 전에 template 파일의 workspace:^와 catalog:를 실제 버전으로 치환합니다.
 * 치환 전 원본 파일은 전용 디렉터리에 백업되며, postpublish.mjs에서 복원됩니다.
 */

const packageRoot = path.resolve(__dirname, "..");
const templateRoot = path.resolve(packageRoot, "template");
const backupRoot = path.resolve(packageRoot, ".publish-backups");
const templateFiles = [
  path.join(templateRoot, "src", "packages", "api", "package.json"),
  path.join(templateRoot, "src", "packages", "web", "package.json"),
];

// 템플릿 외부 경로가 백업 디렉터리에 기록되지 않도록 제한합니다.
function getBackupFile(file) {
  const relativePath = path.relative(templateRoot, file);
  if (path.isAbsolute(relativePath) || relativePath.startsWith("..")) {
    throw new Error(`Template file is outside template root: ${file}`);
  }
  return path.join(backupRoot, relativePath);
}

// sonamu repo 루트 경로 (create-sonamu 기준 ../../)
const repoRoot = path.join(packageRoot, "..", "..");

// 1. sonamu 패키지 버전 읽기
const sonamuPkgPath = path.join(repoRoot, "modules/sonamu/package.json");
const cliPkgPath = path.join(repoRoot, "modules/cli/package.json");
const reactComponentsPkgPath = path.join(repoRoot, "modules/react-components/package.json");
const workspaceYamlPath = path.join(repoRoot, "pnpm-workspace.yaml");

for (const packagePath of [sonamuPkgPath, cliPkgPath, reactComponentsPkgPath]) {
  if (!(await fs.exists(packagePath))) {
    console.error(`❌ ${packagePath} not found. Are you in the sonamu monorepo?`);
    process.exit(1);
  }
}

const sonamuPkg = JSON.parse(await fs.readFile(sonamuPkgPath, "utf-8"));
const cliPkg = JSON.parse(await fs.readFile(cliPkgPath, "utf-8"));
const reactComponentsPkg = JSON.parse(await fs.readFile(reactComponentsPkgPath, "utf-8"));
const workspaceYaml = await fs.readFile(workspaceYamlPath, "utf-8");

console.log(`📦 sonamu version: ${sonamuPkg.version}`);
console.log(`📦 @sonamu-kit/cli version: ${cliPkg.version}`);
console.log(`📦 @sonamu-kit/react-components version: ${reactComponentsPkg.version}`);

// 2. catalog 파싱
function parseCatalog(content) {
  const catalog = {};
  const lines = content.split("\n");
  let inCatalog = false;

  for (const line of lines) {
    if (line.trim() === "catalog:") {
      inCatalog = true;
      continue;
    }
    if (inCatalog) {
      if (line && !line.startsWith(" ") && !line.startsWith("\t")) break;
      const match = line.match(/^\s+["']?([^"':]+)["']?:\s*(.+)$/);
      if (match) {
        catalog[match[1].trim()] = match[2].trim();
      }
    }
  }
  return catalog;
}

const catalog = parseCatalog(workspaceYaml);
console.log(`📦 Loaded ${Object.keys(catalog).length} catalog entries`);

// 3. catalog.json 저장
console.log("\n📄 Writing catalog.json...");
await fs.writeFile(
  path.join(__dirname, "..", "catalog.json"),
  JSON.stringify(catalog, null, 2) + "\n",
);
console.log(`  ✅ catalog.json (${Object.keys(catalog).length} entries)`);

// 4. 백업
console.log("\n📁 Backing up template files...");
for (const file of templateFiles) {
  const backupFile = getBackupFile(file);
  await fs.ensureDir(path.dirname(backupFile));
  await fs.copy(file, backupFile);
  console.log(`  ✅ ${file} → ${backupFile}`);
}

// 5. 치환
console.log("\n🔄 Replacing workspace:^ and catalog: references...");
for (const file of templateFiles) {
  const pkg = JSON.parse(await fs.readFile(file, "utf-8"));
  let changes = 0;

  for (const depsKey of ["dependencies", "devDependencies"]) {
    const deps = pkg[depsKey];
    if (!deps) continue;

    for (const [name, version] of Object.entries(deps)) {
      if (version === "workspace:^") {
        if (name === "sonamu") {
          deps[name] = `^${sonamuPkg.version}`;
          changes++;
        } else if (name === "@sonamu-kit/cli") {
          deps[name] = `^${cliPkg.version}`;
          changes++;
        } else if (name === "@sonamu-kit/react-components") {
          deps[name] = `^${reactComponentsPkg.version}`;
          changes++;
        } else {
          console.error(`  ❌ Unknown workspace package: ${name} in ${file}`);
          console.error(
            `     Add a resolver for "${name}" in prepublish.mjs or remove the dependency from the template.`,
          );
          process.exit(1);
        }
      } else if (version === "catalog:") {
        const catalogVersion = catalog[name];
        if (catalogVersion) {
          deps[name] = catalogVersion;
          changes++;
        } else {
          console.warn(`  ⚠️  ${name} not found in catalog`);
        }
      }
    }
  }

  await fs.writeFile(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  ✅ ${file} (${changes} replacements)`);
}

// 6. 빌드
console.log("\n🔨 Building...");
await $`mise exec -- pnpm build`;

console.log("\n✅ prepublish completed");

import chalk from "chalk";
import { execSync, spawnSync } from "child_process";
import { existsSync, rmSync } from "fs";
import path, { resolve } from "path";
import { BUILD_DIR, SWC_BUILD_COMMAND, TSC_TYPE_CHECK_COMMAND } from "./build-config";

const scriptPath = resolve(import.meta.dirname, "cli.js");
const args = process.argv.slice(2);

function build() {
  // 출력 디렉토리를 제걱합니다.
  try {
    console.log(chalk.blue("Removing build directory..."));
    if (existsSync(BUILD_DIR)) {
      rmSync(BUILD_DIR, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(chalk.red("Remove build directory failed."), error);
    process.exit(1);
  }

  // .swcrc 파일을 지정합니다.
  let swcFilePath = ".swcrc";
  try {
    if (existsSync(swcFilePath)) {
      // 사용자 프로젝트에 .swcrc가 있으면 우선으로 사용합니다.
      console.log(chalk.blue("Using .swcrc from project root..."));
    } else {
      // 아니라면 sonamu 패키지 자체의 빌드에 사용하는 .swcrc를 가져다 씁니다.
      // note: 언젠가 sonamu의 빌드 설정과 사용자 프로젝트의 빌드 설정이 달라진다면
      // 프로젝트 빌드용 .swcrc 파일을 별도로 만들어 관리해야 하겠습니다만, 지금은 이렇게 갑니다.
      console.log(chalk.blue("Using default .swcrc from sonamu package..."));
      swcFilePath = path.join(import.meta.dirname, "..", "..", ".swcrc");
    }
  } catch (error) {
    console.error(chalk.red("Setting up swc config file failed."), error);
    process.exit(1);
  }

  // 소스 디렉토리를 빌드합니다.
  try {
    console.log(chalk.blue("Building with swc..."));
    execSync(SWC_BUILD_COMMAND(swcFilePath), { cwd: process.cwd(), stdio: "inherit" });
  } catch (error) {
    console.error(chalk.red("Build failed."), error);
    process.exit(1);
  }

  // sonamu.config.ts만 따로 빌드합니다.
  // 이 친구는 src에 들어있지 않기 때문에 SWC_BUILD_COMMAND로 빌드되지 않습니다.
  // 따라서 따로 빌드해줍니다.
  try {
    const configPath = resolve(process.cwd(), "sonamu.config.ts");
    if (existsSync(configPath)) {
      console.log(chalk.blue("Building sonamu.config.ts..."));
      execSync(`swc ${configPath} -o ${BUILD_DIR}/sonamu.config.js`, {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    }
  } catch (error) {
    console.error(chalk.red("Building sonamu.config.ts failed."), error);
    process.exit(1);
  }
}

function checkTypes() {
  try {
    console.log(chalk.blue("Checking types with tsc..."));
    execSync(TSC_TYPE_CHECK_COMMAND, {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  } catch (error) {
    console.error(chalk.red("Type check failed."), error);
    process.exit(1);
  }
}

if (args[0] === "build") {
  console.log(chalk.blue("Building the project..."));
  build();
  checkTypes();
  console.log(chalk.green("Build completed successfully."));
  process.exit(0);
}

if (args[0] === "dev:serve") {
  // build();
}

if (!existsSync(scriptPath)) {
  console.error(`Error: Script not found at ${scriptPath}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "@sonamu-kit/loader", // Sonamu UI도 syncer를 다루므로, ts 로드 능력이 필요합니다.
    "--enable-source-maps",
    "--no-warnings",
    scriptPath,
    ...args,
  ],
  {
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);

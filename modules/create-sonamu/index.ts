import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import minimist from "minimist";
import ora from "ora";
import prompts from "prompts";

// 생성된 파일/디렉토리 전역에서 추적하기 위한 변수
let createdTargetRoot: string | null = null;
let isCleaningUp = false;

type CliStringValue = string | string[] | undefined;

interface CreateSonamuArgs extends minimist.ParsedArgs {
  "container-name"?: CliStringValue;
  "db-name"?: CliStringValue;
  "db-password"?: CliStringValue;
  "db-user"?: CliStringValue;
  "docker-project"?: CliStringValue;
}

function parseJsonFile(contents: string, filePath: string) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Failed to parse JSON file: ${filePath}`, { cause: error });
  }
}

// Helper: catalog.json에서 catalog 파싱
function loadCatalogJson(): Record<string, string> {
  const catalogPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "catalog.json");
  if (!fs.existsSync(catalogPath)) return {};
  return parseJsonFile(fs.readFileSync(catalogPath, "utf-8"), catalogPath);
}

// CLI의 yes/no 문자열을 불리언 옵션으로 정규화한다.
function parseYesNo(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase();
  if (["y", "yes", "true", "1"].includes(lower)) return true;
  if (["n", "no", "false", "0"].includes(lower)) return false;
  return undefined;
}

// 템플릿 전용 제외 및 파일명 변환 규칙을 재귀 복사에 적용한다.
function copy(src: string, dest: string) {
  const stat = fs.statSync(src);
  const basename = path.basename(src);

  const excludeList = ["dist", ".git", ".gitkeep", "node_modules", "pnpm-lock.yaml"];
  if (excludeList.includes(basename)) {
    if (basename === ".gitkeep") {
      console.log(`${chalk.green("CREATE")} ${dest.split(".gitkeep")[0]}`);
    }
    return;
  }

  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const file of fs.readdirSync(src)) {
      copy(path.resolve(src, file), path.resolve(dest, file));
    }
    return;
  }

  let destPath = dest;
  if (basename === "gitignore") {
    destPath = path.join(path.dirname(dest), ".gitignore");
  }
  if (basename === "env" || basename.startsWith("env.")) {
    destPath = path.join(path.dirname(dest), `.${basename}`);
  }
  fs.copyFileSync(src, destPath);
  if (basename.endsWith(".sh")) {
    fs.chmodSync(destPath, 0o755);
  }
  console.log(`${chalk.green("CREATE")} ${destPath}`);
}

async function init() {
  // Graceful shutdown 핸들러 설정
  const shutdownHandler = () => {
    cleanup();
    process.exit(1);
  };

  process.on("SIGINT", shutdownHandler);
  process.on("SIGTERM", shutdownHandler);

  // CLI 인자 파싱
  const argv = minimist<CreateSonamuArgs>(process.argv.slice(2), {
    boolean: ["yes", "y", "skip-pnpm", "skip-docker"],
    string: [
      "db-user",
      "db-password",
      "db-name",
      "container-name",
      "docker-project",
      "pnpm",
      "docker",
    ],
    alias: {
      y: "yes",
      "docker-pj-name": "docker-project", // --docker-pj-name은 --docker-project의 alias
    },
  });

  // 첫 번째 인자를 프로젝트명으로 사용
  const argProjectName = argv._[0];
  const useDefaults = argv.yes || argv.y;

  let result: prompts.Answers<"targetDir">;

  try {
    // argProjectName이 있으면 프롬프트 스킵
    if (argProjectName) {
      result = { targetDir: argProjectName };
    } else {
      result = await prompts(
        [
          {
            type: "text",
            name: "targetDir",
            message: "Project name:",
            initial: "my_sonamu_app",
            validate: (value) => {
              if (!value) {
                return "Project name is required";
              }

              if (value.includes(" ")) {
                return "Project name cannot contain spaces";
              }

              if (value.includes("-")) {
                return "Project name cannot contain hyphens";
              }
              return true;
            },
          },
        ],
        {
          onCancel: createCancelHandler(),
        },
      );
    }
  } catch (e) {
    cleanup();
    console.error(e);
    process.exit(1);
  }

  const { targetDir } = result;

  // 현재 실행 경로(cwd) 하위에 생성 (절대경로 안받음)
  const targetRoot = path.join(process.cwd(), targetDir);

  // 프로젝트 디렉토리가 이미 존재하는지 확인
  if (fs.existsSync(targetRoot)) {
    let overwrite = useDefaults; // --yes 옵션이면 자동으로 overwrite

    if (!useDefaults) {
      const overwriteAnswer = await prompts(
        {
          type: "confirm",
          name: "overwrite",
          message: `Directory ${targetRoot} already exists. Overwrite?`,
          initial: true,
        },
        {
          onCancel: createCancelHandler(),
        },
      );
      overwrite = overwriteAnswer.overwrite;
    }

    if (!overwrite) {
      console.log(chalk.yellow("Operation cancelled."));
      process.exit(0);
    }

    // 기존 디렉토리 삭제
    console.log(chalk.yellow(`Removing existing directory: ${targetRoot}`));
    removeDirectory(targetRoot);
  }

  createdTargetRoot = targetRoot; // 생성된 디렉토리 추적 시작

  // 템플릿 경로 설정 (src 포함)
  const templateRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "template", "src");

  // 복사 시작 전에 타겟 프로젝트 폴더 생성
  if (!fs.existsSync(targetRoot)) {
    fs.mkdirSync(targetRoot, { recursive: true });
  }

  const write = (file: string) => {
    const src = path.join(templateRoot, file);
    const dest = path.join(targetRoot, file);
    copy(src, dest);
  };

  // 1. Copy all files except package.json
  const files = fs.readdirSync(templateRoot);
  for (const file of files.filter((f) => f !== "package.json")) {
    write(file);
  }

  // 2. Copy package.json and modify name
  ["packages/api", "packages/web"].forEach((dir) => {
    const pkgPath = path.join(templateRoot, dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = parseJsonFile(fs.readFileSync(pkgPath, "utf-8"), pkgPath);
      const pkgType = dir.split("/")[1];
      pkg.name = `${targetDir}-${pkgType}`;
      fs.writeFileSync(path.join(targetRoot, dir, "package.json"), JSON.stringify(pkg, null, 2));
    }
  });

  // 4. Copy root package.json and modify name
  const rootPkgPath = path.join(templateRoot, "package.json");
  if (fs.existsSync(rootPkgPath)) {
    const pkg = parseJsonFile(fs.readFileSync(rootPkgPath, "utf-8"), rootPkgPath);
    pkg.name = targetDir;
    fs.writeFileSync(path.join(targetRoot, "package.json"), JSON.stringify(pkg, null, 2));
    console.log(`${chalk.green("CREATE")} ${path.join(targetRoot, "package.json")}`);
  }

  // Load catalog from bundled catalog.json
  const parentCatalog = loadCatalogJson();

  // Build catalog for the new project
  const catalogEntries: string[] = [];
  for (const pkgName of Object.keys(parentCatalog).toSorted()) {
    catalogEntries.push(`  "${pkgName}": ${parentCatalog[pkgName]}`);
  }

  const workspaceContent = `packages:
  - packages/api
  - packages/web

catalog:
${catalogEntries.join("\n")}

allowBuilds:
  "@parcel/watcher": true
  bcrypt: true
  esbuild: true
  libpq: true
  sharp: true
  sodium-native: true
  unrs-resolver: true

overrides:
  axios@<0.30.0: ">=0.30.0"
  axios@<0.30.2: ">=0.30.2"
  axios@>=0.8.1 <0.28.0: ">=0.28.0"
  mdast-util-to-hast@>=13.0.0 <13.2.1: ">=13.2.1"
  prismjs@<1.30.0: ">=1.30.0"
  # pnpm 11에서 호환되는 serializer 패키지군을 유지하도록 seroval 버전을 고정합니다.
  seroval: 1.4.2
`;
  fs.writeFileSync(path.join(targetRoot, "pnpm-workspace.yaml"), workspaceContent);
  console.log(`${chalk.green("CREATE")} ${path.join(targetRoot, "pnpm-workspace.yaml")}`);

  console.log(`\n🌲 Created project in ${targetRoot}\n`);

  // 3. mise 도구와 의존성 설정
  let isPnpm = true; // 기본값
  const pnpmOption = parseYesNo(argv.pnpm);

  if (argv["skip-pnpm"] || pnpmOption === false) {
    // --skip-pnpm 또는 --pnpm n 옵션으로 스킵
    isPnpm = false;
  } else if (pnpmOption || useDefaults) {
    // --pnpm y 또는 --yes 옵션이면 자동 진행
    isPnpm = true;
  } else {
    // 옵션이 없으면 프롬프트로 물어봄
    const pnpmAnswer = await prompts(
      {
        type: "confirm",
        name: "isPnpm",
        message: "Would you like to install the mise toolchain and project dependencies?",
        initial: true,
      },
      {
        onCancel: createCancelHandler(),
      },
    );
    isPnpm = pnpmAnswer.isPnpm;
  }

  if (isPnpm) {
    try {
      // 생성된 프로젝트의 잠금된 도구만 사용해 의존성을 설치합니다.
      await setupPnpm(targetRoot);
    } catch (error) {
      cleanup();
      throw error;
    }
  } else {
    console.log(`\nTo install the mise toolchain and project dependencies, run:\n`);
    console.log(chalk.gray(`  $ cd ${targetRoot}`));
    console.log(chalk.gray(`  $ mise trust`));
    console.log(chalk.gray(`  $ mise install --locked`));
    console.log(chalk.gray(`  $ mise exec -- pnpm install`));
  }

  // 4. Set up Database using Docker
  let isDatabase = true; // 기본값
  const dockerOption = parseYesNo(argv.docker);

  if (argv["skip-docker"] || dockerOption === false) {
    // --skip-docker 또는 --docker n 옵션으로 스킵
    isDatabase = false;
  } else if (dockerOption || useDefaults) {
    // --docker y 또는 --yes 옵션이면 자동 진행
    isDatabase = true;
  } else {
    // 옵션이 없으면 프롬프트로 물어봄
    const databaseAnswer = await prompts(
      {
        type: "confirm",
        name: "isDatabase",
        message: "Would you like to set up a database using Docker?",
        initial: true,
      },
      {
        onCancel: createCancelHandler(),
      },
    );
    isDatabase = databaseAnswer.isDatabase;
  }

  if (isDatabase) {
    console.log(`\nSetting up a database using Docker...`);

    // --docker y 옵션이 있으면 DB 옵션도 기본값 사용
    const useDbDefaults = useDefaults || dockerOption;

    // 프롬프트로 입력받은 DB 정보 .env 파일에 추가
    let answers: PromptDatabaseAnswers;
    try {
      answers = await promptDatabase(targetDir, argv, useDbDefaults);
    } catch (error) {
      cleanup();
      throw error;
    }

    const env = `# Database Configuration
SONAMU_DB_HOST=0.0.0.0
SONAMU_DB_PORT=5432
SONAMU_DB_USER=${answers.DB_USER ?? "postgres"}
SONAMU_DB_PASSWORD=${answers.DB_PASSWORD}
CONTAINER_NAME=${answers.CONTAINER_NAME}
PROJECT_NAME=${answers.DATABASE_NAME}
`;

    fs.writeFileSync(path.join(targetRoot, "packages", "api", ".env"), env);
  } else {
    console.log(`\nTo set up a database using Docker, run the following commands:\n`);
    console.log(chalk.gray(`  $ cd ${targetRoot}/packages/api/database`));
    console.log(chalk.gray(`  $ docker compose -p ${targetDir} up -d`));
    console.log(`\nOr use your preferred database management tool.`);
  }

  // 성공적으로 완료되면 cleanup 방지
  createdTargetRoot = null;

  return targetRoot;
}

async function executeCommand(
  command: string,
  args: string[],
  cwd: string,
  options: { showOutput?: boolean } = {},
) {
  const { showOutput = false } = options;
  const child = spawn(command, args, {
    cwd,
    stdio: ["inherit", "pipe", "pipe"], // stdin은 상속, stdout/stderr는 pipe로 처리
    env: { ...process.env }, // 환경변수 상속
  });
  const spinner = ora(`Running ${command} ${args.join(" ")}`);
  let startTime: number;
  let success = true;
  let output = "";
  let errorOutput = "";

  return new Promise((resolve, reject) => {
    child.on("spawn", () => {
      spinner.start();
      startTime = Date.now();
    });

    child.stdout?.on("data", (data) => {
      output += data.toString();
    });

    child.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });

    child.on("error", (error) => {
      success = false;
      spinner.fail(`${command} ${args.join(" ")}`);
      console.error(chalk.red(`🚨 Error: ${command}`));
      console.error(error);
      reject(error);
    });

    child.on("close", (code) => {
      if (!success || code !== 0) {
        if (code !== 0) {
          spinner.fail(`${command} ${args.join(" ")}`);
          console.error(
            chalk.red(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`),
          );
          if (errorOutput) {
            console.error(errorOutput);
          }
          reject(new Error(`Command failed with exit code ${code}`));
        }
        return;
      }
      const durationS = ((Date.now() - startTime) / 1000).toFixed(2);

      if (showOutput && output.trim()) {
        spinner.succeed(`${command} ${args.join(" ")} ${chalk.dim(`${durationS}s`)}`);
        console.log(chalk.cyan(output.trim()));
      } else {
        spinner.succeed(`${command} ${args.join(" ")} ${chalk.dim(`${durationS}s`)}`);
      }

      resolve("");
    });
  });
}

async function setupPnpm(projectName: string, dir?: string) {
  const cwd = dir ? path.resolve(projectName, dir) : path.resolve(projectName);

  try {
    console.log(chalk.blue(`Trusting the generated mise configuration in ${cwd}...`));
    await executeCommand("mise", ["trust"], cwd);
    console.log(chalk.blue(`Installing the locked mise toolchain in ${cwd}...`));
    await executeCommand("mise", ["install", "--locked"], cwd);
    console.log(chalk.blue(`Installing project dependencies with mise in ${cwd}...`));
    await executeCommand("mise", ["exec", "--", "pnpm", "install"], cwd);
    console.log(chalk.green(`✅ mise toolchain and dependencies are ready in ${cwd}\n`));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error(
        chalk.red(
          "mise is required. Install it from https://mise.jdx.dev/getting-started.html, then rerun create-sonamu.",
        ),
      );
    }
    console.error(chalk.red(`❌ Failed to set up the mise toolchain and dependencies in ${cwd}`));
    console.error(error);
    throw error;
  }
}

interface PromptDatabaseAnswers {
  DOCKER_PROJECT_NAME: string;
  DB_USER: string | undefined;
  CONTAINER_NAME: string;
  DATABASE_NAME: string;
  DB_PASSWORD: string;
}

function readOptionalCliString(value: CliStringValue, optionName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    throw new TypeError(`${optionName} may only be provided once.`);
  }
  return value;
}

async function promptDatabase(
  projectName: string,
  argv: CreateSonamuArgs,
  useDefaults: boolean,
): Promise<PromptDatabaseAnswers> {
  // CLI 옵션에서 값 가져오기
  const dockerProject = readOptionalCliString(argv["docker-project"], "--docker-project");
  const dbUser = readOptionalCliString(argv["db-user"], "--db-user");
  const containerName = readOptionalCliString(argv["container-name"], "--container-name");
  const databaseName = readOptionalCliString(argv["db-name"], "--db-name");
  const dbPassword = readOptionalCliString(argv["db-password"], "--db-password");

  // 모든 값이 제공되었으면 프롬프트 스킵
  if (dockerProject && dbUser && containerName && databaseName && dbPassword) {
    return {
      DOCKER_PROJECT_NAME: dockerProject,
      DB_USER: dbUser,
      CONTAINER_NAME: containerName,
      DATABASE_NAME: databaseName,
      DB_PASSWORD: dbPassword,
    };
  }

  // --yes 옵션이면 기본값 사용
  if (useDefaults) {
    return {
      DOCKER_PROJECT_NAME: dockerProject || `${projectName}-docker`,
      DB_USER: dbUser || "postgres",
      CONTAINER_NAME: containerName || `${projectName}-container`,
      DATABASE_NAME: databaseName || projectName,
      DB_PASSWORD: dbPassword || "1234",
    };
  }

  // 일부만 제공되었거나 모두 없으면 프롬프트로 물어봄
  const answers = await prompts(
    [
      {
        type: dockerProject ? null : "text",
        name: "DOCKER_PROJECT_NAME",
        message: "Enter the Docker project name:",
        initial: dockerProject || `${projectName}-docker`,
      },
      {
        type: dbUser ? null : "text",
        name: "DB_USER",
        message: "Enter the database user: ",
        initial: dbUser || "postgres",
      },
      {
        type: containerName ? null : "text",
        name: "CONTAINER_NAME",
        message: "Enter the container name: ",
        initial: containerName || `${projectName}-container`,
      },
      {
        type: databaseName ? null : "text",
        name: "DATABASE_NAME",
        message: "Enter the database name: ",
        initial: databaseName || projectName,
      },
      {
        type: dbPassword ? null : "password",
        name: "DB_PASSWORD",
        message: "Enter the database password: ",
        initial: dbPassword || "",
      },
    ],
    {
      onCancel: createCancelHandler(),
    },
  );

  return {
    DOCKER_PROJECT_NAME: dockerProject || answers.DOCKER_PROJECT_NAME,
    DB_USER: dbUser || answers.DB_USER,
    CONTAINER_NAME: containerName || answers.CONTAINER_NAME,
    DATABASE_NAME: databaseName || answers.DATABASE_NAME,
    DB_PASSWORD: dbPassword || answers.DB_PASSWORD,
  };
}

function createCancelHandler() {
  return () => {
    cleanup();
    throw new Error("Operation cancelled.");
  };
}

function removeDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    console.error(chalk.yellow(`Warning: Failed to remove ${dirPath}`));
  }
}

function cleanup() {
  if (isCleaningUp || !createdTargetRoot) {
    return;
  }
  isCleaningUp = true;
  console.log(chalk.yellow("\n\n Operation cancelled. Cleaning up created files...\n"));
  try {
    if (fs.existsSync(createdTargetRoot)) {
      removeDirectory(createdTargetRoot);
      console.log(chalk.green(`Cleaned up ${createdTargetRoot}\n`));
    }
  } catch (error) {
    console.error(chalk.red(`Failed to clean up: ${error}`));
  }
}

init()
  .then((createdTarget: string) => {
    console.log(chalk.green("\nProject created successfully!\n"));
    console.log(chalk.green(`project was created in ${chalk.blue(createdTarget)}\n`));
  })
  .catch((e) => {
    cleanup();
    console.error(e);
    process.exit(1);
  });

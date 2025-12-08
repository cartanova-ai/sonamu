import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";

// 생성된 파일/디렉토리 전역에서 추적하기 위한 변수
let createdTargetRoot: string | null = null;
let isCleaningUp = false;

async function init() {
  // Graceful shutdown 핸들러 설정
  const shutdownHandler = () => {
    cleanup();
    process.exit(1);
  };

  process.on("SIGINT", shutdownHandler);
  process.on("SIGTERM", shutdownHandler);

  let result: prompts.Answers<"targetDir">;

  try {
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
    const { overwrite } = await prompts(
      {
        type: "confirm",
        name: "overwrite",
        message: `Directory ${targetRoot} already exists. Overwrite?`,
        initial: false,
      },
      {
        onCancel: createCancelHandler(),
      },
    );

    if (!overwrite) {
      console.log(chalk.yellow("Operation cancelled."));
      process.exit(0);
    }

    // 기존 디렉토리 삭제
    console.log(chalk.yellow(`Removing existing directory: ${targetRoot}`));
    removeDirectory(targetRoot);
  }

  createdTargetRoot = targetRoot; // 생성된 디렉토리 추적 시작
  const templateRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "template", "src");

  const copy = (src: string, dest: string) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const file of fs.readdirSync(src)) {
        const srcFile = path.resolve(src, file);
        const destFile = path.resolve(dest, file);
        copy(srcFile, destFile);
      }
    } else {
      // .gitkeep 제외, 디렉토리 생성 로그 출력
      if (path.basename(src) === ".gitkeep") {
        console.log(`${chalk.green("CREATE")} ${dest.split(".gitkeep")[0]}`);
        return;
      }
      fs.copyFileSync(src, dest);
      console.log(`${chalk.green("CREATE")} ${dest}`);
    }
  };

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
  // create-sonamu의 위치에서 한 뎁스 위로 가서 modules 디렉토리 찾기
  const createSonamuDir = path.dirname(fileURLToPath(import.meta.url));
  const modulesDir = path.resolve(createSonamuDir, "..");

  // 각 모듈의 절대 경로
  const sonamuModulePath = path.join(modulesDir, "sonamu");
  const reactSuiModulePath = path.join(modulesDir, "react-sui");
  const uiModulePath = path.join(modulesDir, "ui");

  ["api", "web"].forEach((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(templateRoot, dir, "package.json"), "utf-8"));
    pkg.name = `${targetDir}-${dir}`;
    // package.json의 resolutions 필드 추가
    if (!pkg.resolutions) {
      pkg.resolutions = {};
    }

    // api 디렉토리에 resolutions 추가
    if (dir === "api") {
      const absoluteSonamuPath = path.resolve(sonamuModulePath);
      const absoluteReactSuiPath = path.resolve(reactSuiModulePath);
      const absoluteUiPath = path.resolve(uiModulePath);
      // portal로 로컬 패키지 링킹
      pkg.resolutions["sonamu"] = `portal:${absoluteSonamuPath}`;
      pkg.resolutions["@sonamu-kit/react-sui"] = `portal:${absoluteReactSuiPath}`;
      pkg.resolutions["@sonamu-kit/ui"] = `portal:${absoluteUiPath}`;
    }

    // web 디렉토리에 resolutions 추가
    if (dir === "web") {
      const absoluteReactSuiPath = path.resolve(reactSuiModulePath);
      pkg.resolutions["@sonamu-kit/react-sui"] = `portal:${absoluteReactSuiPath}`;
    }

    fs.writeFileSync(
      path.join(targetRoot, dir, "package.json"),
      JSON.stringify(pkg, null, 2) + "\n",
    );
  });
  console.log(`\n🌲 Created project in ${targetRoot}\n`);

  // 3. Set up pnpm
  const { isPnpm } = await prompts(
    {
      type: "confirm",
      name: "isPnpm",
      message: "Would you like to set up pnpm?",
      initial: true,
    },
    {
      onCancel: createCancelHandler(),
    },
  );

  if (isPnpm) {
    try {
      for await (const dir of ["api", "web"]) {
        await setupPnpm(targetRoot, dir);
      }
    } catch (error) {
      cleanup();
      throw error;
    }
  } else {
    console.log(`\nTo set up pnpm, run the following commands:\n`);
    console.log(chalk.gray(`  $ cd ${targetRoot}/api`));
    console.log(chalk.gray(`  $ pnpm install`));
  }

  // 4. Set up Database using Docker
  const { isDatabase } = await prompts(
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

  if (isDatabase) {
    console.log(`\nSetting up a database using Docker...`);

    // 프롬프트로 입력받은 DB 정보 .env 파일에 추가
    let answers: PromptDatabaseAnswers;
    try {
      answers = await promptDatabase(targetDir);
    } catch (error) {
      cleanup();
      throw error;
    }
    const env = `# Database Configuration
DB_HOST=0.0.0.0
DB_PORT=5432
DB_USER=${answers.DB_USER ?? "postgres"}
DB_PASSWORD=${answers.DB_PASSWORD}
CONTAINER_NAME=${answers.CONTAINER_NAME}
DATABASE_NAME=${answers.DATABASE_NAME}
PROJECT_NAME=${targetDir}
`;

    fs.writeFileSync(path.join(targetRoot, "api", ".env"), env);
  } else {
    console.log(`\nTo set up a database using Docker, run the following commands:\n`);
    console.log(chalk.gray(`  $ cd ${targetRoot}/api/database`));
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

    // stdout 데이터 수집
    child.stdout?.on("data", (data) => {
      output += data.toString();
    });

    // stderr 데이터 수집
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
          // 에러가 있으면 stderr 출력
          if (errorOutput) {
            console.error(errorOutput);
          }
          reject(new Error(`Command failed with exit code ${code}`));
        }
        return;
      }
      const durationS = ((Date.now() - startTime) / 1000).toFixed(2);

      // 출력 표시 옵션이 활성화된 경우 결과 출력
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

async function setupPnpm(projectName: string, dir: string) {
  const cwd = path.resolve(projectName, dir);

  try {
    console.log(chalk.blue(`Setting up pnpm in ${cwd}...`));

    // 1. Corepack 활성화
    await executeCommand("npm", ["install", "-g", "corepack"], cwd);
    await executeCommand("corepack", ["enable"], cwd);

    // 2. 의존성 설치
    await executeCommand("pnpm", ["install"], cwd);

    console.log(chalk.green(`✅ pnpm has been set up in ${cwd}\n`));
  } catch (error) {
    console.error(chalk.red(`❌ Failed to set up pnpm in ${cwd}`));
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

async function promptDatabase(projectName: string): Promise<PromptDatabaseAnswers> {
  const answers = await prompts(
    [
      {
        type: "text",
        name: "DOCKER_PROJECT_NAME",
        message: "Enter the Docker project name:",
        initial: `${projectName}-docker`,
      },
      {
        type: "text",
        name: "DB_USER",
        message: "Enter the database user: ",
        initial: "postgres", // postgres 기본 유저 제안
      },
      {
        type: "text",
        name: "CONTAINER_NAME",
        message: "Enter the container name: ",
        initial: `${projectName}-container`,
      },
      {
        type: "text",
        name: "DATABASE_NAME",
        message: "Enter the database name: ",
        initial: `${projectName}`,
      },
      {
        type: "password",
        name: "DB_PASSWORD",
        message: "Enter the database password: ",
        initial: "",
      },
    ],
    {
      onCancel: createCancelHandler(),
    },
  );

  return answers;
}

// 공통 취소 핸들러
function createCancelHandler() {
  return () => {
    cleanup();
    throw new Error("Operation cancelled.");
  };
}

// 재귀적으로 디렉토리 삭제 함수
function removeDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (error) {
    // 삭제 실패 시 에러를 무시하고 계속 진행
    console.error(chalk.yellow(`Warning: Failed to remove ${dirPath}`));
  }
}

// 생성된 파일 정리 함수
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

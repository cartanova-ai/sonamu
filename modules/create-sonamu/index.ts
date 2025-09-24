#!/usr/bin/env node

import * as path from "node:path";
import * as fs from "node:fs";

import prompts from "prompts";
import { spawn } from "node:child_process";
import chalk from "chalk";
import ora from "ora";

async function init() {
  let result: prompts.Answers<"targetDir">;

  try {
    result = await prompts(
      [
        {
          type: "text",
          name: "targetDir",
          message: "Project name:",
          initial: "my-sonamu-app",
        },
      ],
      {
        onCancel: () => {
          throw new Error("Operation cancelled.");
        },
      }
    );
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  let { targetDir } = result;

  const targetRoot = path.join(process.cwd(), targetDir);
  const templateRoot = new URL("./template/src", import.meta.url).pathname;

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
  ["api", "web"].forEach((dir) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(templateRoot, dir, "package.json"), "utf-8")
    );
    pkg.name = `${targetDir}-${dir}`;

    fs.writeFileSync(
      path.join(targetRoot, dir, "package.json"),
      JSON.stringify(pkg, null, 2) + "\n"
    );
  });

  console.log(`\n🌲 Created project in ${targetRoot}\n`);

  // 3. Set up Yarn Berry
  const { isBerry } = await prompts({
    type: "confirm",
    name: "isBerry",
    message: "Would you like to set up Yarn Berry?",
    initial: true,
  });

  if (isBerry) {
    for await (const dir of ["api", "web"]) {
      await setupYarnBerry(targetDir, dir);
    }
  } else {
    console.log(`\nTo set up Yarn Berry, run the following commands:\n`);
    console.log(chalk.gray(`  $ cd ${targetDir}/api`));
    console.log(chalk.gray(`  $ yarn set version berry`));
    console.log(chalk.gray(`  $ yarn install`));
    console.log(chalk.gray(`  $ yarn dlx @yarnpkg/sdks vscode\n`));
  }

  // 4. Set up Database using Docker
  const { isDatabase } = await prompts({
    type: "confirm",
    name: "isDatabase",
    message: "Would you like to set up a database using Docker?",
    initial: true,
  });

  if (isDatabase) {
    console.log(`\nSetting up a database using Docker...`);

    // 프롬프트로 입력 받아서 MYSQL_CONTAINER_NAME, MYSQL_DATABASE, DB_PASSWORD .env 파일에 추가
    const answers = await promptDatabase(targetDir);
    const env = `# Database
DB_HOST=0.0.0.0
DB_USER=root
DB_PASSWORD=${answers.DB_PASSWORD}
COMPOSE_PROJECT_NAME=${answers.COMPOSE_PROJECT_NAME}
MYSQL_CONTAINER_NAME="${answers.MYSQL_CONTAINER_NAME}"
MYSQL_DATABASE=${answers.MYSQL_DATABASE}
`;
    fs.writeFileSync(path.join(targetRoot, "api", ".env"), env);

    // docker-compose 실행
    const databaseRoot = path.join(targetRoot, "api", "database");
    const envFile = path.join(targetRoot, "api", ".env");
    const command = `docker compose --env-file ${envFile} up -d`;

    const [c, ...args] = command.split(" ");

    try {
      await executeCommand(c, args, databaseRoot);
      console.log(
        chalk.green(`\nA database has been set up in ${databaseRoot}\n`)
      );
    } catch (e) {
      console.log(`\n❌ Failed to set up a database in ${databaseRoot}`);
      console.log(
        `To set up a database using Docker, run the following commands:\n`
      );
      console.log(chalk.gray(`  $ cd ${targetDir}/api/database`));
      console.log(chalk.gray(`  $ docker compose --env-file ${envFile} up -d`));
      console.log(`\nOr use your preferred database management tool.`);
    }
  } else {
    console.log(
      `\nTo set up a database using Docker, run the following commands:\n`
    );
    console.log(chalk.gray(`  $ cd ${targetDir}/api/database`));
    console.log(chalk.gray(`  $ docker compose -p ${targetDir} up -d`));
    console.log(`\nOr use your preferred database management tool.`);
  }
}

async function getCommandOutput(
  command: string,
  args: string[],
  cwd: string
): Promise<string> {
  const child = spawn(command, args, {
    cwd,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env },
  });

  let output = "";
  let errorOutput = "";

  return new Promise((resolve, reject) => {
    child.stdout?.on("data", (data) => {
      output += data.toString();
    });

    child.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Command failed with exit code ${code}: ${errorOutput}`)
        );
      } else {
        resolve(output);
      }
    });
  });
}

async function executeCommand(
  command: string,
  args: string[],
  cwd: string,
  options: { showOutput?: boolean } = {}
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
            chalk.red(
              `Command failed with exit code ${code}: ${command} ${args.join(
                " "
              )}`
            )
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
        spinner.succeed(
          `${command} ${args.join(" ")} ${chalk.dim(`${durationS}s`)}`
        );
        console.log(chalk.cyan(output.trim()));
      } else {
        spinner.succeed(
          `${command} ${args.join(" ")} ${chalk.dim(`${durationS}s`)}`
        );
      }

      resolve("");
    });
  });
}

async function setupYarnBerry(projectName: string, dir: string) {
  const cwd = path.resolve(projectName, dir);

  try {
    console.log(chalk.blue(`Setting up Yarn Berry in ${cwd}...`));

    // 1. Corepack 활성화
    await executeCommand("npm", ["install", "-g", "corepack"], cwd);
    await executeCommand("corepack", ["enable"], cwd);
    await executeCommand(
      "corepack",
      ["prepare", "yarn@stable", "--activate"],
      cwd
    );

    // 2. Yarn 버전 설정
    await executeCommand("yarn", ["set", "version", "stable"], cwd);

    // 3. 의존성 설치
    await executeCommand("yarn", ["install"], cwd);

    // 4. VSCode SDK 설치
    await executeCommand("yarn", ["dlx", "@yarnpkg/sdks", "vscode"], cwd);

    console.log(chalk.green(`✅ Yarn Berry has been set up in ${cwd}\n`));
  } catch (error) {
    console.error(chalk.red(`❌ Failed to set up Yarn Berry in ${cwd}`));
    console.error(error);
    throw error;
  }
}

// 프롬프트로 MYSQL_CONTAINER_NAME, MYSQL_DATABASE, DB_PASSWORD 입력받는 함수
async function promptDatabase(projectName: string) {
  const answers = await prompts([
    {
      type: "text",
      name: "COMPOSE_PROJECT_NAME",
      message: "Enter the Docker project name:",
      initial: `${projectName}`,
    },
    {
      type: "text",
      name: "MYSQL_CONTAINER_NAME",
      message: "Enter the MySQL container name:",
      initial: `${projectName}-mysql`,
    },
    {
      type: "text",
      name: "MYSQL_DATABASE",
      message: "Enter the MySQL database name:",
      initial: `${projectName}`,
    },
    {
      type: "password",
      name: "DB_PASSWORD",
      message: "Enter the MySQL database password:",
    },
  ]);

  return answers;
}

init().catch((e) => {
  console.error(e);
});

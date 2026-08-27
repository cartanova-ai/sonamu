import chalk from "chalk";
import prompts from "prompts";
import { z } from "zod";

import { Sonamu } from "../api/sonamu";
import { DB } from "../database/db";
import { createKnexInstance } from "../database/knex";
import { EntityManager } from "../entity/entity-manager";
import { getSonamuEnvironment } from "../env";
import { DataExplorer } from "../testing/data-explorer";
import { type DataExplorerStrategy } from "../testing/data-explorer";
import { FixtureGenerator } from "../testing/fixture-generator";

interface FixtureCommandOptions {
  _?: string[];
  all?: boolean;
  include?: string;
  exclude?: string;
  count?: string;
  "save-to"?: string;
  strategy?: DataExplorerStrategy;
  limit?: string;
  "use-llm"?: boolean;
  "no-cache"?: boolean;
}

interface SignupBody {
  name: string;
  email: string;
  username: string;
  password: string;
  display_username?: string;
}

const SignupErrorResponse = z.object({ code: z.string().optional() }).passthrough();

/**
 * username을 일반적인 규칙(영문자 시작, 영문자/숫자만, 1-20자)에 맞도록 정규화합니다.
 */
function sanitizeUsername(raw: string): string {
  // 소문자 변환 후 영문자/숫자 외 문자 제거
  let username = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (username.length === 0) {
    username = "user";
  }
  // 첫 글자가 숫자면 'u' 접두어 추가
  if (/^[0-9]/.test(username)) {
    username = `u${username}`;
  }
  // 20자 초과 시 truncate
  return username.slice(0, 20);
}

/**
 * fixture gen 명령어 - cone 메타데이터를 활용하여 자동으로 fixture를 생성합니다.
 */
export async function fixtureGenCommand(options: FixtureCommandOptions) {
  try {
    if (!EntityManager.isAutoloaded) {
      await EntityManager.autoload();
    }

    let entityNames: string[];

    if (options.all) {
      entityNames = EntityManager.getAllIds();
      if (options.exclude) {
        const excludeList = options.exclude.split(",").map((s: string) => s.trim());
        entityNames = entityNames.filter((name) => !excludeList.includes(name));
      }
    } else if (options.include) {
      entityNames = options.include.split(",").map((s: string) => s.trim());
    } else {
      const result = await prompts({
        type: "multiselect",
        name: "entities",
        message: "Fixture를 생성할 Entity를 선택하세요:",
        choices: EntityManager.getAllIds().map((id) => ({ title: id, value: id })),
        min: 1,
      });

      if (!result.entities || result.entities.length === 0) {
        console.log(chalk.yellow("취소되었습니다."));
        return;
      }

      entityNames = result.entities;
    }

    let count = options.count ? Number.parseInt(options.count, 10) : 5;
    if (!options.count) {
      const result = await prompts({
        type: "number",
        name: "count",
        message: "각 Entity별 생성 개수:",
        initial: 5,
        min: 1,
      });

      if (!result.count) {
        console.log(chalk.yellow("취소되었습니다."));
        return;
      }

      count = result.count;
    }

    // User 엔티티가 포함된 경우: 로그인 가능/확인용 분기 선택
    const hasUser = entityNames.includes("User");

    if (hasUser) {
      const userModeResult = await prompts({
        type: "select",
        name: "userMode",
        message: "User 엔티티가 포함되어 있습니다. 생성 방식을 선택하세요:",
        choices: [
          { title: "1. 로그인 가능한 사용자 fixture 생성", value: "login" },
          { title: "2. 확인용 데이터(로그인 불가) 생성", value: "dummy" },
        ],
      });

      if (!userModeResult.userMode) {
        console.log(chalk.yellow("취소되었습니다."));
        return;
      }

      if (userModeResult.userMode === "login") {
        // LLM 사용 여부
        let useLLM = options["use-llm"] ?? false;
        if (!options["use-llm"]) {
          const llmResult = await prompts({
            type: "confirm",
            name: "useLLM",
            message:
              "LLM으로 더 현실적인 데이터를 생성할까요? (fixtureHint 기반, ANTHROPIC_API_KEY 필요)",
            initial: false,
          });
          useLLM = llmResult.useLLM ?? false;
        }

        const enableLLMCache = !options["no-cache"];
        const DEFAULT_PASSWORD = "Test1234!";

        // 로그인 가능 경로에서는 현재 환경의 읽기 DB를 sourceDb로 사용
        const sourceDb = DB.getDB("r");
        const generator = new FixtureGenerator(
          sourceDb,
          sourceDb,
          getSonamuEnvironment(),
          EntityManager,
          { useLLM, enableLLMCache },
        );

        const createdCredentials: Array<{ email: string; password: string }> = [];
        const basePath = Sonamu.config.server.auth?.basePath ?? "/api/auth";

        if (useLLM) {
          console.log(
            chalk.cyan(
              `\nLLM 모드로 로그인 가능한 사용자 ${count}명 생성 중... (캐싱: ${enableLLMCache ? "ON" : "OFF"})`,
            ),
          );
        } else {
          console.log(chalk.cyan(`\n로그인 가능한 사용자 ${count}명 생성 중...`));
        }

        for (let i = 0; i < count; i++) {
          const userData = await generator.generate("User");

          const name = String(userData.name ?? "");
          const email = String(userData.email ?? "");
          const username = sanitizeUsername(String(userData.username ?? ""));
          const displayUsername =
            userData.display_username !== undefined ? String(userData.display_username) : undefined;

          const body: SignupBody = {
            name,
            email,
            username,
            password: DEFAULT_PASSWORD,
          };
          if (displayUsername !== undefined) {
            body.display_username = displayUsername;
          }

          const req = new Request(`http://localhost${basePath}/sign-up/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          const response = await Sonamu.auth.handler(req);

          if (!response.ok) {
            const responseData = SignupErrorResponse.parse(await response.json());
            const code = responseData.code;
            if (code === "USER_ALREADY_EXISTS") {
              console.log(chalk.yellow(`  ⚠️  ${email} 이미 존재 - 건너뜁니다.`));
              continue;
            }
            console.log(chalk.red(`  ❌ ${email} 생성 실패: ${JSON.stringify(responseData)}`));
            continue;
          }

          createdCredentials.push({ email, password: DEFAULT_PASSWORD });
          console.log(chalk.green(`  ✅ ${email} 생성 완료`));
        }

        // email_verified = true 직접 업데이트 (dev 편의)
        if (createdCredentials.length > 0) {
          const emails = createdCredentials.map((c) => c.email);
          await DB.getDB("w")("users").whereIn("email", emails).update({ email_verified: true });
          console.log(chalk.green(`\nemail_verified = true 업데이트 완료`));
        }

        if (useLLM) {
          const stats = generator.getLLMCacheStats();
          console.log(chalk.cyan(`[LLM Cache] 캐시 크기: ${stats.size}`));
        }

        console.log(
          chalk.green(`\n✅ ${createdCredentials.length}명의 로그인 가능한 사용자 생성 완료`),
        );
        if (createdCredentials.length > 0) {
          console.log("\n생성된 계정 목록:");
          console.table(createdCredentials);
        }

        return;
      }
      // userMode === "dummy": 기존 generateBatch() 흐름 계속
    }

    let saveTarget = options["save-to"] || "db";
    if (!options["save-to"]) {
      const result = await prompts({
        type: "select",
        name: "saveTarget",
        message: "저장 방식:",
        choices: [
          { title: "Fixture DB에 저장", value: "db" },
          { title: "파일로 저장 (자동 파일명)", value: "file" },
          { title: "파일로 저장 (파일명 지정)", value: "file:custom" },
          { title: "저장 안 함 (출력만)", value: "none" },
        ],
      });

      saveTarget = result.saveTarget;

      if (saveTarget === "file:custom") {
        const filenameResult = await prompts({
          type: "text",
          name: "filename",
          message: "파일명:",
          initial: "fixtures.json",
        });

        if (!filenameResult.filename) {
          console.log(chalk.yellow("취소되었습니다."));
          return;
        }

        saveTarget = `file:${filenameResult.filename}`;
      }
    }

    // LLM 사용 여부 결정
    let useLLM = options["use-llm"] ?? false;
    if (!options["use-llm"]) {
      const llmResult = await prompts({
        type: "confirm",
        name: "useLLM",
        message:
          "LLM으로 더 현실적인 데이터를 생성할까요? (fixtureHint 기반, ANTHROPIC_API_KEY 필요)",
        initial: false,
      });
      useLLM = llmResult.useLLM ?? false;
    }

    const enableLLMCache = !options["no-cache"];

    // fixture gen: fixture DB 내에서 참조 관계를 해결하고 저장합니다
    const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);
    const generator = new FixtureGenerator(fixtureDb, fixtureDb, "fixture", EntityManager, {
      useLLM,
      enableLLMCache,
    });

    if (useLLM) {
      console.log(
        chalk.cyan(
          `\nLLM 모드로 ${entityNames.join(", ")} 생성 중... (캐싱: ${enableLLMCache ? "ON" : "OFF"})`,
        ),
      );
    } else {
      console.log(chalk.cyan(`\n${entityNames.join(", ")} 생성 중...`));
    }

    const specs = entityNames.map((entityName) => ({
      entity: entityName,
      count,
      overrides: {},
    }));

    const results = await generator.generateBatch(specs);

    if (useLLM) {
      const stats = generator.getLLMCacheStats();
      console.log(chalk.cyan(`[LLM Cache] 캐시 크기: ${stats.size}`));
    }

    console.log(chalk.green(`\n✅ ${results.length}개 fixture 생성 완료`));

    if (saveTarget === "none") {
      console.log(JSON.stringify(results, null, 2));
    } else if (saveTarget === "db") {
      // generateBatch가 이미 DB에 저장했으므로 별도 저장이 불필요합니다.
      console.log(chalk.green("Fixture DB에 저장되었습니다."));
    } else if (saveTarget.startsWith("file")) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const fixturesDir = path.join(process.cwd(), "test", "fixtures");
      try {
        await fs.access(fixturesDir);
      } catch {
        await fs.mkdir(fixturesDir, { recursive: true });
      }

      for (const entityName of entityNames) {
        const entityResults = results.filter((r) => r.entityId === entityName);

        if (entityResults.length === 0) {
          continue;
        }

        let filename: string;
        if (saveTarget === "file") {
          const entity = EntityManager.get(entityName);
          filename = `${entity.table}.json`;
        } else {
          filename = saveTarget.replace("file:", "");
        }

        const filepath = path.join(fixturesDir, filename);
        await fs.writeFile(
          filepath,
          JSON.stringify(
            entityResults.map((r) => r.data),
            null,
            2,
          ),
        );
        console.log(chalk.green(`✅ ${filepath} 저장 완료`));
      }
    }
  } catch (error) {
    console.error(
      chalk.red(
        "Fixture 생성 중 오류가 발생했습니다.\n" +
          "원인: Entity 정의나 DB 연결을 확인해주세요.\n" +
          "자세한 내용:",
      ),
      error,
    );
    throw error;
  }
}

/**
 * fixture fetch 명령어 - 실제 운영 DB에서 데이터를 가져와 fixture로 저장합니다.
 * 관계된 데이터도 함께 가져오므로 현실적인 테스트 데이터를 확보할 수 있습니다.
 */
export async function fixtureFetchCommand(options: FixtureCommandOptions) {
  try {
    if (!EntityManager.isAutoloaded) {
      await EntityManager.autoload();
    }

    let entityNames: string[];

    if (options.all) {
      entityNames = EntityManager.getAllIds();
      if (options.exclude) {
        const excludeList = options.exclude.split(",").map((s: string) => s.trim());
        entityNames = entityNames.filter((name) => !excludeList.includes(name));
      }
    } else if (options.include) {
      entityNames = options.include.split(",").map((s: string) => s.trim());
    } else {
      const result = await prompts({
        type: "multiselect",
        name: "entities",
        message: "Import할 Entity를 선택하세요:",
        choices: EntityManager.getAllIds().map((id) => ({ title: id, value: id })),
        min: 1,
      });

      if (!result.entities || result.entities.length === 0) {
        console.log(chalk.yellow("취소되었습니다."));
        return;
      }

      entityNames = result.entities;
    }

    const strategy: DataExplorerStrategy = options.strategy ?? "recent";
    const limit = options.limit ? Number.parseInt(options.limit, 10) : 10;

    // fixture fetch: 현재 환경 데이터를 fixture DB로 import합니다
    const sourceDb = DB.getDB("r");
    const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);
    const generator = new FixtureGenerator(sourceDb, fixtureDb, "fixture", EntityManager);

    console.log(chalk.cyan(`\n${entityNames.join(", ")} import 중...`));

    for (const entityName of entityNames) {
      const results = await generator.importFromSource(entityName, {
        strategy,
        limit,
        includeRelations: true,
        maxDepth: 2,
      });

      console.log(chalk.green(`✅ ${entityName}: ${results.length}개 import 완료`));
    }
  } catch (error) {
    console.error(
      chalk.red(
        "실제 DB에서 데이터를 가져오는 중 오류가 발생했습니다.\n" +
          "원인: 소스 DB 연결 설정(sonamu.config.ts)이나 Entity 관계 정의를 확인해주세요.\n" +
          "자세한 내용:",
      ),
      error,
    );
    throw error;
  }
}

/**
 * fixture explore 명령어 - DB의 실제 데이터를 조회하여 확인합니다.
 * 저장하지 않고 조회만 하므로 데이터를 빠르게 확인할 때 유용합니다.
 */
export async function fixtureExploreCommand(options: FixtureCommandOptions) {
  try {
    if (!EntityManager.isAutoloaded) {
      await EntityManager.autoload();
    }

    let entityName = options.include;

    if (!entityName) {
      const result = await prompts({
        type: "select",
        name: "entity",
        message: "탐색할 Entity:",
        choices: EntityManager.getAllIds().map((id) => ({ title: id, value: id })),
      });

      if (!result.entity) {
        console.log(chalk.yellow("취소되었습니다."));
        return;
      }

      entityName = result.entity;
    }

    if (!entityName) {
      throw new Error("Entity name is required");
    }

    const strategy: DataExplorerStrategy = options.strategy ?? "sample";
    const limit = options.limit ? Number.parseInt(options.limit, 10) : 10;

    const db = DB.getDB("r");
    const explorer = new DataExplorer(db, EntityManager);
    const data = await explorer.explore(entityName, { strategy, limit });

    console.log(chalk.cyan(`\n${entityName} ${data.length}개 조회 완료:`));
    console.table(data);
  } catch (error) {
    console.error(
      chalk.red(
        "데이터 조회 중 오류가 발생했습니다.\n" +
          "원인: DB 연결이나 Entity 정의를 확인해주세요.\n" +
          "자세한 내용:",
      ),
      error,
    );
    throw error;
  }
}

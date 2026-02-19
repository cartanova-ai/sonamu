import chalk from "chalk";
import prompts from "prompts";
import { Sonamu } from "../api";
import { DB } from "../database/db";
import { createKnexInstance } from "../database/knex";
import { EntityManager } from "../entity/entity-manager";
import { DataExplorer, type DataExplorerStrategy } from "../testing/data-explorer";
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

    // fixture fetch: production 데이터를 fixture DB로 import합니다
    const sourceDb = DB.getDB("r"); // production_master (또는 development_master)
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

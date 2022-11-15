/* Global Begin */
import chalk from "chalk";
console.log(chalk.bgBlue(`BEGIN ${new Date()}`));

import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { BaseModel } from "../database/base-model";
import { SMDManager } from "../smd/smd-manager";
import { Migrator } from "../smd/migrator";
import { FixtureManager } from "../testing/fixture-manager";
import { tsicli } from "tsicli";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { Sonamu } from "../api";

let migrator: Migrator;

async function bootstrap() {
  await Sonamu.init();

  await tsicli(process.argv, {
    types: {
      "#smdId": {
        type: "autocomplete",
        name: "#smdId",
        message: "Please input #smdId",
        choices: SMDManager.getAllParentIds().map((smdId) => ({
          title: smdId,
          value: smdId,
        })),
      },
      "#recordIds": "number[]",
      "#name": "string",
    },
    args: [
      ["fixture", "import", "#smdId", "#recordIds"],
      ["fixture", "sync"],
      ["migrate", "run"],
      ["migrate", "rollback"],
      ["migrate", "reset"],
      ["migrate", "clear"],
      ["stub", "practice", "#name"],
      ["stub", "smd", "#name"],
      ["scaffold", "model", "#smdId"],
      ["scaffold", "model_test", "#smdId"],
      ["scaffold", "view_list", "#smdId"],
      ["scaffold", "view_form", "#smdId"],
    ],
    runners: {
      migrate_run,
      migrate_rollback,
      migrate_clear,
      migrate_reset,
      fixture_import,
      fixture_sync,
      stub_practice,
      stub_smd,
      scaffold_model,
      scaffold_model_test,
      // scaffold_view_list,
      // scaffold_view_form,
    },
  });
}
bootstrap().finally(async () => {
  if (migrator) {
    await migrator.destroy();
  }
  await FixtureManager.destory();
  await BaseModel.destroy();

  /* Global End */
  console.log(chalk.bgBlue(`END ${new Date()}\n`));
});

async function setupMigrator() {
  // migrator
  migrator = new Migrator({
    mode: "dev",
  });
}

async function setupFixtureManager() {
  FixtureManager.init();
}

async function migrate_run() {
  await setupMigrator();

  await migrator.cleanUpDist();
  await migrator.run();
}

async function migrate_rollback() {
  await setupMigrator();

  await migrator.rollback();
}

async function migrate_clear() {
  await setupMigrator();

  await migrator.clearPendingList();
}

async function migrate_reset() {
  await setupMigrator();

  await migrator.resetAll();
}

async function fixture_import(smdId: string, recordIds: number[]) {
  await setupFixtureManager();

  await FixtureManager.importFixture(smdId, recordIds);
  await FixtureManager.sync();
}

async function fixture_sync() {
  await setupFixtureManager();

  await FixtureManager.sync();
}

async function stub_practice(name: string) {
  const practiceDir = path.join(Sonamu.apiRootPath, "src", "practices");
  const fileNames = readdirSync(practiceDir);

  const maxSeqNo = (() => {
    if (existsSync(practiceDir) === false) {
      mkdirSync(practiceDir, { recursive: true });
    }

    const filteredSeqs = fileNames
      .filter(
        (fileName) => fileName.startsWith("p") && fileName.endsWith(".ts")
      )
      .map((fileName) => {
        const [, seqNo] = fileName.match(/^p([0-9]+)\-/) ?? ["0", "0"];
        return parseInt(seqNo);
      })
      .sort((a, b) => b - a);

    if (filteredSeqs.length > 0) {
      return filteredSeqs[0];
    }

    return 0;
  })();

  const currentSeqNo = maxSeqNo + 1;
  const fileName = `p${currentSeqNo}-${name}.ts`;
  const dstPath = path.join(practiceDir, fileName);

  const code = [
    `import { BaseModel } from "sonamu";`,
    "",
    `console.clear();`,
    `console.log("${fileName}");`,
    "",
    `async function bootstrap() {`,
    ` // TODO`,
    `}`,
    `bootstrap().finally(async () => {`,
    `await BaseModel.destroy();`,
    `});`,
  ].join("\n");
  writeFileSync(dstPath, code);

  execSync(`code ${dstPath}`);

  const runCode = `yarn node -r source-map-support/register dist/practices/${fileName.replace(
    ".ts",
    ".js"
  )}`;
  console.log(`${chalk.blue(runCode)} copied to clipboard.`);
  execSync(`echo "${runCode}" | pbcopy`);
}

async function stub_smd(name: string) {
  await Sonamu.syncer.generateTemplate("smd", {
    smdId: name,
  });
}

async function scaffold_model(smdId: string) {
  await Sonamu.syncer.generateTemplate("model", {
    smdId,
  });
}

async function scaffold_model_test(smdId: string) {
  await Sonamu.syncer.generateTemplate("model_test", {
    smdId,
  });
}

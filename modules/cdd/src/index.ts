#!/usr/bin/env node

import minimist from "minimist";

import { runAcAdd } from "./commands/ac-add.js";
import { runAcList } from "./commands/ac-list.js";
import { runAgentsInit, runContractInit } from "./commands/agents-init.js";
import { runAgentsSync } from "./commands/agents-sync.js";
import { runRulesValidate } from "./commands/rules-validate.js";
import { findContractDir, loadProject } from "./core/loader.js";
import { type OutputResult } from "./utils/output.js";
import { printOutput } from "./utils/output.js";

const args = minimist(process.argv.slice(2), {
  string: ["cwd", "describe"],
  boolean: ["help", "raw", "json", "force", "dry-run"],
  alias: { h: "help" },
});

const rawFlag: boolean = args.raw || args.json;
const command = args._[0];

if (args.help || !command) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const cwd = args.cwd ?? process.cwd();
const cmdArgs = args._.slice(1);

// agents / contract 커맨드는 OutputResult 패턴 없이 직접 출력 후 종료
if (command === "agents") {
  const subCmd = cmdArgs[0];
  if (subCmd === "init") {
    runAgentsInit(args.force);
    console.log();
    runContractInit(args.force);
  } else if (subCmd === "sync") {
    runAgentsSync(args["dry-run"]);
  } else if (subCmd === "contract" && cmdArgs[1] === "init") {
    // alias: cdd agents contract init
    runContractInit(args.force);
  } else {
    console.error(`알 수 없는 agents 서브커맨드: "${subCmd}"`);
    console.error("사용 가능: init, sync, contract init");
    process.exit(1);
  }
  process.exit(0);
}

if (command === "contract") {
  const subCmd = cmdArgs[0];
  if (subCmd === "init") {
    runContractInit(args.force);
  } else {
    console.error(`알 수 없는 contract 서브커맨드: "${subCmd}"`);
    console.error("사용 가능: init");
    process.exit(1);
  }
  process.exit(0);
}

let result: OutputResult;
switch (command) {
  case "ac": {
    const subCmd = cmdArgs[0];
    if (subCmd === "add") {
      result = runAcAdd(cmdArgs[1], cmdArgs[2], { describe: args.describe }, cwd);
    } else if (subCmd === "list") {
      result = await runAcList(cmdArgs[1], cwd);
    } else {
      console.error(`알 수 없는 ac 서브커맨드: "${subCmd}"`);
      console.error("사용 가능: add, list");
      process.exit(1);
    }
    break;
  }
  case "rules": {
    if (cmdArgs[0] === "validate") {
      const contractDir = findContractDir(cwd);
      if (!contractDir) {
        console.error("contract/ 디렉토리를 찾을 수 없습니다.");
        process.exit(1);
      }
      const project = await loadProject(contractDir);
      result = runRulesValidate(project);
    } else {
      console.error(`알 수 없는 rules 서브커맨드: "${cmdArgs[0]}"`);
      console.error("사용 가능: validate");
      process.exit(1);
    }
    break;
  }
  default:
    console.error(`알 수 없는 명령어: "${command}"`);
    printHelp();
    process.exit(1);
}

printOutput(result, rawFlag);
if (result.exitCode) process.exit(result.exitCode);

function printHelp(): void {
  console.log(`Usage: cdd <command> [options]

Commands:
  ac add <file> [--describe <group>] <test-name>  AC 추가 (빈 테스트 스켈레톤 생성)
  ac list [file]                                   AC 목록 조회 (describe/test 트리)
  rules validate                                   Rules 파일 구조 검증
  agents init [--force]                            CDD 에이전트 + contract/ 초기 설정
  agents sync [--dry-run]                          CDD 에이전트 프롬프트 최신화
  agents contract init [--force]                   contract/ 만 초기 설정 (alias)
  contract init [--force]                          contract/ 초기 설정 (planning.md, rules/)

Options:
  --cwd <dir>         작업 디렉토리 지정 (기본: 현재 디렉토리)
  --describe <group>  describe 그룹 지정 (ac add)
  --raw / --json      JSON 원본 출력
  --force             기존 파일 덮어쓰기 (agents init)
  --dry-run           변경 대상만 출력, 실제 변경 없음 (agents sync)
  -h, --help          도움말`);
}

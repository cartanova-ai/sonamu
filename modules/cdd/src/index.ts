#!/usr/bin/env node

import minimist from "minimist";
import { runCheck } from "./commands/check.js";
import { runImpact } from "./commands/impact.js";
import { runInit } from "./commands/init.js";
import { runSpecCreate } from "./commands/spec-create.js";
import { runSpecSetStatus } from "./commands/spec-set-status.js";
import { runStatus } from "./commands/status.js";
import { runTree } from "./commands/tree.js";
import { runValidate } from "./commands/validate.js";
import { findContractDir, loadProject } from "./core/loader.js";
import type { CddProject } from "./core/types.js";

const args = minimist(process.argv.slice(2), {
  string: ["cwd", "domain", "contract", "revision"],
  boolean: ["help"],
  alias: { h: "help" },
});

const command = args._[0];

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!command) {
  printHelp();
  process.exit(1);
}

const cwd = args.cwd ?? process.cwd();

if (command === "init") {
  runInit([args._[1] ?? cwd]);
} else {
  const contractDir = findContractDir(cwd);
  if (!contractDir) {
    console.error("contract/ 디렉토리를 찾을 수 없습니다. `cdd init`으로 초기화하세요.");
    process.exit(1);
  }

  const project = await loadProject(contractDir);
  await dispatch(command, args._.slice(1), project);
}

async function dispatch(cmd: string, cmdArgs: string[], project: CddProject): Promise<void> {
  switch (cmd) {
    case "tree":
      runTree(project);
      break;
    case "status":
      runStatus(project);
      break;
    case "validate":
      runValidate(project);
      break;
    case "impact":
      runImpact(cmdArgs[0], project);
      break;
    case "check":
      runCheck(project);
      break;
    case "spec":
      dispatchSpec(cmdArgs, project);
      break;
    default:
      console.error(`알 수 없는 명령어: "${cmd}"`);
      printHelp();
      process.exit(1);
  }
}

function dispatchSpec(cmdArgs: string[], project: CddProject): void {
  const subCmd = cmdArgs[0];
  switch (subCmd) {
    case "create":
      runSpecCreate(cmdArgs[1], { domain: args.domain, contract: args.contract }, project);
      break;
    case "set-status":
      runSpecSetStatus(cmdArgs[1], cmdArgs[2], args.revision, project);
      break;
    default:
      console.error(`알 수 없는 spec 서브커맨드: "${subCmd}"`);
      console.error("사용 가능: create, set-status");
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`Usage: cdd <command> [options]

Commands:
  init [dir]              CDD 프로젝트 초기화
  tree                    Contract/Spec 트리 출력
  status                  전체 상태 대시보드
  validate                구조/참조 무결성 검증
  impact <file>           소스 파일 변경 영향 분석
  check                   Spec-Code 일관성 검증
  spec create <name>      Spec 템플릿 생성
  spec set-status <spec>  Spec/revision 상태 변경

Options:
  --cwd <dir>             작업 디렉토리 지정 (기본: 현재 디렉토리)
  -h, --help              도움말`);
}

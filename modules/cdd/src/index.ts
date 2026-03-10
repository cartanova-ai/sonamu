#!/usr/bin/env node

import minimist from "minimist";
import { runCheck } from "./commands/check.js";
import { runImpact } from "./commands/impact.js";
import { runInit } from "./commands/init.js";
import { runSpecAdd } from "./commands/spec-add.js";
import { runSpecCreate } from "./commands/spec-create.js";
import { runSpecGet } from "./commands/spec-get.js";
import { runSpecList } from "./commands/spec-list.js";
import { runSpecRemove } from "./commands/spec-remove.js";
import { runSpecSet } from "./commands/spec-set.js";
import { runSpecSetStatus } from "./commands/spec-set-status.js";
import { runStatus } from "./commands/status.js";
import { runTree } from "./commands/tree.js";
import { runValidate } from "./commands/validate.js";
import { findContractDir, loadProject } from "./core/loader.js";
import type { CddProject } from "./core/types.js";

const args = minimist(process.argv.slice(2), {
  string: ["cwd", "domain", "contract", "field", "value", "key", "status", "format", "index"],
  boolean: ["help", "json", "reverse"],
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
      runStatus(cmdArgs[0], project);
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
      runSpecSetStatus(cmdArgs[1], cmdArgs[2], project);
      break;
    case "list":
      runSpecList(
        {
          status: args.status,
          domain: args.domain,
          contract: args.contract,
          json: args.json,
        },
        project,
      );
      break;
    case "get":
      runSpecGet(cmdArgs[1], { field: args.field, json: args.json }, project);
      break;
    case "set":
      runSpecSet(cmdArgs[1], { field: args.field, value: args.value, json: args.json }, project);
      break;
    case "add":
      runSpecAdd(cmdArgs[1], { field: args.field, value: args.value, key: args.key }, project);
      break;
    case "remove": {
      const index = args.index !== undefined ? Number(args.index) : undefined;
      runSpecRemove(
        cmdArgs[1],
        { field: args.field, index, value: args.value, key: args.key },
        project,
      );
      break;
    }
    default:
      console.error(`알 수 없는 spec 서브커맨드: "${subCmd}"`);
      console.error("사용 가능: create, set-status, list, get, set, add, remove");
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`Usage: cdd <command> [options]

Commands:
  init [dir]                        CDD 프로젝트 초기화
  tree                              Contract/Spec 트리 출력
  status [file]                     전체 상태 대시보드 / spec·contract 상태 조회
  validate                          구조/참조 무결성 검증
  impact <file>                     소스 파일 변경 영향 분석 (sources 기반)
  check                             Spec-Code 일관성 검증
  spec create <name>                Spec 템플릿 생성
  spec set-status <spec> <status>   Spec 상태 변경
  spec list                         Spec 목록 조회
  spec get <spec>                   Spec 조회
  spec set <spec>                   Spec 필드 값 변경
  spec add <spec>                   Spec 배열/맵 필드에 항목 추가
  spec remove <spec>                Spec 배열/맵 필드에서 항목 제거

Options:
  --cwd <dir>           작업 디렉토리 지정 (기본: 현재 디렉토리)
  --field <path>        필드 경로 (예: summary, modules.Session)
  --value <value>       설정할 값
  --key <key>           맵 필드의 키
  --index <n>           배열 필드의 인덱스
  --status <status>     상태 필터 (draft | in-progress | done)
  --domain <domain>     도메인 필터
  --contract <path>     Contract 경로
  --json                JSON 형식으로 출력/입력
  -h, --help            도움말`);
}

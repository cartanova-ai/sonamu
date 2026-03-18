#!/usr/bin/env node

import minimist from "minimist";
import { runAdvance } from "./commands/advance.js";
import { runContractCreate } from "./commands/contract-create.js";
import { runSpecCreate } from "./commands/spec-create.js";
import { runStatus } from "./commands/status.js";
import { findContractDir, loadProject } from "./core/loader.js";
import type { OutputResult } from "./utils/output.js";
import { printOutput } from "./utils/output.js";

const args = minimist(process.argv.slice(2), {
  string: ["cwd", "domain", "contract", "schema"],
  boolean: ["help", "raw", "json", "commit"],
  alias: { h: "help" },
});

const rawFlag: boolean = args.raw || args.json;
const command = args._[0];

if (args.help || !command) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const cwd = args.cwd ?? process.cwd();
const contractDir = findContractDir(cwd);
if (!contractDir) {
  console.error("contract/ 디렉토리를 찾을 수 없습니다.");
  process.exit(1);
}

const project = await loadProject(contractDir);
const cmdArgs = args._.slice(1);

let result: OutputResult;
switch (command) {
  case "advance":
    result = runAdvance(cmdArgs[0], project, { commit: args.commit });
    break;
  case "status":
    result = runStatus(cmdArgs[0], project);
    break;
  case "spec":
    if (cmdArgs[0] === "create") {
      result = runSpecCreate(
        cmdArgs[1],
        {
          domain: args.domain,
          contract: args.contract,
          schema: args.schema,
        },
        project,
      );
    } else {
      console.error(`알 수 없는 spec 서브커맨드: "${cmdArgs[0]}"`);
      console.error("사용 가능: create");
      process.exit(1);
    }
    break;
  case "contract":
    if (cmdArgs[0] === "create") {
      result = runContractCreate(
        cmdArgs[1],
        {
          domain: args.domain,
          schema: args.schema,
        },
        project,
      );
    } else {
      console.error(`알 수 없는 contract 서브커맨드: "${cmdArgs[0]}"`);
      console.error("사용 가능: create");
      process.exit(1);
    }
    break;
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
  advance <spec> [--commit]       다음 상태로 전진 (게이트 검증 + delegate)
                                  --commit: Layer 2 생략, 즉시 전이
  status [file]                   전체 상태 대시보드 / 개별 파일 상태
  spec create <name>              Spec 템플릿 생성 (--schema, 기본: default-spec)
  contract create <name>          Contract 템플릿 생성 (--schema, 기본: default-contract)

Options:
  --cwd <dir>         작업 디렉토리 지정 (기본: 현재 디렉토리)
  --domain <domain>   도메인 디렉토리 (spec/contract create)
  --contract <path>   Contract 경로 (spec create)
  --schema <id>       Schema ID (spec/contract create)
  --raw / --json      JSON 원본 출력
  -h, --help          도움말`);
}

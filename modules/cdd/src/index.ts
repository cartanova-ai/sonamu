#!/usr/bin/env node

import minimist from "minimist";
import { runAcAdd } from "./commands/ac-add.js";
import { runAcCheck } from "./commands/ac-check.js";
import { runAcList } from "./commands/ac-list.js";
import { runAcRemove } from "./commands/ac-remove.js";
import { runAdvance } from "./commands/advance.js";
import { runUnifiedBlame } from "./commands/blame.js";
import { runCheck } from "./commands/check.js";
import { runUnifiedExplain } from "./commands/explain.js";
import { runImpact } from "./commands/impact.js";
import { runInit } from "./commands/init.js";
import { runUnifiedLog } from "./commands/log.js";
import { runRegress } from "./commands/regress.js";
import { runSpecAdd } from "./commands/spec-add.js";
import { runSpecCreate } from "./commands/spec-create.js";
import { runSpecGet } from "./commands/spec-get.js";
import { runSpecList } from "./commands/spec-list.js";
import { runSpecRemove } from "./commands/spec-remove.js";
import { runSpecSet } from "./commands/spec-set.js";
import { runStatus } from "./commands/status.js";
import { runTree } from "./commands/tree.js";
import { runValidate } from "./commands/validate.js";
import { findContractDir, loadProject } from "./core/loader.js";
import type { CddProject } from "./core/types.js";
import type { OutputResult } from "./utils/output.js";
import { printOutput } from "./utils/output.js";

const args = minimist(process.argv.slice(2), {
  string: [
    "cwd",
    "domain",
    "contract",
    "field",
    "value",
    "key",
    "status",
    "format",
    "index",
    "since",
    "until",
    "group-by",
    "commit",
    "condition",
    "target",
    "pattern",
    "id",
  ],
  boolean: ["help", "raw", "json", "reverse"],
  alias: { h: "help" },
});

const rawFlag: boolean = args.raw || args.json;
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
  const result = runInit([args._[1] ?? cwd]);
  printOutput(result, rawFlag);
  if (result.exitCode) process.exit(result.exitCode);
} else {
  const contractDir = findContractDir(cwd);
  if (!contractDir) {
    console.error("contract/ 디렉토리를 찾을 수 없습니다. `cdd init`으로 초기화하세요.");
    process.exit(1);
  }

  const project = await loadProject(contractDir);
  const result = await dispatch(command, args._.slice(1), project);
  printOutput(result, rawFlag);
  if (result.exitCode) process.exit(result.exitCode);
}

async function dispatch(
  cmd: string,
  cmdArgs: string[],
  project: CddProject,
): Promise<OutputResult> {
  switch (cmd) {
    // 프로젝트 관리
    case "tree":
      return runTree(project);
    case "status":
      return runStatus(cmdArgs[0], project);
    case "validate":
      return runValidate(project);
    case "impact":
      return runImpact(cmdArgs[0], project);
    case "check":
      return runCheck(project);

    // 워크플로우
    case "advance":
      return runAdvance(cmdArgs[0], project);
    case "regress":
      return runRegress(cmdArgs[0], project);

    // AC 관리
    case "ac":
      return dispatchAc(cmdArgs, project);

    // Spec CRUD
    case "spec":
      return dispatchSpec(cmdArgs, project);

    // 분석 (통합)
    case "blame":
      return runUnifiedBlame(cmdArgs[0], { cwd, since: args.since, until: args.until }, project);
    case "log":
      return runUnifiedLog(
        cmdArgs[0],
        {
          cwd,
          since: args.since,
          until: args.until,
          groupBy: (args["group-by"] as "day" | "week" | "month") || "week",
        },
        project,
      );
    case "explain":
      return runUnifiedExplain(
        cmdArgs[0],
        { cwd, since: args.since, until: args.until, commit: args.commit },
        project,
      );

    default:
      console.error(`알 수 없는 명령어: "${cmd}"`);
      printHelp();
      process.exit(1);
  }
}

async function dispatchAc(cmdArgs: string[], project: CddProject): Promise<OutputResult> {
  const subCmd = cmdArgs[0];
  switch (subCmd) {
    case "add":
      return runAcAdd(
        cmdArgs[1],
        {
          condition: args.condition,
          target: args.target,
          pattern: args.pattern,
          id: args.id,
        },
        project,
      );
    case "remove":
      return runAcRemove(cmdArgs[1], args.id, project);
    case "list":
      return runAcList(cmdArgs[1], project);
    case "check":
      return runAcCheck(cmdArgs[1], project);
    default:
      console.error(`알 수 없는 ac 서브커맨드: "${subCmd}"`);
      console.error("사용 가능: add, remove, list, check");
      process.exit(1);
  }
}

async function dispatchSpec(cmdArgs: string[], project: CddProject): Promise<OutputResult> {
  const subCmd = cmdArgs[0];
  switch (subCmd) {
    case "create":
      return runSpecCreate(cmdArgs[1], { domain: args.domain, contract: args.contract }, project);
    case "list":
      return runSpecList(
        {
          status: args.status,
          domain: args.domain,
          contract: args.contract,
        },
        project,
      );
    case "get":
      return runSpecGet(cmdArgs[1], { field: args.field }, project);
    case "set":
      return runSpecSet(
        cmdArgs[1],
        { field: args.field, value: args.value, json: args.json },
        project,
      );
    case "add":
      return runSpecAdd(
        cmdArgs[1],
        { field: args.field, value: args.value, key: args.key },
        project,
      );
    case "remove": {
      const index = args.index !== undefined ? Number(args.index) : undefined;
      return runSpecRemove(
        cmdArgs[1],
        { field: args.field, index, value: args.value, key: args.key },
        project,
      );
    }
    default:
      console.error(`알 수 없는 spec 서브커맨드: "${subCmd}"`);
      console.error("사용 가능: create, list, get, set, add, remove");
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
  check                             Spec-Code 일관성 검증 (sources + AC testRef)

  advance <spec>                    다음 상태로 전진 (게이트 강제)
  regress <spec>                    done → implementing 수동 회귀

  ac add <spec>                     AC 추가 (--condition --target --pattern [--id])
  ac remove <spec> --id <id>        AC 제거 (id 기준)
  ac list <spec>                    AC 목록 + testRef 검증 상태
  ac check <spec>                   AC testRef 전체 검증

  spec create <name>                Spec 템플릿 생성
  spec list                         Spec 목록 조회
  spec get <spec>                   Spec 조회
  spec set <spec>                   Spec 필드 값 변경
  spec add <spec>                   Spec 배열/맵 필드에 항목 추가
  spec remove <spec>                Spec 배열/맵 필드에서 항목 제거

  blame <file>                      기여자 분석 (spec/source 자동 판별)
  log <file>                        변경 타임라인 (--group-by day|week|month)
  explain <file>                    변경 사유 분석 (--commit | --since --until)

Options:
  --cwd <dir>           작업 디렉토리 지정 (기본: 현재 디렉토리)
  --field <path>        필드 경로 (예: summary, modules.Session)
  --value <value>       설정할 값
  --key <key>           맵 필드의 키
  --index <n>           배열 필드의 인덱스
  --id <id>             AC id (ac add/remove에서 사용)
  --condition <text>    AC 검증 조건 (ac add)
  --target <file>       AC 테스트 파일 경로 (ac add)
  --pattern <regex>     AC 테스트 패턴 (ac add)
  --status <status>     상태 필터 (draft | specifying | implementing | validating | done)
  --domain <domain>     도메인 필터
  --contract <path>     Contract 경로
  --since <date>        시작 날짜 필터 (blame, log, explain)
  --until <date>        종료 날짜/리비전 필터 (blame, log, explain)
  --group-by <period>   그룹 단위: day | week | month (log, 기본: week)
  --commit <hash>       특정 커밋 분석 (explain)
  --raw                 JSON 원본 출력 (파이프/비TTY 환경에서 자동 적용)
  --json                --raw의 별칭 (spec set에서는 JSON 값 파싱에도 사용)
  -h, --help            도움말`);
}

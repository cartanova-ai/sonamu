import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { loadSchema } from "../core/loader.js";
import type {
  CddProject,
  DelegatePayload,
  SchemaDocument,
  SpecNode,
  SpecStatus,
} from "../core/types.js";
import { STATUS_ORDER } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

export interface AdvanceOptions {
  commit?: boolean;
}

interface GateFailure {
  field: string;
  message: string;
}

interface CommandExecutionResult {
  command: string;
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

interface ValidationTestRunResult {
  mode: "sonamu" | "vitest";
  statusCheck: CommandExecutionResult;
  testRun: CommandExecutionResult;
}

export function runAdvance(
  specRef: string | undefined,
  project: CddProject,
  options: AdvanceOptions = {},
): OutputResult {
  if (!specRef) {
    console.error("사용법: cdd advance <spec> [--commit]");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const currentIdx = STATUS_ORDER.indexOf(spec.document.status);

  if (currentIdx === STATUS_ORDER.length - 1) {
    return {
      data: {
        path: path.relative(project.projectRoot, spec.path),
        status: spec.document.status,
      },
      pretty() {
        console.log(chalk.yellow(`이미 최종 상태입니다: ${spec.document.status}`));
      },
      exitCode: 1,
    };
  }

  const nextStatus = STATUS_ORDER[currentIdx + 1];
  const schema = loadSchema(spec.document.schema, project);
  const failures = checkGateLayer1(spec, nextStatus, project, schema);

  if (failures.length > 0) {
    const relPath = path.relative(project.projectRoot, spec.path);
    return {
      data: {
        path: relPath,
        currentStatus: spec.document.status,
        targetStatus: nextStatus,
        failures,
      },
      pretty() {
        console.log(chalk.yellow(`현재: ${spec.document.status}`));
        console.log(chalk.red("게이트 체크 실패:"));
        for (const f of failures) {
          console.log(chalk.yellow(`  - [${f.field}] ${f.message}`));
        }
        console.log(chalk.red("전환 차단됨"));
      },
      exitCode: 1,
    };
  }

  const hasLayer2 = needsLayer2(nextStatus);

  if (hasLayer2 && !options.commit) {
    const payload = buildDelegatePayload(spec, nextStatus, project, schema);
    return {
      data: payload,
      pretty() {
        console.log(chalk.yellow(`현재: ${spec.document.status}`));
        console.log(chalk.green(`Layer 1 통과. Layer 2 검증이 필요합니다.`));
        console.log(chalk.dim("delegate payload:"));
        console.log(JSON.stringify(payload, null, 2));
      },
    };
  }

  return commitTransition(spec, nextStatus, project);
}

function commitTransition(
  spec: SpecNode,
  nextStatus: SpecStatus,
  project: CddProject,
): OutputResult {
  const doc = { ...spec.document };
  doc.status = nextStatus;
  fs.writeFileSync(spec.path, `${JSON.stringify(doc, null, 2)}\n`);

  const relPath = path.relative(project.projectRoot, spec.path);
  return {
    data: { path: relPath, from: spec.document.status, to: nextStatus },
    pretty() {
      console.log(chalk.yellow(`현재: ${spec.document.status}`));
      console.log(chalk.green(`전환: ${spec.document.status} → ${nextStatus}`));
    },
  };
}

function needsLayer2(target: SpecStatus): boolean {
  return (
    target === "specifying" ||
    target === "implementing" ||
    target === "validating" ||
    target === "done"
  );
}

// --- Layer 1 Gate ---

function checkGateLayer1(
  spec: SpecNode,
  target: SpecStatus,
  project: CddProject,
  schema: SchemaDocument | null,
): GateFailure[] {
  const failures: GateFailure[] = [];
  // schema-driven 동적 필드 접근을 위해 Record로 캐스팅
  const doc = spec.document as unknown as Record<string, unknown>;

  switch (target) {
    case "specifying":
      gateSpecifying(spec, doc, schema, failures);
      break;

    case "implementing":
      gateImplementing(doc, schema, failures);
      break;

    case "validating":
      gateValidating(doc, project, failures);
      break;

    case "done":
      gateDone(doc, project, failures);
      break;
  }

  return failures;
}

function gateSpecifying(
  spec: SpecNode,
  doc: Record<string, unknown>,
  schema: SchemaDocument | null,
  failures: GateFailure[],
): void {
  if (spec.resolvedContracts.length === 0) {
    failures.push({
      field: "contracts",
      message: "contracts 필드가 비어 있거나 유효한 Contract를 참조하지 않습니다",
    });
  }

  // schema required 필드가 Spec에 존재하고 비어있지 않은지 검증
  if (schema) {
    for (const field of schema.fields) {
      if (!field.required) continue;
      const value = doc[field.name];
      validateSchemaField(field.name, field.type, value, failures);
    }
  }

  // 고정 필드 검증
  const summary = doc.summary as string | undefined;
  if (!summary || summary.length === 0) {
    failures.push({ field: "summary", message: "summary가 비어 있습니다" });
  }

  const description = doc.description as string[] | undefined;
  if (!description || description.length === 0) {
    failures.push({ field: "description", message: "description이 비어 있습니다" });
  }

  const ac = doc.acceptanceCriteria as Array<Record<string, unknown>> | undefined;
  if (!ac || ac.length === 0) {
    failures.push({
      field: "acceptanceCriteria",
      message: "acceptanceCriteria가 비어 있습니다",
    });
  } else {
    for (const item of ac) {
      if (!item.id || (typeof item.id === "string" && item.id.length === 0)) {
        failures.push({
          field: "acceptanceCriteria",
          message: "AC의 id가 비어 있습니다",
        });
      }
      if (!item.condition || (typeof item.condition === "string" && item.condition.length === 0)) {
        failures.push({
          field: "acceptanceCriteria",
          message: `AC "${item.id ?? "?"}": condition이 비어 있습니다`,
        });
      }
    }
  }
}

function gateImplementing(
  doc: Record<string, unknown>,
  schema: SchemaDocument | null,
  failures: GateFailure[],
): void {
  // 고정 필드 검증
  const summary = doc.summary as string | undefined;
  if (!summary || summary.length === 0) {
    failures.push({ field: "summary", message: "summary가 비어 있습니다" });
  }

  const description = doc.description as string[] | undefined;
  if (!description || description.length === 0) {
    failures.push({ field: "description", message: "description이 비어 있습니다" });
  }

  const ac = doc.acceptanceCriteria as Array<Record<string, unknown>> | undefined;
  if (!ac || ac.length === 0) {
    failures.push({
      field: "acceptanceCriteria",
      message: "acceptanceCriteria가 비어 있습니다",
    });
  } else {
    for (const item of ac) {
      if (!item.id || (typeof item.id === "string" && item.id.length === 0)) {
        failures.push({
          field: "acceptanceCriteria",
          message: `AC의 id가 비어 있습니다`,
        });
      }
      if (!item.condition || (typeof item.condition === "string" && item.condition.length === 0)) {
        failures.push({
          field: "acceptanceCriteria",
          message: `AC "${item.id ?? "?"}": condition이 비어 있습니다`,
        });
      }
    }
  }

  // schema-driven 커스텀 필드 검증
  if (schema) {
    for (const field of schema.fields) {
      if (!field.required) continue;
      const value = doc[field.name];
      validateSchemaField(field.name, field.type, value, failures);
    }
  }
}

function validateSchemaField(
  name: string,
  type: string,
  value: unknown,
  failures: GateFailure[],
): void {
  if (type === "string[]") {
    if (!Array.isArray(value) || value.length === 0) {
      failures.push({ field: name, message: `${name}가 비어 있습니다` });
      return;
    }
    for (const [i, item] of value.entries()) {
      if (typeof item !== "string" || item.length === 0) {
        failures.push({
          field: name,
          message: `${name}[${i}]가 빈 문자열입니다`,
        });
      }
    }
  } else if (type.startsWith("Record<")) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      failures.push({ field: name, message: `${name}가 비어 있습니다` });
      return;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      failures.push({ field: name, message: `${name}가 비어 있습니다` });
      return;
    }
    if (type === "Record<string, string>") {
      for (const [key, val] of entries) {
        if (typeof val !== "string" || val.length === 0) {
          failures.push({
            field: name,
            message: `${name}["${key}"]가 빈 문자열입니다`,
          });
        }
      }
    }
  } else if (type === "string") {
    if (typeof value !== "string" || value.length === 0) {
      failures.push({ field: name, message: `${name}가 비어 있습니다` });
    }
  }
}

function useTestRef(doc: Record<string, unknown>): boolean {
  return doc.useTestRef !== false;
}

function gateValidating(
  doc: Record<string, unknown>,
  project: CddProject,
  failures: GateFailure[],
): void {
  const sources = doc.sources as string[];
  if (sources.length === 0) {
    failures.push({ field: "sources", message: "sources가 비어 있습니다" });
  }
  for (const source of sources) {
    const resolved = path.resolve(project.projectRoot, source);
    if (!fs.existsSync(resolved)) {
      failures.push({
        field: "sources",
        message: `sources 파일이 존재하지 않습니다: "${source}"`,
      });
    }
  }

  if (!useTestRef(doc)) {
    return;
  }

  const ac = doc.acceptanceCriteria as Array<Record<string, unknown>>;
  for (const item of ac) {
    const testRef = item.testRef as { target?: string; pattern?: string } | undefined;
    if (!testRef?.target || testRef.target.length === 0) {
      failures.push({
        field: "acceptanceCriteria",
        message: `AC "${item.id}": testRef.target이 지정되지 않았습니다`,
      });
    } else {
      const testPath = path.resolve(project.projectRoot, testRef.target);
      if (!fs.existsSync(testPath)) {
        failures.push({
          field: "acceptanceCriteria",
          message: `AC "${item.id}": 테스트 파일 없음: "${testRef.target}"`,
        });
      }
    }
  }

  if (failures.length > 0) {
    return;
  }

  const testRun = runValidationTests(project.projectRoot);
  if (testRun.testRun.status !== 0) {
    failures.push({
      field: "tests",
      message: formatTestExecutionFailure(testRun),
    });
  }
}

function gateDone(
  doc: Record<string, unknown>,
  project: CddProject,
  failures: GateFailure[],
): void {
  if (!useTestRef(doc)) {
    return;
  }

  const ac = doc.acceptanceCriteria as Array<Record<string, unknown>>;

  for (const item of ac) {
    const testRef = item.testRef as { target?: string; pattern?: string } | undefined;
    if (!testRef?.target) {
      failures.push({
        field: "acceptanceCriteria",
        message: `AC "${item.id}": testRef.target이 지정되지 않았습니다`,
      });
      continue;
    }
    const testPath = path.resolve(project.projectRoot, testRef.target);
    if (!fs.existsSync(testPath)) {
      failures.push({
        field: "acceptanceCriteria",
        message: `AC "${item.id}": 테스트 파일 없음: "${testRef.target}"`,
      });
      continue;
    }

    if (!testRef.pattern || testRef.pattern.length === 0) {
      failures.push({
        field: "acceptanceCriteria",
        message: `AC "${item.id}": testRef.pattern이 비어 있습니다`,
      });
      continue;
    }

    // pattern이 테스트 파일 내에서 매칭되는지 확인
    const content = fs.readFileSync(testPath, "utf-8");
    try {
      const regex = new RegExp(testRef.pattern);
      if (!regex.test(content)) {
        failures.push({
          field: "acceptanceCriteria",
          message: `AC "${item.id}": testRef.pattern "${testRef.pattern}"이 테스트 파일에서 매칭되지 않습니다`,
        });
      }
    } catch {
      failures.push({
        field: "acceptanceCriteria",
        message: `AC "${item.id}": testRef.pattern "${testRef.pattern}"이 유효한 정규식이 아닙니다`,
      });
    }
  }
}

// --- Delegate Payload ---

function buildDelegatePayload(
  spec: SpecNode,
  target: SpecStatus,
  project: CddProject,
  schema: SchemaDocument | null,
): DelegatePayload {
  const relSpecPath = path.relative(project.projectRoot, spec.path);
  const doc = spec.document;

  const contractRelPaths = spec.resolvedContracts.map((c) => path.relative(project.projectRoot, c));

  const schemaRelPath = schema
    ? path.relative(
        project.projectRoot,
        path.join(project.contractDir, "schemas", `${schema.id}.schema.json`),
      )
    : "";

  const sources = doc.sources ?? [];
  const shouldUseTestRef = doc.useTestRef !== false;
  const testFiles = shouldUseTestRef
    ? (doc.acceptanceCriteria ?? [])
        .map((ac) => ac.testRef?.target)
        .filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];

  const { instruction, checks } = buildLayer2Content(target, shouldUseTestRef);

  return {
    mode: "delegate",
    gate: { layer1: "pass", target, spec: relSpecPath },
    instruction,
    references: {
      spec: relSpecPath,
      schema: schemaRelPath,
      contracts: contractRelPaths,
      sources,
      testFiles: [...new Set(testFiles)],
    },
    checks,
  };
}

function buildLayer2Content(
  target: SpecStatus,
  shouldUseTestRef: boolean,
): { instruction: string; checks: string[] } {
  switch (target) {
    case "specifying":
      return {
        instruction:
          "다음 Spec의 내용이 스키마 필드 정의에 부합하는지 검증하세요. references의 파일들을 읽고 아래 checks를 수행하세요.",
        checks: [
          "A. 스키마 필드별 내용 검증: references.schema를 읽고, 각 required 필드의 name/type과 description이 있으면 그 설명까지 함께 기준으로 삼아 Spec의 해당 필드가 의도된 내용을 담고 있는지 검증.",
          "B. AC 검증: 각 AC condition이 pass/fail 판정 가능한 구체적 조건인가, 모호한 표현이 없는가",
          "C. Contract 정합성: Spec이 참조 Contract의 features/businessRules 범위 내에서 작성되었는가, Contract에 없는 범위를 포함하지 않는가",
        ],
      };

    case "implementing":
      return {
        instruction:
          "다음 Spec이 구현 단계로 진입할 준비가 되었는지 스키마 필드 정의와 Contract 범위를 기준으로 검증하세요. references의 파일들을 읽고 아래 checks를 수행하세요.",
        checks: [
          "A. 스키마 필드별 내용 검증: references.schema를 읽고, 각 required 필드의 name/type과 description이 있으면 그 설명까지 함께 기준으로 삼아 Spec의 해당 필드가 의미적으로 잘 작성되어 있는가 검증. Contract의 features/businessRules 범위와 정합하는가, 필드 간 상호 참조가 일관적인가 확인.",
          "B. AC 검증: 각 AC condition이 pass/fail 판정 가능한 구체적 조건인가, 모호한 표현이 없는가",
          "C. 전체 일관성: Spec이 Contract에 없는 범위를 포함하지 않는가, 필수 필드들이 하나의 기능 명세로서 빈틈 없이 연결되는가",
        ],
      };

    case "validating":
      return {
        instruction: shouldUseTestRef
          ? "다음 Spec의 구현이 완료되었는지 스키마 필드 정의와 AC 의미를 기준으로 검증하세요. references의 파일들을 읽고 아래 checks를 수행하세요."
          : "다음 Spec의 구현이 완료되었는지 스키마 필드 정의와 AC 의미를 기준으로 검증하세요. 이 Spec은 useTestRef=false 이므로 testRef 매칭 검증 없이 references의 파일들을 읽고 아래 checks를 수행하세요.",
        checks: shouldUseTestRef
          ? [
              "A. 구현 완료 검증: references.schema를 읽고, 각 required 필드의 name/type과 description이 있으면 그 설명까지 함께 기준으로 삼아 sources의 코드가 명세를 구현하는가 확인",
              "B. 테스트 매칭 검증: 각 AC의 testRef.target 파일 내에서 testRef.pattern에 매칭되는 테스트가 있는가, 해당 테스트가 AC condition의 의미를 정확히 검증하는가 (vacuous test 아닌가)",
              "C. 명세-코드 일관성: 스키마 필드에 기술된 흐름/구조가 코드에 반영되었는가",
            ]
          : [
              "A. 구현 완료 검증: references.schema를 읽고, 각 required 필드의 name/type과 description이 있으면 그 설명까지 함께 기준으로 삼아 sources의 코드가 명세를 구현하는가 확인",
              "B. AC 의미 검증: 각 AC condition의 핵심 동작이 sources의 구현과 사용자 흐름에 반영되었는가 확인",
              "C. 명세-코드 일관성: 스키마 필드에 기술된 흐름/구조와 제약이 코드에 반영되었는가",
            ],
      };

    case "done":
      return {
        instruction: shouldUseTestRef
          ? "최종 검증: 모든 AC가 충족되었는지 확인하세요. references의 파일들을 읽고 아래 checks를 수행하세요."
          : "최종 검증: 모든 AC가 충족되었는지 확인하세요. 이 Spec은 useTestRef=false 이므로 testRef 기반 의미 매칭 없이 references의 파일들을 읽고 아래 checks를 수행하세요.",
        checks: shouldUseTestRef
          ? [
              "A. AC-테스트 의미적 매칭: 각 테스트가 AC condition을 정확히 검증하는지 의미적 확인",
              "B. 제약 조건 반영: references.schema를 읽고, 제약 관련 필드가 코드에 반영되었는지 확인",
              "C. 실패 시나리오 커버리지: references.schema를 읽고, 에러 처리 관련 필드에 정의된 실패 시나리오가 테스트되었는지 확인",
            ]
          : [
              "A. AC 충족 여부: 각 AC condition의 핵심 동작이 sources의 구현과 사용자 흐름에서 충족되는지 확인",
              "B. 제약 조건 반영: references.schema를 읽고, 제약 관련 필드가 코드에 반영되었는지 확인",
              "C. 실패 시나리오 반영: references.schema를 읽고, 에러 처리 관련 필드에 정의된 실패 시나리오가 코드 또는 화면 흐름에 반영되었는지 확인",
            ],
      };

    default:
      return { instruction: "", checks: [] };
  }
}

function runValidationTests(projectRoot: string): ValidationTestRunResult {
  const statusCheck = runPnpmCommand(projectRoot, ["sonamu", "test", "-s"]);
  const statusOutput = stripAnsi(`${statusCheck.stdout}\n${statusCheck.stderr}`);
  const useSonamu = statusCheck.status === 0 && /ready:\s*true\b/.test(statusOutput);

  const testRun = useSonamu
    ? runPnpmCommand(projectRoot, ["sonamu", "test"])
    : runPnpmCommand(projectRoot, ["test"]);

  return {
    mode: useSonamu ? "sonamu" : "vitest",
    statusCheck,
    testRun,
  };
}

function runPnpmCommand(projectRoot: string, args: string[]): CommandExecutionResult {
  const result = spawnSync("pnpm", args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
  });

  return {
    command: `pnpm ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function formatTestExecutionFailure(result: ValidationTestRunResult): string {
  const detail = summarizeCommandOutput(result.testRun);
  const mode =
    result.mode === "sonamu"
      ? "DevRunner 준비 확인 후 pnpm sonamu test를 실행했습니다"
      : "DevRunner readiness를 확인하지 못해 pnpm test로 fallback했습니다";

  if (result.testRun.error) {
    return `테스트 실행 실패: ${result.testRun.command} (${mode}). ${result.testRun.error.message}`;
  }

  const statusText =
    result.testRun.status === null
      ? "종료 코드를 확인하지 못했습니다"
      : `exit ${result.testRun.status}`;
  return `테스트 실행 실패: ${result.testRun.command} (${statusText}). ${mode}. ${detail}`;
}

function summarizeCommandOutput(result: CommandExecutionResult): string {
  const merged = stripAnsi(`${result.stderr}\n${result.stdout}`)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (merged.length === 0) {
    return "명령 출력이 비어 있습니다.";
  }

  return merged.slice(0, 3).join(" / ");
}

function stripAnsi(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\u001b" && value[index + 1] === "[") {
      let cursor = index + 2;

      while (cursor < value.length) {
        const char = value[cursor];
        if ((char >= "0" && char <= "9") || char === ";") {
          cursor += 1;
          continue;
        }
        break;
      }

      if (value[cursor] === "m") {
        index = cursor;
        continue;
      }
    }

    result += value[index];
  }

  return result;
}

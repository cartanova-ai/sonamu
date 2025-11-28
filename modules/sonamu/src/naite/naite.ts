/** biome-ignore-all lint/suspicious/noExplicitAny: Naite는 expect와 호응하도록 any를 허용함 */

import { get } from "radashi";
import { Sonamu } from "../api/sonamu";
import type { ComparisonOperator } from "../database/puri.types";

// StackFrame 타입
interface StackFrame {
  functionName: string | null;
  filePath: string; // "/Users/.../syncer.ts" 또는 "node:internal/..."
  lineNumber: number; // TS 파일 기준 라인 번호
}

// NaiteTrace 타입
interface NaiteTrace {
  key: string;
  data: any;
  stack: StackFrame[]; // 콜스택 정보
  at: Date;
}

// Naite.t가 저장되는 타입 (항상 배열로 통일)
export type NaiteStore = Map<string, NaiteTrace[]>;

/**
 * 콜스택을 파싱하여 StackFrame 배열로 반환
 * - extractCallStack 자신과 Naite.t는 제외
 * - runWithContext/runWithMockContext 발견 시 거기서 종료
 * - node: 내부 경로는 포함하되, lineNumber는 path에 : 포함 시 붙이지 않음
 */
function extractCallStack(): StackFrame[] {
  const stack = new Error().stack;
  if (!stack) return [];

  const lines = stack.split("\n");

  // [0]: "Error"
  // [1]: "at extractCallStack"
  // [2]: "at Naite.t"
  // [3]: 실제 호출 위치부터 시작
  const frames = lines
    .slice(3)
    .map(parseStackFrame)
    .filter((frame): frame is StackFrame => frame !== null);

  // runWithContext 계열 함수 발견 시 거기서 자르기
  const contextIndex = frames.findIndex(
    (f) =>
      f.functionName?.includes("runWithContext") || f.functionName?.includes("runWithMockContext"),
  );

  return contextIndex >= 0 ? frames.slice(0, contextIndex + 1) : frames;
}

/**
 * 콜스택 한 줄을 파싱
 * 형식: "at FunctionName (filePath:lineNumber:columnNumber)"
 */
function parseStackFrame(line: string): StackFrame | null {
  // 패턴: "at FunctionName (filePath:lineNumber:columnNumber)"
  const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
  if (!match) return null;

  const functionName = match[1];
  const filePath = match[2];
  const lineNumberStr = match[3];

  // filePath에 이미 :가 포함되어 있으면 (예: "node:internal/...")
  // lineNumber를 붙이지 않고 0으로 설정
  if (filePath.includes(":")) {
    return {
      functionName,
      filePath,
      lineNumber: 0,
    };
  }

  return {
    functionName,
    filePath,
    lineNumber: Number.parseInt(lineNumberStr, 10),
  };
}

/**
 * wildcard 패턴 매칭
 * 예시:
 * - "syncer:*" → "syncer:a", "syncer:a:b" 모두 매칭
 * - "syncer:*:user" → "syncer:renderTemplate:user" 매칭
 * - "syncer:renderTemplate:*" → "syncer:renderTemplate:service" 매칭
 */
function matchesPattern(key: string, pattern: string): boolean {
  const keyParts = key.split(":");
  const patternParts = pattern.split(":");

  // 마지막이 * → prefix 매칭 (길이 무관)
  // 예: "syncer:*"는 "syncer:a", "syncer:a:b" 모두 매칭
  if (patternParts[patternParts.length - 1] === "*") {
    const prefixParts = patternParts.slice(0, -1);
    // prefix가 모두 일치하는지 확인
    return prefixParts.every((part, i) => part === keyParts[i]);
  }

  // 길이가 같아야 함
  if (patternParts.length !== keyParts.length) {
    return false;
  }

  // 각 파트가 * 또는 정확히 일치
  return patternParts.every((part, i) => part === "*" || part === keyParts[i]);
}

/**
 * NaiteQuery 클래스
 * 체이닝을 통한 trace 필터링 및 조회
 */
export class NaiteQuery {
  constructor(private traces: NaiteTrace[]) {}

  /**
   * 파일명으로 필터링
   * @param fileName 파일명 (예: "syncer.test.ts")
   */
  fromFile(fileName: string): NaiteQuery {
    const filtered = this.traces.filter((t) =>
      t.stack.some((frame) => frame.filePath.endsWith(`/${fileName}`)),
    );
    return new NaiteQuery(filtered);
  }

  /**
   * 함수명으로 필터링
   * @param funcName 함수명 (includes 체크)
   * @param options.from 'direct' = 직접 호출만, 'indirect' = 간접 호출만, 'both' = 모두
   */
  fromFunction(
    funcName: string,
    options: { from: "direct" | "indirect" | "both" } = { from: "both" },
  ): NaiteQuery {
    const filtered = this.traces.filter((t) => {
      if (options.from === "direct") {
        // stack[0]만 확인 (직접 호출)
        return t.stack[0]?.functionName?.includes(funcName);
      }
      if (options.from === "indirect") {
        // stack[1+]에서 확인 (간접 호출)
        return t.stack.slice(1).some((f) => f.functionName?.includes(funcName));
      }
      // 전체 스택에서 확인
      return t.stack.some((f) => f.functionName?.includes(funcName));
    });
    return new NaiteQuery(filtered);
  }

  /**
   * 데이터 경로 기반 필터링
   * @param path radash get 경로 (예: "data.userId")
   * @param operator 비교 연산자
   * @param value 비교값
   */
  where(path: string, operator: ComparisonOperator | "includes", value: any): NaiteQuery {
    const filtered = this.traces.filter((trace) => {
      const actual = get(trace, path) as any;

      switch (operator) {
        case ">":
          return actual > value;
        case "<":
          return actual < value;
        case ">=":
          return actual >= value;
        case "<=":
          return actual <= value;
        case "=":
          return actual === value;
        case "!=":
          return actual !== value;
        case "includes":
          return typeof actual === "string" && actual.includes(value);
        default:
          return false;
      }
    });
    return new NaiteQuery(filtered);
  }

  /**
   * 전체 데이터 배열 반환
   */
  result(): any[] {
    return this.traces.map((t) => t.data);
  }

  /**
   * 첫 번째 데이터 반환
   */
  first(): any | undefined {
    return this.traces[0]?.data;
  }

  /**
   * 마지막 데이터 반환
   */
  last(): any | undefined {
    return this.traces[this.traces.length - 1]?.data;
  }

  /**
   * n번째 데이터 반환
   */
  at(index: number): any | undefined {
    return this.traces[index]?.data;
  }

  /**
   * 원본 trace 배열 반환 (디버깅/NaiteViewer용)
   */
  getTraces(): NaiteTrace[] {
    return this.traces;
  }
}

// Naite 싱글턴 객체 (추후 logger 연결 등의 상태 관리 필요성 고려)
export class NaiteClass {
  // 테스트 로그 기록
  t(name: string, value: any) {
    // 이 t 함수는 테스트 환경에서만 작동해야 합니다.
    // 그리고 테스트 환경 판단에 왜 isTest() 함수를 사용하지 않았냐면요,,
    // 이렇게 하는게 유틸 함수 불러와서 사용하는 것보다 조금이나마 빠를 것 같았기 때문입니다.
    if (process.env.NODE_ENV !== "test") {
      return;
    }

    try {
      const context = Sonamu.getContext();
      const store = context?.naiteStore;

      if (!store) {
        return;
      }

      // 콜스택 수집
      const stack = extractCallStack();

      const trace: NaiteTrace = {
        key: name,
        data: value,
        stack,
        at: new Date(),
      };

      // 항상 배열로 관리
      const existing = store.get(name) ?? [];
      store.set(name, [...existing, trace]);
    } catch {
      // Context 없는 상황에서 Naite.t 호출
    }
  }

  /**
   * key 또는 wildcard 패턴으로 trace 조회
   * 항상 NaiteQuery 반환하여 체이닝 가능
   */
  get(keyPattern: string): NaiteQuery {
    const context = Sonamu.getContext();
    const store = context?.naiteStore;

    if (!store) {
      return new NaiteQuery([]);
    }

    // wildcard 없으면 exact match
    if (!keyPattern.includes("*")) {
      const traces = store.get(keyPattern) ?? [];
      return new NaiteQuery(traces);
    }

    // wildcard 패턴 매칭
    const allTraces: NaiteTrace[] = [];
    for (const [key, traces] of store.entries()) {
      if (matchesPattern(key, keyPattern)) {
        allTraces.push(...traces);
      }
    }

    return new NaiteQuery(allTraces);
  }

  // 전체 리스트 가져오기
  getAll(): { [key: string]: any } {
    const context = Sonamu.getContext();
    if (!context?.naiteStore) {
      return {};
    }
    // NaiteTrace 배열을 data만 추출하여 반환
    const result: { [key: string]: any } = {};
    for (const [key, traces] of context.naiteStore.entries()) {
      if (key.startsWith("mock:")) {
        // Mock 설정은 그대로 반환
        result[key] = traces;
      } else {
        // NaiteTrace 배열은 data만 추출
        result[key] = traces.map((t: NaiteTrace) => t.data);
      }
    }
    return result;
  }

  // 특정 키 삭제하기
  del(key: string) {
    const context = Sonamu.getContext();
    if (!context?.naiteStore) {
      return;
    }
    context.naiteStore.delete(key);
  }

  createStore(): NaiteStore {
    return new Map<string, NaiteTrace[]>();
  }

  // 일반 로그 레벨
  d(_message: string) {
    // TODO: Logger 연결
    console.log(`[DEBUG] ${_message}`);
  }
  i(_message: string) {
    // TODO: Logger 연결
    console.log(`[INFO] ${_message}`);
  }
  w(_message: string) {
    // TODO: Logger 연결
    console.log(`[WARN] ${_message}`);
  }
  e(_message: string) {
    // TODO: Logger 연결
    console.log(`[ERROR] ${_message}`);
  }
}

export const Naite = new NaiteClass();

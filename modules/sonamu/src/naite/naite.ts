import { getLogger } from "@logtape/logtape";
import { get } from "radashi";

import { Sonamu } from "../api/sonamu";
import { type ComparisonOperator } from "../database/puri.types";
import { convertNaiteKeyToCategory } from "../logger/category";
import { isSerializable } from "../utils/object-utils";
import { isNumberValue, isStringValue } from "../utils/runtime-value";

// StackFrame 타입
interface StackFrame {
  functionName: string | null;
  filePath: string; // "/Users/.../syncer.ts" 또는 "node:internal/..."
  lineNumber: number; // TS 파일 기준 라인 번호
}

// NaiteTrace 타입
interface NaiteTrace {
  key: string;
  data: NaiteData;
  stack: StackFrame[]; // 콜스택 정보
  at: Date;
}

// Naite는 직렬화 가능성 검사를 내보내기 시점에 수행하므로 모든 JavaScript 값을 기록할 수 있습니다.
export type NaiteData = null | undefined | bigint | boolean | number | object | string | symbol;

export interface NaiteEventRegistry {
  actionGenerateServices: readonly object[];
  "fs/promises:rm": {
    path: string;
    options?: object;
  };
  "fs/promises:writeFile": {
    path: string;
    data: string;
  };
  "puri:executed-query": string;
  "puri:ub-batch-updated": {
    tableName: string;
    rowCount: number;
    whereColumns: string[];
  };
  "puri:ub-clean-orphans": {
    tableName: string;
    cleanOrphans: string[];
    deletedCount: number;
  };
  "puri:ub-inherit": {
    tableName: string;
    inheritColumns: string[];
    excludedFromUpdate: string[];
  };
  "puri:ub-ref-resolved": {
    tableName: string;
    field: string;
    from: UBReference;
    to: NaiteData;
  };
  "puri:ub-register": {
    tableName: string;
    uuid: string;
    isUuidReused: boolean;
    row: object & { user_id: UBReference };
  };
  "puri:ub-upserted": {
    tableName: string;
    mode: "insert" | "upsert";
    rowCount: number;
    returnedIds: Array<number | string>;
  };
}

interface UBReference {
  uuid: string;
  of: string;
  use?: string;
}

export interface NaiteResult<Payload> extends Array<Payload> {
  0: Payload;
  1: Payload;
  [index: number]: Payload;
  find<Match extends Payload>(
    predicate: (value: Payload, index: number, values: Payload[]) => value is Match,
  ): Match;
  find(predicate: (value: Payload, index: number, values: Payload[]) => boolean): Payload;
}

type NaiteValuesByKey = Record<string, NaiteTrace[] | Array<NaiteTrace["data"]>>;

// Naite.t가 저장되는 타입 (항상 배열로 통일)
export type NaiteStore = Map<string, NaiteTrace[]>;

// getAllTraces()가 반환하는 직렬화된 trace 타입
// bootstrap.ts의 TaskMeta augmentation, dev-vitest-manager.ts에서도 이 타입을 공유합니다.
export type SerializedTrace = {
  key: string;
  value: unknown;
  filePath: string;
  lineNumber: number;
  at: string;
};

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

  // 콜스택 구조:
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
 * 형식1: "at FunctionName (filePath:lineNumber:columnNumber)"
 * 형식2: "at filePath:lineNumber:columnNumber" (익명 함수/모듈 레벨)
 */
function parseStackFrame(line: string): StackFrame | null {
  // 패턴1: "at FunctionName (filePath:lineNumber:columnNumber)"
  const matchWithFunc = line.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
  if (matchWithFunc) {
    const functionName = matchWithFunc[1];
    const filePath = matchWithFunc[2];
    const lineNumberStr = matchWithFunc[3];

    // filePath에 이미 :가 포함되어 있으면 (예: "node:internal/...")
    if (filePath.includes(":")) {
      return { functionName, filePath, lineNumber: 0 };
    }

    return {
      functionName,
      filePath,
      lineNumber: Number.parseInt(lineNumberStr, 10),
    };
  }

  // 패턴2: "at filePath:lineNumber:columnNumber" (함수명 없음)
  const matchNoFunc = line.match(/at\s+(.+?):(\d+):\d+$/);
  if (matchNoFunc) {
    const filePath = matchNoFunc[1];
    const lineNumberStr = matchNoFunc[2];

    return {
      functionName: null,
      filePath,
      lineNumber: Number.parseInt(lineNumberStr, 10),
    };
  }

  return null;
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
export class NaiteQuery<Payload extends NaiteData = NaiteData> {
  constructor(private traces: NaiteTrace[]) {}

  private isComparableValue<Value>(value: Value): value is Value & (number | string) {
    return isNumberValue(value) || isStringValue(value);
  }

  /**
   * 파일명으로 필터링
   * @param fileName 파일명 (예: "syncer.test.ts")
   */
  fromFile(fileName: string): NaiteQuery<Payload> {
    const filtered = this.traces.filter((t) =>
      t.stack.some((frame) => frame.filePath.endsWith(`/${fileName}`)),
    );
    return new NaiteQuery<Payload>(filtered);
  }

  /**
   * 함수명으로 필터링
   * @param funcName 함수명 (includes 체크)
   * @param options.from 'direct' = 직접 호출만, 'indirect' = 간접 호출만, 'both' = 모두
   */
  fromFunction(
    funcName: string,
    options: { from: "direct" | "indirect" | "both" } = { from: "both" },
  ): NaiteQuery<Payload> {
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
    return new NaiteQuery<Payload>(filtered);
  }

  /**
   * 데이터 경로 기반 필터링
   * @param path radash get 경로 (예: "data.userId")
   * @param operator 비교 연산자
   * @param value 비교값
   */
  where<Value extends NaiteData>(
    path: string,
    operator: ComparisonOperator | "includes",
    value: Value,
  ): NaiteQuery<Payload> {
    const filtered = this.traces.filter((trace) => {
      const actual = get(trace, path);

      switch (operator) {
        case ">":
          return this.isComparableValue(actual) && this.isComparableValue(value) && actual > value;
        case "<":
          return this.isComparableValue(actual) && this.isComparableValue(value) && actual < value;
        case ">=":
          return this.isComparableValue(actual) && this.isComparableValue(value) && actual >= value;
        case "<=":
          return this.isComparableValue(actual) && this.isComparableValue(value) && actual <= value;
        case "=":
          return actual === value;
        case "!=":
          return actual !== value;
        case "includes":
          return isStringValue(actual) && isStringValue(value) && actual.includes(value);
        default:
          return false;
      }
    });
    return new NaiteQuery<Payload>(filtered);
  }

  /**
   * 전체 데이터 배열 반환
   */
  result(): NaiteResult<Payload>;
  result(): NaiteData[] {
    return this.traces.map((t) => t.data);
  }

  /**
   * 첫 번째 데이터 반환
   */
  first(): Payload;
  first(): NaiteData {
    return this.traces[0]?.data;
  }

  /**
   * 마지막 데이터 반환
   */
  last(): Payload;
  last(): NaiteData {
    return this.traces[this.traces.length - 1]?.data;
  }

  /**
   * n번째 데이터 반환
   */
  at(index: number): Payload;
  at(index: number): NaiteData {
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
  t<Value extends NaiteData>(name: string, value: Value) {
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
      getLogger(["naite", ...convertNaiteKeyToCategory(name)]).debug(
        `naite: {name} ${existing.length === 0 ? "is empty state" : `already existing with ${existing.length} entries`}, appending new entry`,
        {
          name,
          value,
        },
      );

      store.set(name, [...existing, trace]);
    } catch {
      // Context 없는 상황에서 Naite.t 호출
    }
  }

  /**
   * key 또는 wildcard 패턴으로 trace 조회
   * 항상 NaiteQuery 반환하여 체이닝 가능
   */
  get<Key extends keyof NaiteEventRegistry>(keyPattern: Key): NaiteQuery<NaiteEventRegistry[Key]>;
  get(keyPattern: string): NaiteQuery;
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
  getAll() {
    const context = Sonamu.getContext();
    if (!context?.naiteStore) {
      return {};
    }
    // NaiteTrace 배열을 data만 추출하여 반환
    const result: NaiteValuesByKey = {};
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

  /**
   * 스토어에 들어있던 트레이스를 고대로 꺼내옵니다.
   * 이때 값들은 모두 직렬화 가능한 상태로 나가게 됩니다.
   * 테스트 정보와 함께 extensions에 보낼 용도로 만들었습니다.
   * @returns
   */
  getAllTraces(): SerializedTrace[] {
    const context = Sonamu.getContext();
    if (!context?.naiteStore) {
      return [];
    }

    const traces = Array.from(context.naiteStore.values()).flat();

    // 직렬화 불가능한 값이 존재한다면 이를 대문짝만하게 알려줍니다! 그치만 알리기만 하고 그냥 지나갑니다 ㅎㅎ
    // 왜 직렬화가 중요한가? 이(getAllTraces) 호출의 결과는 외부로 나가게 되는데,
    // 이때 주 용도가 vitest의 task.meta 필드를 통해 afterEach에서 Sonamu extension으로 전달하는 것입니다.
    // 여기서 meta 필드에 담긴 내용은 프로세스간 통신(process.send) 또는 스레드간 통신(message port)을 통해 전달되어야 하는데,
    // 이로 인해 "직렬화 가능한 값들만 허용"하는 제약이 생깁니다.
    //
    // 이 제약을 의식하여 Naite.t에 직렬화 가능한 값만 넘기게 할 수도 있었지만, 그렇게 하면 불편해질 것 같아서 하지 않았습니다.
    // 따라서 현재 Naite.t는 모든 값을 받을 수 있게 되어 있습니다.
    // 대신 이렇게(getAllTraces) 그 값들을 빼낼 때 JSON.stringify를 사용하여 강제로 직렬화 가능하게 만들었습니다,,
    for (const trace of traces) {
      const check = isSerializable(trace.data);
      if (!check.valid) {
        console.warn(
          "\n" +
            "╔════════════════════════════════════════════════════════════════╗\n" +
            "║  [Naite] Non-serializable value detected!                      ║\n" +
            "╠════════════════════════════════════════════════════════════════╣\n" +
            `║  Key: ${trace.key.padEnd(57)}║\n` +
            `║  Reason: ${(check.reason ?? "unknown").slice(0, 54).padEnd(54)}║\n` +
            `║  Location: ${(trace.stack[0]?.filePath ?? "unknown").slice(-51).padEnd(52)}║\n` +
            `║  Line: ${String(trace.stack[0]?.lineNumber ?? 0).padEnd(56)}║\n` +
            "╠════════════════════════════════════════════════════════════════╣\n" +
            "║  Naite.t() accepts any type of value. However, values will     ║\n" +
            "║  be serialized to JSON when exported via Naite.getAllTraces(). ║\n" +
            "╚════════════════════════════════════════════════════════════════╝\n",
        );
      }
    }

    return traces.map((trace) => ({
      key: trace.key,
      value: JSON.parse(JSON.stringify(trace.data ?? "")), // 직렬화 가능한 것만 남기려는 눈물겨운 노력,, 안그러면 task.meta에 들어가서 프로세스간 통신 할 때 문제 생기거든요,,
      filePath: trace.stack[0]?.filePath ?? "",
      lineNumber: trace.stack[0]?.lineNumber ?? 0,
      at: trace.at.toISOString(),
    }));
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
}

export const Naite = new NaiteClass();

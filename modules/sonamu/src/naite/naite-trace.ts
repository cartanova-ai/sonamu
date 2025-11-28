import fs from "fs";
import os from "os";
import path from "path";

/**
 * Naite.t 함수 호출로 등록되는 key-value 쌍을 테스트 실행 정보와 함께 외부 파일로 저장해주는 친구입니다.
 * 이렇게 파일로 저장해두면 외부에서 Naite.t가 방출한 값들을 테스트 정보와 엮어서 쉽게 관찰할 수 있습니다.
 */

const TRACE_DIR = path.join(os.homedir(), ".sonamu");
const TRACE_FILE_PATH = path.join(TRACE_DIR, "naite-traces.json");

export interface TestInfo {
  suite?: string;
  name?: string;
}

export interface NaiteTraceFileEntry {
  key: string;
  value: any;
  filePath: string;
  lineNumber: number;
  at: string;
  runId: string; // 테스트 run 식별자
  testSuite?: string; // 테스트 suite 이름
  testName?: string; // 테스트 케이스 이름
}

export interface NaiteTraceFile {
  version: number;
  currentRunId: string | null;
  runStartedAt: string | null;
  runEndedAt: string | null;
  traces: NaiteTraceFileEntry[];
}

/**
 * 현재 돌아가고 있는 테스트를 구분하는 식별자입니다. 우리가 임의로 만들어줍니다.
 * 얘가 있으면 현재 테스트 파일이 돌아가고 있는 상태인지 알 수 있습니다.
 * 
 * 이 친구는 beforeAll에서 startTestRun 호출을 통해 설정되며,
 * afterAll에서 endTestRun 호출을 통해 초기화됩니다.
 */
let currentRunId: string | null = null;

/**
 * 현재 실행되는 테스트 케이스 정보입니다.
 * 얘가 있으면 appendTrace로 트레이스가 들어왔을 때 테스트 suite와 case 이름을 함께 기록할 수 있습니다.
 * 
 * 이 친구는 beforeEach에서 setCurrentTest 호출을 통해 설정되며,
 * afterEach에서 clearCurrentTest 호출을 통해 초기화됩니다.
 */
let currentTestInfo: TestInfo | null = null;

function getRunId(): string | null {
  if (currentRunId) return currentRunId;

  // 파일에서 확인 (fork된 worker 프로세스 지원)
  try {
    if (!fs.existsSync(TRACE_FILE_PATH)) return null;
    const raw = fs.readFileSync(TRACE_FILE_PATH, "utf-8");
    const content: NaiteTraceFile = JSON.parse(raw);
    // runEndedAt이 없으면 아직 실행 중
    if (content.currentRunId && !content.runEndedAt) {
      return content.currentRunId;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * beforeAll에서 불러주어야 하는 함수입니다.
 * 
 * 여기에서 currentRunId를 설정하고 trace 파일을 초기화합니다.
 */
export function startTestRun(): string {
  currentRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (!fs.existsSync(TRACE_DIR)) {
      fs.mkdirSync(TRACE_DIR, { recursive: true });
    }

    const content: NaiteTraceFile = {
      version: 2,
      currentRunId,
      runStartedAt: new Date().toISOString(),
      runEndedAt: null,
      traces: [],
    };
    fs.writeFileSync(TRACE_FILE_PATH, JSON.stringify(content, null, 2));
  } catch {
    // 파일 I/O 오류 무시
  }

  return currentRunId;
}

/**
 * beforeEach에서 불러주어야 하는 함수입니다.
 * 
 * 여기에서 currentTestInfo를 설정합니다.
 */
export function setCurrentTest(info: TestInfo): void {
  currentTestInfo = info;
}

/**
 * afterEach에서 불러주어야 하는 함수입니다.
 * 
 * 여기에서 currentTestInfo를 초기화합니다.
 */
export function clearCurrentTest(): void {
  currentTestInfo = null;
}

/**
 * afterAll에서 불러주어야 하는 함수입니다.
 * 
 * 여기에서 currentRunId를 초기화하고 trace 파일을 업데이트합니다.
 */
export function endTestRun(): void {
  if (!getRunId()) return;

  try {
    if (fs.existsSync(TRACE_FILE_PATH)) {
      const raw = fs.readFileSync(TRACE_FILE_PATH, "utf-8");
      const content: NaiteTraceFile = JSON.parse(raw);
      content.runEndedAt = new Date().toISOString();
      fs.writeFileSync(TRACE_FILE_PATH, JSON.stringify(content, null, 2));
    }
  } catch {
    // 파일 I/O 오류 무시
  }

  currentRunId = null;
}

/**
 * Naite.t에서 호출되는 함수입니다.
 * 
 * 여기에서 trace 파일에 항목을 추가합니다.
 */
export function appendTrace(entry: Omit<NaiteTraceFileEntry, "runId" | "testSuite" | "testName">): void {
  const runId = getRunId();
  if (!runId) return;

  const fullEntry: NaiteTraceFileEntry = {
    ...entry,
    runId,
    testSuite: currentTestInfo?.suite,
    testName: currentTestInfo?.name,
  };

  // 비동기로 처리하여 테스트 실행 blocking 방지
  setImmediate(() => {
    try {
      if (!fs.existsSync(TRACE_DIR)) {
        fs.mkdirSync(TRACE_DIR, { recursive: true });
      }

      let content: NaiteTraceFile;
      if (fs.existsSync(TRACE_FILE_PATH)) {
        const raw = fs.readFileSync(TRACE_FILE_PATH, "utf-8");
        content = JSON.parse(raw);
      } else {
        content = {
          version: 2,
          currentRunId: runId,
          runStartedAt: new Date().toISOString(),
          runEndedAt: null,
          traces: [],
        };
      }

      content.traces.push(fullEntry);
      fs.writeFileSync(TRACE_FILE_PATH, JSON.stringify(content, null, 2));
    } catch {
      // 파일 I/O 오류 무시
    }
  });
}

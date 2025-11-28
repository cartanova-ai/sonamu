/**
 * NaiteReporter
 *
 * Naite.t 호출 정보를 Unix Socket으로 VS Code extension에 전달합니다.
 * extension이 ~/.sonamu/naite.sock에 소켓 서버를 열어둡니다.
 *
 * fs mock 충돌을 피하기 위해 net 모듈만 사용합니다.
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: Naite는 expect와 호응하도록 any를 허용함 */

import { connect, type Socket } from "net";
import { homedir } from "os";
import { join } from "path";

export interface TestInfo {
  suite?: string;
  name?: string;
}

export interface NaiteTraceEntry {
  key: string;
  value: any;
  filePath: string;
  lineNumber: number;
  at: string;
  runId: string;
  testSuite?: string;
  testName?: string;
}

// 소켓 경로
const SOCKET_PATH =
  process.platform === "win32" ? "\\\\.\\pipe\\naite" : join(homedir(), ".sonamu", "naite.sock");

class NaiteReporterClass {
  private currentRunId: string | null = null;
  private currentTestInfo: TestInfo | null = null;
  private socket: Socket | null = null;
  private connected = false;
  private buffer: string[] = [];
  private seq = 0; // 메시지 순서 보장용

  /**
   * 소켓 연결 시도
   */
  private ensureConnection(): void {
    if (this.connected || this.socket) return;

    try {
      this.socket = connect(SOCKET_PATH);

      this.socket.on("connect", () => {
        this.connected = true;
        // 버퍼에 쌓인 메시지 전송
        for (const msg of this.buffer) {
          this.socket?.write(msg);
        }
        this.buffer = [];
      });

      this.socket.on("error", () => {
        // 연결 실패 무시 (extension이 꺼져있을 수 있음)
        this.connected = false;
        this.socket = null;
      });

      this.socket.on("close", () => {
        this.connected = false;
        this.socket = null;
      });
    } catch {
      // 연결 실패 무시
    }
  }

  /**
   * 메시지 전송 (줄바꿈으로 구분)
   */
  private send(data: object): void {
    const msg = `${JSON.stringify({ ...data, seq: this.seq++ })}\n`;

    this.ensureConnection();

    if (this.connected && this.socket) {
      this.socket.write(msg);
    } else {
      // 연결 대기 중이면 버퍼에 저장
      this.buffer.push(msg);
    }
  }

  /**
   * beforeAll에서 호출합니다.
   * 테스트 run 시작을 알립니다.
   */
  startTestRun(): void {
    if (process.env.CI) {
      return;
    }

    this.currentRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.send({
      type: "run/start",
      runId: this.currentRunId,
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * beforeEach에서 호출합니다.
   * 현재 테스트 정보를 설정합니다.
   */
  setCurrentTest(info: TestInfo): void {
    if (process.env.CI) {
      return;
    }

    this.currentTestInfo = info;

    this.send({
      type: "test/start",
      runId: this.currentRunId,
      suite: info.suite,
      name: info.name,
      at: new Date().toISOString(),
    });
  }

  /**
   * afterEach에서 호출합니다.
   * 현재 테스트 정보를 초기화합니다.
   */
  clearCurrentTest(): void {
    if (process.env.CI) {
      return;
    }

    if (this.currentTestInfo) {
      this.send({
        type: "test/end",
        runId: this.currentRunId,
        suite: this.currentTestInfo.suite,
        name: this.currentTestInfo.name,
        at: new Date().toISOString(),
      });
    }

    this.currentTestInfo = null;
  }

  /**
   * afterAll에서 호출합니다.
   * 테스트 run 종료를 알립니다.
   */
  endTestRun(): void {
    if (process.env.CI) {
      return;
    }

    this.send({
      type: "run/end",
      runId: this.currentRunId,
      endedAt: new Date().toISOString(),
    });

    this.currentRunId = null;

    // 연결 종료
    if (this.socket) {
      this.socket.end();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Naite.t에서 호출됩니다.
   * trace 항목을 extension에 전달합니다.
   * 워커에서 실행될 수 있으므로 runId 체크 없이 항상 전송합니다.
   */
  appendTrace(entry: Omit<NaiteTraceEntry, "runId" | "testSuite" | "testName">): void {
    if (process.env.CI) {
      return;
    }

    this.send({
      type: "trace",
      ...entry,
      runId: this.currentRunId ?? "unknown",
      testSuite: this.currentTestInfo?.suite,
      testName: this.currentTestInfo?.name,
    });
  }
}

export const NaiteReporter = new NaiteReporterClass();

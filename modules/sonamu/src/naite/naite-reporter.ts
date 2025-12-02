/**
 * NaiteReporter
 *
 * 테스트 결과와 Trace 정보를 Unix Socket으로 VS Code extension에 전달합니다.
 * extension이 ~/.sonamu/naite.sock에 소켓 서버를 열어둡니다.
 *
 * fs mock 충돌을 피하기 위해 net 모듈만 사용합니다.
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: Naite는 expect와 호응하도록 any를 허용함 */

import { connect, type Socket } from "net";
import { homedir } from "os";
import { join } from "path";

export interface TestResult {
  suiteName: string;
  suiteFilePath?: string;
  testName: string;
  testFilePath: string;
  testLine: number;
  status: string;
  duration: number;
  error?: { message: string; stack?: string };
  traces: {
    key: string;
    value: any;
    filePath: string;
    lineNumber: number;
    at: string;
  }[];
}

export interface RunSummary {
  startedAt: string;
  endedAt: string;
  duration: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

// 소켓 경로
const SOCKET_PATH =
  process.platform === "win32" ? "\\\\.\\pipe\\naite" : join(homedir(), ".sonamu", "naite.sock");

class NaiteReporterClass {
  private currentRunId: string | null = null;
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
   * 테스트 run 시작을 알립니다 (데이터 클리어 신호).
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
   * afterEach에서 호출합니다.
   * 테스트 케이스 결과를 traces와 함께 전송합니다.
   */
  reportTestResult(result: TestResult): void {
    if (process.env.CI) {
      return;
    }

    this.send({
      type: "test/result",
      runId: this.currentRunId ?? "unknown",
      ...result,
      receivedAt: new Date().toISOString(),
    });
  }

  /**
   * afterAll에서 호출합니다.
   * 테스트 run 종료를 알립니다.
   */
  endTestRun(summary?: RunSummary): void {
    if (process.env.CI) {
      return;
    }

    this.send({
      type: "run/end",
      runId: this.currentRunId,
      endedAt: new Date().toISOString(),
      summary,
    });

    this.currentRunId = null;

    // 연결 종료
    if (this.socket) {
      this.socket.end();
      this.socket = null;
      this.connected = false;
    }
  }
}

export const NaiteReporter = new NaiteReporterClass();

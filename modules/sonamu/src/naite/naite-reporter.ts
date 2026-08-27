/**
 * NaiteReporter
 *
 * 테스트 결과와 Trace 정보를 Unix Socket으로 VS Code extension에 전달합니다.
 * extension이 ~/.sonamu/naite-{hash}.sock에 소켓 서버를 열어둡니다.
 *
 * 프로젝트별로 고유한 소켓을 사용하기 위해 sonamu.config.ts 경로의 해시를 사용합니다.
 *
 * 모듈 싱글턴이지만 인스턴스는 프로세스마다 별개입니다. run/start·run/end는
 * Vitest 메인 프로세스(NaiteVitestReporter 커스텀 리포터)에서, test/result는
 * 각 worker 프로세스(bootstrap의 afterEach)에서 전송되므로 buffer와 소켓
 * 연결을 서로 공유하지 않습니다.
 *
 * fs mock 충돌을 피하기 위해 net 모듈만 사용합니다.
 */
/* oxlint-disable @typescript-eslint/no-explicit-any */ // Naite는 expect와 호응하도록 any를 허용함

import { createHash } from "crypto";
import { connect } from "net";
import { type Socket } from "net";
import { homedir } from "os";
import { join } from "path";

import { findApiRootPath } from "../utils/utils";
import { type NaiteMessagingTypes } from "./messaging-types";

/**
 * sonamu.config.ts 경로를 받아서 프로젝트별 고유 해시를 생성합니다.
 * 익스텐션과 동일한 방식으로 계산해야 합니다.
 */
function getProjectHash(configPath: string): string {
  return createHash("md5").update(configPath).digest("hex").slice(0, 8);
}

/**
 * 현재 프로젝트의 소켓 경로를 계산합니다.
 * Sonamu.apiRootPath가 설정된 후에 호출해야 합니다.
 */
function getSocketPath(): string {
  // sonamu.config.ts의 절대 경로 계산
  // apiRootPath는 /project/api 형태이고, config는 /project/api/src/sonamu.config.ts에 있음
  const configPath = join(findApiRootPath(), "src", "sonamu.config.ts");
  const hash = getProjectHash(configPath);

  return process.platform === "win32"
    ? `\\\\.\\pipe\\naite-${hash}`
    : join(homedir(), ".sonamu", `naite-${hash}.sock`);
}

/**
 * 연결 실패가 지속될 때(extension 미실행 등) buffer가 무한히 커지지 않도록
 * 최근 메시지만 이 개수만큼 유지합니다.
 */
const MAX_BUFFERED_MESSAGES = 1000;

class NaiteReporterClass {
  private socketPath: string | null = null;
  private socket: Socket | null = null;
  private connected = false;
  private buffer: string[] = [];

  /**
   * 소켓 연결 시도
   */
  private async ensureConnection(): Promise<void> {
    if (this.connected || this.socket) {
      return;
    }

    return new Promise((res, rej) => {
      if (!this.socketPath) {
        this.socketPath = getSocketPath();
      }
      this.socket = connect(this.socketPath);

      this.socket.on("connect", () => {
        this.connected = true;
        // 버퍼에 쌓인 메시지 전송
        for (const msg of this.buffer) {
          this.socket?.write(msg);
        }
        this.buffer = [];
        res();
      });

      this.socket.on("error", (e) => {
        // 연결 실패 무시 (extension이 꺼져있을 수 있음)
        this.connected = false;
        this.socket = null;
        rej(e);
      });

      this.socket.on("close", () => {
        this.connected = false;
        this.socket = null;
      });
    });
  }

  /**
   * 메시지 전송 (줄바꿈으로 구분)
   */
  private async send(data: NaiteMessagingTypes.NaiteMessage): Promise<void> {
    const msg = `${JSON.stringify(data)}\n`;

    await this.ensureConnection().catch(() => {});

    if (this.connected && this.socket) {
      this.socket.write(msg);
    } else {
      // 연결 대기 중이면 버퍼에 저장, 상한 초과 시 오래된 메시지부터 폐기
      this.buffer.push(msg);
      if (this.buffer.length > MAX_BUFFERED_MESSAGES) {
        this.buffer.shift();
      }
    }
  }

  /**
   * Vitest 커스텀 리포터(NaiteVitestReporter)의 onTestRunStart에서 호출합니다.
   * 테스트 run 시작을 알립니다 (데이터 클리어 신호).
   */
  async startTestRun(): Promise<void> {
    if (process.env.CI) {
      return;
    }

    await this.send({
      type: "run/start",
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * bootstrap()의 afterEach에서 호출합니다.
   * 테스트 케이스 결과를 traces와 함께 전송합니다.
   */
  async reportTestResult(
    result: Omit<NaiteMessagingTypes.TestResult, "receivedAt">,
  ): Promise<void> {
    if (process.env.CI) {
      return;
    }

    await this.send({
      type: "test/result",
      receivedAt: new Date().toISOString(),
      ...result,
    });
  }

  /**
   * Vitest 커스텀 리포터(NaiteVitestReporter)의 onTestRunEnd에서 호출합니다.
   * 테스트 run 종료를 알립니다.
   */
  async endTestRun(): Promise<void> {
    if (process.env.CI) {
      return;
    }

    await this.send({
      type: "run/end",
      endedAt: new Date().toISOString(),
    });

    // 연결 종료
    if (this.socket) {
      this.socket.end();
      this.socket = null;
      this.connected = false;
    }
  }
}

export const NaiteReporter = new NaiteReporterClass();

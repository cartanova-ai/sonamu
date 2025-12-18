// biome-ignore-all lint/suspicious/noExplicitAny: Naite는 expect와 호응하도록 any를 허용함

/**
 * Sonamu extension과 공유하는 Naite 메시징 관련 타입 정의들입니다.
 * 이 파일은 cartanova-ai/sonamu와 cartanova-ai/vscode-sonamu에서 공통으로 사용됩니다.
 */
export namespace NaiteMessagingTypes {
  export type NaiteRunStartMessage = {
    type: "run/start";
    startedAt: string;
  };

  export type NaiteTestResultMessage = {
    type: "test/result";
    receivedAt: string;
  } & TestResult;

  export type NaiteRunEndMessage = {
    type: "run/end";
    endedAt: string;
  };

  export type NaiteMessage = NaiteRunStartMessage | NaiteTestResultMessage | NaiteRunEndMessage;

  export type NaiteTrace = {
    key: string;
    value: any;
    filePath: string;
    lineNumber: number;
    at: string;
  };

  export type TestError = {
    message: string;
    stack?: string;
  };

  export type TestResult = {
    suiteName: string;
    suiteFilePath?: string;
    testName: string;
    testFilePath: string;
    testLine: number;
    status: string;
    duration: number;
    error?: TestError;
    traces: NaiteTrace[];
    receivedAt: string;
  };
}

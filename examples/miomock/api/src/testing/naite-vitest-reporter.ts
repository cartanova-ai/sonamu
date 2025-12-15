import { NaiteReporter } from "sonamu";
import type { Reporter } from "vitest/reporters";

/**
 * Naite Vitest Reporter
 *
 * 테스트 런 시작/종료를 정확히 감지하여 NaiteReporter에 알립니다.
 * - onTestRunStart: 테스트 런 시작 시 (첫 실행 및 watch 재실행 포함)
 * - onTestRunEnd: 각 런 종료 시
 */
const NaiteVitestReporter: Reporter = {
  async onTestRunStart() {
    await NaiteReporter.startTestRun();
  },

  async onTestRunEnd() {
    await NaiteReporter.endTestRun();
  },
};

export default NaiteVitestReporter;

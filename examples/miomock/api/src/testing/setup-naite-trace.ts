import { NaiteReporter } from "sonamu";
import { afterEach, beforeEach } from "vitest";

/**
 * Naite의 trace가 파일에 잘 기록될 수 있도록 테스트 case 전후에 적절한 작업을 해줍니다.
 *
 * 참고: startTestRun/endTestRun은 naite-vitest-reporter.ts에서 처리합니다.
 */

beforeEach((context) => {
  NaiteReporter.setCurrentTest({
    suite: context.task.suite?.name,
    name: context.task.name,
    filePath: context.task.file?.filepath,
    line: context.task.location?.line,
  });
});

afterEach(() => {
  NaiteReporter.clearCurrentTest();
});

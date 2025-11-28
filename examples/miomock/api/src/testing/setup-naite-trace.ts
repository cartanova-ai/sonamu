import { setCurrentTest, clearCurrentTest, startTestRun, endTestRun } from "sonamu";
import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";

/**
 * Naite의 trace가 파일에 잘 기록될 수 있도록 테스트 suite/case 전후에 적절한 작업을 해줍니다.
 */

beforeAll(() => {
  startTestRun();
});

afterAll(() => {
  endTestRun();
});

beforeEach((context) => {
  setCurrentTest({
    suite: context.task.suite?.name,
    name: context.task.name,
  });
});

afterEach(() => {
  clearCurrentTest();
});
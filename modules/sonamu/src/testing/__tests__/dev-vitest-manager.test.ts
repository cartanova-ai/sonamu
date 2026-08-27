import { beforeEach, describe, expect, it, vi } from "vitest";

import { type ManagedVitest } from "../dev-vitest-manager";
import { DevVitestManager } from "../dev-vitest-manager";

// 매니저가 사용하는 Vitest 기능만 충실히 구현한 테스트 대역입니다.
const mockVitest = {
  standalone: vi.fn().mockResolvedValue(undefined),
  onFilterWatchedSpecification: vi.fn(),
  invalidateFile: vi.fn(),
  setGlobalTestNamePattern: vi.fn(),
  resetGlobalTestNamePattern: vi.fn(),
  globTestSpecifications: vi.fn(),
  runTestSpecifications: vi.fn(),
  close: vi.fn(),
} satisfies ManagedVitest;

function createModule(duration: number) {
  return {
    moduleId: "dup.test.ts",
    children: [],
    state: () => "passed" as const,
    diagnostic: () => ({ duration }),
  };
}

describe("DevVitestManager", () => {
  let manager: DevVitestManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new DevVitestManager(async () => mockVitest);

    // 기본 mock: 빈 테스트 결과
    const mockTestModule = {
      moduleId: "test.ts",
      children: {
        allTests: () => [],
      },
    };
    mockVitest.globTestSpecifications.mockResolvedValue([]);
    mockVitest.runTestSpecifications.mockResolvedValue({
      testModules: [mockTestModule],
    });
    mockVitest.close.mockResolvedValue(undefined);
  });

  it("start()가 vitest 인스턴스를 초기화한다", async () => {
    await manager.start();
    expect(mockVitest.onFilterWatchedSpecification).toHaveBeenCalledWith(expect.any(Function));
    const status = manager.getStatus();
    expect(status.ready).toBe(true);
    expect(status.running).toBe(false);
  });

  it("run()이 테스트를 실행하고 결과를 반환한다", async () => {
    await manager.start();
    const result = await manager.run({});
    expect(result.ok).toBe(true);
    expect(result.summary.total).toBe(0);
  });

  it("동시 run() 2회 호출은 순차적으로 실행된다", async () => {
    await manager.start();
    const order: number[] = [];

    mockVitest.runTestSpecifications
      .mockImplementationOnce(async () => {
        order.push(1);
        await new Promise<void>((r) => setTimeout(r, 10));
        return { testModules: [{ moduleId: "a.ts", children: { allTests: () => [] } }] };
      })
      .mockImplementationOnce(async () => {
        order.push(2);
        return { testModules: [{ moduleId: "b.ts", children: { allTests: () => [] } }] };
      });

    const [r1, r2] = await Promise.all([manager.run({}), manager.run({})]);

    expect(order).toEqual([1, 2]); // 병렬이 아닌 순차 실행
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it("오류 발생 시에도 pattern이 finally에서 항상 리셋된다", async () => {
    await manager.start();
    mockVitest.runTestSpecifications.mockRejectedValueOnce(new Error("boom"));

    await expect(manager.run({ pattern: "my-pattern" })).rejects.toThrow("boom");

    expect(mockVitest.setGlobalTestNamePattern).toHaveBeenCalledWith("my-pattern");
    expect(mockVitest.resetGlobalTestNamePattern).toHaveBeenCalled();
  });

  it("shutdown() 이후 재호출은 멱등성을 보장한다", async () => {
    await manager.start();
    await manager.shutdown();
    await manager.shutdown(); // 오류 없이 재호출 가능
    expect(mockVitest.close).toHaveBeenCalledTimes(1);
  });

  it("shutdown() 이후 run() 호출은 오류를 던진다", async () => {
    await manager.start();
    await manager.shutdown();
    await expect(manager.run({})).rejects.toThrow("shut down");
  });

  it("files 미지정 시 globTestSpecifications를 인수 없이 호출한다", async () => {
    await manager.start();
    await manager.run({});
    expect(mockVitest.globTestSpecifications).toHaveBeenCalledWith();
  });

  it("files 지정 시 globTestSpecifications를 files 인수와 함께 호출한다", async () => {
    await manager.start();
    await manager.run({ files: ["foo.test.ts"] });
    expect(mockVitest.globTestSpecifications).toHaveBeenCalledWith(["foo.test.ts"]);
  });

  it("동일 moduleId 결과가 중복되어도 최종 results는 파일당 1건만 유지한다", async () => {
    await manager.start();
    mockVitest.globTestSpecifications.mockResolvedValue([{ moduleId: "dup.test.ts" }]);

    mockVitest.runTestSpecifications.mockResolvedValue({
      testModules: [createModule(10), createModule(25)],
    });

    const result = await manager.run({});
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.id).toBe("dup.test.ts");
    expect(result.results[0]?.durationMs).toBe(25);
  });
});

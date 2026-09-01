import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

async function importProduction(relativePath: string) {
  return import(/* @vite-ignore */ new URL(relativePath, import.meta.url).href);
}

describe("명령 수명주기", () => {
  it("모든 명령에 초기화 정책을 선언한다", async () => {
    const { COMMAND_LIFECYCLE_POLICIES } = await importProduction("../src/lifecycle.ts");
    const commands = [
      "fixture.init",
      "fixture.import",
      "fixture.sync",
      "migrate.run",
      "migrate.apply",
      "migrate.generate",
      "migrate.status",
      "sync",
      "build.all",
      "build.api",
      "build.web",
      "dev.all",
      "dev.api",
      "dev.web",
      "start",
      "test.run",
      "test.status",
    ];

    expect(Object.keys(COMMAND_LIFECYCLE_POLICIES)).toEqual(expect.arrayContaining(commands));
    expect(COMMAND_LIFECYCLE_POLICIES["build.all"].resources).toEqual([]);
    expect(COMMAND_LIFECYCLE_POLICIES["fixture.import"].resources).toEqual(
      expect.arrayContaining(["sonamu", "fixture"]),
    );
  });

  it.each(["success", "failure", "cancel"])(
    "%s에서도 초기화한 자원을 역순으로 한 번만 해제한다",
    async (mode) => {
      const { createLifecycleManager } = await importProduction("../src/lifecycle.ts");
      const calls: string[] = [];
      const manager = createLifecycleManager({
        resources: {
          sonamu: {
            init: vi.fn(async () => calls.push("sonamu:init")),
            destroy: vi.fn(async () => calls.push("sonamu:destroy")),
          },
          fixture: {
            init: vi.fn(async () => calls.push("fixture:init")),
            destroy: vi.fn(async () => calls.push("fixture:destroy")),
          },
        },
      });
      const action = vi.fn(async () => {
        if (mode === "failure") throw new Error("실패");
        if (mode === "cancel") throw Object.assign(new Error("취소"), { code: "CANCELLED" });
        return "ok";
      });

      await manager.run(["sonamu", "fixture"], action).catch(() => undefined);

      expect(calls).toEqual(["sonamu:init", "fixture:init", "fixture:destroy", "sonamu:destroy"]);
    },
  );
});

class FakeChild extends EventEmitter {
  kill = vi.fn();
}

describe("자식 프로세스 제어", () => {
  it.each([
    [0, 0],
    [7, 7],
  ])("숫자 종료 코드 %i를 그대로 반환한다", async (childCode, expected) => {
    const { runChildProcess } = await importProduction("../src/process.ts");
    const child = new FakeChild();
    const signalSource = new EventEmitter();
    const promise = runChildProcess({
      executable: "pnpm",
      args: ["exec", "vite"],
      spawn: vi.fn(() => child),
      signalSource,
    });
    child.emit("exit", childCode, null);

    await expect(promise).resolves.toMatchObject({ exitCode: expected });
    expect(signalSource.listenerCount("SIGINT")).toBe(0);
    expect(signalSource.listenerCount("SIGTERM")).toBe(0);
  });

  it("신호 종료를 128 더한 코드로 전파한다", async () => {
    const { runChildProcess } = await importProduction("../src/process.ts");
    const child = new FakeChild();
    const promise = runChildProcess({
      executable: "node",
      args: ["dist/index.js"],
      spawn: vi.fn(() => child),
      signalSource: new EventEmitter(),
    });
    child.emit("exit", null, "SIGTERM");

    await expect(promise).resolves.toMatchObject({ exitCode: 143, signal: "SIGTERM" });
  });

  it("부모 신호를 자식에게 한 번 전달하고 중복 리스너를 남기지 않는다", async () => {
    const { runChildProcess } = await importProduction("../src/process.ts");
    const child = new FakeChild();
    const signalSource = new EventEmitter();
    const promise = runChildProcess({
      executable: "pnpm",
      args: ["dev"],
      spawn: vi.fn(() => child),
      signalSource,
    });

    expect(signalSource.listenerCount("SIGINT")).toBe(1);
    signalSource.emit("SIGINT");
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGINT");
    child.emit("exit", null, "SIGINT");
    await promise;
    expect(signalSource.listenerCount("SIGINT")).toBe(0);
  });
});

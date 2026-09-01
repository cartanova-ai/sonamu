import { dispose, getLogger, type Config, type LogRecord } from "@logtape/logtape";
import { afterEach, describe, expect, it } from "vitest";

import { configureLogTape } from "../configure";

describe("CLI LogTape 설정 합성", () => {
  afterEach(async () => {
    globalThis.sonamuKitCliLogTapeOverride = undefined;
    await dispose();
  });

  it("CLI 출력 설정과 프로젝트 카테고리 설정을 함께 유지한다", async () => {
    const cliRecords: LogRecord[] = [];
    const appRecords: LogRecord[] = [];
    const cliConfig: Config<string, string> = {
      sinks: { default: (record) => cliRecords.push(record) },
      loggers: [{ category: [], lowestLevel: "debug", sinks: ["default"] }],
      reset: true,
    };
    globalThis.sonamuKitCliLogTapeOverride = { config: cliConfig, applied: false };

    await configureLogTape({
      sinks: { default: (record) => appRecords.push(record) },
      loggers: [{ category: ["app"], lowestLevel: "debug", sinks: ["default"] }],
    });
    getLogger(["cli"]).debug("CLI 로그");
    getLogger(["app"]).debug("프로젝트 로그");

    expect(globalThis.sonamuKitCliLogTapeOverride.applied).toBe(true);
    expect(cliRecords.map((record) => record.category[0])).toEqual(["cli", "app"]);
    expect(appRecords).toHaveLength(1);
  });
});

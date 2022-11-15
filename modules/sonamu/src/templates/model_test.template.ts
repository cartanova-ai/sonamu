import { TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { Template } from "./base-template";

export class Template__model_test extends Template {
  constructor() {
    super("model_test");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.model.test.ts`,
    };
  }

  render({ smdId }: TemplateOptions["model_test"]) {
    const names = SMDManager.getNamesFromId(smdId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { FixtureManager } from "sonamu";
import { describe, test, expect } from "vitest";

beforeEach(async () => {
  await FixtureManager.cleanAndSeed([]);
});
describe.skip("${smdId}ModelTest", () => {
  test("Query", async () => {
    expect(true).toBe(true);
  });
});
      `.trim(),
      importKeys: [],
    };
  }
}

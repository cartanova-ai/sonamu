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
import { BadRequestException, FixtureManager } from "sonamu";
import { ${smdId}ListParams, ${smdId}SaveParams } from "../${names.fs}/${names.fs}.types";
import { ${smdId}Model } from "../${names.fs}/${names.fs}.model";

describe.skip("${smdId}Model Model", () => {
  new FixtureManager([
  ]);

  test("Query", async () => {
  });
});

      `.trim(),
      importKeys: [],
    };
  }
}

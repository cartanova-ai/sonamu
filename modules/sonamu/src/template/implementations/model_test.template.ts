import { Sonamu } from "../../api";
import { EntityManager } from "../../entity/entity-manager";
import type { EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { Template } from "../template";

export class Template__model_test extends Template {
  constructor() {
    super("model_test");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    const { dir } = Sonamu.config.api;

    return {
      target: `${dir}/src/application`,
      path: `${names.fs}/${names.fs}.model.test.ts`,
    };
  }

  render({ entityId }: TemplateOptions["model_test"]) {
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);
describe.skip("${entityId}ModelTest", () => {
  test("Query", async () => {
    expect(true).toBe(true);
  });
});
      `.trim(),
      importKeys: [],
    };
  }
}

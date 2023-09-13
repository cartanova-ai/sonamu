import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";

export class Template__model_test extends Template {
  constructor() {
    super("model_test");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.model.test.ts`,
    };
  }

  render({ entityId }: TemplateOptions["model_test"]) {
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { describe, test, expect } from "vitest";
import { bootstrap } from '../../testing/bootstrap';

bootstrap([]);
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

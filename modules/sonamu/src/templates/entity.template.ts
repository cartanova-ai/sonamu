import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";

export class Template__entity extends Template {
  constructor() {
    super("entity");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.entity.json`,
    };
  }

  render(options: TemplateOptions["entity"]) {
    const { entityId, title, refCode } = options;
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: `
TODO Entity ${title} ${refCode}
`.trim(),
      importKeys: [],
    };
  }
}

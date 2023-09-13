import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";

export class Template__view_enums_buttonset extends Template {
  constructor() {
    super("view_enums_buttonset");
  }

  getTargetAndPath(names: EntityNamesRecord, componentId: string) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${componentId}ButtonSet.tsx`,
    };
  }

  render({ entityId, enumId }: TemplateOptions["view_enums_buttonset"]) {
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names, enumId),
      body: `
/*
view_enums_buttonset
${JSON.stringify({
  key: this.key,
  options: entityId,
})}
*/
      `.trim(),
      importKeys: [],
    };
  }
}

import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { Template } from "../template";

export class Template__view_id_all_select extends Template {
  constructor() {
    super("view_id_all_select");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${names.capital}IdAllSelect.tsx`,
    };
  }

  render({ entityId }: TemplateOptions["view_id_all_select"]) {
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: `
/*
view_id_all_select
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

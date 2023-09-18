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
    const { entityId, title, parentId, table } = options;
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: JSON.stringify({
        id: entityId,
        title: title ?? entityId,
        parentId,
        table: table ?? names.fsPlural.replace(/\-/g, "_"),
        props: [
          { name: "id", type: "integer", unsigned: true },
          {
            name: "created_at",
            type: "timestamp",
            dbDefault: "CURRENT_TIMESTAMP",
          },
        ],
        indexes: [],
        subsets: {
          A: ["id", "created_at"],
        },
        enums: {
          [`${names.capital}OrderBy`]: {
            "id-desc": "ID최신순",
          },
          [`${names.capital}SearchField`]: { id: "ID" },
        },
      }).trim(),
      importKeys: [],
    };
  }
}

import { Sonamu } from "../../api";
import { EntityManager } from "../../entity/entity-manager";
import { type EntityNamesRecord } from "../../entity/entity-manager";
import { type TemplateOptions } from "../../types/types";
import { Template } from "../template";

export class Template__init_types extends Template {
  constructor() {
    super("init_types");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    const { dir } = Sonamu.config.api;

    return {
      target: `${dir}/src/application`,
      path: `${names.fs}/${names.fs}.types.ts`,
    };
  }

  render({ entityId }: TemplateOptions["init_types"]) {
    const names = EntityManager.getNamesFromId(entityId);
    const entity = EntityManager.get(entityId);

    const partialColumns = ["id"];
    if (entity.props.some((prop) => prop.name === "created_at")) {
      partialColumns.push("created_at");
    }

    const writeIneligibleColumns = entity.props
      .filter(
        (prop) =>
          prop.type !== "relation" && (prop.generated !== undefined || prop.type === "searchText"),
      )
      .map((prop) => prop.name);

    const omitGeneratedColumns =
      writeIneligibleColumns.length > 0
        ? `.omit({ ${writeIneligibleColumns.map((column) => `${column}: true`).join(", ")} })`
        : "";

    return {
      ...this.getTargetAndPath(names),
      body: `
import { z } from "zod";
import { ${entityId}BaseSchema, ${entityId}BaseListParams } from "../sonamu.generated";

// ${entityId} - ListParams
export const ${entityId}ListParams = ${entityId}BaseListParams;
export type ${entityId}ListParams = z.infer<typeof ${entityId}ListParams>;

// ${entityId} - SaveParams
export const ${entityId}SaveParams = ${entityId}BaseSchema${omitGeneratedColumns}.partial({ ${partialColumns
        .map((column) => `${column}: true`)
        .join(", ")} });
export type ${entityId}SaveParams = z.infer<typeof ${entityId}SaveParams>;

      `.trim(),
      importKeys: [],
    };
  }
}

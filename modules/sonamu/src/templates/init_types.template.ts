import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";
import { Sonamu } from "../api";

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

    const hasCreatedAt =
      EntityManager.get(entityId).props.find(
        (prop) => prop.name === "created_at"
      ) !== undefined;

    return {
      ...this.getTargetAndPath(names),
      body: `
import { z } from "zod";
import { ${entityId}BaseSchema, ${entityId}BaseListParams } from "../sonamu.generated";

// ${entityId} - ListParams
export const ${entityId}ListParams = ${entityId}BaseListParams;
export type ${entityId}ListParams = z.infer<typeof ${entityId}ListParams>;

// ${entityId} - SaveParams
export const ${entityId}SaveParams = ${entityId}BaseSchema.partial({ id: true${
        hasCreatedAt ? ", created_at: true" : ""
      } });
export type ${entityId}SaveParams = z.infer<typeof ${entityId}SaveParams>;

      `.trim(),
      importKeys: [],
    };
  }
}

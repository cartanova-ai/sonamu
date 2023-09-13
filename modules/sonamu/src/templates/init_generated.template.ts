import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";

export class Template__init_generated extends Template {
  constructor() {
    super("init_generated");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.generated.ts`,
    };
  }

  render({ entityId }: TemplateOptions["init_generated"]) {
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { z } from "zod";

export const ${entityId}BaseSchema = z.object({});
export type ${entityId}BaseSchema = z.infer<typeof ${entityId}BaseSchema>;

export const ${entityId}BaseListParams = z.object({
  num: z.number().int().min(0),
  page: z.number().int().min(1),
  search: ${entityId}SearchField,
  keyword: z.string(),
  orderBy: ${entityId}OrderBy,
  withoutCount: z.boolean(),
}).partial();
export type ${entityId}BaseListParams = z.infer<typeof ${entityId}BaseListParams>;

export type ${entityId}SubsetKey = never;
export type ${entityId}SubsetMapping = {};
/* BEGIN- Server-side Only */
import { SubsetQuery } from "sonamu";
export const ${names.camel}SubsetQueries: { [key in ${entityId}SubsetKey]: SubsetQuery } = {};

export type ${entityId}FieldExpr = string;
/* END- Server-side Only */
      `.trim(),
      importKeys: [],
    };
  }
}

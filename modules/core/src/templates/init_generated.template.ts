import { TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { Template } from "./base-template";

export class Template__init_generated extends Template {
  constructor() {
    super("init_generated");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.generated.ts`,
    };
  }

  render({ smdId }: TemplateOptions["init_generated"]) {
    const names = SMDManager.getNamesFromId(smdId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { z } from "zod";
import { ${smdId}SearchField, ${smdId}OrderBy } from "./${names.fs}.enums";

export const ${smdId}BaseSchema = z.object({});
export type ${smdId}BaseSchema = z.infer<typeof ${smdId}BaseSchema>;

export const ${smdId}BaseListParams = z.object({
  num: z.number().int().min(0),
  page: z.number().int().min(1),
  search: ${smdId}SearchField,
  keyword: z.string(),
  orderBy: ${smdId}OrderBy,
  withoutCount: z.boolean(),
});
export type ${smdId}BaseListParams = z.infer<typeof ${smdId}BaseListParams>;

export type ${smdId}FieldExpr = string;
      `.trim(),
      importKeys: [],
    };
  }
}

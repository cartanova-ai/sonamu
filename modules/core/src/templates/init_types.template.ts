import { TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { Template } from "./base-template";

export class Template__init_types extends Template {
  constructor() {
    super("init_types");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.types.ts`,
    };
  }

  render({ smdId }: TemplateOptions["init_types"]) {
    const names = SMDManager.getNamesFromId(smdId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { z } from "zod";
import { ${smdId}BaseSchema, ${smdId}BaseListParams } from "./${names.fs}.generated";

// ${smdId} - ListParams
export const ${smdId}ListParams = ${smdId}BaseListParams;
export type ${smdId}ListParams = z.infer<typeof ${smdId}ListParams>;

// ${smdId} - SaveParams
export const ${smdId}SaveParams = ${smdId}BaseSchema.partial({ id: true });
export type ${smdId}SaveParams = z.infer<typeof ${smdId}SaveParams>;

      `.trim(),
      importKeys: [],
    };
  }
}

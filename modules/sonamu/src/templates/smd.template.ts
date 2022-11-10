import { TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { Template } from "./base-template";

export class Template__smd extends Template {
  constructor() {
    super("smd");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.smd.ts`,
    };
  }

  render(options: TemplateOptions["smd"]) {
    const { smdId, title, refCode } = options;
    const names = SMDManager.getNamesFromId(smdId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { p, SMDInput } from "sonamu";
import { ${smdId}FieldExpr } from "./${names.fs}.generated";

/*
  ${smdId} SMD
*/

export const ${names.camel}SmdInput: SMDInput<${smdId}FieldExpr> = {
  id: "${smdId}",
  title: "${title ?? smdId}",
  props: [
    p.integer("id", { unsigned: true }),
    p.timestamp("created_at", {
      now: true,
    }),
  ],
  subsets: {
    A: [ 'id', 'created_at' ]
  }
};
${refCode ? `\n/* REFERENCE\n\n${refCode}\n*/` : ""}
`.trim(),
      importKeys: [],
    };
  }
}

import { TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { Template } from "./base-template";

export class Template__view_id_all_select extends Template {
  constructor() {
    super("view_id_all_select");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${names.capital}IdAllSelect.tsx`,
    };
  }

  render({ smdId }: TemplateOptions["view_id_all_select"]) {
    const names = SMDManager.getNamesFromId(smdId);

    return {
      ...this.getTargetAndPath(names),
      body: `
/*
view_id_all_select
${JSON.stringify({
  key: this.key,
  options: smdId,
})}
*/
      `.trim(),
      importKeys: [],
    };
  }
}

import { TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { Template } from "./base-template";

export class Template__view_enums_buttonset extends Template {
  constructor() {
    super("view_enums_buttonset");
  }

  getTargetAndPath(names: SMDNamesRecord, componentId: string) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${componentId}ButtonSet.tsx`,
    };
  }

  render({ smdId, enumId }: TemplateOptions["view_enums_buttonset"]) {
    const names = SMDManager.getNamesFromId(smdId);

    return {
      ...this.getTargetAndPath(names, enumId),
      body: `
/*
view_enums_buttonset
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

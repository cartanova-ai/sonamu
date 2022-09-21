import { camelize } from "inflection";
import { TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { Template } from "./base-template";

export class Template__init_enums extends Template {
  constructor() {
    super("init_enums");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.enums.ts`,
    };
  }

  render(options: TemplateOptions["init_enums"]) {
    const { smdId, def } = options;
    const names = SMDManager.getNamesFromId(smdId);

    const record = def ?? {};
    record.ORDER_BY ??= {
      "id-desc": "최신순",
    };
    record.SEARCH_FIELD ??= {
      id: "ID",
    };

    return {
      ...this.getTargetAndPath(names),
      body: `
import { z } from "zod";
import { EnumsLabelKo } from "../../types/shared";

${Object.entries(record)
  .map(
    ([key, value]) => `export const ${smdId}${camelize(
      key.toLowerCase(),
      false
    )} = z.enum([${Object.keys(value)
      .map((v) => `"${v}"`)
      .join(",")}]);
export type ${smdId}${camelize(
      key.toLowerCase(),
      false
    )} = z.infer<typeof ${smdId}${camelize(key.toLowerCase(), false)}>;`
  )
  .join("\n")}

export namespace ${names.constant} {
  ${Object.entries(record)
    .map(
      ([key, value]) => `// ${key}
export const ${key}:EnumsLabelKo<${smdId}${camelize(
        key.toLowerCase(),
        false
      )}> = {
  ${Object.entries(value)
    .map(([ek, ev]) => `"${ek}": { ko: "${ev}" }`)
    .join(",")}
};
      `
    )
    .join("\n")}
}
      `.trim(),
      importKeys: [],
    };
  }
}

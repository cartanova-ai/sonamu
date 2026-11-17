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

    return {
      ...this.getTargetAndPath(names),
      // 쓰기 불가 컬럼 제외는 sync마다 재생성되는 BaseSaveParams가 담당하므로,
      // 사용자 소유인 이 파일에는 제외 목록을 고정하지 않습니다.
      body: `
import { z } from "zod";
import { ${entityId}BaseSaveParams, ${entityId}BaseListParams } from "../sonamu.generated";

// ${entityId} - ListParams
export const ${entityId}ListParams = ${entityId}BaseListParams;
export type ${entityId}ListParams = z.infer<typeof ${entityId}ListParams>;

// ${entityId} - SaveParams
export const ${entityId}SaveParams = ${entityId}BaseSaveParams.partial({ id: true });
export type ${entityId}SaveParams = z.infer<typeof ${entityId}SaveParams>;

      `.trim(),
      importKeys: [],
    };
  }
}

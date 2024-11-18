import { RenderingNode, TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";
import { Template__view_list } from "./view_list.template";
import { Sonamu } from "../api";
import { DB } from "../database/db";

export class Template__model extends Template {
  constructor() {
    super("model");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    const { dir } = Sonamu.config.api;

    return {
      target: `${dir}/src/application`,
      path: `${names.fs}/${names.fs}.model.ts`,
    };
  }

  render(
    { entityId }: TemplateOptions["model"],
    _columnsNode: RenderingNode,
    listParamsNode: RenderingNode
  ) {
    const names = EntityManager.getNamesFromId(entityId);

    const vlTpl = new Template__view_list();
    if (listParamsNode?.children === undefined) {
      throw new Error(`listParamsNode가 없습니다. ${entityId}`);
    }
    const def = vlTpl.getDefault(listParamsNode.children);

    return {
      ...this.getTargetAndPath(names),
      body: DB.generator.generateModelTemplate(entityId, def),
      importKeys: [],
    };
  }
}

import { RenderingNode, TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { Template } from "./base-template";
import { Template__view_list } from "./view_list.template";

export class Template__model extends Template {
  constructor() {
    super("model");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.model.ts`,
    };
  }

  render(
    { smdId }: TemplateOptions["model"],
    _columnsNode: RenderingNode,
    listParamsNode: RenderingNode
  ) {
    const names = SMDManager.getNamesFromId(smdId);
    const smd = SMDManager.get(smdId);

    const vlTpl = new Template__view_list();
    const def = vlTpl.getDefault(listParamsNode.children!);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { BaseModelClass, ListResult, asArray, NotFoundException, BadRequestException, api } from 'sonamu';
import {
  ${smdId}SubsetKey,
  ${smdId}SubsetMapping,
  ${names.camel}SubsetQueries,
} from "./${names.fs}.generated";
import { ${smdId}ListParams, ${smdId}SaveParams } from "./${names.fs}.types";

/*
  ${smdId} Model
*/
class ${smdId}ModelClass extends BaseModelClass {
  modelName = "${smdId}";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "${smdId}" })
  async findById<T extends ${smdId}SubsetKey>(
    subset: T,
    id: number
  ): Promise<${smdId}SubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (rows.length == 0) {
      throw new NotFoundException(\`존재하지 않는 ${names.capital} ID \${id}\`);
    }

    return rows[0];
  }

  async findOne<T extends ${smdId}SubsetKey>(
    subset: T,
    listParams: ${smdId}ListParams
  ): Promise<${smdId}SubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "${names.capitalPlural}" })
  async findMany<T extends ${smdId}SubsetKey>(
    subset: T,
    params: ${smdId}ListParams = {}
  ): Promise<ListResult<${smdId}SubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "${def.search}",
      orderBy: "${def.orderBy}",
      ...params,
    };

    // build queries
    let { rows, total } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: ${names.camel}SubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("${smd.table}.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("${smd.table}.id", "like", \`%\${params.keyword}%\`);
          } else {
            throw new BadRequestException(
              \`구현되지 않은 검색 필드 \${params.search}\`
            );
          }
        }

        // orderBy
        if (params.orderBy) {
          // default orderBy
          const [orderByField, orderByDirec] = params.orderBy.split("-");
          qb.orderBy("${smd.table}." + orderByField, orderByDirec);
        }

        return qb;
      },
      debug: false,
    });

    return {
      rows,
      total,
    };
  }

  @api({ httpMethod: "POST" })
  async save(
    saveParamsArray: ${smdId}SaveParams[]
  ): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    saveParamsArray.map((saveParams) => {
      ub.register("${smd.table}", saveParams);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await ub.upsert(trx, "${smd.table}");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: [ "admin" ] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("${smd.table}").whereIn("${smd.table}.id", ids).delete();
    });

    return ids.length;
  }
}

export const ${smdId}Model = new ${smdId}ModelClass();
      `.trim(),
      importKeys: [],
    };
  }
}

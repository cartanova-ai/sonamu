import { RenderingNode, TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";
import { Template__view_list } from "./view_list.template";

export class Template__model extends Template {
  constructor() {
    super("model");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.model.ts`,
    };
  }

  render(
    { entityId }: TemplateOptions["model"],
    _columnsNode: RenderingNode,
    listParamsNode: RenderingNode
  ) {
    const names = EntityManager.getNamesFromId(entityId);
    const entity = EntityManager.get(entityId);

    const vlTpl = new Template__view_list();
    if (listParamsNode?.children === undefined) {
      throw new Error(`listParamsNode가 없습니다. ${entityId}`);
    }
    const def = vlTpl.getDefault(listParamsNode.children);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { BaseModelClass, ListResult, asArray, NotFoundException, BadRequestException, api } from 'sonamu';
import {
  ${entityId}SubsetKey,
  ${entityId}SubsetMapping,
} from "../sonamu.generated";
import {
  ${names.camel}SubsetQueries,
} from "../sonamu.generated.sso";
import { ${entityId}ListParams, ${entityId}SaveParams } from "./${
        names.fs
      }.types";

/*
  ${entityId} Model
*/
class ${entityId}ModelClass extends BaseModelClass {
  modelName = "${entityId}";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "${entityId}" })
  async findById<T extends ${entityId}SubsetKey>(
    subset: T,
    id: number
  ): Promise<${entityId}SubsetMapping[T]> {
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

  async findOne<T extends ${entityId}SubsetKey>(
    subset: T,
    listParams: ${entityId}ListParams
  ): Promise<${entityId}SubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "${
    names.capitalPlural
  }" })
  async findMany<T extends ${entityId}SubsetKey>(
    subset: T,
    params: ${entityId}ListParams = {}
  ): Promise<ListResult<${entityId}SubsetMapping[T]>> {
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
          qb.whereIn("${entity.table}.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("${entity.table}.id", params.keyword);
          // } else if (params.search === "field") {
          //   qb.where("${
            entity.table
          }.field", "like", \`%\${params.keyword}%\`);
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
          qb.orderBy("${entity.table}." + orderByField, orderByDirec);
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
    saveParamsArray: ${entityId}SaveParams[]
  ): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    ${(() => {
      const jsonProps = entity.props.filter((prop) => prop.type === "json");
      if (jsonProps.length === 0) {
        return `saveParamsArray.map((saveParams) => {
      ub.register("${entity.table}", saveParams);
    });`;
      } else {
        return `saveParamsArray.map(({${jsonProps
          .map((prop) => prop.name)
          .join(", ")}, ...saveParams}) => {
      ub.register("${entity.table}", {
        ${jsonProps
          .map(
            (prop) =>
              `${prop.name}: ${prop.name} === null ? null : JSON.stringify(${prop.name}),`
          )
          .join(",\n")}
        ...saveParams
      });
    });`;
      }
    })()}

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await ub.upsert(trx, "${entity.table}");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: [ "admin" ] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("${entity.table}").whereIn("${entity.table}.id", ids).delete();
    });

    return ids.length;
  }
}

export const ${entityId}Model = new ${entityId}ModelClass();
      `.trim(),
      importKeys: [],
    };
  }
}

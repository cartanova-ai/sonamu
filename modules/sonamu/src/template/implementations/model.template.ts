import type z from "zod";

import { Sonamu } from "../../api";
import { EntityManager } from "../../entity/entity-manager";
import { type EntityNamesRecord } from "../../entity/entity-manager";
import { Naite } from "../../naite/naite";
import { type TemplateOptions } from "../../types/types";
import { Template } from "../template";
import { getZodTypeById, zodTypeToRenderingNode } from "../zod-converter";
import { Template__view_list } from "./view_list.template";
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

  override getRequiredDictKeys(): string[] | null {
    return ["error.entityNotFound", "error.unknownSearchField"];
  }

  async render({ entityId }: TemplateOptions["model"]) {
    Naite.t("render", { entityId });

    const listParamsZodType = await getZodTypeById(`${entityId}ListParams`);
    const listParamsNode = zodTypeToRenderingNode(listParamsZodType);

    const subsetKeyZodType = await getZodTypeById(`${entityId}SubsetKey`);
    const subsetKeys =
      /* SAFETY: 생성된 *SubsetKey 타입은 enum 스키마로 등록된다. */ (subsetKeyZodType as z.ZodEnum)
        .enum;

    const names = EntityManager.getNamesFromId(entityId);
    const entity = EntityManager.get(entityId);

    const vlTpl = new Template__view_list();
    if (listParamsNode?.children === undefined) {
      throw new Error(`listParamsNode가 없습니다. ${entityId}`);
    }
    const def = vlTpl.getDefault(listParamsNode.children);

    // 에러 메시지 생성
    const notFoundError = `SD("error.entityNotFound")("${names.capital}", id)`;
    const unknownSearchFieldError = `SD("error.unknownSearchField")(params.search)`;

    // PK 타입에 따른 TypeScript 타입 결정
    const pkType = entity.getPkType();
    const idTsType = pkType === "string" || pkType === "uuid" ? "string" : "number";

    return {
      ...this.getTargetAndPath(names),
      body: `
import { BaseModelClass, type ListResult, asArray, NotFoundException, BadRequestException, api, exhaustive } from 'sonamu';
import {
  ${entityId}SubsetKey,
  ${entityId}SubsetMapping,
} from "../sonamu.generated";
import {
  ${names.camel}SubsetQueries,
  ${names.camel}LoaderQueries,
} from "../sonamu.generated.sso";
import { ${entityId}ListParams, ${entityId}SaveParams } from "./${names.fs}.types";
import { SD } from "../../i18n/sd.generated";

/*
  ${entityId} Model
*/
class ${entityId}ModelClass extends BaseModelClass<
  ${entityId}SubsetKey,
  ${entityId}SubsetMapping,
  typeof ${names.camel}SubsetQueries,
  typeof ${names.camel}LoaderQueries
> {
  constructor() {
    super("${entityId}", ${names.camel}SubsetQueries, ${names.camel}LoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "${entityId}" })
  async findById<T extends ${entityId}SubsetKey>(
    subset: T,
    id: ${idTsType}
  ): Promise<${entityId}SubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(${notFoundError});
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

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "${names.capitalPlural}" })
  async findMany<T extends ${entityId}SubsetKey, LP extends ${entityId}ListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, ${entityId}SubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "${def.search}" as const,
      orderBy: "${def.orderBy}" as const,
      ...rawParams,
    } satisfies ${entityId}ListParams;

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);
    
    // id
    if (params.id) {
      qb.whereIn("${entity.table}.id", asArray(params.id));
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("${entity.table}.id", ${idTsType === "string" ? "params.keyword" : "Number(params.keyword)"});
        // } else if (params.search === "field") {
        //   qb.where("${entity.table}.field", "like", \`%\${params.keyword}%\`);
      } else {
        throw new BadRequestException(${unknownSearchFieldError});
      }
    }
      
    // orderBy
    if (params.orderBy) {
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("${entity.table}.id", "desc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    const enhancers = this.createEnhancers({
      ${Object.keys(subsetKeys)
        .map(
          (key) => `${key}: (row) => ({
          ...row,
          // 서브셋별로 virtual 필드 계산로직 추가
        }),`,
        )
        .join("\n")}
    });

    return this.executeSubsetQuery({
      subset,
      qb,
      params,
      enhancers,
      debug: false,
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async save(
    spa: ${entityId}SaveParams[]
  ): Promise<${idTsType}[]> {
    const wdb = this.getPuri("w");

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("${entity.table}", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("${entity.table}");

      return ids;
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: [ "admin" ] })
  async del(ids: ${idTsType}[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("${entity.table}").whereIn("${entity.table}.id", ids).delete();
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

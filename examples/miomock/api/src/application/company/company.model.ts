import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  type ListResult,
  NotFoundException,
} from "sonamu";
import { SD } from "../../i18n/sd.generated";
import type { CompanySubsetKey, CompanySubsetMapping } from "../sonamu.generated";
import { companyLoaderQueries, companySubsetQueries } from "../sonamu.generated.sso";
import type { CompanyListParams, CompanySaveParams } from "./company.types";

/*
  Company Model
*/
class CompanyModelClass extends BaseModelClass<
  CompanySubsetKey,
  CompanySubsetMapping,
  typeof companySubsetQueries,
  typeof companyLoaderQueries
> {
  constructor() {
    super("Company", companySubsetQueries, companyLoaderQueries);
  }

  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"],
    resourceName: "Company",
  })
  async findById<T extends CompanySubsetKey>(
    subset: T,
    id: number,
  ): Promise<CompanySubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(SD("notFound")(this.modelName, id));
    }

    return rows[0];
  }

  async findOne<T extends CompanySubsetKey>(
    subset: T,
    listParams: CompanyListParams,
  ): Promise<CompanySubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"],
    resourceName: "Companies",
  })
  async findMany<T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, CompanySubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    } satisfies CompanyListParams;
    this.logger.info("findMany", { subset, rawParams });

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    if (params.id) {
      // id
      qb.whereIn("companies.id", asArray(params.id));
    }

    if (params.search && params.keyword && params.keyword.length > 0) {
      // search-keyword
      if (params.search === "id") {
        qb.where("companies.id", Number(params.keyword));
        // } else if (params.search === "field") {
        //   qb.where("companies.field", "like", `%${params.keyword}%`);
      } else {
        throw new BadRequestException(SD("search.invalidField")(params.search));
      }
    }

    if (params.orderBy) {
      // orderBy
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("companies.id", "desc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    return this.executeSubsetQuery({
      subset,
      qb,
      params,
      debug: false,
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async save(spa: CompanySaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("companies", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("companies");

      return ids;
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("companies").whereIn("companies.id", ids).delete();
    });

    return ids.length;
  }
}

export const CompanyModel = new CompanyModelClass();

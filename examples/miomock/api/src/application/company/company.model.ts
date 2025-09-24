import {
  ListResult,
  asArray,
  NotFoundException,
  BadRequestException,
  api,
} from "sonamu";
import { BaseModelClass } from "sonamu/knex";
import { CompanySubsetKey, CompanySubsetMapping } from "../sonamu.generated";
import { companySubsetQueries } from "../sonamu.generated.sso";
import { CompanyListParams, CompanySaveParams } from "./company.types";

/*
  Company Model
*/
class CompanyModelClass extends BaseModelClass {
  modelName = "Company";

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
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
    if (rows.length == 0) {
      throw new NotFoundException(`존재하지 않는 Company ID ${id}`);
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
    clients: ["axios", "swr"],
    resourceName: "Companies",
  })
  async findMany<T extends CompanySubsetKey>(
    subset: T,
    params: CompanyListParams = {},
  ): Promise<ListResult<CompanySubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "id",
      orderBy: "id-desc",
      ...params,
    };

    // build queries
    let { rows, total } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: companySubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("companies.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("companies.id", params.keyword);
          }
          // } else if (params.search === "field") {
          //   qb.where("companies.field", "like", `%${params.keyword}%`);
          // }
          else {
            throw new BadRequestException(
              `구현되지 않은 검색 필드 ${params.search}`,
            );
          }
        }

        // orderBy
        if (params.orderBy) {
          // default orderBy
          const [orderByField, orderByDirec] = params.orderBy.split("-");
          qb.orderBy("companies." + orderByField, orderByDirec);
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
  async save(spa: CompanySaveParams[]): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    spa.map((sp) => {
      ub.register("companies", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await ub.upsert(trx, "companies");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("companies").whereIn("companies.id", ids).delete();
    });

    return ids.length;
  }
}

export const CompanyModel = new CompanyModelClass();

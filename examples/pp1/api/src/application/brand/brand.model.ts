import { BaseModelClass } from "sonamu";
import { ListResult, asArray } from "sonamu";
import { NotFoundException, BadRequestException } from "sonamu";
import {
  BrandSubsetKey,
  BrandSubsetMapping,
  brandSubsetQueries,
} from "./brand.generated";
import { BrandListParams, BrandSaveParams } from "./brand.types";
import { api } from "sonamu";

/*
  Brand Model
*/
class BrandModelClass extends BaseModelClass {
  modelName = "Brand";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Brand" })
  async findById<T extends BrandSubsetKey>(
    subset: T,
    id: number
  ): Promise<BrandSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (rows.length == 0) {
      throw new NotFoundException(`존재하지 않는 Brand ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends BrandSubsetKey>(
    subset: T,
    listParams: BrandListParams
  ): Promise<BrandSubsetMapping[T] | undefined> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0];
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Brands" })
  async findMany<T extends BrandSubsetKey>(
    subset: T,
    params: BrandListParams = {}
  ): Promise<ListResult<BrandSubsetMapping[T]>> {
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
      subsetQuery: brandSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("brands.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("brands.id", "like", `%${params.keyword}%`);
          } else {
            throw new BadRequestException(
              `구현되지 않은 검색 필드 ${params.search}`
            );
          }
        }

        // orderBy
        if (params.orderBy) {
          // default orderBy
          const [orderByField, orderByDirec] = params.orderBy.split("-");
          qb.orderBy("brands." + orderByField, orderByDirec);
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
  async save(saveParamsArray: BrandSaveParams[]): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    saveParamsArray.map((saveParams) => {
      ub.register("brands", saveParams);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await ub.upsert(trx, "brands");

      return ids;
    });
  }

  @api({ httpMethod: "GET" })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("brands").whereIn("brands.id", ids).delete();
    });

    return ids.length;
  }

  @api({ httpMethod: "POST" })
  async attach(ids: number[], what: string): Promise<number> {
    const wdb = this.getDB("w");

    return await wdb("brands")
      .whereIn("id", ids)
      .update({
        name: wdb.raw(`CONCAT(name, "${what}")`),
      });
  }
}

export const BrandModel = new BrandModelClass();

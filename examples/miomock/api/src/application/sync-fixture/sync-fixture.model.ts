import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  type ListResult,
  NotFoundException,
} from "sonamu";
import type { SyncFixtureSubsetKey, SyncFixtureSubsetMapping } from "../sonamu.generated";
import { syncFixtureLoaderQueries, syncFixtureSubsetQueries } from "../sonamu.generated.sso";
import type { SyncFixtureListParams, SyncFixtureSaveParams } from "./sync-fixture.types";

/*
  SyncFixture Model
*/
class SyncFixtureModelClass extends BaseModelClass<
  SyncFixtureSubsetKey,
  SyncFixtureSubsetMapping,
  typeof syncFixtureSubsetQueries,
  typeof syncFixtureLoaderQueries
> {
  modelName = "SyncFixture";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "SyncFixture" })
  async findById<T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
  ): Promise<SyncFixtureSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(`존재하지 않는 SyncFixture ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends SyncFixtureSubsetKey>(
    subset: T,
    listParams: SyncFixtureListParams,
  ): Promise<SyncFixtureSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "SyncFixtures" })
  async findMany<T extends SyncFixtureSubsetKey, LP extends SyncFixtureListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, SyncFixtureSubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    };

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("sync_fixtures.id", asArray(params.id));
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("sync_fixtures.id", Number(params.keyword));
        // } else if (params.search === "field") {
        //   qb.where("sync_fixtures.field", "like", `%${params.keyword}%`);
      } else {
        throw new BadRequestException(`구현되지 않은 검색 필드 ${params.search}`);
      }
    }

    // orderBy
    if (params.orderBy) {
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("sync_fixtures.id", "desc");
      } else if (params.orderBy === "name-asc") {
        qb.orderBy("sync_fixtures.name", "asc");
      } else if (params.orderBy === "id-asc") {
        qb.orderBy("sync_fixtures.id", "asc");
      } else if (params.orderBy === "priority-desc") {
        qb.orderBy("sync_fixtures.priority", "desc");
      } else if (params.orderBy === "created_at-desc") {
        qb.orderBy("sync_fixtures.created_at", "desc");
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

  @api({ httpMethod: "POST" })
  async save(spa: SyncFixtureSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("sync_fixtures", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("sync_fixtures");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("sync_fixtures").whereIn("sync_fixtures.id", ids).delete();
    });

    return ids.length;
  }
}

export const SyncFixtureModel = new SyncFixtureModelClass(
  syncFixtureSubsetQueries,
  syncFixtureLoaderQueries,
);

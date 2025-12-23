import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  type ListResult,
  NotFoundException,
} from "sonamu";
import type { TagSubsetKey, TagSubsetMapping } from "../sonamu.generated";
import { tagLoaderQueries, tagSubsetQueries } from "../sonamu.generated.sso";
import type { TagListParams, TagSaveParams } from "./tag.types";

/*
  Tag Model
*/
class TagModelClass extends BaseModelClass<
  TagSubsetKey,
  TagSubsetMapping,
  typeof tagSubsetQueries,
  typeof tagLoaderQueries
> {
  modelName = "Tag";

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Tag" })
  async findById<T extends TagSubsetKey>(subset: T, id: number): Promise<TagSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(`존재하지 않는 Tag ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends TagSubsetKey>(
    subset: T,
    listParams: TagListParams,
  ): Promise<TagSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Tags" })
  async findMany<T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, TagSubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    } satisfies TagListParams;

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("tags.id", asArray(params.id));
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("tags.id", Number(params.keyword));
        // } else if (params.search === "field") {
        //   qb.where("tags.field", "like", `%${params.keyword}%`);
      } else {
        throw new BadRequestException(`구현되지 않은 검색 필드 ${params.search}`);
      }
    }

    // orderBy
    if (params.orderBy) {
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("tags.id", "desc");
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
  async save(spa: TagSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("tags", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("tags");

      return ids;
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("tags").whereIn("tags.id", ids).delete();
    });

    return ids.length;
  }
}

export const TagModel = new TagModelClass(tagSubsetQueries, tagLoaderQueries);

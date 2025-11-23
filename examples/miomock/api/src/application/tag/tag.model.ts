import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  type ListResult,
  NotFoundException,
} from "sonamu";
import type { TagSubsetKey, TagSubsetMapping } from "../sonamu.generated";
import {
  tagPuriLoaderQueries,
  tagPuriSubsetQueries,
  tagSubsetQueries,
} from "../sonamu.generated.sso";
import type { TagListParams, TagSaveParams } from "./tag.types";

/*
  Tag Model
*/
class TagModelClass extends BaseModelClass<
  TagSubsetKey,
  TagSubsetMapping,
  typeof tagPuriSubsetQueries,
  typeof tagPuriLoaderQueries
> {
  modelName = "Tag";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Tag" })
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
    listParams: TagListParams
  ): Promise<TagSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Tags" })
  async findMany<T extends TagSubsetKey>(
    subset: T,
    params: TagListParams = {}
  ): Promise<ListResult<TagSubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "id",
      orderBy: "id-desc",
      ...params,
    };

    // build queries
    const { rows, total } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: tagSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("tags.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("tags.id", params.keyword);
            // } else if (params.search === "field") {
            //   qb.where("tags.field", "like", `%${params.keyword}%`);
          } else {
            throw new BadRequestException(`구현되지 않은 검색 필드 ${params.search}`);
          }
        }

        // orderBy
        if (params.orderBy) {
          // default orderBy
          const [orderByField, orderByDirec] = params.orderBy.split("-");
          qb.orderBy(`tags.${orderByField}`, orderByDirec);
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

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("tags").whereIn("tags.id", ids).delete();
    });

    return ids.length;
  }
}

export const TagModel = new TagModelClass(
  tagPuriSubsetQueries,
  tagPuriLoaderQueries
);

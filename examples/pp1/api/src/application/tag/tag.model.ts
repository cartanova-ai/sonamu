import { BaseModelClass } from "sonamu";
import { ListResult, asArray } from "sonamu";
import { NotFoundException, BadRequestException } from "sonamu";
import {
  TagSubsetKey,
  TagSubsetMapping,
  tagSubsetQueries,
} from "./tag.generated";
import { TagListParams, TagSaveParams } from "./tag.types";
import { api } from "sonamu";

/*
  Tag Model
*/
class TagModelClass extends BaseModelClass {
  modelName = "Tag";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Tag" })
  async findById<T extends TagSubsetKey>(
    subset: T,
    id: number
  ): Promise<TagSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (rows.length == 0) {
      throw new NotFoundException(`존재하지 않는 Tag ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends TagSubsetKey>(
    subset: T,
    listParams: TagListParams
  ): Promise<TagSubsetMapping[T] | undefined> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0];
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
    let { rows, total } = await this.runSubsetQuery({
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
            qb.where("tags.id", "like", `%${params.keyword}%`);
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
          qb.orderBy("tags." + orderByField, orderByDirec);
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
  async save(saveParamsArray: TagSaveParams[]): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    saveParamsArray.map((saveParams) => {
      ub.register("tags", saveParams);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await ub.upsert(trx, "tags");

      return ids;
    });
  }

  @api({ httpMethod: "GET" })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("tags").whereIn("tags.id", ids).delete();
    });

    return ids.length;
  }
}

export const TagModel = new TagModelClass();

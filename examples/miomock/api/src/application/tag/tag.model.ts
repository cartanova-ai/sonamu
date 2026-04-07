import assert from "assert";

import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  cache,
  exhaustive,
  NotFoundException,
  Sonamu,
} from "sonamu";
import { type ListResult } from "sonamu";

import { SD } from "../../i18n/sd.generated";
import { AuditLogModel } from "../audit-log/audit-log.model";
import { type TagSubsetKey, type TagSubsetMapping } from "../sonamu.generated";
import { tagLoaderQueries, tagSubsetQueries } from "../sonamu.generated.sso";
import { type TagListParams, type TagSaveParams } from "./tag.types";

/*
  Tag Model
*/
class TagModelClass extends BaseModelClass<
  TagSubsetKey,
  TagSubsetMapping,
  typeof tagSubsetQueries,
  typeof tagLoaderQueries
> {
  constructor() {
    super("Tag", tagSubsetQueries, tagLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Tag" })
  async findById<T extends TagSubsetKey>(subset: T, id: number): Promise<TagSubsetMapping[T]> {
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
        throw new BadRequestException(SD("search.invalidField")(params.search));
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

    // create/update 판별
    const isCreate = spa.map((sp) => !sp.id);

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("tags");

      // audit log
      await Promise.all(
        ids.map((id, i) =>
          AuditLogModel.log({
            actor_id: null,
            action: isCreate[i] ? "create" : "update",
            entity_type: "Tag",
            entity_id: id,
            old_value: null,
            new_value: spa[i] ?? null,
          }),
        ),
      );

      return ids;
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");
    const rdb = this.getPuri("r");

    // 삭제 전 old_value 조회
    const oldRows = await rdb.table("tags").whereIn("id", ids).selectAll();

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("tags").whereIn("tags.id", ids).delete();
    });

    // audit log
    await Promise.all(
      oldRows.map((row) =>
        AuditLogModel.log({
          actor_id: null,
          action: "delete",
          entity_type: "Tag",
          entity_id: row.id,
          old_value: row,
          new_value: null,
        }),
      ),
    );

    return ids.length;
  }

  /**
   * 캐시 테스트용 API
   */
  @cache({ tags: ["tag"] })
  @api({ httpMethod: "GET", clients: ["axios"] })
  async cached(): Promise<TagSubsetMapping["A"]> {
    console.log(`[Tag.cached] Cache miss - fetching from DB`);

    const { rows } = await this.findMany("A", {
      id: 1,
      num: 1,
      page: 1,
    });
    assert(rows[0]);

    return rows[0];
  }

  @api({ httpMethod: "GET", clients: ["axios"] })
  async deleteCached(): Promise<void> {
    await Sonamu.cache.expire({ key: "Tag.cached" });
  }

  @api({ httpMethod: "POST", clients: ["axios"] })
  async runWorkflow(): Promise<void> {
    const handle = await Sonamu.workflows.run({ name: "test-workflow", version: null }, {});
    console.log("handle", handle);
  }
}

export const TagModel = new TagModelClass();

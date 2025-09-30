import {
  ListResult,
  asArray,
  NotFoundException,
  BadRequestException,
  api,
  BaseModelClass,
  Sonamu,
} from "sonamu";
import { UserSubsetKey, UserSubsetMapping } from "../sonamu.generated";
import { userSubsetQueries } from "../sonamu.generated.sso";
import { UserListParams, UserSaveParams } from "./user.types";

/*
  User Model
*/
class UserModelClass extends BaseModelClass {
  modelName = "User";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "User" })
  async findById<T extends UserSubsetKey>(
    subset: T,
    id: number
  ): Promise<UserSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(`존재하지 않는 User ID ${id}`);
    }
    return rows[0];
  }

  async findOne<T extends UserSubsetKey>(
    subset: T,
    listParams: UserListParams
  ): Promise<UserSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "Users" })
  async findMany<T extends UserSubsetKey>(
    subset: T,
    params: UserListParams = {}
  ): Promise<ListResult<UserSubsetMapping[T]>> {
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
      subsetQuery: userSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("users.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("users.id", params.keyword);
          }
          // } else if (params.search === "field") {
          //   qb.where("users.field", "like", `%${params.keyword}%`);
          // }
          else {
            throw new BadRequestException(
              `구현되지 않은 검색 필드 ${params.search}`
            );
          }
        }

        // orderBy
        if (params.orderBy) {
          // default orderBy
          const [orderByField, orderByDirec] = params.orderBy.split("-");
          qb.orderBy("users." + orderByField, orderByDirec);
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
  async save(spa: UserSaveParams[]): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    console.log(spa);

    // register
    spa.map((sp) => {
      ub.register("users", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await ub.upsert(trx, "users");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("users").whereIn("users.id", ids).delete();
    });

    return ids.length;
  }

  @api({ httpMethod: "GET" })
  async getMyIP(): Promise<{ ip: string }> {
    const context = Sonamu.getContext();
    return {
      ip: context.ip,
    };
  }
}

export const UserModel = new UserModelClass();

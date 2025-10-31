import { DateTime } from "luxon";
import { UserListParams, UserLoginParams } from "./user.types";
import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  ListResult,
  NotFoundException,
  Context,
  UnauthorizedException,
} from "sonamu";
import {
  UserSubsetSS,
  UserSubsetKey,
  UserSubsetMapping,
} from "../sonamu.generated";
import { userSubsetQueries } from "../sonamu.generated.sso";

const MOCKED_USER: UserSubsetSS = {
  id: 1000,
  string_id: "minsangk",
  role: "supervisor",
  name: "김민상",
  birthyear: 1985,
  status: "active",
  created_at: DateTime.local().toSQL().slice(0, 19),
};

export class UserModelClass extends BaseModelClass {
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
    if (rows.length == 0) {
      throw new NotFoundException(`존재하지 않는 유저ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends UserSubsetKey>(
    subset: T,
    listParams: UserListParams
  ): Promise<UserSubsetMapping[T] | undefined> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0];
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
      search: "name",
      orderBy: "id-desc",
      ...params,
    };

    // build queries
    let { rows, total, subsetQuery } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: userSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("users.id", asArray(params.id));
        }
        // type
        if (params.role) {
          qb.whereIn("users.role", asArray(params.role));
        }
        // status
        if (params.status) {
          qb.whereIn("users.status", asArray(params.status));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "name") {
            qb.where("users.name", "like", `%${params.keyword}%`);
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
          qb.orderBy("users." + orderByField, orderByDirec);
        }

        return qb;
      },
      debug: false,
    });

    // extend with virtual (example)
    if (subsetQuery.virtual.includes("next_post")) {
      // rows = rows.map((row) => {
      //   row.next_post = {
      //     a: "a",
      //     b: 1,
      //     c: new Date(),
      //   };
      //   return row;
      // });
    }

    return {
      rows,
      total,
    };
  }

  @api({ httpMethod: "POST" })
  async login(
    loginParams: UserLoginParams,
    context: Context
  ): Promise<{ success: boolean; user?: UserSubsetSS }> {
    const { string_id, pw } = loginParams;

    if (string_id === "minsangk" && pw === "password1234") {
      const user = MOCKED_USER;
      await context.passport.login(user);

      return {
        success: true,
        user,
      };
    } else {
      throw new UnauthorizedException("잘못된 비밀번호입니다.");
    }
  }

  @api({ clients: ["axios", "swr"] })
  async me(context: Context): Promise<UserSubsetSS | null> {
    return context.user ?? null;
  }

  @api()
  async logout(context: Context): Promise<{ message: string }> {
    await context.passport.logout();
    await context.session.delete();

    return {
      message: "ok",
    };
  }

  @api()
  async test1(): Promise<{ message: string }> {
    return {
      message: `ok`,
    };
  }
}
export const UserModel = new UserModelClass();

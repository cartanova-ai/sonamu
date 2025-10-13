import {
  ListResult,
  asArray,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  api,
  BaseModelClass,
  Sonamu,
} from "sonamu";
import { UserSubsetKey, UserSubsetMapping } from "../sonamu.generated";
import { userSubsetQueries } from "../sonamu.generated.sso";
import {
  UserListParams,
  UserSaveParams,
  UserLoginParams,
  UserRegisterParams,
} from "./user.types";
import bcrypt from "bcrypt";

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

  @api({ httpMethod: "GET", clients: ["axios", "swr"] })
  async me(): Promise<UserSubsetMapping["A"] | null> {
    const context = Sonamu.getContext();

    if (!context.user) {
      return null;
    }

    const user = await this.findById("SS", context.user.id);

    return user;
  }

  @api({ httpMethod: "POST" })
  async login(
    params: UserLoginParams
  ): Promise<{ user: UserSubsetMapping["SS"] }> {
    const rdb = this.getDB("r");
    const context = Sonamu.getContext();

    // 이메일로 사용자 조회
    const user = await rdb("users")
      .select("*")
      .where("email", params.email)
      .first();

    if (!user) {
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 일치하지 않습니다"
      );
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(
      params.password,
      user.password
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 일치하지 않습니다"
      );
    }

    // 세션에 사용자 ID 저장
    await context.passport.login(user);

    // 마지막 로그인 시간 업데이트
    const wdb = this.getDB("w");
    await wdb("users")
      .where("id", user.id)
      .update({ last_login_at: new Date() });

    return { user: await this.findById("SS", user.id) };
  }

  @api({ httpMethod: "GET" })
  async logout(): Promise<{ message: string }> {
    const context = Sonamu.getContext();
    await context.passport.logout();
    return { message: "로그아웃 되었습니다" };
  }

  @api({ httpMethod: "POST" })
  async register(
    params: UserRegisterParams
  ): Promise<{ user: UserSubsetMapping["A"] }> {
    const rdb = this.getDB("r");
    const wdb = this.getDB("w");

    // 이메일 중복 확인
    const existingUser = await rdb("users")
      .where("email", params.email)
      .first();

    if (existingUser) {
      throw new BadRequestException("이미 사용중인 이메일입니다");
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(params.password, 10);

    // 사용자 생성
    const [userId] = await wdb("users").insert({
      email: params.email,
      username: params.username,
      password: hashedPassword,
      role: params.role || "normal",
      is_verified: false,
    });

    if (!userId) {
      throw new Error("사용자 생성에 실패했습니다");
    }

    return { user: await this.findById("SS", userId) };
  }
}

export const UserModel = new UserModelClass();

import bcrypt from "bcrypt";
import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  type ListResult,
  Naite,
  NotFoundException,
  Sonamu,
  transactional,
  UnauthorizedException,
} from "sonamu";
import type { UserSubsetKey, UserSubsetMapping } from "../sonamu.generated";
import { userLoaderQueries, userSubsetQueries } from "../sonamu.generated.sso";
import type {
  UserListParams,
  UserLoginParams,
  UserRegisterParams,
  UserSaveParams,
} from "./user.types";

/*
  User Model
*/

class UserModelClass extends BaseModelClass<
  UserSubsetKey,
  UserSubsetMapping,
  typeof userSubsetQueries,
  typeof userLoaderQueries
> {
  constructor() {
    super("User", userSubsetQueries, userLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "User" })
  async findById<T extends UserSubsetKey>(subset: T, id: number): Promise<UserSubsetMapping[T]> {
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
    listParams: UserListParams,
  ): Promise<UserSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"],
    resourceName: "Users",
    timeout: 1000,
  })
  async findMany<T extends UserSubsetKey, LP extends UserListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, UserSubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    };

    const { qb, onSubset } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("users.id", asArray(params.id));
    }

    // Delete this after testing
    if (params.test) {
      onSubset("P").where("employee__department.name", params.test);
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("users.id", Number(params.keyword));
      } else {
        exhaustive(params.search);
      }
    }

    // orderBy
    if (params.orderBy) {
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("users.id", "desc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    const enhancers = this.createEnhancers({
      A: (row) => row,
      P: (row) => row,
      SS: (row) => row,
    });

    Naite.t("esq-query", qb.toQuery());
    return this.executeSubsetQuery({
      subset,
      qb,
      params,
      enhancers,
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async save(spa: UserSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("users", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("users");

      return ids;
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("users").whereIn("users.id", ids).delete();
    });

    return ids.length;
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async getMyIP(): Promise<{ ip: string }> {
    const context = Sonamu.getContext();
    return {
      ip: context.ip,
    };
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async me(): Promise<UserSubsetMapping["SS"] | null> {
    const context = Sonamu.getContext();

    if (!context.user) {
      return null;
    }

    const user = await this.findById("SS", context.user.id);

    return user;
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async login(params: UserLoginParams): Promise<{ user: UserSubsetMapping["SS"] }> {
    const rdb = this.getDB("r");
    const context = Sonamu.getContext();

    // 이메일로 사용자 조회
    const user = await rdb("users").select("*").where("email", params.email).first();

    if (!user) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 일치하지 않습니다");
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(params.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 일치하지 않습니다");
    }

    // 세션에 사용자 ID 저장
    await context.passport.login(user);

    // 마지막 로그인 시간 업데이트
    const wdb = this.getDB("w");
    await wdb("users").where("id", user.id).update({ last_login_at: new Date() });

    return { user: await this.findById("SS", user.id) };
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-mutation"] })
  async logout(): Promise<{ message: string }> {
    const context = Sonamu.getContext();
    await context.passport.logout();
    return { message: "로그아웃 되었습니다" };
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async register(params: UserRegisterParams): Promise<{ user: UserSubsetMapping["SS"] }> {
    const rdb = this.getDB("r");
    const wdb = this.getDB("w");

    // 이메일 중복 확인
    const existingUser = await rdb("users").where("email", params.email).first();

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

  // @api({ httpMethod: "GET" })
  // async search(params: UserSearchParams): Promise<UserSubsetMapping["A"][]> {
  //   const rdb = this.getPuri("r");
  //   const users = await rdb
  //     .table("users")
  //     .selectAll()
  //     .whereMatch("users.bio", params.keyword) // ngram index
  //     .debug();
  //   return users;
  // }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  @transactional({ readOnly: true })
  async trxTest(): Promise<void> {
    const wdb = this.getPuri("w");

    await wdb.debugTransaction();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const [trxStates] = await wdb.knex.raw(`
      SELECT *
      FROM performance_schema.events_transactions_current
      WHERE THREAD_ID = (
          SELECT THREAD_ID
          FROM performance_schema.threads
          WHERE PROCESSLIST_ID = CONNECTION_ID()
        )
    `);

    console.log(trxStates);
  }
}

export const UserModel = new UserModelClass();

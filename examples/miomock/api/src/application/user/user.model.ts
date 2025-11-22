import bcrypt from "bcrypt";
import {
  api,
  asArray,
  BadRequestException,
  type DatabaseSchemaExtend,
  exhaustive,
  type ListResult,
  Naite,
  NotFoundException,
  type PuriWrapper,
  Sonamu,
  transactional,
  UnauthorizedException,
} from "sonamu";
import type { UserSubsetKey, UserSubsetMapping } from "../sonamu.generated";
import { userSubsetQueries } from "../sonamu.generated.sso";
import { CustomBaseModelClass } from "./custom-base-model-class";
import type {
  UserListParams,
  UserLoginParams,
  UserRegisterParams,
  UserSaveParams,
  UserSearchParams,
} from "./user.types";

/*
  User Model
*/
class UserModelClass extends CustomBaseModelClass<
  UserSubsetKey,
  UserSubsetMapping,
  typeof puriBasedUserSubsetQueries
> {
  modelName = "User";

  @api({ httpMethod: "GET", clients: ["axios", "swr"], resourceName: "User" })
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
    clients: ["axios", "swr"],
    resourceName: "Users",
    timeout: 1000,
  })
  async findMany<T extends UserSubsetKey>(
    subset: T,
    _params: UserListParams = {},
  ): Promise<ListResult<UserSubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ..._params,
    };

    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("users.id", asArray(params.id));
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

    Naite.t("esq-query", qb.toQuery());
    const { rows, total } = await this.executeSubsetQuery({
      subset,
      qb,
      params,
    });

    return {
      rows,
      total,
    };
  }

  @api({ httpMethod: "POST" })
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

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("users").whereIn("users.id", ids).delete();
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
  async me(): Promise<UserSubsetMapping["SS"] | null> {
    const context = Sonamu.getContext();

    if (!context.user) {
      return null;
    }

    const user = await this.findById("SS", context.user.id);

    return user;
  }

  @api({ httpMethod: "POST" })
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

  @api({ httpMethod: "GET" })
  async logout(): Promise<{ message: string }> {
    const context = Sonamu.getContext();
    await context.passport.logout();
    return { message: "로그아웃 되었습니다" };
  }

  @api({ httpMethod: "POST" })
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

  @api({ httpMethod: "GET" })
  async search(params: UserSearchParams): Promise<UserSubsetMapping["A"][]> {
    const rdb = this.getPuri("r");
    const users = await rdb
      .table("users")
      .selectAll()
      .whereMatch("users.bio", params.keyword) // ngram index
      .debug();
    return users;
  }

  @api({ httpMethod: "GET" })
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

  async testNaite(): Promise<void> {
    // 동일한 이름으로 여러번 로깅시 (number)
    Naite.t("testArray", 1);
    Naite.t("testArray", 2);
    Naite.t("testArray", 3);

    // 동일한 이름으로 여러번 로깅시 (object)
    Naite.t("testObjectArray", { a: 1, b: 2 });
    Naite.t("testObjectArray", { a: 3, b: 4 });

    // 메소드 자체는 에러 상황
    throw new Error("Not implemented yet.");
  }
}

const puriBasedUserSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("users")
      .join({ employee: "employees" }, "users.id", "employee.user_id")
      .join(
        { employee__department: "departments" },
        "employee.department_id",
        "employee__department.id",
      )
      .select({
        id: "users.id",
        username: "users.username",
        role: "users.role",
        bio: "users.bio",
        is_verified: "users.is_verified",
        employee__department__name: "employee__department.name",
        employee__salary: "employee.salary",
      });
  },
  P: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("users").select({
      id: "users.id",
      created_at: "users.created_at",
      email: "users.email",
      username: "users.username",
      birth_date: "users.birth_date",
      role: "users.role",
      last_login_at: "users.last_login_at",
      bio: "users.bio",
      is_verified: "users.is_verified",
    });
  },
  SS: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper.from("users").select({
      id: "users.id",
      created_at: "users.created_at",
      email: "users.email",
      username: "users.username",
      birth_date: "users.birth_date",
      role: "users.role",
      last_login_at: "users.last_login_at",
      bio: "users.bio",
      is_verified: "users.is_verified",
    });
  },
};
const puriBasedUserSubsetLoaders = {
  A: userSubsetQueries.P.loaders,
  P: userSubsetQueries.A.loaders,
  SS: userSubsetQueries.SS.loaders,
};

export const UserModel = new UserModelClass(puriBasedUserSubsetQueries, puriBasedUserSubsetLoaders);

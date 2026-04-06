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
} from "sonamu";

import { SD } from "../../i18n/sd.generated";
import type { UserSubsetKey, UserSubsetMapping } from "../sonamu.generated";
import { userLoaderQueries, userSubsetQueries } from "../sonamu.generated.sso";
import type { UserListParams, UserSaveParams } from "./user.types";

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
  async findById<T extends UserSubsetKey>(subset: T, id: string): Promise<UserSubsetMapping[T]> {
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

    // soft delete 필터: deleted_at이 없는 사용자만 조회
    qb.where("users.deleted_at", null);

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
        qb.where("users.id", params.keyword);
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
  async save(spa: UserSaveParams[]): Promise<string[]> {
    const wdb = this.getPuri("w");
    const rdb = this.getPuri("r");

    // 신규 생성 시 이메일 중복 체크
    const newUsers = spa.filter((sp) => !sp.id);
    if (newUsers.length > 0) {
      const emails = newUsers.map((sp) => sp.email);
      const existing = await rdb.table("users").whereIn("email", emails).selectAll().first();
      if (existing) {
        throw new BadRequestException(SD("user.email.duplicate"));
      }
    }

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
  async del(ids: string[]): Promise<number> {
    const wdb = this.getPuri("w");

    // soft delete: deleted_at 설정
    await wdb.transaction(async (trx) => {
      return trx.table("users").whereIn("users.id", ids).update({ deleted_at: new Date() });
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

  // @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  // async register(params: UserRegisterParams): Promise<{ user: UserSubsetMapping["SS"] }> {
  //   const rdb = this.getDB("r");
  //   const wdb = this.getDB("w");

  //   // 이메일 중복 확인
  //   const existingUser = await rdb("users").where("email", params.email).first();

  //   if (existingUser) {
  //     throw new BadRequestException(SD("user.email.duplicate"));
  //   }

  //   // 비밀번호 해싱
  //   const hashedPassword = await bcrypt.hash(params.password, 10);

  //   // 사용자 생성
  //   const [userId] = await wdb("users").insert({
  //     email: params.email,
  //     username: params.username,
  //     password: hashedPassword,
  //     role: params.role || "normal",
  //     is_verified: false,
  //   });

  //   if (!userId) {
  //     throw new Error("사용자 생성에 실패했습니다");
  //   }

  //   return { user: await this.findById("SS", userId) };
  // }

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

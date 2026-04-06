import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  NotFoundException,
} from "sonamu";
import type { ListResult } from "sonamu";

import { SD } from "../../i18n/sd.generated";
import { AuditLogModel } from "../audit-log/audit-log.model";
import type { CompanySubsetKey, CompanySubsetMapping } from "../sonamu.generated";
import { companyLoaderQueries, companySubsetQueries } from "../sonamu.generated.sso";
import type { CompanyListParams, CompanySaveParams } from "./company.types";

/*
  Company Model
*/
class CompanyModelClass extends BaseModelClass<
  CompanySubsetKey,
  CompanySubsetMapping,
  typeof companySubsetQueries,
  typeof companyLoaderQueries
> {
  constructor() {
    super("Company", companySubsetQueries, companyLoaderQueries);
  }

  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"],
    resourceName: "Company",
  })
  async findById<T extends CompanySubsetKey>(
    subset: T,
    id: number,
  ): Promise<CompanySubsetMapping[T]> {
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

  async findOne<T extends CompanySubsetKey>(
    subset: T,
    listParams: CompanyListParams,
  ): Promise<CompanySubsetMapping[T] | null> {
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
    resourceName: "Companies",
  })
  async findMany<T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, CompanySubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      orderBy: "id-desc" as const,
      ...rawParams,
    } satisfies CompanyListParams;
    this.logger.info("findMany", { subset, rawParams });

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    if (params.id) {
      // id
      qb.whereIn("companies.id", asArray(params.id));
    }

    if (params.search && params.keyword && params.keyword.length > 0) {
      // search-keyword
      if (params.search === "id") {
        qb.where("companies.id", Number(params.keyword));
      } else if (params.search === "name") {
        qb.where("companies.name", "like", `%${params.keyword}%`);
      } else {
        throw new BadRequestException(SD("search.invalidField")(params.search));
      }
    }

    if (params.orderBy) {
      // orderBy
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("companies.id", "desc");
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
  async save(spa: CompanySaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");
    const rdb = this.getPuri("r");

    // 신규 생성 시 회사명 중복 체크
    const newCompanies = spa.filter((sp) => !sp.id);
    if (newCompanies.length > 0) {
      const names = newCompanies.map((sp) => sp.name);
      const existing = await rdb.table("companies").whereIn("name", names).selectAll().first();
      if (existing) {
        throw new BadRequestException(SD("company.name.duplicate"));
      }
    }

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("companies", sp);
    });

    // create/update 판별을 위해 id 유무 기록
    const isCreate = spa.map((sp) => !sp.id);

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("companies");

      // audit log
      await Promise.all(
        ids.map((id, i) =>
          AuditLogModel.log({
            actor_id: null,
            action: isCreate[i] ? "create" : "update",
            entity_type: "Company",
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
    const oldRows = await rdb.table("companies").whereIn("id", ids).selectAll();

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("companies").whereIn("companies.id", ids).delete();
    });

    // audit log
    await Promise.all(
      oldRows.map((row) =>
        AuditLogModel.log({
          actor_id: null,
          action: "delete",
          entity_type: "Company",
          entity_id: row.id,
          old_value: row,
          new_value: null,
        }),
      ),
    );

    return ids.length;
  }
}

export const CompanyModel = new CompanyModelClass();

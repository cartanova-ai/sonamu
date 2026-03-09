import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  exhaustive,
  type ListResult,
  NotFoundException,
} from "sonamu";
import { SD } from "../../i18n/sd.generated";
import type { DepartmentSubsetKey, DepartmentSubsetMapping } from "../sonamu.generated";
import { departmentLoaderQueries, departmentSubsetQueries } from "../sonamu.generated.sso";
import type { DepartmentListParams, DepartmentSaveParams } from "./department.types";

/*
  Department Model
*/
class DepartmentModelClass extends BaseModelClass<
  DepartmentSubsetKey,
  DepartmentSubsetMapping,
  typeof departmentSubsetQueries,
  typeof departmentLoaderQueries
> {
  constructor() {
    super("Department", departmentSubsetQueries, departmentLoaderQueries);
  }

  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"],
    resourceName: "Department",
  })
  async findById<T extends DepartmentSubsetKey>(
    subset: T,
    id: number,
  ): Promise<DepartmentSubsetMapping[T]> {
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

  async findOne<T extends DepartmentSubsetKey>(
    subset: T,
    listParams: DepartmentListParams,
  ): Promise<DepartmentSubsetMapping[T] | null> {
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
    resourceName: "Departments",
  })
  async findMany<T extends DepartmentSubsetKey, LP extends DepartmentListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, DepartmentSubsetMapping[T]>> {
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
      qb.whereIn("departments.id", asArray(params.id));
    }

    if (params.company_name) {
      onSubset(["A", "P", "P2"]).where("company.name", params.company_name);
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("departments.id", Number(params.keyword));
      } else if (params.search === "name") {
        qb.where("departments.name", "like", `%${params.keyword}%`);
      } else {
        exhaustive(params.search);
      }
    }

    // orderBy
    if (params.orderBy) {
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("departments.id", "desc");
      } else if (params.orderBy === "name-asc") {
        qb.orderBy("departments.name", "asc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    const enhancers = this.createEnhancers({
      A: (row) => ({
        ...row,
        employee_count: row.employees.length,
      }),
      P: (row) => ({
        ...row,
        employee_count: 0,
      }),
    });

    return this.executeSubsetQuery({
      subset,
      qb,
      params,
      enhancers,
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async save(spa: DepartmentSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");
    const rdb = this.getPuri("r");

    // 신규 생성 시 같은 회사 내 부서명 중복 체크
    const newDepts = spa.filter((sp) => !sp.id);
    if (newDepts.length > 0) {
      const checks = newDepts.map((sp) =>
        rdb
          .table("departments")
          .where("company_id", sp.company_id)
          .where("name", sp.name)
          .selectAll()
          .first(),
      );
      const results = await Promise.all(checks);
      if (results.some((r) => r !== undefined)) {
        throw new BadRequestException(SD("department.name.duplicate"));
      }
    }

    // register
    for (const sp of spa) {
      wdb.ubRegister("departments", sp);
    }

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("departments");

      return ids;
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("departments").whereIn("departments.id", ids).delete();
    });

    return ids.length;
  }
}

export const DepartmentModel = new DepartmentModelClass();

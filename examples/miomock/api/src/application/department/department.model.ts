import {
  api,
  asArray,
  BaseModelClass,
  exhaustive,
  type ListResult,
  NotFoundException,
} from "sonamu";
import type { DepartmentSubsetKey, DepartmentSubsetMapping } from "../sonamu.generated";
import { departmentPuriLoaderQueries, departmentPuriSubsetQueries } from "../sonamu.generated.sso";
import type { DepartmentListParams, DepartmentSaveParams } from "./department.types";

/*
  Department Model
*/
class DepartmentModelClass extends BaseModelClass<
  DepartmentSubsetKey,
  DepartmentSubsetMapping,
  typeof departmentPuriSubsetQueries,
  typeof departmentPuriLoaderQueries
> {
  modelName = "Department";

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
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
      throw new NotFoundException(`존재하지 않는 Department ID ${id}`);
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
    clients: ["axios", "swr"],
    resourceName: "Departments",
  })
  async findMany<T extends DepartmentSubsetKey>(
    subset: T,
    params: DepartmentListParams = {},
  ): Promise<ListResult<DepartmentSubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "id",
      orderBy: "id-desc",
      ...params,
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
        employee_count: row.employees?.length ?? 0,
      }),
      P: (row) => ({
        ...row,
        employee_count: 0,
      }),
    });

    const { rows, total } = await this.executeSubsetQuery({
      subset,
      qb,
      params,
      enhancers,
      debug: true,
    });

    return {
      rows,
      total,
    };
  }

  @api({ httpMethod: "POST" })
  async save(spa: DepartmentSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

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

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("departments").whereIn("departments.id", ids).delete();
    });

    return ids.length;
  }
}

export const DepartmentModel = new DepartmentModelClass(
  departmentPuriSubsetQueries,
  departmentPuriLoaderQueries,
);

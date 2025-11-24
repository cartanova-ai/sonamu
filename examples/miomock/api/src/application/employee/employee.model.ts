import {
  api,
  asArray,
  BadRequestException,
  BaseModelClass,
  type ListResult,
  NotFoundException,
  withProp,
} from "sonamu";
import type { EmployeeSubsetKey, EmployeeSubsetMapping } from "../sonamu.generated";
import { employeePuriLoaderQueries, employeePuriSubsetQueries } from "../sonamu.generated.sso";
import type { EmployeeListParams, EmployeeSaveParams } from "./employee.types";

/*
  Employee Model
*/
class EmployeeModelClass extends BaseModelClass<
  EmployeeSubsetKey,
  EmployeeSubsetMapping,
  typeof employeePuriSubsetQueries,
  typeof employeePuriLoaderQueries
> {
  modelName = "Employee";

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
    resourceName: "Employee",
  })
  async findById<T extends EmployeeSubsetKey>(
    subset: T,
    id: number,
  ): Promise<EmployeeSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(`존재하지 않는 Employee ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends EmployeeSubsetKey>(
    subset: T,
    listParams: EmployeeListParams,
  ): Promise<EmployeeSubsetMapping[T] | null> {
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
    resourceName: "Employees",
  })
  async findMany<T extends EmployeeSubsetKey>(
    subset: T,
    params: EmployeeListParams = {},
  ): Promise<ListResult<EmployeeSubsetMapping[T]>> {
    // params with defaults
    params = {
      num: 24,
      page: 1,
      search: "id",
      orderBy: "id-desc",
      ...params,
    };

    // build queries
    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("employees.id", asArray(params.id));
    }

    if (params.search && params.keyword && params.keyword.length > 0) {
      // search-keyword
      if (params.search === "id") {
        qb.where("employees.id", Number(params.keyword));
        // } else if (params.search === "field") {
        //   qb.where("employees.field", "like", `%${params.keyword}%`);
      } else {
        throw new BadRequestException(`구현되지 않은 검색 필드 ${params.search}`);
      }
    }

    if (params.orderBy) {
      const [orderByField, orderByDirec] = params.orderBy.split("-");
      if (orderByField === "id") {
        qb.orderBy("employees.id", orderByDirec === "asc" ? "asc" : "desc");
      }
    }

    const enhancers = this.createEnhancers({
      A: (row) => ({
        ...row,
        department: {
          ...row.department,
          employee_count: 0,
        },
      }),
      P: (row) => {
        const a = withProp(row, "user.employee.department.employee_count", 0);
        const b = withProp(a, "department.employees.projs.virtual_test", 0);
        return b;
      },
      // P: (row) => ({
      //   ...row,
      //   user: {
      //     ...row.user,
      //     employee: {
      //       ...row.user.employee,
      //       department: {
      //         ...row.user.employee.department,
      //         employee_count: 0,
      //       },
      //     },
      //   },
      //   department: {
      //     ...row.department,
      //     employees: row.department.employees.map((employee) => ({
      //       ...employee,
      //       projs: employee.projs.map((proj) => ({ ...proj, virtual_test: 0 })),
      //     })),
      //   },
      // }),
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
  async save(spa: EmployeeSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.forEach((sp) => {
      wdb.ubRegister("employees", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("employees");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("employees").whereIn("employees.id", ids).delete();
    });

    return ids.length;
  }
}

export const EmployeeModel = new EmployeeModelClass(
  employeePuriSubsetQueries,
  employeePuriLoaderQueries,
);

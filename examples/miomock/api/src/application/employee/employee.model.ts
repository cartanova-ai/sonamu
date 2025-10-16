import {
  BaseModelClass,
  ListResult,
  asArray,
  NotFoundException,
  BadRequestException,
  api,
} from "sonamu";
import { EmployeeSubsetKey, EmployeeSubsetMapping } from "../sonamu.generated";
import { employeeSubsetQueries } from "../sonamu.generated.sso";
import { EmployeeListParams, EmployeeSaveParams } from "./employee.types";

/*
  Employee Model
*/
class EmployeeModelClass extends BaseModelClass {
  modelName = "Employee";

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
    resourceName: "Employee",
  })
  async findById<T extends EmployeeSubsetKey>(
    subset: T,
    id: number
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
    listParams: EmployeeListParams
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
    params: EmployeeListParams = {}
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
    let { rows, total } = await this.runSubsetQuery({
      subset,
      params,
      subsetQuery: employeeSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("employees.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("employees.id", params.keyword);
            // } else if (params.search === "field") {
            //   qb.where("employees.field", "like", `%${params.keyword}%`);
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
          qb.orderBy("employees." + orderByField, orderByDirec);
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
  async save(spa: EmployeeSaveParams[]): Promise<number[]> {
    const wdb = this.getDB("w");
    const ub = this.getUpsertBuilder();

    // register
    spa.map((sp) => {
      ub.register("employees", sp);
    });

    // transaction
    return wdb.transaction(async (trx) => {
      const ids = await ub.upsert(trx, "employees");

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getDB("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx("employees").whereIn("employees.id", ids).delete();
    });

    return ids.length;
  }
}

export const EmployeeModel = new EmployeeModelClass();

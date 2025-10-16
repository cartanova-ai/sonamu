import {
  BaseModelClass,
  ListResult,
  asArray,
  NotFoundException,
  BadRequestException,
  api,
} from "sonamu";
import {
  DepartmentSubsetKey,
  DepartmentSubsetMapping,
} from "../sonamu.generated";
import { departmentSubsetQueries } from "../sonamu.generated.sso";
import { DepartmentListParams, DepartmentSaveParams } from "./department.types";

/*
  Department Model
*/
class DepartmentModelClass extends BaseModelClass {
  modelName = "Department";

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
    resourceName: "Department",
  })
  async findById<T extends DepartmentSubsetKey>(
    subset: T,
    id: number
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
    listParams: DepartmentListParams
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
    params: DepartmentListParams = {}
  ): Promise<ListResult<DepartmentSubsetMapping[T]>> {
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
      subsetQuery: departmentSubsetQueries[subset],
      build: ({ qb, virtual, db }) => {
        // id
        if (params.id) {
          qb.whereIn("departments.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("departments.id", params.keyword);
            // } else if (params.search === "field") {
            //   qb.where("departments.field", "like", `%${params.keyword}%`);
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
          qb.orderBy("departments." + orderByField, orderByDirec);
        }

        if (virtual.includes("employee_count")) {
          qb.leftJoin("employees", "departments.id", "employees.department_id");
          qb.groupBy("departments.id");
          qb.select(db.raw`COUNT(employees.id) as employee_count`);
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
  async save(spa: DepartmentSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // register
    spa.map((sp) => {
      wdb.ubRegister("departments", sp);
    });

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

export const DepartmentModel = new DepartmentModelClass();

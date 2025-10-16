import {
  BaseModelClass,
  ListResult,
  asArray,
  NotFoundException,
  BadRequestException,
  api,
} from "sonamu";
import { ProjectSubsetKey, ProjectSubsetMapping } from "../sonamu.generated";
import { projectSubsetQueries } from "../sonamu.generated.sso";
import { ProjectListParams, ProjectSaveParams } from "./project.types";

/*
  Project Model
*/
class ProjectModelClass extends BaseModelClass {
  modelName = "Project";

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
    resourceName: "Project",
  })
  async findById<T extends ProjectSubsetKey>(
    subset: T,
    id: number
  ): Promise<ProjectSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, {
      id,
      num: 1,
      page: 1,
    });
    if (!rows[0]) {
      throw new NotFoundException(`존재하지 않는 Project ID ${id}`);
    }

    return rows[0];
  }

  async findOne<T extends ProjectSubsetKey>(
    subset: T,
    listParams: ProjectListParams
  ): Promise<ProjectSubsetMapping[T] | null> {
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
    resourceName: "Projects",
  })
  async findMany<T extends ProjectSubsetKey>(
    subset: T,
    params: ProjectListParams = {}
  ): Promise<ListResult<ProjectSubsetMapping[T]>> {
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
      subsetQuery: projectSubsetQueries[subset],
      build: ({ qb }) => {
        // id
        if (params.id) {
          qb.whereIn("projects.id", asArray(params.id));
        }

        // search-keyword
        if (params.search && params.keyword && params.keyword.length > 0) {
          if (params.search === "id") {
            qb.where("projects.id", params.keyword);
            // } else if (params.search === "field") {
            //   qb.where("projects.field", "like", `%${params.keyword}%`);
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
          qb.orderBy("projects." + orderByField, orderByDirec);
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
  async save(spa: ProjectSaveParams[]): Promise<number[]> {
    const puri = this.getPuri("w");

    // register
    spa.map(({ employee_ids, ...sp }) => {
      const project_id = puri.ubRegister("projects", sp);
      employee_ids.map((employee_id) => {
        puri.ubRegister("projects__employees", {
          project_id,
          employee_id,
        });
      });
    });

    // transaction
    return puri.transaction(async (trx) => {
      const ids = await trx.ubUpsert("projects");
      const peIds = await trx.ubUpsert("projects__employees");

      // 기존에 포함되었으나, 현재는 포함되지 않는 경우
      await trx
        .table("projects__employees")
        .whereIn("project_id", ids)
        .whereNotIn("id", peIds)
        .delete();

      return ids;
    });
  }

  @api({ httpMethod: "POST", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    // transaction
    await wdb.transaction(async (trx) => {
      return trx.table("projects").whereIn("projects.id", ids).delete();
    });

    return ids.length;
  }
}

export const ProjectModel = new ProjectModelClass();

import { isError } from "radashi";
import {
  api,
  asArray,
  BaseModelClass,
  exhaustive,
  type ListResult,
  Naite,
  NotFoundException,
  Sonamu,
  stream,
} from "sonamu";
import type { ProjectSubsetKey, ProjectSubsetMapping } from "../sonamu.generated";
import { projectLoaderQueries, projectSubsetQueries } from "../sonamu.generated.sso";
import { ProjectAgent } from "./project.agent";
import {
  ProjectAskStreamEvents,
  type ProjectListParams,
  type ProjectSaveParams,
} from "./project.types";

/*
  Project Model
*/
class ProjectModelClass extends BaseModelClass<
  ProjectSubsetKey,
  ProjectSubsetMapping,
  typeof projectSubsetQueries,
  typeof projectLoaderQueries
> {
  modelName = "Project";

  @api({
    httpMethod: "GET",
    clients: ["axios", "swr"],
    resourceName: "Project",
  })
  async findById<T extends ProjectSubsetKey>(
    subset: T,
    id: number,
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
    listParams: ProjectListParams,
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
  async findMany<T extends ProjectSubsetKey, LP extends ProjectListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, ProjectSubsetMapping[T]>> {
    // params with defaults
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    };

    const { qb, onSubset: _ } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("projects.id", asArray(params.id));
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("projects.id", Number(params.keyword));
      } else {
        exhaustive(params.search);
      }
    }

    // orderBy
    if (params.orderBy) {
      // default orderBy
      if (params.orderBy === "id-desc") {
        qb.orderBy("projects.id", "desc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    const enhancers = this.createEnhancers({
      A: (row) => ({
        ...row,
        virtual_test: 1,
        employee: row.employee.map((emp) => ({
          ...emp,
          department:
            emp.department?.name !== null
              ? {
                  name: emp.department.name,
                }
              : null,
        })),
      }),
      // A: (row) => ({ ...row }), // virtual_test를 추가하지 않았으므로 오류 발생!
      P: (row) => ({
        ...row,
        employee: row.employee.map((emp) => ({
          ...emp,
          department:
            emp.department?.name !== null
              ? {
                  name: emp.department.name,
                }
              : null,
        })),
      }),
    });

    return this.executeSubsetQuery({
      subset,
      qb,
      params,
      enhancers,
      debug: true,
    });
  }

  @api({ httpMethod: "POST" })
  async save(spa: ProjectSaveParams[]): Promise<number[]> {
    const puri = this.getPuri("w");

    // register
    spa.forEach(({ employee_ids, tag_ids, ...sp }) => {
      const project_id = puri.ubRegister("projects", sp);
      employee_ids.forEach((employee_id) => {
        puri.ubRegister("projects__employees", {
          project_id,
          employee_id,
        });
      });
      tag_ids.forEach((tag_id) => {
        puri.ubRegister("project_tags", {
          project_id,
          tag_id,
        });
      });
    });

    // transaction
    return puri.transaction(async (trx) => {
      const ids = await trx.ubUpsert("projects");
      const peIds = await trx.ubUpsert("projects__employees");
      const ptIds = await trx.ubUpsert("project_tags");

      // 기존에 포함되었으나, 현재는 포함되지 않는 경우
      await trx
        .table("projects__employees")
        .whereIn("project_id", ids)
        .whereNotIn("id", peIds)
        .delete();

      await trx.table("project_tags").whereIn("project_id", ids).whereNotIn("id", ptIds).delete();

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

  @stream({ type: "sse", events: ProjectAskStreamEvents })
  async ask(prompt: string): Promise<void> {
    const { createSSE } = Sonamu.getContext();
    const sse = createSSE(ProjectAskStreamEvents);

    let fullText = "";
    try {
      await ProjectAgent.useAgent(async (agent) => {
        const result = await agent.stream({
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        for await (const item of result.fullStream) {
          if (item.type === "text-delta") {
            Naite.t("project.ask.token", item.text);
            fullText += item.text;
            sse.publish("onToken", { token: item.text });
          }
        }

        let finalOutput: string;
        try {
          Naite.t("project.ask.fullText", fullText);

          const final = await result.text;
          Naite.t("project.ask.final", final);
          finalOutput = final ?? fullText;
        } catch (_error: unknown) {
          finalOutput = fullText;
        }

        sse.publish("onComplete", {
          fullText: finalOutput,
        });
      });
    } catch (error) {
      sse.publish("onError", { error: isError(error) ? error : new Error("Unknown error") });
    }

    await sse.end();
  }
}

export const ProjectModel = new ProjectModelClass(projectSubsetQueries, projectLoaderQueries);

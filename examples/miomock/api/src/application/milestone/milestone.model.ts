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
import { ProjectModel } from "../project/project.model";
import type { MilestoneSubsetKey, MilestoneSubsetMapping } from "../sonamu.generated";
import { milestoneLoaderQueries, milestoneSubsetQueries } from "../sonamu.generated.sso";
import type { MilestoneListParams, MilestoneSaveParams } from "./milestone.types";

/*
  Milestone Model
*/
class MilestoneModelClass extends BaseModelClass<
  MilestoneSubsetKey,
  MilestoneSubsetMapping,
  typeof milestoneSubsetQueries,
  typeof milestoneLoaderQueries
> {
  constructor() {
    super("Milestone", milestoneSubsetQueries, milestoneLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Milestone" })
  async findById<T extends MilestoneSubsetKey>(
    subset: T,
    id: number,
  ): Promise<MilestoneSubsetMapping[T]> {
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

  async findOne<T extends MilestoneSubsetKey>(
    subset: T,
    listParams: MilestoneListParams,
  ): Promise<MilestoneSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, {
      ...listParams,
      num: 1,
      page: 1,
    });

    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Milestones" })
  async findMany<T extends MilestoneSubsetKey, LP extends MilestoneListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, MilestoneSubsetMapping[T]>> {
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "due_date-asc" as const,
      ...rawParams,
    } satisfies MilestoneListParams;

    const { qb } = this.getSubsetQueries(subset);

    // id
    if (params.id) {
      qb.whereIn("milestones.id", asArray(params.id));
    }

    // project_id filter
    if (params.project_id) {
      qb.where("milestones.project_id", params.project_id);
    }

    // search-keyword
    if (params.search && params.keyword && params.keyword.length > 0) {
      if (params.search === "id") {
        qb.where("milestones.id", Number(params.keyword));
      } else {
        throw new BadRequestException(SD("search.invalidField")(params.search));
      }
    }

    // orderBy
    if (params.orderBy) {
      if (params.orderBy === "id-desc") {
        qb.orderBy("milestones.id", "desc");
      } else if (params.orderBy === "due_date-asc") {
        qb.orderBy("milestones.due_date", "asc");
      } else {
        exhaustive(params.orderBy);
      }
    }

    return this.executeSubsetQuery({
      subset,
      qb,
      params,
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async save(spa: MilestoneSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    // 검증: due_date가 프로젝트 deadline 이후이면 에러
    for (const sp of spa) {
      const project = await ProjectModel.findById("A", sp.project_id);

      // 프로젝트 상태 검증
      if (project.status === "completed" || project.status === "cancelled") {
        throw new BadRequestException(SD("milestone.project.closedStatus")(project.status));
      }

      // deadline 검증
      if (project.deadline) {
        const dueDate = new Date(sp.due_date);
        const deadline = new Date(project.deadline);
        if (dueDate > deadline) {
          throw new BadRequestException(
            SD("milestone.dueDate.afterDeadline")(String(sp.due_date), String(project.deadline)),
          );
        }
      }
    }

    spa.forEach((sp) => {
      wdb.ubRegister("milestones", sp);
    });

    return wdb.transaction(async (trx) => {
      return trx.ubUpsert("milestones");
    });
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"], guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    const wdb = this.getPuri("w");

    await wdb.transaction(async (trx) => {
      return trx.table("milestones").whereIn("milestones.id", ids).delete();
    });

    return ids.length;
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async complete(id: number): Promise<MilestoneSubsetMapping["A"]> {
    const wdb = this.getPuri("w");

    await this.findById("A", id);

    await wdb.transaction(async (trx) => {
      await trx.table("milestones").where("id", id).update({ completed_at: new Date() });
    });

    return this.findById("A", id);
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async uncomplete(id: number): Promise<MilestoneSubsetMapping["A"]> {
    const wdb = this.getPuri("w");

    await this.findById("A", id);

    await wdb.transaction(async (trx) => {
      await trx.table("milestones").where("id", id).update({ completed_at: null });
    });

    return this.findById("A", id);
  }
}

export const MilestoneModel = new MilestoneModelClass();

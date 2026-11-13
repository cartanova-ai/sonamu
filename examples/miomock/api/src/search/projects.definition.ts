import { type DefinedSearch, type Projection } from "@sonamu-kit/opensearch";
import { defineSonamuSearch } from "@sonamu-kit/opensearch/sonamu";
import { z } from "zod";

import { ProjectStatus } from "../application/sonamu.generated";
import { PROJECTS_SEARCH_KEY } from "./synchronization";

export const ProjectSearchDocument = z.object({
  name: z.string(),
  description: z.string().nullable(),
  status: ProjectStatus,
  tag_names: z.array(z.string()),
  milestone_names: z.array(z.string()),
  member_employee_ids: z.array(z.number().int()),
});
export type ProjectSearchDocument = z.infer<typeof ProjectSearchDocument>;

function toProjectId(documentId: string): number | undefined {
  const id = Number(documentId);
  return Number.isSafeInteger(id) && id > 0 && String(id) === documentId ? id : undefined;
}

// Loaded lazily: a static import would close the model -> runtime -> definition -> model cycle during module evaluation.
async function loadModels() {
  const [{ ProjectModel }, { MilestoneModel }] = await Promise.all([
    import("../application/project/project.model"),
    import("../application/milestone/milestone.model"),
  ]);
  return { ProjectModel, MilestoneModel };
}

/** Bump projectionVersion whenever the document changes, and keep the old version in PREVIOUS_PROJECTION_VERSIONS until it is retired. */
export function defineProjectsSearch(
  projectionVersion: string,
): DefinedSearch<ProjectSearchDocument> {
  return defineSonamuSearch<ProjectSearchDocument>({
    key: PROJECTS_SEARCH_KEY,
    projectionVersion,
    schema: ProjectSearchDocument,
    settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
    mappings: {
      dynamic: "strict",
      properties: {
        name: { type: "text", fields: { keyword: { type: "keyword", ignore_above: 256 } } },
        description: { type: "text" },
        status: { type: "keyword" },
        tag_names: { type: "keyword" },
        milestone_names: { type: "text" },
        member_employee_ids: { type: "long" },
      },
    },
    requiredPlugins: [],
    async materialize(_context, ids) {
      const { ProjectModel, MilestoneModel } = await loadModels();
      const projectIds = ids.map(toProjectId).filter((id): id is number => id !== undefined);
      const { rows } =
        projectIds.length === 0
          ? { rows: [] }
          : await ProjectModel.findMany("A", { id: projectIds, num: projectIds.length, page: 1 });
      const milestones =
        projectIds.length === 0
          ? []
          : await MilestoneModel.getPuri("r")
              .table("milestones")
              .whereIn("milestones.project_id", projectIds)
              .select({ project_id: "milestones.project_id", name: "milestones.name" })
              .orderBy("milestones.id", "asc");

      const result = new Map<string, Projection<ProjectSearchDocument>>();
      for (const id of ids) {
        const row = rows.find((project) => String(project.id) === id);
        if (row === undefined) {
          result.set(id, { state: "deleted" });
          continue;
        }
        result.set(id, {
          state: "present",
          document: {
            name: row.name,
            description: row.description,
            status: row.status,
            tag_names: row.tags.map((tag) => tag.name).sort(),
            milestone_names: milestones
              .filter((milestone) => milestone.project_id === row.id)
              .map((milestone) => milestone.name),
            member_employee_ids: row.employee.map((employee) => employee.id).sort((a, b) => a - b),
          },
        });
      }
      return result;
    },
    async captureScanBoundary() {
      const { ProjectModel } = await loadModels();
      const row = await ProjectModel.getPuri("r")
        .table("projects")
        .select({ id: "projects.id" })
        .orderBy("projects.id", "desc")
        .first();
      return row === undefined ? "0" : String(row.id);
    },
    async scanSourceIds(_context, page) {
      const { ProjectModel } = await loadModels();
      // Cursors are decimal id strings; compare them as numbers, not as strings.
      const after = page.after === undefined ? 0 : Number(page.after);
      const through = Number(page.through);
      const rows = await ProjectModel.getPuri("r")
        .table("projects")
        .where("projects.id", ">", after)
        .where("projects.id", "<=", through)
        .select({ id: "projects.id" })
        .orderBy("projects.id", "asc")
        .limit(page.limit + 1);
      const pageRows = rows.slice(0, page.limit);
      const ids = pageRows.map((row) => String(row.id));
      const last = pageRows.at(-1);
      return rows.length > page.limit && last !== undefined
        ? { ids, next: String(last.id) }
        : { ids };
    },
  });
}

export const CURRENT_PROJECTION_VERSION = "1";

/** Versions still read or written during a rebuild; remove one only after its target is retired. */
export const PREVIOUS_PROJECTION_VERSIONS: readonly string[] = [];

export const projectsSearchDefinition = defineProjectsSearch(CURRENT_PROJECTION_VERSION);

/** The current definition comes first. */
export const projectsSearchDefinitions: readonly DefinedSearch<ProjectSearchDocument>[] = [
  projectsSearchDefinition,
  ...PREVIOUS_PROJECTION_VERSIONS.map(defineProjectsSearch),
];

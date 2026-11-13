import {
  type NativeQuery,
  type NativeSearchBody,
  type SearchCandidates,
  type SearchQueries,
} from "@sonamu-kit/opensearch";
import { type Knex } from "knex";
import { z } from "zod";

import {
  PROJECT_SEARCH_HIGHLIGHT_END as HIGHLIGHT_END,
  PROJECT_SEARCH_HIGHLIGHT_START as HIGHLIGHT_START,
  ProjectIndexedSearchParams,
  type ProjectIndexedSearchHit,
  type ProjectIndexedSearchResult,
} from "../application/project/project.types";
import { ProjectStatus } from "../application/sonamu.generated";
import { type ProjectSearchDocument } from "./projects.definition";

/*
  A project is visible to its member employees and to admins; deleted or banned users and users without an employee
  record see nothing. The index may lag behind membership, deletes and edits, so every hit is re-checked against the
  primary and the current row is returned. Call outside a transaction.
*/

export interface ProjectSearchDependencies {
  readonly queries: SearchQueries<ProjectSearchDocument>;
  /** The primary pool, never a transaction. */
  readonly db: Knex;
}

export type ProjectSearchScope = { kind: "admin" } | { kind: "member"; employeeId: number | null };

const callerRowSchema = z.object({
  role: z.string(),
  deleted_at: z.date().nullable(),
  banned: z.boolean().nullable(),
  employee_id: z.number().int().nullable(),
});
const projectRowSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  status: ProjectStatus,
});
type ProjectRow = z.infer<typeof projectRowSchema>;

const NO_ACCESS: ProjectSearchScope = { kind: "member", employeeId: null };

export async function readProjectSearchScope(
  db: Knex,
  userId: string,
): Promise<ProjectSearchScope> {
  const rows = z
    .array(callerRowSchema)
    .parse(
      await db("users")
        .leftJoin("employees", "employees.user_id", "users.id")
        .where("users.id", userId)
        .select("users.role", "users.deleted_at", "users.banned", "employees.id as employee_id"),
    );
  const row = rows[0];
  if (row === undefined || row.deleted_at !== null || row.banned === true) {
    return NO_ACCESS;
  }
  if (row.role === "admin") {
    return { kind: "admin" };
  }
  return { kind: "member", employeeId: row.employee_id };
}

/** Only admins search without a filter; a non-member still sends an empty terms filter, which matches nothing. */
function scopeFilter(scope: ProjectSearchScope): NativeQuery[] {
  if (scope.kind === "admin") {
    return [];
  }
  return [
    { terms: { "doc.member_employee_ids": scope.employeeId === null ? [] : [scope.employeeId] } },
  ];
}

async function readVisibleProjects(
  db: Knex,
  scope: ProjectSearchScope,
  ids: readonly number[],
): Promise<Map<number, ProjectRow>> {
  if (ids.length === 0 || (scope.kind === "member" && scope.employeeId === null)) {
    return new Map();
  }
  const query = db("projects")
    .whereIn("projects.id", ids)
    .select("projects.id", "projects.name", "projects.description", "projects.status");
  if (scope.kind === "member" && scope.employeeId !== null) {
    query.whereExists(
      db("projects__employees")
        .whereRaw("projects__employees.project_id = projects.id")
        .where("projects__employees.employee_id", scope.employeeId),
    );
  }
  const rows = z.array(projectRowSchema).parse(await query);
  return new Map(rows.map((row) => [row.id, row]));
}

function toProjectId(documentId: string): number | undefined {
  const id = Number(documentId);
  return Number.isSafeInteger(id) && id > 0 && String(id) === documentId ? id : undefined;
}

/** Must be deterministic for the same caller and q: the cursor is bound to a hash of the body. */
function searchBody(q: string, scope: ProjectSearchScope, size: number): NativeSearchBody {
  return {
    query: {
      bool: {
        should: [
          {
            multi_match: {
              query: q,
              fields: ["doc.name^3", "doc.description", "doc.milestone_names"],
            },
          },
          { term: { "doc.tag_names": q } },
        ],
        minimum_should_match: 1,
        filter: scopeFilter(scope),
      },
    },
    // _id breaks score ties so search_after pages neither skip nor repeat hits.
    sort: [{ _score: "desc" }, { _id: "asc" }],
    size,
    _source: ["name", "description"],
    // Private-use markers instead of HTML tags: the fragments are not escaped, so they must never be rendered as HTML.
    highlight: {
      pre_tags: [HIGHLIGHT_START],
      post_tags: [HIGHLIGHT_END],
      fields: { "doc.name": {}, "doc.description": {} },
    },
  };
}

function freshHighlights(
  indexed: string | null | undefined,
  current: string | null,
  highlight: readonly string[] | undefined,
): string[] {
  return indexed !== undefined && indexed === current ? [...(highlight ?? [])] : [];
}

/** Also returns the target that served the page, for tests and diagnostics. */
export async function searchProjectsAs(
  dependencies: ProjectSearchDependencies,
  userId: string,
  rawParams: ProjectIndexedSearchParams,
): Promise<{
  result: ProjectIndexedSearchResult;
  target: SearchCandidates<ProjectSearchDocument>["target"];
}> {
  const params = ProjectIndexedSearchParams.parse(rawParams);
  const { db, queries } = dependencies;

  // Read the scope from the primary right before searching.
  const scope = await readProjectSearchScope(db, userId);

  const body = searchBody(params.q, scope, params.size ?? 20);
  const candidates =
    params.cursor === undefined
      ? await queries.search({ body, paginate: {} })
      : await queries.search({ body, cursor: params.cursor });

  // Re-read the scope: it may have changed while the search ran.
  const ids = candidates.hits
    .map((hit) => toProjectId(hit.id))
    .filter((id): id is number => id !== undefined);
  const currentScope = await readProjectSearchScope(db, userId);
  const visible = await readVisibleProjects(db, currentScope, ids);

  const rows: ProjectIndexedSearchHit[] = [];
  for (const candidate of candidates.hits) {
    const id = toProjectId(candidate.id);
    const row = id === undefined ? undefined : visible.get(id);
    if (row === undefined) {
      continue;
    }
    rows.push({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      highlights: {
        name: freshHighlights(candidate.source?.name, row.name, candidate.highlight?.["doc.name"]),
        description: freshHighlights(
          candidate.source?.description,
          row.description,
          candidate.highlight?.["doc.description"],
        ),
      },
    });
  }
  return {
    result: { rows, nextCursor: candidates.nextCursor ?? null },
    target: candidates.target,
  };
}

import assert from "assert";

import { type Client } from "@opensearch-project/opensearch";
import { RECOMMENDED_WORKER_POLL_INTERVAL_MS } from "@sonamu-kit/opensearch";
import { type SearchAdmin } from "@sonamu-kit/opensearch/admin";
import { type Context, DB, Sonamu } from "sonamu";
import { runWithContext } from "sonamu/test";
import { z } from "zod";

import { type ProjectSaveParams } from "../../application/project/project.types";
import { createMiomockSearchAdmin } from "../admin";
import { getSearchHandles, SEARCH_NAMESPACE } from "../index";
import { projectsSearchDefinition } from "../projects.definition";
import { PROJECTS_SEARCH_KEY } from "../synchronization";
import { searchWorkerLimits } from "../worker-limits";

// The search tests commit their rows, so callers delete what they create.

const POLL_INTERVAL_MS = 200;

const workerLimits = searchWorkerLimits();

/** Worst case for a healthy worker: the drain already running at commit, one poll interval, and the drain that takes the mark. */
const INDEXING_WAIT_MS =
  RECOMMENDED_WORKER_POLL_INTERVAL_MS +
  2 * (workerLimits.projectionTimeoutMs + workerLimits.requestTimeoutMs);

export async function waitFor<T>(
  label: string,
  probe: () => Promise<T | undefined>,
  timeoutMs = INDEXING_WAIT_MS,
  diagnose?: () => Promise<string>,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      const details = diagnose === undefined ? "" : `\n${await diagnose().catch(String)}`;
      throw new Error(`시간 안에 조건이 만족되지 않았습니다: ${label}${details}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function contextUser(userId: string, role: "admin" | "normal"): NonNullable<Context["user"]> {
  const now = new Date();
  return {
    id: userId,
    email: `${userId}@search-it.test`,
    emailVerified: true,
    name: userId,
    createdAt: now,
    updatedAt: now,
    image: null,
    role,
    created_at: now,
  };
}

/** The context role is only the session value; the search re-reads the current role from the database. */
export async function asUser<T>(person: TestPerson, fn: () => Promise<T>): Promise<T> {
  let result: { value: T } | undefined;
  await runWithContext(
    { ...Sonamu.getContext<Context>(), user: contextUser(person.userId, person.role) },
    async () => {
      result = { value: await fn() };
    },
  );
  assert(result);
  return result.value;
}

export type TestPerson = { userId: string; role: "admin" | "normal"; employeeId: number | null };

const createdUserIds: string[] = [];

export async function createPerson(
  label: string,
  role: "admin" | "normal",
  withEmployee: boolean,
): Promise<TestPerson> {
  const db = DB.getDB("w");
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const [user] = z.array(z.object({ id: z.string() })).parse(
    await db("users")
      .insert({ email: `${suffix}@search-it.test`, username: suffix, role })
      .returning("id"),
  );
  assert(user);
  createdUserIds.push(user.id);
  if (!withEmployee) {
    return { userId: user.id, role, employeeId: null };
  }
  const [employee] = z.array(z.object({ id: z.number().int() })).parse(
    await db("employees")
      .insert({ user_id: user.id, employee_number: suffix.slice(0, 32) })
      .returning("id"),
  );
  assert(employee);
  return { userId: user.id, role, employeeId: employee.id };
}

export async function cleanupPeople(): Promise<void> {
  if (createdUserIds.length > 0) {
    await DB.getDB("w")("users").whereIn("id", createdUserIds.splice(0)).delete();
  }
}

export async function ledgerRevision(projectId: number): Promise<number | undefined> {
  const { rows } = await DB.getDB("w").raw<{ rows: { revision: string }[] }>(
    "SELECT revision FROM sonamu_search.documents WHERE namespace = ? AND definition = ? AND document_id = ?",
    [SEARCH_NAMESPACE, PROJECTS_SEARCH_KEY, String(projectId)],
  );
  return rows[0] === undefined ? undefined : Number(rows[0].revision);
}

export async function readTargetIndex(admin: SearchAdmin): Promise<string> {
  const inspection = await admin.inspect(PROJECTS_SEARCH_KEY);
  const target = inspection.targets.find(
    (candidate) => candidate.targetId === inspection.readHead.targetId,
  );
  assert(target, "읽기 대상이 없습니다");
  return target.physicalIndex;
}

const indexedSchema = z.object({
  _version: z.number().int(),
  _source: z.object({
    sonamu_meta: z.object({ revision: z.number().int(), deleted: z.boolean() }),
    doc: z
      .object({
        name: z.string(),
        tag_names: z.array(z.string()),
        milestone_names: z.array(z.string()),
        member_employee_ids: z.array(z.number().int()),
      })
      .optional(),
  }),
});
export type IndexedProject = z.infer<typeof indexedSchema>;

/** Realtime GET, so it sees the document before a refresh. */
export async function indexedDocument(
  client: Client,
  physicalIndex: string,
  projectId: number,
): Promise<IndexedProject | undefined> {
  const response = await client.get(
    { index: physicalIndex, id: String(projectId) },
    { ignore: [404] },
  );
  if (response.statusCode === 404) {
    return undefined;
  }
  return indexedSchema.parse(response.body);
}

export async function waitForIndexedRevision(
  client: Client,
  physicalIndex: string,
  projectId: number,
): Promise<IndexedProject> {
  return waitFor(
    `프로젝트 ${projectId} 색인`,
    async () => {
      const revision = await ledgerRevision(projectId);
      const indexed = await indexedDocument(client, physicalIndex, projectId);
      return revision !== undefined && indexed?._source.sonamu_meta.revision === revision
        ? indexed
        : undefined;
    },
    INDEXING_WAIT_MS,
    () => describeDeliveryState(projectId),
  );
}

/** Diagnostics printed when indexing does not catch up. */
async function describeDeliveryState(projectId: number): Promise<string> {
  const db = DB.getDB("w");
  const id = String(projectId);
  const query = async (sql: string, bindings: readonly string[]) =>
    (await db.raw<{ rows: unknown[] }>(sql, bindings)).rows;
  return JSON.stringify({
    documents: await query(
      "SELECT row_to_json(d) AS row FROM sonamu_search.documents d WHERE document_id = ?",
      [id],
    ),
    deliveries: await query(
      "SELECT row_to_json(d) AS row FROM sonamu_search.deliveries d WHERE document_id = ?",
      [id],
    ),
    runtime: await query(
      "SELECT row_to_json(r) AS row FROM sonamu_search.delivery_runtime r WHERE document_id = ?",
      [id],
    ),
    targets: await query(
      "SELECT target_id, state, write_enabled, pause_reason FROM sonamu_search.targets",
      [],
    ),
    heartbeats: await query(
      "SELECT row_to_json(h) AS row FROM sonamu_search.worker_heartbeats h",
      [],
    ),
  });
}

/** Same steps as `sonamu search init`; does nothing when a read target exists. */
export async function ensureInitialTarget(): Promise<void> {
  const handles = getSearchHandles();
  assert(handles, "검색이 꺼져 있습니다");
  const admin = createMiomockSearchAdmin({
    client: handles.client,
    synchronization: handles.synchronization,
    definitions: [projectsSearchDefinition],
  });
  const { fingerprint } = projectsSearchDefinition;
  const inspection = await admin.inspect(PROJECTS_SEARCH_KEY).catch(() => undefined);
  if (inspection?.readHead.targetId) {
    return;
  }
  const audit = {
    operationId: `miomock-search-it-init-${Date.now()}`,
    actor: "miomock-search-it",
    reason: "검색 통합 테스트 첫 대상",
  };
  if (inspection === undefined) {
    const plan = await admin.planCreate(PROJECTS_SEARCH_KEY);
    await admin.executeCreate(plan, audit);
  }
  const build = await admin.beginRebuild({ logicalKey: PROJECTS_SEARCH_KEY, fingerprint }, audit);
  for (;;) {
    const progress = await admin.runBackfillPage(build.buildId, { limit: 500 });
    if (progress.done) {
      break;
    }
  }
  await admin.cutover(build.buildId, audit);
}

export function projectParams(
  name: string,
  options: { id?: number; employeeIds?: number[]; tagIds?: number[] } = {},
): ProjectSaveParams {
  const params: ProjectSaveParams = {
    name,
    status: "planning",
    description: null,
    budget: null,
    deadline: null,
    image_urls: null,
    employee_ids: options.employeeIds ?? [],
    tag_ids: options.tagIds ?? [],
  };
  if (options.id !== undefined) {
    params.id = options.id;
  }
  return params;
}

import assert from "assert";

import { Client } from "@opensearch-project/opensearch";
import { type SearchAdmin } from "@sonamu-kit/opensearch/admin";
import { DB, Sonamu, UnauthorizedException } from "sonamu";
import { test } from "sonamu/test";
import { afterAll, afterEach, beforeAll, describe, expect, inject } from "vitest";

import { EmployeeModel } from "../application/employee/employee.model";
import { MilestoneModel } from "../application/milestone/milestone.model";
import { ProjectModel } from "../application/project/project.model";
import {
  PROJECT_SEARCH_HIGHLIGHT_END,
  PROJECT_SEARCH_HIGHLIGHT_START,
  type ProjectIndexedSearchParams,
} from "../application/project/project.types";
import { TagModel } from "../application/tag/tag.model";
import { createMiomockSearchAdmin } from "./admin";
import { getSearchHandles } from "./index";
import { getSearchRuntime } from "./runtime";
import { initializeSearchStore, startSearch, stopSearch } from "./startup";
import { SEARCH_IT_DATABASE } from "./testing/constants";
import {
  asUser,
  cleanupPeople,
  createPerson,
  ensureInitialTarget,
  indexedDocument,
  ledgerRevision,
  projectParams,
  readTargetIndex,
  type TestPerson,
  waitFor,
  waitForIndexedRevision,
} from "./testing/helpers";

// The cases run in order and keep changing the same project.

let admin: SearchAdmin;
let raw: Client;
let physicalIndex: string;
let adminUser: TestPerson;
let memberA: TestPerson;
let memberB: TestPerson;
let outsider: TestPerson;
let projectId: number;
let tagId: number;
let milestoneId: number;
const createdProjectIds: number[] = [];

function lifecycle() {
  const runtime = getSearchRuntime();
  assert(runtime);
  return runtime.lifecycle;
}

/** Restarts the worker even when fn fails, so one failure does not stall indexing for the next cases. */
async function withWorkerStopped(fn: () => Promise<void>): Promise<void> {
  await lifecycle().onShutdown();
  try {
    await fn();
  } finally {
    await lifecycle().onStart();
  }
}

afterEach((context) => {
  if (context.task.result?.state === "fail") {
    console.error("[search-it] lifecycle status", JSON.stringify(lifecycle().status()));
  }
});

async function search(person: TestPerson, params: ProjectIndexedSearchParams) {
  return asUser(person, () => ProjectModel.searchIndexed(params));
}

async function searchIds(person: TestPerson, q: string): Promise<number[]> {
  const { rows } = await search(person, { q, size: 50 });
  return rows.map((row) => row.id);
}

async function heartbeatCount(): Promise<number> {
  const { rows } = await DB.getDB("w").raw<{ rows: { count: string }[] }>(
    "SELECT count(*) AS count FROM sonamu_search.worker_heartbeats",
  );
  return Number(rows[0]?.count);
}

beforeAll(async () => {
  await Sonamu.init(true, false, undefined, true);

  // Never write to the development database.
  expect(process.env.NODE_ENV).toBe("development");
  const { rows } = await DB.getDB("w").raw<{ rows: { name: string }[] }>(
    "SELECT current_database() AS name",
  );
  expect(rows[0]?.name).toBe(SEARCH_IT_DATABASE);

  const handles = getSearchHandles();
  assert(handles);
  admin = createMiomockSearchAdmin({
    client: handles.client,
    synchronization: handles.synchronization,
  });
  await ensureInitialTarget();
  physicalIndex = await readTargetIndex(admin);
  raw = new Client({ node: inject("opensearchUrl") });

  adminUser = await createPerson("admin", "admin", false);
  memberA = await createPerson("member-a", "normal", true);
  memberB = await createPerson("member-b", "normal", true);
  outsider = await createPerson("outsider", "normal", true);

  // Same order as the server: onReady, then onStart.
  await initializeSearchStore();
  await startSearch();
});

afterAll(async () => {
  await stopSearch();
  if (createdProjectIds.length > 0) {
    await DB.getDB("w")("projects").whereIn("id", createdProjectIds).delete();
  }
  await cleanupPeople();
  await raw?.close();
  await DB.destroy();
});

describe("프로젝트 색인과 검색 API", () => {
  test("프로젝트 저장이 커밋되면 워커가 색인하고 검색 API가 돌려준다", async () => {
    assert(memberA.employeeId && memberB.employeeId);
    const [newTagId] = await TagModel.save([{ name: "검색태그알파" }]);
    assert(newTagId);
    tagId = newTagId;
    const [id] = await ProjectModel.save([
      projectParams("검색통합 알파 프로젝트", {
        employeeIds: [memberA.employeeId, memberB.employeeId],
        tagIds: [tagId],
      }),
    ]);
    assert(id);
    projectId = id;
    createdProjectIds.push(id);

    const result = await waitFor("멤버 검색 결과", async () => {
      const found = await search(memberA, { q: "알파" });
      return found.rows.some((row) => row.id === projectId) ? found : undefined;
    });
    const row = result.rows.find((candidate) => candidate.id === projectId);
    expect(row).toMatchObject({
      id: projectId,
      name: "검색통합 알파 프로젝트",
      description: null,
      status: "planning",
    });
    expect(row?.highlights.name.join(" ")).toContain(
      `${PROJECT_SEARCH_HIGHLIGHT_START}알파${PROJECT_SEARCH_HIGHLIGHT_END}`,
    );
  });

  test("저장 트랜잭션이 롤백되면 원장과 전달 의도가 남지 않는다", async () => {
    let rolledBackId: number | undefined;
    // save nests as a savepoint inside the outer transaction.
    await expect(
      ProjectModel.getPuri("w").transaction(async () => {
        const [id] = await ProjectModel.save([projectParams("검색통합-롤백")]);
        rolledBackId = id;
        throw new Error("의도한 롤백");
      }),
    ).rejects.toThrow("의도한 롤백");
    assert(rolledBackId);

    expect(await DB.getDB("w")("projects").where("id", rolledBackId).first()).toBeUndefined();
    expect(await ledgerRevision(rolledBackId)).toBeUndefined();
    const { rows } = await DB.getDB("w").raw<{ rows: unknown[] }>(
      "SELECT 1 FROM sonamu_search.deliveries WHERE document_id = ?",
      [String(rolledBackId)],
    );
    expect(rows).toEqual([]);
  });
});

describe("문서를 바꾸는 경로마다 색인이 따라온다", () => {
  test("마일스톤을 저장하면 부모 프로젝트 문서에 이름이 들어간다", async () => {
    const [newMilestoneId] = await MilestoneModel.save([
      { project_id: projectId, name: "검색통합 베타단계", due_date: new Date("2026-12-31") },
    ]);
    assert(newMilestoneId);
    milestoneId = newMilestoneId;
    const indexed = await waitForIndexedRevision(raw, physicalIndex, projectId);
    expect(indexed._source.doc?.milestone_names).toEqual(["검색통합 베타단계"]);
    const found = await waitFor("마일스톤 이름 검색", async () => {
      const ids = await searchIds(memberA, "베타단계");
      return ids.includes(projectId) ? ids : undefined;
    });
    expect(found).toContain(projectId);
  });

  test("마일스톤을 지우면 부모 프로젝트 문서에서 빠진다", async () => {
    await MilestoneModel.del([milestoneId]);
    const indexed = await waitForIndexedRevision(raw, physicalIndex, projectId);
    expect(indexed._source.doc?.milestone_names).toEqual([]);
  });

  test("태그 이름을 바꾸면 그 태그를 쓰는 프로젝트가 다시 색인된다", async () => {
    await TagModel.save([{ id: tagId, name: "검색태그감마" }]);
    const indexed = await waitForIndexedRevision(raw, physicalIndex, projectId);
    expect(indexed._source.doc?.tag_names).toEqual(["검색태그감마"]);
    const ids = await waitFor("태그 이름 검색", async () => {
      const found = await searchIds(memberA, "검색태그감마");
      return found.includes(projectId) ? found : undefined;
    });
    expect(ids).toContain(projectId);
  });

  test("태그를 지우면 CASCADE로 빠진 연결이 프로젝트 문서에 반영된다", async () => {
    const before = await ledgerRevision(projectId);
    await TagModel.del([tagId]);
    expect(await ledgerRevision(projectId)).toBe((before ?? 0) + 1);
    const indexed = await waitForIndexedRevision(raw, physicalIndex, projectId);
    expect(indexed._source.doc?.tag_names).toEqual([]);
  });

  test("직원을 지우면 CASCADE로 빠진 멤버십이 프로젝트 문서에 반영된다", async () => {
    assert(memberA.employeeId && memberB.employeeId);
    const before = await ledgerRevision(projectId);
    await EmployeeModel.del([memberB.employeeId]);
    expect(await ledgerRevision(projectId)).toBe((before ?? 0) + 1);
    const indexed = await waitForIndexedRevision(raw, physicalIndex, projectId);
    expect(indexed._source.doc?.member_employee_ids).toEqual([memberA.employeeId]);
  });
});

describe("권한 재확인", () => {
  test("멤버가 아닌 사용자는 색인에 있는 프로젝트를 받지 못한다", async () => {
    expect(await searchIds(adminUser, "알파")).toContain(projectId);
    expect(await searchIds(outsider, "알파")).not.toContain(projectId);
    expect(await search(outsider, { q: "알파" })).toEqual({ rows: [], nextCursor: null });
  });

  test("멤버에서 빠진 사용자는 색인이 따라오기 전에도 프로젝트를 받지 못한다", async () => {
    assert(memberA.employeeId);
    await withWorkerStopped(async () => {
      expect(await heartbeatCount()).toBe(0);
      await ProjectModel.save([projectParams("검색통합 알파 프로젝트", { id: projectId })]);

      const stale = await indexedDocument(raw, physicalIndex, projectId);
      expect(stale?._source.doc?.member_employee_ids).toEqual([memberA.employeeId]);
      expect(await searchIds(memberA, "알파")).not.toContain(projectId);
      // The admin still finds it, so the index really is stale.
      expect(await searchIds(adminUser, "알파")).toContain(projectId);
    });
    const indexed = await waitForIndexedRevision(raw, physicalIndex, projectId);
    expect(indexed._source.doc?.member_employee_ids).toEqual([]);
  });

  test("지운 프로젝트는 tombstone이 색인되기 전에도 결과에서 빠진다", async () => {
    const [id] = await ProjectModel.save([projectParams("검색통합 델타 프로젝트")]);
    assert(id);
    createdProjectIds.push(id);
    await waitForIndexedRevision(raw, physicalIndex, id);
    await waitFor("삭제 전 검색", async () =>
      (await searchIds(adminUser, "델타")).includes(id) ? true : undefined,
    );

    await withWorkerStopped(async () => {
      await ProjectModel.del([id]);
      const stale = await indexedDocument(raw, physicalIndex, id);
      expect(stale?._source.sonamu_meta.deleted).toBe(false);
      expect(await searchIds(adminUser, "델타")).not.toContain(id);
    });
    const tombstone = await waitForIndexedRevision(raw, physicalIndex, id);
    expect(tombstone._source.sonamu_meta.deleted).toBe(true);
  });

  test("이름이 색인 뒤에 바뀌면 현재 이름을 돌려주고 옛 하이라이트를 버린다", async () => {
    await withWorkerStopped(async () => {
      await ProjectModel.save([projectParams("검색통합 바뀐 이름", { id: projectId })]);
      const { rows } = await search(adminUser, { q: "알파" });
      const row = rows.find((candidate) => candidate.id === projectId);
      expect(row?.name).toBe("검색통합 바뀐 이름");
      expect(row?.highlights.name).toEqual([]);
    });
    await waitForIndexedRevision(raw, physicalIndex, projectId);
  });

  test("로그인하지 않은 요청은 거부한다", async () => {
    await expect(ProjectModel.searchIndexed({ q: "알파" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe("페이지네이션", () => {
  test("패키지 커서로 다음 페이지를 이어 받는다", async () => {
    const ids = await ProjectModel.save([
      projectParams("검색통합 페이지 하나"),
      projectParams("검색통합 페이지 둘"),
      projectParams("검색통합 페이지 셋"),
    ]);
    createdProjectIds.push(...ids);
    await waitFor("세 프로젝트 검색", async () =>
      (await searchIds(adminUser, "페이지")).length >= 3 ? true : undefined,
    );

    const first = await search(adminUser, { q: "페이지", size: 2 });
    expect(first.rows).toHaveLength(2);
    assert(first.nextCursor);
    const second = await search(adminUser, { q: "페이지", size: 2, cursor: first.nextCursor });
    const seen = [...first.rows, ...second.rows].map((row) => row.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.toSorted()).toEqual(ids.toSorted());
  });
});

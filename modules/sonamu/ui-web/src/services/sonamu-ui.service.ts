import { useQueries, useQuery } from "@tanstack/react-query";
import {
  type Cone,
  type DuplicateCheckOptions,
  type Entity,
  type EntityIndex,
  type EntityProp,
  type FixtureImportResult,
  type FixtureRecord,
  type FixtureSearchOptions,
  type FlattenSubsetRow,
  type MigrationResult,
  type MigrationCode,
  type MigrationConnectionMeta,
  type MigrationConnectionStatus,
  type MigrationStatus,
  type MigrationStreamEvent,
  type MigrationTarget,
  type GenMigrationCode,
  type PathAndCode,
  type SonamuDBConfig,
} from "sonamu";

import { fetch } from "./sonamu.shared";

export type ExtendedEntity = Entity & {
  flattenSubsetRows: FlattenSubsetRow[];
};

export namespace SonamuUIService {
  export function getSonamuConfig(): Promise<{ projectName?: string }> {
    return fetch({
      method: "GET",
      url: `/sonamu-ui/api/sonamu/config`,
    });
  }
  export function useEntities() {
    return useQuery({
      queryKey: ["entities", "findMany"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/entity/findMany`,
        }) as Promise<{ entities: ExtendedEntity[] }>,
    });
  }

  export function useTypeIds(filter?: "enums" | "types") {
    return useQuery({
      queryKey: ["entity", "typeIds", filter],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/entity/typeIds`,
          params: { filter, reload: "1" },
        }) as Promise<{ typeIds: string[] }>,
    });
  }

  export function createEntity(form: {
    id: string;
    title?: string;
    table: string;
    parentId?: string;
  }) {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/create`,
      data: { form },
    });
  }

  export function delEntity(entityId: string): Promise<{ delPaths: string[] }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/del`,
      data: { entityId },
    });
  }

  export function modifyEntityBase(
    entityId: string,
    newValues: {
      title: string;
      table: string;
      parentId?: string;
    },
  ): Promise<number> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/modifyEntityBase`,
      data: {
        entityId,
        newValues,
      },
    });
  }

  export function modifySubset(
    entityId: string,
    subsetKey: string,
    fields: string[],
    fieldsInternal?: string[],
  ): Promise<{ updated: string[]; updatedInternal?: string[] }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/modifySubset`,
      data: {
        entityId,
        subsetKey,
        fields,
        fieldsInternal,
      },
    });
  }
  export function delSubset(entityId: string, subsetKey: string): Promise<number> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/delSubset`,
      data: {
        entityId,
        subsetKey,
      },
    });
  }

  export function createProp(entityId: string, newProp: EntityProp, at?: number): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/createProp`,
      data: {
        entityId,
        at,
        newProp,
      },
    });
  }

  export function modifyProp(entityId: string, newProp: EntityProp, at: number): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/modifyProp`,
      data: {
        entityId,
        at,
        newProp,
      },
    });
  }

  export function delProp(entityId: string, at: number): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/delProp`,
      data: {
        entityId,
        at,
      },
    });
  }

  export function moveProp(entityId: string, at: number, to: number): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/moveProp`,
      data: {
        entityId,
        at,
        to,
      },
    });
  }

  export function modifyIndexes(
    entityId: string,
    indexes: EntityIndex[],
  ): Promise<{ updated: EntityIndex[] }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/modifyIndexes`,
      data: {
        entityId,
        indexes,
      },
    });
  }

  export function modifyEnumLabels(
    entityId: string,
    enumLabels: {
      [enumId: string]: {
        [key: string]: string;
      };
    },
  ): Promise<{
    updated: {
      [enumId: string]: {
        [key: string]: string;
      };
    };
  }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/modifyEnumLabels`,
      data: {
        entityId,
        enumLabels,
      },
    });
  }

  export function createEnumId(params: { entityId: string; newEnumId: string }): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/createEnumId`,
      data: params,
    });
  }

  export function modifyEnumId(
    entityId: string,
    enumId: { before: string; after: string },
  ): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/modifyEnumId`,
      data: {
        entityId,
        enumId,
      },
    });
  }

  export function deleteEnumId(params: { entityId: string; enumId: string }): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/deleteEnumId`,
      data: params,
    });
  }

  export function getTableColumns(
    entityId: string,
  ): Promise<{ columns: { name: string; type: string }[] }> {
    return fetch({
      method: "GET",
      url: `/sonamu-ui/api/entity/getTableColumns`,
      params: {
        entityId,
      },
    });
  }

  const migrationQueryOptions = {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  } as const;

  export function useMigrationConnections() {
    return useQuery({
      queryKey: ["migrations", "connections"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: "/sonamu-ui/api/migrations/connections",
        }) as Promise<{ connections: MigrationConnectionMeta[] }>,
      ...migrationQueryOptions,
    });
  }

  export function useMigrationCodes() {
    return useQuery({
      queryKey: ["migrations", "codes"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: "/sonamu-ui/api/migrations/codes",
        }) as Promise<{ codes: MigrationCode[] }>,
      ...migrationQueryOptions,
    });
  }

  export function getMigrationCode(codeName: string): Promise<{ code: string }> {
    return fetch({
      method: "GET",
      url: "/sonamu-ui/api/migrations/code",
      params: { codeName },
    });
  }

  export function useMigrationConnectionStatuses(connections: MigrationConnectionMeta[]) {
    return useQueries({
      queries: connections.map(({ connKey }) => ({
        queryKey: ["migrations", "status", connKey],
        queryFn: () =>
          fetch({
            method: "GET",
            url: "/sonamu-ui/api/migrations/status",
            params: { connKey },
          }) as Promise<{ status: MigrationConnectionStatus }>,
        ...migrationQueryOptions,
      })),
    });
  }

  export function useMigrationPreparedCodes(compareConnKey?: MigrationTarget) {
    return useQuery({
      queryKey: ["migrations", "prepared-codes", compareConnKey],
      queryFn: () =>
        fetch({
          method: "GET",
          url: "/sonamu-ui/api/migrations/prepared-codes",
          params: { compareConnKey },
        }) as Promise<{ preparedCodes: GenMigrationCode[] }>,
      enabled: compareConnKey !== undefined,
      ...migrationQueryOptions,
    });
  }

  export type MigrationApprovalResult =
    | { type: "ready" }
    | { type: "pending"; channel: string; ts: string };

  export class MigrationResponseError extends Error {
    constructor(
      message: string,
      public readonly status?: number,
    ) {
      super(message);
      this.name = "MigrationResponseError";
    }
  }

  export function requestMigrationApproval(
    targets: MigrationTarget[],
    requestor?: string,
  ): Promise<MigrationApprovalResult> {
    return fetch({
      method: "POST",
      url: "/sonamu-ui/api/migrations/request-approval",
      data: { targets, requestor },
    });
  }

  async function readMigrationError(response: Response): Promise<MigrationResponseError> {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      return new MigrationResponseError(
        parsed.message ?? parsed.error ?? `${response.status} ${response.statusText}`,
        response.status,
      );
    } catch {
      return new MigrationResponseError(
        body || `${response.status} ${response.statusText}`,
        response.status,
      );
    }
  }

  function parseNdjsonLine<T>(line: string): T {
    try {
      return JSON.parse(line) as T;
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      throw new MigrationResponseError(`Invalid migration stream response: ${reason}`);
    }
  }

  export async function* readNdjson<T>(response: Response): AsyncGenerator<T> {
    if (!response.ok) {
      throw await readMigrationError(response);
    }
    if (response.body === null) {
      throw new MigrationResponseError("Migration stream response body is empty");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim() !== "") {
            yield parseNdjsonLine<T>(line);
          }
        }
        if (done) {
          break;
        }
      }
      if (buffer.trim() !== "") {
        yield parseNdjsonLine<T>(buffer);
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function* migrationStream(
    path: "shadow" | "apply" | "rollback",
    body: object,
    signal?: AbortSignal,
  ): AsyncGenerator<MigrationStreamEvent> {
    const response = await globalThis.fetch(`/sonamu-ui/api/migrations/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    yield* readNdjson<MigrationStreamEvent>(response);
  }

  export function shadowMigrations(signal?: AbortSignal) {
    return migrationStream("shadow", {}, signal);
  }

  export function applyMigrations(
    targets: MigrationTarget[],
    requestor?: string,
    signal?: AbortSignal,
  ) {
    return migrationStream("apply", { targets, requestor }, signal);
  }

  export function rollbackMigrations(targets: MigrationTarget[], signal?: AbortSignal) {
    return migrationStream("rollback", { targets }, signal);
  }

  export function useMigrationStatus() {
    return useQuery({
      queryKey: ["migrations", "status"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/migrations/status`,
        }) as Promise<{ status: MigrationStatus }>,
    });
  }

  export type SlackConfirmPendingResult = {
    type: "pending";
    channel: string;
    ts: string;
  };

  export function migrationsRunAction(
    action: "apply" | "rollback" | "shadow",
    targets: (keyof SonamuDBConfig)[],
    options?: {
      force?: boolean;
      forceReason?: string;
      requestor?: string;
    },
  ): Promise<MigrationResult | SlackConfirmPendingResult> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/migrations/runAction`,
      data: {
        action,
        targets,
        ...options,
      },
    });
  }

  export function migrationsCheckApproval(
    channel: string,
    ts: string,
  ): Promise<{ approved: boolean; rejected: boolean; approver?: string }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/migrations/checkApproval`,
      data: { channel, ts },
    });
  }

  export function migrationsForceApproval(
    channel: string,
    ts: string,
    reason: string,
    requestor?: string,
  ): Promise<{ success: boolean }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/migrations/forceApproval`,
      data: { channel, ts, reason, requestor },
    });
  }

  export function migrationsDelCodes(codeNames: string[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/migrations/delCodes`,
      data: {
        codeNames,
      },
    });
  }

  export function migrationsGeneratePreparedCodes(
    compareConnKey?: MigrationTarget,
  ): Promise<number> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/migrations/generatePreparedCodes`,
      data: { compareConnKey },
    });
  }

  export function openVscode(
    params:
      | {
          entityId: string;
          preset: "types" | "entity.json" | "generated";
        }
      | {
          absPath: string;
        },
  ): Promise<void> {
    return fetch({
      method: "GET",
      url: `/sonamu-ui/api/tools/openVscode`,
      params,
    });
  }

  export function openEditor(params: {
    editor: "vscode" | "cursor" | "webstorm";
    absPath: string;
  }): Promise<void> {
    return fetch({
      method: "GET",
      url: `/sonamu-ui/api/tools/openEditor`,
      params,
    });
  }

  export function getSuggestion(params: {
    origin: string;
    entityId?: string;
  }): Promise<{ suggested: string }> {
    return fetch({
      method: "GET",
      url: `/sonamu-ui/api/tools/getSuggestion`,
      params,
    });
  }

  export function useScaffoldingStatus(params: ScaffoldingGetStatusParams) {
    const enabled = params.entityIds.length > 0 && params.templateKeys.length > 0;

    return useQuery({
      queryKey: ["scaffolding", "getStatus", params],
      queryFn: () =>
        fetch({
          method: "POST",
          url: `/sonamu-ui/api/scaffolding/getStatus`,
          data: params,
        }) as Promise<{ statuses: ScaffoldingStatus[] }>,
      enabled,
    });
  }
  export function scaffoldingGenerate(options: ScaffoldingGenerateOptions[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/scaffolding/generate`,
      data: {
        options,
      },
    });
  }

  export function scaffoldingPreview(
    option: ScaffoldingGenerateOptions,
  ): Promise<{ pathAndCodes: PathAndCode[] }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/scaffolding/preview`,
      data: {
        option,
      },
    });
  }

  export function getMessages(id: string): Promise<{
    id: string;
    content: string;
  }> {
    return fetch({
      method: "GET",
      url: `/sonamu-ui/api/openai/messages`,
      params: { id },
    });
  }

  export function chat(message: string): Promise<{
    id: string;
    content: string;
  }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/openai/chat`,
      data: { message },
    });
  }

  export function clearThread(): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/openai/clearThread`,
    });
  }

  export function getFixtures(
    sourceDB: string,
    targetDB: string,
    search: FixtureSearchOptions,
    duplicateCheck?: DuplicateCheckOptions,
  ): Promise<FixtureRecord[]> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/fixture`,
      data: { sourceDB, targetDB, search, duplicateCheck },
    });
  }

  export function importFixtures(
    db: string,
    fixtures: FixtureRecord[],
  ): Promise<FixtureImportResult[]> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/fixture/import`,
      data: { db, fixtures },
    });
  }

  // i18n
  export type I18nDictionaryRow = {
    key: string;
    source: "entity" | "sonamu" | "project";
    isFunction: boolean;
    [locale: string]: string | boolean;
  };

  export function useI18nDictionary() {
    return useQuery({
      queryKey: ["i18n", "dictionary"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/i18n/dictionary`,
        }) as Promise<{
          rows: I18nDictionaryRow[];
          locales: string[];
          defaultLocale: string;
          stats: Record<string, { total: number; filled: number; percent: number }>;
        }>,
    });
  }

  export function importI18n(file: File): Promise<{
    success: boolean;
    updatedEntities: number;
    updatedLocales: number;
  }> {
    const formData = new FormData();
    formData.append("file", file);
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/i18n/import`,
      data: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  }

  export function updateI18n(params: {
    oldKey: string;
    newKey: string;
    source: "entity" | "sonamu" | "project";
    values: Record<string, string>;
  }): Promise<{ success: boolean }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/i18n/update`,
      data: params,
    });
  }

  export function createI18n(params: {
    key: string;
    values: Record<string, string>;
  }): Promise<{ success: boolean }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/i18n/create`,
      data: params,
    });
  }

  export function deleteI18n(key: string): Promise<{ success: boolean }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/i18n/delete`,
      data: { key },
    });
  }

  export function checkI18nUsage(keys: string[]): Promise<{
    unusedKeys: string[];
    usedKeysCount?: number;
    error?: string;
  }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/i18n/checkUsage`,
      data: { keys },
    });
  }

  // ---- 테스트 상태 훅 ----
  export function useTestStatus() {
    return useQuery({
      queryKey: ["test", "status"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/__test__/status`,
        }) as Promise<ManagerStatus>,
    });
  }

  // Cone 업데이트 메서드들
  // ---- Tasks 훅/함수 ----
  export function useWorkflowRuns(params?: {
    limit?: number;
    after?: string;
    before?: string;
    status?: string[];
    workflowName?: string;
    createdAfter?: string;
    createdBefore?: string;
  }) {
    return useQuery({
      queryKey: ["tasks", "workflowRuns", params],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/tasks/workflowRuns`,
          params: {
            ...(params?.limit ? { limit: String(params.limit) } : {}),
            ...(params?.after ? { after: params.after } : {}),
            ...(params?.before ? { before: params.before } : {}),
            ...(params?.status?.length ? { status: params.status.join(",") } : {}),
            ...(params?.workflowName ? { workflowName: params.workflowName } : {}),
            ...(params?.createdAfter ? { createdAfter: params.createdAfter } : {}),
            ...(params?.createdBefore ? { createdBefore: params.createdBefore } : {}),
            order: "desc",
          },
        }) as Promise<TasksPaginatedResponse<WorkflowRun>>,
      refetchInterval: 5000,
    });
  }

  export function useWorkflowRun(id: string) {
    return useQuery({
      queryKey: ["tasks", "workflowRun", id],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/tasks/workflowRuns/${id}`,
        }) as Promise<WorkflowRun>,
      refetchInterval: 5000,
    });
  }

  export function useStepAttempts(workflowRunId: string) {
    return useQuery({
      queryKey: ["tasks", "stepAttempts", workflowRunId],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/tasks/workflowRuns/${workflowRunId}/steps`,
        }) as Promise<TasksPaginatedResponse<StepAttempt>>,
      refetchInterval: 5000,
    });
  }

  export function useWorkflowDefinitions() {
    return useQuery({
      queryKey: ["tasks", "workflowDefinitions"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/tasks/workflowDefinitions`,
        }) as Promise<{ definitions: WorkflowDefinitionInfo[] }>,
    });
  }

  export function cancelWorkflowRun(id: string): Promise<WorkflowRun> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/tasks/workflowRuns/${id}/cancel`,
    });
  }

  export function pauseWorkflowRun(id: string): Promise<WorkflowRun> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/tasks/workflowRuns/${id}/pause`,
    });
  }

  export function resumeWorkflowRun(id: string): Promise<WorkflowRun> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/tasks/workflowRuns/${id}/resume`,
    });
  }

  export function updateEntityCone(entityId: string, cone: Cone): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/updateCone`,
      data: {
        entityId,
        target: "entity",
        cone,
      },
    });
  }

  export function updatePropCone(entityId: string, propName: string, cone: Cone): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/updateCone`,
      data: {
        entityId,
        target: "prop",
        propName,
        cone,
      },
    });
  }

  export function updateEnumCone(entityId: string, enumId: string, cone: Cone): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/updateCone`,
      data: {
        entityId,
        target: "enum",
        enumId,
        cone,
      },
    });
  }

  export function updateSubsetCone(entityId: string, subsetKey: string, cone: Cone): Promise<void> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/updateCone`,
      data: {
        entityId,
        target: "subset",
        subsetKey,
        cone,
      },
    });
  }

  export type ConeGenerationResult = {
    entityCone?: Cone;
    propCones: Record<string, Cone>;
    subsetCones: Record<string, Cone>;
    enumCones: Record<string, Cone>;
    tokensUsed: number;
  };

  export function generateCones(
    entityId: string,
    options?: {
      preserveExisting?: boolean;
      onlyEmpty?: boolean;
      locale?: "ko" | "en" | "ja";
    },
  ): Promise<ConeGenerationResult> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/entity/generateCones`,
      data: {
        entityId,
        ...options,
      },
    });
  }
}

// ---- Tasks 타입 정의 ----
export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "sleeping"
  | "paused"
  | "succeeded"
  | "completed"
  | "failed"
  | "canceled";

export type StepAttemptStatus = "running" | "paused" | "succeeded" | "completed" | "failed";
export type StepKind = "function" | "sleep";

export interface WorkflowRun {
  namespaceId: string;
  id: string;
  workflowName: string;
  version: string | null;
  status: WorkflowRunStatus;
  idempotencyKey: string | null;
  config: unknown;
  context: unknown | null;
  input: unknown | null;
  output: unknown | null;
  error: { name?: string; message: string; stack?: string; [key: string]: unknown } | null;
  attempts: number;
  parentStepAttemptNamespaceId: string | null;
  parentStepAttemptId: string | null;
  workerId: string | null;
  availableAt: string | null;
  deadlineAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StepAttempt {
  namespaceId: string;
  id: string;
  workflowRunId: string;
  stepName: string;
  kind: StepKind;
  status: StepAttemptStatus;
  config: unknown;
  context: { kind: "sleep"; resumeAt: string } | null;
  output: unknown | null;
  error: unknown | null;
  childWorkflowRunNamespaceId: string | null;
  childWorkflowRunId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDefinitionInfo {
  id: string;
  name: string;
  version: string | null;
  schedules: { name: string; expression: string }[];
  retryPolicy?: {
    maxAttempts?: number;
    initialIntervalMs?: number;
    backoffCoefficient?: number;
    maximumIntervalMs?: number;
    hasDynamicPolicy?: boolean;
  };
}

export interface TasksPaginatedResponse<T> {
  data: T[];
  pagination: { next: string | null; prev: string | null };
}

export type ScaffoldingStatus = {
  entityId: string;
  templateKey: string;
  subPath: string;
  fullPath: string;
  isExists: boolean;
};
export type ScaffoldingGetStatusParams = {
  entityIds: string[];
  templateKeys: string[];
};
export type ScaffoldingGenerateOptions = {
  entityId: string;
  templateKey: string;
  enumId?: string;
  overwrite?: boolean;
};

// ---- 테스트 결과 뷰어 타입 정의 ----
export type TestNodeKind = "file" | "suite" | "test";
export type TestState = "passed" | "failed" | "skipped" | "todo" | "running" | "unknown";

export type SerializedTrace = {
  key: string;
  value: unknown;
  filePath: string;
  lineNumber: number;
  at: string;
};

export type TestCaseResult = {
  id: string;
  kind: TestNodeKind;
  name: string;
  fullName: string;
  file: string;
  state: TestState;
  durationMs: number | null;
  counts: { total: number; passed: number; failed: number; skipped: number };
  error: { message: string; stack?: string } | null;
  traces: SerializedTrace[];
  children: TestCaseResult[];
};

export type RunResult = {
  ok: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  results: TestCaseResult[];
};

export type ManagerStatus = {
  ready: boolean;
  running: boolean;
  lastRunAt: string | null;
  sseAvailable: boolean;
};

export type StoredRunEntry = {
  runId: string;
  dateKey: string;
  startedAt: string;
  finishedAt: string;
  result: RunResult;
};

export type StoredRunHistory = {
  runs: StoredRunEntry[];
};

export type TestSSEEventMap = {
  snapshot: {
    schemaVersion: 1;
    serverTime: string;
    status: ManagerStatus;
  };
  runQueued: {
    schemaVersion: 1;
    runId: string;
    queuedAt: string;
    request: { files?: string[]; pattern?: string };
  };
  runStarted: {
    schemaVersion: 1;
    runId: string;
    startedAt: string;
  };
  runCompleted: {
    schemaVersion: 1;
    runId: string;
    startedAt: string;
    finishedAt: string;
    result: RunResult;
  };
  runErrored: {
    schemaVersion: 1;
    runId: string;
    finishedAt: string;
    error: { message: string; stack?: string };
  };
  runNodeProgress: {
    schemaVersion: 1;
    runId: string;
    startedAt: string;
    at: string;
    kind: "file" | "suite" | "test";
    phase: "ready" | "result";
    fileId: string;
    nodeId: string;
    parentId: string | null;
    node: TestCaseResult;
  };
  heartbeat: {
    schemaVersion: 1;
    at: string;
  };
};

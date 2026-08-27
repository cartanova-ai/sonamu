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
import { z } from "zod";

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
        fetch<{ entities: ExtendedEntity[] }>({
          method: "GET",
          url: `/sonamu-ui/api/entity/findMany`,
        }),
    });
  }

  export function useTypeIds(filter?: "enums" | "types") {
    return useQuery({
      queryKey: ["entity", "typeIds", filter],
      queryFn: () =>
        fetch<{ typeIds: string[] }>({
          method: "GET",
          url: `/sonamu-ui/api/entity/typeIds`,
          params: { filter, reload: "1" },
        }),
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
        fetch<{ connections: MigrationConnectionMeta[] }>({
          method: "GET",
          url: "/sonamu-ui/api/migrations/connections",
        }),
      ...migrationQueryOptions,
    });
  }

  export function useMigrationCodes() {
    return useQuery({
      queryKey: ["migrations", "codes"],
      queryFn: () =>
        fetch<{ codes: MigrationCode[] }>({
          method: "GET",
          url: "/sonamu-ui/api/migrations/codes",
        }),
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
          fetch<{ status: MigrationConnectionStatus }>({
            method: "GET",
            url: "/sonamu-ui/api/migrations/status",
            params: { connKey },
          }),
        ...migrationQueryOptions,
      })),
    });
  }

  export function useMigrationPreparedCodes(compareConnKey?: MigrationTarget) {
    return useQuery({
      queryKey: ["migrations", "prepared-codes", compareConnKey],
      queryFn: () =>
        fetch<{ preparedCodes: GenMigrationCode[] }>({
          method: "GET",
          url: "/sonamu-ui/api/migrations/prepared-codes",
          params: { compareConnKey },
        }),
      enabled: compareConnKey !== undefined,
      ...migrationQueryOptions,
      // 기준 DB를 바꾸면 이전 비교 결과를 즉시 폐기해 새 결과와 섞이지 않게 합니다.
      staleTime: 0,
      gcTime: 0,
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

  const migrationErrorBodySchema = z.object({
    message: z.string().optional(),
    error: z.string().optional(),
  });

  const migrationTargetSchema = z.enum([
    "test",
    "fixture",
    "development",
    "staging",
    "production",
    "test_readonly",
    "development_readonly",
    "staging_readonly",
    "production_readonly",
  ]);
  const migrationStreamTargetSchema = z.union([migrationTargetSchema, z.literal("shadow")]);
  const migrationActionSchema = z.enum(["shadow", "apply", "rollback"]);
  const migrationResultSchema = z.array(
    z.object({
      connKey: z.string(),
      batchNo: z.number(),
      applied: z.array(z.string()),
    }),
  );
  const migrationStreamEventSchema = z.discriminatedUnion("type", [
    z.object({
      type: z.literal("target-start"),
      action: migrationActionSchema,
      connKey: migrationStreamTargetSchema,
      files: z.array(z.string()),
    }),
    z.object({
      type: z.enum(["file-start", "file-executed"]),
      action: migrationActionSchema,
      connKey: migrationStreamTargetSchema,
      file: z.string(),
      index: z.number(),
      total: z.number(),
    }),
    z.object({
      type: z.literal("target-complete"),
      action: migrationActionSchema,
      connKey: migrationStreamTargetSchema,
      batchNo: z.number(),
      files: z.array(z.string()),
    }),
    z.object({
      type: z.literal("complete"),
      result: migrationResultSchema,
    }),
    z.object({
      type: z.literal("error"),
      action: migrationActionSchema,
      message: z.string(),
      connKey: migrationStreamTargetSchema.optional(),
      file: z.string().optional(),
      completedTargets: z.array(migrationTargetSchema),
      pendingTargets: z.array(migrationTargetSchema),
    }),
  ]);

  async function readMigrationError(response: Response): Promise<MigrationResponseError> {
    const body = await response.text();
    try {
      const parsed = migrationErrorBodySchema.parse(JSON.parse(body));
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

  function parseNdjsonLine(line: string): MigrationStreamEvent {
    try {
      return migrationStreamEventSchema.parse(JSON.parse(line));
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      throw new MigrationResponseError(`Invalid migration stream response: ${reason}`);
    }
  }

  export async function* readNdjson(response: Response): AsyncGenerator<MigrationStreamEvent> {
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
            yield parseNdjsonLine(line);
          }
        }
        if (done) {
          break;
        }
      }
      if (buffer.trim() !== "") {
        yield parseNdjsonLine(buffer);
      }
    } finally {
      reader.releaseLock();
    }
  }

  type MigrationRequestBody = {
    targets?: MigrationTarget[];
    requestor?: string;
  };

  async function* migrationStream(
    path: "shadow" | "apply" | "rollback",
    body: MigrationRequestBody,
    signal?: AbortSignal,
  ): AsyncGenerator<MigrationStreamEvent> {
    const response = await globalThis.fetch(`/sonamu-ui/api/migrations/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    yield* readNdjson(response);
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
        fetch<{ status: MigrationStatus }>({
          method: "GET",
          url: `/sonamu-ui/api/migrations/status`,
        }),
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
    editor: "vscode" | "cursor" | "zed";
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
        fetch<{ statuses: ScaffoldingStatus[] }>({
          method: "POST",
          url: `/sonamu-ui/api/scaffolding/getStatus`,
          data: params,
        }),
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
        fetch<{
          rows: I18nDictionaryRow[];
          locales: string[];
          defaultLocale: string;
          stats: Record<string, { total: number; filled: number; percent: number }>;
        }>({
          method: "GET",
          url: `/sonamu-ui/api/i18n/dictionary`,
        }),
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
        fetch<ManagerStatus>({
          method: "GET",
          url: `/__test__/status`,
        }),
    });
  }

  // Cone 업데이트 메서드들
  // ---- Tasks 훅/함수 ----
  type WorkflowRunsQueryParams = {
    limit?: string;
    after?: string;
    before?: string;
    status?: string;
    workflowName?: string;
    createdAfter?: string;
    createdBefore?: string;
    order: "desc";
  };

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
      queryFn: () => {
        const queryParams: WorkflowRunsQueryParams = { order: "desc" };
        if (params?.limit) queryParams.limit = String(params.limit);
        if (params?.after) queryParams.after = params.after;
        if (params?.before) queryParams.before = params.before;
        if (params?.status?.length) queryParams.status = params.status.join(",");
        if (params?.workflowName) queryParams.workflowName = params.workflowName;
        if (params?.createdAfter) queryParams.createdAfter = params.createdAfter;
        if (params?.createdBefore) queryParams.createdBefore = params.createdBefore;

        return fetch<TasksPaginatedResponse<WorkflowRun>>({
          method: "GET",
          url: `/sonamu-ui/api/tasks/workflowRuns`,
          params: queryParams,
        });
      },
      refetchInterval: 5000,
    });
  }

  export function useWorkflowRun(id: string) {
    return useQuery({
      queryKey: ["tasks", "workflowRun", id],
      queryFn: () =>
        fetch<WorkflowRun>({
          method: "GET",
          url: `/sonamu-ui/api/tasks/workflowRuns/${id}`,
        }),
      refetchInterval: 5000,
    });
  }

  export function useStepAttempts(workflowRunId: string) {
    return useQuery({
      queryKey: ["tasks", "stepAttempts", workflowRunId],
      queryFn: () =>
        fetch<TasksPaginatedResponse<StepAttempt>>({
          method: "GET",
          url: `/sonamu-ui/api/tasks/workflowRuns/${workflowRunId}/steps`,
        }),
      refetchInterval: 5000,
    });
  }

  export function useWorkflowDefinitions() {
    return useQuery({
      queryKey: ["tasks", "workflowDefinitions"],
      queryFn: () =>
        fetch<{ definitions: WorkflowDefinitionInfo[] }>({
          method: "GET",
          url: `/sonamu-ui/api/tasks/workflowDefinitions`,
        }),
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
  error: { name?: string; message: string; stack?: string } | null;
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

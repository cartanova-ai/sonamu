import { useQuery } from "@tanstack/react-query";
import type {
  DuplicateCheckOptions,
  Entity,
  EntityIndex,
  EntityProp,
  FixtureImportResult,
  FixtureRecord,
  FixtureSearchOptions,
  FlattenSubsetRow,
  MigrationResult,
  MigrationStatus,
  PathAndCode,
  SonamuDBConfig,
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

  export function migrationsGeneratePreparedCodes(): Promise<number> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/migrations/generatePreparedCodes`,
      data: {},
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
    const enabled = (() => {
      if (params.entityIds.length === 0 || params.templateKeys.length === 0) {
        return false;
      } else if (params.templateGroupName === "Enums" && params.enumIds.length === 0) {
        return false;
      }
      return true;
    })();

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
}

export type ScaffoldingStatus = {
  entityId: string;
  templateGroupName: string;
  templateKey: string;
  enumId?: string;
  subPath: string;
  fullPath: string;
  isExists: boolean;
};
export type ScaffoldingGetStatusParams = {
  templateGroupName: "Entity" | "Enums";
  entityIds: string[];
  templateKeys: string[];
  enumIds: string[];
};
export type ScaffoldingGenerateOptions = {
  entityId: string;
  templateKey: string;
  enumId?: string;
  overwrite?: boolean;
};

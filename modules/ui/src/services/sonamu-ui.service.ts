import useSWR, { SWRResponse } from "swr";
import { fetch, swrPostFetcher } from "./sonamu.shared";
import {
  EntityIndex,
  EntityProp,
  FlattenSubsetRow,
  MigrationStatus,
  PathAndCode,
  Entity,
  FixtureRecord,
  FixtureSearchOptions,
  FixtureImportResult,
} from "sonamu";

type SWRError = {
  name: string;
  message: string;
  statusCode: number;
};

export type ExtendedEntity = Entity & {
  flattenSubsetRows: FlattenSubsetRow[];
};

export namespace SonamuUIService {
  export function useEntities(): SWRResponse<
    { entities: ExtendedEntity[] },
    SWRError
  > {
    return useSWR<{ entities: ExtendedEntity[] }, SWRError>([
      `/api/entity/findMany`,
    ]);
  }

  export function useTypeIds(
    filter?: "enums" | "types"
  ): SWRResponse<{ typeIds: string[] }, SWRError> {
    return useSWR<{ typeIds: string[] }, SWRError>([
      `/api/entity/typeIds`,
      { filter, reload: "1" },
    ]);
  }

  export function createEntity(form: {
    id: string;
    title?: string;
    table: string;
    parentId?: string;
  }) {
    return fetch({
      method: "POST",
      url: `/api/entity/create`,
      data: { form },
    });
  }

  export function delEntity(entityId: string): Promise<{ delPaths: string[] }> {
    return fetch({
      method: "POST",
      url: `/api/entity/del`,
      data: { entityId },
    });
  }

  export function modifyEntityBase(
    entityId: string,
    newValues: {
      title: string;
      table: string;
      parentId?: string;
    }
  ): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/entity/modifyEntityBase`,
      data: {
        entityId,
        newValues,
      },
    });
  }

  export function modifySubset(
    entityId: string,
    subsetKey: string,
    fields: string[]
  ): Promise<{ updated: string[] }> {
    return fetch({
      method: "POST",
      url: `/api/entity/modifySubset`,
      data: {
        entityId,
        subsetKey,
        fields,
      },
    });
  }
  export function delSubset(
    entityId: string,
    subsetKey: string
  ): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/entity/delSubset`,
      data: {
        entityId,
        subsetKey,
      },
    });
  }

  export function createProp(
    entityId: string,
    newProp: EntityProp,
    at?: number
  ): Promise<void> {
    return fetch({
      method: "POST",
      url: `/api/entity/createProp`,
      data: {
        entityId,
        at,
        newProp,
      },
    });
  }

  export function modifyProp(
    entityId: string,
    newProp: EntityProp,
    at: number
  ): Promise<void> {
    return fetch({
      method: "POST",
      url: `/api/entity/modifyProp`,
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
      url: `/api/entity/delProp`,
      data: {
        entityId,
        at,
      },
    });
  }

  export function moveProp(
    entityId: string,
    at: number,
    to: number
  ): Promise<void> {
    return fetch({
      method: "POST",
      url: `/api/entity/moveProp`,
      data: {
        entityId,
        at,
        to,
      },
    });
  }

  export function modifyIndexes(
    entityId: string,
    indexes: EntityIndex[]
  ): Promise<{ updated: EntityIndex[] }> {
    return fetch({
      method: "POST",
      url: `/api/entity/modifyIndexes`,
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
    }
  ): Promise<{
    updated: {
      [enumId: string]: {
        [key: string]: string;
      };
    };
  }> {
    return fetch({
      method: "POST",
      url: `/api/entity/modifyEnumLabels`,
      data: {
        entityId,
        enumLabels,
      },
    });
  }

  export function createEnumId(params: {
    entityId: string;
    newEnumId: string;
  }): Promise<void> {
    return fetch({
      method: "POST",
      url: `/api/entity/createEnumId`,
      data: params,
    });
  }

  export function getTableColumns(
    entityId: string
  ): Promise<{ columns: string[] }> {
    return fetch({
      method: "GET",
      url: `/api/entity/getTableColumns`,
      params: {
        entityId,
      },
    });
  }

  export function useMigrationStatus(): SWRResponse<
    { status: MigrationStatus },
    SWRError
  > {
    return useSWR<{ status: MigrationStatus }, SWRError>([
      `/api/migrations/status`,
    ]);
  }

  export function migrationsRunAction(
    action: "latest" | "rollback" | "shadow",
    targets: string[]
  ): Promise<
    {
      connKey: string;
      batchNo: number;
      applied: string[];
    }[]
  > {
    return fetch({
      method: "POST",
      url: `/api/migrations/runAction`,
      data: {
        action,
        targets,
      },
    });
  }

  export function migrationsDelCodes(codeNames: string[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/migrations/delCodes`,
      data: {
        codeNames,
      },
    });
  }

  export function migrationsGeneratePreparedCodes(): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/migrations/generatePreparedCodes`,
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
        }
  ): Promise<void> {
    return fetch({
      method: "GET",
      url: `/api/tools/openVscode`,
      params,
    });
  }

  export function getSuggestion(params: {
    origin: string;
    entityId?: string;
  }): Promise<{ suggested: string }> {
    return fetch({
      method: "GET",
      url: `/api/tools/getSuggestion`,
      params,
    });
  }

  export function useScaffoldingStatus(
    params: ScaffoldingGetStatusParams
  ): SWRResponse<{ statuses: ScaffoldingStatus[] }, SWRError> {
    const route = (() => {
      if (params.entityIds.length === 0 || params.templateKeys.length === 0) {
        return null;
      } else if (
        params.templateGroupName === "Enums" &&
        params.enumIds.length === 0
      ) {
        return null;
      }
      return [`/api/scaffolding/getStatus`, params];
    })();
    return useSWR<{ statuses: ScaffoldingStatus[] }, SWRError>(
      route,
      swrPostFetcher
    );
  }
  export function scaffoldingGenerate(
    options: ScaffoldingGenerateOptions[]
  ): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/scaffolding/generate`,
      data: {
        options,
      },
    });
  }

  export function scaffoldingPreview(
    option: ScaffoldingGenerateOptions
  ): Promise<{ pathAndCodes: PathAndCode[] }> {
    return fetch({
      method: "POST",
      url: `/api/scaffolding/preview`,
      data: {
        option,
      },
    });
  }

  export function getMessage(id: string): Promise<{
    id: string;
    content: string;
  }> {
    return fetch({
      method: "GET",
      url: `/api/openai/message`,
      params: { id },
    });
  }

  export function chat(message: string): Promise<{
    id: string;
    content: string;
  }> {
    return fetch({
      method: "POST",
      url: `/api/openai/chat`,
      data: { message },
    });
  }

  export function clearThread(): Promise<void> {
    return fetch({
      method: "POST",
      url: `/api/openai/clearThread`,
    });
  }

  export function getFixtures(
    db: string,
    search: FixtureSearchOptions
  ): Promise<FixtureRecord[]> {
    return fetch({
      method: "POST",
      url: `/api/fixture`,
      data: { db, search },
    });
  }

  export function importFixtures(
    db: string,
    fixtures: FixtureRecord[]
  ): Promise<FixtureImportResult[]> {
    return fetch({
      method: "POST",
      url: `/api/fixture/import`,
      data: { db, fixtures },
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

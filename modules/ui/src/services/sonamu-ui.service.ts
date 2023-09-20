import { Entity } from "sonamu/dist/entity/entity";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "./sonamu.shared";
import {
  EntityIndex,
  EntityProp,
  FlattenSubsetRow,
  MigrationStatus,
} from "sonamu";

type SWRError = {
  name: string;
  message: string;
  statusCode: number;
};

type ExtendedEntity = Entity & {
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

  export function createEntity(form: {
    id: string;
    title: string;
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

  export function modifyProps(
    entityId: string,
    props: EntityProp[]
  ): Promise<{ updated: EntityProp[] }> {
    return fetch({
      method: "POST",
      url: `/api/entity/modifyProps`,
      data: {
        entityId,
        props,
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
}

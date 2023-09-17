import { Entity } from "sonamu/dist/entity/entity";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "./sonamu.shared";
import { EntityIndex, EntityProp, FlattenSubsetRow } from "sonamu";

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
}

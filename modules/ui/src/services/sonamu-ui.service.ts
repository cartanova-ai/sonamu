import { Entity } from "sonamu/dist/entity/entity";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "./sonamu.shared";
import { EntityProp } from "sonamu";

type SWRError = {
  name: string;
  message: string;
  statusCode: number;
};

export namespace SonamuUIService {
  export function useEntities(): SWRResponse<{ entities: Entity[] }, SWRError> {
    return useSWR<{ entities: Entity[] }, SWRError>([`/api/entity/findMany`]);
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
}

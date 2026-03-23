import { useQuery } from "@tanstack/react-query";
import { fetch } from "../../services/sonamu.shared";
import type {
  CddContentEnvelope,
  CddDashboardData,
  CddSchemaDetailEnvelope,
  CddSchemaSummary,
  CddTreeNode,
} from "./types";

export namespace CddService {
  export function useCddDashboard() {
    return useQuery({
      queryKey: ["cdd", "dashboard"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/cdd/dashboard`,
        }) as Promise<CddDashboardData>,
    });
  }

  export function useCddTree(enabled = true) {
    return useQuery({
      queryKey: ["cdd", "tree"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/cdd/tree`,
        }) as Promise<{ exists: boolean; tree: CddTreeNode[] }>,
      enabled,
    });
  }

  export function readCddContent(filePath: string): Promise<CddContentEnvelope> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/cdd/readContent`,
      data: { filePath },
    });
  }

  export function useReadCddContent(filePath: string | null) {
    return useQuery({
      queryKey: ["cdd", "readContent", filePath],
      queryFn: ({ queryKey }) => {
        const path = queryKey[2];
        if (typeof path !== "string") throw new Error("filePath is required");
        return readCddContent(path);
      },
      enabled: filePath !== null,
    });
  }

  export function editCddContent(
    filePath: string,
  ): Promise<{ success: boolean; filePath: string }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/cdd/editContent`,
      data: { filePath },
    });
  }

  export function openCddSource(filePath: string): Promise<{ success: boolean }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/cdd/openSource`,
      data: { filePath },
    });
  }

  export function useCddSchemas(enabled = true) {
    return useQuery({
      queryKey: ["cdd", "schemas"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/cdd/schemas`,
        }) as Promise<{ schemas: CddSchemaSummary[] }>,
      enabled,
    });
  }

  export function readCddSchema(schemaKey: string): Promise<CddSchemaDetailEnvelope> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/cdd/readSchema`,
      data: { schemaKey },
    });
  }

  export function useReadCddSchema(schemaKey: string | null) {
    return useQuery({
      queryKey: ["cdd", "readSchema", schemaKey],
      queryFn: ({ queryKey }) => {
        const key = queryKey[2];
        if (typeof key !== "string") throw new Error("schemaKey is required");
        return readCddSchema(key);
      },
      enabled: schemaKey !== null,
    });
  }

  export function editCddSchema(
    schemaKey: string,
  ): Promise<{ success: boolean; schemaKey: string }> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/cdd/editSchema`,
      data: { schemaKey },
    });
  }
}

import { useQuery } from "@tanstack/react-query";
import { fetch } from "../../services/sonamu.shared";
import type {
  CddAcListResult,
  CddAddRuleRequest,
  CddContentResult,
  CddRuleDetail,
  CddRuleSummary,
  CddTreeNode,
} from "./types";

export namespace CddService {
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

  export function readCddContent(filePath: string): Promise<CddContentResult> {
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

  export function useCddRules(enabled = true) {
    return useQuery({
      queryKey: ["cdd", "rules"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/cdd/rules`,
        }) as Promise<{ rules: CddRuleSummary[] }>,
      enabled,
    });
  }

  export function readCddRule(ruleKey: string): Promise<CddRuleDetail> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/cdd/readRule`,
      data: { ruleKey },
    });
  }

  export function useReadCddRule(ruleKey: string | null) {
    return useQuery({
      queryKey: ["cdd", "readRule", ruleKey],
      queryFn: ({ queryKey }) => {
        const key = queryKey[2];
        if (typeof key !== "string") throw new Error("ruleKey is required");
        return readCddRule(key);
      },
      enabled: ruleKey !== null,
    });
  }

  export function useCddAc(enabled = true) {
    return useQuery({
      queryKey: ["cdd", "ac"],
      queryFn: () =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/cdd/ac`,
        }) as Promise<CddAcListResult>,
      enabled,
    });
  }

  export function addCddRule(req: CddAddRuleRequest): Promise<CddRuleDetail> {
    return fetch({
      method: "POST",
      url: `/sonamu-ui/api/cdd/addRule`,
      data: req,
    });
  }
}

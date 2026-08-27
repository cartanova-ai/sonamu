import { useQuery } from "@tanstack/react-query";

import { fetch } from "../../services/sonamu.shared";
import {
  type CddAcListResult,
  type CddAddRuleRequest,
  type CddContentResult,
  type CddRuleDetail,
  type CddRuleSummary,
  type CddTreeNode,
} from "./types";

export namespace CddService {
  export function useCddTree(enabled = true) {
    return useQuery({
      queryKey: ["cdd", "tree"],
      queryFn: (): Promise<{ exists: boolean; tree: CddTreeNode[] }> =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/cdd/tree`,
        }),
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
      queryFn: () =>
        filePath === null
          ? Promise.reject(new Error("filePath is required"))
          : readCddContent(filePath),
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
      queryFn: (): Promise<{ rules: CddRuleSummary[] }> =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/cdd/rules`,
        }),
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
      queryFn: () =>
        ruleKey === null ? Promise.reject(new Error("ruleKey is required")) : readCddRule(ruleKey),
      enabled: ruleKey !== null,
    });
  }

  export function useCddAc(enabled = true) {
    return useQuery({
      queryKey: ["cdd", "ac"],
      queryFn: (): Promise<CddAcListResult> =>
        fetch({
          method: "GET",
          url: `/sonamu-ui/api/cdd/ac`,
        }),
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

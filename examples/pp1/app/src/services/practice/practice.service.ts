import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import {
  fetch,
  ListResult,
  SWRError,
  SwrOptions,
  handleConditional,
} from "../sonamu.shared";
import { PracticeSaveParams } from "./practice.types";

export namespace PracticeService {
  export async function love(
    str: string,
    num: number,
    bool: boolean
  ): Promise<string> {
    return fetch({
      method: "GET",
      url: `/api/practice/love?${qs.stringify({ str, num, bool })}`,
    });
  }

  export function useMe(
    strLit: "abc",
    numLit: 3,
    obj: { str: string; num: number },
    arr: string[],
    saveParams: PracticeSaveParams,
    mode: "A" | "B",
    saveParamsRe: PracticeSaveParams & { extra: string },
    omitted: Omit<PracticeSaveParams, "id" | "created_at">,
    partialed: Partial<PracticeSaveParams>,
    nl1: string | null,
    opt1?: string,
    hasDef: string = "default",
    options?: SwrOptions
  ): SWRResponse<
    {
      strLit: "abc";
      numLit: 3;
      obj: { str: string; num: number };
      arr: string[];
      saveParams: PracticeSaveParams;
      mode: "A" | "B";
      saveParamsRe: PracticeSaveParams & { extra: string };
      omitted: Omit<PracticeSaveParams, "id" | "created_at">;
      partialed: Partial<PracticeSaveParams>;
      nl1: string | null;
      opt1: string;
      hasDef: string;
    },
    SWRError
  > {
    return useSWR<
      {
        strLit: "abc";
        numLit: 3;
        obj: { str: string; num: number };
        arr: string[];
        saveParams: PracticeSaveParams;
        mode: "A" | "B";
        saveParamsRe: PracticeSaveParams & { extra: string };
        omitted: Omit<PracticeSaveParams, "id" | "created_at">;
        partialed: Partial<PracticeSaveParams>;
        nl1: string | null;
        opt1: string;
        hasDef: string;
      },
      SWRError
    >(
      handleConditional(
        [
          `/api/practice/me`,
          qs.stringify({
            strLit,
            numLit,
            obj,
            arr,
            saveParams,
            mode,
            saveParamsRe,
            omitted,
            partialed,
            nl1,
            opt1,
            hasDef,
          }),
        ],
        options?.conditional
      )
    );
  }
  export async function me(
    strLit: "abc",
    numLit: 3,
    obj: { str: string; num: number },
    arr: string[],
    saveParams: PracticeSaveParams,
    mode: "A" | "B",
    saveParamsRe: PracticeSaveParams & { extra: string },
    omitted: Omit<PracticeSaveParams, "id" | "created_at">,
    partialed: Partial<PracticeSaveParams>,
    nl1: string | null,
    opt1?: string,
    hasDef: string = "default"
  ): Promise<{
    strLit: "abc";
    numLit: 3;
    obj: { str: string; num: number };
    arr: string[];
    saveParams: PracticeSaveParams;
    mode: "A" | "B";
    saveParamsRe: PracticeSaveParams & { extra: string };
    omitted: Omit<PracticeSaveParams, "id" | "created_at">;
    partialed: Partial<PracticeSaveParams>;
    nl1: string | null;
    opt1: string;
    hasDef: string;
  }> {
    return fetch({
      method: "POST",
      url: `/api/practice/me`,
      data: {
        strLit,
        numLit,
        obj,
        arr,
        saveParams,
        mode,
        saveParamsRe,
        omitted,
        partialed,
        nl1,
        opt1,
        hasDef,
      },
    });
  }

  export async function flying(flying: string): Promise<{ flying: string }> {
    return fetch({
      method: "GET",
      url: `/api/practice/flying?${qs.stringify({ flying })}`,
    });
  }

  export async function high(high: number): Promise<{ high: number }> {
    return fetch({
      method: "GET",
      url: `/api/practice/high?${qs.stringify({ high })}`,
    });
  }

  export function usePractices(
    options?: SwrOptions
  ): SWRResponse<string, SWRError> {
    return useSWR<string, SWRError>(
      handleConditional(
        [`/api/practice/findMany`, qs.stringify({})],
        options?.conditional
      )
    );
  }
  export async function getPractices(): Promise<string> {
    return fetch({
      method: "GET",
      url: `/api/practice/findMany?${qs.stringify({})}`,
    });
  }
}

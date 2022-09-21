import { DateTime } from "luxon";
import { Context } from "sonamu";
import { api } from "sonamu";
import { PracticeSaveParams } from "./practice.types";

export class PracticeModelClass {
  @api({ contentType: "text/plain" })
  async love(str: string, num: number, bool: boolean): Promise<string> {
    // LOGIC BLOCK
    return [str, num, bool].join("\n");
  }

  @api({ httpMethod: "POST", clients: ["axios", "swr"] })
  async me(
    strLit: "abc",
    numLit: 3,
    obj: {
      str: string;
      num: number;
    },
    arr: string[],
    saveParams: PracticeSaveParams,
    mode: "A" | "B",
    saveParamsRe: PracticeSaveParams & { extra: string },
    omitted: Omit<PracticeSaveParams, "id" | "created_at">,
    partialed: Partial<PracticeSaveParams>,
    nl1: string | null,
    context: Context,
    opt1?: string,
    hasDef: string = "default"
  ): Promise<{
    strLit: "abc";
    numLit: 3;
    obj: {
      str: string;
      num: number;
    };
    arr: string[];
    saveParams: PracticeSaveParams;
    mode: "A" | "B";
    saveParamsRe: PracticeSaveParams & { extra: string };
    omitted: Omit<PracticeSaveParams, "id" | "created_at">;
    partialed: Partial<PracticeSaveParams>;
    nl1: string | null;
    opt1?: string;
    hasDef: string;
  }> {
    const KEY = "lastCall";
    const lastCall = context.session.get(KEY);
    if (!lastCall) {
      console.log("첫 콜");
    } else {
      const df = DateTime.fromSQL(lastCall).diffNow().toFormat("S");
      console.log(
        `마지막 콜로부터 ${((parseInt(df) * -1) / 1000).toFixed(2)}초`
      );
    }
    context.session.set(KEY, DateTime.local().toSQL().slice(0, 19));

    // LOGIC BLOCK

    return {
      obj,
      strLit,
      numLit,
      arr,
      saveParams,
      mode,
      saveParamsRe,
      nl1,
      omitted,
      partialed,
      hasDef,
      opt1,
    };
  }

  @api()
  async flying(flying: string, _context: Context): Promise<{ flying: string }> {
    // LOGIC BLOCK
    return {
      flying,
    };
  }

  @api()
  async high(high: number): Promise<{ high: number }> {
    // LOGIC BLOCK
    return {
      high,
    };
  }

  @api({ clients: ["axios", "swr"], resourceName: "Practices" })
  async findMany(): Promise<string> {
    return "abc";
  }
}
export const PracticeModel = new PracticeModelClass();

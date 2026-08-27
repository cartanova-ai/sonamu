import { type z } from "zod";

import { isNumberValue, isSymbolValue } from "./runtime-value";

type ValidationError = {
  path: string[];
  message: string;
};

export function humanizeZodError(error: z.ZodError): ValidationError[] {
  return error.issues.map(({ path: originPath, message }) => {
    const path = originPath.map((item) => {
      if (isSymbolValue(item)) {
        return item.description ?? item.toString();
      }

      if (isNumberValue(item)) {
        return `[${item}]`;
      }

      return item;
    });

    return { path, message: message };
  });
}

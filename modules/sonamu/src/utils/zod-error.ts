
import { z } from 'zod';

type ValidationError = {
  path: string[];
  message: string;
};

export function humanizeZodError(error: z.ZodError): ValidationError[] {
  return error.issues.map(({  path: originPath, message }) => {
    const path = originPath.map(item => {
      if (typeof item === "symbol") {
        return item.description ?? item.toString();
      }

      if (typeof item === "number") {
        return `[${item}]`;
      }

      return item;
    });

    return { path, message: message };
  });
}

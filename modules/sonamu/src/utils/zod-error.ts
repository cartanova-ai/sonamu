import { z } from "zod";

type ValidationError = {
  path: string[];
  message: string;
};

export function humanizeZodError(error: z.ZodError): ValidationError[] {
  return error.issues.map((issue) => {
    const pathAsStrings = issue.path.map(String);
    const path = issue.path.reduce((acc, cur, i) => {
      if (typeof cur === "number") {
        return `${acc}[${cur}]`;
      }
      return i === 0 ? cur : `${acc}.${cur}`;
    }, "");

    switch (issue.code) {
      case z.ZodIssueCode.invalid_type:
        return {
          path: pathAsStrings,
          message: `${path} should be a ${issue.expected}, received ${issue.received}.`,
        };

      case z.ZodIssueCode.unrecognized_keys:
        return {
          path: pathAsStrings,
          message: `Unrecognized keys in ${path}: ${issue.keys.join(", ")}.`,
        };

      case z.ZodIssueCode.invalid_union:
        return {
          path: pathAsStrings,
          message: `${path} failed union validation. Inner errors: ${issue.unionErrors
            .map((e) => e.issues.map((i) => i.message).join("; "))
            .join(" OR ")}.`,
        };

      case z.ZodIssueCode.invalid_enum_value:
        return {
          path: pathAsStrings,
          message: `${path} must be one of: ${issue.options.join(", ")}.`,
        };

      case z.ZodIssueCode.invalid_arguments:
        return {
          path: pathAsStrings,
          message: `Invalid function arguments: ${issue.argumentsError.issues
            .map((i) => i.message)
            .join("; ")}.`,
        };

      case z.ZodIssueCode.invalid_return_type:
        return {
          path: pathAsStrings,
          message: `Invalid function return type: ${issue.returnTypeError.issues
            .map((i) => i.message)
            .join("; ")}.`,
        };

      case z.ZodIssueCode.invalid_date:
        return {
          path: pathAsStrings,
          message: `${path} must be a valid date.`,
        };

      case z.ZodIssueCode.invalid_string:
        const validationType = issue.validation;
        return {
          path: pathAsStrings,
          message: `${path} must be a valid ${validationType}.`,
        };

      case z.ZodIssueCode.too_small:
        return {
          path: pathAsStrings,
          message: `${path} ${getMinimumMessage(issue)}.`,
        };

      case z.ZodIssueCode.too_big:
        return {
          path: pathAsStrings,
          message: `${path} ${getMaximumMessage(issue)}`,
        };

      case z.ZodIssueCode.not_multiple_of:
        return {
          path: pathAsStrings,
          message: `${path} must be a multiple of ${issue.multipleOf.toString()}.`,
        };

      case z.ZodIssueCode.custom:
        return {
          path: pathAsStrings,
          message: issue.message || `${path} failed custom validation.`,
        };

      default:
        return {
          path: pathAsStrings,
          message: issue.message,
        };
    }
  });
}

function getMinimumMessage(
  issue: z.ZodIssue & { code: typeof z.ZodIssueCode.too_small }
) {
  switch (issue.type) {
    case "string":
      return `must be ${
        issue.exact ? "exactly" : issue.inclusive ? "at least" : "more than"
      } ${issue.minimum} character${issue.minimum === 1 ? "" : "s"}`;

    case "number":
      return `must be ${
        issue.exact
          ? "exactly"
          : issue.inclusive
            ? "greater than or equal to"
            : "greater than"
      } ${issue.minimum.toString()}`;

    case "array":
    case "set":
      return `must contain ${
        issue.exact ? "exactly" : issue.inclusive ? "at least" : "more than"
      } ${issue.minimum} item${issue.minimum === 1 ? "" : "s"}`;

    case "date":
      return `must be ${
        issue.exact ? "exactly" : issue.inclusive ? "at or after" : "after"
      } ${formatDateConstraint(issue.minimum)}`;

    default:
      return "is too small";
  }
}

function getMaximumMessage(
  issue: z.ZodIssue & { code: typeof z.ZodIssueCode.too_big }
) {
  switch (issue.type) {
    case "string":
      return `must be ${
        issue.exact ? "exactly" : issue.inclusive ? "at most" : "less than"
      } ${issue.maximum} character${issue.maximum === 1 ? "" : "s"}`;

    case "number":
      return `must be ${
        issue.exact
          ? "exactly"
          : issue.inclusive
            ? "less than or equal to"
            : "less than"
      } ${issue.maximum.toString()}`;

    case "array":
    case "set":
      return `must contain ${
        issue.exact ? "exactly" : issue.inclusive ? "at most" : "fewer than"
      } ${issue.maximum} item${issue.maximum === 1 ? "" : "s"}`;

    case "date":
      return `must be ${
        issue.exact ? "exactly" : issue.inclusive ? "at or before" : "before"
      } ${formatDateConstraint(issue.maximum)}`;

    default:
      return "is too big";
  }
}

function formatDateConstraint(value: number | bigint): string {
  try {
    if (typeof value === "bigint") {
      if (
        value > BigInt(Number.MAX_SAFE_INTEGER) ||
        value < BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        return value.toString();
      }
    }
    return new Date(Number(value)).toISOString();
  } catch {
    return value.toString();
  }
}

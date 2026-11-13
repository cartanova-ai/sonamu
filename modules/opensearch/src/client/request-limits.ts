import { z } from "zod";

// setTimeout fires at once for a longer delay.
export const MAX_TIMER_MS = 2_147_483_647;

export const MAX_PAGE_SIZE_LIMIT = 10_000;

// Larger responses hit the Node string length limit.
export const MAX_RESPONSE_BYTES_LIMIT = 512 * 1024 * 1024;

export const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export const timeoutMsSchema = z.number().int().min(1).max(MAX_TIMER_MS);

export const pageSizeSchema = z.number().int().min(1).max(MAX_PAGE_SIZE_LIMIT);

export const responseBytesSchema = z.number().int().min(1).max(MAX_RESPONSE_BYTES_LIMIT);

export interface Deadline {
  readonly at: number;
}

export function startDeadline(timeoutMs: number): Deadline {
  return { at: performance.now() + timeoutMs };
}

export function remainingMs(deadline: Deadline): number {
  return Math.max(0, Math.ceil(deadline.at - performance.now()));
}

const MAX_ISSUE_PATH_LENGTH = 120;

export function issuePath(issue: z.core.$ZodIssue | undefined): string {
  if (issue === undefined) return "";
  const segments: PropertyKey[] =
    issue.code === "unrecognized_keys" ? [...issue.path, issue.keys[0] ?? ""] : [...issue.path];
  const path = segments.map((segment) => String(segment)).join(".");
  return path.length > MAX_ISSUE_PATH_LENGTH ? `${path.slice(0, MAX_ISSUE_PATH_LENGTH)}…` : path;
}

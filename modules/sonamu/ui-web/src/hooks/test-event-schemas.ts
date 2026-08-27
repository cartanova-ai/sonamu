import { z } from "zod";

import {
  type ManagerStatus,
  type RunResult,
  type StoredRunEntry,
  type StoredRunHistory,
  type TestCaseResult,
  type TestSSEEventMap,
} from "../services/sonamu-ui.service";

const serializedTraceSchema = z.looseObject({
  key: z.string(),
  value: z.unknown(),
  filePath: z.string(),
  lineNumber: z.number(),
  at: z.string(),
});

const testCaseResultSchema: z.ZodType<TestCaseResult> = z.lazy(() =>
  z.looseObject({
    id: z.string(),
    kind: z.enum(["file", "suite", "test"]),
    name: z.string(),
    fullName: z.string(),
    file: z.string(),
    state: z.enum(["passed", "failed", "skipped", "todo", "running", "unknown"]),
    durationMs: z.number().nullable(),
    counts: z.looseObject({
      total: z.number(),
      passed: z.number(),
      failed: z.number(),
      skipped: z.number(),
    }),
    error: z
      .looseObject({
        message: z.string(),
        stack: z.string().optional(),
      })
      .nullable(),
    traces: z.array(serializedTraceSchema),
    children: z.array(testCaseResultSchema),
  }),
);

const runResultSchema: z.ZodType<RunResult> = z.looseObject({
  ok: z.boolean(),
  summary: z.looseObject({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
    durationMs: z.number(),
  }),
  results: z.array(testCaseResultSchema),
});

const managerStatusSchema: z.ZodType<ManagerStatus> = z.looseObject({
  ready: z.boolean(),
  running: z.boolean(),
  lastRunAt: z.string().nullable(),
  sseAvailable: z.boolean(),
});

const storedRunEntrySchema: z.ZodType<StoredRunEntry> = z.looseObject({
  runId: z.string(),
  dateKey: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  result: runResultSchema,
});

export const storedRunHistorySchema: z.ZodType<StoredRunHistory> = z.looseObject({
  runs: z.array(storedRunEntrySchema),
});

type TestEventPayloadSchemas = {
  [K in keyof TestSSEEventMap]: z.ZodType<TestSSEEventMap[K]>;
};

export const testEventPayloadSchemas: TestEventPayloadSchemas = {
  snapshot: z.looseObject({
    schemaVersion: z.literal(1),
    serverTime: z.string(),
    status: managerStatusSchema,
  }),
  runQueued: z.looseObject({
    schemaVersion: z.literal(1),
    runId: z.string(),
    queuedAt: z.string(),
    request: z.looseObject({
      files: z.array(z.string()).optional(),
      pattern: z.string().optional(),
    }),
  }),
  runStarted: z.looseObject({
    schemaVersion: z.literal(1),
    runId: z.string(),
    startedAt: z.string(),
  }),
  runCompleted: z.looseObject({
    schemaVersion: z.literal(1),
    runId: z.string(),
    startedAt: z.string(),
    finishedAt: z.string(),
    result: runResultSchema,
  }),
  runErrored: z.looseObject({
    schemaVersion: z.literal(1),
    runId: z.string(),
    finishedAt: z.string(),
    error: z.looseObject({
      message: z.string(),
      stack: z.string().optional(),
    }),
  }),
  runNodeProgress: z.looseObject({
    schemaVersion: z.literal(1),
    runId: z.string(),
    startedAt: z.string(),
    at: z.string(),
    kind: z.enum(["file", "suite", "test"]),
    phase: z.enum(["ready", "result"]),
    fileId: z.string(),
    nodeId: z.string(),
    parentId: z.string().nullable(),
    node: testCaseResultSchema,
  }),
  heartbeat: z.looseObject({
    schemaVersion: z.literal(1),
    at: z.string(),
  }),
};

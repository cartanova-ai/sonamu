---
name: sonamu-tasks
description: Runs PostgreSQL-backed workflows with Sonamu Tasks. Use when setting up @sonamu-kit/tasks, defining or enqueuing workflows, starting workers, adding a Sonamu cron workflow, or diagnosing retries, deadlines, leases, duplicate effects, cancellation, and recovery. Covers BackendPostgres, OpenWorkflow, workflow, step.run, step.sleep, WorkflowRunHandle, and Sonamu.workflows.
---

# Sonamu Tasks

Choose the surface already used by the project:

- `@sonamu-kit/tasks` is the standalone queue. The application initializes a `BackendPostgres`,
  creates an `OpenWorkflow`, registers implementations, and starts a worker explicitly.
- `workflow` from `sonamu` is the framework adapter. Sonamu discovers exported metadata from
  `src/application/**/*.workflow.ts`, manages the backend and worker, and adds schedules, workflow
  context, a logger, and `step.get`/`step.define`.

Do not import `@sonamu-kit/tasks/internal`. The package root exports the supported constructors and
helpers; let method return types infer handle, workflow, and run types that are not root exports.

Both surfaces persist workflow runs and step attempts in PostgreSQL. Persistence does not make an
arbitrary side effect exactly once: recovery replays the workflow handler, and a step can run again
when its effect happened before its completion record was saved.

## Reference map

| Task | Read |
| --- | --- |
| Install the standalone package; initialize PostgreSQL; configure, start, and stop workers | `references/standalone-runtime.md` |
| Declare or register a workflow; validate input; enqueue; await, cancel, pause, or resume a run | `references/workflows-and-handles.md` |
| Design steps; configure retries; reason about idempotency, leases, deadlines, and recovery | `references/reliability-and-recovery.md` |
| Use `workflow()`, schedules, `contextProvider`, workflow logging, or `Sonamu.workflows` | `references/sonamu-integration.md` |

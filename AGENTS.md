# Sonamu Guide for Coding Agents (Monorepo Root)

This file applies to current directory and all child directories unless overridden by a deeper `AGENTS.md`.

## Canonical control files
- Primary instructions are `AGENTS.md` and `.agents/`.
- `CLAUDE.md` exists only for compatibility and must be a symlink to `AGENTS.md`.
- `.claude/` exists only for compatibility and must be a symlink to `.agents/`.
- Workflow prompts are stored under `.agents/workflow/`.
- Claude preset subagents are stored under `.agents/agents/` and exposed through `.claude/agents/` via symlink.
- Do not create additional `.claude/` or `.agents/` directories in subdirectories.

## Mandatory scope check before any task
- Before starting any task, identify every directory affected by planned changes.
- Read and follow the nearest applicable `AGENTS.md` in each affected path.
- If `CLAUDE.md` exists in an affected path, treat it as compatibility entry and verify it resolves to the same instructions.
- When multiple instruction files apply, the deeper path takes precedence.
- Do not start edits until scope check is complete.

## Integrated workflow protocol
- Planning, implementation, orchestration, review, and handoff are prompt contracts under `.agents/workflow/prompts/`.
- Start with `00_bootstrap.md`, then `01_plan.md`, then orchestration via `07_orchestrator.md`.
- Use `02_implement.md` for implementation units.
- Use `04_hotfix.md` for incident/hotfix fixes.
- Use `08_review_feedback_handler.md` only for review-originated fixes.
- Complete with `05_user_review_handoff.md`.
- Review/session handling follows `.agents/workflow/prompts/06_codex_output_and_sessions.md`.

## Cross-agent subagent compatibility
- Claude Code can use preset subagents from `.claude/agents/*.md`.
- Other agents may not support preset subagents.
- If preset support is unavailable, use inline fallback references:
  - `.agents/workflow/subagents/00_agent_roles.md`
  - corresponding file under `.agents/workflow/prompts/`
- Orchestrator must choose execution mode per spawn:
  - `preset`
  - `inline_fallback`
- Inline fallback payload must include:
  - `role_id`
  - `role_file_ref`
  - `prompt_file_ref`
  - `objective_packet`
  - `required_tools`
  - `required_skills`
  - `done_criteria`
  - `execution_mode=inline_fallback`

## Language and output policy
- Prompts and internal reasoning are written in English.
- Final user-facing output follows user language preference. If unclear, default to Korean.
- Keep output concise, factual, and polite.
- Do not output emoji unless explicitly requested.
- Use Mermaid for diagrams. Do not use ASCII flowcharts.
- Korean output must use polite honorific declarative endings such as `-합니다.` and avoid plain declarative style.
- The Korean style rule applies to external channels as well (for example: Notion, Linear, GitHub).

## Writing quality policy
For docs/messages/direct responses:
- Avoid vague, inflated, repetitive wording.
- Prefer concrete facts, constraints, and decisions.
- Keep wording short and specific.

## Absolute prohibitions
- Do not force push.
- Do not rely on arbitrary assumptions. If uncertainty remains after checking code/logs/history, ask the user unless autonomous mode is active.
- Do not directly edit generated files (`*.generated.ts`, `sonamu.generated.*`, `queries.generated.ts`, generated client artifacts).
- Do not claim deployment or migration execution unless the user explicitly instructed and confirmed.


## Work style policy
- Plan-first execution is the default. Clarify scope and constraints before implementation.
- For narrow explicit requests, execute directly but report any meaningful side effects discovered.
- For ambiguous requests, resolve planning-critical questions first, then proceed.

## Problem escalation policy
- If an unexpected blocker occurs, stop further risky edits and report facts to the user first.
- Propose practical recovery options with trade-offs.
- Prioritize rollback safety before attempting invasive recovery work.

## Refactoring policy
- Actively remove confusing or inconsistent AI-generated structures when they reduce maintainability.
- Keep conceptual consistency across connected files, not just local function/file cleanliness.

## Safety and operational boundaries
- Do not modify local databases directly. Read-only local DB access is allowed.
- Do not connect/read/write remote databases directly.
- Do not run mutating Terraform/AWS CLI operations. Read-only inspection only.
- Agents must not deploy.
- DB migration execution requires explicit user intervention.

## Pre-task readiness
1. Sync latest changes with `git pull`.
2. After pull, run `pnpm install && pnpm build` at repo root.
3. Ensure rollback safety before risky edits (`git stash` or equivalent checkpoint).
4. If you are stuck for a long time without commits, recommend a checkpoint commit to the user.

If the environment becomes inconsistent after the above, restart test DB container:
```bash
cd examples/miomock/api/database
docker compose down
docker compose up -d
```

## Validation policy
- Common required gates:
  - root `pnpm check` (Biome) must pass
  - root lint/format policy checks when applicable
  - touched project build/test gates
- For every implementation unit, define `must_verify_behaviors` and write tests first.
- For backend/library changes, include regression tests for non-obvious failure-prone behavior.
- For any subproject change, completion requires a passing root `pnpm check`.
- Minimum Sonamu baseline:
  - after code changes: type check + build
  - before push: test pass

## Review policy
- Run per-unit review/fix loop until clean.
- After integration, run full-branch review/fix loop until clean.
- Review priority order is mandatory:
  - bugs
  - requirement conformance
  - performance/security risk
- If review output is large, use temp files and pass only file path plus compact metadata.
- Prefer Codex MCP for planning/review when available and not overridden.

## Commit message policy
- Use scope-first bracket conventional format.
- Standard: `[scope] type: short title`
- WIP: `[scope] type(wip): short title`
- `type` is mandatory.
- Do not use stage tags like `(Phase 1)`.
- Commit message language must be Korean.
- Do not add any `Co-Authored-By` trailer to commits.
- `scope` can include multiple packages.
- Exclude sync-only/generated-file impact from `scope`.
- For monorepo-wide impact, use `[*]`.
- Referencing Linear ticket IDs is recommended.

## Branch strategy
- Default strategy is committing directly to `master`.
- Commit only after build success.
- Push only after tests pass.

## Coding style
- Prefer straightforward, immediately readable code over ornamental abstractions.
- Avoid unnecessary OOP patterns. Use classes only when stateful containers are justified.
- Keep related logic near related code.
- Prefer `async/await`.
- Avoid unnecessary `return await`, but preserve `await` in assignment/try boundaries where stack trace quality matters.

## Comment, error, logging policy
- Only add comments where the logic is not self-evident. Keep comments concise.
- Do not use section-label or region-marker comments (for example: `// ===== Section =====`, `// --- Region ---`, `/* ========== */`).
- Write comments in Korean honorific style.
- Comments must explain "why" and decision context, not restate code.
- Resolve comment-code mismatch immediately.
- Error handling must preserve root cause and include actionable context/hints.
- In `miomock-api` implementation classes (Model/Frame/Agent), prefer `this.logger` (logtape).
- Outside that scope, use `console.log` minimally.

## Sonamu generated/scaffolding policy
- Real-time sync generated files are overwrite targets and must not be hand-edited.
- Scaffolding files are developer-owned after first generation.
- `sonamu.lock` tracks checksums for regeneration triggers.
- Regeneration when needed:
```bash
rm api/sonamu.lock
pnpm sonamu sync
```

## Sonamu source-of-truth policy
- `entity.json` and related core definitions are Single Source of Truth inputs.
- Most `entity.json` edits and DB migration operations are user-driven through Sonamu UI.
- If direct edits are unavoidable, ask user confirmation first.
- In `miomock`, i18n changes must be applied in `examples/miomock/api` as the source package.

## Dependency policy
- Before adding a package, verify necessity at monorepo level.
- Register shared dependencies in `pnpm-workspace.yaml` catalog when appropriate.
- Consider cross-module impact of version changes.

## Autonomous mode policy (`[자율주행]`)
### Trigger conditions
Treat as autonomous mode when either is true:
- The user message includes `[자율주행]`.
- The user explicitly asks to proceed to completion without asking questions.

### Execution rules in autonomous mode
1. Continue to completion without mid-task clarification requests.
2. Absolute prohibitions still apply.
3. Record uncertainty as `검토 필요 사항` in deliverables instead of blocking execution.
4. If build/typecheck fails, attempt fixes and record outcomes before finishing.
5. Proceed when confidence is at least 60%; if lower, log as `검토 필요 사항` and move forward safely.

## Package map
- `modules/sonamu`: Sonamu framework core.
- `modules/sonamu/ui-web`: Sonamu UI web build package.
- `modules/hmr-hook`, `modules/hmr-runner`, `modules/ts-loader`: HMR/tooling core modules.
- `modules/tasks`: distributed task queue package.
- `modules/react-components`, `modules/react-sui`: React UI libraries.
- `modules/create-sonamu`: project scaffolder CLI.
- `modules/docs`: documentation package.
- `examples/miomock/api`, `examples/miomock/web`: integration sample/test application.

## Instruction lifecycle
- Keep this file as a living policy document.
- Update when priorities or major failure patterns change.
- Prefer updating existing sections over adding redundant new sections.

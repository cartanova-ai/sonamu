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
- Before starting any task, identify all directories affected by the planned changes.
- You must read and follow the nearest applicable `AGENTS.md` in each affected path before making changes.
- If `CLAUDE.md` exists in an affected path, treat it as required compatibility entry and verify it resolves to the same instructions.
- When multiple instruction files apply, the deeper (more specific) path takes precedence over higher-level guidance.
- Do not proceed with edits until this scope check is completed.

## Mandatory common-policy preload (before workflow)
- Before any implementation, review, or orchestration decision, always read and follow:
  - `.agents/workflow/prompts/00_shared_contract.md`
  - `.agents/workflow/subagents/00_agent_roles.md`
  - `.agents/workflow/prompts/06_codex_output_and_sessions.md`
- This preload is mandatory even when not running the full orchestrated workflow prompt sequence.
- If these files conflict with a deeper-path `AGENTS.md`, the deeper `AGENTS.md` still takes precedence.

## Integrated workflow protocol
- Planning, implementation, orchestration, review, and handoff are prompt contracts under `.agents/workflow/prompts/`.
- Start with `00_bootstrap.md`, then `01_plan.md`, then orchestration via `07_orchestrator.md`.
- Use `02_implement.md` for implementation units.
- Use `04_hotfix.md` for incident/hotfix fixes.
- Use `08_review_feedback_handler.md` only for review-originated fixes.
- Complete with `05_user_review_handoff.md`.
- Review/session handling follows `.agents/workflow/prompts/06_codex_output_and_sessions.md`.

## Cross-agent subagent compatibility
- Claude Code can use custom subagent presets from `.claude/agents/*.md`.
- Other coding agents may not support preset subagents.
- If preset subagents are unavailable, the orchestrator must use inline fallback instructions and file references.
- Inline fallback must reference:
  - `.agents/workflow/subagents/00_agent_roles.md`
  - the corresponding file under `.agents/workflow/prompts/`
- Orchestrator must choose execution mode per run:
  - `preset`: native preset subagent support is available and required preset exists.
  - `inline_fallback`: otherwise.
- Fallback spawn payload must include:
  - `role_id`
  - `role_file_ref`
  - `prompt_file_ref`
  - `objective_packet`
  - `required_tools`
  - `required_skills`
  - `done_criteria`
  - `execution_mode=inline_fallback`

## Language and output policy
- Write prompts in English.
- Reason in English.
- Final user-facing output must follow user language preference. If unclear, use Korean.
- Be polite and extremely concise.
- When writing in Korean, use polite honorific declarative endings such as `-합니다.` and avoid plain declarative style.
- Do not output emoji unless the user explicitly asks.
- If a diagram is required, use Mermaid. Never draw ASCII flowcharts.
- The policy applies to all output channels, including direct agent responses and external tool outputs (for example: Notion MCP, Linear MCP, GitHub Issues/PRs/comments).

## Writing quality policy
When writing docs, messages, or direct agent responses (Notion, Linear, Slack, GitHub Issues/PR/comments, and similar):
- Avoid generic AI-style phrasing, repetitive transitions, and padded summaries.
- Prefer concrete facts, direct decisions, and explicit constraints.
- Keep wording brief and specific.

## Absolute prohibitions
- Do not force push.
- Do not rely on arbitrary assumptions. If uncertainty remains after checking code/logs/history, ask the user unless autonomous mode is active.
- Do not directly edit generated files (`*.generated.ts`, `sonamu.generated.*`, `queries.generated.ts`, generated client artifacts).
- Do not claim deployment or migration execution unless the user explicitly instructed and confirmed.

## Commit message policy
- Follow scope-first bracket conventional commit style.
- Title format is mandatory: `[scope] type: short title`.
- For work in progress, use: `[scope] type(wip): short title`.
- `type` is required in every commit title.
- Do not include work-order stage tags in commit titles (for example: `(Phase 1)`, `(Wave 2)`).
- Commit messages must be written in Korean.
- `scope` may include multiple projects.
- Do not include sync-only or auto-generated file impacts in `scope`.
- If a change impacts the whole monorepo across multiple subprojects, use `[*]` as scope.
- Linear ticket IDs and PR numbers may be referenced in commit messages.
- Referencing Linear ticket IDs is recommended.
- Do not add any Co-Authored-By trailer to commits.

## Core workflow policy
- Planning-first execution is mandatory.
- Planning must be performed by spawning the `planner` sub-agent. Do not use the built-in Plan Mode (EnterPlanMode).
- The `planner` sub-agent must use Codex MCP by default for planning assistance unless Codex MCP is unavailable or encounters errors.
- Orchestrator manages the objective, decomposition, and delegation.
- Orchestrator must not directly edit code.
- Sub-agents are leaf workers and cannot spawn other sub-agents.
- Every spawned task must include:
  - Global objective.
  - Local objective.
  - Dependencies.
  - Parallelization constraints.
  - Done criteria.
- Use commit-sized, conflict-minimizing task units.

## Orchestrator topology policy
- Only the main agent (top-level conversation) can spawn sub-agents via the Task tool.
- Sub-agents spawned via Task tool cannot spawn further sub-agents.
- Therefore, the orchestrator role must always be assumed by the main agent itself. The orchestrator is never spawned as a sub-agent.
- When the user requests orchestrated execution, the main agent must:
  1. Read `.agents/agents/orchestrator.md` for role instructions.
  2. Read `.agents/workflow/prompts/07_orchestrator.md` for the canonical execution protocol.
  3. Assume the orchestrator role in the current conversation context.
  4. Spawn all other roles (planner, implementation-primary, reviewer, etc.) as sub-agents.
- The orchestrator preset file (`.agents/agents/orchestrator.md`) is a role-assumption document, not a spawnable sub-agent preset.
- All other preset files under `.agents/agents/` are spawnable sub-agent presets.

## Codex MCP human-in-the-loop policy
- Sub-agents that interact with Codex MCP must run as foreground sub-agents (not background). Background sub-agents cannot use `AskUserQuestion` and therefore cannot support this policy.
- Normal mode (`autonomous: false`): when a sub-agent uses Codex MCP and receives a response, do not auto-reply. Surface the response to the user via `AskUserQuestion`, wait for user input, then relay via `codex-reply`.
- Autonomous mode (`autonomous: true`): process Codex MCP responses automatically without user confirmation, relay via `codex-reply` immediately, and log interaction in `review_metadata`.
- This applies to all sub-agents that interact with Codex MCP, including the `planner` sub-agent.

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

## TypeScript type safety policy
- `as any` and `as unknown as T` are strictly prohibited in all TypeScript code unless the user explicitly requests it.
- Type errors must be resolved through proper typing: correct type annotations, generic constraints, type narrowing, or interface extension.
- If a third-party library's types are incomplete, use module augmentation or a local `.d.ts` declaration file instead of type casting.
- Sub-agents must be explicitly instructed about this policy in every implementation spawn.

## Code comment policy
- Only add comments where the logic is not self-evident. Keep comments concise.
- Do not use region-marker comments that label code sections (for example: `// ===== Section =====`, `// --- Region ---`, `/* ========== */`).
- Write comments in Korean honorific style.
- Comments must explain "why" and decision context, not restate code.
- Resolve comment-code mismatch immediately.
- Error handling must preserve root cause and include actionable context/hints.
- In `miomock-api` implementation classes (Model/Frame/Agent), prefer `this.logger` (logtape).
- Outside that scope, use `console.log` minimally.

## Tooling policy
- Prefer syntax-aware search/transform with `ast-grep` and `GritQL`.
- Do not default to plain-text grep/rg when structural matching is needed.
- For Web frontend tasks, Playwright MCP is required.
- For React tasks, use React best-practice skills.

## Validation policy
- Ensure monorepo root checks (lint/format) are included in plans.
- `pnpm check` (Biome) must pass at the workspace root and in each affected subproject.
- Ensure project-level build/test targets are included in plans.
- In backend/library work, include regression tests for non-obvious, high-risk behavior.
- Minimum Sonamu baseline:
  - after code changes: type check + build
  - before push: test pass

## Review policy
- Unit-level review: orchestrator spawns a separate, context-isolated reviewer sub-agent after each implementation unit completes. The reviewer receives only diff, `must_verify_behaviors`, and gate results.
- Review fast-path: trivial changes (<=30 lines, docs/formatting/config only, all gates pass) skip reviewer spawn.
- Branch-level review: after all units are integrated and clean, run Codex MCP full-branch review as the final quality gate.
- Run review/fix loop at each level until clean.
- Review priority order is mandatory:
  - bugs
  - requirement conformance
  - performance/security risk
- If review output is large, write review details to a temp file and pass only the file path to avoid context overflow.
- Prefer Codex MCP for planning and branch-level review when available and not overridden.
- Human-in-the-loop for Codex MCP: enforced in normal mode, exempted in autonomous mode.

## Hotfix policy
- Hotfix uses the same orchestration model as implementation:
  - Implement sub-agent(s) -> review sub-agent loop -> branch-level review loop -> user handoff.
- Hotfix sub-agents may escalate to Codex MCP for problem-solving when self-attempts stall:
  - Analysis delegation: root-cause investigation stalls -> delegate analysis to Codex MCP, apply result, continue fix.
  - Full task delegation: `self_attempt_count >= max_self_attempts` -> delegate the entire fix to Codex MCP.
  - Normal mode: ask user via `AskUserQuestion` before each delegation.
  - Autonomous mode (`autonomous: true` in `objective_packet`): delegate without user confirmation.
  - Codex MCP failure: do not block; resume self-attempt from the last known state.
  - Orchestrator sets `max_self_attempts` and `autonomous` in `objective_packet` when spawning hotfix units.
  - Full protocol: `.agents/workflow/prompts/06_codex_output_and_sessions.md` section `Problem-solving escalation session protocol`.

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
- Do not auto-update `AGENTS.md` when new ad-hoc instructions appear.
- Update per-agent memory instead, then inform the user.
- The user decides when to consolidate memory updates back into `AGENTS.md`.

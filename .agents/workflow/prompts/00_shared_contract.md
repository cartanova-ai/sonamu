# Prompt: Shared Workflow Contract

This contract is mandatory for every prompt under this template.

## Canonical references
1. Project root policy file: `../../../AGENTS.md`
2. Role and dispatch policy: `../subagents/00_agent_roles.md`
3. Review/session/long-output policy: `06_codex_output_and_sessions.md`

## Architecture policy
- Planning, Codex execution protocol, branch review, and orchestration must be implemented as prompts, not separate skills.
- Library/service quality gates are managed by prompts and AGENTS policies, not standalone skills.

## Language and output policy
- Prompts and internal reasoning are in English.
- Final output follows user language preference; if unclear, default to Korean.
- Output style is polite and extremely concise.
- Do not output emoji unless explicitly requested.
- Use Mermaid for diagrams. Never use ASCII flowcharts.
- When writing in Korean, use polite honorific declarative endings such as `-합니다.` and avoid plain declarative style.
- The Korean style rule applies to all output channels, including direct agent responses and external systems (for example: Notion MCP, Linear MCP, GitHub Issues/PRs/comments).

## Writing quality policy
For docs/messages/direct responses (Notion, Linear, Slack, GitHub, and similar):
- Avoid hype and inflated claims.
- Avoid vague attribution.
- Avoid repetitive template phrasing.
- Avoid unnecessary formatting noise.
- Prefer concrete, verifiable details.

## Code comment policy
- Add comments only where logic is not self-evident.
- Keep comments concise and decision-focused.
- Do not use section-label or region-marker comments (for example: `// ===== Section =====`, `// --- Region ---`, `/* ========== */`).

## Commit message policy
- Use scope-first bracket conventional commit format.
- Standard format: `[scope] type: short title`.
- Work-in-progress format: `[scope] type(wip): short title`.
- `type` is mandatory.
- Do not use work-order stage tags (for example: `(Phase 1)`, `(Wave 2)`).
- Commit messages must be written in Korean.
- Do not add any `Co-Authored-By` trailer to commits.
- `scope` may include multiple projects.
- Exclude sync-only and auto-generated file impacts when determining `scope`.
- If the change affects the whole monorepo across multiple subprojects, use `[*]` as `scope`.
- Linear ticket IDs and PR numbers may be referenced.
- Referencing Linear ticket IDs is recommended.

## Tooling policy
- Use `ast-grep` for syntax-aware search by default.
- Use `GritQL` for AST-based checks/transformations by default.
- Use plain-text `rg`/`grep` only for plain-text needs or explicit user request.

## Codex MCP policy
- For planning and code review, use Codex MCP as default when installed and available.
- If Codex MCP is unavailable, use the fallback path while preserving the same review contract.
- For Codex MCP interactions in sub-agents, enforce human-in-the-loop:
  - surface Codex MCP responses to user first
  - wait for user input
  - then relay via `codex-reply`

## Framework/runtime policy
- React: require React best-practice skills.
- React Native (Expo): require React + React Native + Expo skills.
- React Native runtime validation: emulator/simulator only. No physical devices.
- Web runtime validation: Playwright MCP required.

## Quality gate policy
- Apply common required gates and project-level overrides together.
- Common required gates include root `pnpm check` (Biome) and touched-project build/test.
- Carry override metadata via `gate_profile`.

## Review priority policy
- Review findings must be prioritized in this fixed order:
  - bugs
  - requirement conformance
  - performance/security risk

## Test-first policy
- For every implementation/fix unit, define `must_verify_behaviors`.
- Write tests for `must_verify_behaviors` first.
- Implement until those tests pass.

## Safety and operational boundaries
- Do not modify local databases directly. Read-only local DB access is allowed.
- Do not directly connect/read/write remote databases.
- Do not run mutating Terraform/AWS CLI operations. Read-only inspection is allowed.
- Do not deploy.
- Migration execution requires explicit user intervention.

## Agent topology policy
- The orchestrator role must be assumed by the main agent and is not spawnable as a sub-agent.
- Only the main agent (acting as orchestrator) can spawn sub-agents.
- All spawnable roles are leaf workers; nested spawning is forbidden.
- Decomposition requests from leaf workers must be escalated back to orchestrator.

## Implementation commit and review loop policy
- Implementation sub-agents must commit unit changes after required validation checks pass.
- Implementation sub-agents must run Codex MCP review (or fallback backend) and close all findings before returning.
- Unit handoff requires review closure evidence in `unit_execution_report`.

## Bug-fix routing policy
- Incident/hotfix bug fixes must use `prompts/04_hotfix.md`.
- Review-originated fixes must use `prompts/08_review_feedback_handler.md`.

## Future MCP integration
- Sonamu MCP and SocratsAI MCP are future integrations.
- Keep the current workflow unchanged until those MCPs are ready.

## Standard artifacts
- `bootstrap_context`
- `plan_document`
- `spawn_manifest`
- `objective_packet`
- `unit_execution_report`
- `unit_review_result`
- `branch_review_result`
- `feedback_resolution_log`
- `handoff_bundle`

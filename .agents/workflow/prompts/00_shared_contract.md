# Prompt: Shared Workflow Contract

This contract is mandatory for every prompt under `.agents/workflow/prompts/`.

## Canonical policy references (no duplication)

Use file-path references below as the single source of truth instead of repeating policy text in every prompt.

1. Global coding-agent policy:

- `../../../AGENTS.md`

2. Role/dispatch policy:

- `../subagents/00_agent_roles.md`

3. Review session and long-output policy:

- `06_codex_output_and_sessions.md`

## Required inheritance for all stage prompts

Every stage prompt must inherit from the canonical files above:

- language/output style policy
- writing quality policy
- commit message policy
- tooling policy
- safety and operational boundaries
- agent topology policy: orchestrator = main agent (not spawnable), all other roles = spawnable leaf workers
- language/output style policy across all output channels, including direct agent responses and external systems (Notion MCP, Linear MCP, GitHub Issues/PRs/comments)
- Codex MCP conditional usage policy: use Codex MCP by default for planning and full-branch review when available; unit-level review defaults to local reviewer, while inline/unit Codex review is allowed only when explicitly enabled per unit
- Codex MCP human-in-the-loop policy: normal mode requires user-mediated replies; autonomous mode auto-processes Codex replies and logs interaction metadata
- Codex MCP progress tracking policy: create a progress file before calling Codex MCP and include its path in the prompt so progress can be checked at any time
- Codex MCP problem-solving escalation policy: bug-fix paths may delegate analysis or full task to Codex MCP when self-attempts stall, with user confirmation in normal mode and automatic in autonomous mode; Codex failure always falls back to self-attempt
- implementation commit + review policy: implementation sub-agents always commit and return `unit_execution_report`; if inline Codex unit-review is explicitly enabled and available, implementation sub-agents may close unit review before returning; otherwise orchestrator runs context-isolated unit review and full-branch final review; fast-path may skip unit reviewer for trivial changes
- code comment policy: comments only where logic is not self-evident, no region-marker comments
- test-first policy for must-verify behaviors
- validation gate baseline: `pnpm check` (Biome) must pass at workspace root and in every affected subproject

Do not restate these shared policies in stage prompts unless role-specific exceptions are required.

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

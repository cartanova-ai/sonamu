# Prompt: Codex Output and Session Protocol

Follow `prompts/00_shared_contract.md`.

## Purpose
Standardize review requests/responses, session continuity, and long-output handling.

## Session policy
- Use one review session per unchanged review scope.
- Reuse existing session via reply when scope is unchanged.
- Start a new session only when scope changes materially (for example, unit -> full-branch).

## Default backend policy
- If Codex MCP is available and user did not override, use Codex MCP by default.
- If Codex MCP is not installed or unavailable, skip Codex MCP and use the configured fallback backend.
- Preserve the same review contract and output schema regardless of backend.

## Human-in-the-loop reply policy
- Sub-agents that interact with Codex MCP must run as foreground sub-agents (not background).
- Normal mode (`autonomous: false`):
  - When a sub-agent calls Codex MCP and receives a response, do not auto-reply.
  - Present the Codex MCP response to the user via `AskUserQuestion` and wait for user input.
  - After user input arrives, relay the user response via `codex-reply`.
- Autonomous mode (`autonomous: true`):
  - Process Codex MCP responses automatically without user confirmation.
  - Relay responses via `codex-reply` immediately.
  - Log the interaction in `review_metadata` for traceability.
- Apply this policy to all Codex MCP interactions in all sub-agents.

## Progress tracking policy
Codex MCP spawns a separate coding agent, so tasks may take a long time. The caller must create a progress file before calling Codex MCP and include its path in the prompt so Codex records progress there.

1. Create a progress file before calling Codex MCP.
```bash
progress_file=$(mktemp /tmp/codex-progress-XXXXXX.md)
```

2. Include the following instruction in the Codex MCP prompt.
```
Record your progress to ${progress_file}.
Update the file whenever you start or complete a major step.
```

3. The user or the calling agent may read the progress file at any time to check status.

4. Include `progress_file_path` in `review_metadata`.

## Problem-solving escalation session protocol
Bug-fix paths (`04_hotfix.md`, `08_review_feedback_handler.md`) may delegate problem-solving to Codex MCP when self-attempts stall. Two delegation types exist:

### Delegation types
| Type | Trigger | Codex receives | Agent role during Codex work |
|------|---------|---------------|------------------------------|
| Analysis delegation | Root-cause investigation stalls | Error logs, reproduction steps, hypotheses tried | Monitors progress file, applies Codex analysis result to continue fix |
| Full task delegation | `self_attempt_count >= max_self_attempts` | Full bug context + codebase references + prior attempt history | Monitors progress file, receives completed fix, runs validation |

### User confirmation policy
- Normal mode (`autonomous: false`): Before each delegation, ask the user via `AskUserQuestion` whether to proceed with Codex MCP delegation. Do not call Codex MCP without user approval.
- Autonomous mode (`autonomous: true`): Skip user confirmation and proceed with delegation immediately.
- The `autonomous` flag is provided in `objective_packet` by the orchestrator.

### Progress tracking for problem-solving sessions
Same pattern as review progress tracking, with distinct prefix:

```bash
progress_file=$(mktemp /tmp/codex-troubleshoot-XXXXXX.md)
```

Include the following instruction in the Codex MCP prompt:
```
Record your progress to ${progress_file}.
Log each analysis step, approaches tried, and intermediate findings.
```

The calling agent may read the progress file at any time to check Codex status.

### Codex MCP failure fallback
If Codex MCP call fails (timeout, connection error, not installed, or runtime error):
1. Do not block or retry indefinitely.
2. Log the failure reason.
3. Resume self-attempt from the last known state.
4. Record the failure in `unit_execution_report.troubleshoot_sessions`.

### Problem-solving session metadata
When a problem-solving delegation occurs, include in `unit_execution_report`:

```yaml
troubleshoot_sessions:
  - session_id: "..."
    type: analysis|full
    trigger: "root_cause_stall|max_attempts_exceeded"
    progress_file_path: "/tmp/codex-troubleshoot-..."
    result_file_path: "/tmp/codex-troubleshoot-result-..."
    outcome: resolved|failed|fallback_to_self
```

## Inline review request contract
Each review request must include:
- `scope_type`: `unit` or `full-branch`
- `target`: commit hash/range or branch
- `expected_behavior`
- `reviewer_priority_order`: `bugs -> requirement conformance -> performance/security`
- `large_output_instruction`: write full output to temp file and return only path when large

## Large output policy
Use temp files for long payloads/responses:

```bash
tmp_req=$(mktemp /tmp/codex-review-request-YYYYMMDDHHMMSS-XXXX.md)
tmp_res=$(mktemp /tmp/codex-review-response-YYYYMMDDHHMMSS-XXXX.md)
```

Return compact metadata in-context:

```yaml
review_metadata:
  scope: unit|full-branch
  session_id: "..."
  reused_or_new: reused|new
  result_file_path: "/tmp/..."
  progress_file_path: "/tmp/..."
  unresolved_count: <number>
  status: clean|needs_fix
```

## Local reviewer review contract

When the orchestrator spawns a local reviewer sub-agent for unit-level reviews:

### Context isolation requirement
- The reviewer sub-agent must receive only:
  - git diff of the unit changes
  - `must_verify_behaviors` list
  - test results and gate outputs
  - relevant `objective_packet` fields (`unit_objective`, `success_criteria`, `constraints`)
- The reviewer must NOT receive implementation reasoning or conversation history.

### Structured review checklist
The reviewer must evaluate each item and report pass/fail:
1. Every `must_verify_behavior` has a corresponding test.
2. Tests cover the declared behavior correctly (not vacuous).
3. No bugs: logic errors, off-by-one, null/undefined risks, race conditions.
4. Requirement conformance: implementation matches `unit_objective` and `success_criteria`.
5. No performance/security regressions: N+1 queries, unvalidated input, exposed secrets.
6. No generated file edits or policy violations per AGENTS.md.

### AST pre-scan
Before the reviewer sub-agent starts manual review, run automated pattern checks:
- `ast-grep` / `GritQL` for known anti-patterns in the diff
- Include pre-scan results in reviewer input as supplementary findings

### Findings format

```yaml
unit_review_result:
  unit_id: U-###
  backend: local-reviewer
  checklist:
    - item: "must_verify_behaviors coverage"
      status: pass|fail
      details: "..."
  findings:
    - id: F-###
      severity: high|medium
      category: bug|requirement|performance|security
      file: "..."
      line: <number>
      description: "..."
      suggestion: "..."
  unresolved_count: <number>
  status: clean|needs_fix
```

### Severity gate
- Report only `high` and `medium` severity findings.
- Do not report style, formatting, or naming nitpicks.
- Priority order: bugs -> requirement conformance -> performance/security.

## Review fast-path policy

Skip reviewer sub-agent spawn when ALL conditions are met:
- Total lines changed <= 30
- Changes are limited to: documentation, comments, formatting, typo fixes, config-only edits
- All automated gates (lint, type-check, test) pass

When fast-path applies:
- Record `review_loop.backend: fast-path` in `unit_execution_report`.
- Set `review_closed: true` without spawning reviewer.
- Proceed directly to branch-level integration.

## Downstream outputs
- `unit_review_result`
- `branch_review_result`
- `review_metadata`

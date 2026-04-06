# Prompt: Hotfix Protocol

Follow `prompts/00_shared_contract.md`.

## Purpose

Run hotfix execution with the same orchestration and review rigor as normal implementation, with tighter scope and urgency.

## Upstream inputs

- hotfix issue context
- `objective_packet` for hotfix unit(s)
- severity and user-impact summary

## Required behavior

0. This prompt is the dedicated bug-fix path for incident/hotfix work. Do not use review-feedback-handler for primary incident triage.
1. Keep unit scope minimal and conflict-safe.
2. Define `must_verify_behaviors` for the hotfix and add focused tests first.
3. Investigate root cause and apply minimal patch until those tests pass.
   - Track `self_attempt_count` starting from 1.
   - Each distinct fix attempt (modify code -> run tests -> observe failure) increments the count.
4. Run required checks:
   - `pnpm check` at monorepo workspace root
   - `pnpm check` in every affected subproject
   - common required gates
   - project-level override gates
5. Run unit-level review/fix loop to closure.
6. Run full-branch hotfix review/fix loop to closure.
7. Route review findings through `prompts/08_review_feedback_handler.md`.
8. For review, follow backend selection policy in `prompts/06_codex_output_and_sessions.md`:
   - unit-level: default local reviewer backend (Codex only when explicitly enabled and available)
   - full-branch: default Codex MCP backend when available, otherwise fallback local reviewer backend

## Codex MCP problem-solving escalation

Follow the session protocol in `prompts/06_codex_output_and_sessions.md` section `Problem-solving escalation session protocol`.

### Analysis delegation (during step 3)

If root-cause investigation stalls and the agent cannot form a confident hypothesis:

1. Check `autonomous` flag in `objective_packet`.
   - `false`: Ask user via `AskUserQuestion` whether to delegate analysis to Codex MCP.
   - `true`: Proceed without asking.
2. Create a progress file and call Codex MCP with: error logs, reproduction steps, hypotheses already tried.
3. Monitor the progress file during Codex execution.
4. On success: apply Codex analysis result and continue step 3 (patch -> test).
5. On Codex failure: resume self-analysis without blocking.

### Full task delegation (after step 3 threshold)

If `self_attempt_count >= max_self_attempts` (from `objective_packet`) and tests still fail:

1. Check `autonomous` flag in `objective_packet`.
   - `false`: Ask user via `AskUserQuestion` whether to delegate the entire fix to Codex MCP.
   - `true`: Proceed without asking.
2. Create a progress file and call Codex MCP with: full bug context, codebase references, all prior attempt history.
3. Monitor the progress file during Codex execution.
4. On success: receive the fix, run validation (step 4), then proceed to review loop (step 5).
5. On Codex failure: resume self-attempt from last known state without blocking.

## Runtime policy

- Web hotfix: Playwright MCP validation required when user-flow behavior changed.
- React Native hotfix: mobile-mcp validation on emulator/simulator only.

## Downstream output

- `unit_execution_report` for each hotfix unit
- `branch_review_result` for integrated hotfix branch
- final `handoff_bundle` via `prompts/05_user_review_handoff.md`

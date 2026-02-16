# Prompt: Hotfix Protocol

Follow `prompts/00_shared_contract.md`.

## Purpose
Run incident/hotfix bug-fix execution with the same rigor as normal implementation, with tighter scope and urgency.

## Upstream inputs
- hotfix issue context
- `objective_packet` for hotfix unit(s)
- severity and user-impact summary
- `must_verify_behaviors`
- `gate_profile`

## Required behavior
0. This prompt is the dedicated path for incident/hotfix bug fixes.
1. Keep unit scope minimal and conflict-safe.
2. Define `must_verify_behaviors` and add focused tests first.
3. Apply minimal patch until those tests pass.
4. Run required checks:
   - common required gates
   - project-level override gates
5. Run unit-level review/fix loop to closure.
6. Run full-branch hotfix review/fix loop to closure.
7. Route review findings through `prompts/08_review_feedback_handler.md`.
8. For review, use Codex MCP only when installed and available; otherwise use fallback backend.

## Runtime policy
- Web hotfix: Playwright MCP validation required when user-flow behavior changed.
- React Native hotfix: mobile-mcp validation on emulator/simulator only.

## Downstream output
- `unit_execution_report` for each hotfix unit
- `branch_review_result` for integrated hotfix branch
- final `handoff_bundle` via `prompts/05_user_review_handoff.md`

# Prompt: Codex Output and Session Protocol

Follow `prompts/00_shared_contract.md`.

## Purpose
Standardize review requests/responses, session continuity, and long-output handling.

## Session policy
- Use one review session per unchanged review scope.
- Reuse existing session via reply when scope is unchanged.
- Start a new session only when scope changes materially (for example, unit -> full-branch).

## Backend policy
- If Codex MCP is available and user did not override, use Codex MCP by default.
- If Codex MCP is unavailable, use fallback backend.
- Preserve the same review contract and output schema regardless of backend.

## Human-in-the-loop reply policy
- Sub-agents that interact with Codex MCP must run as foreground sub-agents (not background).
- When a sub-agent calls Codex MCP and receives a response, do not auto-reply.
- Present the Codex MCP response to the user via `AskUserQuestion` and wait for user input.
- After user input arrives, relay the user response via `codex-reply`.
- Apply this policy to all Codex MCP interactions in all sub-agents.

## Inline review request contract
Each review request must include:
- `scope_type`: `unit` or `full-branch`
- `target`: commit hash/range or branch
- `expected_behavior`
- `reviewer_priority_order`: `bugs -> requirement conformance -> performance/security`
- `large_output_instruction`: write full output to temp file and return only path when large

The reviewer must keep this priority order as a hard constraint.

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
  backend: codex-mcp|fallback
  session_id: "..."
  reused_or_new: reused|new
  result_file_path: "/tmp/..."
  unresolved_count: <number>
  status: clean|needs_fix
```

## Downstream outputs
- `unit_review_result`
- `branch_review_result`
- `review_metadata`

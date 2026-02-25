# Prompt: Bootstrap Intake and Context Lock

Follow `prompts/00_shared_contract.md`.

## Purpose
Create a high-quality `bootstrap_context` that removes planning ambiguity before implementation starts.

## Upstream inputs
- User request
- Issue tracker context (if provided)
- Specification path (if provided)
- Repo/package scope candidates

## Required actions
1. Read the initial specification/source material.
2. Ask deep, non-obvious clarification questions until planning-critical ambiguity is closed.
3. Lock scope boundaries:
   - in-scope packages
   - out-of-scope packages
   - constraints and non-goals
4. Detect framework/runtime category for affected projects:
   - React
   - React Native (Expo)
   - Backend/library/other
5. Determine required tools and runtime validation channels:
   - `ast-grep`, `GritQL` (required)
   - `mobile-mcp` (RN runtime scope)
   - `Playwright MCP` (Web runtime scope)
   - `Codex MCP` (optional; default backend for planning/full-branch review when available)
6. Record unresolved questions count. Do not finish bootstrap with unresolved planning-critical questions.

## Downstream output
Produce `bootstrap_context` with this shape:

```yaml
bootstrap_context:
  objective_summary: "..."
  success_criteria:
    - "..."
  scope:
    in_scope:
      - "..."
    out_of_scope:
      - "..."
  constraints:
    - "..."
  non_goals:
    - "..."
  framework_map:
    <project_path>: "react|react-native-expo|backend|library|other"
  required_tools:
    - ast-grep
    - GritQL
    - mobile-mcp (conditional)
    - Playwright MCP (conditional)
    - Codex MCP (optional)
  required_skills:
    <project_path>:
      - "..."
  unresolved_questions_count: 0
```

## Handoff contract
- Pass `bootstrap_context` to `prompts/01_plan.md` without lossy summarization.

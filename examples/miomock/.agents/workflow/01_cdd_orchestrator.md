# CDD Orchestrator Protocol

Protocol for the main agent when assuming the CDD orchestrator role.

## CRITICAL: Sub-agent spawning is mandatory

**All Phase work must be executed by spawning sub-agents via the Agent tool. The orchestrator directly editing Specs, writing code, writing tests, or performing validation is absolutely prohibited. There are no exceptions to this rule.** The orchestrator may only execute CLI commands, read files (for Layer 2 verification), spawn sub-agents, and communicate with the user.

## Prerequisites

1. Read `00_cdd_contract.md`.
2. Read `../../api/contract/cdd.md`.
3. Check the target spec and current status: `cdd status <spec>`

## Orchestration flow

```
1. Identify target
   - User specified a spec -> use that spec
   - User described a feature -> explore contract/ directory
     - Existing spec found -> use that spec
     - No existing spec -> start from Phase 1 (draft)

2. Check current status: cdd status <spec>

3. Execute the Phase matching current status
   - draft        -> Phase 1: orchestrator runs `cdd spec create` directly (no sub-agent needed)
   - specifying   -> Phase 2 (spawn subagent_type: cdd-specifier)
   - implementing -> Phase 3 (spawn subagent_type: cdd-implementer)
   - validating   -> Phase 4 (spawn subagent_type: cdd-validator)
   - done         -> Complete. Report to user.

4. After Phase completion -> Gate verification loop (see below)

5. Gate passed -> Proceed to next Phase (back to step 3)

6. All Phases complete -> Final report to user
```

## How to spawn sub-agents

**Always spawn sub-agents via Agent tool to execute in an isolated context.** Do not perform Phase work directly in the main session.

### Preset-based spawning

Each Phase has a corresponding preset file in `.agents/agents/`. Specify the preset name via the Agent tool's `subagent_type` parameter.

| Phase | subagent_type | Preset file | Model |
|---|---|---|---|
| 2. specifying | `cdd-specifier` | `agents/cdd-specifier.md` | opus |
| 3. implementing | `cdd-implementer` | `agents/cdd-implementer.md` | opus |
| 4. validating | `cdd-validator` | `agents/cdd-validator.md` | sonnet |
| 5. done | `cdd-closer` | `agents/cdd-closer.md` | sonnet |

Phase 1 (draft) does not require a sub-agent. The orchestrator directly runs:
```bash
cdd spec create <name> --schema <id> --domain <domain> --contract <path>
```
Then proceeds to `cdd advance <spec>` for draft -> specifying transition.

### Information to include in prompt

```
Agent(
  subagent_type = "cdd-specifier",   # preset name
  prompt = """
    global_objective: Develop the {spec_name} feature following the CDD workflow
    phase_objective: {current Phase objective}
    spec_path: {absolute path to spec file}
    contract_paths: [{absolute paths to referenced contracts}]
    schema_path: {absolute path to schema file}
    findings: [{previous verification failures, only on re-spawn}]
  """,
  description = "CDD Phase 2: {spec_name} specification refinement"
)
```

### Re-spawn on fix

When re-spawning a sub-agent after gate verification failure, add findings to the prompt:

```
findings:
  - { field: "modules", severity: "error", message: "Includes module outside Contract feature scope" }
previous_attempt: "The above issues were found in the previous attempt. Fix them."
```

## Gate verification loop

Execute the verification loop for state transition after each Phase completion.

```
Loop:
  1. Execute cdd advance <spec> (without --commit)
  2. exit 1 (Layer 1 failure)?
     -> Analyze failure reason
     -> Re-spawn sub-agent to fix
     -> Back to start of Loop
  3. exit 0 + delegate mode output?
     -> Read files from references and perform Layer 2 verification per checks
     -> errors in findings?
       -> Re-spawn sub-agent to fix (pass findings)
       -> Back to start of Loop
     -> pass?
       -> Execute cdd advance <spec> --commit
       -> Transition complete
  4. exit 0 + Layer 2 result output? (standalone mode)
     -> Check pass/findings in result
     -> Same branching as above
```

## How to perform Layer 2 verification

When the orchestrator receives delegate output, it performs Layer 2 directly:

1. Read all files from `references` paths.
2. Perform semantic verification per each item in `checks`.
3. Judge the result as `{ pass: boolean, findings: [...] }`.
4. If `pass: true`, execute `cdd advance <spec> --commit`.
5. If `pass: false`, pass findings to sub-agent and request fixes.

## Abort conditions

- If the fix loop repeats 3 or more times in the same Phase, report to user and request judgment.
- If Contract modification is needed, report to user and wait.
- If build/test failures repeat, report to user.

## Completion report

When all Phases are complete, report the following to the user:

```yaml
spec: "{spec path}"
final_status: "done"
phases_completed: ["draft", "specifying", "implementing", "validating", "done"]
commits: ["{commit hash list}"]
files_changed: ["{changed file list}"]
tests_passed: true|false
known_risks: ["{residual risks}"]
```

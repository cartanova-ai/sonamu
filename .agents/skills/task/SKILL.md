---
name: task
description: Coordinate normal code changes through Required Outcomes planning, test-first red verification, implementation, blind review, outcome review, and Sonamu documentation review. Use for feature work, behavioral changes, bug fixes requiring regression coverage, API or data changes, and any implementation task not explicitly assigned to task-inline.
---

# Task Workflow

The main session acts as the orchestrator. Only it may spawn agents. All agents
named below are leaf workers and must not spawn other agents.

## 1. Plan

Spawn `planner`. Provide the user request and relevant repository context.
Require this artifact:

```markdown
## Objective

One-sentence purpose.

## Required Outcomes

### Success
- Required successful results, or `None`.

### Failure
- Required failure results and forbidden side effects, or `None`.

### Guarantees
- Applicable integrity, atomicity, idempotency, authorization, duplicate
  prevention, compatibility, and preserved behavior, or `None`.

## Test Plan
- Tests mapped to outcomes and regression behavior.

## Implementation Context
- Likely production entry points, applicable skills, and documentation impact.

## Blockers
- None, or blocking questions.
```

Resolve blockers before continuing.

## 2. Write tests and verify red

Spawn `task-test-writer` with the plan. It owns test files only and performs red
verification as its final action.

Require its handoff to identify every production symbol, route, command, or
public entry point actually exercised by the new tests:

```markdown
status: red|green|blocked

tests_changed:
- path

production_symbols_under_test:
- symbol: exact symbol or public entry point
  source: production file or module
  exercised_by: test file and test name
  invocation: how the test reaches it

red_verification:
  command: exact command
  expected_failure: missing or incorrect production behavior
  observed_failure: concise actual failure

blockers:
- None, or exact blocker.
```

Read the changed tests and verify that this handoff matches them. Accept `red`
only when the test fails for the intended production behavior. `green` is valid
only during a review-fix pass after implementation. Compilation, fixture,
database, environment, and unrelated failures are `blocked`.

## 3. Implement

Spawn `task-implementer` with:

- User request and planner artifact
- Changed tests and red evidence
- Verified `production_symbols_under_test`
- Applicable repository and framework skills
- Findings when retrying

The implementer must satisfy the exact tested public entry points. It may choose
different internal helpers, but must not substitute another public method,
route, or command. It must not edit tests.

## 4. Review

Run each review in a fresh agent context.

1. Spawn `blind-reviewer` with only the base-to-current diff, `AGENTS.md`,
   directly related code and tests, and applicable skills. Do not provide the
   user request, plan, Required Outcomes, or implementation summary.
2. Spawn `outcome-reviewer` with the user request, Required Outcomes, Test Plan,
   diff, and related code and tests.
3. For Sonamu changes with possible public documentation impact, spawn
   `docs-reviewer` with the Required Outcomes, diff, relevant docs, and
   applicable Sonamu documentation skills.

Reviewers are read-only. They return only `clean`, `findings`, or `blocked` plus
grounded findings. They do not return praise, implementation summaries, or
general suggestions. Findings may use `high`, `medium`, or `low` severity.
Reserve `low` for concrete style, convention, or maintainability violations,
not subjective preferences.

## 5. Resolve findings

Route findings by ownership:

- Test coverage or assertion findings → `task-test-writer`
- Production or documentation findings → `task-implementer`
- Incorrect or ambiguous Required Outcomes → user

For a test finding after implementation, tell `task-test-writer` that it is a
review-fix pass. If the strengthened test is red, pass its updated symbol
handoff to `task-implementer`; if it is green, continue to review.

After any edit, rerun relevant validation and all applicable reviews from the
blind review onward. Continue until every applicable reviewer returns `clean`.
If a finding cannot be resolved safely or findings conflict, report `blocked`
and ask the user; never declare completion with findings remaining.

## 6. Handoff

Run the relevant final tests and package validation. Report only:

- Required Outcomes delivered
- Files changed
- Validation commands and results
- Review result
- Remaining blockers or risks

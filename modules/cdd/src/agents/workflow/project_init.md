# Sonamu Project Initialization Workflow

> For CDD execution protocol (Claim, AC, contract.md): read `.agents/workflow/01_cdd.md`.

Follow this workflow when the user requests a system to be built from scratch.

Command selection: use `mise run build`/`mise run check`/`mise run dev` only when the consumer has the current generated `mise.toml` and tasks; otherwise use that project's configured equivalent build, check, and dev commands. The mise commands below are current-generated-project examples.

**CRITICAL: Execute steps within each PHASE in order. Do not skip or reorder steps.** If the user specifies a starting point, begin from that PHASE (see SKILL.md "Starting Point Determination").

**CRITICAL: The dev server (for example, `mise run dev` in a current generated project) must always be running.** If it is not, start it before proceeding.

**CRITICAL: Use `pnpm sonamu test` for tests.** Use `pnpm test` only for CI or when the dev server is unavailable.

**CRITICAL: After each step, report results to the user and wait for confirmation before proceeding.** Do not continue multiple steps without user acknowledgment.

**CRITICAL: Even when requirements are already provided, always confirm system design and business logic with the user.**
Requirements are a starting point only. Entity structure, relationships, fields, state transitions, and permission rules must always be confirmed and approved by the user. Do not assume — ask.

---

## PHASE 0: Project Creation and Initial Setup

**Reference skills:** `sonamu-config`, `sonamu-auth`

### 1. Gather Requirements and Create Project

1. User provides requirements prompt
2. Load the applicable installed Sonamu skills, then create the project: `pnpm create sonamu [project-name] --yes`
3. Run `pnpm install`

### 2. Identify Domains

**CRITICAL: Do not proceed to auth generate or infrastructure setup before completing Steps 4–5.**

4. Analyze requirements and identify domains. Confirm each domain with the user one at a time.
   - Do not present everything at once — go domain by domain
   - Ask specifically: "Does this look right?"
5. Confirm the full domain list with the user. Domain-specific `*.contract.md` files will be written in PHASE 1.

### 3. Verify Configuration

**CRITICAL: Report verification results to the user and get approval before continuing. Do not skip on your own judgment.**

7. Check `sonamu.config.ts`: confirm `test.devRunner.enabled: true`. Set it to true if not.
8. Check `.env`:
   - Verify DB connection settings
   - Check whether `ANTHROPIC_API_KEY` is set → if not, instruct the user to add it manually (Claude Code must not input the key directly)
9. Report findings and wait for user approval

### 4. Initialize CDD and Contract

10. Run `pnpm cdd agents init` to set up CDD agent workflow and scaffold the contract directory:
    - Creates `.agents/` workflow prompts
    - Creates `contract/planning.md` (project overview template)
    - Creates `contract/rules/web.rules.json` and `contract/rules/api.rules.json` (starter rule files)

### 5. Start Infrastructure

11. Start Docker (`pnpm docker:up` or equivalent)
12. Attempt build — the first build may fail; do not try to fix everything immediately. Try starting the dev server first.
13. Start the dev server with the selected command (current generated project example: `mise run dev`)

### 6. Generate Auth Entities

**If plugins are needed, use the `--plugins` option and follow the installed `sonamu-auth` skill.**

14. Run `pnpm sonamu auth generate` to create better-auth entities
15. Add `"fixtureStrategy": "sequence"` to the `cone` of the `id` prop in the User entity
    - **This setting must not be changed later**
16. Review the generated entities (User, Session, Account, Verification) and ask the user to confirm in Sonamu UI
17. After user confirmation, run migration
18. Verify that tables were created in the Docker DB

### 7. Set Up Users Table Sequence

**CRITICAL: Run this immediately after auth entity migration completes. Skipping this will cause test and fixture generation failures later.**

19. Run `CREATE SEQUENCE users_id_seq;`
20. Run `ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq')::text;`

**Done criteria:**

- [ ] Project created
- [ ] Domain list identified and user-approved
- [ ] `pnpm cdd agents init` complete (`.agents/`, `contract/planning.md`, `contract/rules/` created)
- [ ] sonamu.config.ts and .env verified and user-approved
- [ ] Docker and dev server running
- [ ] Auth entities created and migrated
- [ ] Users table sequence configured

---

## PHASE 1: Domain Logic Documentation

**Reference skill:** `cdd`

**CRITICAL: Do not begin entity design (PHASE 2) until this PHASE is complete.**

### 7. Fill In `planning.md`

21. Open `contract/planning.md` (created by `cdd agents init` in PHASE 0)
22. Fill in the TODO sections with the user: project background, core domains, user roles, domain glossary, global business rules, tech stack, MVP scope
23. Confirm the completed document with the user

### 8. Write Domain `*.contract.md` Files

24. For each domain confirmed in PHASE 0, write `contract/{domain}/{domain}.contract.md`
    - Domain folder names in lowercase English (e.g., `auth`, `organization`, `research`)
    - Include domain rules, state transitions, permissions, edge cases, and decision rationale that cannot be inferred from code alone
    - Does not need to be perfect from the start — refine iteratively with the user
25. Confirm each domain's document with the user one at a time

### 9. Set Up Rules Files

26. Open `contract/rules/web.rules.json` and `contract/rules/api.rules.json` (created by `cdd agents init`)
27. Replace the placeholder example rules with actual project conventions as they become clear
28. Add `contract/rules/*.known-issues.json` files only when a recurring issue pattern is discovered during implementation — do not create them upfront

**`*.contract.md` format:**

```markdown
# {Domain} Business Logic

## Rules

- Rule and decision rationale

## Workflow

1. ...
```

**Done criteria:**

- [ ] `contract/planning.md` filled in and user-confirmed
- [ ] `contract/{domain}/{domain}.contract.md` written for all domains
- [ ] User confirmed each domain document
- [ ] `contract/rules/web.rules.json` and `contract/rules/api.rules.json` updated with initial conventions

---

## PHASE 2: Entity Design

**Reference skill:** `sonamu-entity`

**Prerequisite:** PHASE 1 complete (all domain `*.contract.md` files user-confirmed)

### 8. Design Entities

20. Design entities to match user requirements
    - Continuously confirm alignment with business logic with the user **in granular detail**
    - Confirm relationship types (BelongsToOne, HasMany, ManyToMany) with the user before proceeding
    - Confirm field composition, enum values, and nullable decisions with the user
    - **Ask the user whether any entity requires file attachments.** If yes, clarify:
      - Which entity will have file attachments?
      - How will file types (`file_type`) be categorized? (e.g., `task_order`, `result_report`)
      - Should status change automatically when a file is attached?
      - Use a separate File entity with `entity_type` + `entity_id`, or another approach?
21. Record the finalized design in `contract/architecture.md`

**Done criteria:**

- [ ] All entities designed and user-approved
- [ ] architecture.md recorded

---

## PHASE 3: Entity Creation and Migration

**Reference skills:** `sonamu-entity`, `sonamu-migration`

### 9. Create Entities

22. Create entity.json files in batch according to the design
23. Run the selected lint/format check (current generated project example: `mise run check`) and type check
24. Confirm the build succeeds without errors

### 10. Run Migration

25. Ask the user whether to run migration via Sonamu UI or CLI, then execute
26. Verify that the tables were created

### 11. Cone and Scaffolding

**Reference skill:** `sonamu-fixture`

**CRITICAL: Always generate Cone before Scaffolding. Without Cone, fixture generation will fail.**

27. Generate Cone (`pnpm sonamu cone gen --all`)
    - Must use LLM to generate context-appropriate cone based on requirements
    - Verify `ANTHROPIC_API_KEY` is set in `.env`. If not, inform the user.
    - Have the user confirm the generated cone
    - Follow the installed `sonamu-fixture` skill for detailed usage
28. Run Scaffolding — all of the following must be scaffolded:
    - model
    - model_test
    - view_list
    - view_search_input
    - view_form
    - Run via Sonamu UI or via Claude Code CLI
29. Confirm generation completes without errors
30. Run the selected lint/format check (current generated project example: `mise run check`) and type check
31. Confirm the build succeeds without errors
32. Run `pnpm dump` to generate a DB dump file

**Done criteria:**

- [ ] All entity.json files created
- [ ] Migration complete, DB tables confirmed
- [ ] Cone generated
- [ ] Scaffolding complete (model, model_test, view_list, view_search_input, view_form — all of them)
- [ ] lint/format check, type check, build all pass
- [ ] `pnpm dump` executed

---

## PHASE 4: Testing and API Implementation

**Reference skills:** `sonamu-testing`, `sonamu-naite`, `cdd`

### 12. Run CDD

- Concept definitions and execution protocol: `.agents/workflow/01_cdd.md`

Read the workflow document before starting.

**Done criteria:**

- [ ] All domain ACs defined (test skeletons exist in test files)
- [ ] All Claims executed
- [ ] All tests pass
- [ ] Full lint/format check, type check, and build pass

---

## PHASE 5: Fixture Generation

### 15. Generate Fixtures

42. Ask the user whether to generate fixtures
43. Check whether `cone.note` exists on all entity props
    - Report any props missing `cone.note` and ask whether to regenerate cone with `pnpm sonamu cone gen --use-llm`
    - `cone.note` is required for the LLM to generate contextually accurate fixture data
44. Confirm the minimum number of rows to generate (minimum 10, maximum 100)
45. **Generate better-auth entities first** (dependency order is mandatory):
    - Generate in order: User → Account → Session
    - `pnpm sonamu fixture gen --include User,Account,Session --count 10 --use-llm`
    - **CRITICAL**: `users_id_seq` must exist for User.id string PK (configured in PHASE 0 Steps 18–19)
    - Follow the installed `sonamu-auth` and `sonamu-fixture` skills for Better Auth fixture dependencies
46. After approval, generate fixtures per Claim (LLM required)
    - `--use-llm` is mandatory (domain context from `cone.note` must be reflected)
47. Ask the user to confirm data exists in the DB
48. **Re-run all tests with `pnpm sonamu test`**
49. Run `pnpm dump` to generate a DB dump file

**Done criteria:**

- [ ] `cone.note` presence check complete
- [ ] better-auth entities (User, Account, Session) generated first
- [ ] Fixture data generated (with user approval and `--use-llm`)
- [ ] Data confirmed in DB
- [ ] All tests pass
- [ ] `pnpm dump` executed

---

## PHASE 6: Frontend Development

**Reference skill:** `sonamu-frontend`

### 16. Plan Frontend

49. Ask the user whether to proceed with Frontend development
50. After approval, add Frontend development plan per domain to `contract/{domain}/{domain}.contract.md`, or confirm verbally with the user

### 17. Develop Frontend in Batches (repeat)

51. Proceed in small batches and **ask the user for confirmation** at each step
52. User reviews in the browser and gives feedback to Claude Code:
    - "Looks good"
    - "Logic works correctly"
    - "This part isn't working"
    - etc.

**Done criteria:**

- [ ] All batch Frontend implementation complete
- [ ] User confirmation and feedback incorporated

---

## Project Document Structure

The following documents are created during the workflow:

```
contract/
├── planning.md               # PHASE 1: project background, domains, roles, tech stack
├── architecture.md           # PHASE 2: entity design
├── {domain}/
│   └── {domain}.contract.md  # PHASE 1: domain rules + decision rationale (permanent)
└── rules/
    ├── web.rules.json        # PHASE 1: frontend conventions
    ├── api.rules.json        # PHASE 1: backend/API conventions
    └── *.known-issues.json   # PHASE 4+: add when recurring issues are found

tmp/claims/                   # PHASE 4: in-progress Claim YAML (discard after completion)
```

**Code is the ground truth.** `*.contract.md` records the rationale behind code decisions — it is not a spec that precedes the code. When code and `*.contract.md` conflict, the code takes precedence.

---

## Core Principles

1. **Dev server must always be running** — start it if it's down
2. **Use `pnpm sonamu test` for tests** — `pnpm test` is for CI
3. **Follow the order** — do not skip steps
4. **Ask the user frequently** — do not assume
5. **Work in Claim units** — do not do everything at once
6. **User-related entities always go first** — tests, API, and Frontend alike
7. **Code is ground truth** — `*.contract.md` records rationale; code wins on conflict
8. **New: contract → Claim → AC → implement. Change: code → Claim → update contract**

---
name: sonamu
description: Sonamu TypeScript full-stack framework development guide. Entity, Model, API, testing, and frontend integration. Use when developing with Sonamu framework.
---

# Sonamu Framework Skills

Claude Code skill for developing projects with the Sonamu framework.

## CRITICAL: Ask one question at a time

**MUST ask questions one at a time. NEVER overwhelm users with multiple questions.**

### MUST DO
- One question → wait for user response → next question
- Keep questions concise
- Present choices clearly when options are available

### NEVER DO
- List multiple questions at once
- Ask questions alongside long explanations
- Output a checklist of confirmation items all at once

---

## Development Flow

```
PHASE 0: Project creation and initial setup  (create project → identify domains → auth generate → Users sequence setup)
PHASE 1: Domain logic documentation          (write contract/{domain}/*.contract.md per domain → user confirmation)
PHASE 2: Entity design                       (design with user confirmation)
PHASE 3: Entity creation and migration       (entity.json + migration + cone + scaffolding)
PHASE 4: Testing and API implementation      (contract → Claim → AC → implement, repeat)
PHASE 5: Fixture generation                  (generate with LLM after user approval)
PHASE 6: Frontend development                (proceed in batches with user confirmation)
```

**Full details:** see `.claude/workflow/project_init.md`

### Starting Point Determination

**Begin from the PHASE that matches the user's instruction.** Do not always start from PHASE 0.

| User instruction | Starting PHASE | Prerequisites to verify |
|-----------------|----------------|------------------------|
| "Create a new project" | PHASE 0 | — |
| "Write contract" / "Analyze domain" | PHASE 1 | Domain list identified |
| "Add entity" / "Create entity" | PHASE 2 | Project exists, dev server running, read contract/**/*.contract.md, PHASE 1 complete |
| "Write tests" / "Implement API" | PHASE 4 | entity.json exists, migration complete, scaffolding complete |
| "Generate fixtures" | PHASE 5 | Tests passing, cone.note exists |
| "Develop frontend" | PHASE 6 | API implementation complete, contract/**/*.contract.md reviewed |

**Mid-entry rules:**
1. If `contract/**/*.contract.md` and `skills/project/architecture.md` exist, read them first.
2. Verify prerequisites for the target PHASE.
3. If prerequisites are not met, inform the user and begin from the required step.
4. Within a PHASE, follow the numbered steps in `.claude/workflow/project_init.md` in order. Do not skip any step or merge steps on your own judgment.

---

## Project Document System

### CRITICAL: Read these before starting any task

**Before starting any project task, always read the following documents.**

```
contract/
└── {domain}/
    └── {domain}.contract.md  # PHASE 1: domain rules + decision rationale (permanent; update alongside code changes)

.claude/skills/project/
└── architecture.md      # entity design + system architecture

tmp/claims/              # in-progress Claim YAML (discard after completion)
```

**Code is the ground truth.** `*.contract.md` records the rationale behind code decisions — it is not a spec that precedes the code. When code and `*.contract.md` conflict, the code takes precedence.

### Domain `*.contract.md`

Documents domain rules in a cohesive form and captures decision rationale that cannot be inferred from code alone.

```markdown
# {Domain} Business Logic

## Rules
- Refunds allowed only within 7 days of payment [Rationale: PG provider policy]
- Order status transitions: pending → confirmed → shipped → completed

## Workflow
1. ...
```

**Two development paths:**
- **New**: write `*.contract.md` → Claim → AC (test name) → implement (TDD)
- **Change**: modify code → register Claim → verify/update `*.contract.md` (record change rationale)

**Update rules:**
- When code changes, check affected domain rules and update `*.contract.md` together
- Record the reason and decision rationale — this keeps `*.contract.md` alive

### architecture.md

**When:** designing entities or discussing system architecture
**Content:** entity structure and relationships, database schema, system component structure

### Safe after compacting

Documents are persisted as files, so project context is preserved even when the conversation is compacted.

---

## Skills List

| Skill | File | Purpose |
|-------|------|---------|
| **CDD (AC+Claim-based development)** | `cdd.md` | **`*.contract.md` (domain rules), AC (test names), Claim (work instructions) — 3-artifact system** |
| Project creation | `create-sonamu.md` | create-sonamu CLI options |
| Project initialization | `project-init.md` | Project creation flow and conversation guide |
| Project configuration | `config.md` | .env, sonamu.config.ts settings |
| Database | `database.md` | DB setup, port conflict resolution, 3-Tier structure |
| Entity validation | `entity-validation-checklist.md` | Step-by-step entity creation checklist |
| Entity basics | `entity-basic.md` | Entity JSON structure, field types |
| Entity relations | `entity-relations.md` | BelongsToOne, HasMany, ManyToMany, FK code patterns |
| Subset | `subset.md` | Response field scope definition |
| Model | `model.md` | BaseModelClass, CRUD patterns |
| API | `api.md` | @api decorator |
| Puri | `puri.md` | SQL query builder |
| i18n | `i18n.md` | Internationalization, SD functions |
| Upsert | `upsert.md` | Batch saving of relation data |
| Testing | `testing.md` | Vitest tests (test/testAs), fixture generation tips |
| **DevRunner** | `testing-devrunner.md` | **sonamu test execution, HMR integration, parallel tests, sonamu.config.ts test settings** |
| **Naite** | `naite.md` | **Naite.t()/get() tracing system, chaining filters, trace CLI output** |
| **Cone** | `cone.md` | **Cone metadata generation and management (LLM/template)** |
| **Fixture CLI** | `fixture-cli.md` | **fixture gen/fetch/explore commands, 3-Tier DB usage** |
| Migration | `migration.md` | DB schema migration, PK type changes |
| Auth | `auth.md` | better-auth system (auto entity generation, Guards, Context) |
| Auth Migration | `auth-migration.md` | User.id type changes for external auth (e.g., better-auth) |
| **Auth Plugins** | `auth-plugins.md` | **better-auth plugin wrappers (admin, organization, 2fa, passkey, etc. — 10 types), snake_case mapping** |
| **Vector search** | `vector.md` | **pgvector embeddings (Voyage AI/OpenAI), chunking, hybrid search** |
| Puri query builder | `puri.md` | SELECT, WHERE, JOIN, FTS, pg_trgm fuzzy search, pgvector |
| **AI Agents** | `ai-agents.md` | **BaseAgentClass, @tools decorator, ToolLoopAgent, AsyncLocalStorage state** |
| **Tasks** | `tasks.md` | **Background workflows, cron scheduling, durable steps, retry policies** |
| **Skill contribution** | `skill-contribution.md` | **Troubleshooting → skill contribution workflow (matching, decision, format, approval)** |
| **Framework change** | `framework-change.md` | **Criteria for framework fix vs. project workaround. @upload parameter pattern** |
| Frontend | `frontend.md` | Service, TanStack Query |
| Scaffolding | `scaffolding.md` | Resolving UI scaffolding errors |

## Task-to-Skill Reference

**CRITICAL: When building a new system from scratch, start with `.claude/workflow/project_init.md`!**

| Task | Reference Skill |
|------|----------------|
| **Build an entire system from scratch** | **`.claude/workflow/project_init.md` (7-phase master guide)** |
| **Domain logic documentation / AC+Claim-based development** | **cdd.md** |
| Project creation | create-sonamu, project-init |
| Project configuration | config |
| Sonamu local dev setup | config |
| DB setup / port conflict | database, config |
| **3-Tier DB structure** | **database, fixture-cli** |
| **Cone metadata generation/management** | **cone** |
| Entity / field definition | entity-basic |
| Relationship setup | entity-relations |
| **BelongsToOne FK code usage** | **entity-relations** |
| API response field composition | subset |
| Data query / save logic | model, puri |
| API endpoints | api |
| Batch saving of relation data | upsert |
| Writing tests | testing |
| **Running tests (sonamu test)** | **testing-devrunner** |
| **Naite tracing / debugging** | **naite** |
| **Fixture data generation/management** | **fixture-cli** |
| **Test data generation tips** | **testing (Fixture data generation tips), fixture-cli (practical tips)** |
| DB schema changes | migration |
| **Auth setup (auth generate, Guards, Context)** | **auth** |
| PK type changes (better-auth, etc.) | auth-migration |
| **Adding auth plugins** | **auth-plugins** |
| Frontend development | frontend |
| Internationalization / translation | i18n |
| Scaffolding errors | scaffolding |
| **Vector search / embeddings** | **vector** |
| **pg_trgm Fuzzy Search** | **puri, entity-basic** |
| **AI Agent development** | **ai-agents** |
| **Background jobs / scheduling** | **tasks** |
| **Troubleshooting → skill contribution** | **skill-contribution** |
| **Framework bug / constraint response** | **framework-change** |

## Skill Selection by CDD Claim Type

**For Planners:** Use this table to populate `required_skills` in each Claim blueprint.

### `surface` — Entity / Schema / Shared Type Work

| Case | Required Skills |
|------|----------------|
| Add new entity | `entity-basic`, `entity-relations`, `migration`, `cone`, `fixture-cli`, `i18n` |
| Define subset | `entity-basic`, `subset` |
| Add auth entity | `auth`, `auth-migration` |
| Add auth plugin | `auth-plugins` |
| Add batch save structure | `upsert` |
| Add vector search structure | `vector`, `entity-basic` |
| Resolve scaffolding errors | `scaffolding` |

### `test` — Test Writing

| Case | Required Skills |
|------|----------------|
| Business logic tests | `testing`, `testing-devrunner` |
| Tests requiring fixtures | `testing`, `fixture-cli` |
| Debugging / tracing | `naite` |

### `implement` — Business Logic Implementation

| Case | Required Skills |
|------|----------------|
| Model CRUD implementation | `model`, `puri` |
| API endpoint implementation | `api`, `model` |
| File upload implementation | `api`, `framework-change` |
| SQL query writing | `puri` |
| Internationalization | `i18n` |
| Auth guard / session handling | `auth` |
| Auth plugin implementation | `auth-plugins` |
| Batch save implementation | `upsert`, `model` |
| AI Agent implementation | `ai-agents` |
| Background job / scheduling | `tasks` |
| Vector search implementation | `vector`, `puri` |
| Frontend integration | `frontend`, `scaffolding` |

---

## Command Execution Path

All `pnpm` commands are run from the **`packages/api`** directory.

```bash
cd packages/api
pnpm build
pnpm dev
pnpm sonamu migrate run
```

## Source Code References

- Sonamu framework: `sonamu/modules/sonamu/`
- Example project: `sonamu/examples/miomock/`
- Official docs: `sonamu/modules/docs/`
- create-sonamu: `sonamu/modules/create-sonamu/`

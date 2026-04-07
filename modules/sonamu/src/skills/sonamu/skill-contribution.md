---
name: sonamu-skill-contribution
description: Workflow for reflecting troubleshooting resolutions into skills. Covers existing skill matching, duplication check, format standards, and user approval gate. Use when a troubleshooting session concludes and the resolution should be captured as reusable knowledge.
---

# Troubleshooting → Skill Contribution Workflow

The process for capturing knowledge from a resolved troubleshooting session into skills.

---

## Triggers

| Trigger              | Owner | Example                                                                        |
| -------------------- | ----- | ------------------------------------------------------------------------------ |
| **Explicit request** | User  | "Document this in skills", "Record this fix"                                   |
| **Agent suggestion** | Agent | When a detection pattern below is met, propose: "Should I add this to skills?" |

### Agent detection patterns

Suggest contribution when the following flow is observed in the conversation:

1. **Error/failure → investigation → fix → success** pattern completes
2. The resolution reveals **internal framework behavior** or **undocumented constraints**
3. The same problem is **likely to occur in other projects or for other users**

Do not suggest when:

- Simple typos or missing imports
- Project-specific business logic bugs
- One-off environment issues (e.g., port conflict on a specific machine)

---

## Steps

```
[1] Extract  — summarize problem / cause / solution / source
[2] Match    — compare against existing skills
[3] Decide   — determine where to put it
[4] Draft    — write the content
[5] Approve  — get user confirmation
[6] Apply    — update or create the file
```

---

## [1] Extract

Summarize from the conversation using the following structure:

```yaml
symptom: "one-line description (error message or observed behavior)"
cause: "explanation of root cause"
solution: "resolution steps (include specific commands/code)"
source_paths: # related source file paths
  - "src/testing/dev-vitest-manager.ts"
tags: # keywords for matching
  - "testing"
  - "devrunner"
scope: "sonamu" # "sonamu" (framework-level) or "local" (project-specific)
```

### Scope decision criteria

| Condition                                                       | scope        |
| --------------------------------------------------------------- | ------------ |
| Relates to Sonamu framework behavior or constraints             | `sonamu`     |
| Relates to Sonamu CLI, config, migration, or shared tooling     | `sonamu`     |
| Relates to a specific project's business logic or configuration | `local`      |
| Unclear                                                         | Ask the user |

---

## [2] Match — Compare Against Existing Skills

**Always read existing skills first and check for duplication.** Creating a new file is a last resort.

### Match priority

| Priority | Method                  | Description                                                                    |
| -------- | ----------------------- | ------------------------------------------------------------------------------ |
| 1        | **Source paths**        | Check whether `source_paths` overlap with source references in existing skills |
| 2        | **Tags/keywords**       | Compare against each skill's YAML `description` and tags                       |
| 3        | **SKILL.md task table** | Cross-reference which task row maps to the problem domain                      |

### Source path → skill mapping (key paths)

| Source path pattern            | Corresponding skill                                        |
| ------------------------------ | ---------------------------------------------------------- |
| `src/testing/*`                | testing.md, testing-devrunner.md, naite.md, fixture-cli.md |
| `src/database/puri*`           | puri.md                                                    |
| `src/database/migrator*`       | migration.md                                               |
| `src/auth/*`                   | auth.md, auth-plugins.md, auth-migration.md                |
| `src/entity/*`, `src/syncer/*` | entity-basic.md, entity-relations.md                       |
| `src/vector/*`                 | vector.md                                                  |
| `src/ai/agents/*`              | ai-agents.md                                               |
| `src/naite/*`                  | naite.md                                                   |
| `src/cone/*`                   | cone.md                                                    |
| `src/api/*`                    | api.md                                                     |
| `src/template/*`               | framework-change.md                                        |
| `src/model/*`                  | model.md                                                   |
| `src/ssr/*`                    | (no skill — candidate for new file)                        |
| `sonamu.config.ts` related     | config.md                                                  |

If the path is not in this table, fall through to tag/keyword matching.

### Matching steps

1. Read the Skills list table in `SKILL.md`
2. Read candidate skill files (1–3 files)
3. Check whether **identical or similar content already exists** in those skills

---

## [3] Decide

| Match result                                           | Decision        | Description                                  |
| ------------------------------------------------------ | --------------- | -------------------------------------------- |
| **Same content exists** in an existing skill           | **SKIP**        | Report: "Already documented in {skill}.md"   |
| Match found + skill has **troubleshooting section**    | **APPEND**      | Add item to existing section                 |
| Match found + skill has **no troubleshooting section** | **ADD_SECTION** | Add a new troubleshooting section at the end |
| No match + scope=`sonamu`                              | **NEW_FILE**    | Create a new skill file (rare)               |
| No match + scope=`local`                               | **LOCAL**       | Create in `.claude/skills/local/`            |

**CRITICAL: APPEND and ADD_SECTION should account for the vast majority of cases.** NEW_FILE is only for when the content genuinely does not fit anywhere in the existing skills.

---

## [4] Draft — Format Standards

### Troubleshooting section format

Use the pattern from `testing-devrunner.md` as the standard:

```markdown
## Troubleshooting

### "Error message or one-line symptom"

→ Explanation of root cause
→ Fix: specific resolution (commands / code / config)
```

List multiple items as separate `###` entries.

### Example — APPEND

Adding to cone.md:

```markdown
### "pnpm sonamu cone gen --all fails with 'ANTHROPIC_API_KEY is not set'"

→ Key is missing from .env or was set only in root .env rather than packages/api/.env
→ Fix: add `ANTHROPIC_API_KEY=sk-ant-...` to `packages/api/.env`
```

### Example — ADD_SECTION

Adding a new section at the end of puri.md:

```markdown
---

## Troubleshooting

### "nullable field type inferred as non-null after leftJoin"

→ Puri type inference does not account for join direction. leftJoin results may be null at runtime but are not reflected as optional in the types.
→ Fix: explicitly mark the field as optional in the subset, or add a null check at the call site
```

### Example — LOCAL

`.claude/skills/local/kopri-deployment.md`:

```markdown
---
name: kopri-deployment
description: Deployment notes for the KOPRI project. Use when deploying KOPRI project.
---

# KOPRI Deployment Troubleshooting

## Troubleshooting

### "sharp package installation fails during Docker build"

→ Alpine image is missing native dependencies for sharp
→ Fix: add `RUN apk add --no-cache vips-dev` to Dockerfile
```

---

## [5] Approve — User Confirmation Gate

Show the user:

1. **Decision**: where to put it + one-line reason
2. **Content preview**: the markdown to be added or modified
3. **Approval request**

```
Decision: APPEND — adding troubleshooting entry to cone.md
Reason: source_paths match src/cone/; troubleshooting section already exists in cone.md

Content to add:
### "cone gen fails with 'No entity found'"
→ ...

Shall I apply this?
```

**Do not apply without approval.**

---

## [6] Apply

| Decision    | Action                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SKIP        | None                                                                                                                                   |
| APPEND      | Add `###` entry to the troubleshooting section in the skill                                                                            |
| ADD_SECTION | Add `## Troubleshooting` section + entry at the end of the skill (just before `## References` if it exists, otherwise at the very end) |
| NEW_FILE    | Create new .md file + **register in both tables in SKILL.md**                                                                          |
| LOCAL       | Create `.claude/skills/local/{name}.md`                                                                                                |

### ADD_SECTION insertion position

- If a `## References` section exists, insert **immediately before it**
- Otherwise, insert at the **very end** of the file

### NEW_FILE required actions

1. Create file in `skills/sonamu/`
2. Include YAML frontmatter (name, description)
3. Add a row to the "Skills List" table in `SKILL.md`
4. Add a row to the "Task-to-Skill" table in `SKILL.md`
5. If a related PHASE exists in `.claude/workflow/project_init.md`, add the new skill to its reference skills

---

## References

- **Skill list and structure**: `SKILL.md`
- **Agent rules**: `AGENTS.md`
- **Project-local skills**: `.claude/skills/local/`

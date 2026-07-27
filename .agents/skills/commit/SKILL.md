---
name: commit
description: Verify and commit the intended Sonamu repository changes using the required issue-aware message format. Use whenever the user asks to commit, create a commit, or invokes $commit.
---

# Commit

Create one scoped commit after a clean repository verification.

## 1. Inspect the commit scope

1. Run `git status --short --branch`.
2. Inspect staged and unstaged diffs, including untracked files.
3. Identify only the files belonging to the user's requested change.
4. Do not include unrelated existing changes. If unrelated changes are already
   staged and cannot be safely separated, stop and ask the user.
5. Stop if there is nothing to commit.

## 2. Resolve the issue number

Use an uppercase identifier matching `SON-[0-9]+`.

Resolve it in this order:

1. An issue number explicitly supplied in the user's current request.
2. A single issue number extracted from the current branch name.
3. A single issue number clearly established by the current task context.

Do not invent an issue number. If no unique issue can be established, or
credible sources conflict, stop and ask the user.

## 3. Resolve the repository label

1. Inspect the intended file paths and recent commit subjects.
2. Select the actual repository or package name represented by the change:
   - Root-wide or multi-package Sonamu changes → `[sonamu]`
   - `modules/sonamu` changes → `[sonamu]`
   - `examples/miomock` changes → `[miomock]`
   - Package-specific changes → its established name, such as `[docs]` or
     `[react-components]`
3. When implementation and its integration tests span multiple areas, use the
   primary implementation repository.
4. Never emit the literal placeholder `[repo]`. If the correct label remains
   ambiguous, stop and ask the user.

## 4. Verify

1. Read the root and nearest applicable `AGENTS.md` files and inspect the
   repository and affected package scripts.
2. Run the applicable test, check, and build commands for the repository root
   and every affected package. Use the narrowest commands that fully validate
   the intended commit.
3. Do not run installation, migration, fixture synchronization, deployment, or
   other state-changing operations as part of the commit workflow.
4. Stop without committing if any required test, check, or build fails.
5. Reinspect the worktree after validation and confirm every resulting change
   is intended before staging.

## 5. Stage and commit

1. Stage only the intended files using explicit paths.
2. Inspect `git diff --cached --stat` and `git diff --cached`.
3. Run `git diff --cached --check`.
4. Select the Conventional Commits type that matches the verified change.
   Common types include `feat`, `fix`, `refactor`, `perf`, `test`, `docs`,
   `build`, `ci`, `chore`, `style`, and `revert`.
5. Derive a concise message from the verified change and user context.
6. Commit with exactly this subject structure:

   ```text
   [<repository>] <type>(SON-XXX): message
   ```

7. Do not add trailers, amend another commit, bypass hooks, or push unless the
   user explicitly requests that separate action.

## 6. Confirm

After the commit, inspect the created commit and current worktree status. Report
the commit hash, subject, verification result, committed files, and any
remaining uncommitted changes.

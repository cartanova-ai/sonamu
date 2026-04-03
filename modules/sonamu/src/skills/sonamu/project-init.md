---
name: sonamu-project-init
description: Sonamu project creation and initialization. Check whether a project already exists before starting entity design. Use before entity design.
---

# Project Initialization

## Question Order When Entity Design Is Requested

**One question at a time, in order:**

```
0. Confirm working directory ← top priority
1. Check if project already exists
2. (If no project) Ask whether to create one
3. (If yes to create) Ask for project name
4. (If yes to create) Use defaults vs configure options
5. Run project creation
6. (If requirements provided) Document requirements ← important!
7. Review/customize configuration (see config.md)
8. → Proceed to entity-basic.md
```

---

## Documenting Requirements

**If the user provides requirements along with the project creation request, always document them.**

### Process

1. **Confirm project creation is complete**
   - `pnpm create sonamu` complete
   - `pnpm install` complete
   - Confirm `.claude/skills/project/` directory was auto-created

2. **Write requirements**
   ```bash
   # Write to .claude/skills/project/requirements.md
   ```

3. **Content to include**
   - Project overview
   - Core feature list
   - User role definitions
   - Key entity list
   - Business rules
   - Tech stack
   - Additional requirements

4. **Ongoing reference**
   - Refer to this document throughout all subsequent development
   - Maintain consistency during entity design, API development, and business logic implementation

### Example Scenario

```
User: "I want to build a research project management system.
       I need announcement, project, and evaluation management,
       with roles for admin, reviewer, and applicant."

Claude:
1. Confirm project path
2. Run "pnpm create sonamu research_system --yes"
3. Project creation complete
4. Write the following to .claude/skills/project/requirements.md:

---
# Research Project Management System

## Project Overview
A system for managing research project calls, applications, and evaluations

## Core Features
- Announcement management (create, edit, publish, close)
- Project application and management
- Evaluation process (reviewer assignment, evaluation form creation, score calculation)
- User permission management

## User Roles
- Admin: full system management, announcement creation, reviewer assignment
- Reviewer: write evaluation forms, assign scores
- Applicant: apply for projects, check progress

## Key Entities
- Announcement
- Project
- Evaluation
- User
- ...
---

5. Reference this document for consistent entity design going forward
```

### Important Notes

**Always document when:**
- The user provides requirements or a feature specification together with project creation
- There are business rules or special constraints

**When to document:**
- Immediately after project creation
- Before starting entity design

**How the document is used:**
- Reference during entity design
- Reference during API business logic implementation
- Reference when writing test cases
- Reference during frontend UI design

---

## 0. Confirm Working Directory

**Must confirm before creating a project:**

Developers often separate working directories by project type:
- Company/framework projects: `~/Development/`
- Personal projects: `~/dev/programming/`
- Client work: `~/Projects/clients/`

### Confirmation Process

1. **Determine the current working directory**
   ```bash
   pwd  # check current directory
   ```

2. **Ask the user to confirm**
   ```
   "You are currently in {current_directory}. Should I create the project here?
   If you work in a different location, please tell me the directory to create the project in.

   1. Create in current directory
   2. Specify a different directory"
   ```

3. **Handle each choice**

   **If option 1:**
   - Proceed directly in the current directory
   - Move to the next step (confirm project creation)

   **If option 2:**
   - "Please provide the directory path where you want to create the project."
   - After receiving the path: `cd {specified_path}`
   - Check whether the directory exists
   - If it doesn't exist: `mkdir -p {specified_path} && cd {specified_path}`
   - Move to the next step

### Example Conversation

```
User: "I want to build a survey system. Design the entities for me."

Claude: "You are currently in /Users/noa/Documents. Should I create the project here?
If you work in a different location, please tell me the directory to create the project in.

1. Create in current directory
2. Specify a different directory"

User: "2"

Claude: "Please provide the directory path where you want to create the project."

User: "/Users/noa/Development"

Claude: "Moving to /Users/noa/Development.

Is a Sonamu project already set up there?"
```

### Notes

- **Relative paths are accepted**: `~/Development`, `../projects`, etc.
- **Tilde (~) expansion**: home directory is expanded automatically
- **Path validation**: ask whether to create the directory if it doesn't exist
- **Working directory change**: all subsequent commands use the new path

---

## Full Process Details

### A. For Sonamu Developers (Local Link)

> **Why use a local link:**
> - Sync directly from the Skills source
> - Local Sonamu changes take effect immediately
> - Required for framework development

#### 1. Create the Project
```bash
pnpm create sonamu [project-name] --yes
```

See `create-sonamu.md` for CLI options.

#### 2. Set Up the Sonamu Link

Add to the `overrides` section of `pnpm-workspace.yaml`:

```yaml
overrides:
  sonamu: link:../../sonamu/modules/sonamu
```

> **Path example:**
> - If Sonamu is at `~/Development/sonamu`
> - And the project is at `~/Development/my_project`
> - → `link:../../sonamu/modules/sonamu`

#### 3. Install Dependencies and Build

From the project root:
```bash
pnpm install
pnpm -r build
```

> **If build fails:** may be a resource initialization failure. Start Docker first (step 4), then start the dev server (step 5) and retry.

#### 4. Start the DB
```bash
cd packages/api
pnpm docker:up
```

> If a port conflict error occurs → see `database.md`

#### 5. Start the Dev Server
```bash
pnpm dev
```

> If step 3 build failed, retry `pnpm -r build` from the project root after the dev server is running

> Sonamu UI: http://localhost:34900/sonamu-ui

#### 6. Generate Auth Entities (Separate Terminal)

In a separate terminal **while the dev server is running**:

```bash
cd packages/api
pnpm sonamu auth generate
```

> **Note:** Must run in dev mode for types files to be auto-generated as well

#### 7. Check Subsets

In the Sonamu UI (`http://localhost:34900/sonamu-ui`) Entity menu:
- Check subsets for User, Account, Session, Verification entities

#### 8. DB Migration

Run migrations from Sonamu UI

#### 9. Scaffolding

```bash
pnpm sonamu scaffold model User
pnpm sonamu scaffold model Account
pnpm sonamu scaffold model Session
pnpm sonamu scaffold model Verification
```

#### 10. Sync Skills (Optional)

If you need to sync from the Skills source:

```bash
cd packages/api
pnpm sonamu skills sync
```

`.claude/skills/sonamu/` will be created at the project root.

---

### B. For Sonamu Users (npm Version)

> **When using the npm version:**
> - Skills are included in the npm package
> - No local link needed
> - For general users

#### 1-3. Create and Configure the Project
```bash
pnpm create sonamu [project-name] --yes
cd [project-name]
pnpm install
pnpm -r build
```

> **If build fails:** Same as A step 3 - start Docker first, then start dev, then rebuild

#### 4-9. Same as A Steps 4-9

(Skills sync is not needed)

---

## Example Conversations

### DO - Correct Example

```
User: "I want to build a survey system. Design the entities for me."

Claude: "You are currently in /Users/noa/Documents. Should I create the project here?
If you work in a different location, please tell me the directory to create the project in.

1. Create in current directory
2. Specify a different directory"

User: "1"

Claude: "Is a Sonamu project already set up here?"

User: "No"

Claude: "Should I create a project with pnpm create sonamu?"

User: "Yes"

Claude: "What should the project name be? (e.g. survey_system)"

User: "survey_system"

Claude: "Should I create it quickly with defaults, or would you like to configure DB settings and other options yourself?
1. Create with defaults (--yes)
2. Configure options manually"

User: "1"

Claude: "Creating with the following command:
pnpm create sonamu survey_system --yes

Let me know if you need any additional configuration after creation."
```

### DO NOT - Incorrect Example

```
User: "I want to build a survey system. Design the entities for me."

Claude: "Before designing the survey system entities, let me confirm a few things.

1. Which directory should I create the project in?
2. Is a Sonamu project already set up?
3. What should the project name be?
4. Should I use defaults or configure options manually?"
```

**Why this is wrong:**
- Asking multiple questions at once (should ask one at a time)
- The question order is not clear

---

## Post-Creation Configuration

Items to confirm with the user after project creation:

### 1. Check .env

```
Claude: "The packages/api/.env file has been created. Would you like to review the default settings?"
```

Default generated .env:
```env
DB_HOST=0.0.0.0
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=1234
CONTAINER_NAME={project-name}-container
DATABASE_NAME={project-name}
PROJECT_NAME={project-name}
SESSION_SECRET={auto-generated}
SESSION_SALT={auto-generated}
```

### 1.5 Check for Leftover Template Defaults (CRITICAL)

Projects created with `pnpm create sonamu` contain placeholder values. **These must be replaced with real values.**

```bash
# Check: search for leftover default values
grep -r 'SonamuProject' packages/api/src/
```

**`packages/api/src/sonamu.config.ts`:**
```typescript
// DO NOT - template default left as-is
projectName: process.env.PROJECT_NAME ?? "SonamuProject"

// DO - replace with real project name
projectName: process.env.PROJECT_NAME ?? "NIFOS"
```

**Replacement checklist:**
- [ ] `projectName` default in `sonamu.config.ts`
- [ ] `name` field in `package.json` (root)
- [ ] `PROJECT_NAME`, `DATABASE_NAME` in `.env`
- [ ] `SESSION_SECRET`, `SESSION_SALT` in `.env` (must replace before going to production)

### 2. Check Whether Additional Configuration Is Needed

```
Claude: "Is there anything else you need to configure?
- Session security settings (for production)
- S3 file upload
- Change server port
- Nothing (proceed immediately)"
```

See `config.md` for configuration details for each item.

### 3. Proceed After Configuration

```
Claude: "Configuration is complete. Ready to proceed to the next step?

1. cd survey_system/packages/api
2. pnpm docker:up
3. pnpm dev
4. (separate terminal) pnpm sonamu auth generate"
```

---

## Checking an Existing Project

If the user says "I already have a project", ask for the path:

```
Claude: "Please tell me the project path."
```

After receiving the path, you can confirm by checking whether `packages/api/src/application/` exists.

---

## Handling Configuration Questions

When the user asks a configuration-related question, refer to `config.md` for the answer:

| Question | Reference |
|----------|-----------|
| "How do I configure .env?" | config.md - .env file |
| "How do I connect S3?" | config.md - server.storage |
| "How do I change the session settings?" | config.md - server.plugins.session |
| "How do I change the port?" | config.md - server.listen |
| "Cache settings?" | config.md - server.cache |

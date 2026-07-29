---
name: sonamu-init
description: Creates a new Sonamu project and wires it up. Use when running create-sonamu, linking a project to a local Sonamu checkout, or working through the first install, build, migrate, and scaffold sequence. Covers CLI options, pnpm-workspace overrides, and replacing template placeholder values.
---

# Sonamu Project Setup

## create-sonamu CLI

### Basic Usage

```bash
pnpm create sonamu [project-name]
```

### Quick Create (Recommended)

Use all options with default values:

```bash
pnpm create sonamu [project-name] --yes
```

### CLI Options

#### General Options

| Option          | Description                         | Default |
| --------------- | ----------------------------------- | ------- |
| `--yes`, `-y`   | Use all options with default values | -       |
| `--skip-pnpm`   | Skip pnpm install                   | false   |
| `--skip-docker` | Skip Docker setup                   | false   |
| `--pnpm y/n`    | Whether to install pnpm             | y       |
| `--docker y/n`  | Whether to configure Docker         | y       |

#### Docker/DB Options

| Option             | Description         | Default                    |
| ------------------ | ------------------- | -------------------------- |
| `--docker-project` | Docker project name | `[project-name]-docker`    |
| `--container-name` | Container name      | `[project-name]-container` |
| `--db-name`        | Database name       | `[project-name]`           |
| `--db-user`        | DB user             | `postgres`                 |
| `--db-password`    | DB password         | `1234`                     |

### Usage Examples

#### Quick create with defaults

```bash
pnpm create sonamu my_project --yes
```

#### Create without Docker

```bash
pnpm create sonamu my_project --skip-docker
```

#### Custom DB configuration

```bash
pnpm create sonamu my_project \
  --db-name my_db \
  --db-user admin \
  --db-password secret123
```

#### Fully custom

```bash
pnpm create sonamu my_project \
  --docker-project my-docker \
  --container-name my-container \
  --db-name my_database \
  --db-user postgres \
  --db-password 1234
```

### Generated Structure

```
[project-name]/
├── packages/
│   ├── api/
│   │   ├── src/
│   │   │   ├── application/   # Entity, Model, API
│   │   │   ├── migrations/
│   │   │   └── sonamu.config.ts
│   │   ├── database/
│   │   │   └── docker-compose.yml
│   │   └── .env
│   └── web/
│       └── src/
├── pnpm-workspace.yaml
└── package.json
```

### Next Steps After Creation

1. Start the DB container (if Docker was configured)

   ```bash
   cd [project-name]/packages/api/
   pnpm docker:up
   ```

   > If a port conflict error occurs → see `sonamu-config`

2. Sync Skills

   ```bash
   cd [project-name]/packages/api
   pnpm sonamu skills sync
   ```

   > Will fail if sonamu is an npm version. See "Sonamu Link Setup" below.

   To create a new **project-local** skill file (in `.agents/skills/local/`):

   ```bash
   pnpm sonamu skills create <name>
   ```

   This creates `.agents/skills/local/<name>.md` with a frontmatter skeleton. Use it to document project-specific conventions or troubleshooting notes that aren't appropriate for the shared Sonamu skills.

3. Start the dev server

   ```bash
   cd [project-name]/packages/api
   pnpm dev
   ```

4. Proceed to Entity design → see `sonamu-entity`

### Sonamu Link Setup

**Required for framework development, and the only way Skills sync works.**

The generated `packages/api/package.json` declares `"sonamu": "workspace:^"`. That resolves only
inside the Sonamu monorepo — a standalone project must redirect it to a local path.

#### How to set up

Two files must be changed together.

1. Add an `overrides` entry to the project root `pnpm-workspace.yaml`:

   ```yaml
   overrides:
     sonamu: link:../../sonamu/modules/sonamu
   ```

2. Declare a **published version** in `packages/api/package.json` — replace the template's
   `"sonamu": "workspace:^"`:

   ```json
   "dependencies": {
     "sonamu": "^0.10.5"
   }
   ```

Then run `pnpm install`, followed by `pnpm sonamu skills sync`.

**Do not put `link:` directly in `packages/api/package.json`.** Doing so gives sonamu and the
project separate `node_modules`, and mismatched shared dependencies (e.g. zod) produce build-time
type errors such as `TS2345`. See "Sonamu Local Development Environment Setup" in `sonamu-config` for
the full rationale.

#### Link path examples

| sonamu location           | Override value                             |
| ------------------------- | ------------------------------------------ |
| `~/Development/sonamu`    | `link:~/Development/sonamu/modules/sonamu` |
| Sibling of the project    | `link:../../sonamu/modules/sonamu`         |

#### npm version

Using sonamu from npm needs no link, and Skills are included in the package — but local framework
changes will not be reflected.

### Renaming the Project (when creating a new project)

After generating the project, you need to replace the "Sonamu" text in the frontend with your project name.

**4 files to update:**

1. **`packages/web/index.html`** - Browser tab title

```html
<title>{project-name}</title>
```

2. **`packages/web/src/routes/__root.tsx`** - TanStack Router head configuration (most important!)

```typescript
head: () => ({
  meta: [{ title: "{project-name}" }],
}),
```

**Important:** If you don't update `__root.tsx`, the title will revert to "Sonamu" on HMR!

3. **`packages/web/src/routes/index.tsx`** - Main page title

```tsx
<h1 className="text-2xl font-bold mb-4">Welcome to {project - name}</h1>
```

4. **`packages/web/src/components/Sidebar.tsx`** - Sidebar app name

```typescript
const title = isAdmin ? "Admin" : "{project-name}";
```

**How to verify:**

- Check that the project name is shown in the browser tab
- Confirm that the tab title does not change on file save via HMR (if it does, `__root.tsx` is missing)

---

## Initialization Sequence

An existing project can be identified by the presence of `packages/api/src/application/`.

### A. For Sonamu Developers (Local Link)

> **Why use a local link:**
>
> - Sync directly from the Skills source
> - Local Sonamu changes take effect immediately
> - Required for framework development

#### 1. Create the Project

```bash
pnpm create sonamu [project-name] --yes
```

See `sonamu-init` for CLI options.

#### 2. Set Up the Sonamu Link

Required — the generated `packages/api/package.json` declares `"sonamu": "workspace:^"`, which
cannot resolve outside the Sonamu monorepo. Both `pnpm-workspace.yaml` and
`packages/api/package.json` must be changed; see "Sonamu Link Setup" in `sonamu-init`.

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

> If a port conflict error occurs → see `sonamu-config`

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

`.agents/skills/sonamu-*/` will be created at the project root, one directory per skill.

---

### B. For Sonamu Users (npm Version)

> **When using the npm version:**
>
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

### Post-Creation Configuration

#### 1. Check .env

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

#### 2. Check for Leftover Template Defaults (CRITICAL)

Projects created with `pnpm create sonamu` contain placeholder values. **These must be replaced with real values.**

```bash
# Check: search for leftover default values
grep -r 'SonamuProject' packages/api/src/
```

**`packages/api/src/sonamu.config.ts`:**

```typescript
// DO NOT - template default left as-is
projectName: process.env.PROJECT_NAME ?? "SonamuProject";

// DO - replace with real project name
projectName: process.env.PROJECT_NAME ?? "NIFOS";
```

**Replacement checklist:**

- [ ] `projectName` default in `sonamu.config.ts`
- [ ] `name` field in `package.json` (root)
- [ ] `PROJECT_NAME`, `DATABASE_NAME` in `.env`
- [ ] `SESSION_SECRET`, `SESSION_SALT` in `.env` (must replace before going to production)

#### 3. Additional Configuration

Session security, S3 file upload, server port, and cache settings are all covered in `sonamu-config`.

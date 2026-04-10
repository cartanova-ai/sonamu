---
name: create-sonamu
description: pnpm create sonamu CLI option reference. Use when creating a new project.
---

# create-sonamu CLI

## Basic Usage

```bash
pnpm create sonamu [project-name]
```

## Quick Create (Recommended)

Use all options with default values:

```bash
pnpm create sonamu [project-name] --yes
```

## CLI Options

### General Options

| Option          | Description                         | Default |
| --------------- | ----------------------------------- | ------- |
| `--yes`, `-y`   | Use all options with default values | -       |
| `--skip-pnpm`   | Skip pnpm install                   | false   |
| `--skip-docker` | Skip Docker setup                   | false   |
| `--pnpm y/n`    | Whether to install pnpm             | y       |
| `--docker y/n`  | Whether to configure Docker         | y       |

### Docker/DB Options

| Option             | Description         | Default                    |
| ------------------ | ------------------- | -------------------------- |
| `--docker-project` | Docker project name | `[project-name]-docker`    |
| `--container-name` | Container name      | `[project-name]-container` |
| `--db-name`        | Database name       | `[project-name]`           |
| `--db-user`        | DB user             | `postgres`                 |
| `--db-password`    | DB password         | `1234`                     |

## Usage Examples

### Quick create with defaults

```bash
pnpm create sonamu my_project --yes
```

### Create without Docker

```bash
pnpm create sonamu my_project --skip-docker
```

### Custom DB configuration

```bash
pnpm create sonamu my_project \
  --db-name my_db \
  --db-user admin \
  --db-password secret123
```

### Fully custom

```bash
pnpm create sonamu my_project \
  --docker-project my-docker \
  --container-name my-container \
  --db-name my_database \
  --db-user postgres \
  --db-password 1234
```

## Generated Structure

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

## Next Steps After Creation

1. Start the DB container (if Docker was configured)

   ```bash
   cd [project-name]/packages/api/
   pnpm docker:up
   ```

   > If a port conflict error occurs → see `database.md`

2. Sync Skills

   ```bash
   cd [project-name]/packages/api
   pnpm sonamu skills sync
   ```

   > Will fail if sonamu is an npm version. See "Sonamu Link Setup" below.

   To create a new **project-local** skill file (in `.claude/skills/local/`):

   ```bash
   pnpm sonamu skills create <name>
   ```

   This creates `.claude/skills/local/<name>.md` with a frontmatter skeleton. Use it to document project-specific conventions or troubleshooting notes that aren't appropriate for the shared Sonamu skills.

3. Start the dev server

   ```bash
   cd [project-name]/packages/api
   pnpm dev
   ```

4. Proceed to Entity design → see `entity-basic.md`

## Sonamu Link Setup

**Skills sync only works when sonamu is referenced as a local link.**

### How to check

Check the sonamu dependency in `packages/api/package.json`:

```json
// ✓ Link reference (Skills sync possible)
"sonamu": "link:/path/to/sonamu/modules/sonamu"

// ✗ npm version (Skills sync not available)
"sonamu": "^0.7.47"
```

### How to change to a link

1. Change the sonamu version to a link in `packages/api/package.json`:

   ```json
   "dependencies": {
     "sonamu": "link:/path/to/sonamu/modules/sonamu"
   }
   ```

2. Run `pnpm install`

3. Run `pnpm sonamu skills sync` again

### Link path examples

| sonamu location           | Link path                                  |
| ------------------------- | ------------------------------------------ |
| `~/Development/sonamu`    | `link:~/Development/sonamu/modules/sonamu` |
| Same directory as project | `link:../../sonamu/modules/sonamu`         |

## Renaming the Project (when creating a new project)

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

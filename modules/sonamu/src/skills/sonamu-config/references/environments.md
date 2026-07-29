# Environments, Logging, Local Development

## Sonamu Local Development Environment Setup

**When is this needed:**

- When modifying the Sonamu framework source code during development
- When linking a local Sonamu repository to a project for development

**Problem:**

When linking Sonamu with pnpm link, type errors occur at build time:

```
error TS2345: Argument of type 'ZodNumber' is not assignable to parameter...
  Type '2' is not assignable to type '3'.
```

**Cause:**

- The linked Sonamu and the project each maintain their own `node_modules`
- TypeScript type mismatches occur due to different versions of shared dependencies (e.g. zod)
- TypeScript simultaneously references two different type definitions, causing errors

**Solution:**

### 1. Add override to pnpm-workspace.yaml

In the project root's `pnpm-workspace.yaml`:

```yaml
overrides:
  sonamu: link:../../sonamu/modules/sonamu
```

### 2. Specify published version in packages/api/package.json

```json
{
  "dependencies": {
    "sonamu": "^0.7.45" // specify the latest published version
  }
}
```

### 3. Run install

```bash
pnpm install
```

### 4. Verify build

```bash
cd packages/api
pnpm build
```

**How it works:**

- **TypeScript type check**: references type definitions from the npm registry based on the published version in `package.json`
- **Actual runtime**: `pnpm overrides` local link takes priority and runs local source code
- Separates type checking and runtime to resolve version mismatch issues

**Notes:**

- Changes to Sonamu source code are immediately reflected in the project
- Restarting the project is required after building Sonamu
- For general project development, using the npm version is recommended

---

## Environment-Specific Configuration

### Development Environment

```env
# packages/api/.env
DB_HOST=0.0.0.0
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=1234
DATABASE_NAME=myproject
PROJECT_NAME=myproject
```

### Production Environment

```env
# packages/api/.env.production
DB_HOST=your-rds-endpoint.amazonaws.com
DB_PORT=5432
DB_USER=produser
DB_PASSWORD=strong-password-here
DATABASE_NAME=myproject_prod
PROJECT_NAME=myproject

SESSION_SECRET=very-long-random-string-at-least-32-chars
SESSION_SALT=random16charstr!

AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_REGION=ap-northeast-2
S3_BUCKET=myproject-prod-bucket
```

---

## server Additional Options

### baseUrl

```typescript
server: {
  baseUrl: "https://api.example.com",  // external access URL (default: host:port)
}
```

### fastify

Pass Fastify server options directly (excluding `logger`).

### Full Plugin List

| Plugin      | Type                                 | Description                              |
| ----------- | ------------------------------------ | ---------------------------------------- |
| `compress`  | `boolean \| FastifyCompressOptions`  | Response compression (@fastify/compress) |
| `cors`      | `boolean \| FastifyCorsOptions`      | CORS configuration                       |
| `formbody`  | `boolean \| FastifyFormbodyOptions`  | x-www-form-urlencoded parsing            |
| `multipart` | `boolean \| FastifyMultipartOptions` | File upload                              |
| `qs`        | `boolean \| QsPluginOptions`         | Query string parsing                     |
| `session`   | session config                       | Session management                       |
| `sse`       | `boolean \| SsePluginOptions`        | Server-Sent Events                       |
| `static`    | `boolean \| FastifyStaticOptions`    | Static file serving                      |
| `custom`    | `(server: FastifyInstance) => void`  | Custom plugin registration function      |

## logging

Define logging configuration. Set to `false` to completely disable logging.

```typescript
logging: false,  // disable logging
// or
logging: {
  sinks: { /* define log output targets */ },
  filters: { /* define filters */ },
},
```

## slackConfirm

Activates a Slack-based approval process for production DB migrations.

```typescript
slackConfirm: {
  targets: ["production"],       // list of DB keys requiring approval
  botToken: process.env.SLACK_BOT_TOKEN ?? "",  // Slack Bot Token (xoxb-...)
  channelId: process.env.SLACK_CHANNEL_ID ?? "", // Slack Channel ID (C...)
},
```

---

## Post-Configuration Checklist

1. Confirm `.env` file is created
2. Start Docker: `pnpm docker:up`
3. Verify build: `pnpm build`
4. Start server: `pnpm dev`
5. Access Sonamu UI: http://localhost:34900/sonamu-ui

Before production deployment:

- [ ] Change `SESSION_SECRET`
- [ ] Change `SESSION_SALT`
- [ ] Change `cookie.domain` to the actual domain
- [ ] Configure S3 (if needed)
- [ ] Add error handling logic

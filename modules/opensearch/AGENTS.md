# modules/opensearch

`@sonamu-kit/opensearch`: OpenSearch transactional indexing and query integration for Sonamu.
Five entry points share one error catalogue (`src/errors.ts`); `src/definition/names.ts` owns every
schema, namespace, logical key, index, alias, and document ID rule.

## Boundaries

- No runtime import of `@opensearch-project/opensearch`, `knex`, or `pg` anywhere in `src`; clients
  and Knex instances are injected and SDK errors are classified structurally. Type-only imports are
  fine.
- Only `src/sonamu/**` may import `sonamu` at runtime. `sonamu` is an optional peer; the root,
  `/postgres`, `/admin`, and `/testing` entries must work without it.
- Factories are inert: no connection, timer, or schema access until an explicit operation or
  `start()`. `tests/unit/inert-factories.test.ts` and `tests/unit/dependency-graph.test.ts` enforce
  this; extend them when you add a factory or an entry point.
- New error types go into `src/errors.ts` (`SEARCH_ERROR_CODES` plus one class). Messages and
  `details` never carry document bodies, query bodies, or credentials.

## Validation

`tsc` resolves `sonamu` types from `modules/sonamu/dist`, so build it first once per checkout:
`mise exec -- pnpm --filter sonamu build:sonamu`.

- `mise exec -- pnpm --filter @sonamu-kit/opensearch check`
- `mise exec -- pnpm --filter @sonamu-kit/opensearch test:unit`
- `mise exec -- pnpm --filter @sonamu-kit/opensearch test:type`
- `mise exec -- pnpm --filter @sonamu-kit/opensearch test:integration` (Docker required; starts
  PostgreSQL and OpenSearch containers)
- `mise exec -- pnpm --filter @sonamu-kit/opensearch build`

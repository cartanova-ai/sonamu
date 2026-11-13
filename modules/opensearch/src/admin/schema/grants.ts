import { type Knex } from "knex";
import { z } from "zod";

import { DEFAULT_SEARCH_SCHEMA } from "../../definition/names";
import { SearchConfigurationError } from "../../errors";
import {
  executeSql,
  fragmentList,
  identifier,
  renderSql,
  schemaIdentifier,
  sql,
  type SqlFragment,
  statement,
  templatePlaceholder,
} from "../../postgres/sql";
import {
  assertSchemaUsable,
  parseOptions,
  schemaOptionFields,
  withSchemaTransaction,
} from "./migrations";

/** PostgreSQL role names per role group; an empty group gets no GRANT. */
export interface SearchRoleGrants {
  capture?: readonly string[];
  worker?: readonly string[];
  query?: readonly string[];
  admin?: readonly string[];
}

export interface SearchGrantsOptions {
  schema?: string;
  roles: SearchRoleGrants;
}

const ROLE_GROUPS = ["capture", "worker", "query", "admin"] as const;
type RoleGroup = (typeof ROLE_GROUPS)[number];

const roleListSchema = z.array(z.string()).readonly().optional();
const grantsOptionsSchema = z.strictObject({
  ...schemaOptionFields,
  roles: z.strictObject({
    capture: roleListSchema,
    worker: roleListSchema,
    query: roleListSchema,
    admin: roleListSchema,
  }),
});

const MAX_ECHOED_ROLE_LENGTH = 80;

function describeRole(role: string): string {
  return role.length > MAX_ECHOED_ROLE_LENGTH ? `${role.slice(0, MAX_ECHOED_ROLE_LENGTH)}…` : role;
}

type RoleFragments = { readonly [G in RoleGroup]: readonly SqlFragment[] };

function parseRoles(roles: SearchRoleGrants): RoleFragments {
  const seen = new Set<string>();
  const fragmentsOf = (group: RoleGroup): SqlFragment[] =>
    (roles[group] ?? []).map((role) => {
      if (role === "public" || role.startsWith("pg_")) {
        throw new SearchConfigurationError(
          { key: "grants.reservedRole", params: { role: describeRole(role) } },
          { details: { reason: "reserved-role" } },
        );
      }
      if (seen.has(role)) {
        throw new SearchConfigurationError(
          { key: "grants.duplicateRole", params: { role: describeRole(role) } },
          { details: { reason: "duplicate-role" } },
        );
      }
      seen.add(role);
      return identifier(role);
    });
  const parsed: RoleFragments = {
    capture: fragmentsOf("capture"),
    worker: fragmentsOf("worker"),
    query: fragmentsOf("query"),
    admin: fragmentsOf("admin"),
  };
  if (seen.size === 0) {
    throw new SearchConfigurationError(
      { key: "grants.noRoles" },
      { details: { reason: "no-roles" } },
    );
  }
  return parsed;
}

function concat(fragments: readonly SqlFragment[]): SqlFragment {
  return fragments.reduce((joined, fragment) => sql`${joined}${fragment}`, sql``);
}

export function renderGrants(s: SqlFragment, roles: RoleFragments): SqlFragment {
  const lines: SqlFragment[] = [];
  const all = fragmentList(ROLE_GROUPS.flatMap((group) => roles[group]));
  lines.push(sql`GRANT USAGE ON SCHEMA ${s} TO ${all};
GRANT SELECT ON ${s}.schema_versions, ${s}.store TO ${all};
`);
  if (roles.capture.length > 0) {
    const capture = fragmentList(roles.capture);
    lines.push(sql`GRANT SELECT ON ${s}.indexes, ${s}.targets TO ${capture};
GRANT UPDATE (lock_marker) ON ${s}.indexes TO ${capture};
GRANT SELECT, INSERT, UPDATE ON ${s}.documents, ${s}.deliveries TO ${capture};
`);
  }
  if (roles.worker.length > 0) {
    const worker = fragmentList(roles.worker);
    lines.push(sql`GRANT SELECT ON ${s}.indexes, ${s}.targets, ${s}.documents TO ${worker};
GRANT SELECT, DELETE ON ${s}.deliveries TO ${worker};
GRANT UPDATE (updated_at) ON ${s}.deliveries TO ${worker};
GRANT SELECT, INSERT, UPDATE, DELETE ON ${s}.delivery_runtime, ${s}.worker_heartbeats TO ${worker};
GRANT UPDATE (state, pause_reason, paused_at) ON ${s}.targets TO ${worker};
GRANT SELECT, INSERT, UPDATE ON ${s}.target_fences TO ${worker};
`);
  }
  if (roles.query.length > 0) {
    const query = fragmentList(roles.query);
    lines.push(sql`GRANT SELECT ON ${s}.read_heads, ${s}.targets TO ${query};
GRANT SELECT (namespace, definition, capture_epoch) ON ${s}.indexes TO ${query};
`);
  }
  if (roles.admin.length > 0) {
    const admin = fragmentList(roles.admin);
    lines.push(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ${s}.indexes, ${s}.targets, ${s}.read_heads, ${s}.admin_controls, ${s}.admin_operations,
  ${s}.documents, ${s}.deliveries, ${s}.delivery_runtime, ${s}.builds, ${s}.worker_heartbeats TO ${admin};
GRANT SELECT, INSERT, UPDATE, DELETE ON ${s}.target_fences TO ${admin};
GRANT UPDATE (store_id, origin_system_identifier, origin_database_oid, origin_database_name, origin_recorded_at, instance_name) ON ${s}.store TO ${admin};
`);
  }
  return concat(lines);
}

interface PreparedGrants {
  readonly schema: string;
  readonly grants: SqlFragment;
}

function prepare(options: SearchGrantsOptions): PreparedGrants {
  const parsed = parseOptions(grantsOptionsSchema, options);
  const schema = parsed.schema ?? DEFAULT_SEARCH_SCHEMA;
  return { schema, grants: renderGrants(schemaIdentifier(schema), parseRoles(parsed.roles)) };
}

export function renderSearchGrantsSql(options: SearchGrantsOptions): string {
  return renderSql(prepare(options).grants);
}

/** Runs the GRANTs in one transaction if the schema matches this package version exactly; nothing is revoked. */
export async function applySearchGrants(
  knex: Knex | Knex.Transaction,
  options: SearchGrantsOptions,
): Promise<void> {
  const { schema, grants } = prepare(options);
  await withSchemaTransaction(knex, { requireReadCommitted: false }, async (trx) => {
    await assertSchemaUsable(trx, schema);
    await executeSql(trx, statement(grants), "schema");
  });
}

export function renderGrantsTemplate(): string {
  return renderSql(
    renderGrants(templatePlaceholder("s"), {
      capture: [templatePlaceholder("capture")],
      worker: [templatePlaceholder("worker")],
      query: [templatePlaceholder("query")],
      admin: [templatePlaceholder("admin")],
    }),
  );
}

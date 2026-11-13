import { sql, type SqlFragment } from "../../postgres/sql";

// Changing this text changes the checksum and installed databases then report checksum-mismatch: add a version.
// delivery_runtime deliberately has no FK, so runtime writes take no hidden lock on intent rows.
export function renderSchemaV1(s: SqlFragment): SqlFragment {
  return sql`CREATE SCHEMA IF NOT EXISTS ${s};
REVOKE ALL ON SCHEMA ${s} FROM PUBLIC;

CREATE TABLE ${s}.schema_versions (
  version         integer     PRIMARY KEY CHECK (version >= 1),
  name            text        NOT NULL,
  checksum        text        NOT NULL,
  package_version text        NOT NULL,
  applied_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ${s}.store (
  singleton  boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
  store_id   uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO ${s}.store DEFAULT VALUES;

CREATE TABLE ${s}.indexes (
  namespace     text        NOT NULL CHECK (namespace  ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  definition    text        NOT NULL CHECK (definition ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  store_id      uuid        NOT NULL,
  generation    bigint      NOT NULL DEFAULT 1 CHECK (generation >= 1),
  capture_mode  text        NOT NULL DEFAULT 'active' CHECK (capture_mode IN ('active', 'suspended')),
  capture_epoch integer     NOT NULL DEFAULT 1 CHECK (capture_epoch >= 1),
  lock_marker   boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (namespace, definition)
) WITH (fillfactor = 50);

CREATE TABLE ${s}.targets (
  target_id                 uuid        PRIMARY KEY,
  namespace                 text        NOT NULL,
  definition                text        NOT NULL,
  physical_index            text        NOT NULL UNIQUE,
  write_alias               text        NOT NULL UNIQUE,
  fingerprint               text        NOT NULL,
  hash_version              text        NOT NULL,
  capture_epoch             integer     NOT NULL CHECK (capture_epoch >= 1),
  state                     text        NOT NULL CHECK (state IN ('creating', 'active', 'paused', 'retiring', 'retired', 'failed')),
  write_enabled             boolean     NOT NULL DEFAULT false,
  pause_reason              jsonb       NULL CHECK (pause_reason IS NULL OR octet_length(pause_reason::text) <= 4096),
  create_operation_id       text        NOT NULL,
  remote_create_state       text        NOT NULL DEFAULT 'not_started'
                            CHECK (remote_create_state IN ('not_started', 'in_flight', 'verified', 'ambiguous', 'abandoned')),
  remote_create_token       uuid        NULL,
  remote_create_attempts    integer     NOT NULL DEFAULT 0 CHECK (remote_create_attempts >= 0),
  remote_create_started_at  timestamptz NULL,
  remote_create_finished_at timestamptz NULL,
  verify_cursor             text        NULL,
  verify_started_at         timestamptz NULL,
  verify_completed_at       timestamptz NULL,
  verify_checked            bigint      NOT NULL DEFAULT 0,
  verify_violations         bigint      NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
  registered_at             timestamptz NULL,
  selected_at               timestamptz NULL,
  deselected_at             timestamptz NULL,
  deselect_confirmed_at     timestamptz NULL,
  paused_at                 timestamptz NULL,
  resumed_at                timestamptz NULL,
  retiring_at               timestamptz NULL,
  alias_removed_at          timestamptz NULL,
  index_deleted_at          timestamptz NULL,
  retired_at                timestamptz NULL,
  FOREIGN KEY (namespace, definition) REFERENCES ${s}.indexes (namespace, definition) ON DELETE RESTRICT,
  CHECK (physical_index <> write_alias),
  CHECK (NOT write_enabled OR state IN ('active', 'paused')),
  CHECK (state NOT IN ('active', 'paused') OR remote_create_state = 'verified')
);
CREATE INDEX targets_index_idx ON ${s}.targets (namespace, definition, capture_epoch);

CREATE TABLE ${s}.read_heads (
  namespace                   text        NOT NULL,
  definition                  text        NOT NULL,
  target_id                   uuid        NULL REFERENCES ${s}.targets (target_id),
  generation                  bigint      NOT NULL DEFAULT 0 CHECK (generation >= 0),
  rebuild_required            boolean     NOT NULL DEFAULT false,
  max_search_lifetime_ms      bigint      NOT NULL CHECK (max_search_lifetime_ms > 0),
  max_cursor_lifetime_ms      bigint      NOT NULL CHECK (max_cursor_lifetime_ms > 0),
  max_pit_keep_alive_ms       bigint      NOT NULL CHECK (max_pit_keep_alive_ms > 0),
  retirement_safety_margin_ms bigint      NOT NULL CHECK (retirement_safety_margin_ms > 0),
  updated_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (namespace, definition),
  FOREIGN KEY (namespace, definition) REFERENCES ${s}.indexes (namespace, definition) ON DELETE RESTRICT
);

CREATE TABLE ${s}.admin_controls (
  namespace        text        NOT NULL,
  definition       text        NOT NULL,
  operation_id     text        NULL,
  operation_kind   text        NULL,
  actor            text        NULL,
  lease_token      uuid        NULL,
  lease_expires_at timestamptz NULL,
  acquired_at      timestamptz NULL,
  heartbeat_at     timestamptz NULL,
  PRIMARY KEY (namespace, definition),
  FOREIGN KEY (namespace, definition) REFERENCES ${s}.indexes (namespace, definition) ON DELETE RESTRICT,
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);

CREATE TABLE ${s}.admin_operations (
  operation_seq bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id  text        NOT NULL,
  namespace     text        NOT NULL,
  definition    text        NOT NULL,
  kind          text        NOT NULL,
  actor         text        NOT NULL,
  reason        text        NOT NULL,
  target_id     uuid        NULL,
  build_id      uuid        NULL,
  outcome       text        NOT NULL CHECK (outcome IN ('started', 'succeeded', 'failed')),
  detail        jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(detail::text) <= 8192),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX admin_operations_index_idx ON ${s}.admin_operations (namespace, definition, operation_seq DESC);
CREATE INDEX admin_operations_operation_idx ON ${s}.admin_operations (operation_id);

CREATE TABLE ${s}.documents (
  namespace   text        NOT NULL,
  definition  text        NOT NULL,
  document_id text        COLLATE "C" NOT NULL CHECK (octet_length(document_id) BETWEEN 1 AND 512),
  revision    bigint      NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (namespace, definition, document_id),
  CONSTRAINT documents_revision_safe_integer CHECK (revision BETWEEN 1 AND 9007199254740991)
);

CREATE TABLE ${s}.deliveries (
  target_id        uuid        NOT NULL,
  document_id      text        COLLATE "C" NOT NULL,
  intent_id        uuid        NOT NULL DEFAULT gen_random_uuid(),
  desired_revision bigint      NOT NULL CHECK (desired_revision BETWEEN 1 AND 9007199254740991),
  enqueued_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (target_id, document_id)
);
CREATE INDEX deliveries_scan_idx ON ${s}.deliveries (target_id, enqueued_at, document_id);

CREATE TABLE ${s}.delivery_runtime (
  target_id            uuid        NOT NULL,
  document_id          text        COLLATE "C" NOT NULL,
  intent_id            uuid        NOT NULL,
  claimed_revision     bigint      NOT NULL DEFAULT 0,
  applied_revision     bigint      NOT NULL DEFAULT 0 CHECK (applied_revision >= 0),
  failure_revision     bigint      NOT NULL DEFAULT 0,
  attempts             integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  retry_age_ms         bigint      NOT NULL DEFAULT 0 CHECK (retry_age_ms >= 0),
  first_attempt_at     timestamptz NULL,
  quarantined_revision bigint      NULL,
  lease_token          uuid        NULL,
  lease_expires_at     timestamptz NULL,
  claim_started_at     timestamptz NULL,
  available_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  available_revision   bigint      NOT NULL DEFAULT 0,
  last_error           jsonb       NULL CHECK (last_error IS NULL OR octet_length(last_error::text) <= 2048),
  updated_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (target_id, document_id, intent_id),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);
CREATE INDEX delivery_runtime_lease_idx ON ${s}.delivery_runtime (lease_token) WHERE lease_token IS NOT NULL;
CREATE INDEX delivery_runtime_expiry_idx ON ${s}.delivery_runtime (target_id, lease_expires_at) WHERE lease_expires_at IS NOT NULL;
CREATE INDEX delivery_runtime_quarantine_idx ON ${s}.delivery_runtime (target_id, document_id) WHERE quarantined_revision IS NOT NULL;

CREATE TABLE ${s}.builds (
  build_id                 uuid        PRIMARY KEY,
  namespace                text        NOT NULL,
  definition               text        NOT NULL,
  kind                     text        NOT NULL CHECK (kind IN ('initial', 'rebuild', 'resume')),
  new_target_id            uuid        NOT NULL REFERENCES ${s}.targets (target_id),
  old_target_id            uuid        NULL REFERENCES ${s}.targets (target_id),
  expected_read_target_id  uuid        NULL,
  expected_read_generation bigint      NOT NULL,
  capture_epoch            integer     NOT NULL,
  phase                    text        NOT NULL CHECK (phase IN ('planned', 'created', 'backfilling', 'catching_up', 'serving', 'failed', 'retired')),
  scan_boundary            text        NULL,
  scan_cursor              text        NULL,
  scan_pages               bigint      NOT NULL DEFAULT 0,
  scan_documents           bigint      NOT NULL DEFAULT 0,
  scan_completed_at        timestamptz NULL,
  operation_id             text        NOT NULL,
  failure                  jsonb       NULL CHECK (failure IS NULL OR octet_length(failure::text) <= 2048),
  created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  cutover_at               timestamptz NULL,
  rolled_back_at           timestamptz NULL,
  closed_at                timestamptz NULL,
  FOREIGN KEY (namespace, definition) REFERENCES ${s}.indexes (namespace, definition) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX builds_one_open_idx ON ${s}.builds (namespace, definition)
  WHERE phase IN ('planned', 'created', 'backfilling', 'catching_up', 'serving');

CREATE TABLE ${s}.worker_heartbeats (
  worker_id    uuid        PRIMARY KEY,
  namespace    text        NOT NULL,
  capabilities text[]      NOT NULL,
  state        text        NOT NULL,
  started_at   timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_report  jsonb       NULL CHECK (last_report IS NULL OR octet_length(last_report::text) <= 4096)
);
CREATE INDEX worker_heartbeats_namespace_idx ON ${s}.worker_heartbeats (namespace, heartbeat_at);
`;
}

export function renderSchemaV2(s: SqlFragment): SqlFragment {
  return sql`ALTER TABLE ${s}.store
  ADD COLUMN origin_system_identifier text        NULL,
  ADD COLUMN origin_database_oid      bigint      NULL,
  ADD COLUMN origin_database_name     text        NULL,
  ADD COLUMN origin_recorded_at       timestamptz NULL,
  ADD COLUMN instance_name            text        NULL CHECK (instance_name IS NULL OR octet_length(instance_name) BETWEEN 1 AND 128);
ALTER TABLE ${s}.targets
  DROP CONSTRAINT targets_state_check,
  ADD CONSTRAINT targets_state_check CHECK (state IN ('creating', 'active', 'paused', 'retiring', 'retired', 'failed', 'detached')),
  ADD COLUMN detached_at timestamptz NULL;
CREATE TABLE ${s}.target_fences (
  target_id     uuid        PRIMARY KEY,
  epoch         bigint      NOT NULL DEFAULT 0 CHECK (epoch BETWEEN 0 AND 9007199254740990),
  nonce         uuid        NULL,
  pending_epoch bigint      NULL,
  pending_nonce uuid        NULL,
  pending_at    timestamptz NULL,
  renewed_at    timestamptz NULL,
  lost_at       timestamptz NULL,
  lost_detail   jsonb       NULL CHECK (lost_detail IS NULL OR octet_length(lost_detail::text) <= 1024),
  CHECK ((pending_epoch IS NULL) = (pending_nonce IS NULL) AND (pending_epoch IS NULL) = (pending_at IS NULL)),
  CHECK (pending_epoch IS NULL OR pending_epoch = epoch + 1)
);
CREATE INDEX targets_writable_idx ON ${s}.targets (namespace, definition, capture_epoch) WHERE write_enabled;
ALTER TABLE ${s}.deliveries SET (fillfactor=80, autovacuum_vacuum_scale_factor=0.01, autovacuum_vacuum_threshold=5000, autovacuum_analyze_scale_factor=0.005, autovacuum_analyze_threshold=1000);
ALTER TABLE ${s}.delivery_runtime SET (autovacuum_vacuum_scale_factor=0.01, autovacuum_vacuum_threshold=5000, autovacuum_analyze_scale_factor=0.005, autovacuum_analyze_threshold=1000);
ALTER TABLE ${s}.documents SET (fillfactor=80);
`;
}

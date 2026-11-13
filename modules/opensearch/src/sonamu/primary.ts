import { type Knex } from "knex";
import { DB } from "sonamu";

import { SearchConfigurationError } from "../errors";

/** Sonamu's DB.getDB("w"); refuses a transaction, since Knex ignores isolation and read-only options on nested ones. */
export function resolveSonamuPrimary(): Knex {
  let db: Knex;
  try {
    db = DB.getDB("w");
  } catch {
    throw new SearchConfigurationError(
      { key: "sonamu.notInitialized" },
      { details: { reason: "sonamu-not-initialized" } },
    );
  }
  if (db.isTransaction === true) {
    throw new SearchConfigurationError(
      { key: "sonamu.primaryIsTransaction" },
      { details: { reason: "primary-is-transaction" } },
    );
  }
  return db;
}

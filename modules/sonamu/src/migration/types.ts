import type { SonamuDBConfig } from "../database/db";
import type { GenMigrationCode } from "../types/types";

export type MigrationCode = {
  name: string;
  path: string;
};
export type ConnString = `${"mysql2"}://${string}@${string}:${number}/${string}`; // mysql2://account@host:port/database
export type MigrationStatus = {
  codes: MigrationCode[];
  conns: {
    name: string;
    connKey: keyof SonamuDBConfig;
    connString: ConnString;
    currentVersion: string;
    status: string | number;
    pending: string[];
  }[];
  preparedCodes: GenMigrationCode[];
};

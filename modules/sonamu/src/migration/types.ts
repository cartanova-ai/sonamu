import { type SonamuDBConfig } from "../database/db";
import { type GenMigrationCode } from "../types/types";

export type MigrationCode = {
  name: string;
  path: string;
};
export type ConnString = `${"pg"}://${string}@${string}:${number}/${string}`; // pg://account@host:port/database
export type MigrationStatus = {
  codes: MigrationCode[];
  conns: {
    name: string;
    connKey: keyof SonamuDBConfig;
    connString: ConnString;
    currentVersion: string | "error";
    status: number | "error";
    pending: string[];
  }[];
  preparedCodes: GenMigrationCode[];
  error?: string;
};

import { type SonamuDBConfig } from "../database/db";
import { type GenMigrationCode } from "../types/types";

export type MigrationCode = {
  name: string;
  path: string;
};
export type MigrationTarget = keyof SonamuDBConfig;
export type MigrationConnectionMeta = {
  connKey: MigrationTarget;
  name: string;
  host: string;
  port: number;
  database: string;
  remote: boolean;
  requiresApproval: boolean;
};
export type MigrationConnectionStatus = {
  connKey: MigrationTarget;
  currentVersion: string | "none" | "error";
  status: number | "error";
  pending: string[];
  latencyMs: number;
  error?: string;
};
export type MigrationAction = "shadow" | "apply" | "rollback";
export type MigrationProgressEvent =
  | {
      type: "target-start";
      action: MigrationAction;
      connKey: MigrationTarget | "shadow";
      files: string[];
    }
  | {
      type: "file-start" | "file-executed";
      action: MigrationAction;
      connKey: MigrationTarget | "shadow";
      file: string;
      index: number;
      total: number;
    }
  | {
      type: "target-complete";
      action: MigrationAction;
      connKey: MigrationTarget | "shadow";
      batchNo: number;
      files: string[];
    };
export type MigrationRunOptions = {
  /** 트랜잭션과 migration lock을 연장하지 않는 동기 observer입니다. */
  onProgress?: (event: MigrationProgressEvent) => void;
};
export type MigrationStreamEvent =
  | MigrationProgressEvent
  | { type: "complete"; result: import("./migrator").MigrationResult }
  | {
      type: "error";
      action: MigrationAction;
      message: string;
      connKey?: MigrationTarget | "shadow";
      file?: string;
      completedTargets: MigrationTarget[];
      pendingTargets: MigrationTarget[];
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

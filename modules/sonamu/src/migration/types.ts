import { GenMigrationCode } from "../types/types";

export type MigrationCode = {
  name: string;
  path: string;
};
export type ConnString =
  `${"mysql2"}://${string}@${string}:${number}/${string}`; // mysql2://account@host:port/database
export type MigrationStatus = {
  codes: MigrationCode[];
  conns: {
    name: string;
    connKey: string;
    connString: ConnString;
    currentVersion: string;
    status: string | number;
    pending: string[];
  }[];
  preparedCodes: GenMigrationCode[];
};
export type DBColumn = {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
};
export type DBIndex = {
  Table: string;
  Non_unique: number;
  Key_name: string;
  Seq_in_index: number;
  Column_name: string;
  Collation: string | null;
  Cardinality: number | null;
  Sub_part: number | null;
  Packed: string | null;
  Null: string;
  Index_type: string;
  Comment: string;
  Index_comment: string;
  Visible: string;
  Expression: string | null;
};
export type DBForeign = {
  keyName: string;
  from: string;
  referencesTable: string;
  referencesField: string;
  onDelete: string;
  onUpdate: string;
};

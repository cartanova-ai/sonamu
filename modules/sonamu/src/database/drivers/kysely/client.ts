import {
  ComparisonOperatorExpression,
  FileMigrationProvider,
  Kysely,
  Migrator,
  MysqlDialect,
  Transaction,
  sql,
} from "kysely";
import {
  Database,
  DatabaseClient,
  DriverSpec,
  KyselyConfig,
  WhereClause,
} from "../../types";
import _ from "lodash";
import { asArray } from "../../../utils/model";
import { createPool } from "mysql2";

type TB = keyof Database;
type TE = TB & string;

// 확장된 Transaction 타입 정의
export type ExtendedKyselyTrx = Transaction<Database> &
  DatabaseClient<"kysely">;

export class KyselyClient implements DatabaseClient<"kysely"> {
  private kysely: Kysely<Database>;

  private _config?: KyselyConfig;
  set config(config: KyselyConfig) {
    this._config = config;
  }
  get config() {
    if (!this._config) {
      throw new Error("SonamuDBConfig is not initialized");
    }
    return this._config;
  }

  get connectionInfo() {
    return {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
    };
  }

  private _qb?: DriverSpec["kysely"]["queryBuilder"];
  set qb(qb: DriverSpec["kysely"]["queryBuilder"]) {
    this._qb = qb;
  }
  get qb() {
    if (!this._qb) {
      throw new Error("QueryBuilder is not initialized");
    }
    return this._qb;
  }

  private _migrator?: Migrator;
  set migrator(migrator: Migrator) {
    this._migrator = migrator;
  }
  get migrator() {
    if (!this._migrator) {
      throw new Error("Migrator is not initialized");
    }
    return this._migrator;
  }

  get sql() {
    return this.qb.compile().sql;
  }

  constructor(config?: KyselyConfig, kysely?: Kysely<Database>) {
    if (config) {
      this.config = config;
    }

    const { onCreateConnection, migration, ...rest } = this.config;

    this.kysely =
      kysely ??
      new Kysely({
        dialect: new MysqlDialect({
          onCreateConnection,
          pool: createPool(rest),
        }),
      });

    this.migrator = new Migrator({
      db: this.kysely,
      provider: new FileMigrationProvider(migration as any),
    });
  }

  from(table: string) {
    this.qb = this.kysely.selectFrom(table as TB);
    return this;
  }

  innerJoin(table: string, k1: string, k2: string) {
    this.qb = this.qb.innerJoin(table as TB, k1 as TB, k2 as TB);
    return this;
  }

  leftJoin(table: string, k1: string, k2: string) {
    this.qb = this.qb.leftJoin(table as TB, k1 as TB, k2 as TB);
    return this;
  }

  clearSelect() {
    this.qb = this.qb.clearSelect();
    return this;
  }

  select(columns: string | string[]) {
    this.qb = this.qb.select(asArray(columns) as TE[]);
    return this;
  }

  where(ops: WhereClause | WhereClause[]) {
    if (typeof ops[0] === "string") {
      ops = [ops as WhereClause];
    }
    for (const [lhs, op, rhs] of asArray(ops)) {
      this.qb = this.qb.where(
        lhs as any,
        op as ComparisonOperatorExpression,
        rhs
      );
    }
    return this;
  }

  orWhere(ops: WhereClause | WhereClause[]) {
    this.qb = this.qb.where((eb) =>
      eb.or(
        ops.map(([lhs, op, rhs]) =>
          eb(lhs as any, op as ComparisonOperatorExpression, rhs)
        )
      )
    );
    return this;
  }

  async insert(table: string, data: any[]) {
    await this.kysely
      .insertInto(table as TB)
      .values(data)
      .execute();
  }

  async upsert(table: string, data: any[]) {
    const q = this.kysely
      .insertInto(table as TB)
      .values(data)
      .onDuplicateKeyUpdate(() => {
        const updates: Record<string, any> = {};
        // 첫 번째 레코드의 키들을 기준으로 업데이트 설정
        if (data[0]) {
          Object.keys(data[0]).forEach((key) => {
            updates[key] = sql`VALUES(${sql.raw(key)})`; // VALUES 구문 사용
          });
        }
        return updates;
      });
    await q.execute();
  }

  limit(limit: number) {
    this.qb = this.qb.limit(limit);
    return this;
  }

  offset(offset: number) {
    this.qb = this.qb.offset(offset);
    return this;
  }

  count(column: string, alias?: string) {
    this.qb = this.qb.select((eb) =>
      eb.fn.count(column as any).as(alias ?? column)
    );
    return this;
  }

  distinct(column: string) {
    this.qb = this.qb.distinctOn(column as any);
    return this;
  }

  first() {
    this.qb = this.qb.limit(1);
    return this;
  }

  async execute(trx?: ExtendedKyselyTrx): Promise<any[]> {
    if (trx) {
      const { rows } = await trx.executeQuery(this.qb.compile());
      return rows as any[];
    }
    return this.qb.execute();
  }

  async pluck(column: string): Promise<any[]> {
    const result = await this.execute();
    return result.map((row) => row[column]);
  }

  createRawQuery(query: string, bindings?: any[]) {
    if (bindings?.length) {
      query = query.replace(
        /\?/g,
        () => sql.lit(bindings.shift()).compile(this.kysely).sql
      );
    }
    return sql.raw(query).compile(this.kysely).sql;
  }

  async raw<R>(query: string, bindings?: any[]): Promise<R[]> {
    if (bindings?.length) {
      query = query.replace(
        /\?/g,
        () => sql.lit(bindings.shift()).compile(this.kysely).sql
      );
    }
    const { rows } = await sql.raw(query).execute(this.kysely);
    return rows as R[];
  }

  async truncate(table: string) {
    await sql`truncate table ${sql.table(table)}`.execute(this.kysely);
  }

  trx<T>(callback: (trx: KyselyClient) => Promise<T>) {
    return this.kysely
      .transaction()
      .execute(async (trx) => callback(new KyselyClient(undefined, trx)));
  }

  destroy() {
    return this.kysely.destroy();
  }

  clearQueryParts(parts: ("order" | "offset" | "limit")[]) {
    for (const part of parts) {
      switch (part) {
        case "order":
          this.qb = this.qb.clearOrderBy();
          break;
        case "offset":
          this.qb = this.qb.clearOffset();
          break;
        case "limit":
          this.qb = this.qb.clearLimit();
          break;
      }
    }
    return this;
  }

  clone() {
    const client = new KyselyClient(this.config);
    client.qb = this.qb;
    return client;
  }

  // Migrator

  async getMigrations() {
    const result = await this.migrator.getMigrations();
    return result.filter((r) => !r.executedAt).map((r) => r.name);
  }

  async status() {
    const pendings = await this.getMigrations();
    return 0 - pendings.length;
  }

  async migrate() {
    const { results, error } = await this.migrator.migrateToLatest();
    if (error) {
      throw error;
    }

    return [0, results?.map((r) => r.migrationName)];
  }

  async rollback() {
    const { results, error } = await this.migrator.migrateDown();
    if (error) {
      throw error;
    }

    return [0, results?.map((r) => r.migrationName)];
  }

  async rollbackAll() {
    while (true) {
      const { error, results } = await this.migrator.migrateDown();

      if (error) {
        console.error("Error while rollbackAll:", error);
        throw error;
      }

      if (!results || results.length === 0) {
        console.log("RollbackAll completed");
        break;
      }
    }
  }
}

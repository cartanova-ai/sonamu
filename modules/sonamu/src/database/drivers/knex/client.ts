import knex, { Knex } from "knex";
import { DatabaseClient, KnexConfig, WhereClause } from "../../types";
import { asArray } from "../../../utils/model";
import _ from "lodash";
import { KnexGenerator } from "./generator";

// 확장된 Transaction 타입 정의
export type ExtendedKnexTrx = Knex.Transaction & DatabaseClient<"knex">;

export class KnexClient implements DatabaseClient<"knex"> {
  private knex: Knex;
  generator: KnexGenerator = new KnexGenerator();

  private _config?: KnexConfig;
  set config(config: KnexConfig) {
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
      host: this.knex.client.config.connection?.host ?? "localhost",
      port: this.knex.client.config.connection?.port ?? 3306,
      database: this.knex.client.config.connection?.database ?? "",
      user: this.knex.client.config.connection?.user ?? "",
      password: this.knex.client.config.connection?.password ?? "",
    };
  }

  private _qb?: Knex.QueryBuilder;
  set qb(qb: Knex.QueryBuilder) {
    this._qb = qb;
  }
  get qb() {
    if (!this._qb) {
      throw new Error("QueryBuilder is not initialized");
    }
    return this._qb;
  }

  get sql() {
    return this.qb.toQuery();
  }

  constructor(_config?: KnexConfig, _knex?: Knex) {
    if (_config) {
      this.config = _config;
      this.knex = knex(this.config);
    } else if (_knex) {
      this.knex = _knex;
    } else {
      throw new Error("Either config or knex instance must be provided");
    }
  }

  from(table: string): KnexClient {
    this.qb = this.knex.from(table);
    return this;
  }

  innerJoin(table: string, k1: string, k2: string) {
    this.qb = this.qb.innerJoin(table, k1, k2);
    return this;
  }

  leftJoin(table: string, k1: string, k2: string) {
    this.qb = this.qb.leftJoin(table, k1, k2);
    return this;
  }

  clearSelect() {
    this.qb = this.qb.clearSelect();
    return this;
  }

  select(columns: string | string[]) {
    this.qb = this.qb.select(asArray(columns));
    return this;
  }

  where(ops: WhereClause | WhereClause[]) {
    if (typeof ops[0] === "string") {
      ops = [ops as WhereClause];
    }
    for (const [lhs, op, rhs] of asArray(ops)) {
      this.qb = this.qb.where(lhs, op, rhs);
    }
    return this;
  }

  orWhere(ops: WhereClause | WhereClause[]) {
    this.qb = this.qb.orWhere((qb) => {
      for (const [lhs, op, rhs] of asArray(ops)) {
        qb.andWhere(lhs, op, rhs);
      }
    });
    return this;
  }

  async insert(table: string, data: any[]) {
    await this.knex(table).insert(data);
  }

  async upsert(table: string, data: any[]) {
    const q = this.knex(table).insert(data);
    const updateFields = Array.isArray(data) ? Object.keys(data[0]) : data;
    await q.onDuplicateUpdate.apply(q, updateFields);
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
    this.qb = this.qb.count(alias ? `${column} as ${alias}` : column);
    return this;
  }

  distinct(column: string) {
    this.qb = this.qb.distinct(column);
    return this;
  }

  first() {
    this.qb = this.qb.limit(1);
    return this;
  }

  async execute(trx?: ExtendedKnexTrx): Promise<any[]> {
    if (trx) {
      return this.qb.transacting(trx);
    }
    return this.qb;
  }

  async pluck(column: string): Promise<any[]> {
    return this.qb.pluck(column);
  }

  createRawQuery(query: string, bindings?: any[]) {
    if (bindings?.length) {
      return this.knex.raw(query, bindings).toQuery();
    }
    return this.knex.raw(query).toQuery();
  }

  async raw<R>(query: string, bindings?: any[]): Promise<R[]> {
    if (bindings?.length) {
      return (await this.knex.raw(query, bindings))[0];
    }
    return (await this.knex.raw(query))[0];
  }

  async truncate(table: string) {
    await this.knex(table).truncate();
  }

  trx(callback: (trx: KnexClient) => Promise<any>) {
    return this.knex.transaction((trx) =>
      callback(new KnexClient(undefined, trx))
    );
  }

  destroy() {
    return this.knex.destroy();
  }

  clearQueryParts(parts: ("order" | "offset" | "limit")[]) {
    this.qb = parts.reduce((acc, part) => acc.clear(part), this.qb.clone());
    return this;
  }

  clone() {
    const client = new KnexClient(undefined, this.knex);
    client.qb = this.qb.clone();
    return client;
  }

  // Migrator

  async getMigrations() {
    const [, result] = (await this.knex.migrate.list()) as [
      unknown,
      {
        file: string;
        directory: string;
      }[],
    ];

    return result.map((r) => r.file.replace(".js", ""));
  }

  async status() {
    return this.knex.migrate.status();
  }

  async migrate() {
    return this.knex.migrate.latest();
  }

  async rollback() {
    return this.knex.migrate.rollback();
  }

  async rollbackAll() {
    return this.knex.migrate.rollback(undefined, true);
  }
}

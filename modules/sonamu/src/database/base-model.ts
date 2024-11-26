// base-model.ts
import { DateTime } from "luxon";
import _ from "lodash";
import SqlParser from "node-sql-parser";
import chalk from "chalk";
import inflection from "inflection";
import { BaseListParams } from "../utils/model";
import { DBPreset, DriverSpec, DatabaseDriver } from "./types";
import { SubsetQuery } from "../types/types";
import { getTableName, getTableNamesFromWhere } from "../utils/sql-parser";
import { DB } from "./db";

export abstract class BaseModelClassAbstract<D extends DatabaseDriver> {
  public modelName: string = "Unknown";

  protected abstract applyJoins(
    qb: DriverSpec[D]["adapter"],
    joins: SubsetQuery["joins"]
  ): DriverSpec[D]["adapter"];
  protected abstract executeCountQuery(
    qb: DriverSpec[D]["queryBuilder"]
  ): Promise<number>;

  abstract getDB(which: DBPreset): DriverSpec[D]["core"];
  abstract destroy(): Promise<void>;

  async runSubsetQuery<T extends BaseListParams, U extends string>({
    params,
    baseTable,
    subset,
    subsetQuery,
    build,
    debug,
    db: _db,
    optimizeCountQuery,
  }: {
    subset: U;
    params: T;
    subsetQuery: SubsetQuery;
    build: (buildParams: {
      qb: DriverSpec[D]["queryBuilder"];
      db: DriverSpec[D]["core"];
      select: SubsetQuery["select"];
      joins: SubsetQuery["joins"];
      virtual: string[];
    }) => DriverSpec[D]["queryBuilder"];
    baseTable?: DriverSpec[D]["table"];
    debug?: boolean | "list" | "count";
    db?: DriverSpec[D]["core"];
    optimizeCountQuery?: boolean;
  }): Promise<{
    rows: any[];
    total?: number;
    subsetQuery: SubsetQuery;
    qb: DriverSpec[D]["queryBuilder"];
  }> {
    const db = _db ?? DB.getDB(subset.startsWith("A") ? "w" : "r");
    const dbClient = DB.toClient(db);
    baseTable =
      baseTable ?? inflection.pluralize(inflection.underscore(this.modelName));
    const queryMode =
      params.queryMode ?? (params.id !== undefined ? "list" : "both");

    const { select, virtual, joins, loaders } = subsetQuery;
    const _qb = build({
      qb: dbClient.from(baseTable).qb,
      db,
      select,
      joins,
      virtual,
    });
    dbClient.qb = _qb;
    const qb = dbClient;

    const total = await (async () => {
      if (queryMode === "list") return undefined;

      const clonedQb = qb
        .clone()
        .clearQueryParts(["order", "offset", "limit"])
        .clearSelect()
        .select(`${baseTable}.id`);
      const parser = new SqlParser.Parser();

      if (optimizeCountQuery) {
        const parsedQuery = parser.astify(clonedQb.sql);
        const tables = getTableNamesFromWhere(parsedQuery);
        const needToJoin = _.uniq(
          tables.flatMap((table) =>
            table.split("__").map((t) => inflection.pluralize(t))
          )
        );

        this.applyJoins(
          clonedQb,
          joins.filter((j) => needToJoin.includes(j.table))
        );
      } else {
        this.applyJoins(clonedQb, joins);
      }

      const parsedQuery = parser.astify(clonedQb.sql);
      const q = Array.isArray(parsedQuery) ? parsedQuery[0] : parsedQuery;

      if (q.type !== "select") {
        throw new Error("Invalid query");
      }

      const countColumn = `${getTableName(q.columns[0].expr)}.${q.columns[0].expr.column}`;
      clonedQb.clearSelect().count(countColumn, "total").first();
      if (q.distinct) {
        clonedQb.distinct(countColumn);
      }

      if (debug === true || debug === "count") {
        console.debug("DEBUG: count query", chalk.blue(clonedQb.sql));
      }

      const [{ total }] = await clonedQb.execute();
      return total;
    })();

    const rows = await (async () => {
      if (queryMode === "count") return [];

      let listQb = qb;
      if (params.num !== 0) {
        listQb = listQb
          .limit(params.num!)
          .offset(params.num! * (params.page! - 1));
      }

      listQb.select(select);
      listQb = this.applyJoins(listQb, joins);

      if (debug === true || debug === "list") {
        console.debug("DEBUG: list query", chalk.blue(listQb.sql));
      }

      let rows = await listQb.execute();
      rows = await this.useLoaders(dbClient, rows, loaders);
      return this.hydrate(rows);
    })();

    return {
      rows,
      total,
      subsetQuery,
      qb: dbClient.qb,
    };
  }

  async useLoaders(
    db: DriverSpec[D]["adapter"],
    rows: any[],
    loaders: SubsetQuery["loaders"]
  ): Promise<any[]> {
    if (loaders.length === 0) return rows;

    for (const loader of loaders) {
      const fromIds = rows.map((row) => row[loader.manyJoin.idField]);

      if (!fromIds.length) continue;

      let subRows: any[];
      let toCol: string;

      if (loader.manyJoin.through === undefined) {
        // HasMany
        const { subQ, col } = await this.buildHasManyQuery(db, loader, fromIds);
        subRows = await subQ.execute();
        toCol = col;
      } else {
        // ManyToMany
        const { subQ, col } = await this.buildManyToManyQuery(
          db,
          loader,
          fromIds
        );
        subRows = await subQ.execute();
        toCol = col;
      }

      if (loader.loaders) {
        subRows = await this.useLoaders(db, subRows, loader.loaders);
      }

      // Group and assign loaded rows
      const subRowGroups = _.groupBy(subRows, toCol);
      rows = rows.map((row) => {
        row[loader.as] = (subRowGroups[row[loader.manyJoin.idField]] ?? []).map(
          (r) => _.omit(r, toCol)
        );
        return row;
      });
    }

    return rows;
  }

  protected async buildHasManyQuery(
    db: DriverSpec[D]["adapter"],
    loader: SubsetQuery["loaders"][number],
    fromIds: any[]
  ) {
    const idColumn = `${loader.manyJoin.toTable}.${loader.manyJoin.toCol}`;
    let qb = db.from(loader.manyJoin.toTable);

    db.where([idColumn, "in", fromIds]).select([...loader.select, idColumn]);
    qb = this.applyJoins(qb, loader.oneJoins);

    return {
      subQ: qb,
      col: loader.manyJoin.toCol,
    };
  }

  protected async buildManyToManyQuery(
    db: DriverSpec[D]["adapter"],
    loader: SubsetQuery["loaders"][number],
    fromIds: any[]
  ) {
    if (!loader.manyJoin.through)
      throw new Error("Through table info missing for many-to-many relation");

    const idColumn = `${loader.manyJoin.through.table}.${loader.manyJoin.through.fromCol}`;
    let qb = db.from(loader.manyJoin.through.table);

    const throughTable = loader.manyJoin.through.table;
    const targetTable = loader.manyJoin.toTable;

    qb = this.applyJoins(qb, [
      {
        join: "inner",
        table: targetTable,
        as: targetTable,
        from: `${throughTable}.${loader.manyJoin.through.toCol}`,
        to: `${targetTable}.${loader.manyJoin.toCol}`,
      },
    ]);

    qb.where([idColumn, "in", fromIds]).select([...loader.select, idColumn]);
    qb = this.applyJoins(qb, loader.oneJoins);

    return {
      subQ: qb,
      col: loader.manyJoin.through.fromCol,
    };
  }

  myNow(timestamp?: number): string {
    const dt: DateTime =
      timestamp === undefined
        ? DateTime.local()
        : DateTime.fromSeconds(timestamp);
    return dt.toFormat("yyyy-MM-dd HH:mm:ss");
  }

  hydrate<T>(rows: T[]): T[] {
    return rows.map((row: any) => {
      const nestedKeys = Object.keys(row).filter((key) => key.includes("__"));
      const groups = _.groupBy(nestedKeys, (key) => key.split("__")[0]);
      const nullKeys = Object.keys(groups).filter(
        (key) =>
          groups[key].length > 1 &&
          groups[key].every((field) => row[field] === null)
      );

      const hydrated = Object.keys(row).reduce((r, field) => {
        if (!field.includes("__")) {
          if (Array.isArray(row[field]) && _.isObject(row[field][0])) {
            r[field] = this.hydrate(row[field]);
          } else {
            r[field] = row[field];
          }
          return r;
        }

        const parts = field.split("__");
        const objPath =
          parts[0] +
          parts
            .slice(1)
            .map((part) => `[${part}]`)
            .join("");

        _.set(
          r,
          objPath,
          row[field] && Array.isArray(row[field]) && _.isObject(row[field][0])
            ? this.hydrate(row[field])
            : row[field]
        );

        return r;
      }, {} as any);

      nullKeys.forEach((nullKey) => (hydrated[nullKey] = null));
      return hydrated;
    });
  }
}

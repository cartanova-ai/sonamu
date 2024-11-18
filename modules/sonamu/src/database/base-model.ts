// base-model.ts
import { DateTime } from "luxon";
import _ from "lodash";
import SqlParser from "node-sql-parser";
import chalk from "chalk";
import inflection from "inflection";
import { BaseListParams } from "../utils/model";
import {
  ClientType,
  DBPreset,
  DatabaseInstance,
  DatabaseType,
  QueryBuilder,
  TableName,
} from "./types";
import { SubsetQuery } from "../types/types";
import { getTableName, getTableNamesFromWhere } from "../utils/sql-parser";
import { DB } from "./db";

export abstract class BaseModelClassAbstract<
  D extends DatabaseType,
  DI extends DatabaseInstance<D>,
  CT extends ClientType<D>,
  QB extends QueryBuilder<D>,
> {
  public modelName: string = "Unknown";
  protected _wdb: CT | null = null;
  protected _rdb: CT | null = null;

  protected abstract applyJoins(qb: CT, joins: SubsetQuery["joins"]): CT;
  protected abstract executeCountQuery(qb: QB): Promise<number>;

  abstract getDB(which: DBPreset): DI;
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
      qb: QB;
      db: DI;
      select: SubsetQuery["select"];
      joins: SubsetQuery["joins"];
      virtual: string[];
    }) => QB;
    baseTable?: TableName<D>;
    debug?: boolean | "list" | "count";
    db?: DI;
    optimizeCountQuery?: boolean;
  }): Promise<{
    rows: any[];
    total?: number;
    subsetQuery: SubsetQuery;
    qb: QB;
  }> {
    const db = _db ?? (DB.getDB(subset.startsWith("A") ? "w" : "r") as DI);
    const dbClient = DB.toClient(db as any) as CT;
    baseTable =
      baseTable ??
      (inflection.pluralize(
        inflection.underscore(this.modelName)
      ) as TableName<D>);
    const queryMode =
      params.queryMode ?? (params.id !== undefined ? "list" : "both");

    const { select, virtual, joins, loaders } = subsetQuery;
    const _qb = build({
      qb: dbClient.from(baseTable).qb as QB,
      db,
      select,
      joins,
      virtual,
    });
    dbClient.qb = _qb;
    const qb = dbClient;

    // Count query
    const total = await (async () => {
      if (queryMode === "list") return undefined;

      // const clonedQb = this.clearQueryParts(qb, ["order", "offset", "limit"]);
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

        // for (const join of joins.filter((j) => needToJoin.includes(j.table))) {
        //   if (isCustomJoinClause(join)) {
        //     if (clonedQb instanceof KyselyClient) {
        //       throw new Error("Custom join clause is not supported in Kysely");
        //     }
        //     if (join.join === "inner") {
        //       clonedQb.qb.innerJoin(
        //         `${join.table} as ${join.as}`,
        //         join.custom as any
        //       );
        //     } else {
        //       clonedQb.qb.leftJoin(
        //         `${join.table} as ${join.as}`,
        //         join.custom as any
        //       );
        //     }
        //   } else {
        //     if (join.join === "inner") {
        //       clonedQb.innerJoin(
        //         `${join.table} as ${join.as}`,
        //         join.from,
        //         join.to
        //       );
        //     } else if (join.join === "outer") {
        //       clonedQb.leftJoin(
        //         `${join.table} as ${join.as}`,
        //         join.from,
        //         join.to
        //       );
        //     }
        //   }
        // }
        this.applyJoins(
          clonedQb as CT,
          joins.filter((j) => needToJoin.includes(j.table))
        );
      } else {
        this.applyJoins(clonedQb as CT, joins);
      }

      const parsedQuery = parser.astify(clonedQb.sql);
      const q = Array.isArray(parsedQuery) ? parsedQuery[0] : parsedQuery;

      if (q.type !== "select") {
        throw new Error("Invalid query");
      }

      // `COUNT(DISTINCT \`${getTableName(q.columns[0].expr)}\`.\`${q.columns[0].expr.column}\`) as total`;
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

    // List query
    const rows = await (async () => {
      if (queryMode === "count") return [];

      let listQb = qb;
      if (params.num !== 0) {
        // Apply pagination
        // Note: Implementation depends on specific driver's QB type
        listQb = listQb
          .limit(params.num!)
          .offset(params.num! * (params.page! - 1)) as any;
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

    return { rows, total, subsetQuery, qb: dbClient.qb as QB };
  }

  // async getInsertedIds(
  //   wdb: CT,
  //   rows: any[],
  //   tableName: string,
  //   unqKeyFields: string[],
  //   chunkSize: number = 500
  // ): Promise<number[]> {
  //   if (!wdb) {
  //     wdb = this.getCli;
  //   }

  //   let unqKeys: string[];
  //   let whereInField: any, selectField: string;

  //   if (unqKeyFields.length > 1) {
  //     // Handle composite keys
  //     whereInField = this.rawQuery(
  //       wdb,
  //       `CONCAT_WS('_', ${unqKeyFields.join(",")})`
  //     );
  //     selectField = `${whereInField} as tmpUid`;
  //     unqKeys = rows.map((row) =>
  //       unqKeyFields.map((field) => row[field]).join("_")
  //     );
  //   } else {
  //     whereInField = unqKeyFields[0];
  //     selectField = unqKeyFields[0];
  //     unqKeys = rows.map((row) => row[unqKeyFields[0]]);
  //   }

  //   const chunks = _.chunk(unqKeys, chunkSize);
  //   let resultIds: number[] = [];

  //   for (let chunk of chunks) {
  //     const qb = this.createQueryBuilder(wdb, tableName);
  //     const dbRows = await this.executeQuery(
  //       this.whereInQuery(
  //         this.applySelect(qb, ["id", selectField]),
  //         whereInField,
  //         chunk
  //       )
  //     );
  //     resultIds = resultIds.concat(dbRows.map((row) => parseInt(row.id)));
  //   }

  //   return resultIds;
  // }

  async useLoaders(
    db: CT,
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
        // HasMany relationship
        const { subQ, col } = await this.buildHasManyQuery(db, loader, fromIds);
        subRows = await subQ.execute();
        toCol = col;
      } else {
        // ManyToMany relationship
        const { subQ, col } = await this.buildManyToManyQuery(
          db,
          loader,
          fromIds
        );
        subRows = await subQ.execute();
        toCol = col;
      }

      if (loader.loaders) {
        // Handle nested loaders recursively
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
    db: CT,
    loader: SubsetQuery["loaders"][number],
    fromIds: any[]
  ) {
    const idColumn = `${loader.manyJoin.toTable}.${loader.manyJoin.toCol}`;
    let qb = db.from(loader.manyJoin.toTable);

    // qb = this.whereInQuery(qb, idColumn, fromIds);
    db.where([idColumn, "in", fromIds]).select([...loader.select, idColumn]);
    qb = this.applyJoins(qb as CT, loader.oneJoins);

    return {
      subQ: qb,
      col: loader.manyJoin.toCol,
    };
  }

  protected async buildManyToManyQuery(
    db: CT,
    loader: SubsetQuery["loaders"][number],
    fromIds: any[]
  ) {
    if (!loader.manyJoin.through)
      throw new Error("Through table info missing for many-to-many relation");

    const idColumn = `${loader.manyJoin.through.table}.${loader.manyJoin.through.fromCol}`;
    let qb = db.from(loader.manyJoin.through.table);

    // Join with target table
    const throughTable = loader.manyJoin.through.table;
    const targetTable = loader.manyJoin.toTable;

    qb = this.applyJoins(qb as CT, [
      {
        join: "inner",
        table: targetTable,
        as: targetTable,
        from: `${throughTable}.${loader.manyJoin.through.toCol}`,
        to: `${targetTable}.${loader.manyJoin.toCol}`,
      },
    ]);

    qb.where([idColumn, "in", fromIds]).select([...loader.select, idColumn]);
    qb = this.applyJoins(qb as CT, loader.oneJoins);

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

import { DateTime } from "luxon";
import { Knex } from "knex";
import { chunk, groupBy, isObject, omit, set, uniq } from "lodash";
import { attachOnDuplicateUpdate } from "./knex-plugins/knex-on-duplicate-update";
attachOnDuplicateUpdate();
import { DBPreset, DB } from "./db";
import { isCustomJoinClause, SubsetQuery } from "../types/types";
import { BaseListParams } from "../utils/model";
import { pluralize, underscore } from "inflection";
import chalk from "chalk";
import { UpsertBuilder } from "./upsert-builder";

export class BaseModelClass {
  public modelName: string = "Unknown";

  /* DB 인스턴스 get, destroy */
  getDB(which: DBPreset): Knex {
    return DB.getDB(which);
  }
  async destroy() {
    return DB.destroy();
  }

  myNow(timestamp?: number): string {
    const dt: DateTime =
      timestamp === undefined
        ? DateTime.local()
        : DateTime.fromSeconds(timestamp);
    return dt.toFormat("yyyy-MM-dd HH:mm:ss");
  }

  async getInsertedIds(
    wdb: Knex,
    rows: any[],
    tableName: string,
    unqKeyFields: string[],
    chunkSize: number = 500
  ) {
    if (!wdb) {
      wdb = this.getDB("w");
    }

    let unqKeys: string[];
    let whereInField: any, selectField: string;
    if (unqKeyFields.length > 1) {
      whereInField = wdb.raw(`CONCAT_WS('_', '${unqKeyFields.join(",")}')`);
      selectField = `${whereInField} as tmpUid`;
      unqKeys = rows.map((row) =>
        unqKeyFields.map((field) => row[field]).join("_")
      );
    } else {
      whereInField = unqKeyFields[0];
      selectField = unqKeyFields[0];
      unqKeys = rows.map((row) => row[unqKeyFields[0]]);
    }
    const chunks = chunk(unqKeys, chunkSize);

    let resultIds: number[] = [];
    for (let chunk of chunks) {
      const dbRows = await wdb(tableName)
        .select("id", wdb.raw(selectField))
        .whereIn(whereInField, chunk);
      resultIds = resultIds.concat(
        dbRows.map((dbRow: any) => parseInt(dbRow.id))
      );
    }

    return resultIds;
  }

  async useLoaders(db: Knex, rows: any[], loaders: SubsetQuery["loaders"]) {
    if (loaders.length === 0) {
      return rows;
    }

    for (let loader of loaders) {
      let subQ: any;
      let subRows: any[];
      let toCol: string;

      const fromIds = rows.map((row) => row[loader.manyJoin.idField]);

      if (loader.manyJoin.through === undefined) {
        // HasMany
        const idColumn = `${loader.manyJoin.toTable}.${loader.manyJoin.toCol}`;
        subQ = db(loader.manyJoin.toTable)
          .whereIn(idColumn, fromIds)
          .select([...loader.select, idColumn]);

        // HasMany에서 OneJoin이 있는 경우
        loader.oneJoins.map((join) => {
          if (join.join == "inner") {
            subQ.innerJoin(
              `${join.table} as ${join.as}`,
              this.getJoinClause(db, join)
            );
          } else if (join.join == "outer") {
            subQ.leftOuterJoin(
              `${join.table} as ${join.as}`,
              this.getJoinClause(db, join)
            );
          }
        });
        toCol = loader.manyJoin.toCol;
      } else {
        // ManyToMany
        const idColumn = `${loader.manyJoin.through.table}.${loader.manyJoin.through.fromCol}`;
        subQ = db(loader.manyJoin.through.table)
          .join(
            loader.manyJoin.toTable,
            `${loader.manyJoin.through.table}.${loader.manyJoin.through.toCol}`,
            `${loader.manyJoin.toTable}.${loader.manyJoin.toCol}`
          )
          .whereIn(idColumn, fromIds)
          .select(uniq([...loader.select, idColumn]));

        // ManyToMany에서 OneJoin이 있는 경우
        loader.oneJoins.map((join) => {
          if (join.join == "inner") {
            subQ.innerJoin(
              `${join.table} as ${join.as}`,
              this.getJoinClause(db, join)
            );
          } else if (join.join == "outer") {
            subQ.leftOuterJoin(
              `${join.table} as ${join.as}`,
              this.getJoinClause(db, join)
            );
          }
        });
        toCol = loader.manyJoin.through.fromCol;
      }
      subRows = await subQ;

      if (loader.loaders) {
        // 추가 -Many 케이스가 있는 경우 recursion 처리
        subRows = await this.useLoaders(db, subRows, loader.loaders);
      }

      // 불러온 row들을 참조ID 기준으로 분류 배치
      const subRowGroups = groupBy(subRows, toCol);
      rows = rows.map((row) => {
        row[loader.as] = (subRowGroups[row[loader.manyJoin.idField]] ?? []).map(
          (r) => omit(r, toCol)
        );
        return row;
      });
    }
    return rows;
  }

  hydrate<T>(rows: T[]): T[] {
    return rows.map((row: any) => {
      // nullable relation인 경우 관련된 필드가 전부 null로 생성되는 것 방지하는 코드
      const nestedKeys = Object.keys(row).filter((key) => key.includes("__"));
      const groups = groupBy(nestedKeys, (key) => key.split("__")[0]);
      const nullKeys = Object.keys(groups).filter(
        (key) =>
          groups[key].length > 1 &&
          groups[key].every((field) => row[field] === null)
      );

      const hydrated = Object.keys(row).reduce((r, field) => {
        if (!field.includes("__")) {
          if (Array.isArray(row[field]) && isObject(row[field][0])) {
            r[field] = this.hydrate(row[field]);
            return r;
          } else {
            r[field] = row[field];
            return r;
          }
        }

        const parts = field.split("__");
        const objPath =
          parts[0] +
          parts
            .slice(1)
            .map((part) => `[${part}]`)
            .join("");
        set(r, objPath, row[field]);

        return r;
      }, {} as any);
      nullKeys.map((nullKey) => (hydrated[nullKey] = null));

      return hydrated;
    });
  }

  async runSubsetQuery<T extends BaseListParams, U extends string>({
    params,
    baseTable,
    subset,
    subsetQuery,
    build,
    debug,
  }: {
    subset: U;
    params: T;
    subsetQuery: SubsetQuery;
    build: (buildParams: {
      qb: Knex.QueryBuilder;
      db: Knex;
      select: string[];
      joins: SubsetQuery["joins"];
      virtual: string[];
    }) => Knex.QueryBuilder;
    baseTable?: string;
    debug?: boolean | "list" | "count";
  }): Promise<{
    rows: any[];
    total?: number | undefined;
    subsetQuery: SubsetQuery;
    qb: Knex.QueryBuilder;
  }> {
    const db = this.getDB(subset.startsWith("A") ? "w" : "r");
    baseTable = baseTable ?? pluralize(underscore(this.modelName));
    const queryMode =
      params.queryMode ?? (params.id !== undefined ? "list" : "both");

    const { select, virtual, joins, loaders } = subsetQuery;
    const qb = build({
      qb: db.from(baseTable),
      db,
      select,
      joins,
      virtual,
    });

    // join
    joins.map((join) => {
      if (join.join == "inner") {
        qb.innerJoin(
          `${join.table} as ${join.as}`,
          this.getJoinClause(db, join)
        );
      } else if (join.join == "outer") {
        qb.leftOuterJoin(
          `${join.table} as ${join.as}`,
          this.getJoinClause(db, join)
        );
      }
    });

    // listQuery
    const rows = await (async () => {
      if (queryMode === "count") {
        return [];
      }

      // limit, offset
      if (params.num !== 0) {
        qb.limit(params.num!);
        qb.offset(params.num! * (params.page! - 1));
      }

      // select, rows
      const listQuery = qb.clone().select(select);

      let rows = await listQuery;
      // debug: listQuery
      if (debug === true || debug === "list") {
        console.debug(
          "DEBUG: list query",
          chalk.blue(listQuery.toQuery().toString())
        );
      }

      rows = await this.useLoaders(db, rows, loaders);
      rows = this.hydrate(rows);
      return rows;
    })();

    // countQuery
    const total = await (async () => {
      if (queryMode === "list") {
        return undefined;
      }

      const clonedQb = qb.clone().clear("order");
      const [, matched] =
        clonedQb
          .toQuery()
          .toLowerCase()
          .match(/select (distinct .+) from/) ?? [];
      const countQuery = matched
        ? clonedQb
            .clear("select")
            .select(db.raw(`COUNT(${matched}) as total`))
            .first()
        : clonedQb.clear("select").count("*", { as: "total" }).first();
      const countRow: { total?: number } = await countQuery;

      // debug: countQuery
      if (debug === true || debug === "count") {
        console.debug(
          "DEBUG: count query",
          chalk.blue(countQuery.toQuery().toString())
        );
      }

      return countRow?.total ?? 0;
    })();

    return { rows, total, subsetQuery, qb };
  }

  getJoinClause(
    db: Knex<any, unknown>,
    join: SubsetQuery["joins"][number]
  ): Knex.Raw<any> {
    if (!isCustomJoinClause(join)) {
      return db.raw(`${join.from} = ${join.to}`);
    } else {
      return db.raw(join.custom);
    }
  }

  getUpsertBuilder(): UpsertBuilder {
    return new UpsertBuilder();
  }
}
export const BaseModel = new BaseModelClass();

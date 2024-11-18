import { DateTime } from "luxon";
import _ from "lodash";
import { Knex } from "knex";
import { RawBuilder } from "kysely";
import { BaseListParams } from "../utils/model";
import { ClientType, DBPreset, DatabaseType, QueryBuilder } from "./types";
import { SubsetQuery } from "../types/types";

export abstract class BaseModelAbstract<
  D extends DatabaseType,
  DB extends ClientType<D>,
  QB extends QueryBuilder<D>,
> {
  public modelName: string = "Unknown";

  abstract runSubsetQuery<T extends BaseListParams, U extends string>(options: {
    params: T;
    baseTable?: string;
    subset: U;
    subsetQuery: SubsetQuery;
    build: (buildParams: {
      qb: QB;
      db: DB;
      select: SubsetQuery["select"];
      joins: SubsetQuery["joins"];
      virtual: string[];
    }) => any;
    debug?: boolean | "list" | "count";
    db?: DB;
    optimizeCountQuery?: boolean;
  }): Promise<{
    rows: any[];
    total?: number;
    subsetQuery: SubsetQuery;
    qb: QB;
  }>;
  abstract getDB(which: DBPreset): DB;
  abstract destroy(): Promise<void>;
  // abstract getInsertedIds(
  //   wdb: DB,
  //   rows: any[],
  //   tableName: string,
  //   unqKeyFields: string[],
  //   chunkSize?: number
  // ): Promise<number[]>;
  abstract useLoaders(
    db: DB,
    rows: any[],
    loaders: SubsetQuery["loaders"]
  ): Promise<any[]>;
  abstract getJoinClause(
    db: DB,
    join: SubsetQuery["joins"][number]
  ): string | Knex.Raw<any> | RawBuilder<unknown>;

  myNow(timestamp?: number): string {
    const dt: DateTime =
      timestamp === undefined
        ? DateTime.local()
        : DateTime.fromSeconds(timestamp);
    return dt.toFormat("yyyy-MM-dd HH:mm:ss");
  }

  hydrate<T>(rows: T[]): T[] {
    return rows.map((row: any) => {
      // nullable relation인 경우 관련된 필드가 전부 null로 생성되는 것 방지하는 코드
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
        _.set(
          r,
          objPath,
          row[field] && Array.isArray(row[field]) && _.isObject(row[field][0])
            ? this.hydrate(row[field])
            : row[field]
        );

        return r;
      }, {} as any);
      nullKeys.map((nullKey) => (hydrated[nullKey] = null));

      return hydrated;
    });
  }
}

import equal from "fast-deep-equal";
import { diff } from "radashi";
import type { MigrationColumn, MigrationIndex } from "../types/types";
import { differenceWith, intersectionBy } from "../utils/utils";

export class CodeGenerator {
  getAlterColumnsTo(entityColumns: MigrationColumn[], dbColumns: MigrationColumn[]) {
    const columnsTo = {
      add: [] as MigrationColumn[],
      drop: [] as MigrationColumn[],
      alter: [] as MigrationColumn[],
    };

    // 컬럼명 기준 비교
    const extraColumns = {
      db: diff(dbColumns, entityColumns, (col) => col.name),
      entity: diff(entityColumns, dbColumns, (col) => col.name),
    };
    if (extraColumns.entity.length > 0) {
      columnsTo.add = columnsTo.add.concat(extraColumns.entity);
    }
    if (extraColumns.db.length > 0) {
      columnsTo.drop = columnsTo.drop.concat(extraColumns.db);
    }

    // 동일 컬럼명의 세부 필드 비교
    const sameDbColumns = intersectionBy(dbColumns, entityColumns, (col) => col.name);
    const sameMdColumns = intersectionBy(entityColumns, dbColumns, (col) => col.name);
    columnsTo.alter = differenceWith(sameDbColumns, sameMdColumns, (a, b) => equal(a, b));

    return columnsTo;
  }

  getAlterIndexesTo(entityIndexes: MigrationIndex[], dbIndexes: MigrationIndex[]) {
    // 인덱스 비교
    const indexesTo = {
      add: [] as MigrationIndex[],
      drop: [] as MigrationIndex[],
    };
    const extraIndexes = {
      db: diff(dbIndexes, entityIndexes, (col) =>
        [col.type, col.columns.map((c) => c.name).join("-")].join("//"),
      ),
      entity: diff(entityIndexes, dbIndexes, (col) =>
        [col.type, col.columns.map((c) => c.name).join("-")].join("//"),
      ),
    };
    if (extraIndexes.entity.length > 0) {
      indexesTo.add = indexesTo.add.concat(extraIndexes.entity);
    }
    if (extraIndexes.db.length > 0) {
      indexesTo.drop = indexesTo.drop.concat(extraIndexes.db);
    }

    return indexesTo;
  }
}

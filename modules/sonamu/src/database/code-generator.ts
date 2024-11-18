import _ from "lodash";
import equal from "fast-deep-equal";
import { MigrationColumn, MigrationIndex } from "../types/types";

export class CodeGenerator {
  getAlterColumnsTo(
    entityColumns: MigrationColumn[],
    dbColumns: MigrationColumn[]
  ) {
    const columnsTo = {
      add: [] as MigrationColumn[],
      drop: [] as MigrationColumn[],
      alter: [] as MigrationColumn[],
    };

    // 컬럼명 기준 비교
    const extraColumns = {
      db: _.differenceBy(dbColumns, entityColumns, (col) => col.name),
      entity: _.differenceBy(entityColumns, dbColumns, (col) => col.name),
    };
    if (extraColumns.entity.length > 0) {
      columnsTo.add = columnsTo.add.concat(extraColumns.entity);
    }
    if (extraColumns.db.length > 0) {
      columnsTo.drop = columnsTo.drop.concat(extraColumns.db);
    }

    // 동일 컬럼명의 세부 필드 비교
    const sameDbColumns = _.intersectionBy(
      dbColumns,
      entityColumns,
      (col) => col.name
    );
    const sameMdColumns = _.intersectionBy(
      entityColumns,
      dbColumns,
      (col) => col.name
    );
    columnsTo.alter = _.differenceWith(sameDbColumns, sameMdColumns, (a, b) =>
      equal(a, b)
    );

    return columnsTo;
  }

  getAlterIndexesTo(
    entityIndexes: MigrationIndex[],
    dbIndexes: MigrationIndex[]
  ) {
    // 인덱스 비교
    let indexesTo = {
      add: [] as MigrationIndex[],
      drop: [] as MigrationIndex[],
    };
    const extraIndexes = {
      db: _.differenceBy(dbIndexes, entityIndexes, (col) =>
        [col.type, col.columns.join("-")].join("//")
      ),
      entity: _.differenceBy(entityIndexes, dbIndexes, (col) =>
        [col.type, col.columns.join("-")].join("//")
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

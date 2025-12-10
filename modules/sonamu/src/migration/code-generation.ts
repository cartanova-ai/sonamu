import equal from "fast-deep-equal";
import { alphabetical, diff, omit } from "radashi";
import { Naite } from "..";
import type {
  GenMigrationCode,
  MigrationColumn,
  MigrationForeign,
  MigrationIndex,
  MigrationSet,
} from "../types/types";
import { formatCode } from "../utils/formatter";
import { differenceWith, intersectionBy } from "../utils/utils";

/**
 * 테이블 생성하는 케이스 - 컬럼/인덱스 생성
 */
async function generateCreateCode_ColumnAndIndexes(
  table: string,
  columns: MigrationColumn[],
  indexes: MigrationIndex[],
): Promise<GenMigrationCode> {
  // 컬럼, 인덱스 처리
  const lines: string[] = [
    'import { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    `await knex.schema.createTable("${table}", (table) => {`,
    ...genColumnDefinitions(columns),
    "});",
    // index는 knex.raw로 처리하므로 createTable 밖에서 실행
    ...indexes.map((index) => genIndexDefinition(index, table)),
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    ` return knex.schema.dropTable("${table}");`,
    "}",
  ];
  return {
    table,
    type: "normal",
    title: `create__${table}`,
    formatted: formatCode(lines.join("\n"), "typescript", `src/migration/${table}.ts`),
  };
}

/**
 * MigrationColumn[] 읽어서 컬럼 정의하는 구문 생성
 */
function genColumnDefinitions(columns: MigrationColumn[]): string[] {
  return columns.map((column) => {
    const chains: string[] = [];
    if (column.name === "id") {
      return `table.increments().primary();`;
    }

    // 배열 타입 처리
    if (column.type.endsWith("[]")) {
      const elementType = column.type.slice(0, -2); // "integer[]" -> "integer"
      const pgType = getPgArrayType(column, elementType);
      chains.push(`specificType('${column.name}', '${pgType}')`);
    } else if (column.type === "numberOrNumeric") {
      // number
      if (column.numberType === "real") {
        chains.push(`float('${column.name}')`);
      } else if (column.numberType === "double precision") {
        chains.push(`double('${column.name}')`);
      } else if ((column.numberType ?? "numeric") === "numeric") {
        chains.push(`decimal('${column.name}', ${column.precision}, ${column.scale})`);
      }
    } else if (column.type === "string") {
      // string
      if (column.length !== undefined) {
        chains.push(`string('${column.name}', ${column.length})`);
      } else {
        chains.push(`text('${column.name}')`);
      }
    } else if (column.type === "date") {
      // date
      chains.push(`timestamp('${column.name}', { useTz: true })`);
    } else if (column.type === "json") {
      // json
      chains.push(`jsonb('${column.name}')`);
    } else {
      // type, length
      let extraType: string | undefined;
      chains.push(
        `${column.type}('${column.name}'${
          column.length ? `, ${column.length}` : ""
        }${extraType ? `, '${extraType}'` : ""})`,
      );
    }

    // nullable
    chains.push(column.nullable ? "nullable()" : "notNullable()");

    // defaultTo
    if (column.defaultTo !== undefined) {
      if (typeof column.defaultTo === "string" && column.defaultTo.startsWith(`"`)) {
        chains.push(`defaultTo(${column.defaultTo})`);
      } else {
        chains.push(`defaultTo(knex.raw('${column.defaultTo}'))`);
      }
    }

    return `table.${chains.join(".")};`;
  });
}

function getPgArrayType(column: MigrationColumn, elementType: string): string {
  if (elementType === "numberOrNumeric") {
    if (column.numberType === "real") return "real[]";
    if (column.numberType === "double precision") return "double precision[]";
    return `numeric(${column.precision}, ${column.scale})[]`;
  }
  if (elementType === "string") {
    return column.length ? `varchar(${column.length})[]` : "text[]";
  }
  if (elementType === "date") return "timestamptz[]";
  if (elementType === "integer") return "integer[]";
  if (elementType === "bigInteger") return "bigint[]";
  if (elementType === "boolean") return "boolean[]";
  if (elementType === "uuid") return "uuid[]";
  if (elementType === "enum") return "text[]";

  throw new Error(`Unknown array element type: ${elementType}`);
}

/**
 * 개별 인덱스 정의 생성
 */
function genIndexDefinition(index: MigrationIndex, table: string) {
  const methodMap = {
    index: "INDEX",
    fulltext: "INDEX",
    unique: "UNIQUE INDEX",
  };

  if (index.type === "fulltext" && index.parser === "ngram") {
    return `await knex.raw(\`ALTER TABLE ${table} ADD FULLTEXT INDEX ${index.name} (${index.columns
      .map((col) => col.name)
      .join(", ")}) WITH PARSER ngram\`);`;
  }

  const nullsNotDistinctClause =
    index.nullsNotDistinct === undefined
      ? ""
      : ` NULLS ${index.nullsNotDistinct ? "NOT DISTINCT" : "DISTINCT"}`;

  return `await knex.raw(
  \`CREATE ${methodMap[index.type]} ${index.name} ON ${table} (${index.columns
    .map((col) => {
      const sortOrderClause = col.sortOrder === undefined ? "" : ` ${col.sortOrder}`;
      const nullsFirstClause =
        col.nullsFirst === undefined ? "" : ` NULLS ${col.nullsFirst ? "FIRST" : "LAST"}`;
      return `${col.name}${sortOrderClause}${nullsFirstClause}`;
    })
    .join(", ")})${nullsNotDistinctClause};\`
  );`;
}

/**
 * 테이블 생성하는 케이스 - FK 생성
 */
async function generateCreateCode_Foreign(
  table: string,
  foreigns: MigrationForeign[],
): Promise<GenMigrationCode[]> {
  if (foreigns.length === 0) {
    return [];
  }

  const { up, down } = genForeignDefinitions(table, foreigns);
  if (up.length === 0 && down.length === 0) {
    console.log("fk 가 뭔가 다릅니다");
    return [];
  }

  const lines: string[] = [
    'import { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    `return knex.schema.alterTable("${table}", (table) => {`,
    "// create fk",
    ...up,
    "});",
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    `return knex.schema.alterTable("${table}", (table) => {`,
    "// drop fk",
    ...down,
    "});",
    "}",
  ];

  const foreignKeysString = foreigns.map((foreign) => foreign.columns.join("_")).join("_");
  return [
    {
      table,
      type: "foreign",
      title: `foreign__${table}__${foreignKeysString}`,
      formatted: formatCode(lines.join("\n"), "typescript", `src/migration/${table}.ts`),
    },
  ];
}

/**
 * MigrationForeign[] 읽어서 외부키 constraint 정의하는 구문 생성
 */
function genForeignDefinitions(
  table: string,
  foreigns: MigrationForeign[],
): { up: string[]; down: string[] } {
  return foreigns.reduce(
    (r, foreign) => {
      const columnsStringQuote = foreign.columns
        .map((col) => `'${col.replace(`${table}.`, "")}'`)
        .join(",");
      r.up.push(
        `table.foreign('${foreign.columns.join(",")}')
            .references('${foreign.to}')
            .onUpdate('${foreign.onUpdate}')
            .onDelete('${foreign.onDelete}')`,
      );
      r.down.push(`table.dropForeign([${columnsStringQuote}])`);
      return r;
    },
    {
      up: [] as string[],
      down: [] as string[],
    },
  );
}

/**
 * 테이블 변경 케이스 - 컬럼/인덱스 변경
 */
async function generateAlterCode_ColumnAndIndexes(
  table: string,
  entityColumns: MigrationColumn[],
  entityIndexes: MigrationIndex[],
  dbColumns: MigrationColumn[],
  dbIndexes: MigrationIndex[],
  dbForeigns: MigrationForeign[],
): Promise<GenMigrationCode[]> {
  /*
    세부 비교 후 다른점 찾아서 코드 생성

    1. 컬럼갯수 다름: MD에 있으나, DB에 없다면 추가
    2. 컬럼갯수 다름: MD에 없으나, DB에 있다면 삭제
    3. 그외 컬럼(컬럼 갯수가 동일하거나, 다른 경우 동일한 컬럼끼리) => alter
    4. 다른거 다 동일하고 index만 변경되는 경우

    ** 컬럼명을 변경하는 경우는 따로 핸들링하지 않음
    => drop/add 형태의 마이그레이션 코드가 생성되는데, 수동으로 rename 코드로 수정하여 처리
  */

  // 각 컬럼 이름 기준으로 add, drop, alter 여부 확인
  const alterColumnsTo = getAlterColumnsTo(entityColumns, dbColumns);

  // 추출된 컬럼들을 기준으로 각각 라인 생성
  const alterColumnLinesTo = getAlterColumnLinesTo(
    alterColumnsTo,
    entityColumns,
    table,
    dbForeigns,
  );

  // 인덱스의 add, drop 여부 확인
  const alterIndexesTo = getAlterIndexesTo(entityIndexes, dbIndexes);

  // 인덱스가 삭제되는 경우, 컬럼과 같이 삭제된 케이스에는 drop에서 제외해야함!
  const indexNeedsToDrop = alterIndexesTo.drop.filter(
    (index) =>
      index.columns.every(({ name }) =>
        alterColumnsTo.drop.map((col) => col.name).includes(name),
      ) === false,
  );

  // 빈 코드 생성 방지
  if (
    alterColumnLinesTo.add.up.length === 0 &&
    alterColumnLinesTo.drop.up.length === 0 &&
    alterColumnLinesTo.alter.up.length === 0 &&
    alterIndexesTo.add.length === 0 &&
    indexNeedsToDrop.length === 0
  ) {
    Naite.t("migrator:generateAlterCode_ColumnAndIndexes:emptyCodeGenerationError", {
      entityColumns,
      dbColumns,
      entityIndexes,
      dbIndexes,
    });
    // throw new Error("컬럼/인덱스 변경 코드 생성 오류");
  }
  Naite.t("migrator:generateAlterCode_ColumnAndIndexes:debug", {
    "alterColumnsTo.add.length": alterColumnsTo.add.length,
    "alterColumnsTo.drop.length": alterColumnsTo.drop.length,
    "alterColumnsTo.alter.length": alterColumnsTo.alter.length,
    "alterIndexesTo.add.length": alterIndexesTo.add.length,
    "alterIndexesTo.drop.length": alterIndexesTo.drop.length,
    "indexNeedsToDrop.length": indexNeedsToDrop.length,
  });
  // Naite.t("migrator:generateAlterCode_ColumnAndIndexes:alterColumnsTo", alterColumnsTo);

  // TODO: 인덱스명 변경된 경우 처리

  const lines: string[] = [
    'import { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    `await knex.schema.alterTable("${table}", (table) => {`,
    // 1. add column
    ...(alterColumnsTo.add.length > 0 ? alterColumnLinesTo.add.up : []),
    // 2. drop column
    ...(alterColumnsTo.drop.length > 0 ? alterColumnLinesTo.drop.up : []),
    // 3. alter column
    ...(alterColumnsTo.alter.length > 0 ? alterColumnLinesTo.alter.up : []),
    // 4. drop index
    ...indexNeedsToDrop.map(genIndexDropDefinition),
    "});",
    // index는 knex.raw로 처리하므로 alterTable 밖에서 실행
    ...alterIndexesTo.add.map((index) => genIndexDefinition(index, table)),
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    `await knex.schema.alterTable("${table}", (table) => {`,
    ...(alterColumnsTo.add.length > 0 ? alterColumnLinesTo.add.down : []),
    ...(alterColumnsTo.drop.length > 0 ? alterColumnLinesTo.drop.down : []),
    ...(alterColumnsTo.alter.length > 0 ? alterColumnLinesTo.alter.down : []),
    ...alterIndexesTo.add
      .filter(
        (index) =>
          index.columns.every((indexCol) =>
            alterColumnsTo.add.map((col) => col.name).includes(indexCol.name),
          ) === false,
      )
      .map(genIndexDropDefinition),
    "});",
    ...indexNeedsToDrop.map((index) => genIndexDefinition(index, table)),
    "}",
  ];

  const formatted = formatCode(lines.join("\n"), "typescript", `src/migration/${table}.ts`);
  const title = [
    "alter",
    table,
    ...(["add", "drop", "alter"] as const)
      .map((action) => {
        const len = alterColumnsTo[action].length;
        if (len > 0) {
          return action + len;
        }
        return null;
      })
      .filter((part) => part !== null),
  ].join("_");

  return [
    {
      table,
      title,
      formatted,
      type: "normal",
    },
  ];
}

/**
 * 각 컬럼 이름 기준으로 add, drop, alter 여부 확인
 */
function getAlterColumnsTo(entityColumns: MigrationColumn[], dbColumns: MigrationColumn[]) {
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

/**
 * 추출된 컬럼들을 기준으로 각각 라인 생성
 */
function getAlterColumnLinesTo(
  columnsTo: ReturnType<typeof getAlterColumnsTo>,
  entityColumns: MigrationColumn[],
  table: string,
  dbForeigns: MigrationForeign[],
) {
  const linesTo = {
    add: {
      up: [] as string[],
      down: [] as string[],
    },
    drop: {
      up: [] as string[],
      down: [] as string[],
    },
    alter: {
      up: [] as string[],
      down: [] as string[],
    },
  };

  linesTo.add = {
    up: ["// add", ...genColumnDefinitions(columnsTo.add)],
    down: [
      "// rollback - add",
      `table.dropColumns(${columnsTo.add.map((col) => `'${col.name}'`).join(", ")})`,
    ],
  };

  // drop할 컬럼에 걸린 FK 찾기
  const dropColumnNames = columnsTo.drop.map((col) => col.name);
  const fkToDropBeforeColumn = dbForeigns.filter((fk) =>
    fk.columns.some((col) => dropColumnNames.includes(col)),
  );

  const dropFkLines = fkToDropBeforeColumn.map((fk) => {
    const columnsStringQuote = fk.columns.map((col) => `'${col}'`).join(",");
    return `table.dropForeign([${columnsStringQuote}])`;
  });

  const restoreFkLines = genForeignDefinitions(table, fkToDropBeforeColumn).up;

  linesTo.drop = {
    up: [
      ...(dropFkLines.length > 0
        ? ["// drop foreign keys on columns to be dropped", ...dropFkLines]
        : []),
      "// drop columns",
      `table.dropColumns(${columnsTo.drop.map((col) => `'${col.name}'`).join(", ")})`,
    ],
    down: [
      "// rollback - drop columns",
      ...genColumnDefinitions(columnsTo.drop),
      ...(restoreFkLines.length > 0 ? ["// restore foreign keys", ...restoreFkLines] : []),
    ],
  };
  linesTo.alter = columnsTo.alter.reduce(
    (r, dbColumn) => {
      const entityColumn = entityColumns.find((col) => col.name === dbColumn.name);
      if (entityColumn === undefined) {
        return r;
      }

      // 컬럼 변경사항
      const columnDiffUp = diff(
        genColumnDefinitions([entityColumn]),
        genColumnDefinitions([dbColumn]),
      );
      const columnDiffDown = diff(
        genColumnDefinitions([dbColumn]),
        genColumnDefinitions([entityColumn]),
      );
      if (columnDiffUp.length > 0) {
        r.up = [
          ...r.up,
          "// alter column",
          ...columnDiffUp.map((l) => `${l.replace(";", "")}.alter();`),
        ];
        r.down = [
          ...r.down,
          "// rollback - alter column",
          ...columnDiffDown.map((l) => `${l.replace(";", "")}.alter();`),
        ];
      }

      return r;
    },
    {
      up: [] as string[],
      down: [] as string[],
    },
  );

  return linesTo;
}

/**
 * 인덱스의 add, drop 여부 확인
 */
function getAlterIndexesTo(entityIndexes: MigrationIndex[], dbIndexes: MigrationIndex[]) {
  // 인덱스 비교
  const indexesTo = {
    add: [] as MigrationIndex[],
    drop: [] as MigrationIndex[],
  };

  // 인덱스 고유 식별자 생성 (name을 제외한 모든 필드를 문자열로 변환하여 조합)
  const identity = <T extends Record<string, unknown>>(index: T): string => {
    const keys = Object.keys(index)
      .filter((key) => key !== "name")
      .sort();

    return keys
      .map((key) => {
        if (key === "name") {
          return undefined;
        }
        if (key === "columns") {
          return (index[key] as MigrationIndex["columns"]).flatMap(identity);
        }
        return `${key}=${index[key as keyof MigrationIndex]}`;
      })
      .join("//");
  };

  const extraIndexes = {
    db: diff(dbIndexes, entityIndexes.map(setMigrationIndexDefaults), identity),
    entity: diff(entityIndexes.map(setMigrationIndexDefaults), dbIndexes, identity),
  };
  if (extraIndexes.entity.length > 0) {
    indexesTo.add = indexesTo.add.concat(extraIndexes.entity);
  }
  if (extraIndexes.db.length > 0) {
    indexesTo.drop = indexesTo.drop.concat(extraIndexes.db);
  }

  return indexesTo;
}

/**
 * 인덱스 삭제 정의 생성
 */
function genIndexDropDefinition(index: MigrationIndex) {
  return `table.dropIndex([${index.columns
    .map((column) => `'${column.name}'`)
    .join(",")}], '${index.name}')`;
}

/**
 * DB 조회 결과와 비교하기 위한 인덱스 기본값 설정
 */
function setMigrationIndexDefaults(index: MigrationIndex): MigrationIndex {
  return {
    ...index,
    columns: index.columns.map((col) => ({
      ...col,
      sortOrder: col.sortOrder ?? "ASC",
      // sortOrder에 따라 nullsFirst의 default 값 설정
      nullsFirst: col.nullsFirst ?? col.sortOrder === "DESC",
    })),
    nullsNotDistinct: index.nullsNotDistinct ?? false,
  };
}

/**
 * 테이블 변경 케이스 - Foreign Key 변경
 */
async function generateAlterCode_Foreigns(
  table: string,
  entityForeigns: MigrationForeign[],
  dbForeigns: MigrationForeign[],
  droppingColumns: MigrationColumn[] = [],
): Promise<GenMigrationCode[]> {
  // console.log({ entityForeigns, dbForeigns });

  const getKey = (mf: MigrationForeign): string => {
    return [mf.columns.join("-"), mf.to].join("///");
  };

  // 삭제될 컬럼명 목록
  const droppingColumnNames = droppingColumns.map((col) => col.name);

  const fkTo = entityForeigns.reduce(
    (result, entityF) => {
      const matchingDbF = dbForeigns.find((dbF) => getKey(entityF) === getKey(dbF));
      if (!matchingDbF) {
        result.add.push(entityF);
        return result;
      }

      if (equal(entityF, matchingDbF) === false) {
        result.alterSrc.push(matchingDbF);
        result.alterDst.push(entityF);
        return result;
      }
      return result;
    },
    {
      add: [] as MigrationForeign[],
      drop: [] as MigrationForeign[],
      alterSrc: [] as MigrationForeign[],
      alterDst: [] as MigrationForeign[],
    },
  );

  // dbForeigns에는 있지만 entityForeigns에는 없는 경우 (삭제된 FK)
  // 단, 삭제될 컬럼의 FK는 제외 (generateAlterCode_ColumnAndIndexes에서 처리)
  dbForeigns.forEach((dbF) => {
    const matchingEntityF = entityForeigns.find((entityF) => getKey(entityF) === getKey(dbF));
    if (!matchingEntityF) {
      // 이 FK의 컬럼이 삭제될 컬럼 목록에 있는지 확인
      const isColumnDropping = dbF.columns.some((col) => droppingColumnNames.includes(col));
      // 컬럼이 삭제되지 않는 경우에만 FK drop 목록에 추가
      if (!isColumnDropping) {
        fkTo.drop.push(dbF);
      }
    }
  });

  const linesTo = {
    add: genForeignDefinitions(table, fkTo.add),
    drop: genForeignDefinitions(table, fkTo.drop),
    alterSrc: genForeignDefinitions(table, fkTo.alterSrc),
    alterDst: genForeignDefinitions(table, fkTo.alterDst),
  };

  // drop fk columns인 경우(생성될 코드 없는 경우) 패스
  const hasLines = Object.values(linesTo).some((l) => l.up.length > 0 || l.down.length > 0);
  if (!hasLines) {
    return [];
  }

  if (
    linesTo.add.up.length === 0 &&
    linesTo.drop.up.length === 0 &&
    linesTo.alterSrc.up.length === 0 &&
    linesTo.alterDst.up.length === 0
  ) {
    Naite.t("migrator:generateAlterCode_Foreigns:fkChangeCodeGenerationError", {
      table,
      entityForeigns,
      dbForeigns,
    });
    throw new Error("FK 변경 코드 생성 오류");
  }

  const lines: string[] = [
    'import { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    `return knex.schema.alterTable("${table}", (table) => {`,
    ...linesTo.drop.down,
    ...linesTo.add.up,
    ...linesTo.alterSrc.down,
    ...linesTo.alterDst.up,
    "})",
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    `return knex.schema.alterTable("${table}", (table) => {`,
    ...linesTo.add.down,
    ...linesTo.alterDst.down,
    ...linesTo.alterSrc.up,
    ...linesTo.drop.up,
    "})",
    "}",
  ];

  const formatted = formatCode(lines.join("\n"), "typescript", `src/migration/${table}.ts`);
  const title = [
    "alter",
    table,
    "foreigns",
    // TODO 바뀌는 부분
  ].join("_");

  return [
    {
      table,
      title,
      formatted,
      type: "normal",
    },
  ];
}

/**
 * 주어진 EntitySet을 기반으로 테이블 CREATE 마이그레이션 코드를 생성합니다.
 * @param entitySet
 * @returns CREATE 마이그레이션 코드
 */
export async function generateCreateCode(entitySet: MigrationSet): Promise<GenMigrationCode[]> {
  return [
    await generateCreateCode_ColumnAndIndexes(
      entitySet.table,
      entitySet.columns,
      entitySet.indexes,
    ),
    ...(await generateCreateCode_Foreign(entitySet.table, entitySet.foreigns)),
  ];
}

/**
 * 주어진 entitySet을 목표로, dbSet을 현 상황으로 하여 테이블 ALTER 마이그레이션 코드를 생성합니다.
 * @param entitySet 현 상황의 MigrationSet
 * @param dbSet 목표 상황의 MigrationSet
 * @returns ALTER 마이그레이션 코드
 */
export async function generateAlterCode(
  entitySet: MigrationSet,
  dbSet: MigrationSet,
): Promise<GenMigrationCode[]> {
  const replaceColumnDefaultTo = (col: MigrationColumn) => {
    // float인 경우 기본값을 0으로 지정하는 경우 "0.00"으로 변환되는 케이스 대응
    // if (col.type === "float" && col.defaultTo && String(col.defaultTo).includes('"') === false) {
    //   col.defaultTo = `"${Number(col.defaultTo).toFixed(col.scale ?? 2)}"`;
    // }
    // // string인 경우 기본값이 빈 스트링인 경우 대응
    // if (col.type === "string" && col.defaultTo === "") {
    //   col.defaultTo = '""';
    // }
    // // boolean인 경우 기본값 정규화 (MySQL에서는 TINYINT(1)로 저장되므로 0 또는 1로 정규화)
    // // TODO: db.ts에 typeCase 설정 확인하여 처리하도록 수정 필요
    // if (col.type === "boolean" && col.defaultTo !== undefined) {
    //   if (col.defaultTo === "0" || col.defaultTo.toLowerCase() === "false") {
    //     col.defaultTo = "0";
    //   } else if (col.defaultTo === "1" || col.defaultTo.toLowerCase() === "true") {
    //     col.defaultTo = "1";
    //   }
    // }

    // FIXME: 일단 MySQL 상황에서 발생했던 이슈의 workaround 이므로 Pg에서 재확인 후 대응 추가
    return col;
  };
  const entityColumns = alphabetical(entitySet.columns, (a) => a.name).map(replaceColumnDefaultTo);
  const dbColumns = alphabetical(dbSet.columns, (a) => a.name).map(replaceColumnDefaultTo);

  /* 디버깅용 코드, 특정 컬럼에서 불일치 발생할 때 확인
        const entityColumn = entitySet.columns.find(
          (col) => col.name === "price_krw"
        );
        const dbColumn = dbSet.columns.find(
          (col) => col.name === "price_krw"
        );
        console.debug({ entityColumn, dbColumn });
         */

  // ?
  const entityIndexes = alphabetical(entitySet.indexes, (a) => [a.type, ...a.columns].join("-"));
  const dbIndexes = alphabetical(dbSet.indexes, (a) => [a.type, ...a.columns].join("-"));

  const replaceNoActionOnMySQL = (f: MigrationForeign) => {
    // MySQL에서 RESTRICT와 NO ACTION은 동일함
    const { onDelete, onUpdate } = f;
    return {
      ...f,
      onUpdate: onUpdate === "RESTRICT" ? "NO ACTION" : onUpdate,
      onDelete: onDelete === "RESTRICT" ? "NO ACTION" : onDelete,
    };
  };

  const entityForeigns = alphabetical(entitySet.foreigns, (a) =>
    [a.to, ...a.columns].join("-"),
  ).map((f) => replaceNoActionOnMySQL(f));
  const dbForeigns = alphabetical(dbSet.foreigns, (a) => [a.to, ...a.columns].join("-")).map((f) =>
    replaceNoActionOnMySQL(f),
  );

  // 삭제될 컬럼 목록 계산
  const droppingColumns = diff(dbColumns, entityColumns, (col) => col.name);

  const alterCodes: (GenMigrationCode | GenMigrationCode[] | null)[] = [];

  // 1. columnsAndIndexes 처리
  const isEqualColumns = equal(entityColumns, dbColumns);
  const isEqualIndexes = equal(
    entityIndexes.map((index) => omit(index, ["parser"])).map(setMigrationIndexDefaults),
    dbIndexes,
  );
  if (!isEqualColumns || !isEqualIndexes) {
    alterCodes.push(
      await generateAlterCode_ColumnAndIndexes(
        entitySet.table,
        entityColumns,
        entityIndexes,
        dbColumns,
        dbIndexes,
        dbSet.foreigns,
      ),
    );
  }

  // 2. foreigns 처리 (삭제될 컬럼 정보 전달)
  if (equal(entityForeigns, dbForeigns) === false) {
    alterCodes.push(
      await generateAlterCode_Foreigns(
        entitySet.table,
        entityForeigns,
        dbForeigns,
        droppingColumns,
      ),
    );
  }

  if (alterCodes.every((alterCode) => alterCode === null)) {
    return [];
  }

  return alterCodes.filter((alterCode) => alterCode !== null).flat();
}

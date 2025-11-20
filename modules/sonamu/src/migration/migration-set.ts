import { Knex } from "knex";
import { DBColumn, DBForeign, DBIndex } from "./types";
import * as _ from "lodash-es";
import inflection from "inflection";
import { Entity } from "../entity/entity";
import { EntityManager } from "../entity/entity-manager";
import {
  isKnexError,
  MigrationSet,
  RelationOn,
  isBelongsToOneRelationProp,
  isDecimalProp,
  isEnumProp,
  isFloatProp,
  isHasManyRelationProp,
  isIntegerProp,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
  isRelationProp,
  isStringProp,
  isTextProp,
  isVirtualProp,
  KnexColumnType,
  MigrationColumn,
  MigrationForeign,
  MigrationIndex,
  MigrationJoinTable,
  MigrationSetAndJoinTable,
} from "../types/types";

/**
 * DB에서 테이블 정보를 읽어서 MigrationSet을 만들어옵니다.
 * @param compareDB Knex 인스턴스
 * @param table 테이블 이름
 * @returns MigrationSet 객체
 */
export async function getMigrationSetFromDB(
  compareDB: Knex,
  table: string
): Promise<MigrationSet | null> {
  let dbColumns: DBColumn[], dbIndexes: DBIndex[], dbForeigns: DBForeign[];
  try {
    [dbColumns, dbIndexes, dbForeigns] = await readTable(compareDB, table);
  } catch (e: unknown) {
    if (isKnexError(e) && e.code === "ER_NO_SUCH_TABLE") {
      return null;
    }
    console.error(e);
    return null;
  }

  const columns: MigrationColumn[] = dbColumns.map((dbColumn) => {
    const dbColType = resolveDBColType(dbColumn.Type, dbColumn.Field);
    return {
      name: dbColumn.Field,
      nullable: dbColumn.Null !== "NO",
      ...dbColType,
      ...(() => {
        if (dbColumn.Default !== null) {
          return {
            defaultTo: dbColumn.Default,
          };
        }
        return {};
      })(),
    };
  });

  const dbIndexesGroup = _.groupBy(
    dbIndexes.filter(
      (dbIndex) =>
        dbIndex.Key_name !== "PRIMARY" &&
        !dbForeigns.find((dbForeign) => dbForeign.keyName === dbIndex.Key_name)
    ),
    (dbIndex) => dbIndex.Key_name
  );

  const parseIndexType = (index: DBIndex) => {
    if (index.Index_type === "FULLTEXT") {
      return "fulltext";
    }
    return index.Non_unique === 1 ? "index" : "unique";
  };

  // indexes 처리
  const indexes: MigrationIndex[] = Object.keys(dbIndexesGroup).map(
    (keyName) => {
      const currentIndexes = dbIndexesGroup[keyName];
      return {
        type: parseIndexType(currentIndexes[0]),
        columns: currentIndexes.map((currentIndex) => currentIndex.Column_name),
      };
    }
  );
  // console.log(table);
  // console.table(dbIndexes);
  // console.table(dbForeigns);

  // foreigns 처리
  const foreigns: MigrationForeign[] = dbForeigns.map((dbForeign) => {
    return {
      columns: [dbForeign.from],
      to: `${dbForeign.referencesTable}.${dbForeign.referencesField}`,
      onUpdate: dbForeign.onUpdate as RelationOn,
      onDelete: dbForeign.onDelete as RelationOn,
    };
  });

  return {
    table,
    columns,
    indexes,
    foreigns,
  };
}

/*
 * 기존 테이블 읽어서 cols, indexes 반환
 */
async function readTable(
  compareDB: Knex,
  tableName: string
): Promise<[DBColumn[], DBIndex[], DBForeign[]]> {
  // 테이블 정보
  try {
    const [_cols] = (await compareDB.raw(`SHOW FIELDS FROM ${tableName}`)) as [
      DBColumn[],
    ];
    const cols = _cols.map((col) => ({
      ...col,
      // Default 값은 숫자나 MySQL Expression이 아닌 경우 ""로 감싸줌
      ...(col.Default !== null && {
        Default:
          col.Default.replace(/[0-9]+/g, "").length > 0 &&
          col.Extra !== "DEFAULT_GENERATED"
            ? `"${col.Default}"`
            : col.Default,
      }),
    }));

    const [indexes] = await compareDB.raw(`SHOW INDEX FROM ${tableName}`);
    const [[row]] = await compareDB.raw(`SHOW CREATE TABLE ${tableName}`);
    const ddl = row["Create Table"];
    const matched = ddl.match(/CONSTRAINT .+/g);
    const foreignKeys = (matched ?? []).map((line: string) => {
      // 해당 라인을 정규식으로 파싱
      const matched = line.match(
        /CONSTRAINT `(.+)` FOREIGN KEY \(`(.+)`\) REFERENCES `(.+)` \(`(.+)`\)( ON [A-Z ]+)*/
      );
      if (!matched) {
        throw new Error(`인식할 수 없는 FOREIGN KEY CONSTRAINT ${line}`);
      }
      const [, keyName, from, referencesTable, referencesField, onClause] =
        matched;
      // console.debug({ tableName, line, onClause });

      const [onUpdateFull, _onUpdate] =
        (onClause ?? "").match(/ON UPDATE ([A-Z ]+)$/) ?? [];
      const onUpdate = _onUpdate ?? "NO ACTION";

      const onDelete =
        (onClause ?? "")
          .replace(onUpdateFull ?? "", "")
          .match(/ON DELETE ([A-Z ]+)/)?.[1]
          ?.trim() ?? "NO ACTION";

      return {
        keyName,
        from,
        referencesTable,
        referencesField,
        onDelete,
        onUpdate,
      };
    });
    return [cols, indexes, foreignKeys];
  } catch (e) {
    throw e;
  }
}

function resolveDBColType(
  colType: string,
  colField: string
): Pick<
  MigrationColumn,
  "type" | "unsigned" | "length" | "precision" | "scale"
> {
  let [rawType, unsigned] = colType.split(" ");
  const matched = rawType.match(/\(([0-9]+)\)/);
  let length;
  if (matched !== null && matched[1]) {
    rawType = rawType.replace(/\(([0-9]+)\)/, "");
    length = parseInt(matched[1]);
  }

  if (rawType === "char" && colField === "uuid") {
    return {
      type: "uuid",
    };
  }

  switch (rawType) {
    case "int":
      return {
        type: "integer",
        unsigned: unsigned === "unsigned",
      };
    case "varchar":
      // case "char":
      return {
        type: "string",
        ...(length !== undefined && {
          length,
        }),
      };
    case "text":
    case "mediumtext":
    case "longtext":
    case "timestamp":
    case "json":
    case "date":
    case "time":
      return {
        type: rawType,
      };
    case "datetime":
      return {
        type: "datetime",
      };
    case "tinyint":
      return {
        type: "boolean",
      };
    default:
      // decimal 처리
      if (rawType.startsWith("decimal")) {
        const [, precision, scale] =
          rawType.match(/decimal\(([0-9]+),([0-9]+)\)/) ?? [];
        return {
          type: "decimal",
          precision: parseInt(precision),
          scale: parseInt(scale),
          ...(unsigned === "unsigned" && {
            unsigned: true,
          }),
        };
      } else if (rawType.startsWith("float")) {
        const [, precision, scale] =
          rawType.match(/float\(([0-9]+),([0-9]+)\)/) ?? [];
        return {
          type: "float",
          precision: parseInt(precision),
          scale: parseInt(scale),
          ...(unsigned === "unsigned" && {
            unsigned: true,
          }),
        };
      }
      throw new Error(`resolve 불가능한 DB컬럼 타입 ${colType} ${rawType}`);
  }
}

/**
 * Entity를 읽어서 MigrationSetAndJoinTable을 만들어옵니다.
 * @param entity Entity 객체
 * @returns MigrationSetAndJoinTable 객체
 */
export function getMigrationSetFromEntity(
  entity: Entity
): MigrationSetAndJoinTable {
  const migrationSet: MigrationSetAndJoinTable = entity.props.reduce(
    (r, prop) => {
      // virtual 필드 제외
      if (isVirtualProp(prop)) {
        return r;
      }
      // HasMany 케이스는 아무 처리도 하지 않음
      if (isHasManyRelationProp(prop)) {
        return r;
      }

      // 일반 컬럼
      if (!isRelationProp(prop)) {
        // type resolve
        let type: KnexColumnType;
        if (isTextProp(prop)) {
          type = prop.textType;
        } else if (isEnumProp(prop)) {
          type = "string";
        } else {
          type = prop.type as KnexColumnType;
        }

        const column = {
          name: prop.name,
          type,
          ...(isIntegerProp(prop) && { unsigned: prop.unsigned === true }),
          ...((isStringProp(prop) || isEnumProp(prop)) && {
            length: prop.length,
          }),
          nullable: prop.nullable === true,
          ...(() => {
            if (prop.dbDefault !== undefined) {
              return {
                defaultTo: prop.dbDefault,
              };
            }
            return {};
          })(),
          // FIXME: float(N, M) deprecated
          // Decimal, Float 타입의 경우 precision, scale 추가
          ...((isDecimalProp(prop) || isFloatProp(prop)) && {
            precision: prop.precision ?? 8,
            scale: prop.scale ?? 2,
          }),
        };

        r.columns.push(column);
      }

      if (isManyToManyRelationProp(prop)) {
        // ManyToMany 케이스
        const relMd = EntityManager.get(prop.with);
        const table1 = entity.table;
        const table2 = relMd.table;
        const join = {
          from: `${entity.table}.id`,
          through: {
            from: `${prop.joinTable}.${inflection.singularize(table1)}_id`,
            to: `${prop.joinTable}.${inflection.singularize(table2)}_id`,
            onUpdate: prop.onUpdate,
            onDelete: prop.onDelete,
          },
          to: `${relMd.table}.id`,
        };
        const through = join.through;
        const fields = [through.from, through.to];
        r.joinTables.push({
          table: through.from.split(".")[0],
          indexes: [
            {
              type: "unique",
              columns: ["uuid"],
            },
            // 조인 테이블에 걸린 인덱스 찾아와서 연결
            ...entity.indexes
              .filter((index) =>
                index.columns.find((col) => col.includes(prop.joinTable + "."))
              )
              .map((index) => ({
                ...index,
                columns: index.columns.map((col) =>
                  col.replace(prop.joinTable + ".", "")
                ),
              })),
          ],
          columns: [
            {
              name: "id",
              type: "integer",
              nullable: false,
              unsigned: true,
            },
            ...fields.map((field) => {
              return {
                name: field.split(".")[1],
                type: "integer",
                nullable: false,
                unsigned: true,
              } as MigrationColumn;
            }),
            {
              name: "uuid",
              nullable: true,
              type: "uuid",
            },
          ],
          foreigns: fields.map((field) => {
            // 현재 필드가 어떤 테이블에 속하는지 판단
            const col = field.split(".")[1];
            const to = (() => {
              if (
                inflection.singularize(join.to.split(".")[0]) + "_id" ===
                col
              ) {
                return join.to;
              } else {
                return join.from;
              }
            })();
            return {
              columns: [col],
              to,
              onUpdate: through.onUpdate,
              onDelete: through.onDelete,
            };
          }),
        });
        return r;
      } else if (
        isBelongsToOneRelationProp(prop) ||
        (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
      ) {
        // -OneRelation 케이스
        const idColumnName = prop.name + "_id";
        r.columns.push({
          name: idColumnName,
          type: "integer",
          unsigned: true,
          nullable: prop.nullable ?? false,
        });
        if ((prop.useConstraint ?? true) === true) {
          r.foreigns.push({
            columns: [idColumnName],
            to: `${inflection
              .underscore(inflection.pluralize(prop.with))
              .toLowerCase()}.id`,
            onUpdate: prop.onUpdate ?? "RESTRICT",
            onDelete: prop.onDelete ?? "RESTRICT",
          });
        }
      }

      return r;
    },
    {
      table: entity.table,
      columns: [] as MigrationColumn[],
      indexes: [] as MigrationIndex[],
      foreigns: [] as MigrationForeign[],
      joinTables: [] as MigrationJoinTable[],
    }
  );

  // indexes
  migrationSet.indexes = entity.indexes.filter((index) =>
    index.columns.find((col) => col.includes(".") === false)
  );

  // uuid
  migrationSet.columns = migrationSet.columns.concat({
    name: "uuid",
    nullable: true,
    type: "uuid",
  } as MigrationColumn);
  migrationSet.indexes = migrationSet.indexes.concat({
    type: "unique",
    columns: ["uuid"],
  } as MigrationIndex);

  return migrationSet;
}

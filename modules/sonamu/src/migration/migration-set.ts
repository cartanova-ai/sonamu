import inflection from "inflection";

import { type Entity } from "../entity/entity";
import { EntityManager } from "../entity/entity-manager";
import {
  isBelongsToOneRelationProp,
  isHasManyRelationProp,
  isManyToManyRelationProp,
  isNumberProp,
  isNumericProp,
  isOneToOneRelationProp,
  isRelationProp,
  isStringProp,
  isVectorProp,
  isVirtualProp,
} from "../types/types";
import {
  type EntityProp,
  type MigrationColumn,
  type MigrationColumnType,
  type MigrationForeign,
  type MigrationIndex,
  type MigrationJoinTable,
  type MigrationSetAndJoinTable,
} from "../types/types";
import { exhaustive } from "../utils/utils";

// numeric 컬럼에서 precision/scale을 생략했을 때 실제로 생성되는 값(knex decimal의 기본값)이다.
const NUMERIC_DEFAULT_PRECISION = 8;
const NUMERIC_DEFAULT_SCALE = 2;

/**
 * Entity를 읽어서 MigrationSetAndJoinTable을 만들어옵니다.
 * @param entity Entity 객체
 * @returns MigrationSetAndJoinTable 객체
 */
export function getMigrationSetFromEntity(entity: Entity): MigrationSetAndJoinTable {
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
        const column = {
          name: prop.name,
          type: resolveEntityPropTypeToMigrationColumnType(prop),
          nullable: prop.nullable === true,
          ...(() => {
            if (prop.dbDefault !== undefined) {
              return {
                defaultTo: prop.dbDefault,
              };
            }
            return {};
          })(),
          // String 타입에 length 있는 경우 추가
          ...(isStringProp(prop) &&
            prop.length !== undefined && {
              length: prop.length,
            }),
          // Number/Numeric 타입의 경우 precision, scale 추가
          ...((isNumberProp(prop) || isNumericProp(prop)) &&
            (() => {
              const numberType = isNumberProp(prop) ? (prop.numberType ?? "numeric") : "numeric";

              // numeric에서 precision/scale을 생략하면 knex decimal의 기본값(8, 2)으로 컬럼이
              // 만들어지는데, DB에서는 그 값이 그대로 읽히므로 엔티티 쪽을 undefined로 두면
              // 매번 불일치로 잡힌다. 비교 전에 같은 기본값을 채워 실제 스키마와 맞춘다.
              if (numberType === "numeric") {
                return {
                  numberType,
                  precision: prop.precision ?? NUMERIC_DEFAULT_PRECISION,
                  scale: prop.scale ?? NUMERIC_DEFAULT_SCALE,
                };
              }

              // real/double precision은 precision/scale을 쓰지 않는다(DB 리더도 반환하지 않음).
              return { numberType, precision: prop.precision, scale: prop.scale };
            })()),
          // Vector 타입의 경우 dimensions 추가
          ...(isVectorProp(prop) && {
            dimensions: prop.dimensions,
          }),
          // Generated Column 정보 추가
          ...(prop.generated && {
            generated: prop.generated,
          }),
        };

        r.columns.push(column);
      }

      if (isManyToManyRelationProp(prop)) {
        // ManyToMany 케이스
        const relMd = EntityManager.get(prop.with);
        const table1 = entity.table;
        const table2 = relMd.table;

        // 각 엔티티의 PK 타입 정보 가져오기
        const thisPkType = entity.getPkType();
        const thisPkProp = entity.getPkProp();
        const relPkType = relMd.getPkType();
        const relPkProp = relMd.getPkProp();

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
          indexes: entity.indexes
            .filter((index) => index.columns.find((col) => col.name.includes(`${prop.joinTable}.`)))
            .map((index) => ({
              ...index,
              columns: index.columns.map((col) => ({
                name: col.name.replace(`${prop.joinTable}.`, ""),
                nullsFirst: col.nullsFirst,
                sortOrder: col.sortOrder,
              })),
            })),
          columns: [
            {
              name: "id",
              type: "integer",
              nullable: false,
            },
            // 현재 엔티티의 FK
            {
              name: `${inflection.singularize(table1)}_id`,
              type: thisPkType,
              nullable: false,
              ...(thisPkType === "string" &&
                thisPkProp.type === "string" &&
                thisPkProp.length !== undefined && {
                  length: thisPkProp.length,
                }),
            },
            // 참조 엔티티의 FK
            {
              name: `${inflection.singularize(table2)}_id`,
              type: relPkType,
              nullable: false,
              ...(relPkType === "string" &&
                relPkProp.type === "string" &&
                relPkProp.length !== undefined && {
                  length: relPkProp.length,
                }),
            },
          ],
          foreigns: fields.map((field) => {
            // 현재 필드가 어떤 테이블에 속하는지 판단
            const col = field.split(".")[1];
            const to = (() => {
              if (`${inflection.singularize(join.to.split(".")[0])}_id` === col) {
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
        const relEntity = EntityManager.get(prop.with);
        const pkType = relEntity.getPkType();
        const pkProp = relEntity.getPkProp();

        const idColumnName = `${prop.name}_id`;
        r.columns.push({
          name: idColumnName,
          type: pkType,
          nullable: prop.nullable ?? false,
          // string FK인 경우 length도 전달
          ...(pkType === "string" &&
            pkProp.type === "string" &&
            pkProp.length !== undefined && {
              length: pkProp.length,
            }),
        });
        if (prop.useConstraint ?? true) {
          r.foreigns.push({
            columns: [idColumnName],
            to: `${inflection.underscore(inflection.pluralize(prop.with)).toLowerCase()}.id`,
            onUpdate: prop.onUpdate ?? "RESTRICT",
            onDelete: prop.onDelete ?? "RESTRICT",
          });
        }
      }

      return r;
    },
    {
      table: entity.table,
      columns:
        /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationColumn[],
      indexes:
        /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationIndex[],
      foreigns:
        /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationForeign[],
      joinTables:
        /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationJoinTable[],
    },
  );

  // indexes
  migrationSet.indexes = entity.indexes.filter((index) =>
    index.columns.find((col) => !col.name.includes(".")),
  );

  return migrationSet;
}

function resolveEntityPropTypeToMigrationColumnType(prop: EntityProp): MigrationColumnType {
  if (prop.type === "relation" || prop.type === "virtual") {
    throw new Error(`Unresolved column type: ${prop.type}`);
  }

  switch (prop.type) {
    case "string":
      return "string";
    case "string[]":
      return "string[]";
    case "enum":
      return "string";
    case "enum[]":
      return "string[]";
    case "integer":
      return "integer";
    case "integer[]":
      return "integer[]";
    case "bigInteger":
      return "bigInteger";
    case "bigInteger[]":
      return "bigInteger[]";
    case "number":
      return "numberOrNumeric";
    case "number[]":
      return "numberOrNumeric[]";
    case "numeric":
      return "numberOrNumeric";
    case "numeric[]":
      return "numberOrNumeric[]";
    case "boolean":
      return "boolean";
    case "boolean[]":
      return "boolean[]";
    case "date":
      return "date";
    case "date[]":
      return "date[]";
    case "uuid":
      return "uuid";
    case "uuid[]":
      return "uuid[]";
    case "json":
      return "json";
    case "searchText":
      return "string";
    case "vector":
      return "vector";
    case "vector[]":
      return "vector[]";
    case "tsvector":
      return "tsvector";
    default:
      exhaustive(prop);
      throw new Error(
        `Unknown entity prop type: ${/* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ (prop as { type: string }).type}`,
      );
  }
}

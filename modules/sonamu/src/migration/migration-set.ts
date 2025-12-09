import inflection from "inflection";
import type { Entity } from "../entity/entity";
import { EntityManager } from "../entity/entity-manager";
import {
  type EntityProp,
  isBelongsToOneRelationProp,
  isHasManyRelationProp,
  isManyToManyRelationProp,
  isNumberProp,
  isNumericProp,
  isOneToOneRelationProp,
  isRelationProp,
  isStringProp,
  isVirtualProp,
  type MigrationColumn,
  type MigrationColumnType,
  type MigrationForeign,
  type MigrationIndex,
  type MigrationJoinTable,
  type MigrationSetAndJoinTable,
} from "../types/types";
import { exhaustive } from "../utils/utils";

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
          ...((isNumberProp(prop) || isNumericProp(prop)) && {
            precision: prop.precision,
            scale: prop.scale,
            numberType: isNumberProp(prop) ? (prop.numberType ?? "numeric") : "numeric",
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
            // 조인 테이블에 걸린 인덱스 찾아와서 연결
            ...entity.indexes
              .filter((index) =>
                index.columns.find((col) => col.name.includes(`${prop.joinTable}.`)),
              )
              .map((index) => ({
                ...index,
                columns: index.columns.map((col) => ({
                  name: col.name.replace(`${prop.joinTable}.`, ""),
                  nullsFirst: col.nullsFirst,
                  sortOrder: col.sortOrder,
                })),
              })),
          ],
          columns: [
            {
              name: "id",
              type: "integer",
              nullable: false,
            },
            ...fields.map((field) => {
              return {
                name: field.split(".")[1],
                type: "integer",
                nullable: false,
              } as MigrationColumn;
            }),
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
        const idColumnName = `${prop.name}_id`;
        r.columns.push({
          name: idColumnName,
          type: "integer",
          nullable: prop.nullable ?? false,
        });
        if ((prop.useConstraint ?? true) === true) {
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
      columns: [] as MigrationColumn[],
      indexes: [] as MigrationIndex[],
      foreigns: [] as MigrationForeign[],
      joinTables: [] as MigrationJoinTable[],
    },
  );

  // indexes
  migrationSet.indexes = entity.indexes.filter((index) =>
    index.columns.find((col) => col.name.includes(".") === false),
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
    default:
      exhaustive(prop);
      throw new Error(`Unknown entity prop type: ${(prop as { type: string }).type}`);
  }
}

import assert from "assert";
import { writeFile } from "fs/promises";
import path from "path";

import inflection from "inflection";
import { group, unique } from "radashi";
import { z } from "zod";

import { Sonamu } from "../api/sonamu";
import {
  getEnumDefValues,
  getSubsetFields,
  isBelongsToOneRelationProp,
  isEnumProp,
  isHasManyRelationProp,
  isInternalSubsetField,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
  isRelationProp,
  isVirtualCodeProp,
  isVirtualProp,
  normalizeSubsetField,
} from "../types/types";
import {
  type Cone,
  type EntityIndex,
  type EntityJson,
  type EntityProp,
  type EntityPropNode,
  type EntitySubsetRow,
  type RelationProp,
  type SubsetField,
  type SubsetQuery,
} from "../types/types";
import { importMembers } from "../utils/esm-utils";
import { formatCode } from "../utils/formatter";
import { exists } from "../utils/fs-utils";
import { runtimePath } from "../utils/path-utils";
import { isStringValue } from "../utils/runtime-value";
import { assertDefined, nonNullable } from "../utils/utils";

type NestedSelect = { [key: string]: string | NestedSelect };
import { EntityManager } from "./entity-manager";

export class Entity {
  id: string;
  parentId?: string;
  table: string;
  title: string;
  cone?: Cone;
  names: {
    parentFs: string;
    fs: string;
    module: string;
  };
  props: EntityProp[];
  propsDict: {
    [key: string]: EntityProp;
  };
  relations: {
    [key: string]: RelationProp;
  };
  indexes: EntityIndex[];
  subsets: {
    [key: string]: string[];
  };
  subsetsInternal: {
    [key: string]: string[];
  };
  types: {
    [name: string]: z.ZodTypeAny;
  } = {};
  enums: {
    [enumId: string]: z.ZodEnum<Readonly<Record<string, string>>>;
  } = {};
  enumLabels: {
    [enumId: string]: {
      [key: string]: string;
    };
  } = {};
  enumCones: {
    [enumId: string]: Cone;
  } = {};
  subsetCones: {
    [subsetKey: string]: Cone;
  } = {};

  constructor({ id, parentId, table, title, cone, props, indexes, subsets, enums }: EntityJson) {
    // id
    this.id = id;
    this.parentId = parentId;
    this.title = title ?? this.id;
    this.table = table ?? inflection.underscore(inflection.pluralize(id));
    this.cone = cone;

    // props
    if (props) {
      this.props = props.map((prop) => {
        if (isEnumProp(prop)) {
          if (prop.id.includes("$Model")) {
            prop.id = prop.id.replace("$Model", id);
          }
        }
        return prop;
      });
      this.propsDict = Object.fromEntries(
        props.map((prop) => {
          return [prop.name, prop];
        }),
      );

      // relations
      this.relations = Object.fromEntries(
        props.filter((prop) => isRelationProp(prop)).map((prop) => [prop.name, prop]),
      );
    } else {
      this.props = [];
      this.propsDict = {};
      this.relations = {};
    }

    // indexes
    this.indexes = indexes ?? [];

    // subsets: SubsetDef에서 SubsetField[]를 추출하여 subsets(일반)와 subsetsInternal(internal)로 분리
    this.subsets = {};
    this.subsetsInternal = {};
    for (const [key, subsetDef] of Object.entries(subsets ?? {})) {
      const fields = getSubsetFields(subsetDef);
      this.subsets[key] = fields.filter((f) => !isInternalSubsetField(f)).map(normalizeSubsetField);
      this.subsetsInternal[key] = fields.filter(isInternalSubsetField).map(normalizeSubsetField);

      // cone 추출
      if (!Array.isArray(subsetDef) && "cone" in subsetDef && subsetDef.cone) {
        this.subsetCones[key] = subsetDef.cone;
      }
    }

    // enums: EnumDef에서 values와 cone를 추출하여 처리
    this.enumLabels = Object.fromEntries(
      Object.entries(enums ?? {}).map(([key, enumDef]) => {
        // cone 추출
        if ("values" in enumDef && "cone" in enumDef && enumDef.cone) {
          // SAFETY: 스키마 검증과 메타데이터 계약이 이 타입을 보장합니다.
          this.enumCones[key] = enumDef.cone as Cone;
        }
        return [key, getEnumDefValues(enumDef)];
      }),
    );
    this.enums = Object.fromEntries(
      Object.entries(this.enumLabels).map(([key, enumLabel]) => {
        // SAFETY: 스키마 검증과 메타데이터 계약이 이 타입을 보장합니다.
        return [key, z.enum(Object.keys(enumLabel))];
      }),
    );

    // names
    this.names = {
      parentFs: inflection.dasherize(inflection.underscore(parentId ?? id)).toLowerCase(),
      fs: inflection.dasherize(inflection.underscore(id)).toLowerCase(),
      module: id,
    };
  }

  /**
   * 쿼리용 서브셋 필드를 반환합니다 (subsets + subsetsInternal 합침)
   */
  getSubsetFieldsForQuery(subsetKey: string): string[] {
    return [...(this.subsets[subsetKey] ?? []), ...(this.subsetsInternal[subsetKey] ?? [])];
  }

  /**
   * 주어진 이름(subsetKey)의 subset을 실제로 가져오는 Puri 코드 구현체 string을 반환합니다.
   */
  getPuriSubsetQuery(subsetKey: string): string {
    const subset = this.getSubsetFieldsForQuery(subsetKey);
    const subsetQuery = this.resolveSubsetQuery("", subset);

    const lines: string[] = [];

    // from
    lines.push(`return qbWrapper`);
    lines.push(`.from("${this.table}")`);

    // join
    for (const join of subsetQuery.joins) {
      // join 메서드 결정: inner → join, outer → leftJoin
      // FK nullable 여부는 leftJoin 타입 시그니처에서 자동으로 판단됨
      const joinMethod = join.join === "inner" ? "join" : "leftJoin";

      if ("custom" in join) {
        // custom join clause는 raw 사용
        lines.push(
          `.${joinMethod}({ ${join.as}: "${join.table}" }, qbWrapper.knex.raw(\`${join.custom}\`))`,
        );
      } else {
        lines.push(`.${joinMethod}({ ${join.as}: "${join.table}" }, "${join.from}", "${join.to}")`);
      }
    }

    // select - 입체적 구조로 생성
    const selectObj = this.buildNestedSelectObject(subsetQuery.select);
    lines.push(`.select(${this.stringifyNestedSelectObject(selectObj)});`);

    return lines.join("\n");
  }

  /**
   * *.entity.json의 subset에 들어있는 필드 배열을 받아서,
   * Puri의 SelectObject 타입으로 변환합니다.
   *
   * 예: ["users.id", "parent.id", "parent.name"]
   *   → { id: "users.id", parent: { id: "parent.id", name: "parent.name" } }
   *
   * 언더바가 아닌 중첩 객체로 변환함에 유의하세요.
   * 이렇게 중첩 객체로 변환하여 select에 넘겨주면 ParseSelectObject 타입이 join된 객체의 타입을 잘 잡아줄 수 있습니다.
   * 즉, enhancer에서 row를 받았을 때 hydrate된 객체 자체의 nullity와 그 안쪽 필드의 nullity가 fk nullable 여부에 따라 잘 추론됩니다.
   */
  private buildNestedSelectObject(selectItems: string[]): NestedSelect {
    const result: NestedSelect = {};

    for (const selectItem of selectItems) {
      // "users.id" 또는 "users.id as user__id" 형태 파싱
      const match = selectItem.match(/^(.+?)(?: as (.+))?$/);
      if (!match) continue;

      const [, column, alias] = match;
      const columnValue = `"${column.trim()}"`;

      if (!alias || !alias.includes("__")) {
        // alias가 없거나 __를 포함하지 않으면 최상위 필드
        const key = alias ?? assertDefined(column.split(".").pop());
        result[key] = columnValue;
      } else {
        // alias가 __를 포함하면 입체 구조로 그룹화
        const parts = alias.split("__");
        let current = result;

        // 마지막 파트 전까지 중첩 객체 생성
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (part in current) {
            if (isStringValue(current[part])) {
              // 입력이 ["user", "user__id"] 같은 경우!
              // 애초에 말도 안 되지만 안전하게 예외를 던집니다.
              throw new Error(
                `Conflict detected in select items: parent path "${parts.slice(0, i + 1).join("__")}" is already set as a field, cannot nest "${alias}" under it.`,
              );
            }
          } else {
            current[part] = {};
          }
          current = current[part];
        }

        // 마지막 파트에 값 설정
        const lastPart = parts[parts.length - 1];
        current[lastPart] = columnValue;
      }
    }

    return Object.fromEntries(Object.entries(result));
  }

  /**
   * JSON.stringify와 유사한 일을 합니다.
   * 다만 주어진 객체를 JSON이 아닌 TypeScript 객체 리터럴 스트링으로 만들어줍니다.
   * key에 따옴표가 없어요.
   * 출력 예시:
   * ```typescript
   * {
   *   id: "users.id",
   *   parent: {
   *     id: "parent.id",
   *     name: "parent.name",
   *   },
   * }
   * ```
   * @param obj 변환할 객체
   * @param indent 들여쓰기 레벨
   * @param withBraces true면 중괄호 포함, false면 내용만 반환
   */
  private stringifyNestedSelectObject(
    obj: NestedSelect,
    indent: number = 0,
    withBraces: boolean = true,
  ): string {
    const spaces = "  ".repeat(indent);
    const innerSpaces = "  ".repeat(indent + 1);

    const entries = Object.entries(obj);
    if (entries.length === 0) return withBraces ? "{}" : "";

    const lines = entries.map(([key, value]) => {
      if (isStringValue(value)) {
        // 컬럼 경로 (이미 따옴표 포함)
        return `${innerSpaces}${key}: ${value},`;
      } else {
        // 중첩 객체 (항상 중괄호 포함)
        return `${innerSpaces}${key}: ${this.stringifyNestedSelectObject(value, indent + 1, true)},`;
      }
    });

    if (withBraces) {
      return `{\n${lines.join("\n")}\n${spaces}}`;
    } else {
      // 중괄호 없이 내용만 반환 (앞뒤 개행 제외)
      return lines.join("\n");
    }
  }

  getPuriLoaderQuery(subsetKey: string): string {
    const subset = this.getSubsetFieldsForQuery(subsetKey);
    const { loaders } = this.resolveSubsetQuery("", subset);

    const lines: string[] = [`[`];

    // 재귀적으로 loader 생성하는 헬퍼 함수
    const generateLoaderCode = (nestedLoaders: SubsetQuery["loaders"]): string[] => {
      const loaderLines: string[] = [];

      for (const loader of nestedLoaders) {
        const { toTable, toCol, through, fromTable } = loader.manyJoin;

        // fromTable의 Entity를 가져와서 PK 타입 확인
        const fromEntity = EntityManager.getByTable(fromTable);
        const fromIdsType = fromEntity.getPkArrayType();

        loaderLines.push(
          "{",
          `as: "${loader.as}",`,
          `refId: "${loader.manyJoin.idField}",`,
          `qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[] | string[]) => {`,
        );

        if (through === undefined) {
          // HasMany
          loaderLines.push(
            //
            "return qbWrapper",
            `.from("${toTable}")`,
          );

          loader.oneJoins.forEach((join: SubsetQuery["joins"][number]) => {
            // FK nullable 여부는 leftJoin 타입 시그니처에서 자동으로 판단됨
            const joinMethod = join.join === "inner" ? "join" : "leftJoin";
            if ("custom" in join) {
              // custom join clause는 callback 형태의 on 메서드로 처리합니다.
              loaderLines.push(
                `.${joinMethod}({ ${join.as}: "${join.table}" }, (j) => {`,
                `j.on(Puri.rawString("${join.custom}"));`,
                "})",
              );
            } else {
              loaderLines.push(
                `.${joinMethod}({ ${join.as}: "${join.table}" }, "${join.from}", "${join.to}")`,
              );
            }
          });

          // 입체적 select 구조 생성 (refId 포함)
          const selectObj = this.buildNestedSelectObject(loader.select);
          selectObj.refId = `"${toTable}.${toCol}"`;
          loaderLines.push(
            `.whereIn("${toTable}.${toCol}", fromIds as ${fromIdsType})`,
            `.select(${this.stringifyNestedSelectObject(selectObj)});`,
          );
        } else {
          // ManyToMany
          loaderLines.push(
            "return qbWrapper",
            `.from("${through.table}")`,
            `.join("${toTable}", "${through.table}.${through.toCol}", "${toTable}.${toCol}")`,
          );

          loader.oneJoins.forEach((join: SubsetQuery["joins"][number]) => {
            // FK nullable 여부는 leftJoin 타입 시그니처에서 자동으로 판단됨
            const joinMethod = join.join === "inner" ? "join" : "leftJoin";
            if ("custom" in join) {
              // custom join clause는 callback 형태의 on 메서드로 처리합니다.
              loaderLines.push(
                `.${joinMethod}({ ${join.as}: "${join.table}" }, (j) => {`,
                `j.on(Puri.rawString("${join.custom}"));`,
                "})",
              );
            } else {
              loaderLines.push(
                `.${joinMethod}({ ${join.as}: "${join.table}" }, "${join.from}", "${join.to}")`,
              );
            }
          });

          // 입체적 select 구조 생성 (refId 포함)
          const selectObj = this.buildNestedSelectObject(loader.select);
          selectObj.refId = `"${through.table}.${through.fromCol}"`;
          loaderLines.push(
            `.whereIn("${through.table}.${through.fromCol}", fromIds as ${fromIdsType})`,
            `.select(${this.stringifyNestedSelectObject(selectObj)});`,
          );
        }

        loaderLines.push(`},`);

        // 중첩 loaders 처리
        if (loader.loaders && loader.loaders.length > 0) {
          loaderLines.push("loaders: [", ...generateLoaderCode(loader.loaders), "],");
        }

        loaderLines.push("},");
      }

      return loaderLines;
    };

    lines.push(...generateLoaderCode(loaders));
    lines.push(`]`);

    return lines.join("\n");
  }

  /*
    subset SELECT/JOIN/LOADER 결과 리턴
  */
  getSubsetQuery(subsetKey: string): SubsetQuery {
    const subset = this.getSubsetFieldsForQuery(subsetKey);

    const result: SubsetQuery = this.resolveSubsetQuery("", subset);
    return result;
  }

  /*
   */
  resolveSubsetQuery(
    prefix: string,
    fields: string[],
    isAlreadyOuterJoined: boolean = false,
  ): SubsetQuery {
    // prefix 치환 (prefix는 ToOneRelation이 복수로 붙은 경우 모두 __로 변경됨)
    prefix = prefix.replace(/\./g, "__");

    // 서브셋을 1뎁스만 분리하여 그룹핑
    const subsetGroup = group(fields, (field) => {
      if (field.includes(".")) {
        const [rel] = field.split(".");
        return rel;
      } else {
        return "";
      }
    });

    const result = Object.keys(subsetGroup).reduce(
      (r, groupKey) => {
        const groupedFields = subsetGroup[groupKey];
        assert(groupedFields !== undefined, "fields is undefined");

        // 현재 테이블 필드셋은 select, virtual에 추가하고 리턴
        if (groupKey === "") {
          const realFields = groupedFields.filter((field) => !isVirtualProp(this.propsDict[field]));
          // virtualType: "code" (또는 undefined)인 virtual prop만 r.virtual에 추가
          // virtualType: "query"인 경우 사용자가 appendSelect로 직접 추가하므로 제외
          const virtualCodeFields = groupedFields.filter((field) =>
            isVirtualCodeProp(this.propsDict[field]),
          );

          if (prefix === "") {
            // 현재 테이블인 경우
            r.select = r.select.concat(realFields.map((field) => this.getFullFieldName(field)));
            r.virtual = r.virtual.concat(virtualCodeFields);
          } else {
            // 넘어온 테이블인 경우
            r.select = r.select.concat(
              realFields.map((field) => `${prefix}.${field} as ${prefix}__${field}`),
            );
          }

          return r;
        }

        const relation = this.relations[groupKey];
        if (relation === undefined) {
          throw new Error(`존재하지 않는 relation 참조 ${groupKey}`);
        }
        const relEntity = EntityManager.get(relation.with);

        if (isOneToOneRelationProp(relation) || isBelongsToOneRelationProp(relation)) {
          // -One Relation: JOIN 으로 처리
          const relFields = groupedFields.map((field) => field.split(".").slice(1).join("."));

          // -One Relation에서 id 필드만 참조하는 경우 릴레이션 넘기지 않고 리턴
          if (relFields.length === 1 && relFields[0] === "id") {
            if (prefix === "") {
              r.select = r.select.concat(`${this.table}.${groupKey}_id`);
            } else {
              r.select = r.select.concat(`${prefix}.${groupKey}_id as ${prefix}__${groupKey}_id`);
            }
            return r;
          }

          // innerOrOuter
          const innerOrOuter = (() => {
            if (isAlreadyOuterJoined) {
              return "outer";
            }

            if (isOneToOneRelationProp(relation)) {
              if (relation.hasJoinColumn && !(relation.nullable ?? false)) {
                return "inner";
              } else {
                return "outer";
              }
            } else {
              if (relation.nullable) {
                return "outer";
              } else {
                return "inner";
              }
            }
          })();
          const relSubsetQuery = relEntity.resolveSubsetQuery(
            `${prefix !== "" ? `${prefix}.` : ""}${groupKey}`,
            relFields,
            innerOrOuter === "outer",
          );
          r.select = r.select.concat(relSubsetQuery.select);
          r.virtual = r.virtual.concat(relSubsetQuery.virtual);

          const joinAs = prefix === "" ? groupKey : `${prefix}__${groupKey}`;
          const fromTable = prefix === "" ? this.table : prefix;

          let joinClause:
            | {
                from: string;
                to: string;
              }
            | {
                custom: string;
              };
          if (relation.customJoinClause) {
            joinClause = {
              custom: relation.customJoinClause,
            };
          } else {
            let from: string, to: string;
            if (isOneToOneRelationProp(relation)) {
              if (relation.hasJoinColumn) {
                from = `${fromTable}.${relation.name}_id`;
                to = `${joinAs}.id`;
              } else {
                from = `${fromTable}.id`;
                to = `${joinAs}.${inflection.underscore(this.names.fs.replace(/-/g, "_"))}_id`;
              }
            } else {
              from = `${fromTable}.${relation.name}_id`;
              to = `${joinAs}.id`;
            }
            joinClause = {
              from,
              to,
            };
          }

          r.joins.push({
            as: joinAs,
            join: innerOrOuter,
            table: relEntity.table,
            ...joinClause,
          });

          // BelongsToOne 밑에 HasMany가 붙은 경우
          if (relSubsetQuery.loaders.length > 0) {
            const convertedLoaders = relSubsetQuery.loaders.map((loader) => {
              const newAs = [groupKey, loader.as].join("__");
              return {
                as: newAs,
                table: loader.table,
                manyJoin: loader.manyJoin,
                oneJoins: loader.oneJoins,
                select: loader.select,
                loaders: loader.loaders,
              };
            });

            r.loaders = [...r.loaders, ...convertedLoaders];
          }

          r.joins = r.joins.concat(relSubsetQuery.joins);
        } else if (isHasManyRelationProp(relation) || isManyToManyRelationProp(relation)) {
          // -Many Relation: Loader 로 처리
          const relFields = groupedFields.map((field) => field.split(".").slice(1).join("."));
          const relSubsetQuery = relEntity.resolveSubsetQuery("", relFields);

          let manyJoin: SubsetQuery["loaders"][number]["manyJoin"];
          if (isHasManyRelationProp(relation)) {
            const fromCol = relation?.fromColumn ?? "id";
            manyJoin = {
              fromTable: this.table,
              fromCol,
              idField: prefix === "" ? `${fromCol}` : `${prefix}__${fromCol}`,
              toTable: relEntity.table,
              toCol: relation.joinColumn,
            };
          } else if (isManyToManyRelationProp(relation)) {
            manyJoin = {
              fromTable: this.table,
              fromCol: "id",
              idField: prefix === "" ? `id` : `${prefix}__id`,
              through: {
                table: relation.joinTable,
                fromCol: `${inflection.singularize(this.table)}_id`,
                toCol: `${inflection.singularize(relEntity.table)}_id`,
              },
              toTable: relEntity.table,
              toCol: "id",
            };
          } else {
            throw new Error();
          }

          r.loaders.push({
            as: groupKey,
            table: relEntity.table,
            manyJoin,
            oneJoins: relSubsetQuery.joins,
            select: relSubsetQuery.select,
            loaders: relSubsetQuery.loaders,
          });
        }

        return r;
      },
      // SAFETY: 스키마 검증과 메타데이터 계약이 이 타입을 보장합니다.
      {
        select: [],
        virtual: [],
        joins: [],
        loaders: [],
      } as SubsetQuery,
    );
    return result;
  }

  /*
    FieldExpr[] 을 EntityPropNode[] 로 변환
  */
  fieldExprsToPropNodes(fieldExprs: string[], entity: Entity = this): EntityPropNode[] {
    const groups = fieldExprs.reduce(
      (result, fieldExpr) => {
        let key: string, value: string, elseExpr: string[];
        if (fieldExpr.includes(".")) {
          [key, ...elseExpr] = fieldExpr.split(".");
          value = elseExpr.join(".");
        } else {
          key = "";
          value = fieldExpr;
        }
        result[key] = (result[key] ?? []).concat(value);

        return result;
      },
      // SAFETY: 스키마 검증과 메타데이터 계약이 이 타입을 보장합니다.
      {} as {
        [k: string]: string[];
      },
    );

    return Object.keys(groups).flatMap<EntityPropNode, EntityPropNode[]>((key) => {
      const groupedFieldExprs = groups[key];

      // 일반 prop 처리
      if (key === "") {
        return groupedFieldExprs.map((propName) => {
          const prop = entity.props.find((p) => p.name === propName);
          if (prop === undefined) {
            throw new Error(
              `${entity.id} -- 잘못된 FieldExpr '${propName}' (사용 가능한 props: ${entity.props.map((p) => p.name).join(", ")})`,
            );
          }
          return {
            nodeType: "plain" as const,
            prop,
          };
        });
      }

      // relation prop 처리
      const prop = entity.propsDict[key];
      if (!isRelationProp(prop)) {
        throw new Error(`잘못된 FieldExpr ${key}.${groupedFieldExprs[0]}`);
      }
      const relEntity = EntityManager.get(prop.with);

      // relation -One 에 id 필드 하나인 경우
      if (isBelongsToOneRelationProp(prop) || isOneToOneRelationProp(prop)) {
        if (
          groupedFieldExprs.length === 1 &&
          (groupedFieldExprs[0] === "id" || groupedFieldExprs[0] === "id?")
        ) {
          // id 하나만 있는지 체크해서, 하나만 있으면 상위 prop으로 id를 리턴
          const idProp = relEntity.propsDict.id;
          return {
            nodeType: "plain" as const,
            prop: {
              ...idProp,
              name: `${key}_id`,
              nullable: prop.nullable,
            },
          };
        }
      }

      // -One 그외의 경우 object로 리턴
      // -Many의 경우 array로 리턴
      // Recursive 로 뎁스 처리
      const children = this.fieldExprsToPropNodes(groupedFieldExprs, relEntity);
      const nodeType =
        isBelongsToOneRelationProp(prop) || isOneToOneRelationProp(prop)
          ? ("object" as const)
          : ("array" as const);

      return {
        nodeType,
        prop,
        children,
      };
    });
  }

  getFieldExprs(prefix = "", maxDepth: number = 3, froms: string[] = []): string[] {
    return this.props
      .flatMap((prop) => {
        const propName = [prefix, prop.name].filter((v) => v !== "").join(".");
        if (propName === prefix) {
          return null;
        }
        if (isRelationProp(prop)) {
          if (maxDepth < 0) {
            return null;
          }
          if (froms.includes(prop.with)) {
            // 역방향 relation인 경우 제외
            return null;
          }
          // 정방향 relation인 경우 recursive 콜
          const relMd = EntityManager.get(prop.with);
          return relMd.getFieldExprs(propName, maxDepth - 1, [...froms, this.id]);
        }
        return propName;
      })
      .filter((f) => f !== null);
  }

  /**
   * Relation prop이 현재 테이블에 FK 컬럼을 생성하는지 확인
   *(BelongsToOne 또는 OneToOne(hasJoinColumn=true)인 경우 FK 생성)
   */
  private hasForeignKey(prop: RelationProp): boolean {
    return (
      prop.relationType === "BelongsToOne" ||
      (prop.relationType === "OneToOne" && prop.hasJoinColumn)
    );
  }

  getTableColumns(): { name: string; type: string }[] {
    return this.props
      .map((prop) => {
        if (prop.type === "relation") {
          if (this.hasForeignKey(prop)) {
            return { name: `${prop.name}_id`, type: "int_unsigned" };
          } else {
            return null;
          }
        }
        return { name: prop.name, type: prop.type };
      })
      .filter(nonNullable);
  }

  /**
   * Entity에 정의된 모든 vector 타입 컬럼 반환
   */
  getVectorColumns(): EntityProp[] {
    return this.props.filter((p) => p.type === "vector");
  }

  /**
   * 특정 vector 컬럼 반환
   * @param columnName - 컬럼명 (생략 시 첫 번째 vector 컬럼)
   */
  getVectorColumn(columnName?: string): EntityProp | undefined {
    const vectorProps = this.getVectorColumns();
    if (columnName) {
      return vectorProps.find((p) => p.name === columnName);
    }
    return vectorProps[0];
  }

  /**
   * 필터링 가능한 props 반환
   *
   * - 일반 prop
   * - FK를 생성하는 relation (BelongsToOne, OneToOne with hasJoinColumn)
   *   → {name}_id 형태의 가상 integer prop으로 변환
   */
  getFilterableProps(): EntityProp[] {
    return this.props.flatMap((prop): EntityProp | EntityProp[] => {
      // Virtual prop 제외
      if (isVirtualProp(prop)) {
        return [];
      }

      // Relation prop 처리
      if (isRelationProp(prop)) {
        // FK를 생성하는 relation만 포함
        if (this.hasForeignKey(prop)) {
          // SAFETY: 스키마 검증과 메타데이터 계약이 이 타입을 보장합니다.
          return {
            name: `${prop.name}_id`,
            type: "integer",
            nullable: prop.nullable,
          } as EntityProp;
        }
        return [];
      }

      // 일반 prop 처리
      return prop;
    });
  }

  /**
   * Entity가 노출하는 타입 이름과 모듈 경로를 EntityManager에 등록합니다.
   *
   * @param explicitApiRootPath - Sonamu 초기화 없이 등록할 때 사용할 API 루트 경로
   */
  async registerModulePaths(explicitApiRootPath?: string) {
    const basePath = `${this.names.parentFs}`;

    // base-scheme
    EntityManager.setModulePath(`${this.id}BaseSchema`, `sonamu.generated`);

    // subset
    if (Object.keys(this.subsets).length > 0) {
      EntityManager.setModulePath(`${this.id}SubsetKey`, `sonamu.generated`);
      EntityManager.setModulePath(`${this.id}SubsetMapping`, `sonamu.generated`);
      for (const subsetKey of Object.keys(this.subsets)) {
        EntityManager.setModulePath(
          `${this.id}Subset${subsetKey.toUpperCase()}`,
          `sonamu.generated`,
        );
      }
    }

    // enums
    for (const enumId of Object.keys(this.enumLabels)) {
      EntityManager.setModulePath(enumId, `sonamu.generated`);
    }

    // types
    const typesModulePath = `${basePath}/${this.names.parentFs}.types`;
    const typesFilePath = path.join(
      explicitApiRootPath ?? Sonamu.apiRootPath,
      runtimePath(`dist/application/${typesModulePath}.js`),
    );

    if (await exists(typesFilePath)) {
      const importedMembers = await importMembers<z.ZodTypeAny>(typesFilePath);
      // SAFETY: 스키마 검증과 메타데이터 계약이 이 타입을 보장합니다.
      this.types = Object.fromEntries(
        importedMembers.map(({ name, value }) => {
          EntityManager.setModulePath(name, typesModulePath);
          return [name, value];
        }),
      ) as { [name: string]: z.ZodTypeAny };
    }
  }

  registerTableSpecs(): void {
    // 조인 테이블 인덱스 제외 (컬럼 이름에 '.'이 포함된 경우)
    const uniqueIndexes = this.indexes
      .filter((idx) => idx.type === "unique")
      .filter((idx) => idx.columns.every((col) => !col.name.includes(".")));

    EntityManager.setTableSpec({
      name: this.table,
      uniqueIndexes,
      jsonColumns: this.props.filter((p) => p.type === "json").map((p) => p.name),
    });
  }

  toJson(): EntityJson {
    // subsets와 subsetsInternal을 SubsetDef 형태로 복원 (cone 포함)
    const subsets: { [key: string]: import("../types/types").SubsetDef } = {};
    for (const key of Object.keys(this.subsets)) {
      const normalFields: SubsetField[] = this.subsets[key];
      const internalFields: SubsetField[] = (this.subsetsInternal[key] ?? []).map((field) => ({
        field,
        internal: true,
      }));
      const fields = [...normalFields, ...internalFields];

      // cone이 있으면 새로운 객체 형태로, 없으면 배열 형태로
      if (this.subsetCones[key]) {
        subsets[key] = {
          fields,
          cone: this.subsetCones[key],
        };
      } else {
        subsets[key] = fields;
      }
    }

    // enums를 EnumDef 형태로 복원 (cone 포함)
    const enums: { [key: string]: import("../types/types").EnumDef } = {};
    for (const [key, values] of Object.entries(this.enumLabels)) {
      // cone이 있으면 새로운 객체 형태로, 없으면 Record 형태로
      if (this.enumCones[key]) {
        enums[key] = {
          values,
          cone: this.enumCones[key],
        };
      } else {
        enums[key] = values;
      }
    }

    return {
      id: this.id,
      parentId: this.parentId,
      table: this.table,
      title: this.title,
      cone: this.cone,
      props: this.props,
      indexes: this.indexes,
      subsets,
      enums,
    };
  }

  async save(): Promise<void> {
    // sort: subsets
    const subsetRows = this.getSubsetRows();
    this.subsets = Object.fromEntries(
      Object.entries(this.subsets).map(([subsetKey]) => {
        return [subsetKey, this.subsetRowsToSubsetFields(subsetRows, subsetKey, false)];
      }),
    );
    this.subsetsInternal = Object.fromEntries(
      Object.entries(this.subsetsInternal).map(([subsetKey]) => {
        return [subsetKey, this.subsetRowsToSubsetFields(subsetRows, subsetKey, true)];
      }),
    );

    // save
    const jsonPath = path.join(
      Sonamu.apiRootPath,
      `src/application/${this.names.parentFs}/${this.names.fs}.entity.json`,
    );
    const json = this.toJson();
    await writeFile(jsonPath, await formatCode(JSON.stringify(json), jsonPath));

    // reload
    await EntityManager.register(json);
  }

  /**
   * 템플릿 cone 메타데이터를 생성합니다.
   *
   * LLM을 사용하지 않고 faker-mappings.ts를 활용하여 기본 cone을 생성합니다.
   * stub entity 생성 시 자동으로 호출되어 최소한의 cone 메타데이터를 제공합니다.
   *
   * @param locale - 생성 시 사용할 locale (기본값: Sonamu.config.i18n.defaultLocale 또는 "ko")
   */
  async generateTemplateCones(locale?: "ko" | "en" | "ja"): Promise<void> {
    const { generateTemplateCones } = await import("./entity-template-cone");
    const configLocale = Sonamu.config.i18n?.defaultLocale;
    const effectiveLocale =
      locale ||
      (configLocale === "ko" || configLocale === "en" || configLocale === "ja"
        ? configLocale
        : "ko");
    const result = generateTemplateCones(this.toJson(), effectiveLocale);

    // 결과를 Entity에 적용 (applyCones와 동일한 방식)
    if (result.entityCone) {
      this.cone = result.entityCone;
    }

    for (const [propName, cone] of Object.entries(result.propCones)) {
      const prop = this.props.find((p) => p.name === propName);
      if (prop) {
        // SAFETY: 스키마 검증과 메타데이터 계약이 이 타입을 보장합니다.
        (prop as { cone?: Cone }).cone = cone;
      }
    }

    this.enumCones = { ...this.enumCones, ...result.enumCones };
    this.subsetCones = { ...this.subsetCones, ...result.subsetCones };

    await this.save();
  }

  /**
   * LLM을 사용하여 cone 메타데이터를 생성합니다.
   *
   * @param options.preserveExisting - 기존 cone 보존 여부 (기본값: true)
   * @param options.onlyEmpty - fixtureHint가 없는 cone만 생성 (기본값: false)
   * @param options.locale - 생성 시 사용할 locale (기본값: "ko")
   */
  async generateCones(options?: {
    preserveExisting?: boolean;
    onlyEmpty?: boolean;
    locale?: "ko" | "en" | "ja";
    /** 테스트나 대체 LLM 공급자를 위한 텍스트 생성 구현 */
    generateText?: import("../cone/cone-generator").ConeTextGenerator;
    /** false이면 생성 결과를 메모리에만 적용하고 entity 파일은 저장하지 않습니다. */
    persist?: boolean;
  }): Promise<import("../cone/cone-generator").ConeGenerationResult> {
    const { generateCones } = await import("../cone/cone-generator");
    const context: import("../cone/cone-generator").ConeGenerationContext = {
      entity: this.toJson(),
      locale: options?.locale || "ko",
      existingCones: options?.preserveExisting !== false ? this.collectExistingCones() : undefined,
      onlyEmpty: options?.onlyEmpty ?? false,
    };

    const result = await generateCones(context, { generateText: options?.generateText });
    this.applyCones(result);
    if (options?.persist !== false) {
      await this.save();
    }
    return result;
  }

  /**
   * 기존 cone들을 수집합니다 (entity, props, enums, subsets).
   *
   * @returns 키가 "entity:id", "prop:name", "enum:enumId", "subset:key" 형식인 cone 맵
   */
  collectExistingCones(): Record<string, Cone> {
    const coneEntries: [string, Cone][] = [];

    if (this.cone) {
      coneEntries.push([`entity:${this.id}`, this.cone]);
    }

    for (const prop of this.props) {
      if (prop.cone) {
        coneEntries.push([`prop:${prop.name}`, prop.cone]);
      }
    }

    for (const [enumId, cone] of Object.entries(this.enumCones)) {
      coneEntries.push([`enum:${enumId}`, cone]);
    }

    for (const [subsetKey, cone] of Object.entries(this.subsetCones)) {
      coneEntries.push([`subset:${subsetKey}`, cone]);
    }

    return Object.fromEntries(coneEntries);
  }

  /**
   * 생성된 cone들을 Entity에 적용합니다.
   *
   * @param result - LLM으로 생성된 cone 결과
   */
  applyCones(result: import("../cone/cone-generator").ConeGenerationResult): void {
    if (result.entityCone) {
      this.cone = result.entityCone;
    }

    for (const [propName, cone] of Object.entries(result.propCones)) {
      const prop = this.props.find((p) => p.name === propName);
      if (prop) {
        // SAFETY: 스키마 검증과 메타데이터 계약이 이 타입을 보장합니다.
        (prop as { cone?: Cone }).cone = cone;
      }
    }

    this.enumCones = { ...this.enumCones, ...result.enumCones };
    this.subsetCones = { ...this.subsetCones, ...result.subsetCones };
  }

  getSubsetRows(
    _subsets?: { [key: string]: string[] },
    _subsetsInternal?: { [key: string]: string[] },
    prefixes: string[] = [],
  ): EntitySubsetRow[] {
    if (prefixes.length > 10) {
      return [];
    }

    const subsets = _subsets ?? this.subsets;
    const subsetsInternal = _subsetsInternal ?? this.subsetsInternal;
    const subsetKeys = Object.keys(subsets);
    const allFields = unique(subsetKeys.flatMap((key) => subsets[key]));
    // internal 필드도 allFields에 포함 (relation 탐색용)
    const allInternalFields = unique(subsetKeys.flatMap((key) => subsetsInternal[key] ?? []));
    const combinedFields = unique([...allFields, ...allInternalFields]);

    return this.props.map((prop) => {
      if (
        prop.type === "relation" &&
        combinedFields.find((f) => f.startsWith(`${[...prefixes, prop.name].join(".")}.`))
      ) {
        const relEntity = EntityManager.get(prop.with);
        const children = relEntity.getSubsetRows(subsets, subsetsInternal, [
          ...prefixes,
          `${prop.name}`,
        ]);

        return {
          field: prop.name,
          children,
          relationEntity: prop.with,
          prefixes,
          isOpen: children.length > 0,
          has: Object.fromEntries(
            subsetKeys.map((subsetKey) => {
              return [subsetKey, children.every((child) => child.has[subsetKey])];
            }),
          ),
          isInternal: Object.fromEntries(
            subsetKeys.map((subsetKey) => {
              return [subsetKey, children.every((child) => child.isInternal[subsetKey])];
            }),
          ),
        };
      }

      const field = [...prefixes, prop.name].join(".");
      return {
        field: prop.name,
        children: [],
        relationEntity: prop.type === "relation" ? prop.with : undefined,
        prefixes,
        has: Object.fromEntries(
          subsetKeys.map((subsetKey) => {
            const subsetFields = subsets[subsetKey];
            const has = subsetFields.some((f) => {
              return f === field || f.startsWith(`${field}.`);
            });
            return [subsetKey, has];
          }),
        ),
        isInternal: Object.fromEntries(
          subsetKeys.map((subsetKey) => {
            const internalFields = subsetsInternal[subsetKey] ?? [];
            const isInternal = internalFields.some((f) => {
              return f === field || f.startsWith(`${field}.`);
            });
            return [subsetKey, isInternal];
          }),
        ),
      };
    });
  }

  subsetRowsToSubsetFields(
    subsetRows: EntitySubsetRow[],
    subsetKey: string,
    internal: boolean = false,
  ): string[] {
    const hasKey = internal ? "isInternal" : "has";
    return subsetRows
      .map((subsetRow) => {
        if (subsetRow.children.length > 0) {
          return this.subsetRowsToSubsetFields(subsetRow.children, subsetKey, internal);
        } else if (subsetRow[hasKey][subsetKey]) {
          return subsetRow.prefixes.concat(subsetRow.field).join(".");
        } else {
          return null;
        }
      })
      .filter(nonNullable)
      .flat();
  }

  async createProp(prop: EntityProp, at?: number): Promise<void> {
    if (!at) {
      this.props.push(prop);
    } else {
      this.props.splice(at, 0, prop);
    }
    await this.save();
  }

  analyzeSubsetField(subsetField: string): {
    entityId: string;
    propName: string;
  }[] {
    const arr = subsetField.split(".");

    let entityId = this.id;
    const result: {
      entityId: string;
      propName: string;
    }[] = [];
    for (let i = 0; i < arr.length; i++) {
      const propName = arr[i];
      result.push({
        entityId,
        propName,
      });

      const prop = EntityManager.get(entityId).props.find((p) => p.name === propName);
      if (!prop) {
        throw new Error(`${entityId}의 잘못된 서브셋키 ${subsetField}`);
      }
      if (isRelationProp(prop)) {
        entityId = prop.with;
      }
    }
    return result;
  }

  async modifyProp(newProp: EntityProp, at: number): Promise<void> {
    // 이전 프롭 이름 저장
    const oldName = this.props[at].name;

    // 저장할 엔티티
    const entities: Entity[] = [this];

    // 이름이 바뀐 경우
    if (oldName !== newProp.name) {
      // 전체 엔티티에서 현재 수정된 프롭을 참조하고 있는 모든 서브셋필드 찾아서 수정
      const allEntityIds = EntityManager.getAllIds();
      for (const relEntityId of allEntityIds) {
        const relEntity = EntityManager.get(relEntityId);
        const relEntitySubsetKeys = Object.keys(relEntity.subsets);
        for (const subsetKey of relEntitySubsetKeys) {
          const subset = relEntity.subsets[subsetKey];

          // 서브셋 필드를 순회하며, 엔티티-프롭 단위로 분석한 후 현재 엔티티-프롭과 일치하는 경우 수정 처리
          const modifiedSubsetFields = subset.map((subsetField) => {
            const analyzed = relEntity.analyzeSubsetField(subsetField);
            const modified = analyzed.map((a) =>
              a.propName === oldName && a.entityId === this.id
                ? {
                    ...a,
                    propName: newProp.name,
                  }
                : a,
            );
            // 분석한 필드를 다시 서브셋 필드로 복구
            return modified.map((a) => a.propName).join(".");
          });

          if (subset.join(",") !== modifiedSubsetFields.join(",")) {
            relEntity.subsets[subsetKey] = modifiedSubsetFields;
            entities.push(relEntity);
          }
        }
      }
    }

    // 프롭 수정
    this.props[at] = newProp;

    await Promise.all(entities.map(async (entity) => entity.save()));
  }

  async delProp(at: number): Promise<void> {
    // 이전 프롭 이름 저장
    const oldName = this.props[at].name;

    // 저장할 엔티티
    const entities: Entity[] = [this];

    // 전체 엔티티에서 현재 삭제된 프롭을 참조하고 있는 모든 서브셋필드 찾아서 제외
    const allEntityIds = EntityManager.getAllIds();
    for (const relEntityId of allEntityIds) {
      const relEntity = EntityManager.get(relEntityId);
      const relEntitySubsetKeys = Object.keys(relEntity.subsets);
      for (const subsetKey of relEntitySubsetKeys) {
        const subset = relEntity.subsets[subsetKey];
        // 서브셋 필드를 순회하며, 엔티티-프롭 단위로 분석한 후 현재 엔티티-프롭과 일치하는 경우 이후의 필드를 제외
        const modifiedSubsetFields = subset
          .map((subsetField) => {
            const analyzed = relEntity.analyzeSubsetField(subsetField);
            if (analyzed.find((a) => a.propName === oldName && a.entityId === this.id)) {
              return null;
            } else {
              return subsetField;
            }
          })
          .filter(nonNullable);

        if (subset.join(",") !== modifiedSubsetFields.join(",")) {
          relEntity.subsets[subsetKey] = modifiedSubsetFields;
          entities.push(relEntity);
        }
      }
    }

    // 현재 엔티티의 인덱스에서 제외
    for (const index of EntityManager.get(this.id).indexes) {
      index.columns = index.columns.filter((col) => col.name !== oldName);
    }

    // 프롭 삭제
    this.props.splice(at, 1);

    await Promise.all(entities.map(async (entity) => entity.save()));
  }

  getEntityIdFromSubsetField(subsetField: string): string {
    if (!subsetField.includes(".")) {
      return this.id;
    }

    // 서브셋 필드의 마지막은 프롭이므로 제외
    const arr = subsetField.split(".").slice(0, -1);

    // 서브셋 필드를 내려가면서 마지막으로 relation된 엔티티를 찾음
    const lastEntityId = arr.reduce((entityId, field) => {
      const relProp = EntityManager.get(entityId).props.find((p) => p.name === field);
      if (!relProp || relProp.type !== "relation") {
        console.debug({ arr, thisId: this.id, entityId, field });
        throw new Error(`잘못된 서브셋키 ${subsetField}`);
      }
      return relProp.with;
    }, this.id);
    return lastEntityId;
  }

  async moveProp(at: number, to: number): Promise<void> {
    const prop = this.props[at];
    const newProps = [...this.props];
    newProps.splice(to, 0, prop);
    newProps.splice(at < to ? at : at + 1, 1);
    this.props = newProps;

    await this.save();
  }

  /**
   * 필드명을 "테이블명.필드명" 형식으로 변환
   */
  getFullFieldName(field: string): string {
    if (field.includes(".")) {
      return field;
    }
    return `${this.table}.${field}`;
  }

  /**
   * 엔티티의 PK 타입을 반환합니다.
   * id 필드의 타입을 기준으로 "integer" | "string" | "uuid"를 반환합니다.
   */
  getPkType(): "integer" | "string" | "uuid" {
    const idProp = this.propsDict.id;
    if (!idProp) {
      throw new Error(`Entity ${this.id}에 id 필드가 없습니다`);
    }
    if (idProp.type === "string" || idProp.type === "uuid") {
      return idProp.type;
    }
    return "integer";
  }

  /**
   * 엔티티의 PK prop을 반환합니다.
   * length 등 세부 정보에 접근할 때 사용합니다.
   */
  getPkProp(): EntityProp {
    const idProp = this.propsDict.id;
    if (!idProp) {
      throw new Error(`Entity ${this.id}에 id 필드가 없습니다`);
    }
    return idProp;
  }

  /**
   * 엔티티의 PK 배열 타입을 반환합니다.
   * LoaderQuery의 fromIds 타입으로 사용됩니다.
   */
  getPkArrayType(): string {
    const pkType = this.getPkType();
    return pkType === "integer" ? "number[]" : "string[]";
  }
}

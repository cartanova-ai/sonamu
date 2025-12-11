import assert from "assert";
import { writeFile } from "fs/promises";
import inflection from "inflection";
import path from "path";
import { group, unique } from "radashi";
import { z } from "zod";
import { Sonamu } from "../api/sonamu";
import {
  type EntityIndex,
  type EntityJson,
  type EntityProp,
  type EntityPropNode,
  type EntitySubsetRow,
  isBelongsToOneRelationProp,
  isEnumProp,
  isHasManyRelationProp,
  isManyToManyRelationProp,
  isOneToOneRelationProp,
  isRelationProp,
  isVirtualProp,
  type RelationProp,
  type StringProp,
  type SubsetQuery,
} from "../types/types";
import { importMembers } from "../utils/esm-utils";
import { formatCode } from "../utils/formatter";
import { exists } from "../utils/fs-utils";
import { runtimePath } from "../utils/path-utils";
import { assertDefined, nonNullable } from "../utils/utils";
import { EntityManager } from "./entity-manager";

export class Entity {
  id: string;
  parentId?: string;
  table: string;
  title: string;
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

  constructor({ id, parentId, table, title, props, indexes, subsets, enums }: EntityJson) {
    // id
    this.id = id;
    this.parentId = parentId;
    this.title = title ?? this.id;
    this.table = table ?? inflection.underscore(inflection.pluralize(id));

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

    // subsets
    this.subsets = subsets ?? {};

    // enums
    this.enumLabels = enums ?? {};
    this.enums = Object.fromEntries(
      Object.entries(this.enumLabels).map(([key, enumLabel]) => {
        return [key, z.enum(Object.keys(enumLabel) as unknown as readonly [string, ...string[]])];
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
   * 주어진 이름(subsetKey)의 subset을 실제로 가져오는 Puri 코드 구현체 string을 반환합니다.
   */
  getPuriSubsetQuery(subsetKey: string): string {
    const subset = this.subsets[subsetKey];
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
  private buildNestedSelectObject(
    selectItems: string[],
    // biome-ignore lint/suspicious/noExplicitAny: 반환 오브젝트의 값은 string일 수도 있고 또다른 오브젝트일 수도 있는데, 이를 재귀 타입으로 나타낼 수 없어 any로 처리합니다.
  ): Record<string, any> {
    const result: ReturnType<typeof this.buildNestedSelectObject> = {};

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
            if (typeof current[part] === "string") {
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

    return result;
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
    // biome-ignore lint/suspicious/noExplicitAny: 중첩 오브젝트의 값은 string일 수도 있고 또다른 오브젝트일 수도 있는데, 이를 재귀 타입으로 나타낼 수 없어 any로 처리합니다.
    obj: Record<string, any>,
    indent: number = 0,
    withBraces: boolean = true,
  ): string {
    const spaces = "  ".repeat(indent);
    const innerSpaces = "  ".repeat(indent + 1);

    const entries = Object.entries(obj);
    if (entries.length === 0) return withBraces ? "{}" : "";

    const lines = entries.map(([key, value]) => {
      if (typeof value === "string") {
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
    const subset = this.subsets[subsetKey];
    const { loaders } = this.resolveSubsetQuery("", subset);

    const lines: string[] = [`[`];

    // 재귀적으로 loader 생성하는 헬퍼 함수
    const generateLoaderCode = (loaders: SubsetQuery["loaders"]): string[] => {
      const loaderLines: string[] = [];

      for (const loader of loaders) {
        const { toTable, toCol, through } = loader.manyJoin;
        loaderLines.push(
          "{",
          `as: "${loader.as}",`,
          `refId: "${loader.manyJoin.idField}",`,
          `qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {`,
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
              // FIXME: 검증 필요
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
            `.whereIn("${toTable}.${toCol}", fromIds)`,
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
              // FIXME: 검증 필요
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
            `.whereIn("${through.table}.${through.fromCol}", fromIds)`,
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
    const subset = this.subsets[subsetKey];

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
        const fields = subsetGroup[groupKey];
        assert(fields !== undefined, "fields is undefined");

        // 현재 테이블 필드셋은 select, virtual에 추가하고 리턴
        if (groupKey === "") {
          const realFields = fields.filter((field) => !isVirtualProp(this.propsDict[field]));
          const virtualFields = fields.filter((field) => isVirtualProp(this.propsDict[field]));

          if (prefix === "") {
            // 현재 테이블인 경우
            r.select = r.select.concat(realFields.map((field) => `${this.table}.${field}`));
            r.virtual = r.virtual.concat(virtualFields);
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
          const relFields = fields.map((field) => field.split(".").slice(1).join("."));

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
              if (relation.hasJoinColumn === true && (relation.nullable ?? false) === false) {
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
          const relFields = fields.map((field) => field.split(".").slice(1).join("."));
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
      {} as {
        [k: string]: string[];
      },
    );

    return Object.keys(groups).flatMap((key) => {
      const group = groups[key];

      // 일반 prop 처리
      if (key === "") {
        return group.map((propName) => {
          // FIXME: 이거 나중에 없애야함
          if (propName === "말도안되는프롭명__이거왜타입처리가꼬여서이러지?") {
            return {
              nodeType: "plain" as const,
              prop: {
                type: "string",
                name: "uuid",
                length: 128,
              } as StringProp,
              children: [],
            } as EntityPropNode;
          }

          const prop = entity.props.find((p) => p.name === propName);
          if (prop === undefined) {
            console.log({ propName, groups });
            throw new Error(`${entity.id} -- 잘못된 FieldExpr ${propName}`);
          }
          return {
            nodeType: "plain" as const,
            prop,
            children: [],
          };
        });
      }

      // relation prop 처리
      const prop = entity.propsDict[key];
      if (!isRelationProp(prop)) {
        throw new Error(`잘못된 FieldExpr ${key}.${group[0]}`);
      }
      const relEntity = EntityManager.get(prop.with);

      // relation -One 에 id 필드 하나인 경우
      if (isBelongsToOneRelationProp(prop) || isOneToOneRelationProp(prop)) {
        if (group.length === 1 && (group[0] === "id" || group[0] === "id?")) {
          // id 하나만 있는지 체크해서, 하나만 있으면 상위 prop으로 id를 리턴
          const idProp = relEntity.propsDict.id;
          return {
            nodeType: "plain" as const,
            prop: {
              ...idProp,
              name: `${key}_id`,
              nullable: prop.nullable,
            },
            children: [],
          };
        }
      }

      // -One 그외의 경우 object로 리턴
      // -Many의 경우 array로 리턴
      // Recursive 로 뎁스 처리
      const children = this.fieldExprsToPropNodes(group, relEntity);
      const nodeType =
        isBelongsToOneRelationProp(prop) || isOneToOneRelationProp(prop)
          ? ("object" as const)
          : ("array" as const);

      return {
        prop,
        children,
        nodeType,
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
      .filter((f) => f !== null) as string[];
  }

  getTableColumns(): { name: string; type: string }[] {
    return this.props
      .map((prop) => {
        if (prop.type === "relation") {
          if (
            prop.relationType === "BelongsToOne" ||
            (prop.relationType === "OneToOne" && prop.hasJoinColumn === true)
          ) {
            return { name: `${prop.name}_id`, type: "int_unsigned" };
          } else {
            return null;
          }
        }
        return { name: prop.name, type: prop.type };
      })
      .filter(nonNullable);
  }

  async registerModulePaths() {
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
      Sonamu.apiRootPath,
      runtimePath(`dist/application/${typesModulePath}.js`),
    );

    if (await exists(typesFilePath)) {
      const importedMembers = await importMembers<z.ZodTypeAny>(typesFilePath);
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
    });
  }

  toJson(): EntityJson {
    return {
      id: this.id,
      parentId: this.parentId,
      table: this.table,
      title: this.title,
      props: this.props,
      indexes: this.indexes,
      subsets: this.subsets,
      enums: this.enumLabels,
    };
  }

  async save(): Promise<void> {
    // sort: subsets
    const subsetRows = this.getSubsetRows();
    this.subsets = Object.fromEntries(
      Object.entries(this.subsets).map(([subsetKey]) => {
        return [subsetKey, this.subsetRowsToSubsetFields(subsetRows, subsetKey)];
      }),
    );

    // save
    const jsonPath = path.join(
      Sonamu.apiRootPath,
      `src/application/${this.names.parentFs}/${this.names.fs}.entity.json`,
    );
    const json = this.toJson();
    await writeFile(jsonPath, formatCode(JSON.stringify(json), "json", jsonPath));

    // reload
    await EntityManager.register(json);
  }

  getSubsetRows(
    _subsets?: { [key: string]: string[] },
    prefixes: string[] = [],
  ): EntitySubsetRow[] {
    if (prefixes.length > 10) {
      return [];
    }

    const subsets = _subsets ?? this.subsets;
    const subsetKeys = Object.keys(subsets);
    const allFields = unique(subsetKeys.flatMap((key) => subsets[key]));

    return this.props.map((prop) => {
      if (
        prop.type === "relation" &&
        allFields.find((f) => f.startsWith(`${[...prefixes, prop.name].join(".")}.`))
      ) {
        const relEntity = EntityManager.get(prop.with);
        const children = relEntity.getSubsetRows(subsets, [...prefixes, `${prop.name}`]);

        return {
          field: prop.name,
          children,
          relationEntity: prop.with,
          prefixes,
          isOpen: children.length > 0,
          has: Object.fromEntries(
            subsetKeys.map((subsetKey) => {
              return [subsetKey, children.every((child) => child.has[subsetKey] === true)];
            }),
          ),
        };
      }

      return {
        field: prop.name,
        children: [],
        relationEntity: prop.type === "relation" ? prop.with : undefined,
        prefixes,
        has: Object.fromEntries(
          subsetKeys.map((subsetKey) => {
            const subsetFields = subsets[subsetKey];
            const has = subsetFields.some((f) => {
              const field = [...prefixes, prop.name].join(".");
              return f === field || f.startsWith(`${field}.`);
            });
            return [subsetKey, has];
          }),
        ),
      };
    });
  }

  subsetRowsToSubsetFields(subsetRows: EntitySubsetRow[], subsetKey: string): string[] {
    return subsetRows
      .map((subsetRow) => {
        if (subsetRow.children.length > 0) {
          return this.subsetRowsToSubsetFields(subsetRow.children, subsetKey);
        } else if (subsetRow.has[subsetKey]) {
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
    if (subsetField.includes(".") === false) {
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
}

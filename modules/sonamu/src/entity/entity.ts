import { groupBy, uniq } from "lodash";
import { EntityManager as EntityManager } from "./entity-manager";
import { dasherize, pluralize, underscore } from "inflection";
import {
  EntityProp,
  RelationProp,
  isRelationProp,
  SubsetQuery,
  isVirtualProp,
  isBelongsToOneRelationProp,
  isOneToOneRelationProp,
  isHasManyRelationProp,
  isManyToManyRelationProp,
  EntityPropNode,
  isEnumProp,
  StringProp,
  EntityIndex,
  EntityJson,
  EntitySubsetRow,
} from "../types/types";
import inflection from "inflection";
import path from "path";
import { existsSync, writeFileSync } from "fs";
import { z } from "zod";
import { Sonamu } from "../api/sonamu";
import prettier from "prettier";
import { nonNullable } from "../utils/utils";

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
    [enumId: string]: z.ZodEnum<any>;
  } = {};
  enumLabels: {
    [enumId: string]: {
      [key: string]: string;
    };
  } = {};

  constructor({
    id,
    parentId,
    table,
    title,
    props,
    indexes,
    subsets,
    enums,
  }: EntityJson) {
    // id
    this.id = id;
    this.parentId = parentId;
    this.title = title ?? this.id;
    this.table = table ?? underscore(pluralize(id));

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
      this.propsDict = props.reduce((result, prop) => {
        return {
          ...result,
          [prop.name]: prop,
        };
      }, {});

      // relations
      this.relations = props
        .filter((prop) => isRelationProp(prop))
        .reduce((result, prop) => {
          return {
            ...result,
            [prop.name]: prop,
          };
        }, {});
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
        return [
          key,
          z.enum(
            Object.keys(enumLabel) as unknown as readonly [string, ...string[]]
          ),
        ];
      })
    );

    // names
    this.names = {
      parentFs: dasherize(underscore(parentId ?? id)).toLowerCase(),
      fs: dasherize(underscore(id)).toLowerCase(),
      module: id,
    };

    this.registerModulePaths();
    this.registerTableSpecs();
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
    isAlreadyOuterJoined: boolean = false
  ): SubsetQuery {
    // prefix 치환 (prefix는 ToOneRelation이 복수로 붙은 경우 모두 __로 변경됨)
    prefix = prefix.replace(/\./g, "__");

    // 서브셋을 1뎁스만 분리하여 그룹핑
    const subsetGroup = groupBy(fields, (field) => {
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
        // 현재 테이블 필드셋은 select, virtual에 추가하고 리턴
        if (groupKey === "") {
          const realFields = fields.filter(
            (field) => !isVirtualProp(this.propsDict[field])
          );
          const virtualFields = fields.filter((field) =>
            isVirtualProp(this.propsDict[field])
          );

          if (prefix === "") {
            // 현재 테이블인 경우
            r.select = r.select.concat(
              realFields.map((field) => `${this.table}.${field}`)
            );
            r.virtual = r.virtual.concat(virtualFields);
          } else {
            // 넘어온 테이블인 경우
            r.select = r.select.concat(
              realFields.map(
                (field) => `${prefix}.${field} as ${prefix}__${field}`
              )
            );
          }

          return r;
        }

        const relation = this.relations[groupKey];
        if (relation === undefined) {
          throw new Error(`존재하지 않는 relation 참조 ${groupKey}`);
        }
        const relEntity = EntityManager.get(relation.with);

        if (
          isOneToOneRelationProp(relation) ||
          isBelongsToOneRelationProp(relation)
        ) {
          // -One Relation: JOIN 으로 처리
          const relFields = fields.map((field) =>
            field.split(".").slice(1).join(".")
          );

          // -One Relation에서 id 필드만 참조하는 경우 릴레이션 넘기지 않고 리턴
          if (relFields.length === 1 && relFields[0] === "id") {
            if (prefix === "") {
              r.select = r.select.concat(`${this.table}.${groupKey}_id`);
            } else {
              r.select = r.select.concat(
                `${prefix}.${groupKey}_id as ${prefix}__${groupKey}_id`
              );
            }
            return r;
          }

          // innerOrOuter
          const innerOrOuter = (() => {
            if (isAlreadyOuterJoined) {
              return "outer";
            }

            if (isOneToOneRelationProp(relation)) {
              if (
                relation.hasJoinColumn === true &&
                (relation.nullable ?? false) === false
              ) {
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
            `${prefix !== "" ? prefix + "." : ""}${groupKey}`,
            relFields,
            innerOrOuter === "outer"
          );
          r.select = r.select.concat(relSubsetQuery.select);
          r.virtual = r.virtual.concat(relSubsetQuery.virtual);

          const joinAs = prefix === "" ? groupKey : prefix + "__" + groupKey;
          const fromTable = prefix === "" ? this.table : prefix;

          let joinClause;
          if (relation.customJoinClause) {
            joinClause = {
              custom: relation.customJoinClause,
            };
          } else {
            let from, to;
            if (isOneToOneRelationProp(relation)) {
              if (relation.hasJoinColumn) {
                from = `${fromTable}.${relation.name}_id`;
                to = `${joinAs}.id`;
              } else {
                from = `${fromTable}.id`;
                to = `${joinAs}.${underscore(
                  this.names.fs.replace(/\-/g, "_")
                )}_id`;
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
              };
            });

            r.loaders = [...r.loaders, ...convertedLoaders];
          }

          r.joins = r.joins.concat(relSubsetQuery.joins);
        } else if (
          isHasManyRelationProp(relation) ||
          isManyToManyRelationProp(relation)
        ) {
          // -Many Relation: Loader 로 처리
          const relFields = fields.map((field) =>
            field.split(".").slice(1).join(".")
          );
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
            const [table1, table2] = relation.joinTable.split("__");
            const throughTables = (() => {
              // 동일 테이블 릴레이션인 경우
              if (this.table === relEntity.table) {
                if (table1 === this.table) {
                  return {
                    fromCol: `${inflection.singularize(table1)}_id`,
                    toCol: `${inflection.singularize(table2)}_id`,
                  };
                } else {
                  return {
                    fromCol: `${inflection.singularize(table2)}_id`,
                    toCol: `${inflection.singularize(table1)}_id`,
                  };
                }
              } else {
                // 서로 다른 테이블인 경우 릴레이션 테이블 유지
                return {
                  fromCol: `${inflection.singularize(this.table)}_id`,
                  toCol: `${inflection.singularize(relEntity.table)}_id`,
                };
              }
            })();

            manyJoin = {
              fromTable: this.table,
              fromCol: "id",
              idField: prefix === "" ? `id` : `${prefix}__id`,
              through: {
                table: relation.joinTable,
                ...throughTables,
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
      } as SubsetQuery
    );
    return result;
  }

  /*
    FieldExpr[] 을 EntityPropNode[] 로 변환
  */
  fieldExprsToPropNodes(
    fieldExprs: string[],
    entity: Entity = this
  ): EntityPropNode[] {
    const groups = fieldExprs.reduce(
      (result, fieldExpr) => {
        let key, value, elseExpr;
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
      }
    );

    return Object.keys(groups)
      .map((key) => {
        const group = groups[key];

        // 일반 prop 처리
        if (key === "") {
          return group.map((propName) => {
            // uuid 개별 처리
            if (propName === "uuid") {
              return {
                nodeType: "plain" as const,
                prop: {
                  type: "string",
                  name: "uuid",
                  length: 128,
                } as StringProp,
                children: [],
              };
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
          if (group.length == 1 && (group[0] === "id" || group[0] == "id?")) {
            // id 하나만 있는지 체크해서, 하나만 있으면 상위 prop으로 id를 리턴
            const idProp = relEntity.propsDict.id;
            return {
              nodeType: "plain" as const,
              prop: {
                ...idProp,
                name: key + "_id",
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
      })
      .flat();
  }

  getFieldExprs(
    prefix = "",
    maxDepth: number = 3,
    froms: string[] = []
  ): string[] {
    return this.props
      .map((prop) => {
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
          return relMd.getFieldExprs(propName, maxDepth - 1, [
            ...froms,
            this.id,
          ]);
        }
        return propName;
      })
      .flat()
      .filter((f) => f !== null) as string[];
  }

  getTableColumns(): string[] {
    return this.props
      .map((prop) => {
        if (prop.type === "relation") {
          if (
            prop.relationType === "BelongsToOne" ||
            (prop.relationType === "OneToOne" && prop.hasJoinColumn === true)
          ) {
            return `${prop.name}_id`;
          } else {
            return null;
          }
        }
        return prop.name;
      })
      .filter(nonNullable);
  }

  registerModulePaths() {
    const basePath = `${this.names.parentFs}`;

    // base-scheme
    EntityManager.setModulePath(`${this.id}BaseSchema`, `sonamu.generated`);

    // subset
    if (Object.keys(this.subsets).length > 0) {
      EntityManager.setModulePath(`${this.id}SubsetKey`, `sonamu.generated`);
      EntityManager.setModulePath(
        `${this.id}SubsetMapping`,
        `sonamu.generated`
      );
      Object.keys(this.subsets).map((subsetKey) => {
        EntityManager.setModulePath(
          `${this.id}Subset${subsetKey.toUpperCase()}`,
          `sonamu.generated`
        );
      });
    }

    // enums
    Object.keys(this.enumLabels).map((enumId) => {
      EntityManager.setModulePath(enumId, `sonamu.generated`);
    });

    // types
    const typesModulePath = `${basePath}/${this.names.parentFs}.types`;
    const typesFileDistPath = path.join(
      Sonamu.apiRootPath,
      `dist/application/${typesModulePath}.js`
    );

    if (existsSync(typesFileDistPath)) {
      const importPath = path.relative(__dirname, typesFileDistPath);
      import(importPath).then((t) => {
        this.types = Object.keys(t).reduce((result, key) => {
          EntityManager.setModulePath(key, typesModulePath);
          return {
            ...result,
            [key]: t[key],
          };
        }, {});
      });
    }
  }

  registerTableSpecs(): void {
    const uniqueColumns = uniq(
      this.indexes
        .filter((idx) => idx.type === "unique")
        .map((idx) => idx.columns)
        .flat()
    );

    EntityManager.setTableSpec({
      name: this.table,
      uniqueColumns,
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
        return [
          subsetKey,
          this.subsetRowsToSubsetFields(subsetRows, subsetKey),
        ];
      })
    );

    // save
    const jsonPath = path.join(
      Sonamu.apiRootPath,
      `src/application/${this.names.parentFs}/${this.names.fs}.entity.json`
    );
    const json = this.toJson();
    writeFileSync(
      jsonPath,
      prettier.format(JSON.stringify(json), {
        parser: "json",
      })
    );

    // reload
    await EntityManager.register(json);
  }

  getSubsetRows(
    _subsets?: { [key: string]: string[] },
    prefixes: string[] = []
  ): EntitySubsetRow[] {
    if (prefixes.length > 10) {
      return [];
    }

    const subsets = _subsets ?? this.subsets;
    const subsetKeys = Object.keys(subsets);
    const allFields = uniq(subsetKeys.map((key) => subsets[key]).flat());

    return this.props.map((prop) => {
      if (
        prop.type === "relation" &&
        allFields.find((f) =>
          f.startsWith([...prefixes, prop.name].join(".") + ".")
        )
      ) {
        const relEntity = EntityManager.get(prop.with);
        const children = relEntity.getSubsetRows(subsets, [
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
              return [
                subsetKey,
                children.every((child) => child.has[subsetKey] === true),
              ];
            })
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
              return f === field || f.startsWith(field + ".");
            });
            return [subsetKey, has];
          })
        ),
      };
    });
  }

  subsetRowsToSubsetFields(
    subsetRows: EntitySubsetRow[],
    subsetKey: string
  ): string[] {
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

      const prop = EntityManager.get(entityId).props.find(
        (p) => p.name === propName
      );
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
                : a
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
            if (
              analyzed.find(
                (a) => a.propName === oldName && a.entityId === this.id
              )
            ) {
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
      const relProp = EntityManager.get(entityId).props.find(
        (p) => p.name === field
      );
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

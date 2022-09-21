import _, { uniq } from "lodash";
import { SMDManager } from "./smd-manager";
import { dasherize, pluralize, underscore } from "inflection";
import {
  SMDProp,
  RelationProp,
  SMDInput,
  isRelationProp,
  SubsetQuery,
  isVirtualProp,
  isBelongsToOneRelationProp,
  isOneToOneRelationProp,
  isHasManyRelationProp,
  isManyToManyRelationProp,
  SMDPropNode,
  isEnumProp,
  StringProp,
} from "../types/types";
import inflection from "inflection";
import path from "path";
import { existsSync } from "fs";
import { z } from "zod";
import { EnumsLabelKo } from "../types/types";
import { Syncer } from "../syncer";

export class SMD {
  id: string;
  parentId?: string;
  table: string;
  title: string;
  names: {
    fs: string;
    module: string;
  };
  props: SMDProp[];
  propsDict: {
    [key: string]: SMDProp;
  };
  relations: {
    [key: string]: RelationProp;
  };
  subsets: {
    [key: string]: string[];
  };
  types: {
    [name: string]: z.ZodTypeAny;
  } = {};
  enums: {
    [name: string]: z.ZodEnum<any>;
  } = {};
  enumLabels: {
    [name: string]: EnumsLabelKo<string>;
  } = {};

  constructor({ id, parentId, table, title, props, subsets }: SMDInput<any>) {
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

    // subsets
    this.subsets = subsets ?? {};

    // names
    this.names = {
      fs:
        parentId === undefined
          ? dasherize(underscore(id)).toLowerCase()
          : dasherize(parentId).toLowerCase(),
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
  resolveSubsetQuery(prefix: string, fields: string[]): SubsetQuery {
    // 서브셋을 1뎁스만 분리하여 그룹핑
    const subsetGroup = _.groupBy(fields, (field) => {
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
                (field) =>
                  `${prefix.replace(".", "__")}.${field} as ${prefix.replace(
                    ".",
                    "__"
                  )}__${field}`
              )
            );
          }

          return r;
        }

        const relation = this.relations[groupKey];
        if (relation === undefined) {
          throw new Error(`존재하지 않는 relation 참조 ${groupKey}`);
        }
        const relSMD = SMDManager.get(relation.with);

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

          const relSubsetQuery = relSMD.resolveSubsetQuery(
            `${prefix !== "" ? prefix + "." : ""}${groupKey}`,
            relFields
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
                to = `${joinAs}.${relation.name}_id`;
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
            join: "outer",
            table: relSMD.table,
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
          const relSubsetQuery = relSMD.resolveSubsetQuery("", relFields);

          let manyJoin: SubsetQuery["loaders"][number]["manyJoin"];
          if (isHasManyRelationProp(relation)) {
            manyJoin = {
              fromTable: this.table,
              fromCol: "id",
              idField: prefix === "" ? `id` : `${prefix}__id`,
              toTable: relSMD.table,
              toCol: relation.joinColumn,
            };
          } else if (isManyToManyRelationProp(relation)) {
            const [table1, table2] = relation.joinTable.split("__");

            manyJoin = {
              fromTable: this.table,
              fromCol: "id",
              idField: prefix === "" ? `id` : `${prefix}__id`,
              through: {
                table: relation.joinTable,
                fromCol: `${inflection.singularize(table1)}_id`,
                toCol: `${inflection.singularize(table2)}_id`,
              },
              toTable: relSMD.table,
              toCol: "id",
            };
          } else {
            throw new Error();
          }

          r.loaders.push({
            as: groupKey,
            table: relSMD.table,
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
    FieldExpr[] 을 SMDPropNode[] 로 변환
  */
  fieldExprsToPropNodes(fieldExprs: string[], smd: SMD = this): SMDPropNode[] {
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

            const prop = smd.propsDict[propName];
            if (prop === undefined) {
              throw new Error(`${this.id} -- 잘못된 FieldExpr ${propName}`);
            }
            return {
              nodeType: "plain" as const,
              prop,
              children: [],
            };
          });
        }

        // relation prop 처리
        const prop = smd.propsDict[key];
        if (!isRelationProp(prop)) {
          throw new Error(`잘못된 FieldExpr ${key}.${group[0]}`);
        }
        const relSMD = SMDManager.get(prop.with);

        // relation -One 에 id 필드 하나인 경우
        if (isBelongsToOneRelationProp(prop) || isOneToOneRelationProp(prop)) {
          if (group.length == 1 && (group[0] === "id" || group[0] == "id?")) {
            // id 하나만 있는지 체크해서, 하나만 있으면 상위 prop으로 id를 리턴
            const idProp = relSMD.propsDict.id;
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
        const children = this.fieldExprsToPropNodes(group, relSMD);
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
        if (isRelationProp(prop) && maxDepth - 1 >= 0) {
          // 역방향 relation인 경우 제외
          if (froms.includes(prop.with)) {
            return null;
          }
          // 정방향 relation인 경우 recursive 콜
          const relMd = SMDManager.get(prop.with);
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

  registerModulePaths() {
    const basePath = `${this.names.fs}`;
    const appRootPath = Syncer.getInstance().config.appRootPath;

    // base-scheme
    SMDManager.setModulePath(
      `${this.id}BaseSchema`,
      `${basePath}/${this.names.fs}.generated`
    );

    // subset
    if (Object.keys(this.subsets).length > 0) {
      SMDManager.setModulePath(
        `${this.id}SubsetKey`,
        `${basePath}/${this.names.fs}.generated`
      );
      SMDManager.setModulePath(
        `${this.id}SubsetMapping`,
        `${basePath}/${this.names.fs}.generated`
      );
      Object.keys(this.subsets).map((subsetKey) => {
        SMDManager.setModulePath(
          `${this.id}Subset${subsetKey.toUpperCase()}`,
          `${basePath}/${this.names.fs}.generated`
        );
      });
    }

    // types
    const typesModulePath = `${basePath}/${this.names.fs}.types`;
    const typesFileDistPath = path.resolve(
      appRootPath,
      `api/dist/application/${typesModulePath}.js`
    );

    if (existsSync(typesFileDistPath)) {
      const importPath = path.relative(__dirname, typesFileDistPath);
      import(importPath).then((t) => {
        this.types = Object.keys(t).reduce((result, key) => {
          SMDManager.setModulePath(key, typesModulePath);
          return {
            ...result,
            [key]: t[key],
          };
        }, {});
      });
    }

    // enums
    const enumsModulePath = `${basePath}/${this.names.fs}.enums`;
    const enumsFileDistPath = path.resolve(
      appRootPath,
      `api/dist/application/${enumsModulePath}.js`
    );
    if (existsSync(enumsFileDistPath)) {
      const importPath = path.relative(__dirname, enumsFileDistPath);
      import(importPath).then((t) => {
        this.enums = Object.keys(t).reduce((result, key) => {
          SMDManager.setModulePath(key, enumsModulePath);

          // Enum Labels 별도 처리
          if (key === underscore(this.id).toUpperCase()) {
            this.enumLabels = t[key];
          }
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
      this.props
        .map((prop) => {
          const propColumn =
            isBelongsToOneRelationProp(prop) || isOneToOneRelationProp(prop)
              ? `${prop.name}_id`
              : prop.name;
          if (prop.unique === true) {
            return propColumn;
          } else if (prop.unique && Array.isArray(prop.unique)) {
            return propColumn;
          } else {
            return null;
          }
        })
        .filter((prop) => prop !== null)
    ) as string[];

    SMDManager.setTableSpec({
      name: this.table,
      uniqueColumns,
    });
  }
}

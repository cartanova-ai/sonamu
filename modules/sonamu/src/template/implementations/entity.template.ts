import { Sonamu } from "../../api";
import { assertEntityJsonCodegenSafe } from "../../entity/entity-codegen-safety";
import { EntityManager } from "../../entity/entity-manager";
import { type EntityNamesRecord } from "../../entity/entity-manager";
import { type TemplateOptions } from "../../types/types";
import { Template } from "../template";

export class Template__entity extends Template {
  constructor() {
    super("entity");
  }

  getTargetAndPath(names: EntityNamesRecord, parentNames?: EntityNamesRecord) {
    const { dir } = Sonamu.config.api;

    return {
      target: `${dir}/src/application`,
      path: `${(parentNames ?? names).fs}/${names.fs}.entity.json`,
    };
  }

  render(options: TemplateOptions["entity"]) {
    const { entityId, title, parentId, table } = options;
    const names = EntityManager.getNamesFromId(entityId);

    const parent = (() => {
      if (parentId) {
        return {
          names: EntityManager.getNamesFromId(parentId),
          entity: EntityManager.get(parentId),
        };
      } else {
        return null;
      }
    })();

    // 계산된 키를 쓰는 객체 리터럴은 값 타입이 서로 다른 객체의 유니온으로 추론되므로, enum 정의 타입을 명시합니다.
    const defaultEnums: Record<string, Record<string, string>> = parentId
      ? {}
      : {
          [`${names.capital}OrderBy`]: {
            "id-desc": "ID최신순",
          },
          [`${names.capital}SearchField`]: { id: "ID" },
        };
    const entityJson = {
      id: entityId,
      title: title ?? entityId,
      parentId,
      table: table ?? names.fsPlural.replace(/-/g, "_"),
      props: options.props?.length
        ? options.props
        : [
            { name: "id", type: "integer", desc: "ID" },
            ...(parent
              ? [
                  {
                    type: "relation",
                    name: parent.names.camel,
                    relationType: "BelongsToOne",
                    with: parentId,
                    onUpdate: "CASCADE",
                    onDelete: "CASCADE",
                    desc: parent.entity.title,
                  },
                ]
              : []),
            {
              name: "created_at",
              type: "date",
              desc: "등록일시",
              dbDefault: "CURRENT_TIMESTAMP",
            },
          ],
      indexes: [...(options.indexes ?? [])],
      subsets:
        options.subsets ??
        (parentId
          ? {}
          : {
              A: ["id", "created_at"],
            }),
      enums: options.enums ?? defaultEnums,
    };
    // 새 entity.json을 파일로 쓰기 전에 생성 코드에 들어갈 값을 검증합니다.
    assertEntityJsonCodegenSafe(entityJson);

    return {
      ...this.getTargetAndPath(names, parent?.names ?? names),
      body: JSON.stringify(entityJson).trim(),
      importKeys: [],
    };
  }
}

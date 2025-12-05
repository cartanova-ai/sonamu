import { Sonamu } from "../../api";
import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
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

    return {
      ...this.getTargetAndPath(names, parent?.names ?? names),
      body: JSON.stringify({
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
        subsets: options.subsets ?? {
          ...(parentId
            ? {}
            : {
                A: ["id", "created_at"],
              }),
        },
        enums: options.enums ?? {
          ...(parentId
            ? {}
            : {
                [`${names.capital}OrderBy`]: {
                  "id-desc": "ID최신순",
                },
                [`${names.capital}SearchField`]: { id: "ID" },
              }),
        },
      }).trim(),
      importKeys: [],
    };
  }
}

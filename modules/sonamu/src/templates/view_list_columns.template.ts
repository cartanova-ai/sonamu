import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";

export class Template__view_list_columns extends Template {
  constructor() {
    super("view_list_columns");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/pages/admin",
      path: `${names.fsPlural}/_columns.tsx`,
    };
  }

  // 컬럼
  render({
    entityId,
    columns,
    columnImports,
  }: TemplateOptions["view_list_columns"]) {
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import React from 'react';
import {
  Segment,
  Table,
  TableRow,
  Button,
  Label,
} from 'semantic-ui-react';
import { DateTime } from "luxon";
import { TFColumn } from "src/typeframe/iso-types";
import { ${names.capital}SubsetA } from "src/services/${names.fs}/${
        names.fs
      }.generated";
${columnImports}

const columns: { [key in Exclude<keyof ${
        names.capital
      }SubsetA, 'id'>]: TFColumn<${names.capital}SubsetA> } = {${columns
        .map((col) => {
          return [
            `${col.name}: { label: "${col.label}",`,
            `tc: ${col.tc}, `,
            `collapsing: ${["Title", "Name"].includes(col.label) === false}, }`,
          ].join("\n");
        })
        .join(",\n")}};
export default columns;
      `.trim(),
      importKeys: [],
    };
  }
}

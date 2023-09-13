import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";

export class Template__view_enums_dropdown extends Template {
  constructor() {
    super("view_enums_dropdown");
  }

  getTargetAndPath(names: EntityNamesRecord, enumId: string) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${enumId}Dropdown.tsx`,
    };
  }

  render({
    entityId,
    enumId,
    idConstant,
  }: TemplateOptions["view_enums_dropdown"]) {
    const names = EntityManager.getNamesFromId(entityId);
    const label = getLabel(idConstant);

    return {
      ...this.getTargetAndPath(names, enumId),
      body: `
import React from 'react';
import {
  Dropdown,
  DropdownProps,
} from 'semantic-ui-react';

import { ${names.constant} } from 'src/services/${names.fs}/${names.fs}.enums';

export function ${enumId}Dropdown(props: DropdownProps) {
  const options = Object.entries(${names.constant}.${idConstant}).map(([key, { ko }]) => {
    return {
      key,
      value: key,
      text: "${label}: " + ko,
    };
  });
  return (
    <Dropdown
      className="label"
      options={options}
      {...props}
    />
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}

export function getLabel(idConstant: string): string {
  switch (idConstant) {
    case "ORDER_BY":
      return "정렬";
    case "SEARCH_FIELD":
      return "검색";
    default:
      return idConstant;
  }
}

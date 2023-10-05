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

  render({ entityId, enumId }: TemplateOptions["view_enums_dropdown"]) {
    const names = EntityManager.getNamesFromId(entityId);
    const label = getLabel(enumId);

    return {
      ...this.getTargetAndPath(names, enumId),
      body: `
import React from 'react';
import {
  Dropdown,
  DropdownProps,
} from 'semantic-ui-react';

import { ${enumId}Label } from 'src/services/${names.fs}/${names.fs}.generated';

export function ${enumId}Dropdown(props: DropdownProps) {
  const options = Object.entries(${enumId}Label).map(([key, label]) => {
    return {
      key,
      value: key,
      text: "${label}: " + label,
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

export function getLabel(enumId: string): string {
  if (enumId.endsWith("OrderBy")) {
    return "정렬";
  } else if (enumId.endsWith("SearchField")) {
    return "검색";
  } else {
    return enumId;
  }
}

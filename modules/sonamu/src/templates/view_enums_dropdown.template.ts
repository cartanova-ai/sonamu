import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";
import { camelize } from "inflection";

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
    const label = getLabel(entityId, enumId);

    return {
      ...this.getTargetAndPath(names, enumId),
      body: `
import React from 'react';
import {
  Dropdown,
  DropdownProps,
} from 'semantic-ui-react';

import { ${enumId}Label } from 'src/services/sonamu.generated';

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

export function getLabel(entityId: string, enumId: string): string {
  if (enumId.endsWith("OrderBy")) {
    return "정렬";
  } else if (enumId.endsWith("SearchField")) {
    return "검색";
  } else {
    const enumProp = EntityManager.get(entityId).props.find(
      (prop) => `${entityId}${camelize(prop.name)}` === enumId
    );
    if (enumProp && enumProp.desc) {
      return enumProp.desc;
    }
    return enumId;
  }
}

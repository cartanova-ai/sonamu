import { TemplateOptions } from "../../types/types";
import { EntityManager, EntityNamesRecord } from "../../entity/entity-manager";
import { Template } from "../base-template";
import { getLabel } from "../common";

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
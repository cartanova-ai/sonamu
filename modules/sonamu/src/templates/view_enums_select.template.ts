import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";
import { getLabel } from "./view_enums_dropdown.template";

export class Template__view_enums_select extends Template {
  constructor() {
    super("view_enums_select");
  }

  getTargetAndPath(names: EntityNamesRecord, enumId: string) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${enumId}Select.tsx`,
    };
  }

  render({ entityId, enumId }: TemplateOptions["view_enums_select"]) {
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

import { ${enumId}, ${enumId}Label } from 'src/services/sonamu.generated';

export type ${enumId}SelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function ${enumId}Select({placeholder, textPrefix, ...props}: ${enumId}SelectProps) {
  const typeOptions = ${enumId}.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? '${label}: ') + ${enumId}Label[key],
  }));

  return (
    <Dropdown
      placeholder={placeholder ?? "${label}"}
      selection
      options={typeOptions}
      selectOnBlur={false}
      {...props}
    />
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}

import { EntityManager, type EntityNamesRecord } from "../entity/entity-manager";
import type { TemplateOptions } from "../types/types";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sonamu-kit/react-components/components';

import { ${enumId}, ${enumId}Label } from 'src/services/sonamu.generated';

export type ${enumId}SelectProps = {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function ${enumId}Select({
  value,
  onChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: ${enumId}SelectProps) {
  return (
    <Select value={value ?? ""} onChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? "${label}"} />
      </SelectTrigger>
      <SelectContent>
        {clearable && (
          <SelectItem value="">전체</SelectItem>
        )}
        {${enumId}.options.map((key) => (
          <SelectItem key={key} value={key}>
            {(textPrefix ?? "") + ${enumId}Label[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}

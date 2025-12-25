import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { getLabel } from "../helpers";
import { Template } from "../template";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sonamu-kit/react-components/components';

import { ${enumId}Label } from '@/services/sonamu.generated';

export type ${enumId}DropdownProps = {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function ${enumId}Dropdown({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: ${enumId}DropdownProps) {
  return (
    <Select value={value ?? ""} onChange={onChange} disabled={disabled}>
      <SelectTrigger className={className ?? "w-auto"}>
        <SelectValue placeholder={placeholder ?? "${label}"} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(${enumId}Label).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
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

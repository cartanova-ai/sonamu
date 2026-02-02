import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { getLabel } from "../helpers";
import { Template } from "../template";

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

  async render({ entityId, enumId }: TemplateOptions["view_enums_select"]) {
    const names = EntityManager.getNamesFromId(entityId);
    const label = getLabel(entityId, enumId);

    return {
      ...this.getTargetAndPath(names, enumId),
      body: `
import { EnumSelect } from '@sonamu-kit/react-components/components';
import { ${enumId}, ${enumId}Label } from '@/services/sonamu.generated';

export type ${enumId}SelectProps = {
  value?: string;
  onValueChange?: (value: string | null | undefined) => void;
  placeholder?: string;
  textPrefix?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export function ${enumId}Select({
  value,
  onValueChange,
  placeholder,
  textPrefix,
  clearable,
  disabled,
  className,
}: ${enumId}SelectProps) {
  return (
    <EnumSelect
      enum={${enumId}}
      labels={${enumId}Label}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder ?? "${label}"}
      textPrefix={textPrefix}
      clearable={clearable}
      disabled={disabled}
      className={className}
    />
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}

import { Sonamu } from "../../api/sonamu";
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

  override getRequiredDictKeys(): string[] | null {
    if (!Sonamu.config.i18n) return null;
    return ["common.all"];
  }

  async render({ entityId, enumId }: TemplateOptions["view_enums_select"]) {
    const names = EntityManager.getNamesFromId(entityId);
    const label = getLabel(entityId, enumId);

    // i18n 설정 확인
    const useI18n = !!Sonamu.config.i18n;

    // SD import 및 "전체" 텍스트
    const sdImport = useI18n ? `import { SD } from "@/i18n/sd.generated";\n` : "";
    const allText = useI18n ? `{SD("common.all")}` : `전체`;
    const enumLabels = useI18n ? `SD.enumLabels("${enumId}")` : `${enumId}Label`;

    return {
      ...this.getTargetAndPath(names, enumId),
      body: `

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sonamu-kit/react-components/components';

import { ${enumId}, ${enumId}Label } from '@/services/sonamu.generated';
${sdImport}
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
  // Filter out empty string from options (Radix UI doesn't allow empty string as SelectItem value)
  const validOptions = ${enumId}.options.filter((key) => (key as string) !== "");
  const enumLabels = ${enumLabels};

  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? "${label}"} />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value="">${allText}</SelectItem>}
        {validOptions.map((key) => (
          <SelectItem key={key} value={key}>
            {(textPrefix ?? "") + enumLabels[key]}
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

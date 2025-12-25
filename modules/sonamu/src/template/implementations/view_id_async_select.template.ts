import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { Template } from "../template";

export class Template__view_id_async_select extends Template {
  constructor() {
    super("view_id_async_select");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${names.capital}IdAsyncSelect.tsx`,
    };
  }

  render({ entityId, textField }: TemplateOptions["view_id_async_select"]) {
    const names = EntityManager.getNamesFromId(entityId);

    const entity = EntityManager.get(entityId);
    if (!textField) {
      const pickedProp = entity.props.find((prop) => ["name", "title"].includes(prop.name));
      if (pickedProp) {
        textField = pickedProp.name;
      } else {
        const candidateProp = entity.props.find((prop) => prop.type === "string");
        if (candidateProp) {
          textField = candidateProp.name;
        } else {
          console.log("textField 찾을 수 없음");
        }
      }
    }

    return {
      ...this.getTargetAndPath(names),
      body: `
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AsyncSelect, AsyncSelectOption, MultiSelect, MultiSelectOption } from "@sonamu-kit/react-components/components";
import { ${names.capital}SubsetKey, ${names.capital}SubsetMapping } from "@/services/sonamu.generated";
import { ${names.capital}Service } from "@/services/services.generated";
import { ${names.capital}ListParams } from "@/services/${names.fs}/${names.fs}.types";

export type ${names.capital}IdAsyncSelectProps<T extends ${names.capital}SubsetKey> = {
  subset: T;
  baseListParams?: ${names.capital}ListParams;
  textField${textField ? "?" : ""}: keyof ${names.capital}SubsetMapping[T];
  valueField?: keyof ${names.capital}SubsetMapping[T];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  multiple?: boolean;
} & (
  | {
      multiple?: false;
      value?: number | null;
      onChange?: (e: React.SyntheticEvent | null, data: { value: number | undefined }) => void;
    }
  | {
      multiple: true;
      value?: number[];
      onChange?: (e: React.SyntheticEvent | null, data: { value: number[] }) => void;
    }
);

export function ${names.capital}IdAsyncSelect<T extends ${names.capital}SubsetKey>({
  subset,
  value,
  onChange,
  baseListParams,
  textField,
  valueField,
  placeholder = "${entity.title ?? names.constant}",
  clearable,
  disabled,
  className,
  multiple = false,
}: ${names.capital}IdAsyncSelectProps<T>) {
  const [listParams, setListParams] = useState<${names.capital}ListParams>(
    baseListParams ?? {}
  );

  const { data, isLoading } = ${names.capital}Service.use${names.capitalPlural}(subset, listParams);
  const { rows: ${names.camelPlural} } = data ?? {};

  // 옵션 생성
  const options = useMemo(() => {
    return (${names.camelPlural} ?? []).map((${names.camel}) => ({
      value: String(${names.camel}[valueField ?? "id"] as number),
      label: String(${names.camel}[textField${textField ? ` ?? "${textField}"` : ""}]),
    }));
  }, [${names.camelPlural}, textField, valueField]);

  // baseListParams 변경 시 반영
  useEffect(() => {
    setListParams((prev) => ({
      ...prev,
      ...baseListParams,
    }));
  }, [baseListParams]);

  // 검색어 변경 핸들러
  const handleSearch = useCallback((keyword: string) => {
    setListParams((prev) => ({
      ...prev,
      keyword: keyword || undefined,
    }));
  }, []);

  // Multiple select
  if (multiple) {
    const multiValue = Array.isArray(value) ? value.map(String) : [];

    const handleMultiChange = (selectedValues: string[]) => {
      if (onChange) {
        const numericValues = selectedValues.map(Number);
        (onChange as (e: React.SyntheticEvent | null, data: { value: number[] }) => void)(null, { value: numericValues });
      }
    };

    return (
      <MultiSelect
        options={options}
        onValueChange={handleMultiChange}
        defaultValue={multiValue}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
    );
  }

  // Single select
  const singleValue = typeof value === "number" ? value : undefined;

  const handleSingleChange = (e: React.SyntheticEvent | null, data: { value: string | undefined }) => {
    if (onChange) {
      const numericValue = data.value ? Number(data.value) : undefined;
      (onChange as (e: React.SyntheticEvent | null, data: { value: number | undefined }) => void)(e, { value: numericValue });
    }
  };

  return (
    <AsyncSelect
      options={options as AsyncSelectOption<string>[]}
      value={singleValue !== undefined ? String(singleValue) : undefined}
      onChange={handleSingleChange}
      isLoading={isLoading}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      className={className}
      onSearch={handleSearch}
    />
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}

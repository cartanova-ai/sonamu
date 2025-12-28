import {
  AsyncSelect,
  type AsyncSelectOption,
  MultiSelect,
} from "@sonamu-kit/react-components/components";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompanyListParams } from "@/services/company/company.types";
import { CompanyService } from "@/services/services.generated";
import type { CompanySubsetKey, CompanySubsetMapping } from "@/services/sonamu.generated";

export type CompanyIdAsyncSelectProps<T extends CompanySubsetKey> = {
  subset: T;
  baseListParams?: CompanyListParams;
  textField?: keyof CompanySubsetMapping[T];
  valueField?: keyof CompanySubsetMapping[T];
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

export function CompanyIdAsyncSelect<T extends CompanySubsetKey>({
  subset,
  value,
  onChange,
  baseListParams,
  textField,
  valueField,
  placeholder = "COMPANY",
  clearable,
  disabled,
  className,
  multiple = false,
}: CompanyIdAsyncSelectProps<T>) {
  const [listParams, setListParams] = useState<CompanyListParams>(baseListParams ?? {});

  const { data, isLoading } = CompanyService.useCompanies(subset, listParams);
  const { rows: companies } = data ?? {};

  // 옵션 생성
  const options = useMemo(() => {
    return (companies ?? []).map((company) => ({
      value: String(company[valueField ?? "id"] as number),
      label: String(company[textField ?? "name"]),
    }));
  }, [companies, textField, valueField]);

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
        (onChange as (e: React.SyntheticEvent | null, data: { value: number[] }) => void)(null, {
          value: numericValues,
        });
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

  const handleSingleChange = (e: unknown, data: { value: string | undefined }) => {
    if (onChange) {
      const numericValue = data.value ? Number(data.value) : undefined;
      (onChange as (e: unknown, data: { value: number | undefined }) => void)(e, {
        value: numericValue,
      });
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

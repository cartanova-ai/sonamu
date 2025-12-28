import {
  AsyncSelect,
  type AsyncSelectOption,
  MultiSelect,
} from "@sonamu-kit/react-components/components";
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
      onValueChange?: (value: number | undefined) => void;
    }
  | {
      multiple: true;
      value?: number[];
      onValueChange?: (value: number[]) => void;
    }
);

export function CompanyIdAsyncSelect<T extends CompanySubsetKey>({
  subset,
  value,
  onValueChange,
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
      const numericValues = selectedValues.map(Number);
      (onValueChange as ((value: number[]) => void) | undefined)?.(numericValues);
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

  const handleSingleChange = (value: string | undefined) => {
    const numericValue = value ? Number(value) : undefined;
    (onValueChange as ((value: number | undefined) => void) | undefined)?.(numericValue);
  };

  return (
    <AsyncSelect
      options={options as AsyncSelectOption<string>[]}
      value={singleValue !== undefined ? String(singleValue) : undefined}
      onValueChange={handleSingleChange}
      isLoading={isLoading}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      className={className}
      onSearch={handleSearch}
    />
  );
}

import {
  AsyncSelect,
  type AsyncSelectOption,
  MultiSelect,
} from "@sonamu-kit/react-components/components";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EmployeeListParams } from "@/services/employee/employee.types";
import { EmployeeService } from "@/services/services.generated";
import type { EmployeeSubsetKey, EmployeeSubsetMapping } from "@/services/sonamu.generated";

export type EmployeeIdAsyncSelectProps<T extends EmployeeSubsetKey> = {
  subset: T;
  baseListParams?: EmployeeListParams;
  textField?: keyof EmployeeSubsetMapping[T];
  valueField?: keyof EmployeeSubsetMapping[T];
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

export function EmployeeIdAsyncSelect<T extends EmployeeSubsetKey>({
  subset,
  value,
  onValueChange,
  baseListParams,
  textField,
  valueField,
  placeholder = "직원",
  clearable,
  disabled,
  className,
  multiple = false,
}: EmployeeIdAsyncSelectProps<T>) {
  const [listParams, setListParams] = useState<EmployeeListParams>(baseListParams ?? {});

  const { data, isLoading } = EmployeeService.useEmployees(subset, listParams);
  const { rows: employees } = data ?? {};

  // 옵션 생성
  const options = useMemo(() => {
    return (employees ?? []).map((employee) => ({
      value: String(employee[valueField ?? ("id" as keyof EmployeeSubsetMapping[T])] as number),
      label: String(employee[textField ?? ("name" as keyof EmployeeSubsetMapping[T])]),
    }));
  }, [employees, textField, valueField]);

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

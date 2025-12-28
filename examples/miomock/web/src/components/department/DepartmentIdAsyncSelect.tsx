import {
  AsyncSelect,
  type AsyncSelectOption,
  MultiSelect,
} from "@sonamu-kit/react-components/components";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DepartmentListParams } from "@/services/department/department.types";
import { DepartmentService } from "@/services/services.generated";
import type { DepartmentSubsetKey, DepartmentSubsetMapping } from "@/services/sonamu.generated";

export type DepartmentIdAsyncSelectProps<T extends DepartmentSubsetKey> = {
  subset: T;
  baseListParams?: DepartmentListParams;
  textField?: keyof DepartmentSubsetMapping[T];
  valueField?: keyof DepartmentSubsetMapping[T];
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

export function DepartmentIdAsyncSelect<T extends DepartmentSubsetKey>({
  subset,
  value,
  onValueChange,
  baseListParams,
  textField,
  valueField,
  placeholder = "부서",
  clearable,
  disabled,
  className,
  multiple = false,
}: DepartmentIdAsyncSelectProps<T>) {
  const [listParams, setListParams] = useState<DepartmentListParams>(baseListParams ?? {});

  const { data, isLoading } = DepartmentService.useDepartments(subset, listParams);
  const { rows: departments } = data ?? {};

  // 옵션 생성
  const options = useMemo(() => {
    return (departments ?? []).map((department) => ({
      value: String(department[valueField ?? "id"] as number),
      label: String(department[textField ?? "name"]),
    }));
  }, [departments, textField, valueField]);

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

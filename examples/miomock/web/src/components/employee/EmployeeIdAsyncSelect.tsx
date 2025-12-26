import {
  AsyncSelect,
  type AsyncSelectOption,
  MultiSelect,
} from "@sonamu-kit/react-components/components";
import type React from "react";
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
      onChange?: (e: React.SyntheticEvent | null, data: { value: number | undefined }) => void;
    }
  | {
      multiple: true;
      value?: number[];
      onChange?: (e: React.SyntheticEvent | null, data: { value: number[] }) => void;
    }
);

export function EmployeeIdAsyncSelect<T extends EmployeeSubsetKey>({
  subset,
  value,
  onChange,
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
    return (employees ?? []).map((employee) => {
      // textField가 지정되지 않은 경우 기본값 사용
      const label = (() => {
        if (textField) {
          return String(employee[textField]);
        }
        return String(employee.id);
      })();

      return {
        value: String(employee[valueField ?? "id"] as number),
        label,
      };
    });
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

  const handleSingleChange = (
    e: React.SyntheticEvent | null,
    data: { value: string | undefined },
  ) => {
    if (onChange) {
      const numericValue = data.value ? Number(data.value) : undefined;
      (onChange as (e: React.SyntheticEvent | null, data: { value: number | undefined }) => void)(
        e,
        { value: numericValue },
      );
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

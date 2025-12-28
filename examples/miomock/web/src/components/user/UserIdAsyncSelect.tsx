import {
  AsyncSelect,
  type AsyncSelectOption,
  MultiSelect,
} from "@sonamu-kit/react-components/components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UserService } from "@/services/services.generated";
import type { UserSubsetKey, UserSubsetMapping } from "@/services/sonamu.generated";
import type { UserListParams } from "@/services/user/user.types";

export type UserIdAsyncSelectProps<T extends UserSubsetKey> = {
  subset: T;
  baseListParams?: UserListParams;
  textField?: keyof UserSubsetMapping[T];
  valueField?: keyof UserSubsetMapping[T];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  multiple?: boolean;
} & (
  | {
      multiple?: false;
      value?: number | null;
      onChange?: (e: unknown, data: { value: number | undefined }) => void;
    }
  | {
      multiple: true;
      value?: number[];
      onChange?: (e: unknown, data: { value: number[] }) => void;
    }
);

export function UserIdAsyncSelect<T extends UserSubsetKey>({
  subset,
  value,
  onChange,
  baseListParams,
  textField,
  valueField,
  placeholder = "USER",
  clearable,
  disabled,
  className,
  multiple = false,
}: UserIdAsyncSelectProps<T>) {
  const [listParams, setListParams] = useState<UserListParams>(baseListParams ?? {});

  const { data, isLoading } = UserService.useUsers(subset, listParams);
  const { rows: users } = data ?? {};

  // 옵션 생성
  const options = useMemo(() => {
    return (users ?? []).map((user) => ({
      value: String(user[valueField ?? "id"] as number),
      label: String(user[textField ?? "email"]),
    }));
  }, [users, textField, valueField]);

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
        (onChange as (e: unknown, data: { value: number[] }) => void)(null, {
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

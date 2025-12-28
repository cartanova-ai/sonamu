import {
  AsyncSelect,
  type AsyncSelectOption,
  MultiSelect,
} from "@sonamu-kit/react-components/components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TagService } from "@/services/services.generated";
import type { TagSubsetKey, TagSubsetMapping } from "@/services/sonamu.generated";
import type { TagListParams } from "@/services/tag/tag.types";

export type TagIdAsyncSelectProps<T extends TagSubsetKey> = {
  subset: T;
  baseListParams?: TagListParams;
  textField?: keyof TagSubsetMapping[T];
  valueField?: keyof TagSubsetMapping[T];
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

export function TagIdAsyncSelect<T extends TagSubsetKey>({
  subset,
  value,
  onChange,
  baseListParams,
  textField,
  valueField,
  placeholder = "TAG",
  clearable,
  disabled,
  className,
  multiple = false,
}: TagIdAsyncSelectProps<T>) {
  const [listParams, setListParams] = useState<TagListParams>(baseListParams ?? {});

  const { data, isLoading } = TagService.useTags(subset, listParams);
  const { rows: tags } = data ?? {};

  // 옵션 생성
  const options = useMemo(() => {
    return (tags ?? []).map((tag) => ({
      value: String(tag[valueField ?? "id"] as number),
      label: String(tag[textField ?? "name"]),
    }));
  }, [tags, textField, valueField]);

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

import { IdAsyncSelect } from "@sonamu-kit/react-components/components";
import { useCallback, useState } from "react";
import type { CompanyListParams } from "@/services/company/company.types";
import { CompanyAsyncIdConfig } from "@/services/services.generated";
import type {
  CompanySearchField,
  CompanySubsetKey,
  CompanySubsetMapping,
} from "@/services/sonamu.generated";

export type CompanyIdAsyncSelectProps<T extends CompanySubsetKey> = {
  subset: T;
  baseListParams?: CompanyListParams;
  textField?: keyof CompanySubsetMapping[T] & string;
  valueField?: keyof CompanySubsetMapping[T] & string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  multiple?: boolean;
  value?: number | number[] | null;
  onValueChange?: (value: number | number[] | undefined) => void;
};

export function CompanyIdAsyncSelect<T extends CompanySubsetKey>({
  subset,
  value,
  onValueChange,
  baseListParams,
  textField = "name",
  valueField = "id",
  placeholder = "COMPANY",
  clearable,
  disabled,
  className,
  multiple = false,
}: CompanyIdAsyncSelectProps<T>) {
  const [listParams, setListParams] = useState<CompanyListParams>(baseListParams ?? {});

  const handleSearch = useCallback(
    (keyword: string) => {
      setListParams((prev) => ({
        ...prev,
        search: keyword ? (textField as CompanySearchField) : undefined,
        keyword: keyword || undefined,
      }));
    },
    [textField],
  );

  return (
    <IdAsyncSelect
      config={CompanyAsyncIdConfig}
      subset={subset}
      listParams={listParams}
      textField={textField}
      valueField={valueField}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      className={className}
      multiple={multiple}
      value={value}
      onValueChange={onValueChange}
      onSearch={handleSearch}
    />
  );
}

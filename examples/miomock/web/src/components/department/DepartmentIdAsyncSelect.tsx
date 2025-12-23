import { type SyntheticEvent, useEffect, useState } from "react";
import {
  Dropdown,
  type DropdownItemProps,
  type DropdownOnSearchChangeData,
  type DropdownProps,
} from "semantic-ui-react";
import type { DepartmentListParams } from "../../services/department/department.types";
import { DepartmentService } from "../../services/services.generated";
import type { DepartmentSubsetKey, DepartmentSubsetMapping } from "../../services/sonamu.generated";

export function DepartmentIdAsyncSelect<T extends DepartmentSubsetKey>({
  subset,
  baseListParams,
  textField,
  valueField,
  ...props
}: DropdownProps & {
  subset: T;
  baseListParams?: DepartmentListParams;
  textField?: keyof DepartmentSubsetMapping[T];
  valueField?: keyof DepartmentSubsetMapping[T];
}) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);
  const [listParams, setListParams] = useState<DepartmentListParams>(baseListParams ?? {});

  const { data } = DepartmentService.useDepartments(subset, listParams);
  const { rows: departments } = data ?? {};

  useEffect(() => {
    setOptions(
      (departments ?? []).map((department) => {
        return {
          key: department.id,
          value: department[valueField ?? "id"] as string | number,
          text: String(department[textField ?? "name"]),
        };
      }),
    );
  }, [departments, textField, valueField]);

  useEffect(() => {
    setListParams({
      ...listParams,
      ...baseListParams,
    });
  }, [baseListParams, listParams]);

  const handleSearchChange = (
    _e: SyntheticEvent<HTMLElement, Event>,
    data: DropdownOnSearchChangeData,
  ) => {
    setListParams({
      ...listParams,
      keyword: data.searchQuery,
    });
  };

  return (
    <Dropdown
      placeholder="부서"
      selection
      options={options}
      onSearchChange={handleSearchChange}
      disabled={!departments}
      loading={!departments}
      selectOnBlur={false}
      {...props}
    />
  );
}

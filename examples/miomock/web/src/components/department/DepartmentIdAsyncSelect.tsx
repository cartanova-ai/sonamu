import React, { useState, useEffect, SyntheticEvent } from "react";
import {
  DropdownProps,
  DropdownItemProps,
  DropdownOnSearchChangeData,
  Dropdown,
} from "semantic-ui-react";
import {
  DepartmentSubsetKey,
  DepartmentSubsetMapping,
} from "src/services/sonamu.generated";
import { DepartmentService } from "src/services/department/department.service";
import { DepartmentListParams } from "src/services/department/department.types";

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
  const [listParams, setListParams] = useState<DepartmentListParams>(
    baseListParams ?? {},
  );

  const { data, error } = DepartmentService.useDepartments(subset, listParams);
  const { rows: departments, total } = data ?? {};

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
  }, [departments]);

  useEffect(() => {
    setListParams({
      ...listParams,
      ...baseListParams,
    });
  }, [baseListParams]);

  const handleSearchChange = (
    e: SyntheticEvent<HTMLElement, Event>,
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
